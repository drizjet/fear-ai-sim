/**
 * tools/verification/verify_server_lifecycle.mjs
 *
 * Verifies focused runtime transport and lifecycle contracts without opening a
 * network listener or using a test runner:
 * 1. WebSocket validation rejects poisonous pacing values and clamps valid ones.
 * 2. WebSocket snapshot loading reports failure instead of acknowledging a bad snapshot.
 * 3. Agent unregister removes pending, cached, social, trauma, and contagion state.
 * 4. HTTP pacing uses the same finite-number boundary as the WebSocket path.
 *
 * Hard Rule 9 Compliant: standalone deterministic script; no automated test framework.
 */

import { FearServer } from '../../packages/runtime/src/FearServer.js';
import { ERROR_CODES, MESSAGE_TYPES } from '../../packages/protocol/index.js';

function assert(condition, message) {
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

async function main() {
    console.log('============================================================');
    console.log('VERIFY FEAR SERVER LIFECYCLE & PROTOCOL GUARDS');
    console.log('============================================================\n');

    const server = new FearServer({ seed: 4242 });
    const ws = makeWs();

    console.log('--- Pacing input guards ---');
    server._handleWsMessage(ws, {
        type: MESSAGE_TYPES.SET_PACING_OVERRIDE,
        intensity: { poisoned: true },
        message_id: 'bad-pacing'
    });
    const badPacing = latest(ws);
    assert(badPacing.type === MESSAGE_TYPES.ERROR_RESPONSE, 'invalid WebSocket pacing must return an error response.');
    assert(badPacing.code === ERROR_CODES.VALIDATION_FAILED, 'invalid WebSocket pacing must use VALIDATION_FAILED.');
    assert(badPacing.message_id === 'bad-pacing', 'pacing validation error must preserve correlation id.');
    assert(server.simulation.pacing.pacingOverride === null, 'invalid pacing must not poison the pacing override.');

    server._handleWsMessage(ws, {
        type: MESSAGE_TYPES.SET_PACING_OVERRIDE,
        intensity: 9.0,
        message_id: 'clamped-pacing'
    });
    assert(latest(ws).type === 'SET_PACING_OVERRIDE_ACK', 'valid WebSocket pacing must acknowledge.');
    assert(server.simulation.pacing.pacingOverride === 1.5, 'pacing override must clamp to the documented maximum.');

    const httpBadPacing = makeResponse();
    server._routeHttpPost('/api/v1/pacing', { intensity: 'not-a-number' }, httpBadPacing);
    assert(httpBadPacing.status === 400, 'invalid HTTP pacing must return 400.');
    assert(httpBadPacing.body.code === ERROR_CODES.VALIDATION_FAILED, 'invalid HTTP pacing must use VALIDATION_FAILED.');
    console.log('  * WebSocket and HTTP pacing guards: PASS');

    console.log('\n--- Registration, removal, and stale-state cleanup ---');
    for (const agentId of ['alpha', 'bravo']) {
        server._handleWsMessage(ws, {
            type: MESSAGE_TYPES.REGISTER_AGENT,
            agent_id: agentId,
            traits: { neuroticism: 0.6, resilience: 0.4 }
        });
    }
    assert(server.simulation.agents.size === 2, 'two agents should be registered.');

    server._handleWsMessage(ws, {
        type: MESSAGE_TYPES.OBSERVATION_DISPATCH,
        agent_id: 'alpha',
        threat_level: 0.9
    });
    server.simulation.lastContagion.set('alpha', { contagionFear: 0.8, leaderCalm: 0 });
    server.simulation.coreTrauma.agentRecords.set('alpha', { activeTraumas: [] });
    server.simulation.social.relationships.set('alpha', new Map([['bravo', { trust: -0.4 }]]));
    server.simulation.social.relationships.set('bravo', new Map([['alpha', { trust: -0.2 }]]));
    server.simulation.contagion.activeEdges = [{ from: 'alpha', to: 'bravo', strength: 0.7 }];

    server._handleWsMessage(ws, {
        type: MESSAGE_TYPES.UNREGISTER_AGENT,
        agent_id: 'alpha',
        message_id: 'remove-alpha'
    });
    assert(latest(ws).type === 'UNREGISTER_AGENT_ACK', 'unregister must acknowledge.');
    assert(!server.simulation.agents.has('alpha'), 'unregistered agent must leave the live agent map.');
    assert(!server.simulation.pendingObservations.has('alpha'), 'unregister must clear pending observations.');
    assert(!server.simulation.lastContagion.has('alpha'), 'unregister must clear cached contagion.');
    assert(!server.simulation.coreTrauma.agentRecords.has('alpha'), 'unregister must clear core-trauma records.');
    assert(!server.simulation.social.relationships.has('alpha'), 'unregister must clear outbound social state.');
    assert(!server.simulation.social.relationships.get('bravo')?.has('alpha'), 'unregister must clear inbound social state.');
    assert(server.simulation.contagion.activeEdges.length === 0, 'unregister must not expose stale contagion edges.');
    console.log('  * agent unregister cleanup across runtime subsystems: PASS');

    console.log('\n--- WebSocket snapshot result semantics ---');
    server._handleWsMessage(ws, {
        type: MESSAGE_TYPES.LOAD_SNAPSHOT_REQUEST,
        snapshot: { version: 3 },
        message_id: 'bad-snapshot'
    });
    const badSnapshot = latest(ws);
    assert(badSnapshot.type === MESSAGE_TYPES.ERROR_RESPONSE, 'unsupported WebSocket snapshot must return an error.');
    assert(badSnapshot.code === ERROR_CODES.SNAPSHOT_ERROR, 'snapshot failure must use SNAPSHOT_ERROR.');
    assert(badSnapshot.message_id === 'bad-snapshot', 'snapshot error must preserve correlation id.');

    const snapshot = server.simulation.saveSnapshot();
    server._handleWsMessage(ws, {
        type: MESSAGE_TYPES.LOAD_SNAPSHOT_REQUEST,
        snapshot,
        message_id: 'good-snapshot'
    });
    const goodSnapshot = latest(ws);
    assert(goodSnapshot.type === 'LOAD_SNAPSHOT_ACK', 'supported WebSocket snapshot must acknowledge.');
    assert(goodSnapshot.status === 'LOADED', 'supported WebSocket snapshot must report LOADED.');
    assert(goodSnapshot.message_id === 'good-snapshot', 'snapshot acknowledgement must preserve correlation id.');
    console.log('  * failed and successful WebSocket snapshot semantics: PASS');

    console.log('\n============================================================');
    console.log('SUCCESS: Fear Server lifecycle and protocol verification passed.');
    console.log('============================================================\n');
}

main().catch((error) => {
    console.error('VERIFICATION FAILURE:', error);
    process.exit(1);
});
