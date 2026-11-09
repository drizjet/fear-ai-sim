/**
 * K16 compatibility contract: actual loopback HTTP and WebSocket registration
 * refusals are intentionally transport-shaped. Never normalize them without
 * an explicit external-client migration and corresponding updated assertions.
 *
 * Uses ephemeral port 0, real server/claims/protocol and local WS, and reports
 * only non-sensitive evidence; never prints credentials.
 */
import { FearServer } from '../../packages/runtime/src/FearServer.js';
import { MESSAGE_TYPES } from '../../packages/protocol/index.js';
import { WebSocket } from 'ws';

let assertions = 0;
const receipts = [];
function check(ok, meaning) {
    assertions++;
    if (!ok) throw new Error('K16 wire compatibility: ' + meaning);
}
const server = new FearServer({ host: '127.0.0.1', port: 0, seed: 8844, heartbeatIntervalMs: 0 });
const bound = await server.start();
const ws = new WebSocket('ws://127.0.0.1:' + bound.port);
const pending = new Map();
const uncorrelated = [];
ws.on('message', data => {
    const msg = JSON.parse(String(data));
    const id = msg.message_id;
    if (id && pending.has(id)) {
        const p = pending.get(id);
        pending.delete(id);
        clearTimeout(p.timer);
        p.resolve(msg);
    } else {
        uncorrelated.push(msg.type);
    }
});
ws.on('error', () => {});
async function post(payload) {
    const response = await fetch('http://127.0.0.1:' + bound.port + '/api/v1/register', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
    });
    return { status: response.status, body: await response.json() };
}
let sequence = 0;
async function send(payload) {
    const message_id = 'K16-' + (++sequence);
    const wait = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(message_id);
            reject(new Error('K16 WS reply timeout ' + message_id));
        }, 5000);
        pending.set(message_id, { resolve, reject, timer });
    });
    ws.send(JSON.stringify({ type: MESSAGE_TYPES.REGISTER_AGENT, message_id, ...payload }));
    const result = await wait;
    check(result.message_id === message_id, 'WS response preserved request correlation');
    return result;
}
try {
    await new Promise((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', reject);
    });
    const first = await post({ agent_id: 'k16-one', session_id: 'same-host' });
    check(first.status === 200 && first.body.status === 'REGISTERED', 'initial HTTP claim works');
    const token = first.body.session_token;
    check(typeof token === 'string' && token.length > 20, 'claimed session has credential');
    const wrong = await post({ agent_id: 'k16-two', session_id: 'same-host', session_token: 'incorrect-token' });
    check(wrong.status === 409 && wrong.body.code === 'SESSION_TOKEN_MISMATCH', 'HTTP wrong credential uses 409 mismatch');
    check(wrong.body.claim === 'REFUSED_TOKEN_MISMATCH', 'HTTP claim metadata keeps token mismatch');
    receipts.push({ transport: 'HTTP', scenario: 'wrong-token', status: wrong.status, code: wrong.body.code, claim: wrong.body.claim });
    const wrongWs = await send({ agent_id: 'k16-three', session_id: 'same-host', session_token: 'incorrect-token' });
    check(wrongWs.status === 'REFUSED' && wrongWs.code === 'OWNED_BY_LIVE_SESSION', 'WS wrong credential uses stable ownership refusal code');
    check(wrongWs.claim === 'REFUSED_TOKEN_MISMATCH', 'WS underlying claim retains mismatch reason');
    receipts.push({ transport: 'WS', scenario: 'wrong-token', status: wrongWs.status, code: wrongWs.code, claim: wrongWs.claim });
    check(!server.simulation.agents.has('k16-two') && !server.simulation.agents.has('k16-three'), 'both refused claims left simulation untouched');
    const validHttp = await post({ agent_id: 'k16-two', session_id: 'same-host', session_token: token });
    check(validHttp.status === 200 && validHttp.body.status === 'REGISTERED', 'valid HTTP token still accepted');
    const validWs = await send({ agent_id: 'k16-three', session_id: 'same-host', session_token: token });
    check(validWs.status === 'REGISTERED' && validWs.type === 'REGISTER_AGENT_ACK', 'valid WS token still accepted');
    const rival = await post({ agent_id: 'k16-one', session_id: 'rival-host' });
    check(rival.status === 409 && rival.body.code === 'OWNED_BY_LIVE_SESSION', 'HTTP rival refusal stays distinct from wrong token');
    const rivalWs = await send({ agent_id: 'k16-one', session_id: 'rival-other' });
    check(rivalWs.status === 'REFUSED' && rivalWs.code === 'OWNED_BY_LIVE_SESSION', 'WS rival refusal remains ownership code');
    check(rivalWs.claim !== 'REFUSED_TOKEN_MISMATCH', 'rival and bad token do not share claim reason');
    check(server.simulation.agents.size === 3, 'only three authorized agents registered');
    check(uncorrelated.every(type => type === MESSAGE_TYPES.AUTH_CHALLENGE), 'only asynchronous frame was optional signing challenge');
    receipts.push({ transport: 'HTTP', scenario: 'rival', status: rival.status, code: rival.body.code, claim: rival.body.claim });
    receipts.push({ transport: 'WS', scenario: 'rival', status: rivalWs.status, code: rivalWs.code, claim: rivalWs.claim });
    console.log(JSON.stringify({ suite: 'K16 actual wire refusal compatibility', requests: 7,
        assertions, passed: true, sensitiveCredentialsLogged: false, receipts }));
} finally {
    for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error('Socket cleanup'));
    }
    ws.terminate();
    await server.stop();
}
