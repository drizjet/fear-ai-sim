import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { execFile, execSync } from 'node:child_process';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { FearServer } from '../../packages/runtime/index.js';

// R27 (audit): the C# verifier ran its live handshake/register/tick path
// only against a manually started server on fixed 8765, degrading to an
// offline fallback otherwise — CI could pass without ever touching the
// server. This suite boots FearServer and points the real dotnet
// verifier at it via argv host/port.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

function dotnetAvailable() {
    try {
        execSync('dotnet --version', { stdio: ['ignore', 'pipe', 'pipe'] });
        return true;
    } catch {
        return false;
    }
}

describe('C# live round-trip against booted FearServer', () => {
    let server;
    const testPort = 8794;

    beforeAll(async () => {
        if (!dotnetAvailable()) return;
        server = new FearServer({ port: testPort, host: '127.0.0.1', seed: 4242 });
        await server.start();
    });

    afterAll(async () => {
        if (server) await server.stop();
    });

    it('1. dotnet verifier handshakes, registers, and ticks live', async () => {
        if (!dotnetAvailable()) {
            console.warn('[SKIP] dotnet SDK absent; C# live round-trip unverified on this machine.');
            return;
        }
        // Pre-flight: prove the booted server answers before dotnet runs,
        // so a handshake failure implicates the client path, not setup.
        const health = await new Promise((resolve) => {
            http.get(`http://127.0.0.1:${testPort}/health`, (res) => {
                let data = '';
                res.on('data', (c) => { data += c; });
                res.on('end', () => resolve({ status: res.statusCode, body: data }));
            }).on('error', (err) => resolve({ status: -1, body: String(err) }));
        });
        expect(health.status).toBe(200);
        // Cold NuGet restore plus build can take minutes on a fresh
        // machine; warm runs finish in seconds. Async spawn: the live
        // in-process server needs a free event loop to answer mid-run
        // (execFileSync would deadlock it behind HttpClient timeouts).
        const project = path.resolve(rootDir, 'tests/csharp_verification/CSharpClientTest.csproj');
        const output = await new Promise((resolve, reject) => {
            execFile('dotnet', [
                'run', '--project', project, '--', '127.0.0.1', String(testPort)
            ], { cwd: rootDir, encoding: 'utf-8', timeout: 280000, maxBuffer: 16 * 1024 * 1024 },
            (error, stdout, stderr) => {
                if (error) reject(new Error(`dotnet run failed: ${error.message}\nSTDOUT:\n${stdout}\nSTDERR:\n${String(stderr).slice(0, 2000)}`));
                else resolve(stdout);
            });
        });
        expect(output).toContain('[PASS] C# Handshake with FearServer succeeded!');
        expect(output).toContain('[PASS] Agent registration: True');
        expect(output).toContain('[PASS] Live Tick Result:');
        expect(output).toContain('VERIFICATION SUCCESS');
        expect(output).not.toContain('testing offline serialization path');
    }, 300000);
});
