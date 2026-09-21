/**
 * tools/verification/verify_protocol_abuse.mjs
 *
 * Exercises malformed and adversarial HTTP/WebSocket inputs against a real
 * loopback FearServer listener. The probe verifies bounded rejection and that
 * recoverable protocol errors do not poison a connection.
 *
 * It also runs the HOSTILE HOST the ownership model is meant to answer, over the
 * real wire rather than against the arbitration class in isolation: a client that
 * knows a live session's NAME and nothing else. Such a client must not be able to
 * claim that session's agents, destroy them, wipe the world, replace the owner's
 * credential, or keep the owner's session alive by refusing to stop naming it.
 *
 * Hard Rule 9 Compliant: standalone deterministic abuse probe; no test runner.
 */

import http from 'node:http';
import { WebSocket } from 'ws';
import { FearServer } from '../../packages/runtime/src/FearServer.js';
import { ERROR_CODES, MESSAGE_TYPES } from '../../packages/protocol/index.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function httpPost(port, path, body) {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    return new Promise((resolve, reject) => {
        const request = http.request({
            host: '127.0.0.1',
            port,
            path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (response) => {
            let raw = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { raw += chunk; });
            response.on('end', () => {
                let parsed = null;
                try { parsed = raw ? JSON.parse(raw) : null; } catch {}
                resolve({ status: response.statusCode, body: parsed });
            });
        });
        request.on('error', reject);
        request.end(payload);
    });
}

function connect(url) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        const onError = (error) => {
            ws.removeListener('open', onOpen);
            reject(error);
        };
        const onOpen = () => {
            ws.removeListener('error', onError);
            resolve(ws);
        };
        ws.once('error', onError);
        ws.once('open', onOpen);
    });
}

function waitForJson(ws, sendPayload, predicate, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error(`Timed out waiting for ${label}.`));
        }, 2000);
        const onMessage = (data, isBinary) => {
            if (isBinary) return;
            let message;
            try { message = JSON.parse(data.toString()); } catch { return; }
            if (!predicate(message)) return;
            cleanup();
            resolve(message);
        };
        const onError = (error) => {
            cleanup();
            reject(error);
        };
        const cleanup = () => {
            clearTimeout(timer);
            ws.removeListener('message', onMessage);
            ws.removeListener('error', onError);
        };
        ws.on('message', onMessage);
        ws.once('error', onError);
        ws.send(sendPayload);
    });
}

function closeSocket(ws) {
    if (!ws || ws.readyState === WebSocket.CLOSED) return Promise.resolve(null);
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 2000);
        ws.once('close', (code) => {
            clearTimeout(timer);
            resolve(code);
        });
        ws.close();
    });
}

