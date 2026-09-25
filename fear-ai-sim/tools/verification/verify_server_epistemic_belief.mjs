/**
 * tools/verification/verify_server_epistemic_belief.mjs
 *
 * Verifies FearServer WebSocket and HTTP REST control plane contracts for
 * the opt-in Tier 2 Epistemic Belief Engine (Sections 50 & 51):
 *
 * Suites:
 * 1. Opt-in boundaries: when enableEpistemicBelief is false (default),
 *    all epistemic routes (WebSocket + HTTP) refuse cleanly with EPISTEMIC_BELIEF_DISABLED error codes.
 * 2. Handshake contract: advertises epistemic_belief boolean matching server options.
 * 3. WebSocket epistemic lifecycle: observe direct perceptions, rumor ingestion across agents,
 *    discrepancy queries against ground truth, and subjective observation queries.
 * 4. HTTP REST route parity: /api/v1/epistemic/observe, /api/v1/epistemic/rumor,
 *    /api/v1/epistemic/discrepancy/query, /api/v1/epistemic/subjective/query.
 * 5. Validation failure boundaries: missing or malformed fields rejected with VALIDATION_FAILED.
 * 6. Host Game Authority Invariant: zero mutations on host transforms, physics, or ground truth.
 *
 * Hard Rule 9 Compliant: standalone deterministic script; no automated test framework.
 */

import { FearServer } from '../../packages/runtime/src/FearServer.js';
import { ERROR_CODES, MESSAGE_TYPES } from '../../packages/protocol/index.js';

