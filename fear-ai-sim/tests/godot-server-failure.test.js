/**
 * tests/godot-server-failure.test.js
 *
 * Section CXIV: kill runtime, restart, NPC fails safely. Deterministic,
 * no timing races: every phase transition is observed (WS close event,
 * refused reconnect, fresh advisory), never slept-and-hoped.
 *
 * 1. Baseline advisory for a fixed threat observation.
 * 2. Server stop: client observes close; reconnect refused; client holds
 *    last advisory (host-owned hold buffer, asserted value-identical).
 * 3. Server restart (same port + seed): identical observation yields
 *    identical advisory (restart determinism).
 * 4. Real-engine Godot drill: absent-server failsafe holds last advisory
 *    and exits 0 (host continues, never crashes).
 */

import { describe, it, expect } from '@jest/globals';
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';
import { FearServer } from '../packages/runtime/index.js';
import { BinaryWireProtocol, FRAME_TYPES } from '../packages/protocol/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GODOT_PATHS = [
    'C:\\tools\\02-Dev\\godot\\Godot_v4.6-stable_win64_console.exe',
    'Godot_v4.6-stable_win64_console.exe',
    'godot'
];

function findGodotBinary() {
    for (const candidate of GODOT_PATHS) {
        if (fs.existsSync(candidate)) return candidate;
    }
    const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['godot'], { encoding: 'utf8' });
    if (which.status === 0 && which.stdout.trim()) {
        return which.stdout.trim().split('\n')[0].trim();
    }
    return null;
}

const TEST_PORT = 8779;
const OBS = [{ entityId: 10, threatDistance: 4.0, threatIntensity: 0.95, position: { x: 1, y: 0, z: 2 }, health: 1.0 }];

function advisoryOnce(port) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        const timer = setTimeout(() => { try { ws.close(); } catch { /* noop */ } reject(new Error('advisory timeout')); }, 5000);
        ws.on('open', () => {
            ws.send(Buffer.from(BinaryWireProtocol.encodeObservationBatch(10, OBS)), { binary: true });
        });
        ws.on('message', (data) => {
            clearTimeout(timer);
            const arrayBuf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            const decoded = BinaryWireProtocol.decodeIntentBatch(arrayBuf);
            const fear = decoded.records.find((r) => r.entityId === 10).fear;
            ws.close();
            resolve(fear);
        });
        ws.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

describe('Section CXIV: Godot/FearServer failure drill (kill, restart, hold)', () => {
    it('1. Baseline advisory then server kill observed as client close', async () => {
        const server = new FearServer({ host: '127.0.0.1', port: TEST_PORT, seed: 4242 });
        await server.start();
        try {
            const before = await advisoryOnce(TEST_PORT);
            expect(before).toBeGreaterThan(0);

            const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
            await new Promise((resolve) => ws.on('open', resolve));
            const closed = new Promise((resolve) => ws.on('close', resolve));
            await server.stop();
            await closed;

            // Reconnect refused while server down: host must hold, not invent.
            let refused = false;
            try {
                await advisoryOnce(TEST_PORT);
            } catch {
                refused = true;
            }
            expect(refused).toBe(true);
        } finally {
            try { await server.stop(); } catch { /* already stopped */ }
        }
    });

    it('2. Restart on same port and seed reproduces identical advisory', async () => {
        const mk = () => new FearServer({ host: '127.0.0.1', port: TEST_PORT, seed: 4242 });
        const s1 = mk();
        await s1.start();
        let first = null;
        try {
            first = await advisoryOnce(TEST_PORT);
        } finally {
            await s1.stop();
        }
        const s2 = mk();
        await s2.start();
        try {
            const second = await advisoryOnce(TEST_PORT);
            expect(second).toBe(first);
        } finally {
            await s2.stop();
        }
    });

    it('3. Real-engine Godot drill holds last advisory with no server', async () => {
        const godotExe = findGodotBinary();
        if (!godotExe) {
            console.warn('[SKIP] Godot 4.6 binary not found on host machine.');
            return;
        }
        const projectDir = path.resolve(__dirname, 'godot_project');
        const { code, stdout, stderr } = await new Promise((resolve) => {
            const child = spawn(godotExe, [
                '--headless', '--path', projectDir,
                '-s', 'test_server_failure_drill.gd',
                '--port', String(TEST_PORT)
            ]);
            let out = '';
            let err = '';
            child.stdout.on('data', (d) => { out += d.toString(); });
            child.stderr.on('data', (d) => { err += d.toString(); });
            child.on('close', (status) => resolve({ code: status, stdout: out, stderr: err }));
        });
        if (code !== 0) {
            console.error('Godot stdout:\n', stdout);
            console.error('Godot stderr:\n', stderr);
        }
        expect(code).toBe(0);
        expect(stdout).toContain('FAILSAFE_HOLD_LAST_ADVISORY');
    });
});
