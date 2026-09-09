/**
 * tests/godot-roundtrip-budget.test.js
 *
 * Section CXV: real in-engine + loopback overhead. Measures the full
 * host→FearServer→host advisory roundtrip two ways: JS WebSocket timing
 * (p50 over 20 iterations) and the Godot-printed engine-side latency.
 * Budgets are generous loopback ceilings (same-machine IPC), not gameplay
 * frame claims — see evidence for the honest scope note.
 */

import { describe, it, expect } from '@jest/globals';
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';
import { FearServer } from '../packages/runtime/index.js';
import { BinaryWireProtocol } from '../packages/protocol/index.js';

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

const TEST_PORT = 8781;
const OBS = [{ entityId: 10, threatDistance: 4.0, threatIntensity: 0.95, position: { x: 1, y: 0, z: 2 }, health: 1.0 }];

function timedRoundtrip(port) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        const timer = setTimeout(() => { try { ws.close(); } catch { /* noop */ } reject(new Error('roundtrip timeout')); }, 5000);
        const t0 = performance.now();
        ws.on('open', () => {
            ws.send(Buffer.from(BinaryWireProtocol.encodeObservationBatch(10, OBS)), { binary: true });
        });
        ws.on('message', () => {
            const ms = performance.now() - t0;
            clearTimeout(timer);
            ws.close();
            resolve(ms);
        });
        ws.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

function median(values) {
    const s = [...values].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
}

describe('Section CXV: advisory roundtrip budgets', () => {
    it('1. JS loopback p50 roundtrip under 500 ms ceiling', async () => {
        const server = new FearServer({ host: '127.0.0.1', port: TEST_PORT, seed: 11 });
        await server.start();
        try {
            const samples = [];
            for (let i = 0; i < 20; i++) {
                samples.push(await timedRoundtrip(TEST_PORT));
            }
            const p50 = median(samples);
            console.log(`      [roundtrip] p50=${p50.toFixed(2)}ms max=${Math.max(...samples).toFixed(2)}ms over 20 loopbacks`);
            expect(p50).toBeLessThan(500);
        } finally {
            await server.stop();
        }
    });

    it('2. Godot engine-measured latency under 500 ms ceiling', async () => {
        const godotExe = findGodotBinary();
        if (!godotExe) {
            console.warn('[SKIP] Godot 4.6 binary not found on host machine.');
            return;
        }
        const server = new FearServer({ host: '127.0.0.1', port: TEST_PORT, seed: 11 });
        await server.start();
        try {
            const projectDir = path.resolve(__dirname, 'godot_project');
            const { stdout } = await new Promise((resolve) => {
                const child = spawn(godotExe, [
                    '--headless', '--path', projectDir,
                    '-s', 'test_binary_websocket_loopback.gd',
                    '--port', String(TEST_PORT)
                ]);
                let out = '';
                child.stdout.on('data', (d) => { out += d.toString(); });
                child.on('close', () => resolve({ stdout: out }));
            });
            const m = stdout.match(/Roundtrip Latency:\s*([\d.]+)\s*ms/);
            expect(m).not.toBeNull();
            const ms = parseFloat(m[1]);
            console.log(`      [godot-engine] Roundtrip Latency=${ms.toFixed(2)}ms`);
            expect(ms).toBeLessThan(500);
        } finally {
            await server.stop();
        }
    });
});
