/**
 * tools/verification/verify_observation_acceptance.mjs
 *
 * Verifies that observation intake never claims an acceptance that did not
 * happen, without opening a network listener or using a test runner:
 * 1. RuntimeSimulation.queueObservation returns a receipt: an observation for
 *    an unregistered agent is refused with UNKNOWN_AGENT (nothing exists to
 *    observe) and mutates nothing; a registered agent's observation is queued
 *    and coalesced last-wins; a refusal never clobbers an existing entry.
 * 2. The internal bulk path (batchTick) keeps its best-effort advisory
 *    semantics: a mixed batch with unknown ids does not throw, the unknown
 *    never lands in the pending map, and registered observations are consumed
 *    by the tick.
 * 3. HTTP POST /api/v1/observation answers 404 AGENT_NOT_FOUND for an unknown
 *    agent (previously: 200 QUEUED for an observation that was discarded) and
 *    keeps the 400 VALIDATION_FAILED schema guard and the 200 QUEUED happy
 *    path.
 * 4. WS OBSERVATION_DISPATCH stays fire-and-forget for a registered agent (no
 *    frame at all) and answers an ERROR_RESPONSE (AGENT_NOT_FOUND, correlation
 *    preserved) for an unknown one — the socket learns its agent_id is stale
 *    instead of assuming the observation landed.
 *
 * Hard Rule 9 Compliant: standalone deterministic script; no automated test framework.
 */

import { FearServer } from '../../packages/runtime/src/FearServer.js';
import { ERROR_CODES, MESSAGE_TYPES } from '../../packages/protocol/index.js';

let assertions = 0;
function assert(condition, message) {
    assertions += 1;
    if (!condition) throw new Error(message);
}

function makeWs() {
    return {
        readyState: 1,
        bufferedAmount: 0,
        messages: [],
        send(payload) {
            this.messages.push(Buffer.isBuffer(payload) ? payload : JSON.parse(payload));
        },
        close() {}
    };
}

function latest(ws) {
    return ws.messages[ws.messages.length - 1];
}

function makeResponse() {
    return {
        status: null,
        body: null,
        writeHead(status) {
            this.status = status;
        },
        end(payload) {
            this.body = JSON.parse(payload);
        }
    };
}

console.log('============================================================');
console.log('VERIFY OBSERVATION ACCEPTANCE (no claim without a queued fact)');
console.log('============================================================\n');

const server = new FearServer({ seed: 9099 });
const sim = server.simulation;

// ---------------------------------------------------------------- Section A
console.log('--- A. queueObservation receipt contract ---');
const refusal = sim.queueObservation('ghost', { x: 1, y: 2, z: 0 });
assert(refusal.queued === false, 'An observation for an unregistered agent must be refused.');
assert(refusal.reason === 'UNKNOWN_AGENT', 'The refusal must name UNKNOWN_AGENT.');
assert(sim.pendingObservations.size === 0, 'A refused observation must not enter the pending map.');

sim.registerAgent('known-a', {});
const first = { x: 1, y: 0, z: 0 };
const accepted = sim.queueObservation('known-a', first);
assert(accepted.queued === true, 'An observation for a registered agent must be accepted.');
assert(sim.pendingObservations.get('known-a') === first, 'The accepted observation must be the stored one.');

const second = { x: 5, y: 5, z: 0 };
sim.queueObservation('known-a', second);
assert(sim.pendingObservations.get('known-a') === second, 'A repeat observation must coalesce last-wins.');

sim.queueObservation('ghost', { x: 9, y: 9, z: 9 });
assert(sim.pendingObservations.get('known-a') === second,
    'A refusal for another agent must not clobber the queued observation.');
assert(sim.pendingObservations.size === 1, 'The refusal must not add an entry.');
console.log('  * receipt contract: PASS');

// ---------------------------------------------------------------- Section B
console.log('\n--- B. batchTick keeps best-effort advisory semantics ---');
const batch = sim.batchTick([
    { agent_id: 'ghost', x: 1, y: 1, z: 0 },
    { agent_id: 'known-a', x: 2, y: 0, z: 0 }
], 0.0166);
assert(Array.isArray(batch), 'A mixed batch must tick and return outputs, not throw.');
assert(!sim.pendingObservations.has('ghost'), 'The unknown id must never land in the pending map.');
assert(!sim.pendingObservations.has('known-a'), 'The tick must consume the registered observation.');
console.log('  * batchTick semantics: PASS');

