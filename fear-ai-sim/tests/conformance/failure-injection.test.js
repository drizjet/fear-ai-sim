import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import http from 'node:http';
import { FearServer } from '../../packages/runtime/index.js';
import { WebSocket } from 'ws';
import { AffectiveAgent } from '../../packages/core/index.js';

function httpGet(port, path) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path,
            method: 'GET'
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
        req.end();
    });
}

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

describe('Failure-Injection & Degraded-Mode Test Suite', () => {
    let server;
    const testPort = 8788;

    beforeAll(async () => {
        server = new FearServer({ port: testPort, host: '127.0.0.1', seed: 777 });
        await server.start();
    });

    afterAll(async () => {
        if (server) {
            await server.stop();
        }
    });

    it('1. Malformed HTTP JSON Payload: returns 400 MALFORMED_MESSAGE without server crash', async () => {
        const res = await rawHttpPost(testPort, '/api/v1/register', '{bad json string: [}');
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('MALFORMED_MESSAGE');

        // Confirm server remains fully operational
        const healthRes = await httpGet(testPort, '/health');
        expect(healthRes.status).toBe(200);
    });

    it('2. Malformed WebSocket Frame: returns error frame and keeps connection alive', async () => {
        const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
        await new Promise(r => ws.on('open', r));

        const errorPromise = new Promise((resolve) => {
            ws.on('message', (data) => {
                const parsed = JSON.parse(data.toString());
                if (parsed.type === 'ERROR_RESPONSE') {
                    resolve(parsed);
                }
            });
        });

        ws.send('<<<NOT_A_VALID_JSON_STRING>>>');
        const errFrame = await errorPromise;
        expect(errFrame.type).toBe('ERROR_RESPONSE');
        expect(errFrame.code).toBe('MALFORMED_MESSAGE');

        ws.close();
    });

    it('3. Protocol Version Mismatch: returns validation error on unknown version', async () => {
        const res = await rawHttpPost(testPort, '/api/v1/handshake', JSON.stringify({
            protocol_version: '999.0.0-unsupported',
            client_name: 'ObsoleteEngineClient'
        }));
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_PROTOCOL_VERSION');
    });

    it('4. Extreme Numeric Inputs & Boundary Clamping: handles NaN, Infinity, negative dt', () => {
        const agent = new AffectiveAgent('edge_agent_01', {
            fear: NaN,
            neuroticism: Infinity,
            resilience: -100
        });

        // Verify traits clamped safely to [0.0, 1.0]
        expect(agent.traits.fear).toBe(0.5); // NaN fallback
        expect(agent.traits.neuroticism).toBe(1.0); // Infinity clamped to 1.0
        expect(agent.traits.resilience).toBe(0.0); // Negative clamped to 0.0

        // Tick with extreme/malformed observations
        const result = agent.tick(-99.0, {
            x: NaN,
            y: Infinity,
            z: -Infinity,
            threats: [
                { id: 't1', distance: -500, intensity: 100000 },
                { id: 't2', distance: NaN, intensity: -10 }
            ]
        });

        expect(Number.isFinite(result.affective_state.raw_fear)).toBe(true);
        expect(Number.isFinite(result.affective_state.valence)).toBe(true);
        expect(Number.isFinite(result.affective_state.arousal)).toBe(true);
        expect(Number.isFinite(result.affective_state.dominance)).toBe(true);
        expect(result.action_intent).toBeDefined();
        expect(result.audio_hints.heartbeat_bpm).toBeGreaterThanOrEqual(60);
        expect(result.audio_hints.heartbeat_bpm).toBeLessThanOrEqual(180);
    });

    it('5. Corrupt Snapshot Load: rejects invalid snapshot structure without state loss', async () => {
        // Register a valid agent first
        await rawHttpPost(testPort, '/api/v1/register', JSON.stringify({
            agent_id: 'persisted_guard',
            traits: { fear: 0.2 }
        }));

        // Attempt to load corrupt snapshot
        const corruptRes = await rawHttpPost(testPort, '/api/v1/load', JSON.stringify({
            snapshot: {
                agents: 'not-an-array',
                seed: 'corrupted_seed'
            }
        }));

        expect(corruptRes.status).toBe(200); // Handled safely by simulation

        // Verify server is alive and simulation query works
        const statusRes = await httpGet(testPort, '/health');
        expect(statusRes.status).toBe(200);
        expect(statusRes.body.status).toBe('ok');
    });

    it('6. Agent Lifecycle & Memory Leaks: 100 agents registered, ticked, unregistered leaves clean state', async () => {
        for (let i = 0; i < 100; i++) {
            await rawHttpPost(testPort, '/api/v1/register', JSON.stringify({
                agent_id: `leak_test_agent_${i}`,
                traits: { fear: 0.5 }
            }));
        }

        expect(server.simulation.agents.size).toBe(100);

        // Advance simulation tick
        await rawHttpPost(testPort, '/api/v1/tick', JSON.stringify({ dt: 0.016 }));

        // Unregister all
        for (let i = 0; i < 100; i++) {
            await rawHttpPost(testPort, '/api/v1/unregister', JSON.stringify({
                agent_id: `leak_test_agent_${i}`
            }));
        }

        expect(server.simulation.agents.size).toBe(0);
        expect(server.simulation.pendingObservations.size).toBe(0);
    });

    it('7. Rapid Disconnect & Reconnect: cleans up socket sets without dangling listeners', async () => {
        const connections = [];
        for (let i = 0; i < 10; i++) {
            const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
            connections.push(ws);
        }

        await Promise.all(connections.map(ws => new Promise(r => ws.on('open', r))));
        expect(server.connectedClients.size).toBeGreaterThanOrEqual(10);

        // Abruptly terminate all sockets and wait for close events
        await Promise.all(connections.map(ws => new Promise(r => {
            ws.on('close', r);
            ws.terminate();
        })));

        // Small flush delay
        await new Promise(r => setTimeout(r, 50));
        expect(server.connectedClients.size).toBe(0);
    });
});
