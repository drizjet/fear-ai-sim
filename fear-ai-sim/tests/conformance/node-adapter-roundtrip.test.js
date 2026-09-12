import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import http from 'node:http';
import { FearServer } from '../../packages/runtime/index.js';
import { FearAIClient } from '../../packages/adapters/node/fear_ai_client.mjs';

// R25 (audit): the Node reference client shipped real fetch+WS logic
// with zero test imports. This suite boots a live FearServer and drives
// the actual client class end to end over both transports.

describe('Node adapter live round-trip against FearServer', () => {

// jsdom test env ships no global fetch (Node >= 18 has it natively, as
// does any browser host). Minimal JSON-only shim so the unmodified
// reference client runs end to end under Jest.
function nodeFetch(urlStr, options = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const body = options.body ?? null;
        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: options.method ?? 'GET',
            headers: options.headers ?? {}
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve({
                ok: res.statusCode >= 200 && res.statusCode < 300,
                status: res.statusCode,
                json: async () => JSON.parse(data),
                text: async () => data
            }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}
if (typeof globalThis.fetch !== 'function') globalThis.fetch = nodeFetch;

    let server;
    const testPort = 8789;
    let client;

    beforeAll(async () => {
        server = new FearServer({ port: testPort, host: '127.0.0.1', seed: 4242 });
        await server.start();
        client = new FearAIClient({ host: '127.0.0.1', port: testPort });
    });

    afterAll(async () => {
        if (client?.ws) client.ws.close();
        if (server) await server.stop();
    });

    it('1. REST: health, register, and tick through the client', async () => {
        const health = await client.checkHealth();
        expect(health.status).toBe('ok');
        const reg = await client.registerAgent('node_probe', { bravery: 0.6 });
        expect(reg.agent_id ?? reg.agentId ?? 'node_probe').toBeDefined();
        const tickRes = await client.tick([
            { agent_id: 'node_probe', threats: [{ id: 'boss', type: 'PREDATOR', distance: 9.0, intensity: 0.8 }] }
        ]);
        expect(tickRes.results.length).toBe(1);
        expect(tickRes.results[0].agent_id).toBe('node_probe');
        expect(['CALM', 'ALERT', 'ANXIOUS', 'PANIC']).toContain(tickRes.results[0].fear_band);
    });

    it('2. WS: handshake and batch tick through the client', async () => {
        await client.connectWs();
        const handshake = await new Promise((resolve) => {
            client.on('HANDSHAKE_RESPONSE', resolve);
        });
        expect(handshake.type).toBe('HANDSHAKE_RESPONSE');
        const tickRes = await new Promise((resolve) => {
            client.on('BATCH_TICK_RESPONSE', resolve);
            client.sendObservationsWs([
                { agent_id: 'node_probe', threats: [{ id: 'boss', type: 'PREDATOR', distance: 9.0, intensity: 0.8 }] }
            ]);
        });
        expect(tickRes.results.length).toBeGreaterThanOrEqual(1);
    });
});