// ---------------------------------------------------------------- Section C
console.log('\n--- C. HTTP /api/v1/observation honesty ---');
const httpUnknown = makeResponse();
server._routeHttpPost('/api/v1/observation', { agent_id: 'ghost-http', x: 0, y: 0 }, httpUnknown);
assert(httpUnknown.status === 404, 'An unknown agent must get 404, not a false 200 QUEUED.');
assert(httpUnknown.body.code === ERROR_CODES.AGENT_NOT_FOUND, 'The 404 must carry AGENT_NOT_FOUND.');
assert(httpUnknown.body.agent_id === 'ghost-http', 'The 404 must echo the offending agent_id.');
assert(!sim.pendingObservations.has('ghost-http'), 'The refused HTTP observation must not be queued.');

const httpKnown = makeResponse();
server._routeHttpPost('/api/v1/observation', { agent_id: 'known-a', x: 3, y: 0 }, httpKnown);
assert(httpKnown.status === 200, 'A registered agent must still get 200.');
assert(httpKnown.body.status === 'QUEUED', 'The happy path must still report QUEUED.');
assert(sim.pendingObservations.has('known-a'), 'The accepted HTTP observation must be queued.');

const httpBad = makeResponse();
server._routeHttpPost('/api/v1/observation', { x: 1 }, httpBad);
assert(httpBad.status === 400, 'The schema guard must still answer 400.');
assert(httpBad.body.code === ERROR_CODES.VALIDATION_FAILED, 'The schema guard must still use VALIDATION_FAILED.');

sim.registerAgent('stale-a', {});
sim.unregisterAgent('stale-a');
const httpStale = makeResponse();
server._routeHttpPost('/api/v1/observation', { agent_id: 'stale-a', x: 0, y: 0 }, httpStale);
assert(httpStale.status === 404, 'An observation for a removed agent must be refused, not QUEUED.');
console.log('  * HTTP route: PASS');

// ---------------------------------------------------------------- Section D
console.log('\n--- D. WS OBSERVATION_DISPATCH honesty ---');
const ws = makeWs();
sim.registerAgent('known-ws', {});

const frameCountBefore = ws.messages.length;
server._handleWsMessage(ws, {
    type: MESSAGE_TYPES.OBSERVATION_DISPATCH,
    agent_id: 'known-ws',
    x: 4, y: 0
});
assert(ws.messages.length === frameCountBefore,
    'A dispatch for a registered agent must stay fire-and-forget (no frame at all).');
assert(sim.pendingObservations.has('known-ws'), 'The registered dispatch must be queued.');

server._handleWsMessage(ws, {
    type: MESSAGE_TYPES.OBSERVATION_DISPATCH,
    agent_id: 'ghost-ws',
    x: 0, y: 0,
    message_id: 'obs-unknown'
});
const wsErr = latest(ws);
assert(wsErr.type === MESSAGE_TYPES.ERROR_RESPONSE,
    'A dispatch naming an unknown agent must answer with an error frame, not silence.');
assert(wsErr.code === ERROR_CODES.AGENT_NOT_FOUND, 'The error frame must carry AGENT_NOT_FOUND.');
assert(wsErr.message_id === 'obs-unknown', 'The error frame must preserve the correlation id.');
assert(!sim.pendingObservations.has('ghost-ws'), 'The refused dispatch must not be queued.');

sim.registerAgent('stale-ws', {});
sim.unregisterAgent('stale-ws');
server._handleWsMessage(ws, {
    type: MESSAGE_TYPES.OBSERVATION_DISPATCH,
    agent_id: 'stale-ws',
    x: 0, y: 0
});
assert(latest(ws).type === MESSAGE_TYPES.ERROR_RESPONSE,
    'A dispatch for a removed agent must answer with an error frame.');
assert(latest(ws).code === ERROR_CODES.AGENT_NOT_FOUND,
    'The stale-agent error frame must carry AGENT_NOT_FOUND.');
console.log('  * WS dispatch: PASS');

console.log('\n============================================================');
console.log(`SUCCESS: All ${assertions} observation-acceptance assertions passed.`);
console.log('============================================================');
