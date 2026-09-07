import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import http from 'node:http';
import { WebSocket } from 'ws';
import { FearServer } from '../../packages/runtime/index.js';
import {
    PsychoacousticSynthesizer,
    IntentResolver,
    TraumaZoneSystem
} from '../../packages/core/index.js';

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

    it('8. Queue Saturation & Rapid Producer: pending observations strictly bounded to registered agents', async () => {
        await httpPostJson(testPort, '/api/v1/reset', { clear_agents: true });
        await httpPostJson(testPort, '/api/v1/register', {
            agent_id: 'queue_agent_1',
            traits: { fear: 0.3 }
        });

        // 1. Rapidly queue 500 observations for registered agent
        for (let i = 0; i < 500; i++) {
            server.simulation.queueObservation('queue_agent_1', { x: i, y: 0, z: 0 });
        }

        // 2. Rapidly attempt to queue 500 observations for unregistered rogue agents
        for (let i = 0; i < 500; i++) {
            server.simulation.queueObservation(`rogue_agent_${i}`, { x: i, y: 0, z: 0 });
        }

        // Must strictly contain only 1 observation (for registered agent, in-place overwrite)
        expect(server.simulation.pendingObservations.size).toBe(1);
        expect(server.simulation.pendingObservations.get('queue_agent_1').x).toBe(499);

        // Tick simulation processes cleanly
        const tickRes = await httpPostJson(testPort, '/api/v1/tick', { dt: 0.016 });
        expect(tickRes.status).toBe(200);
        expect(tickRes.body.results.length).toBe(1);
        expect(server.simulation.pendingObservations.size).toBe(0);
    });

    it('9. Slow Consumer WebSocket Backpressure: detects saturated buffer and terminates connection safely', async () => {
        const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
        await new Promise(r => ws.on('open', r));

        let closeCode = null;
        ws.on('close', (code) => {
            closeCode = code;
        });

        // Artificially simulate slow consumer buffer saturation (> 5MB)
        Object.defineProperty(ws, 'bufferedAmount', { value: 6 * 1024 * 1024, configurable: true });

        server._sendWs(ws, { type: 'TICK_EVENT', tick: 999 });

        await new Promise(r => setTimeout(r, 60));
        expect(closeCode).toBe(1008); // Policy violation / buffer overflow
    });

    it('10. Mid-Tick Server Socket Abort & Client Recovery: handles abrupt socket reset without process crash', async () => {
        let errorCaught = false;

        await new Promise((resolve) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port: testPort,
                path: '/api/v1/tick',
                method: 'POST',
                agent: false,
                headers: { 'Content-Type': 'application/json' }
            }, () => {});

            req.on('error', (err) => {
                errorCaught = true;
                resolve();
            });

            // Immediately destroy socket mid-request
            req.destroy(new Error('Simulated client connection abort'));
        });

        expect(errorCaught).toBe(true);

        // Server remains alive and responsive
        const recoveryPing = await httpPostJson(testPort, '/api/v1/reset', {});
        expect(recoveryPing.status).toBe(200);
    });

    it('11. Client-Side Request Timeout Handling: aborts slow request cleanly and allows subsequent queries', async () => {
        let timedOut = false;

        // Create temporary hung server endpoint to verify client-side timeout detection
        const hungServer = http.createServer((req, res) => {
            // Deliberately hold connection open without responding
        });
        await new Promise(r => hungServer.listen(0, '127.0.0.1', r));
        const hungPort = hungServer.address().port;

        await new Promise((resolve) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port: hungPort,
                path: '/api/v1/tick',
                method: 'POST',
                timeout: 50,
                agent: false
            }, () => {});

            req.on('timeout', () => {
                timedOut = true;
                req.destroy(new Error('Request timed out'));
            });

            req.on('error', () => {
                resolve();
            });

            req.end('{}');
        });

        hungServer.close();
        expect(timedOut).toBe(true);

        // Immediate subsequent request to active server succeeds cleanly
        const ping = await httpPostJson(testPort, '/api/v1/reset', {});
        expect(ping.status).toBe(200);
    });

    it('12. Out-of-Order / Retrograde Tick Defense: preserves monotonic simulation state', async () => {
        await httpPostJson(testPort, '/api/v1/reset', { clear_agents: true });
        await httpPostJson(testPort, '/api/v1/register', { agent_id: 'mono_agent', traits: { fear: 0.5 } });

        // Advance to tick 5
        for (let i = 0; i < 5; i++) {
            await httpPostJson(testPort, '/api/v1/tick', { dt: 0.016 });
        }
        expect(server.simulation.tickCount).toBe(5);

        // Send out-of-order retrograde tick payload (claiming client tick 1)
        const retroRes = await httpPostJson(testPort, '/api/v1/tick', {
            dt: 0.016,
            tick: 1,
            timestamp: Date.now() - 10000
        });

        // Server advances monotonically to tick 6, never rolling back to tick 1
        expect(retroRes.body.tick).toBe(6);
        expect(server.simulation.tickCount).toBe(6);
    });

    it('13. Adapter In-Flight Abrupt Shutdown: cleans up active sockets and listeners without dangling handles', async () => {
        const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
        await new Promise(r => ws.on('open', r));

        // Send request
        ws.send(JSON.stringify({ type: 'STEP_REQUEST', dt: 0.016 }));

        // Abrupt adapter shutdown while request in flight
        ws.terminate();

        await new Promise(r => setTimeout(r, 60));
        expect(server.connectedClients.has(ws)).toBe(false);
    });

    it('14. Subsystem Fallback - Psychoacoustic Synthesizer: safe resting cues on null, undefined, NaN inputs', () => {
        // 1. null
        const hintsNull = PsychoacousticSynthesizer.computeAudioHints(null);
        expect(hintsNull.heartbeat_bpm).toBe(60);
        expect(hintsNull.lowpass_cutoff_hz).toBe(20000);
        expect(hintsNull.vocalization_hint).toBe('SILENT');

        // 2. undefined
        const hintsUndef = PsychoacousticSynthesizer.computeAudioHints(undefined);
        expect(hintsUndef.heartbeat_bpm).toBe(60);

        // 3. Corrupted / non-finite inputs
        const hintsNaN = PsychoacousticSynthesizer.computeAudioHints({
            rawFear: NaN,
            arousal: Infinity,
            energy: -999,
            adrenaline: NaN
        });
        expect(Number.isFinite(hintsNaN.heartbeat_bpm)).toBe(true);
        expect(hintsNaN.heartbeat_bpm).toBeGreaterThanOrEqual(55);
        expect(hintsNaN.heartbeat_bpm).toBeLessThanOrEqual(185);
        expect(Number.isFinite(hintsNaN.shepard_mix)).toBe(true);
        expect(Number.isFinite(hintsNaN.lowpass_cutoff_hz)).toBe(true);
    });

    it('15. Subsystem Fallback - Intent Resolver: safe default exploration intent on corrupted state', () => {
        // 1. null agent
        const intentNull = IntentResolver.resolveIntent(null);
        expect(intentNull.type).toBe('CAUTIOUS_EXPLORE');
        expect(intentNull.urgency).toBe(0.10);

        // 2. malformed object
        const intentMalformed = IntentResolver.resolveIntent({}, { threats: 'invalid_type' });
        expect(intentMalformed.type).toBe('CAUTIOUS_EXPLORE');

        // 3. non-finite state
        const intentNaN = IntentResolver.resolveIntent({
            fearCore: { state: 'UNKNOWN_BAND' },
            currentFear: NaN,
            currentDominance: Infinity,
            currentAnger: -50,
            energy: NaN
        });
        expect(intentNaN.type).toBe('CAUTIOUS_EXPLORE');
        expect(Number.isFinite(intentNaN.urgency)).toBe(true);
    });

    it('16. Subsystem Fallback - Trauma Zone System: defensive parameter bounds and query resilience', () => {
        const trauma = new TraumaZoneSystem();

        // Add zone with extreme/corrupt values
        const zoneId = trauma.addZone(NaN, Infinity, -Infinity, -10.0, -500, -20);
        expect(zoneId).toBe(1);

        const state = trauma.getState();
        expect(state.zones.length).toBe(1);
        const z = state.zones[0];
        expect(z.intensity).toBe(0.0); // Clamped to [0, 1]
        expect(z.radius).toBe(1); // Clamped to min 1
        expect(z.lifetimeTicks).toBe(1); // Clamped to min 1

        // Query with NaN coordinates
        const dread = trauma.getTraumaAt(NaN, NaN, NaN);
        expect(Number.isFinite(dread)).toBe(true);
        expect(dread).toBe(0.0);
    });
});

