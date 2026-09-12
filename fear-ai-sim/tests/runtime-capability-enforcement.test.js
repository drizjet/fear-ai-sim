import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import http from 'node:http';
import { FearServer } from '../packages/runtime/index.js';
import { WebSocket } from 'ws';
import { ProtocolValidator } from '../packages/protocol/src/validator.js';

// R36: capability negotiation + host feedback enforced live on the
// server tick path (Front D backlog #1). A host that cannot honor an
// intent must never receive it: capped ticks downgrade via runtime
// safe fallbacks, and reported-unexecutable intents are filtered
// until the host reports success.

const TEST_PORT = 8795;
const BASE = 'http://127.0.0.1:8795';
const WS_URL = 'ws://127.0.0.1:8795';

function httpPost(path, payload = {}) {
    return new Promise((resolve, reject) => {
        const bodyStr = JSON.stringify(payload);
        const req = http.request({
            hostname: '127.0.0.1',
            port: TEST_PORT,
            path,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
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

function threatObs(a1, a2) {
    return [
        { agent_id: a1, threats: [{ id: 't1', type: 'PREDATOR', distance: 8, intensity: 0.7 }], peers: [{ id: a2 }] },
        { agent_id: a2, threats: [{ id: 't1', type: 'PREDATOR', distance: 8, intensity: 0.7 }] }
    ];
}
async function registerPair(prefix) {
    // Wipe agents first: accumulated agents reshape server-side contagion
    // peers and drift trajectories. The feedback loop persists (records
    // are keyed by agent id; every test uses a unique prefix).
    await httpPost('/api/v1/reset', { clear_agents: true });
    const a1 = `${prefix}_a1`;
    const a2 = `${prefix}_a2`;
    for (const [id, traits] of [[a1, { agreeableness: 0.9, neuroticism: 0.9 }], [a2, { agreeableness: 0.2 }]]) {
        const reg = await httpPost('/api/v1/register', { agent_id: id, traits });
        expect(reg.status).toBe(200);
    }
    return [a1, a2];
}

describe('R36: capability enforcement on the live server', () => {
    let server;
    beforeAll(async () => {
        server = new FearServer({ host: '127.0.0.1', port: TEST_PORT, seed: 31337 });
        await server.start();
    });
    afterAll(async () => {
        await server.stop();
    });

    it('1. Handshake advertises the capability contract', async () => {
        const res = await httpPost('/api/v1/handshake', { client_id: 'cap_probe' });
        expect(res.status).toBe(200);
        expect(res.body.host_capabilities).toContain('supports_dialogue');
        expect(res.body.host_capabilities).toContain('supports_cover_points');
        expect(res.body.capability_requirements.SEEK_COVER).toBe('supports_cover_points');
        expect(res.body.capability_requirements.WARN_GROUP).toBe('supports_dialogue');
    });

    it('2. Legacy tick without caps passes gated intents unfiltered', async () => {
        const [a1, a2] = await registerPair('legacy');
        await httpPost('/api/v1/tick', { observations: threatObs(a1, a2) });
        const second = await httpPost('/api/v1/tick', { observations: threatObs(a1, a2) });
        const out = second.body.results.find((r) => r.agent_id === a1);
        expect(out.action_intent.type).toBe('WARN_GROUP');
        expect(out.capability_downgrade).toBeUndefined();
        expect(out.affordance_downgrade).toBeUndefined();
    });

    it('3. Explicit empty caps downgrade WARN_GROUP to FLEE_FROM with annotation', async () => {
        const [a1, a2] = await registerPair('empty');
        await httpPost('/api/v1/tick', { observations: threatObs(a1, a2), capabilities: [] });
        const second = await httpPost('/api/v1/tick', { observations: threatObs(a1, a2), capabilities: [] });
        const out = second.body.results.find((r) => r.agent_id === a1);
        expect(out.action_intent.type).toBe('FLEE_FROM');
        expect(out.capability_downgrade).toMatchObject({
            original_intent: 'WARN_GROUP',
            required_capability: 'supports_dialogue'
        });
        // Downgraded outputs still satisfy the output contract.
        expect(ProtocolValidator.isValidAgentOutput(out)).toBe(true);
    });

    it('4. Full caps leave gated intents intact (no annotation)', async () => {
        const [a1, a2] = await registerPair('full');
        const caps = ['supports_cover_points', 'supports_group_formation', 'supports_dialogue',
            'supports_navigation_query', 'supports_audio_directives', 'supports_dynamic_rerouting',
            'supports_tactical_retreat', 'supports_surrender'];
        await httpPost('/api/v1/tick', { observations: threatObs(a1, a2), capabilities: caps });
        const second = await httpPost('/api/v1/tick', { observations: threatObs(a1, a2), capabilities: caps });
        const out = second.body.results.find((r) => r.agent_id === a1);
        expect(out.action_intent.type).toBe('WARN_GROUP');
        expect(out.capability_downgrade).toBeUndefined();
    });

    it('5. Garbage capabilities sanitize; valid ones still honored', async () => {
        const [a1, a2] = await registerPair('garbage');
        const caps = [123, null, '   ', 'supports_dialogue', ...Array.from({ length: 100 }, (_, i) => `future_cap_${i}`)];
        await httpPost('/api/v1/tick', { observations: threatObs(a1, a2), capabilities: caps });
        const second = await httpPost('/api/v1/tick', { observations: threatObs(a1, a2), capabilities: caps });
        expect(second.status).toBe(200);
        const out = second.body.results.find((r) => r.agent_id === a1);
        expect(out.action_intent.type).toBe('WARN_GROUP');
    });

    it('6. Outcome reports validate loudly; receipts carry reliability', async () => {
        const bad1 = await httpPost('/api/v1/outcome', { intent_type: 'WARN_GROUP', outcome: 'GOAL_COMPLETED' });
        expect(bad1.status).toBe(400);
        const bad2 = await httpPost('/api/v1/outcome', { agent_id: 'x', intent_type: 'WARN_GROUP', outcome: 'PARTIED' });
        expect(bad2.status).toBe(400);
        const ok = await httpPost('/api/v1/outcome', {
            agent_id: 'loop_a1', intent_type: 'WARN_GROUP', outcome: 'GOAL_COMPLETED'
        });
        expect(ok.status).toBe(200);
        expect(ok.body).toMatchObject({ status: 'RECORDED', type: 'INTENT_OUTCOME_ACK', reason: 'UNKNOWN' });
        expect(typeof ok.body.reliability).toBe('number');
    });

    it('7. Three structural rejects park the intent; completion restores it', async () => {
        // registerPair wipes agents: the fresh-pair WARN window (ticks 1-8)
        // replays deterministically regardless of prior tests.
        const [a1, a2] = await registerPair('loop');
        await httpPost('/api/v1/tick', { observations: threatObs(a1, a2) });
        await httpPost('/api/v1/tick', { observations: threatObs(a1, a2) });
        let receipt;
        for (let i = 0; i < 3; i++) {
            receipt = await httpPost('/api/v1/outcome', {
                agent_id: a1, intent_type: 'WARN_GROUP', outcome: 'INTENT_REJECTED', reason: 'UNSUPPORTED'
            });
            expect(receipt.status).toBe(200);
        }
        expect(receipt.body.unavailable).toBe(true);
        const parked = await httpPost('/api/v1/tick', { observations: threatObs(a1, a2) });
        const parkedOut = parked.body.results.find((r) => r.agent_id === a1);
        expect(parkedOut.action_intent.type).toBe('FLEE_FROM');
        expect(parkedOut.affordance_downgrade).toMatchObject({
            original_intent: 'WARN_GROUP',
            reason: 'HOST_REPORTED_UNAVAILABLE'
        });
        await httpPost('/api/v1/outcome', {
            agent_id: a1, intent_type: 'WARN_GROUP', outcome: 'GOAL_COMPLETED'
        });
        const restored = await httpPost('/api/v1/tick', { observations: threatObs(a1, a2) });
        expect(restored.body.results.find((r) => r.agent_id === a1).action_intent.type).toBe('WARN_GROUP');
    });

    it('8. Same caps plus same observations replay identically', async () => {
        const post = (port, path, payload) => new Promise((resolve, reject) => {
            const bodyStr = JSON.stringify(payload);
            const req = http.request({
                hostname: '127.0.0.1', port, path, method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
            }, (res) => {
                let data = '';
                res.on('data', (c) => data += c);
                res.on('end', () => resolve(JSON.parse(data)));
            });
            req.on('error', reject);
            req.write(bodyStr);
            req.end();
        });
        const runOn = async (port) => {
            await post(port, '/api/v1/register', { agent_id: 'da', traits: { agreeableness: 0.9, neuroticism: 0.9 } });
            await post(port, '/api/v1/register', { agent_id: 'db', traits: { agreeableness: 0.2 } });
            await post(port, '/api/v1/tick', { observations: threatObs('da', 'db'), capabilities: [] });
            return post(port, '/api/v1/tick', { observations: threatObs('da', 'db'), capabilities: [] });
        };
        // Fresh twin servers, same seed, same agent ids, same requests.
        const twin = new FearServer({ host: '127.0.0.1', port: 8796, seed: 31337 });
        await twin.start();
        const twinA = await runOn(8796);
        await twin.stop();
        // Distinct port: immediate rebind of the same port is racy.
        const twin2 = new FearServer({ host: '127.0.0.1', port: 8797, seed: 31337 });
        await twin2.start();
        const post7 = (path, payload) => post(8797, path, payload);
        const runOn7 = async () => {
            await post7('/api/v1/register', { agent_id: 'da', traits: { agreeableness: 0.9, neuroticism: 0.9 } });
            await post7('/api/v1/register', { agent_id: 'db', traits: { agreeableness: 0.2 } });
            await post7('/api/v1/tick', { observations: threatObs('da', 'db'), capabilities: [] });
            return post7('/api/v1/tick', { observations: threatObs('da', 'db'), capabilities: [] });
        };
        try {
            const twinB = await runOn7();
            expect(twinB).toEqual(twinA);
        } finally {
            await twin2.stop();
        }
    });

    it('9. WebSocket parity: contract, caps filter, outcome ack', async () => {
        const ws = new WebSocket(WS_URL);
        await new Promise((resolve) => ws.on('open', resolve));
        const next = (type) => new Promise((resolve) => {
            const handler = (raw) => {
                const msg = JSON.parse(raw.toString());
                if (msg.type === type) {
                    ws.off('message', handler);
                    resolve(msg);
                }
            };
            ws.on('message', handler);
        });
        ws.send(JSON.stringify({ type: 'HANDSHAKE_REQUEST', protocol_version: '1.0.0', client_id: 'ws_cap' }));
        const hs = await next('HANDSHAKE_RESPONSE');
        expect(hs.capability_requirements.WARN_GROUP).toBe('supports_dialogue');
        ws.send(JSON.stringify({ type: 'REGISTER_AGENT', agent_id: 'ws_a1', traits: { agreeableness: 0.9, neuroticism: 0.9 } }));
        await next('REGISTER_AGENT_ACK');
        ws.send(JSON.stringify({ type: 'REGISTER_AGENT', agent_id: 'ws_a2', traits: { agreeableness: 0.2 } }));
        await next('REGISTER_AGENT_ACK');
        const step = (caps) => {
            ws.send(JSON.stringify({
                type: 'BATCH_TICK_REQUEST', dt: 0.0166,
                observations: threatObs('ws_a1', 'ws_a2'), capabilities: caps
            }));
            return next('BATCH_TICK_RESPONSE');
        };
        await step([]);
        const filtered = await step([]);
        const out = filtered.results.find((r) => r.agent_id === 'ws_a1');
        expect(out.action_intent.type).toBe('FLEE_FROM');
        expect(out.capability_downgrade.original_intent).toBe('WARN_GROUP');
        ws.send(JSON.stringify({
            type: 'INTENT_OUTCOME_REPORT', agent_id: 'ws_a1',
            intent_type: 'FLEE_FROM', outcome: 'GOAL_COMPLETED'
        }));
        const ack = await next('INTENT_OUTCOME_ACK');
        expect(ack.status).toBe('RECORDED');
        ws.close();
    });
});
