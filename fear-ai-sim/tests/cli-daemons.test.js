import { describe, it, expect } from '@jest/globals';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// R26 (audit): the CLI server/dashboard daemon paths were never spawned
// in tests — only the word "server" in help output. A broken
// --port/--host/--seed flag or bind failure shipped silently. This suite
// spawns both daemons, polls them live, then terminates them.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI = path.resolve(__dirname, '..', 'bin', 'fear-ai.js');

function httpGet(urlStr) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'GET'
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.end();
    });
}

function waitForOutput(proc, needle, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        let out = '';
        const timer = setTimeout(() => reject(new Error(`timeout waiting for: ${needle}\nGot:\n${out.slice(0, 2000)}`)), timeoutMs);
        proc.stdout.on('data', (chunk) => {
            out += chunk.toString();
            if (out.includes(needle)) {
                clearTimeout(timer);
                resolve(out);
            }
        });
        proc.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

async function waitForHealth(url, timeoutMs = 15000) {
    const start = Date.now();
    for (;;) {
        try {
            const res = await httpGet(url);
            if (res.status === 200) return res;
        } catch {
            // Not listening yet.
        }
        if (Date.now() - start > timeoutMs) throw new Error(`health never came up: ${url}`);
        await new Promise((r) => setTimeout(r, 100));
    }
}

describe('R26: CLI daemon commands boot live servers', () => {
    it('1. fear-ai server binds, answers /health, shuts down clean', async () => {
        const proc = spawn(process.execPath, [CLI, 'server', '--port', '8791'], { stdio: ['ignore', 'pipe', 'pipe'] });
        try {
            await waitForOutput(proc, 'Server ready!');
            const res = await waitForHealth('http://127.0.0.1:8791/health');
            expect(res.status).toBe(200);
            expect(JSON.parse(res.body).status).toBe('ok');
        } finally {
            // Windows reports signal-kills as code 1/null instead of the
            // handler's exit(0); either way the daemon must actually exit
            // (no hang past SIGTERM). Graceful server.stop() is covered
            // by the conformance suites' afterAll hooks.
            proc.kill('SIGTERM');
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('daemon hung past SIGTERM')), 10000);
                proc.on('exit', () => {
                    clearTimeout(timer);
                    resolve();
                });
            });
        }
    }, 60000);

    it('2. fear-ai dashboard binds, answers /api/status, terminates', async () => {
        // Port 8793: surveyed free across the matrix (8792 belongs to
        // lifecycle-and-optional-modules; colliding caused EADDRINUSE
        // flakes under parallel workers — found by red matrix run).
        const proc = spawn(process.execPath, [CLI, 'dashboard', '--port', '8793'], { stdio: ['ignore', 'pipe', 'pipe'] });
        try {
            await waitForOutput(proc, 'Designer Dashboard active at:');
            const res = await waitForHealth('http://127.0.0.1:8793/api/status');
            expect(res.status).toBe(200);
        } finally {
            proc.kill('SIGKILL');
            await new Promise((resolve) => proc.on('exit', resolve));
        }
    }, 60000);
});
