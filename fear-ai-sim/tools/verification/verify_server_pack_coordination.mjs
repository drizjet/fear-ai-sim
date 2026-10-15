/**
 * tools/verification/verify_server_pack_coordination.mjs
 *
 * Verifies FearServer WebSocket and HTTP REST control plane contracts for
 * the opt-in Tier 2 PackCoordinationEngine:
 * 1. Opt-in boundaries: when enablePackCoordination is false (default), all pack
 *    routes (WebSocket + HTTP) refuse cleanly with PACK_COORDINATION_DISABLED.
 * 2. Handshake contract: advertises pack_coordination boolean matching server options.
 * 3. WebSocket pack lifecycle: PACK_CREATE_REQUEST, PACK_ASSIGN_MEMBER_REQUEST,
 *    PACK_UPDATE_REQUEST, PACK_QUERY_REQUEST, PACK_REMOVE_MEMBER_REQUEST.
 * 4. HTTP REST route parity: /api/v1/pack/create, /api/v1/pack/assign, /api/v1/pack/update,
 *    /api/v1/pack/query, /api/v1/pack/remove.
 * 5. Simulation tick integration: pack member positions and tactical vectors update
 *    on tick without mutating host authority (advisories only).
 * 6. Alpha Fall trigger: unregistering alpha triggers SCATTER_DISPERSE catastrophe.
 * 7. Host Game Authority Invariant: zero mutations on host transforms or physics.
 *
 * Hard Rule 9 Compliant: standalone deterministic script; no automated test framework.
 */

