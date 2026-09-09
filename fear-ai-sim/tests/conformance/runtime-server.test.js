import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import http from 'node:http';
import { FearServer } from '../../packages/runtime/index.js';
import { WebSocket } from 'ws';

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

function httpPost(urlStr, payload = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const bodyStr = JSON.stringify(payload);
        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(bodyStr)
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
        req.write(bodyStr);
        req.end();
    });
}

describe('FearServer Integration Tests (WebSocket & HTTP REST)', () => {
    let server;
    const testPort = 8799;
    const httpBase = `http://127.0.0.1:${testPort}`;
    const wsUrl = `ws://127.0.0.1:${testPort}`;

    beforeAll(async () => {
        server = new FearServer({ host: '127.0.0.1', port: testPort, seed: 999 });
        await server.start();
    });

    afterAll(async () => {
        if (server) {
            await server.stop();
        }
    });

    // -------------------------------------------------------------------------
    // HTTP REST Tests
    // -------------------------------------------------------------------------
    it('serves GET /health with server and simulation status', async () => {
        const res = await httpGet(`${httpBase}/health`);
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(res.body.protocol_version).toBe('1.0.0');
        expect(res.body.simulation.agentCount).toBe(0);
    });

    it('handles POST /api/v1/handshake', async () => {
        const res = await httpPost(`${httpBase}/api/v1/handshake`, {
            type: 'HANDSHAKE_REQUEST',
            protocol_version: '1.0.0',
            client_id: 'jest_test_runner',
            engine: 'Jest'
        });
        expect(res.status).toBe(200);
        expect(res.body.type).toBe('HANDSHAKE_RESPONSE');
        expect(res.body.status).toBe('ACCEPTED');
    });

    it('handles agent registration, observation, tick, save, and load over HTTP', async () => {
        // 1. Register agent
        const regRes = await httpPost(`${httpBase}/api/v1/register`, {
            type: 'REGISTER_AGENT',
            agent_id: 'test_npc_1',
            name: 'Test NPC',
            traits: { neuroticism: 0.8, fear: 0.7 }
        });
        expect(regRes.status).toBe(200);
        expect(regRes.body.status).toBe('REGISTERED');

        // 2. Tick with threat observation
        const tickRes = await httpPost(`${httpBase}/api/v1/tick`, {
            observations: [
                {
                    agent_id: 'test_npc_1',
                    threats: [{ type: 'PREDATOR', distance: 5, intensity: 1.0 }]
                }
            ]
        });
        expect(tickRes.status).toBe(200);
        expect(tickRes.body.results.length).toBe(1);
        expect(tickRes.body.results[0].agent_id).toBe('test_npc_1');
        expect(['ALERT', 'ANXIOUS', 'PANIC']).toContain(tickRes.body.results[0].fear_band);

        // 3. Save snapshot
        const saveRes = await httpPost(`${httpBase}/api/v1/save`, {});
        expect(saveRes.status).toBe(200);
        expect(saveRes.body.snapshot).toBeDefined();
        expect(saveRes.body.snapshot.agents.length).toBe(1);

        // 4. Reset
        await httpPost(`${httpBase}/api/v1/reset`, {});
        const statusAfterReset = await httpGet(`${httpBase}/health`);
        expect(statusAfterReset.body.simulation.tickCount).toBe(0);

        // 5. Restore snapshot
        const loadRes = await httpPost(`${httpBase}/api/v1/load`, { snapshot: saveRes.body.snapshot });
        expect(loadRes.status).toBe(200);
        expect(loadRes.body.status).toBe('LOADED');
        expect(loadRes.body.agentCount).toBe(1);
    });
    it('serves POST /api/v1/advisory/chain with the unbroken valley chain', async () => {
        const res = await httpPost(`${httpBase}/api/v1/advisory/chain`, {});
        expect(res.status).toBe(200);
        expect(res.body.type).toBe('ADVISORY_CHAIN_RESPONSE');
        expect(res.body.seed).toBe(424242);
        expect(res.body.unbroken).toBe(true);
        expect(res.body.links.ROUTE_DANGER.danger).toBeGreaterThan(0);
    });

    it('serves POST /api/v1/advisory/chain with custom seeds and rejects bad seeds', async () => {
        const res = await httpPost(`${httpBase}/api/v1/advisory/chain`, { seed: 99 });
        expect(res.status).toBe(200);
        expect(res.body.seed).toBe(99);
        expect(res.body.unbroken).toBe(true);
        const bad = await httpPost(`${httpBase}/api/v1/advisory/chain`, { seed: 'soon' });
        expect(bad.status).toBe(400);
    });

    // -------------------------------------------------------------------------
    // WebSocket Tests
    // -------------------------------------------------------------------------
    it('handles real-time full-duplex WebSocket messaging', async () => {
        const ws = new WebSocket(wsUrl);

        await new Promise((resolve) => ws.on('open', resolve));

        // 1. Send Handshake
        const handshakePromise = new Promise((resolve) => {
            ws.on('message', (raw) => {
                const msg = JSON.parse(raw.toString());
                if (msg.type === 'HANDSHAKE_RESPONSE') resolve(msg);
            });
        });
        ws.send(JSON.stringify({
            type: 'HANDSHAKE_REQUEST',
            protocol_version: '1.0.0',
            client_id: 'ws_test_client'
        }));
        const hsRes = await handshakePromise;
        expect(hsRes.status).toBe('ACCEPTED');

        // 2. Register Agent
        const regPromise = new Promise((resolve) => {
            ws.on('message', (raw) => {
                const msg = JSON.parse(raw.toString());
                if (msg.type === 'REGISTER_AGENT_ACK') resolve(msg);
            });
        });
        ws.send(JSON.stringify({
            type: 'REGISTER_AGENT',
            agent_id: 'ws_agent_1',
            traits: { fear: 0.9, neuroticism: 0.9 }
        }));
        const regRes = await regPromise;
        expect(regRes.status).toBe('REGISTERED');

        // 3. Batch Tick Request
        const tickPromise = new Promise((resolve) => {
            ws.on('message', (raw) => {
                const msg = JSON.parse(raw.toString());
                if (msg.type === 'BATCH_TICK_RESPONSE') resolve(msg);
            });
        });
        ws.send(JSON.stringify({
            type: 'BATCH_TICK_REQUEST',
            dt: 0.016,
            observations: [
                {
                    agent_id: 'ws_agent_1',
                    threats: [{ type: 'PREDATOR', distance: 2, intensity: 1.0 }]
                }
            ]
        }));
        const tickRes = await tickPromise;
        expect(tickRes.results.length).toBeGreaterThanOrEqual(1);

        ws.close();
    });
});
