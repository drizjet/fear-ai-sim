/**
 * tools/verification/verify_server_persona_signatures.mjs
 *
 * Verifies FearServer WebSocket and HTTP REST control plane contracts for
 * the opt-in Tier 2 Functional Persona Signatures (FABE) Engine (Step 10 of Master Unification):
 *
 * Suites:
 * 1. Opt-in boundaries: when enablePersonaSignatures is false (default),
 *    all persona routes (WebSocket + HTTP) refuse cleanly with PERSONA_SIGNATURES_DISABLED error codes.
 * 2. Handshake contract: advertises persona_signatures boolean matching server options.
 * 3. WebSocket persona lifecycle: query signatures (curves + AUC across 11 functions),
 *    evaluate response reactions at probe values, compute pairwise Euclidean distances,
 *    identify nearest matching persona in population, and evaluate population collapse score.
 * 4. HTTP REST route parity: /api/v1/persona/signature/query, /api/v1/persona/reaction/query,
 *    /api/v1/persona/distance/query, /api/v1/persona/identify, /api/v1/persona/collapse/query.
 * 5. Validation failure boundaries: missing or malformed fields rejected with VALIDATION_FAILED.
 * 6. Host Game Authority Invariant: zero mutations on host transforms, physics, or entity states.
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
    console.log('VERIFY FEAR SERVER FUNCTIONAL PERSONA SIGNATURES CONTROL PLANE');
    console.log('============================================================\n');

    // -------------------------------------------------------------------------
    // 1. Opt-In Boundary: Disabled by Default
    // -------------------------------------------------------------------------
    console.log('--- Suite 1: Opt-in boundary when services are disabled ---');
    const defaultServer = new FearServer({ seed: 12345 });
    const wsDefault = makeWs();

    // Handshake check on default server
    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.HANDSHAKE_REQUEST,
        client_id: 'test-client'
    });
    const handshakeDefault = latest(wsDefault);
    assert(handshakeDefault.type === MESSAGE_TYPES.HANDSHAKE_RESPONSE, 'Handshake must succeed on default server');
    assert(handshakeDefault.persona_signatures === false, 'Default server must advertise persona_signatures: false');
    console.log('  * Default server WS advertises persona_signatures: false: PASS');

    // HTTP Handshake check
    const httpHandshake = makeResponse();
    defaultServer._routeHttpPost('/api/v1/handshake', { client_id: 'http-client' }, httpHandshake);
    assert(httpHandshake.status === 200, 'HTTP handshake must return 200');
    assert(httpHandshake.body.persona_signatures === false, 'HTTP handshake must advertise persona_signatures: false');
    console.log('  * Default server HTTP handshake advertises persona_signatures: false: PASS');

    // WebSocket persona routes refuse cleanly
    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.PERSONA_SIGNATURE_QUERY_REQUEST,
        agentId: 'agent_1'
    });
    assert(latest(wsDefault).type === MESSAGE_TYPES.ERROR_RESPONSE, 'PERSONA_SIGNATURE_QUERY on disabled server must error');
    assert(latest(wsDefault).code === ERROR_CODES.PERSONA_SIGNATURES_DISABLED, 'Code must be PERSONA_SIGNATURES_DISABLED');

    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.PERSONA_REACTION_QUERY_REQUEST,
        agentId: 'agent_1',
        probeValue: 0.5
    });
    assert(latest(wsDefault).code === ERROR_CODES.PERSONA_SIGNATURES_DISABLED, 'PERSONA_REACTION_QUERY on disabled server must error');

    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.PERSONA_DISTANCE_QUERY_REQUEST,
        agentIdA: 'agent_1',
        agentIdB: 'agent_2'
    });
    assert(latest(wsDefault).code === ERROR_CODES.PERSONA_SIGNATURES_DISABLED, 'PERSONA_DISTANCE_QUERY on disabled server must error');

    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.PERSONA_IDENTIFY_REQUEST,
        agentId: 'agent_1',
        candidateIds: ['agent_2']
    });
    assert(latest(wsDefault).code === ERROR_CODES.PERSONA_SIGNATURES_DISABLED, 'PERSONA_IDENTIFY on disabled server must error');

    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.PERSONA_COLLAPSE_QUERY_REQUEST,
        agentId: 'agent_1'
    });
    assert(latest(wsDefault).code === ERROR_CODES.PERSONA_SIGNATURES_DISABLED, 'PERSONA_COLLAPSE_QUERY on disabled server must error');
    console.log('  * WebSocket persona routes refuse with PERSONA_SIGNATURES_DISABLED: PASS');

    // HTTP persona routes refuse cleanly
    const httpPersonaSig = makeResponse();
    defaultServer._routeHttpPost('/api/v1/persona/signature/query', { agentId: 'agent_1' }, httpPersonaSig);
    assert(httpPersonaSig.status === 400, 'HTTP /api/v1/persona/signature/query must return 400');
    assert(httpPersonaSig.body.code === ERROR_CODES.PERSONA_SIGNATURES_DISABLED, 'Code must be PERSONA_SIGNATURES_DISABLED');

    const httpPersonaReact = makeResponse();
    defaultServer._routeHttpPost('/api/v1/persona/reaction/query', { agentId: 'agent_1', probeValue: 0.5 }, httpPersonaReact);
    assert(httpPersonaReact.status === 400, 'HTTP /api/v1/persona/reaction/query must return 400');
    assert(httpPersonaReact.body.code === ERROR_CODES.PERSONA_SIGNATURES_DISABLED, 'Code must be PERSONA_SIGNATURES_DISABLED');

    const httpPersonaDist = makeResponse();
    defaultServer._routeHttpPost('/api/v1/persona/distance/query', { agentIdA: 'agent_1', agentIdB: 'agent_2' }, httpPersonaDist);
    assert(httpPersonaDist.status === 400, 'HTTP /api/v1/persona/distance/query must return 400');
    assert(httpPersonaDist.body.code === ERROR_CODES.PERSONA_SIGNATURES_DISABLED, 'Code must be PERSONA_SIGNATURES_DISABLED');

    const httpPersonaIdent = makeResponse();
    defaultServer._routeHttpPost('/api/v1/persona/identify', { agentId: 'agent_1', candidateIds: ['agent_2'] }, httpPersonaIdent);
    assert(httpPersonaIdent.status === 400, 'HTTP /api/v1/persona/identify must return 400');
    assert(httpPersonaIdent.body.code === ERROR_CODES.PERSONA_SIGNATURES_DISABLED, 'Code must be PERSONA_SIGNATURES_DISABLED');

    const httpPersonaCollapse = makeResponse();
    defaultServer._routeHttpPost('/api/v1/persona/collapse/query', { agentId: 'agent_1' }, httpPersonaCollapse);
    assert(httpPersonaCollapse.status === 400, 'HTTP /api/v1/persona/collapse/query must return 400');
    assert(httpPersonaCollapse.body.code === ERROR_CODES.PERSONA_SIGNATURES_DISABLED, 'Code must be PERSONA_SIGNATURES_DISABLED');
    console.log('  * HTTP persona routes refuse with PERSONA_SIGNATURES_DISABLED: PASS');

    // -------------------------------------------------------------------------
    // 2. Active Server Handshake Contract
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 2: Active server handshake contract ---');
    const activeServer = new FearServer({
        seed: 54321,
        enablePersonaSignatures: true
    });
    const wsActive = makeWs();

    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.HANDSHAKE_REQUEST,
        client_id: 'active-client'
    });
    const handshakeActive = latest(wsActive);
    assert(handshakeActive.type === MESSAGE_TYPES.HANDSHAKE_RESPONSE, 'Active handshake must succeed');
    assert(handshakeActive.persona_signatures === true, 'Active server WS must advertise persona_signatures: true');

    const httpHandshakeActive = makeResponse();
    activeServer._routeHttpPost('/api/v1/handshake', { client_id: 'active-http' }, httpHandshakeActive);
    assert(httpHandshakeActive.status === 200, 'Active HTTP handshake must succeed');
    assert(httpHandshakeActive.body.persona_signatures === true, 'Active server HTTP must advertise persona_signatures: true');
    console.log('  * Active server advertises persona_signatures: true on WS and HTTP: PASS');

    // -------------------------------------------------------------------------
    // 3. Active Server: WebSocket Persona Lifecycle
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 3: WebSocket Persona Lifecycle ---');

    // Register test agents
    activeServer.simulation.registerAgent('coward', {
        neuroticism: 0.95,
        resilience: 0.05,
        agreeableness: 0.2
    }, { initial_position: { x: 0, y: 0, z: 0 } });

    activeServer.simulation.registerAgent('hero', {
        neuroticism: 0.05,
        resilience: 0.95,
        agreeableness: 0.8
    }, { initial_position: { x: 10, y: 0, z: 0 } });

    activeServer.simulation.registerAgent('average', {
        neuroticism: 0.5,
        resilience: 0.5,
        agreeableness: 0.5
    }, { initial_position: { x: 20, y: 0, z: 0 } });

    activeServer.simulation.registerAgent('coward_clone', {
        neuroticism: 0.92,
        resilience: 0.08,
        agreeableness: 0.25
    }, { initial_position: { x: 30, y: 0, z: 0 } });

    // 3a. Query Persona Signature via WebSocket
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.PERSONA_SIGNATURE_QUERY_REQUEST,
        agentId: 'coward'
    });
    const wsSig = latest(wsActive);
    assert(wsSig.type === MESSAGE_TYPES.PERSONA_SIGNATURE_QUERY_RESPONSE, 'Response must be PERSONA_SIGNATURE_QUERY_RESPONSE');
    assert(wsSig.agentId === 'coward', 'agentId must match coward');
    assert(wsSig.curves && typeof wsSig.curves === 'object', 'curves must be an object');
    assert(Object.keys(wsSig.curves).length === 11, 'Signature curves must include 11 response functions');
    assert(wsSig.auc && typeof wsSig.auc === 'object', 'auc must be an object');
    assert(Object.keys(wsSig.auc).length === 11, 'AUC table must include 11 response functions');
    console.log('  * WebSocket query persona signature (curves + AUC across 11 functions): PASS');

    // 3b. Query Persona Reaction via WebSocket
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.PERSONA_REACTION_QUERY_REQUEST,
        agentId: 'coward',
        probeValue: 0.7
    });
    const wsReact = latest(wsActive);
    assert(wsReact.type === MESSAGE_TYPES.PERSONA_REACTION_QUERY_RESPONSE, 'Response must be PERSONA_REACTION_QUERY_RESPONSE');
    assert(wsReact.agentId === 'coward', 'agentId must match coward');
    assert(wsReact.probeValue === 0.7, 'probeValue must match 0.7');
    assert(wsReact.reactions && typeof wsReact.reactions === 'object', 'reactions must be an object');
    assert(Object.keys(wsReact.reactions).length === 11, 'reactions must include 11 functions');
    assert(wsReact.reactions.panicThreat > 0.5, 'Coward should show elevated panic threat');
    console.log('  * WebSocket query persona reaction at probe value 0.7: PASS');

    // 3c. Query Persona Distance via WebSocket
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.PERSONA_DISTANCE_QUERY_REQUEST,
        agentIdA: 'coward',
        agentIdB: 'hero'
    });
    const wsDist = latest(wsActive);
    assert(wsDist.type === MESSAGE_TYPES.PERSONA_DISTANCE_QUERY_RESPONSE, 'Response must be PERSONA_DISTANCE_QUERY_RESPONSE');
    assert(wsDist.agentIdA === 'coward', 'agentIdA must match coward');
    assert(wsDist.agentIdB === 'hero', 'agentIdB must match hero');
    assert(typeof wsDist.distance === 'number' && wsDist.distance > 0.2, 'Coward and Hero distance must be > 0.2');
    console.log('  * WebSocket query persona distance: PASS');

    // 3d. Identify Nearest Persona via WebSocket
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.PERSONA_IDENTIFY_REQUEST,
        agentId: 'coward',
        candidateIds: ['hero', 'average', 'coward_clone']
    });
    const wsIdent = latest(wsActive);
    assert(wsIdent.type === MESSAGE_TYPES.PERSONA_IDENTIFY_RESPONSE, 'Response must be PERSONA_IDENTIFY_RESPONSE');
    assert(wsIdent.agentId === 'coward', 'agentId must match coward');
    assert(wsIdent.predictedId === 'coward_clone', `Expected coward to identify with coward_clone, got ${wsIdent.predictedId}`);
    assert(wsIdent.margin > 0, 'Identification margin must be positive');
    assert(wsIdent.strongestDiscriminator && typeof wsIdent.strongestDiscriminator.function === 'string', 'strongestDiscriminator function missing');
    console.log('  * WebSocket identify nearest persona: PASS');

    // 3e. Evaluate Persona Collapse via WebSocket
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.PERSONA_COLLAPSE_QUERY_REQUEST,
        agentId: 'coward'
    });
    const wsCollapse = latest(wsActive);
    assert(wsCollapse.type === MESSAGE_TYPES.PERSONA_COLLAPSE_QUERY_RESPONSE, 'Response must be PERSONA_COLLAPSE_QUERY_RESPONSE');
    assert(wsCollapse.agentId === 'coward', 'agentId must match coward');
    assert(typeof wsCollapse.collapseScore === 'number' && wsCollapse.collapseScore >= 0 && wsCollapse.collapseScore <= 1, 'collapseScore must be in [0, 1]');
    assert(wsCollapse.populationSize === 4, `populationSize must match registered count 4, got ${wsCollapse.populationSize}`);
    console.log('  * WebSocket evaluate persona collapse: PASS');

    // -------------------------------------------------------------------------
    // 4. HTTP REST Route Parity
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 4: HTTP REST route parity ---');

    // 4a. HTTP Signature Query
    const httpResSig = makeResponse();
    activeServer._routeHttpPost('/api/v1/persona/signature/query', {
        agentId: 'hero'
    }, httpResSig);
    assert(httpResSig.status === 200, 'HTTP signature query must return 200');
    assert(httpResSig.body.type === MESSAGE_TYPES.PERSONA_SIGNATURE_QUERY_RESPONSE, 'Type must match');
    assert(httpResSig.body.agentId === 'hero', 'agentId must match');
    assert(Object.keys(httpResSig.body.curves).length === 11, 'Curves count must be 11');
    assert(Object.keys(httpResSig.body.auc).length === 11, 'AUC count must be 11');

    // 4b. HTTP Reaction Query
    const httpResReact = makeResponse();
    activeServer._routeHttpPost('/api/v1/persona/reaction/query', {
        agentId: 'hero',
        probeValue: 0.25
    }, httpResReact);
    assert(httpResReact.status === 200, 'HTTP reaction query must return 200');
    assert(httpResReact.body.type === MESSAGE_TYPES.PERSONA_REACTION_QUERY_RESPONSE, 'Type must match');
    assert(httpResReact.body.agentId === 'hero', 'agentId must match');
    assert(httpResReact.body.reactions.recoveryTime > 0.5, 'Hero should retain elevated recovery capability');
    assert(httpResReact.body.reactions.panicThreat < 0.2, 'Hero should show low panic threat at probe 0.25');

    // 4c. HTTP Distance Query
    const httpResDist = makeResponse();
    activeServer._routeHttpPost('/api/v1/persona/distance/query', {
        agentIdA: 'hero',
        agentIdB: 'average'
    }, httpResDist);
    assert(httpResDist.status === 200, 'HTTP distance query must return 200');
    assert(httpResDist.body.type === MESSAGE_TYPES.PERSONA_DISTANCE_QUERY_RESPONSE, 'Type must match');
    assert(httpResDist.body.distance > 0, 'Distance must be positive');

    // 4d. HTTP Identify Query
    const httpResIdent = makeResponse();
    activeServer._routeHttpPost('/api/v1/persona/identify', {
        agentId: 'hero',
        candidateIds: ['coward', 'coward_clone', 'average']
    }, httpResIdent);
    assert(httpResIdent.status === 200, 'HTTP identify must return 200');
    assert(httpResIdent.body.type === MESSAGE_TYPES.PERSONA_IDENTIFY_RESPONSE, 'Type must match');
    assert(httpResIdent.body.predictedId === 'average', `Expected hero to identify closer to average than coward, got ${httpResIdent.body.predictedId}`);

    // 4e. HTTP Collapse Query
    const httpResCollapse = makeResponse();
    activeServer._routeHttpPost('/api/v1/persona/collapse/query', {
        agentId: 'hero'
    }, httpResCollapse);
    assert(httpResCollapse.status === 200, 'HTTP collapse query must return 200');
    assert(httpResCollapse.body.type === MESSAGE_TYPES.PERSONA_COLLAPSE_QUERY_RESPONSE, 'Type must match');
    assert(httpResCollapse.body.collapseScore >= 0 && httpResCollapse.body.collapseScore <= 1, 'Collapse score in [0, 1]');

    // 4f. Unknown agent returns 400 SIMULATION_ERROR
    const httpResUnknown = makeResponse();
    activeServer._routeHttpPost('/api/v1/persona/signature/query', {
        agentId: 'phantom_agent'
    }, httpResUnknown);
    assert(httpResUnknown.status === 400, 'Unknown agent must return 400');
    assert(httpResUnknown.body.code === ERROR_CODES.SIMULATION_ERROR, 'Code must be SIMULATION_ERROR');
    assert(/UNKNOWN_AGENT/.test(httpResUnknown.body.error), 'Error must mention UNKNOWN_AGENT');
    console.log('  * HTTP REST persona routes match WebSocket semantics: PASS');

    // -------------------------------------------------------------------------
    // 5. Validation Failure Boundaries
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 5: Validation Failure Boundaries ---');

    // Missing agentId in signature query
    const resBad1 = makeResponse();
    activeServer._routeHttpPost('/api/v1/persona/signature/query', {}, resBad1);
    assert(resBad1.status === 400, 'Empty signature body must return 400');
    assert(resBad1.body.code === ERROR_CODES.VALIDATION_FAILED, 'Code must be VALIDATION_FAILED');

    // Missing agentId in reaction query
    const resBad2 = makeResponse();
    activeServer._routeHttpPost('/api/v1/persona/reaction/query', { probeValue: 0.5 }, resBad2);
    assert(resBad2.status === 400, 'Missing agentId in reaction query must return 400');
    assert(resBad2.body.code === ERROR_CODES.VALIDATION_FAILED, 'Code must be VALIDATION_FAILED');

    // Missing agentIdB in distance query
    const resBad3 = makeResponse();
    activeServer._routeHttpPost('/api/v1/persona/distance/query', { agentIdA: 'hero' }, resBad3);
    assert(resBad3.status === 400, 'Missing agentIdB must return 400');
    assert(resBad3.body.code === ERROR_CODES.VALIDATION_FAILED, 'Code must be VALIDATION_FAILED');

    // Invalid candidateIds in identify
    const resBad4 = makeResponse();
    activeServer._routeHttpPost('/api/v1/persona/identify', { agentId: 'hero', candidateIds: 'not-an-array' }, resBad4);
    assert(resBad4.status === 400, 'Invalid candidateIds must return 400');
    assert(resBad4.body.code === ERROR_CODES.VALIDATION_FAILED, 'Code must be VALIDATION_FAILED');

    // Invalid populationIds in collapse query
    const resBad5 = makeResponse();
    activeServer._routeHttpPost('/api/v1/persona/collapse/query', { agentId: 'hero', populationIds: 'invalid' }, resBad5);
    assert(resBad5.status === 400, 'Invalid populationIds must return 400');
    assert(resBad5.body.code === ERROR_CODES.VALIDATION_FAILED, 'Code must be VALIDATION_FAILED');

    // WebSocket validation failure (missing agentId in reaction query)
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.PERSONA_REACTION_QUERY_REQUEST
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
        id: 'host_actor_beta',
        x: 100,
        y: 0,
        z: -50,
        transform: { position: { x: 100, y: 0, z: -50 }, rotation: { yaw: 45 } },
        physics: { velocity: { vx: 0, vy: 0, vz: 0 }, mass: 80.0 },
        vitalStatus: 'ALIVE'
    };

    const immutabilityAudit = activeServer.simulation.auditPersonaSignaturesImmutability(mockHostEntity);
    assert(immutabilityAudit.intact === true, 'Host entity must remain 100% intact');
    assert(immutabilityAudit.physicsMutations === 0, 'Persona engine physics mutations must be 0');
    assert(immutabilityAudit.transformMutations === 0, 'Persona engine transform mutations must be 0');
    assert(immutabilityAudit.personaSignaturesClean === true, 'Persona signatures engine must report clean');
    console.log('  * Host Game Authority Invariant strictly preserved (0 host mutations): PASS');

    console.log('\n============================================================');
    console.log('ALL FEAR SERVER FUNCTIONAL PERSONA SIGNATURES CHECKS PASSED');
    console.log('============================================================');
}

main().catch((err) => {
    console.error('PROBE FAILED:', err);
    process.exit(1);
});
