import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import http from 'node:http';
import { WebSocket } from 'ws';
import { FearServer, RuntimeSimulation } from '../../packages/runtime/index.js';
import { AffectiveAgent, DeterministicRng } from '../../packages/core/index.js';

function rawHttpPost(port, path, rawBody, contentType = 'application/json') {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path,
            method: 'POST',
            headers: {
                'Content-Type': contentType,
                'Content-Length': Buffer.byteLength(rawBody)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });
        req.on('error', reject);
        req.write(rawBody);
        req.end();
    });
}

describe('Lifecycle & Optional Subsystems Verification Suite', () => {
    let server;
    const testPort = 8792;

    beforeAll(async () => {
        server = new FearServer({ port: testPort, host: '127.0.0.1', seed: 42 });
        await server.start();
    });

    afterAll(async () => {
        if (server) {
            await server.stop();
        }
    });

    it('1. Scene Unload & Entity Despawn: clean unregistration leaves zero memory residue', () => {
        const sim = new RuntimeSimulation({ seed: 101 });

        // Register 50 NPCs in a scene
        for (let i = 0; i < 50; i++) {
            sim.registerAgent(`npc_${i}`, { fear: 0.5 });
            sim.queueObservation(`npc_${i}`, {
                threats: [{ id: 'boss', distance: 5.0, intensity: 0.9 }]
            });
        }

        expect(sim.agents.size).toBe(50);
        expect(sim.pendingObservations.size).toBe(50);

        // Host game unloads scene: unregister all entities
        for (let i = 0; i < 50; i++) {
            const removed = sim.unregisterAgent(`npc_${i}`);
            expect(removed).toBe(true);
        }

        expect(sim.agents.size).toBe(0);
        expect(sim.pendingObservations.size).toBe(0);

        // Advance simulation post-unload: ticks cleanly without orphans
        const outputs = sim.tick(0.016);
        expect(outputs.length).toBe(0);
    });

    it('2. Complete Game / Application Exit: abrupt socket close cleans up client set with zero leaks', async () => {
        const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
        await new Promise(r => ws.on('open', r));

        const initialClients = server.connectedClients.size;
        expect(initialClients).toBeGreaterThanOrEqual(1);

        // Abrupt game exit: terminate underlying TCP socket immediately
        ws.terminate();

        // Wait for socket cleanup
        await new Promise(r => setTimeout(r, 60));
        expect(server.connectedClients.size).toBe(initialClients - 1);
    });

    it('3. Optional Subsystems Disablement: runs smoothly with trauma, contagion, pacing, and audio disabled', () => {
        // Initialize simulation with all optional subsystems disabled
        const sim = new RuntimeSimulation({
            enableTrauma: false,
            enableContagion: false,
            enablePacing: false
        });

        const agent = sim.registerAgent('headless_npc', { neuroticism: 0.8 }, {
            enablePsychoacoustics: false,
            enableHabituation: false
        });

        expect(agent.enablePsychoacoustics).toBe(false);
        expect(agent.enableHabituation).toBe(false);

        sim.queueObservation('headless_npc', {
            threats: [{ id: 'threat_1', distance: 4.0, intensity: 1.0 }]
        });

        const results = sim.tick(0.016);
        expect(results.length).toBe(1);

        const out = results[0];
        // Intent and affective state function seamlessly
        expect(['ALERT', 'PANIC']).toContain(out.fear_band);
        expect(out.action_intent).toBeDefined();
        // Audio hints gracefully return minimal default stub
        expect(out.audio_hints.heartbeat_bpm).toBe(60);
        expect(out.audio_hints.vocalization_hint).toBe('NONE');
    });

    it('4. Unsupported Future Protocol State: rejects unknown major versions and handles future unknown schema fields', async () => {
        // Unknown future version
        const vRes = await rawHttpPost(testPort, '/api/v1/handshake', JSON.stringify({
            protocol_version: '2.0.0-future-unsupported',
            client_name: 'FutureEngine'
        }));
        expect(vRes.status).toBe(400);
        expect(vRes.body.code).toBe('INVALID_PROTOCOL_VERSION');

        // Valid version with forward-compatible unknown extra fields
        const extRes = await rawHttpPost(testPort, '/api/v1/handshake', JSON.stringify({
            protocol_version: '1.0.0',
            client_name: 'FutureEngineExtension',
            unknown_future_field_99: { experimental_data: [1, 2, 3] }
        }));
        expect(extRes.status).toBe(200);
        expect(extRes.body.status).toBe('ACCEPTED');
    });

    it('5. Pure Software Numerical Fallback: Mulberry32 PRNG and float math execute deterministically without native acceleration', () => {
        const rng1 = new DeterministicRng(12345);
        const rng2 = new DeterministicRng(12345);

        const seq1 = [];
        const seq2 = [];
        for (let i = 0; i < 100; i++) {
            seq1.push(rng1.random());
            seq2.push(rng2.random());
        }

        // Bit-for-bit identical pure ECMAScript reproducibility
        expect(seq1).toEqual(seq2);
        expect(seq1[0]).toBeGreaterThanOrEqual(0.0);
        expect(seq1[0]).toBeLessThan(1.0);
    });

    it('6. Server Unavailable Before Startup: connection refusal handled gracefully without crash', async () => {
        const deadPort = 59999;

        // HTTP request to down server
        let httpErr;
        try {
            await rawHttpPost(deadPort, '/api/v1/handshake', '{}');
        } catch (err) {
            httpErr = err;
        }
        expect(httpErr).toBeDefined();
        expect(['ECONNREFUSED', 'ENOTFOUND']).toContain(httpErr.code);

        // WebSocket connection to down server
        const ws = new WebSocket(`ws://127.0.0.1:${deadPort}`);
        const wsErrPromise = new Promise((resolve) => {
            ws.on('error', resolve);
        });
        const wsErr = await wsErrPromise;
        expect(wsErr).toBeDefined();
        expect(['ECONNREFUSED', 'ENOTFOUND']).toContain(wsErr.code);
    });

    it('7. Unsupported Future Snapshot Version Rejection: rejects version > 1 with 400', async () => {
        // Direct simulation check
        const sim = new RuntimeSimulation();
        const loadResult = sim.loadSnapshot({
            version: 99,
            seed: 42,
            agents: []
        });
        expect(loadResult.success).toBe(false);
        expect(loadResult.error).toContain('UNSUPPORTED_SNAPSHOT_VERSION');

        // Over HTTP REST endpoint
        const res = await rawHttpPost(testPort, '/api/v1/load', JSON.stringify({
            snapshot: {
                version: 99,
                seed: 42,
                agents: []
            }
        }));
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('UNSUPPORTED_SNAPSHOT_VERSION');
    });

    it('8. Invalid Agent ID Validation: rejects empty, whitespace, and non-string IDs with 400', async () => {
        // Empty string
        const emptyRes = await rawHttpPost(testPort, '/api/v1/register', JSON.stringify({
            agent_id: ''
        }));
        expect(emptyRes.status).toBe(400);
        expect(emptyRes.body.code).toBe('VALIDATION_FAILED');

        // Whitespace only
        const wsRes = await rawHttpPost(testPort, '/api/v1/register', JSON.stringify({
            agent_id: '    '
        }));
        expect(wsRes.status).toBe(400);
        expect(wsRes.body.code).toBe('VALIDATION_FAILED');

        // Non-string / object
        const objRes = await rawHttpPost(testPort, '/api/v1/register', JSON.stringify({
            agent_id: { invalid: 'type' }
        }));
        expect(objRes.status).toBe(400);
        expect(objRes.body.code).toBe('VALIDATION_FAILED');
    });

    it('9. Native Acceleration Failure Path: loader failure triggers graceful software fallback with warning', () => {
        const simulatedFailingLoader = () => {
            throw new Error('ERR_DLOPEN_FAILED: fear_ai_nif.node binary not found on host');
        };

        const result = DeterministicRng.resolveAcceleration({ loader: simulatedFailingLoader });
        expect(result.accelerated).toBe(false);
        expect(result.provider).toBe('PURE_SOFTWARE_FALLBACK');
        expect(result.warning).toContain('ERR_DLOPEN_FAILED');
    });
});