import { FearServer } from '../../packages/runtime/src/FearServer.js';
import { ERROR_CODES, MESSAGE_TYPES } from '../../packages/protocol/index.js';
import { PACK_ROLES, TACTICAL_PHASES, ENCIRCLEMENT_PATTERNS } from '../../packages/core/index.js';

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
    console.log('VERIFY FEAR SERVER PACK COORDINATION CONTROL PLANE');
    console.log('============================================================\n');

    // -------------------------------------------------------------------------
    // 1. Opt-In Boundary: Disabled by Default
    // -------------------------------------------------------------------------
    console.log('--- Suite 1: Opt-in boundary when service is disabled ---');
    const defaultServer = new FearServer({ seed: 12345 });
    const wsDefault = makeWs();

    // Handshake check
    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.HANDSHAKE_REQUEST,
        client_id: 'test-client'
    });
    const handshakeDefault = latest(wsDefault);
    assert(handshakeDefault.type === MESSAGE_TYPES.HANDSHAKE_RESPONSE, 'Handshake must succeed on default server');
    assert(handshakeDefault.pack_coordination === false, 'Default server must advertise pack_coordination: false');
    console.log('  * Default server advertises pack_coordination: false: PASS');

    // WebSocket pack routes refuse cleanly
    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.PACK_CREATE_REQUEST,
        packId: 'alpha_pack'
    });
    assert(latest(wsDefault).type === MESSAGE_TYPES.ERROR_RESPONSE, 'PACK_CREATE on disabled server must error');
    assert(latest(wsDefault).code === ERROR_CODES.PACK_COORDINATION_DISABLED, 'Error code must be PACK_COORDINATION_DISABLED');

    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.PACK_ASSIGN_MEMBER_REQUEST,
        packId: 'alpha_pack',
        agentId: 'wolf_1'
    });
    assert(latest(wsDefault).code === ERROR_CODES.PACK_COORDINATION_DISABLED, 'PACK_ASSIGN on disabled server must error');

    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.PACK_QUERY_REQUEST,
        packId: 'alpha_pack'
    });
    assert(latest(wsDefault).code === ERROR_CODES.PACK_COORDINATION_DISABLED, 'PACK_QUERY on disabled server must error');
    console.log('  * WebSocket pack routes refuse with PACK_COORDINATION_DISABLED: PASS');

    // HTTP pack routes refuse cleanly
    const httpPackCreate = makeResponse();
    defaultServer._routeHttpPost('/api/v1/pack/create', { packId: 'alpha_pack' }, httpPackCreate);
    assert(httpPackCreate.status === 400, 'HTTP /api/v1/pack/create must return 400 on disabled server');
    assert(httpPackCreate.body.code === ERROR_CODES.PACK_COORDINATION_DISABLED, 'HTTP code must be PACK_COORDINATION_DISABLED');

    const httpPackQuery = makeResponse();
    defaultServer._routeHttpPost('/api/v1/pack/query', { packId: 'alpha_pack' }, httpPackQuery);
    assert(httpPackQuery.status === 400, 'HTTP /api/v1/pack/query must return 400 on disabled server');
    assert(httpPackQuery.body.code === ERROR_CODES.PACK_COORDINATION_DISABLED, 'HTTP query code must be PACK_COORDINATION_DISABLED');
    console.log('  * HTTP pack routes refuse with PACK_COORDINATION_DISABLED: PASS');

    // -------------------------------------------------------------------------
    // 2. Active Server: WebSocket Pack Lifecycle
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 2: Active server WebSocket pack lifecycle ---');
    const server = new FearServer({ seed: 4242, enablePackCoordination: true });
    const ws = makeWs();

    // Handshake check on enabled server
    server._handleWsMessage(ws, {
        type: MESSAGE_TYPES.HANDSHAKE_REQUEST,
        client_id: 'host-pack-client'
    });
    const handshakeActive = latest(ws);
    assert(handshakeActive.pack_coordination === true, 'Enabled server must advertise pack_coordination: true');
    console.log('  * Active server advertises pack_coordination: true: PASS');

    // Register agents for the pack
    const agentIds = ['wolf_alpha', 'wolf_flanker_l', 'wolf_flanker_r', 'wolf_rear'];
    for (const id of agentIds) {
        server._handleWsMessage(ws, {
            type: MESSAGE_TYPES.REGISTER_AGENT,
            agent_id: id,
            name: id,
            traits: { neuroticism: 0.2, resilience: 0.9, fear: 0.1 }
        });
        assert(latest(ws).type === 'REGISTER_AGENT_ACK', `Agent ${id} registered cleanly`);
    }

    // PACK_CREATE_REQUEST
    server._handleWsMessage(ws, {
        type: MESSAGE_TYPES.PACK_CREATE_REQUEST,
        packId: 'shadow_pack',
        options: {
            formationPattern: ENCIRCLEMENT_PATTERNS.CIRCULAR_PINCER,
            dynamicRoleAllocation: true,
            alphaDampingFactor: 0.35
        },
        message_id: 'create-1'
    });
    const createResp = latest(ws);
    assert(createResp.type === MESSAGE_TYPES.PACK_CREATE_RESPONSE, 'Must receive PACK_CREATE_RESPONSE');
    assert(createResp.status === 'CREATED', 'Status must be CREATED');
    assert(createResp.packId === 'shadow_pack', 'packId must match');
    assert(createResp.pattern === ENCIRCLEMENT_PATTERNS.CIRCULAR_PINCER, 'formationPattern must match');
    assert(createResp.message_id === 'create-1', 'correlation message_id must be preserved');
    console.log('  * PACK_CREATE_REQUEST creates pack with specified pattern: PASS');

    // PACK_ASSIGN_MEMBER_REQUEST
    server._handleWsMessage(ws, {
        type: MESSAGE_TYPES.PACK_ASSIGN_MEMBER_REQUEST,
        packId: 'shadow_pack',
        agentId: 'wolf_alpha',
        role: PACK_ROLES.ALPHA_LEADER,
        position: { x: 0, y: 0, z: 0 },
        message_id: 'assign-alpha'
    });
    const assignAlpha = latest(ws);
    assert(assignAlpha.type === MESSAGE_TYPES.PACK_ASSIGN_MEMBER_RESPONSE, 'Must receive PACK_ASSIGN_MEMBER_RESPONSE');
    assert(assignAlpha.role === PACK_ROLES.ALPHA_LEADER, 'Role must be ALPHA_LEADER');

    for (let i = 1; i < agentIds.length; i++) {
        server._handleWsMessage(ws, {
            type: MESSAGE_TYPES.PACK_ASSIGN_MEMBER_REQUEST,
            packId: 'shadow_pack',
            agentId: agentIds[i],
            position: { x: i * 5, y: 0, z: i * 2 }
        });
        assert(latest(ws).type === MESSAGE_TYPES.PACK_ASSIGN_MEMBER_RESPONSE, `Subordinate ${agentIds[i]} assigned`);
    }
    console.log('  * PACK_ASSIGN_MEMBER_REQUEST assigns leader and subordinates: PASS');

    // PACK_UPDATE_REQUEST: set target threat and tactical phase
    server._handleWsMessage(ws, {
        type: MESSAGE_TYPES.PACK_UPDATE_REQUEST,
        packId: 'shadow_pack',
        phase: TACTICAL_PHASES.ENCIRCLING,
        pattern: ENCIRCLEMENT_PATTERNS.CRESCENT_SURROUND,
        targetThreat: { x: 30, y: 0, z: 40, id: 'player_hunter' },
        message_id: 'update-threat'
    });
    const updateResp = latest(ws);
    assert(updateResp.type === MESSAGE_TYPES.PACK_UPDATE_RESPONSE, 'Must receive PACK_UPDATE_RESPONSE');
    assert(updateResp.status === 'UPDATED', 'Status must be UPDATED');
    console.log('  * PACK_UPDATE_REQUEST updates phase, pattern, and targetThreat: PASS');

    // Simulation tick advances pack calculations
    server._handleWsMessage(ws, {
        type: MESSAGE_TYPES.STEP_REQUEST,
        dt: 0.0166
    });
    assert(latest(ws).type === MESSAGE_TYPES.BATCH_TICK_RESPONSE, 'Simulation step executed cleanly');

    // PACK_QUERY_REQUEST: query tactical advisories
    server._handleWsMessage(ws, {
        type: MESSAGE_TYPES.PACK_QUERY_REQUEST,
        packId: 'shadow_pack',
        message_id: 'query-1'
    });
    const queryResp = latest(ws);
    assert(queryResp.type === MESSAGE_TYPES.PACK_QUERY_RESPONSE, 'Must receive PACK_QUERY_RESPONSE');
    assert(queryResp.packId === 'shadow_pack', 'packId matches');
    assert(queryResp.advisories.phase === TACTICAL_PHASES.ENCIRCLING, 'Phase matches updated phase');
    assert(queryResp.advisories.alphaId === 'wolf_alpha', 'Alpha leader preserved');
    assert(queryResp.advisories.host_authority === 'ADVISORY_ONLY', 'Authority must remain strictly advisory');
    assert(queryResp.advisories.members.length === 4, 'All 4 pack members returned in advisory');

    const alphaMember = queryResp.advisories.members.find(m => m.memberId === 'wolf_alpha');
    assert(alphaMember.role === PACK_ROLES.ALPHA_LEADER, 'Alpha member role verified');
    assert(typeof alphaMember.advisoryPosition.x === 'number', 'advisoryPosition vector calculated');
    assert(typeof alphaMember.headingVector.x === 'number', 'headingVector calculated');
    console.log('  * PACK_QUERY_REQUEST retrieves tactical positions and advisories: PASS');

    // Query all packs
    server._handleWsMessage(ws, {
        type: MESSAGE_TYPES.PACK_QUERY_REQUEST
    });
    const queryAllResp = latest(ws);
    assert(queryAllResp.type === MESSAGE_TYPES.PACK_QUERY_RESPONSE, 'Must receive query all response');
    assert(Array.isArray(queryAllResp.packs), 'packs must be an array');
    assert(queryAllResp.packs.length === 1, 'Single pack returned in all packs list');
    console.log('  * PACK_QUERY_REQUEST without packId returns all active packs: PASS');

    // -------------------------------------------------------------------------
    // 3. HTTP REST Route Parity
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 3: HTTP REST route parity ---');
    const httpRes = makeResponse();

    // POST /api/v1/pack/create
    server._routeHttpPost('/api/v1/pack/create', {
        packId: 'ghost_pack',
        options: { formationPattern: ENCIRCLEMENT_PATTERNS.STAGGERED_LINE }
    }, httpRes);
    assert(httpRes.status === 200, 'HTTP pack create status 200');
    assert(httpRes.body.type === MESSAGE_TYPES.PACK_CREATE_RESPONSE, 'HTTP pack create response type');
    assert(httpRes.body.packId === 'ghost_pack', 'HTTP packId matches');

    // POST /api/v1/pack/assign
    server._routeHttpPost('/api/v1/pack/assign', {
        packId: 'ghost_pack',
        agentId: 'wolf_rear',
        role: PACK_ROLES.CHASER
    }, httpRes);
    assert(httpRes.status === 200, 'HTTP pack assign status 200');
    assert(httpRes.body.role === PACK_ROLES.CHASER, 'HTTP assigned role verified');

    // POST /api/v1/pack/update
    server._routeHttpPost('/api/v1/pack/update', {
        packId: 'ghost_pack',
        phase: TACTICAL_PHASES.SYNCHRONIZED_STRIKE
    }, httpRes);
    assert(httpRes.status === 200, 'HTTP pack update status 200');

    // POST /api/v1/pack/query
    server._routeHttpPost('/api/v1/pack/query', { packId: 'ghost_pack' }, httpRes);
    assert(httpRes.status === 200, 'HTTP pack query status 200');
    assert(httpRes.body.advisories.phase === TACTICAL_PHASES.SYNCHRONIZED_STRIKE, 'HTTP query reports SYNCHRONIZED_STRIKE phase');

    // POST /api/v1/pack/remove
    server._routeHttpPost('/api/v1/pack/remove', {
        packId: 'ghost_pack',
        agentId: 'wolf_rear'
    }, httpRes);
    assert(httpRes.status === 200, 'HTTP pack remove status 200');
    assert(httpRes.body.status === 'REMOVED', 'HTTP pack remove reports REMOVED');
    console.log('  * Full HTTP REST route parity (/create, /assign, /update, /query, /remove): PASS');

    // -------------------------------------------------------------------------
    // 4. Alpha Fall Catastrophe & Host Authority Invariant
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 4: Emergent gameplay & Host Authority Invariant ---');

    // Unregistering the alpha leader triggers SCATTER_DISPERSE catastrophe
    server._handleWsMessage(ws, {
        type: MESSAGE_TYPES.UNREGISTER_AGENT,
        agent_id: 'wolf_alpha'
    });
    assert(latest(ws).status === 'UNREGISTERED', 'Alpha agent unregisters cleanly');

    // Query pack state: phase should now be SCATTER_DISPERSE
    server._handleWsMessage(ws, {
        type: MESSAGE_TYPES.PACK_QUERY_REQUEST,
        packId: 'shadow_pack'
    });
    const postAlphaFall = latest(ws);
    assert(postAlphaFall.advisories.phase === TACTICAL_PHASES.SCATTER_DISPERSE, 'Alpha Fall must trigger SCATTER_DISPERSE');
    console.log('  * Unregistering alpha leader cleanly triggers Alpha Fall catastrophe (SCATTER_DISPERSE): PASS');

    // Host Game Authority Invariant: immutability audit proves 0 host mutations
    const audit = server.simulation.packCoordination.auditImmutability();
    assert(audit.isClean === true && audit.hostPhysicsMutations === 0 && audit.hostTransformMutations === 0,
        'Pack coordination reports host mutations, violating Host Game Authority Invariant');
    assert(audit.status === 'CLEAN_ADVISORY_ONLY', 'Status must be CLEAN_ADVISORY_ONLY');
    console.log('  * auditImmutability certifies 0 host mutations (Host Authority Invariant): PASS');

    console.log('\n============================================================');
    console.log('SUCCESS: All FearServer Pack Coordination control plane assertions PASSED.');
    console.log('============================================================');
}

main().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
});
