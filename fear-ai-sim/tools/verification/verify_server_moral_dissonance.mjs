/**
 * tools/verification/verify_server_moral_dissonance.mjs
 *
 * Verifies FearServer WebSocket and HTTP REST control plane contracts for
 * the opt-in Tier 2 Moral Dissonance Engine (Step 8 of Master Unification):
 *
 * Suites:
 * 1. Opt-in boundaries: when enableMoralDissonance is false (default),
 *    all moral routes (WebSocket + HTTP) refuse cleanly with MORAL_DISSONANCE_DISABLED error codes.
 * 2. Handshake contract: advertises moral_dissonance boolean matching server options.
 * 3. WebSocket moral lifecycle: register profiles, query dissonance evaluation,
 *    record committed transgressions, record restorative atonements, evaluate order compliance,
 *    and query serializable moral states.
 * 4. HTTP REST route parity: /api/v1/moral/profile/register, /api/v1/moral/dissonance/query,
 *    /api/v1/moral/transgression, /api/v1/moral/atonement, /api/v1/moral/order/compliance,
 *    /api/v1/moral/state/query.
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
    console.log('VERIFY FEAR SERVER MORAL DISSONANCE CONTROL PLANE');
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
    assert(handshakeDefault.moral_dissonance === false, 'Default server must advertise moral_dissonance: false');
    console.log('  * Default server WS advertises moral_dissonance: false: PASS');

    // HTTP Handshake check
    const httpHandshake = makeResponse();
    defaultServer._routeHttpPost('/api/v1/handshake', { client_id: 'http-client' }, httpHandshake);
    assert(httpHandshake.status === 200, 'HTTP handshake must return 200');
    assert(httpHandshake.body.moral_dissonance === false, 'HTTP handshake must advertise moral_dissonance: false');
    console.log('  * Default server HTTP handshake advertises moral_dissonance: false: PASS');

    // WebSocket moral routes refuse cleanly
    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.MORAL_PROFILE_REGISTER_REQUEST,
        agentId: 'paladin_1',
        profile: 'AUTHORITARIAN'
    });
    assert(latest(wsDefault).type === MESSAGE_TYPES.ERROR_RESPONSE, 'MORAL_PROFILE_REGISTER on disabled server must error');
    assert(latest(wsDefault).code === ERROR_CODES.MORAL_DISSONANCE_DISABLED, 'Code must be MORAL_DISSONANCE_DISABLED');

    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.MORAL_DISSONANCE_QUERY_REQUEST,
        agentId: 'paladin_1',
        transgressionType: 'BETRAYAL'
    });
    assert(latest(wsDefault).code === ERROR_CODES.MORAL_DISSONANCE_DISABLED, 'MORAL_DISSONANCE_QUERY on disabled server must error');

    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.MORAL_TRANSGRESSION_REQUEST,
        agentId: 'paladin_1',
        transgressionType: 'HARM'
    });
    assert(latest(wsDefault).code === ERROR_CODES.MORAL_DISSONANCE_DISABLED, 'MORAL_TRANSGRESSION on disabled server must error');

    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.MORAL_ATONEMENT_REQUEST,
        agentId: 'paladin_1',
        atonementType: 'CONFESSION'
    });
    assert(latest(wsDefault).code === ERROR_CODES.MORAL_DISSONANCE_DISABLED, 'MORAL_ATONEMENT on disabled server must error');

    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.MORAL_ORDER_COMPLIANCE_REQUEST,
        agentId: 'paladin_1',
        proposedTransgression: 'DESERTION'
    });
    assert(latest(wsDefault).code === ERROR_CODES.MORAL_DISSONANCE_DISABLED, 'MORAL_ORDER_COMPLIANCE on disabled server must error');

    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.MORAL_STATE_QUERY_REQUEST,
        agentId: 'paladin_1'
    });
    assert(latest(wsDefault).code === ERROR_CODES.MORAL_DISSONANCE_DISABLED, 'MORAL_STATE_QUERY on disabled server must error');
    console.log('  * WebSocket moral routes refuse with MORAL_DISSONANCE_DISABLED: PASS');

    // HTTP moral routes refuse cleanly
    const httpMoralProfile = makeResponse();
    defaultServer._routeHttpPost('/api/v1/moral/profile/register', { agentId: 'paladin_1', profile: 'AUTHORITARIAN' }, httpMoralProfile);
    assert(httpMoralProfile.status === 400, 'HTTP /api/v1/moral/profile/register must return 400');
    assert(httpMoralProfile.body.code === ERROR_CODES.MORAL_DISSONANCE_DISABLED, 'Code must be MORAL_DISSONANCE_DISABLED');

    const httpMoralDissonance = makeResponse();
    defaultServer._routeHttpPost('/api/v1/moral/dissonance/query', { agentId: 'paladin_1', transgressionType: 'BETRAYAL' }, httpMoralDissonance);
    assert(httpMoralDissonance.status === 400, 'HTTP /api/v1/moral/dissonance/query must return 400');
    assert(httpMoralDissonance.body.code === ERROR_CODES.MORAL_DISSONANCE_DISABLED, 'Code must be MORAL_DISSONANCE_DISABLED');

    const httpMoralTransgression = makeResponse();
    defaultServer._routeHttpPost('/api/v1/moral/transgression', { agentId: 'paladin_1', transgressionType: 'HARM' }, httpMoralTransgression);
    assert(httpMoralTransgression.status === 400, 'HTTP /api/v1/moral/transgression must return 400');
    assert(httpMoralTransgression.body.code === ERROR_CODES.MORAL_DISSONANCE_DISABLED, 'Code must be MORAL_DISSONANCE_DISABLED');

    const httpMoralAtonement = makeResponse();
    defaultServer._routeHttpPost('/api/v1/moral/atonement', { agentId: 'paladin_1', atonementType: 'CONFESSION' }, httpMoralAtonement);
    assert(httpMoralAtonement.status === 400, 'HTTP /api/v1/moral/atonement must return 400');
    assert(httpMoralAtonement.body.code === ERROR_CODES.MORAL_DISSONANCE_DISABLED, 'Code must be MORAL_DISSONANCE_DISABLED');

    const httpMoralOrder = makeResponse();
    defaultServer._routeHttpPost('/api/v1/moral/order/compliance', { agentId: 'paladin_1', proposedTransgression: 'DESERTION' }, httpMoralOrder);
    assert(httpMoralOrder.status === 400, 'HTTP /api/v1/moral/order/compliance must return 400');
    assert(httpMoralOrder.body.code === ERROR_CODES.MORAL_DISSONANCE_DISABLED, 'Code must be MORAL_DISSONANCE_DISABLED');

    const httpMoralState = makeResponse();
    defaultServer._routeHttpPost('/api/v1/moral/state/query', { agentId: 'paladin_1' }, httpMoralState);
    assert(httpMoralState.status === 400, 'HTTP /api/v1/moral/state/query must return 400');
    assert(httpMoralState.body.code === ERROR_CODES.MORAL_DISSONANCE_DISABLED, 'Code must be MORAL_DISSONANCE_DISABLED');
    console.log('  * HTTP moral routes refuse with MORAL_DISSONANCE_DISABLED: PASS');

    // -------------------------------------------------------------------------
    // 2. Active Server Handshake Contract
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 2: Active server handshake contract ---');
    const activeServer = new FearServer({
        seed: 54321,
        enableMoralDissonance: true
    });
    const wsActive = makeWs();

    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.HANDSHAKE_REQUEST,
        client_id: 'active-client'
    });
    const handshakeActive = latest(wsActive);
    assert(handshakeActive.type === MESSAGE_TYPES.HANDSHAKE_RESPONSE, 'Active handshake must succeed');
    assert(handshakeActive.moral_dissonance === true, 'Active server WS must advertise moral_dissonance: true');

    const httpHandshakeActive = makeResponse();
    activeServer._routeHttpPost('/api/v1/handshake', { client_id: 'active-http' }, httpHandshakeActive);
    assert(httpHandshakeActive.status === 200, 'Active HTTP handshake must succeed');
    assert(httpHandshakeActive.body.moral_dissonance === true, 'Active server HTTP must advertise moral_dissonance: true');
    console.log('  * Active server advertises moral_dissonance: true on WS and HTTP: PASS');

    // -------------------------------------------------------------------------
    // 3. Active Server: WebSocket Moral Lifecycle
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 3: WebSocket Moral Lifecycle ---');

    // Register test agents
    activeServer.simulation.registerAgent('knight', {
        neuroticism: 0.2,
        resilience: 0.9,
        openness: 0.3
    }, { initial_position: { x: 0, y: 0, z: 0 } });

    activeServer.simulation.registerAgent('rebel', {
        neuroticism: 0.5,
        resilience: 0.6,
        openness: 0.8
    }, { initial_position: { x: 10, y: 0, z: 0 } });

    // 3a. Register Moral Profile via WebSocket
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.MORAL_PROFILE_REGISTER_REQUEST,
        agentId: 'knight',
        profile: 'AUTHORITARIAN'
    });
    const wsRegProfile = latest(wsActive);
    assert(wsRegProfile.type === MESSAGE_TYPES.MORAL_PROFILE_REGISTER_RESPONSE, 'Response must be MORAL_PROFILE_REGISTER_RESPONSE');
    assert(wsRegProfile.status === 'REGISTERED', 'Status must be REGISTERED');
    assert(wsRegProfile.agentId === 'knight', 'agentId must match knight');
    assert(wsRegProfile.profile.foundations.AUTHORITY === 0.30, 'Authoritarian profile authority must be 0.30');
    console.log('  * WebSocket register moral profile: PASS');

    // 3b. Query Moral Dissonance via WebSocket
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.MORAL_DISSONANCE_QUERY_REQUEST,
        agentId: 'knight',
        transgressionType: 'INSUBORDINATION',
        context: { isDirectOrder: true, orderAuthority: 0.9, fear: 0.2 }
    });
    const wsDissonance = latest(wsActive);
    assert(wsDissonance.type === MESSAGE_TYPES.MORAL_DISSONANCE_QUERY_RESPONSE, 'Response must be MORAL_DISSONANCE_QUERY_RESPONSE');
    assert(wsDissonance.agentId === 'knight', 'agentId must match knight');
    assert(wsDissonance.dissonance.rawDissonance > 0.5, 'Insubordination generates high raw dissonance for authoritarian');
    assert(wsDissonance.dissonance.netDissonance > 0, 'Net dissonance must be calculated');
    console.log('  * WebSocket query moral dissonance: PASS');

    // 3c. Record Moral Transgression via WebSocket
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.MORAL_TRANSGRESSION_REQUEST,
        agentId: 'knight',
        transgressionType: 'INSUBORDINATION',
        context: { necessity: 0.1 }
    });
    const wsTransgression = latest(wsActive);
    assert(wsTransgression.type === MESSAGE_TYPES.MORAL_TRANSGRESSION_RESPONSE, 'Response must be MORAL_TRANSGRESSION_RESPONSE');
    assert(wsTransgression.status === 'RECORDED', 'Status must be RECORDED');
    assert(wsTransgression.agentId === 'knight', 'agentId must match knight');
    assert(wsTransgression.transgression.currentGuilt > wsTransgression.transgression.previousGuilt, 'Guilt must increase after transgression');
    console.log('  * WebSocket record moral transgression: PASS');

    // 3d. Record Moral Atonement via WebSocket
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.MORAL_ATONEMENT_REQUEST,
        agentId: 'knight',
        atonementType: 'CONFESSION',
        context: { magnitude: 0.5 }
    });
    const wsAtonement = latest(wsActive);
    assert(wsAtonement.type === MESSAGE_TYPES.MORAL_ATONEMENT_RESPONSE, 'Response must be MORAL_ATONEMENT_RESPONSE');
    assert(wsAtonement.status === 'RECORDED', 'Status must be RECORDED');
    assert(wsAtonement.agentId === 'knight', 'agentId must match knight');
    assert(wsAtonement.atonement.currentGuilt < wsAtonement.atonement.previousGuilt, 'Guilt must decrease after atonement');
    console.log('  * WebSocket record moral atonement: PASS');

    // 3e. Evaluate Order Compliance via WebSocket
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.MORAL_ORDER_COMPLIANCE_REQUEST,
        agentId: 'knight',
        proposedTransgression: 'HARM',
        context: { orderAuthority: 0.95 }
    });
    const wsOrder = latest(wsActive);
    assert(wsOrder.type === MESSAGE_TYPES.MORAL_ORDER_COMPLIANCE_RESPONSE, 'Response must be MORAL_ORDER_COMPLIANCE_RESPONSE');
    assert(wsOrder.agentId === 'knight', 'agentId must match knight');
    assert(typeof wsOrder.compliance.willComply === 'boolean', 'willComply must be a boolean');
    assert(typeof wsOrder.compliance.refusalProbability === 'number', 'refusalProbability must be a number');
    console.log('  * WebSocket evaluate moral order compliance: PASS');

    // 3f. Query Moral State via WebSocket
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.MORAL_STATE_QUERY_REQUEST,
        agentId: 'knight'
    });
    const wsState = latest(wsActive);
    assert(wsState.type === MESSAGE_TYPES.MORAL_STATE_QUERY_RESPONSE, 'Response must be MORAL_STATE_QUERY_RESPONSE');
    assert(wsState.agentId === 'knight', 'agentId must match knight');
    assert(wsState.moralState.moralProfile === 'AUTHORITARIAN', 'Profile name must match');
    assert(Array.isArray(wsState.moralState.recentHistory), 'recentHistory must be an array');
    console.log('  * WebSocket query moral state: PASS');

    // -------------------------------------------------------------------------
    // 4. HTTP REST Route Parity
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 4: HTTP REST route parity ---');

    activeServer.simulation.registerAgent('cleric', {
        neuroticism: 0.1,
        resilience: 0.9,
        openness: 0.5
    }, { initial_position: { x: 20, y: 0, z: 0 } });

    // 4a. HTTP Profile Register
    const httpResReg = makeResponse();
    activeServer._routeHttpPost('/api/v1/moral/profile/register', {
        agentId: 'cleric',
        profile: 'ALTRUIST'
    }, httpResReg);
    assert(httpResReg.status === 200, 'HTTP profile register must return 200');
    assert(httpResReg.body.type === MESSAGE_TYPES.MORAL_PROFILE_REGISTER_RESPONSE, 'Type must match');
    assert(httpResReg.body.status === 'REGISTERED', 'Status must be REGISTERED');
    assert(httpResReg.body.agentId === 'cleric', 'agentId must match');
    assert(httpResReg.body.profile.foundations.CARE === 0.35, 'Altruist CARE foundation must be 0.35');

    // 4b. HTTP Dissonance Query
    const httpResDiss = makeResponse();
    activeServer._routeHttpPost('/api/v1/moral/dissonance/query', {
        agentId: 'cleric',
        transgressionType: 'HARM',
        context: { fear: 0.4, necessity: 0.2 }
    }, httpResDiss);
    assert(httpResDiss.status === 200, 'HTTP dissonance query must return 200');
    assert(httpResDiss.body.type === MESSAGE_TYPES.MORAL_DISSONANCE_QUERY_RESPONSE, 'Type must match');
    assert(httpResDiss.body.dissonance.rawDissonance > 0.4, 'HARM generates substantial raw dissonance for Altruist');

    // 4c. HTTP Transgression
    const httpResTrans = makeResponse();
    activeServer._routeHttpPost('/api/v1/moral/transgression', {
        agentId: 'cleric',
        transgressionType: 'HARM',
        context: { fear: 0.5 }
    }, httpResTrans);
    assert(httpResTrans.status === 200, 'HTTP transgression must return 200');
    assert(httpResTrans.body.type === MESSAGE_TYPES.MORAL_TRANSGRESSION_RESPONSE, 'Type must match');
    assert(httpResTrans.body.status === 'RECORDED', 'Status must be RECORDED');
    assert(httpResTrans.body.transgression.currentGuilt > 0, 'Current guilt must be positive');

    // 4d. HTTP Atonement
    const httpResAtone = makeResponse();
    activeServer._routeHttpPost('/api/v1/moral/atonement', {
        agentId: 'cleric',
        atonementType: 'REPARATION',
        context: { magnitude: 0.7 }
    }, httpResAtone);
    assert(httpResAtone.status === 200, 'HTTP atonement must return 200');
    assert(httpResAtone.body.type === MESSAGE_TYPES.MORAL_ATONEMENT_RESPONSE, 'Type must match');
    assert(httpResAtone.body.status === 'RECORDED', 'Status must be RECORDED');
    assert(httpResAtone.body.atonement.reliefAmount > 0, 'Relief amount must be positive');

    // 4e. HTTP Order Compliance
    const httpResOrder = makeResponse();
    activeServer._routeHttpPost('/api/v1/moral/order/compliance', {
        agentId: 'cleric',
        proposedTransgression: 'HARM',
        context: { orderAuthority: 0.3 }
    }, httpResOrder);
    assert(httpResOrder.status === 200, 'HTTP order compliance must return 200');
    assert(httpResOrder.body.type === MESSAGE_TYPES.MORAL_ORDER_COMPLIANCE_RESPONSE, 'Type must match');
    assert(httpResOrder.body.compliance.refusalProbability > 0.1, 'Altruist resists low-authority HARM order');

    // 4f. HTTP Moral State Query
    const httpResState = makeResponse();
    activeServer._routeHttpPost('/api/v1/moral/state/query', {
        agentId: 'cleric'
    }, httpResState);
    assert(httpResState.status === 200, 'HTTP state query must return 200');
    assert(httpResState.body.type === MESSAGE_TYPES.MORAL_STATE_QUERY_RESPONSE, 'Type must match');
    assert(httpResState.body.moralState.moralProfile === 'ALTRUIST', 'Profile must match ALTRUIST');

    // 4g. Unknown agent returns 400 SIMULATION_ERROR
    const httpResUnknown = makeResponse();
    activeServer._routeHttpPost('/api/v1/moral/dissonance/query', {
        agentId: 'phantom_paladin',
        transgressionType: 'BETRAYAL'
    }, httpResUnknown);
    assert(httpResUnknown.status === 400, 'Unknown agent must return 400');
    assert(httpResUnknown.body.code === ERROR_CODES.SIMULATION_ERROR, 'Code must be SIMULATION_ERROR');
    assert(/UNKNOWN_AGENT/.test(httpResUnknown.body.error), 'Error must mention UNKNOWN_AGENT');
    console.log('  * HTTP REST moral routes match WebSocket semantics: PASS');

    // -------------------------------------------------------------------------
    // 5. Validation Failure Boundaries
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 5: Validation Failure Boundaries ---');

    // Missing agentId in profile register
    const resBad1 = makeResponse();
    activeServer._routeHttpPost('/api/v1/moral/profile/register', {}, resBad1);
    assert(resBad1.status === 400, 'Empty register body must return 400');
    assert(resBad1.body.code === ERROR_CODES.VALIDATION_FAILED, 'Code must be VALIDATION_FAILED');

    // Missing transgressionType in dissonance query
    const resBad2 = makeResponse();
    activeServer._routeHttpPost('/api/v1/moral/dissonance/query', { agentId: 'knight' }, resBad2);
    assert(resBad2.status === 400, 'Missing transgressionType must return 400');
    assert(resBad2.body.code === ERROR_CODES.VALIDATION_FAILED, 'Code must be VALIDATION_FAILED');

    // Missing transgressionType in record transgression
    const resBad3 = makeResponse();
    activeServer._routeHttpPost('/api/v1/moral/transgression', { agentId: 'knight' }, resBad3);
    assert(resBad3.status === 400, 'Missing transgressionType in record must return 400');
    assert(resBad3.body.code === ERROR_CODES.VALIDATION_FAILED, 'Code must be VALIDATION_FAILED');

    // Missing atonementType in record atonement
    const resBad4 = makeResponse();
    activeServer._routeHttpPost('/api/v1/moral/atonement', { agentId: 'knight' }, resBad4);
    assert(resBad4.status === 400, 'Missing atonementType must return 400');
    assert(resBad4.body.code === ERROR_CODES.VALIDATION_FAILED, 'Code must be VALIDATION_FAILED');

    // Missing proposedTransgression in order compliance
    const resBad5 = makeResponse();
    activeServer._routeHttpPost('/api/v1/moral/order/compliance', { agentId: 'knight' }, resBad5);
    assert(resBad5.status === 400, 'Missing proposedTransgression must return 400');
    assert(resBad5.body.code === ERROR_CODES.VALIDATION_FAILED, 'Code must be VALIDATION_FAILED');

    // WebSocket validation failure (missing agentId in state query)
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.MORAL_STATE_QUERY_REQUEST
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

    const immutabilityAudit = activeServer.simulation.auditMoralImmutability(mockHostEntity);
    assert(immutabilityAudit.intact === true, 'Host entity must remain 100% intact');
    assert(immutabilityAudit.physicsMutations === 0, 'Moral engine physics mutations must be 0');
    assert(immutabilityAudit.transformMutations === 0, 'Moral engine transform mutations must be 0');
    assert(immutabilityAudit.moralDissonanceClean === true, 'Moral dissonance engine must report clean');
    console.log('  * Host Game Authority Invariant strictly preserved (0 host mutations): PASS');

    console.log('\n============================================================');
    console.log('ALL FEAR SERVER MORAL DISSONANCE CHECKS PASSED');
    console.log('============================================================');
}

main().catch((err) => {
    console.error('PROBE FAILED:', err);
    process.exit(1);
});