function assert(condition, message) {
    if (!condition) {
        console.error(`FAIL: ${message}`);
        throw new Error(message);
    }
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
    console.log('VERIFY FEAR SERVER EPISTEMIC BELIEF CONTROL PLANE');
    console.log('============================================================\n');

    // -------------------------------------------------------------------------
    // 1. Opt-In Boundary: Disabled by Default
    // -------------------------------------------------------------------------
    console.log('--- Suite 1: Opt-in boundary when services are disabled ---');
    const defaultServer = new FearServer({ seed: 12345 });
    const wsDefault = makeWs();

    // Handshake check
    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.HANDSHAKE_REQUEST,
        client_id: 'test-client'
    });
    const handshakeDefault = latest(wsDefault);
    assert(handshakeDefault.type === MESSAGE_TYPES.HANDSHAKE_RESPONSE, 'Handshake must succeed on default server');
    assert(handshakeDefault.epistemic_belief === false, 'Default server must advertise epistemic_belief: false');
    console.log('  * Default server WS advertises epistemic_belief: false: PASS');

    // HTTP Handshake check
    const httpHandshake = makeResponse();
    defaultServer._routeHttpPost('/api/v1/handshake', { client_id: 'http-client' }, httpHandshake);
    assert(httpHandshake.status === 200, 'HTTP handshake must return 200');
    assert(httpHandshake.body.epistemic_belief === false, 'HTTP handshake must advertise epistemic_belief: false');
    console.log('  * Default server HTTP handshake advertises epistemic_belief: false: PASS');

    // WebSocket epistemic routes refuse cleanly
    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.EPISTEMIC_OBSERVE_REQUEST,
        agentId: 'scout_1',
        observations: { threats: [{ id: 't1' }] }
    });
    assert(latest(wsDefault).type === MESSAGE_TYPES.ERROR_RESPONSE, 'EPISTEMIC_OBSERVE on disabled server must error');
    assert(latest(wsDefault).code === ERROR_CODES.EPISTEMIC_BELIEF_DISABLED, 'Code must be EPISTEMIC_BELIEF_DISABLED');

    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.EPISTEMIC_RUMOR_REQUEST,
        agentId: 'medic_1',
        message: { category: 'threat', id: 'rumor_t1' },
        senderTrust: 0.8
    });
    assert(latest(wsDefault).code === ERROR_CODES.EPISTEMIC_BELIEF_DISABLED, 'EPISTEMIC_RUMOR on disabled server must error');

    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.EPISTEMIC_DISCREPANCY_QUERY_REQUEST,
        agentId: 'scout_1',
        worldGroundTruth: {}
    });
    assert(latest(wsDefault).code === ERROR_CODES.EPISTEMIC_BELIEF_DISABLED, 'EPISTEMIC_DISCREPANCY on disabled server must error');

    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.EPISTEMIC_SUBJECTIVE_QUERY_REQUEST,
        agentId: 'scout_1'
    });
    assert(latest(wsDefault).code === ERROR_CODES.EPISTEMIC_BELIEF_DISABLED, 'EPISTEMIC_SUBJECTIVE on disabled server must error');
    console.log('  * WebSocket epistemic routes refuse with EPISTEMIC_BELIEF_DISABLED: PASS');

    // HTTP epistemic routes refuse cleanly
    const httpEpistemicObs = makeResponse();
    defaultServer._routeHttpPost('/api/v1/epistemic/observe', { agentId: 'scout_1' }, httpEpistemicObs);
    assert(httpEpistemicObs.status === 400, 'HTTP /api/v1/epistemic/observe must return 400');
    assert(httpEpistemicObs.body.code === ERROR_CODES.EPISTEMIC_BELIEF_DISABLED, 'Code must be EPISTEMIC_BELIEF_DISABLED');

    const httpEpistemicRumor = makeResponse();
    defaultServer._routeHttpPost('/api/v1/epistemic/rumor', {
        agentId: 'medic_1',
        message: { category: 'threat', id: 'rumor_1' }
    }, httpEpistemicRumor);
    assert(httpEpistemicRumor.status === 400, 'HTTP /api/v1/epistemic/rumor must return 400');
    assert(httpEpistemicRumor.body.code === ERROR_CODES.EPISTEMIC_BELIEF_DISABLED, 'Code must be EPISTEMIC_BELIEF_DISABLED');

    const httpEpistemicDiscrepancy = makeResponse();
    defaultServer._routeHttpPost('/api/v1/epistemic/discrepancy/query', { agentId: 'scout_1' }, httpEpistemicDiscrepancy);
    assert(httpEpistemicDiscrepancy.status === 400, 'HTTP /api/v1/epistemic/discrepancy/query must return 400');
    assert(httpEpistemicDiscrepancy.body.code === ERROR_CODES.EPISTEMIC_BELIEF_DISABLED, 'Code must be EPISTEMIC_BELIEF_DISABLED');

    const httpEpistemicSubjective = makeResponse();
    defaultServer._routeHttpPost('/api/v1/epistemic/subjective/query', { agentId: 'scout_1' }, httpEpistemicSubjective);
    assert(httpEpistemicSubjective.status === 400, 'HTTP /api/v1/epistemic/subjective/query must return 400');
    assert(httpEpistemicSubjective.body.code === ERROR_CODES.EPISTEMIC_BELIEF_DISABLED, 'Code must be EPISTEMIC_BELIEF_DISABLED');
    console.log('  * HTTP epistemic routes refuse with EPISTEMIC_BELIEF_DISABLED: PASS');

    // -------------------------------------------------------------------------
    // 2. Active Server Handshake Contract
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 2: Active server handshake contract ---');
    const activeServer = new FearServer({
        seed: 54321,
        enableEpistemicBelief: true
    });
    const wsActive = makeWs();

    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.HANDSHAKE_REQUEST,
        client_id: 'active-client'
    });
    const handshakeActive = latest(wsActive);
    assert(handshakeActive.type === MESSAGE_TYPES.HANDSHAKE_RESPONSE, 'Active handshake must succeed');
    assert(handshakeActive.epistemic_belief === true, 'Active server WS must advertise epistemic_belief: true');

    const httpHandshakeActive = makeResponse();
    activeServer._routeHttpPost('/api/v1/handshake', { client_id: 'active-http' }, httpHandshakeActive);
    assert(httpHandshakeActive.status === 200, 'Active HTTP handshake must succeed');
    assert(httpHandshakeActive.body.epistemic_belief === true, 'Active server HTTP must advertise epistemic_belief: true');
    console.log('  * Active server advertises epistemic_belief: true on WS and HTTP: PASS');

    // -------------------------------------------------------------------------
    // 3. Active Server: WebSocket Epistemic Lifecycle
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 3: WebSocket Epistemic Lifecycle ---');

    // Register test agents
    activeServer.simulation.registerAgent('scout', {
        neuroticism: 0.8,
        resilience: 0.2,
        openness: 0.7
    }, { initial_position: { x: 0, y: 0, z: 0 } });

    activeServer.simulation.registerAgent('medic', {
        neuroticism: 0.3,
        resilience: 0.8,
        openness: 0.4
    }, { initial_position: { x: 10, y: 0, z: 0 } });

    // 3a. Record Direct Observation via WebSocket
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.EPISTEMIC_OBSERVE_REQUEST,
        agentId: 'scout',
        observations: {
            threats: [
                { id: 'stalker_alpha', x: 2, y: 0, z: 0, distance: 3.5, intensity: 0.85 }
            ]
        }
    });
    const wsObs = latest(wsActive);
    assert(wsObs.type === MESSAGE_TYPES.EPISTEMIC_OBSERVE_RESPONSE, 'Response must be EPISTEMIC_OBSERVE_RESPONSE');
    assert(wsObs.status === 'OBSERVED', 'Status must be OBSERVED');
    assert(wsObs.agentId === 'scout', 'agentId must match scout');
    assert(wsObs.believedThreatsCount === 1, 'believedThreatsCount must be 1');
    console.log('  * WebSocket observe direct perception: PASS');

    // 3b. Ingest Rumor via WebSocket
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.EPISTEMIC_RUMOR_REQUEST,
        agentId: 'medic',
        message: {
            category: 'threat',
            id: 'stalker_alpha',
            threat: { id: 'stalker_alpha', x: 2, y: 0, z: 0, distance: 3.5, intensity: 0.85 },
            hops: 1
        },
        senderTrust: 0.80
    });
    const wsRumor = latest(wsActive);
    assert(wsRumor.type === MESSAGE_TYPES.EPISTEMIC_RUMOR_RESPONSE, 'Response must be EPISTEMIC_RUMOR_RESPONSE');
    assert(wsRumor.status === 'INGESTED', 'Status must be INGESTED');
    assert(wsRumor.agentId === 'medic', 'agentId must match medic');
    assert(wsRumor.messageId === 'stalker_alpha', 'messageId must match stalker_alpha');
    assert(wsRumor.belief !== null, 'Belief must be formed');
    assert(wsRumor.belief.confidence > 0.5, 'Rumor belief confidence must reflect trust * decay');
    console.log('  * WebSocket rumor ingestion: PASS');

    // 3c. Evaluate Epistemic Discrepancy Query via WebSocket
    // Scout believes stalker_alpha is present. Ground truth is empty -> false positive (paranoia)
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.EPISTEMIC_DISCREPANCY_QUERY_REQUEST,
        agentId: 'scout',
        worldGroundTruth: {
            activeThreats: []
        }
    });
    const wsDiscrepancy = latest(wsActive);
    assert(wsDiscrepancy.type === MESSAGE_TYPES.EPISTEMIC_DISCREPANCY_QUERY_RESPONSE, 'Response must be EPISTEMIC_DISCREPANCY_QUERY_RESPONSE');
    assert(wsDiscrepancy.agentId === 'scout', 'agentId must match scout');
    assert(wsDiscrepancy.discrepancy.falsePositives.length === 1, 'Scout must have 1 false positive threat');
    assert(wsDiscrepancy.discrepancy.paranoiaScore > 0, 'Scout should have positive paranoia score (ghost threat)');
    assert(wsDiscrepancy.discrepancy.isOmniscient === false, 'Scout is not omniscient');
    console.log('  * WebSocket discrepancy query: PASS');

    // 3d. Subjective Perception Query via WebSocket
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.EPISTEMIC_SUBJECTIVE_QUERY_REQUEST,
        agentId: 'scout'
    });
    const wsSubjective = latest(wsActive);
    assert(wsSubjective.type === MESSAGE_TYPES.EPISTEMIC_SUBJECTIVE_QUERY_RESPONSE, 'Response must be EPISTEMIC_SUBJECTIVE_QUERY_RESPONSE');
    assert(wsSubjective.agentId === 'scout', 'agentId must match scout');
    assert(Array.isArray(wsSubjective.subjectiveObservations.threats), 'subjective threats must be array');
    assert(wsSubjective.subjectiveObservations.threats.length === 1, 'Scout must perceive 1 subjective threat');
    console.log('  * WebSocket subjective perception query: PASS');

    // -------------------------------------------------------------------------
    // 4. HTTP REST Route Parity
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 4: HTTP REST route parity ---');

    activeServer.simulation.registerAgent('captain', {
        neuroticism: 0.1,
        resilience: 0.9,
        openness: 0.2
    }, { initial_position: { x: 20, y: 0, z: 0 } });

    // 4a. HTTP Observe
    const httpResObs = makeResponse();
    activeServer._routeHttpPost('/api/v1/epistemic/observe', {
        agentId: 'captain',
        observations: {
            threats: [
                { id: 'apex_stalker', x: 22, y: 0, z: 0, distance: 2.0, intensity: 0.95 }
            ]
        }
    }, httpResObs);
    assert(httpResObs.status === 200, 'HTTP observe must return 200');
    assert(httpResObs.body.type === MESSAGE_TYPES.EPISTEMIC_OBSERVE_RESPONSE, 'Type must match');
    assert(httpResObs.body.status === 'OBSERVED', 'Status must be OBSERVED');
    assert(httpResObs.body.agentId === 'captain', 'agentId must match');
    assert(httpResObs.body.believedThreatsCount === 1, 'Captain must believe 1 threat');

    // 4b. HTTP Rumor
    const httpResRumor = makeResponse();
    activeServer._routeHttpPost('/api/v1/epistemic/rumor', {
        agentId: 'captain',
        message: {
            category: 'route',
            id: 'safe_passage_north',
            route: { id: 'safe_passage_north', status: 'CLEAR', danger: 0.05 },
            hops: 2
        },
        senderTrust: 0.90
    }, httpResRumor);
    assert(httpResRumor.status === 200, 'HTTP rumor must return 200');
    assert(httpResRumor.body.type === MESSAGE_TYPES.EPISTEMIC_RUMOR_RESPONSE, 'Type must match');
    assert(httpResRumor.body.status === 'INGESTED', 'Status must be INGESTED');
    assert(httpResRumor.body.messageId === 'safe_passage_north', 'messageId must match');
    assert(httpResRumor.body.belief !== null, 'Route belief must be formed');

    // 4c. HTTP Discrepancy Query
    const httpResDiscrepancy = makeResponse();
    activeServer._routeHttpPost('/api/v1/epistemic/discrepancy/query', {
        agentId: 'captain',
        worldGroundTruth: {
            activeThreats: [
                { id: 'apex_stalker', x: 22, y: 0, z: 0, distance: 2.0, intensity: 0.95 }
            ]
        }
    }, httpResDiscrepancy);
    assert(httpResDiscrepancy.status === 200, 'HTTP discrepancy query must return 200');
    assert(httpResDiscrepancy.body.type === MESSAGE_TYPES.EPISTEMIC_DISCREPANCY_QUERY_RESPONSE, 'Type must match');
    assert(httpResDiscrepancy.body.discrepancy.falsePositives.length === 0, 'No false positives for confirmed threat');
    assert(httpResDiscrepancy.body.discrepancy.falseNegatives.length === 0, 'No false negatives');
    assert(httpResDiscrepancy.body.discrepancy.paranoiaScore === 0, 'Captain has zero paranoia');
    assert(httpResDiscrepancy.body.discrepancy.complacencyScore === 0, 'Captain has zero complacency');
    assert(httpResDiscrepancy.body.discrepancy.isOmniscient === true, 'Accurately tracked threat is omniscient');

    // 4d. HTTP Subjective Query
    const httpResSubjective = makeResponse();
    activeServer._routeHttpPost('/api/v1/epistemic/subjective/query', {
        agentId: 'captain'
    }, httpResSubjective);
    assert(httpResSubjective.status === 200, 'HTTP subjective query must return 200');
    assert(httpResSubjective.body.type === MESSAGE_TYPES.EPISTEMIC_SUBJECTIVE_QUERY_RESPONSE, 'Type must match');
    assert(httpResSubjective.body.subjectiveObservations.threats.length === 1, 'Captain perceives 1 threat');

    // 4e. Unknown agent returns 400 SIMULATION_ERROR
    const httpResUnknown = makeResponse();
    activeServer._routeHttpPost('/api/v1/epistemic/observe', {
        agentId: 'phantom_scout'
    }, httpResUnknown);
    assert(httpResUnknown.status === 400, 'Unknown agent must return 400');
    assert(httpResUnknown.body.code === ERROR_CODES.SIMULATION_ERROR, 'Code must be SIMULATION_ERROR');
    assert(/UNKNOWN_AGENT/.test(httpResUnknown.body.error), 'Error must mention UNKNOWN_AGENT');
    console.log('  * HTTP REST epistemic routes match WebSocket semantics: PASS');

    // -------------------------------------------------------------------------
    // 5. Validation Failure Boundaries
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 5: Validation Failure Boundaries ---');

    // Missing agentId in observe
    const resBad1 = makeResponse();
    activeServer._routeHttpPost('/api/v1/epistemic/observe', {}, resBad1);
    assert(resBad1.status === 400, 'Empty observe body must return 400');
    assert(resBad1.body.code === ERROR_CODES.VALIDATION_FAILED, 'Code must be VALIDATION_FAILED');

    // Missing message in rumor
    const resBad2 = makeResponse();
    activeServer._routeHttpPost('/api/v1/epistemic/rumor', { agentId: 'scout' }, resBad2);
    assert(resBad2.status === 400, 'Missing rumor message must return 400');
    assert(resBad2.body.code === ERROR_CODES.VALIDATION_FAILED, 'Code must be VALIDATION_FAILED');

    // Malformed rumor message (missing category or id)
    const resBad3 = makeResponse();
    activeServer._routeHttpPost('/api/v1/epistemic/rumor', {
        agentId: 'scout',
        message: { invalidPayload: true }
    }, resBad3);
    assert(resBad3.status === 400, 'Malformed message must return 400');
    assert(resBad3.body.code === ERROR_CODES.VALIDATION_FAILED, 'Code must be VALIDATION_FAILED');

    // Missing agentId in subjective query
    const resBad4 = makeResponse();
    activeServer._routeHttpPost('/api/v1/epistemic/subjective/query', {}, resBad4);
    assert(resBad4.status === 400, 'Missing agentId must return 400');
    assert(resBad4.body.code === ERROR_CODES.VALIDATION_FAILED, 'Code must be VALIDATION_FAILED');

    // WebSocket validation failure (missing agentId in discrepancy query)
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.EPISTEMIC_DISCREPANCY_QUERY_REQUEST
    });
    const wsBad = latest(wsActive);
    assert(wsBad.type === MESSAGE_TYPES.ERROR_RESPONSE, 'Malformed WS request must return ERROR_RESPONSE');
    assert(wsBad.code === ERROR_CODES.VALIDATION_FAILED, 'Code must be VALIDATION_FAILED');
    console.log('  * Validation failures rejected cleanly with 400 VALIDATION_FAILED: PASS');

    // -------------------------------------------------------------------------
    // 6. Host Game Authority & Immutability Invariant
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 6: Host Game Authority & Immutability Invariant ---');

    const mockHostEntity = {
        id: 'host_actor_alpha',
        x: 10,
        y: 0,
        z: -5,
        transform: { position: { x: 10, y: 0, z: -5 }, rotation: { yaw: 90 } },
        physics: { velocity: { vx: 0, vy: 0, vz: 0 }, mass: 75.0 },
        vitalStatus: 'ALIVE'
    };
    const mockGroundTruth = {
        threats: [
            { id: 'stalker_alpha', x: 2, y: 0, z: 0, distance: 3.5 }
        ],
        routes: [
            { id: 'safe_passage_north', status: 'CLEAR', danger: 0.05 }
        ]
    };

    const immutabilityAudit = activeServer.simulation.auditEpistemicImmutability(mockHostEntity, mockGroundTruth);
    assert(immutabilityAudit.intact === true, 'Host entity and world ground truth must remain 100% intact');
    assert(immutabilityAudit.physicsMutations === 0, 'Host physics mutations must be 0');
    assert(immutabilityAudit.transformMutations === 0, 'Host transform mutations must be 0');
    assert(immutabilityAudit.worldTruthMutations === 0, 'Host world truth mutations must be 0');
    console.log('  * Host Game Authority Invariant strictly preserved (0 physics/transform/world truth mutations): PASS');

    console.log('\n============================================================');
    console.log('ALL FEAR SERVER EPISTEMIC BELIEF CHECKS PASSED');
    console.log('============================================================');
}

main().catch((err) => {
    console.error('PROBE FAILED:', err);
    process.exit(1);
});