async function main() {
    console.log('============================================================');
    console.log('VERIFY HTTP / WEBSOCKET PROTOCOL ABUSE BOUNDARIES');
    console.log('============================================================\n');

    const server = new FearServer({ host: '127.0.0.1', port: 0, maxPayloadBytes: 512, seed: 4242 });
    let ws;
    let oversizedWs;
    try {
        const bound = await server.start();
        const url = `ws://127.0.0.1:${bound.port}`;

        const malformedHttp = await httpPost(bound.port, '/api/v1/handshake', '{"type":');
        assert(malformedHttp.status === 400, 'malformed HTTP JSON must return 400.');
        assert(malformedHttp.body.code === ERROR_CODES.MALFORMED_MESSAGE, 'malformed HTTP JSON must use MALFORMED_MESSAGE.');

        const incompatibleHttp = await httpPost(bound.port, '/api/v1/handshake', {
            type: MESSAGE_TYPES.HANDSHAKE_REQUEST,
            protocol_version: '9.0.0',
            client_id: 'bad-major'
        });
        assert(incompatibleHttp.status === 400, 'incompatible HTTP protocol must return 400.');
        assert(incompatibleHttp.body.code === ERROR_CODES.INVALID_PROTOCOL_VERSION, 'incompatible HTTP protocol must use INVALID_PROTOCOL_VERSION.');

        const invalidPacingHttp = await httpPost(bound.port, '/api/v1/pacing', { intensity: { nan: true } });
        assert(invalidPacingHttp.status === 400, 'poisonous HTTP pacing must return 400.');
        assert(invalidPacingHttp.body.code === ERROR_CODES.VALIDATION_FAILED, 'poisonous HTTP pacing must use VALIDATION_FAILED.');

        const oversizedHttp = await httpPost(bound.port, '/api/v1/pacing', { padding: 'x'.repeat(2048) });
        assert(oversizedHttp.status === 413, 'oversized HTTP payload must return 413.');
        assert(oversizedHttp.body.code === 'PAYLOAD_TOO_LARGE', 'oversized HTTP payload must use PAYLOAD_TOO_LARGE.');
        console.log('--- HTTP malformed, incompatible, poisonous, and oversized inputs: PASS');

        ws = await connect(url);
        const malformedWs = await waitForJson(
            ws,
            '{"type":',
            (message) => message.type === MESSAGE_TYPES.ERROR_RESPONSE,
            'malformed WebSocket error'
        );
        assert(malformedWs.code === ERROR_CODES.MALFORMED_MESSAGE, 'malformed WebSocket JSON must use MALFORMED_MESSAGE.');

        const unknownWs = await waitForJson(
            ws,
            JSON.stringify({ type: 'UNKNOWN_ATTACK', message_id: 'unknown-1' }),
            (message) => message.type === MESSAGE_TYPES.ERROR_RESPONSE && message.message_id === 'unknown-1',
            'unknown WebSocket message error'
        );
        assert(unknownWs.code === ERROR_CODES.MALFORMED_MESSAGE, 'unknown WebSocket message must be rejected as malformed.');

        const badMajorWs = await waitForJson(
            ws,
            JSON.stringify({ type: MESSAGE_TYPES.HANDSHAKE_REQUEST, protocol_version: '9.0.0', client_id: 'bad-major', message_id: 'major-1' }),
            (message) => message.type === MESSAGE_TYPES.ERROR_RESPONSE && message.message_id === 'major-1',
            'incompatible WebSocket version error'
        );
        assert(badMajorWs.code === ERROR_CODES.INVALID_PROTOCOL_VERSION, 'incompatible WebSocket version must use INVALID_PROTOCOL_VERSION.');

        const validHandshake = await waitForJson(
            ws,
            JSON.stringify({ type: MESSAGE_TYPES.HANDSHAKE_REQUEST, protocol_version: '1.0.0', client_id: 'recovered-client', message_id: 'good-1' }),
            (message) => message.type === MESSAGE_TYPES.HANDSHAKE_RESPONSE && message.message_id === 'good-1',
            'recovered WebSocket handshake'
        );
        assert(validHandshake.status === 'ACCEPTED', 'connection must remain usable after recoverable protocol errors.');

        const pollutedTraits = JSON.stringify({
            type: MESSAGE_TYPES.REGISTER_AGENT,
            agent_id: 'prototype-probe',
            traits: { '__proto__': { polluted: true }, constructor: 0.9, neuroticism: 4 },
            message_id: 'trait-1'
        });
        const registered = await waitForJson(
            ws,
            pollutedTraits,
            (message) => message.type === 'REGISTER_AGENT_ACK' && message.message_id === 'trait-1',
            'prototype-shaped registration'
        );
        assert(registered.status === 'REGISTERED', 'prototype-shaped registration must remain usable.');
        const agent = server.simulation.agents.get('prototype-probe');
        assert(agent?.traits?.neuroticism === 1, 'numeric traits must be clamped.');
        assert(!Object.prototype.polluted, 'prototype-shaped input must not pollute Object.prototype.');
        assert(!Object.prototype.hasOwnProperty.call(agent.traits, '__proto__'), 'prototype-shaped trait key must be dropped.');
        console.log('--- WebSocket recovery, version rejection, and prototype-shaped traits: PASS');

        oversizedWs = await connect(url);
        oversizedWs.send('x'.repeat(2048));
        const closeCode = await new Promise((resolve) => {
            const timer = setTimeout(() => resolve(null), 2000);
            oversizedWs.once('close', (code) => {
                clearTimeout(timer);
                resolve(code);
            });
        });
        assert(closeCode === 1009, `oversized WebSocket payload must close with 1009, got ${closeCode}.`);
        console.log('--- WebSocket max-payload enforcement: PASS');

        // ---------------------------------------------------------------
        // The hostile host: a name it saw, and nothing else.
        // ---------------------------------------------------------------
        const owner = await httpPost(bound.port, '/api/v1/register/batch', {
            session_id: 'victim_host',
            agents: [{ agent_id: 'victim_1' }, { agent_id: 'victim_2' }]
        });
        assert(owner.status === 200 && owner.body.count === 2, 'setup: the owner registers its crowd.');
        assert(typeof owner.body.session_token === 'string', 'setup: the owner holds a credential.');
        const victimToken = owner.body.session_token;

        // 1. Knowing the name is not knowing the host: the agents stay with their
        //    owner, and the refusal names who holds them.
        const steal = await httpPost(bound.port, '/api/v1/register/batch', {
            session_id: 'attacker', agents: [{ agent_id: 'victim_1' }, { agent_id: 'victim_2' }]
        });
        assert(steal.status === 200 && steal.body.count === 0, 'a rival session must not be handed a live owner\'s agents.');
        assert(steal.body.refused.length === 2, 'each stolen agent must be refused individually.');
        assert(steal.body.refused.every((r) => r.owner_session_id === 'victim_host'),
            'the refusal must name the session that owns the agent.');
        assert(Number.isFinite(steal.body.refused[0].retry_after_ms) === false || steal.body.refused[0].retry_after_ms === null,
            'no retry countdown is offered while the owner can still prove itself at any moment.');

        // 2. The name alone must not authorize destruction, a world wipe, or a
        //    credential replacement.
        const nameOnlyTeardown = await httpPost(bound.port, '/api/v1/unregister', {
            agent_id: 'victim_1', session_id: 'victim_host'
        });
        assert(nameOnlyTeardown.status === 409, 'a name without the token must not authorize teardown.');
        const nameOnlyReset = await httpPost(bound.port, '/api/v1/reset', {
            clear_agents: true, session_id: 'victim_host'
        });
        assert(nameOnlyReset.status === 409, 'a name without the token must not wipe the world.');
        const nameOnlyRevoke = await httpPost(bound.port, '/api/v1/session/revoke', {
            session_id: 'victim_host', session_token: 'guessed'
        });
        assert(nameOnlyRevoke.status === 403, 'a guessed token must not revoke a session.');
        const nameOnlyRotate = await httpPost(bound.port, '/api/v1/register', {
            agent_id: 'victim_3', session_id: 'victim_host', rotate_token: true
        });
        assert(nameOnlyRotate.status === 409, 'a rotation request must not be honoured without the credential.');

        // 3. Nothing above may have changed anything: same owners, same agents,
        //    same working credential.
        assert(server.simulation.agents.has('victim_1') && server.simulation.agents.has('victim_2'),
            'the hostile traffic must not have removed an agent.');
        assert(server.claims.ownerOf('victim_1') === 'victim_host', 'the hostile traffic must not have moved ownership.');
        const ownerStillWorks = await httpPost(bound.port, '/api/v1/register', {
            agent_id: 'victim_3', session_id: 'victim_host', session_token: victimToken
        });
        assert(ownerStillWorks.status === 200, 'the owner\'s own credential must survive the attack untouched.');

        // 4. Refusing to stop naming a session must not hold it open: liveness
        //    moves on proven traffic only, so a spammer cannot pin a crowd to a
        //    credential. Proven by the clock rather than by a counter, with a
        //    short staleness window so it is deterministic.
        const patience = new FearServer({ host: '127.0.0.1', port: 0, seed: 4242, sessionStalenessMs: 40 });
        const patienceBound = await patience.start();
        try {
            await httpPost(patienceBound.port, '/api/v1/register', { agent_id: 'idle_1', session_id: 'idle_host' });
            // A stranger naming the session repeatedly, faster than the window.
            for (let i = 0; i < 6; i++) {
                await httpPost(patienceBound.port, '/api/v1/register', {
                    agent_id: 'idle_1', session_id: 'idle_host', session_token: 'wrong'
                });
                await new Promise((resolve) => setTimeout(resolve, 12));
            }
            assert(patience.claims.isLive('idle_host') === false,
                'name-spamming must not keep an idle session live; only proven traffic may refresh liveness.');
            const recovery = await httpPost(patienceBound.port, '/api/v1/register', {
                agent_id: 'idle_1', session_id: 'idle_host'
            });
            assert(recovery.body.claim === 'ADOPTED',
                'once the spam stops, the name must lapse on schedule rather than being pinned forever.');
        } finally {
            await patience.stop();
        }
        console.log('--- hostile host armed with only a session name: PASS');
    } finally {
        await closeSocket(ws);
        await closeSocket(oversizedWs);
        await server.stop();
    }

    console.log('\n============================================================');
    console.log('SUCCESS: Protocol abuse verification passed.');
    console.log('============================================================\n');
}

main().catch((error) => {
    console.error('VERIFICATION FAILURE:', error);
    process.exit(1);
});
