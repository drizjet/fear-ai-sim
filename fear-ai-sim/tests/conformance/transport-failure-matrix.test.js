import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import http from 'node:http';
import { WebSocket } from 'ws';
import { FearServer } from '../../packages/runtime/index.js';

function rawHttpPost(port, path, rawBody, contentType = 'application/json') {
    return new Promise((resolve, reject) => {
        let settled = false;
        const safeReject = (err) => {
            if (!settled) {
                settled = true;
                reject(err);
            }
        };
        const safeResolve = (val) => {
            if (!settled) {
                settled = true;
                resolve(val);
            }
        };

        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path,
            method: 'POST',
            agent: false,
            headers: {
                'Content-Type': contentType,
                'Content-Length': Buffer.byteLength(rawBody)
            }
        }, (res) => {
            let data = '';
            res.on('error', safeReject);
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    safeResolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch {
                    safeResolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', safeReject);

        try {
            req.write(rawBody);
            req.end();
        } catch (err) {
            safeReject(err);
        }
    });
}

function httpPostJson(port, path, payload) {
    return rawHttpPost(port, path, JSON.stringify(payload));
}

describe('Transport Failure Matrix & Stress Verification', () => {
    let server;
    const testPort = 8799;

    beforeAll(async () => {
        // Configure small maxPayloadBytes (256 KB) for deterministic payload testing
        server = new FearServer({
            port: testPort,
            host: '127.0.0.1',
            seed: 4242,
            maxPayloadBytes: 256 * 1024
        });
        await server.start();
    });

    afterAll(async () => {
        if (server) {
            await server.stop();
        }
    });

    it('1. Payload Over Max Limit Rejection: rejects with 413 or destroys socket cleanly', async () => {
        const oversized = 'x'.repeat(300 * 1024); // 300KB > 256KB limit
        let rejectedOrDestroyed = false;

        try {
            const res = await rawHttpPost(testPort, '/api/v1/tick', oversized);
            if (res.status === 413) {
                rejectedOrDestroyed = true;
            }
        } catch (err) {
            // Connection reset or socket destroyed is also acceptable defense
            rejectedOrDestroyed = true;
        }

        expect(rejectedOrDestroyed).toBe(true);

        // Server must remain alive and responsive
        const ping = await httpPostJson(testPort, '/api/v1/reset', {});
        expect(ping.status).toBe(200);
    });

    it('2. WebSocket Correlation ID Echo: returns matching message_id', async () => {
        const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
        await new Promise(r => ws.on('open', r));

        const responsePromise = new Promise((resolve) => {
            ws.on('message', (data) => {
                const parsed = JSON.parse(data.toString());
                if (parsed.message_id === 'req_uuid_9999') {
                    resolve(parsed);
                }
            });
        });

        ws.send(JSON.stringify({
            type: 'HANDSHAKE_REQUEST',
            protocol_version: '1.0.0',
            client_id: 'corr_client',
            message_id: 'req_uuid_9999'
        }));

        const response = await responsePromise;
        expect(response.type).toBe('HANDSHAKE_RESPONSE');
        expect(response.message_id).toBe('req_uuid_9999');
        expect(response.status).toBe('ACCEPTED');

        ws.close();
    });

    it('3. Duplicate Message IDs: handles identical IDs independently without collisions', async () => {
        const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
        await new Promise(r => ws.on('open', r));

        const responses = [];
        ws.on('message', (data) => {
            const parsed = JSON.parse(data.toString());
            if (parsed.message_id === 'dup_id_42') {
                responses.push(parsed);
            }
        });

        // Send two identical message IDs
        ws.send(JSON.stringify({
            type: 'REGISTER_AGENT',
            agent_id: 'dup_agent_a',
            message_id: 'dup_id_42'
        }));
        ws.send(JSON.stringify({
            type: 'REGISTER_AGENT',
            agent_id: 'dup_agent_b',
            message_id: 'dup_id_42'
        }));

        await new Promise(r => setTimeout(r, 80));

        expect(responses.length).toBe(2);
        expect(responses[0].message_id).toBe('dup_id_42');
        expect(responses[1].message_id).toBe('dup_id_42');

        ws.close();
    });

    it('4. Stale Tick Ordering: processes observations monotonically without rollbacks', async () => {
        await httpPostJson(testPort, '/api/v1/reset', {});
        await httpPostJson(testPort, '/api/v1/register', {
            agent_id: 'stale_agent',
            traits: { fear: 0.5 }
        });

        // Tick 1
        const tick1 = await httpPostJson(testPort, '/api/v1/tick', { dt: 0.016 });
        const tickNum1 = tick1.body.tick;

        // Send tick with stale metadata (older timestamp / out of order simulated)
        const tick2 = await httpPostJson(testPort, '/api/v1/tick', {
            dt: 0.016,
            client_tick_timestamp: Date.now() - 5000,
            observations: [{ agent_id: 'stale_agent', threats: [] }]
        });
        const tickNum2 = tick2.body.tick;

        expect(tickNum2).toBe(tickNum1 + 1);
        expect(server.simulation.tickCount).toBe(tickNum2);
    });

    it('5. Unregister During Queued Pending Work: cleans up observations and prevents memory leaks', async () => {
        await httpPostJson(testPort, '/api/v1/reset', { clear_agents: true });
        await httpPostJson(testPort, '/api/v1/register', {
            agent_id: 'cleanup_agent',
            traits: { fear: 0.5 }
        });

        // Queue observation directly into simulation
        server.simulation.queueObservation('cleanup_agent', {
            threats: [{ id: 'boss', type: 'PREDATOR', distance: 5, intensity: 1.0 }]
        });
        expect(server.simulation.pendingObservations.has('cleanup_agent')).toBe(true);

        // Unregister before next tick
        await httpPostJson(testPort, '/api/v1/unregister', { agent_id: 'cleanup_agent' });

        expect(server.simulation.agents.has('cleanup_agent')).toBe(false);
        expect(server.simulation.pendingObservations.has('cleanup_agent')).toBe(false);

        // Tick simulation should execute smoothly with 0 agents
        const postTick = await httpPostJson(testPort, '/api/v1/tick', { dt: 0.016 });
        expect(postTick.body.results.length).toBe(0);
    });

    it('6. High-Throughput Burst: handles 100 rapid tick requests in concurrent batches without dropped frames', async () => {
        await httpPostJson(testPort, '/api/v1/reset', {});
        await httpPostJson(testPort, '/api/v1/register', {
            agent_id: 'burst_agent',
            traits: { fear: 0.4 }
        });

        const totalRequests = 100;
        const batchSize = 20;
        let completed = 0;

        for (let b = 0; b < totalRequests / batchSize; b++) {
            const batchPromises = [];
            for (let i = 0; i < batchSize; i++) {
                batchPromises.push(httpPostJson(testPort, '/api/v1/tick', { dt: 0.016 }));
            }
            const responses = await Promise.all(batchPromises);
            for (const res of responses) {
                expect(res.status).toBe(200);
                expect(res.body.type).toBe('BATCH_TICK_RESPONSE');
                completed++;
            }
        }

        expect(completed).toBe(totalRequests);
        expect(server.simulation.tickCount).toBe(totalRequests);
    });

    it('7. 25-Client Reconnect Storm: simultaneous connects, ticks, and disconnects', async () => {
        const clientCount = 25;
        const sockets = [];

        for (let i = 0; i < clientCount; i++) {
            sockets.push(new WebSocket(`ws://127.0.0.1:${testPort}`));
        }

        await Promise.all(sockets.map(ws => new Promise(r => ws.on('open', r))));
        expect(server.connectedClients.size).toBeGreaterThanOrEqual(clientCount);

        // All 25 send handshakes concurrently
        const handshakePromises = sockets.map((ws, idx) => {
            return new Promise((resolve) => {
                const handler = (data) => {
                    const parsed = JSON.parse(data.toString());
                    if (parsed.type === 'HANDSHAKE_RESPONSE') {
                        ws.removeListener('message', handler);
                        resolve(parsed);
                    }
                };
                ws.on('message', handler);
                ws.send(JSON.stringify({
                    type: 'HANDSHAKE_REQUEST',
                    protocol_version: '1.0.0',
                    client_id: `storm_client_${idx}`
                }));
            });
        });

        const handshakes = await Promise.all(handshakePromises);
        expect(handshakes.length).toBe(clientCount);

        // Terminate all 25 sockets simultaneously
        await Promise.all(sockets.map(ws => new Promise(r => {
            ws.on('close', r);
            ws.terminate();
        })));

        await new Promise(r => setTimeout(r, 60));
        expect(server.connectedClients.size).toBe(0);
    }, 15000);
});
