/**
 * tools/verification/verify_server_faction_governance.mjs
 *
 * Verifies FearServer WebSocket and HTTP REST control plane contracts for
 * the opt-in Tier 1 Faction Governance System (Front C / Section 33):
 *
 * Suites:
 * 1. Opt-in boundaries: when enableFactionGovernance is false (default),
 *    all faction routes (WebSocket + HTTP) refuse cleanly with FACTION_GOVERNANCE_DISABLED error codes.
 * 2. Handshake contract: advertises faction_governance boolean matching server options.
 * 3. WebSocket faction governance lifecycle: register all 5 archetypes, deliberate external incidents,
 *    query single and global directives, query composure and succession fractures.
 * 4. HTTP REST route parity: /api/v1/faction/register, /api/v1/faction/deliberate,
 *    /api/v1/faction/directives, /api/v1/faction/composure.
 * 5. Validation failure boundaries: missing or malformed fields rejected with VALIDATION_FAILED.
 * 6. Host Game Authority Invariant: zero mutations on host transforms, physics, or entity states.
 *
 * Hard Rule 9 Compliant: standalone deterministic script; no automated test framework.
 */

import { FearServer } from '../../packages/runtime/src/FearServer.js';
import { ERROR_CODES, MESSAGE_TYPES } from '../../packages/protocol/index.js';
import { GOVERNANCE_ARCHETYPES, FACTION_DIRECTIVES } from '../../packages/core/src/FactionGovernanceSystem.js';

let totalAssertions = 0;

function assert(condition, message) {
    totalAssertions++;
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
    console.log('VERIFY FEAR SERVER FACTION GOVERNANCE CONTROL PLANE');
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
    assert(handshakeDefault.faction_governance === false, 'Default server must advertise faction_governance: false');
    console.log('  * Default server WS advertises faction_governance: false: PASS');

    // HTTP Handshake check
    const httpHandshake = makeResponse();
    defaultServer._routeHttpPost('/api/v1/handshake', { client_id: 'http-client' }, httpHandshake);
    assert(httpHandshake.status === 200, 'HTTP handshake must return 200');
    assert(httpHandshake.body.faction_governance === false, 'HTTP handshake must advertise faction_governance: false');
    console.log('  * Default server HTTP handshake advertises faction_governance: false: PASS');

    // WebSocket faction routes refuse cleanly
    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.FACTION_REGISTER_REQUEST,
        factionId: 'faction_1',
        archetype: GOVERNANCE_ARCHETYPES.TRIBAL_CONSENSUS
    });
    assert(latest(wsDefault).type === MESSAGE_TYPES.ERROR_RESPONSE, 'FACTION_REGISTER_REQUEST on disabled server must error');
    assert(latest(wsDefault).code === ERROR_CODES.FACTION_GOVERNANCE_DISABLED, 'Code must be FACTION_GOVERNANCE_DISABLED');

    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.FACTION_DELIBERATE_REQUEST,
        factionId: 'faction_1',
        incident: { type: 'BORDER_TRESPASS', severity: 0.5 }
    });
    assert(latest(wsDefault).code === ERROR_CODES.FACTION_GOVERNANCE_DISABLED, 'FACTION_DELIBERATE_REQUEST on disabled server must error');

    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.FACTION_DIRECTIVES_QUERY_REQUEST,
        factionId: 'faction_1'
    });
    assert(latest(wsDefault).code === ERROR_CODES.FACTION_GOVERNANCE_DISABLED, 'FACTION_DIRECTIVES_QUERY_REQUEST on disabled server must error');

    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.FACTION_COMPOSURE_QUERY_REQUEST,
        factionId: 'faction_1'
    });
    assert(latest(wsDefault).code === ERROR_CODES.FACTION_GOVERNANCE_DISABLED, 'FACTION_COMPOSURE_QUERY_REQUEST on disabled server must error');
    console.log('  * WebSocket faction routes refuse with FACTION_GOVERNANCE_DISABLED: PASS');

    // HTTP faction routes refuse cleanly
    const httpFacReg = makeResponse();
    defaultServer._routeHttpPost('/api/v1/faction/register', { factionId: 'faction_1' }, httpFacReg);
    assert(httpFacReg.status === 400, 'HTTP /api/v1/faction/register must return 400');
    assert(httpFacReg.body.code === ERROR_CODES.FACTION_GOVERNANCE_DISABLED, 'Code must be FACTION_GOVERNANCE_DISABLED');

    const httpFacDelib = makeResponse();
    defaultServer._routeHttpPost('/api/v1/faction/deliberate', { factionId: 'faction_1', incident: { type: 'TEST' } }, httpFacDelib);
    assert(httpFacDelib.status === 400, 'HTTP /api/v1/faction/deliberate must return 400');
    assert(httpFacDelib.body.code === ERROR_CODES.FACTION_GOVERNANCE_DISABLED, 'Code must be FACTION_GOVERNANCE_DISABLED');

    const httpFacDirectives = makeResponse();
    defaultServer._routeHttpPost('/api/v1/faction/directives', {}, httpFacDirectives);
    assert(httpFacDirectives.status === 400, 'HTTP /api/v1/faction/directives must return 400');
    assert(httpFacDirectives.body.code === ERROR_CODES.FACTION_GOVERNANCE_DISABLED, 'Code must be FACTION_GOVERNANCE_DISABLED');

    const httpFacComp = makeResponse();
    defaultServer._routeHttpPost('/api/v1/faction/composure', { factionId: 'faction_1' }, httpFacComp);
    assert(httpFacComp.status === 400, 'HTTP /api/v1/faction/composure must return 400');
    assert(httpFacComp.body.code === ERROR_CODES.FACTION_GOVERNANCE_DISABLED, 'Code must be FACTION_GOVERNANCE_DISABLED');
    console.log('  * HTTP faction routes refuse with FACTION_GOVERNANCE_DISABLED: PASS');

    // -------------------------------------------------------------------------
    // 2. Active Server Handshake Contract
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 2: Active server handshake contract ---');
    const activeServer = new FearServer({
        seed: 54321,
        enableFactionGovernance: true
    });
    const wsActive = makeWs();

    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.HANDSHAKE_REQUEST,
        client_id: 'active-client'
    });
    const handshakeActive = latest(wsActive);
    assert(handshakeActive.type === MESSAGE_TYPES.HANDSHAKE_RESPONSE, 'Active handshake must succeed');
    assert(handshakeActive.faction_governance === true, 'Active server WS must advertise faction_governance: true');

    const httpHandshakeActive = makeResponse();
    activeServer._routeHttpPost('/api/v1/handshake', { client_id: 'active-http' }, httpHandshakeActive);
    assert(httpHandshakeActive.status === 200, 'Active HTTP handshake must succeed');
    assert(httpHandshakeActive.body.faction_governance === true, 'Active server HTTP must advertise faction_governance: true');
    console.log('  * Active server advertises faction_governance: true on WS and HTTP: PASS');

    // -------------------------------------------------------------------------
    // 3. Active Server: WebSocket Faction Governance Lifecycle
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 3: WebSocket Faction Governance Lifecycle ---');

    // 3a. Register all 5 archetypes via WebSocket
    // 1. AUTOCRATIC_DESPOT
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.FACTION_REGISTER_REQUEST,
        factionId: 'fac_autocrat',
        archetype: GOVERNANCE_ARCHETYPES.AUTOCRATIC_DESPOT,
        options: {
            leader: { fear: 0.1, anger: 0.9, bravery: 0.8 }
        }
    });
    const wsRegAutocrat = latest(wsActive);
    assert(wsRegAutocrat.type === MESSAGE_TYPES.FACTION_REGISTER_RESPONSE, 'Must be FACTION_REGISTER_RESPONSE');
    assert(wsRegAutocrat.status === 'REGISTERED', 'Status must be REGISTERED');
    assert(wsRegAutocrat.factionId === 'fac_autocrat', 'factionId must match');
    assert(wsRegAutocrat.archetype === GOVERNANCE_ARCHETYPES.AUTOCRATIC_DESPOT, 'archetype must match');
    assert(wsRegAutocrat.currentDirective === FACTION_DIRECTIVES.OBSERVE, 'Initial directive must be OBSERVE');

    // 2. MERCHANT_OLIGARCHY
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.FACTION_REGISTER_REQUEST,
        factionId: 'fac_merchants',
        archetype: GOVERNANCE_ARCHETYPES.MERCHANT_OLIGARCHY,
        options: {
            tradeDependence: 0.9,
            resources: 0.8
        }
    });
    const wsRegMerch = latest(wsActive);
    assert(wsRegMerch.status === 'REGISTERED', 'Merchant registered');

    // 3. MILITARY_JUNTA
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.FACTION_REGISTER_REQUEST,
        factionId: 'fac_military',
        archetype: GOVERNANCE_ARCHETYPES.MILITARY_JUNTA,
        options: {
            militaryReadiness: 0.95,
            resources: 0.7
        }
    });
    assert(latest(wsActive).status === 'REGISTERED', 'Military junta registered');

    // 4. TRIBAL_CONSENSUS
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.FACTION_REGISTER_REQUEST,
        factionId: 'fac_tribe',
        archetype: GOVERNANCE_ARCHETYPES.TRIBAL_CONSENSUS,
        options: {
            consensusThreshold: 0.67,
            councilMembers: [
                { id: 'elder_1', power: 0.4, hawkishness: 0.9 },
                { id: 'elder_2', power: 0.4, hawkishness: 0.8 },
                { id: 'elder_3', power: 0.2, hawkishness: 0.1 }
            ]
        }
    });
    assert(latest(wsActive).status === 'REGISTERED', 'Tribal consensus registered');

    // 5. ECCLESIASTICAL_DEVOUT
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.FACTION_REGISTER_REQUEST,
        factionId: 'fac_devout',
        archetype: GOVERNANCE_ARCHETYPES.ECCLESIASTICAL_DEVOUT
    });
    assert(latest(wsActive).status === 'REGISTERED', 'Ecclesiastical devout registered');
    console.log('  * WebSocket register all 5 governance archetypes: PASS');

    // 3b. Deliberate incidents across archetypes via WebSocket
    // Autocrat deliberation: enraged leader attacks on raid
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.FACTION_DELIBERATE_REQUEST,
        factionId: 'fac_autocrat',
        incident: {
            type: 'RAID_OUTPOST',
            severity: 0.8,
            targetFactionId: 'fac_merchants'
        },
        context: {
            powerRatio: 1.3
        }
    });
    const wsDelibAutocrat = latest(wsActive);
    assert(wsDelibAutocrat.type === MESSAGE_TYPES.FACTION_DELIBERATE_RESPONSE, 'Must be FACTION_DELIBERATE_RESPONSE');
    assert(wsDelibAutocrat.factionId === 'fac_autocrat', 'factionId must match');
    assert(wsDelibAutocrat.deliberation.directive === FACTION_DIRECTIVES.ATTACK, `Expected ATTACK, got ${wsDelibAutocrat.deliberation.directive}`);
    assert(wsDelibAutocrat.deliberation.grievanceLevel > 0, 'grievanceLevel must increase');

    // Merchant deliberation: trade dispute with strong partner -> PAY_TRIBUTE or TRADE_PROPOSAL
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.FACTION_DELIBERATE_REQUEST,
        factionId: 'fac_merchants',
        incident: {
            type: 'TARIFF_INCREASE',
            severity: 0.2,
            targetFactionId: 'fac_autocrat'
        },
        context: {
            tradeVolume: 0.9,
            powerRatio: 0.4
        }
    });
    const wsDelibMerch = latest(wsActive);
    assert(wsDelibMerch.type === MESSAGE_TYPES.FACTION_DELIBERATE_RESPONSE, 'Must be FACTION_DELIBERATE_RESPONSE');
    assert(
        wsDelibMerch.deliberation.directive === FACTION_DIRECTIVES.PAY_TRIBUTE ||
        wsDelibMerch.deliberation.directive === FACTION_DIRECTIVES.TRADE_PROPOSAL ||
        wsDelibMerch.deliberation.directive === FACTION_DIRECTIVES.NEGOTIATE,
        `Merchant should deliberate diplomatic directive, got ${wsDelibMerch.deliberation.directive}`
    );

    // Military deliberation: border incursion with high readiness -> ATTACK or MOBILIZE
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.FACTION_DELIBERATE_REQUEST,
        factionId: 'fac_military',
        incident: {
            type: 'BORDER_INCURSION',
            severity: 0.8,
            targetFactionId: 'fac_autocrat'
        },
        context: {
            powerRatio: 1.4
        }
    });
    const wsDelibMil = latest(wsActive);
    assert(wsDelibMil.type === MESSAGE_TYPES.FACTION_DELIBERATE_RESPONSE, 'Must be FACTION_DELIBERATE_RESPONSE');
    assert(
        wsDelibMil.deliberation.directive === FACTION_DIRECTIVES.ATTACK ||
        wsDelibMil.deliberation.directive === FACTION_DIRECTIVES.MOBILIZE,
        `Military junta should deliberate combat directive, got ${wsDelibMil.deliberation.directive}`
    );

    // Tribal deliberation: council vote breakdown
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.FACTION_DELIBERATE_REQUEST,
        factionId: 'fac_tribe',
        incident: {
            type: 'BORDER_INCIDENT',
            severity: 0.6,
            targetFactionId: 'fac_military'
        },
        context: {
            powerRatio: 1.0
        }
    });
    const wsDelibTribe = latest(wsActive);
    assert(wsDelibTribe.type === MESSAGE_TYPES.FACTION_DELIBERATE_RESPONSE, 'Must be FACTION_DELIBERATE_RESPONSE');
    assert(wsDelibTribe.deliberation.voteBreakdown !== undefined, 'Tribal council must produce vote breakdown');

    // Devout deliberation: sanctuary desecration triggers ATTACK
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.FACTION_DELIBERATE_REQUEST,
        factionId: 'fac_devout',
        incident: {
            type: 'SANCTUARY_DESECRATED',
            severity: 0.9,
            targetFactionId: 'fac_merchants'
        }
    });
    const wsDelibDevout = latest(wsActive);
    assert(wsDelibDevout.type === MESSAGE_TYPES.FACTION_DELIBERATE_RESPONSE, 'Must be FACTION_DELIBERATE_RESPONSE');
    assert(wsDelibDevout.deliberation.directive === FACTION_DIRECTIVES.ATTACK, `Expected holy crusade ATTACK, got ${wsDelibDevout.deliberation.directive}`);
    console.log('  * WebSocket deliberate incidents across all 5 archetypes: PASS');

    // 3c. Query Directives via WebSocket
    // Query single faction
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.FACTION_DIRECTIVES_QUERY_REQUEST,
        factionId: 'fac_autocrat'
    });
    const wsDirSingle = latest(wsActive);
    assert(wsDirSingle.type === MESSAGE_TYPES.FACTION_DIRECTIVES_QUERY_RESPONSE, 'Must be FACTION_DIRECTIVES_QUERY_RESPONSE');
    assert(wsDirSingle.factionId === 'fac_autocrat', 'factionId must match');
    assert(wsDirSingle.directive === FACTION_DIRECTIVES.ATTACK, `Directive must match ATTACK, got ${wsDirSingle.directive}`);
    assert(typeof wsDirSingle.grievanceLevel === 'number' && wsDirSingle.grievanceLevel > 0, 'grievanceLevel must be positive');

    // Query all factions
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.FACTION_DIRECTIVES_QUERY_REQUEST
    });
    const wsDirAll = latest(wsActive);
    assert(wsDirAll.type === MESSAGE_TYPES.FACTION_DIRECTIVES_QUERY_RESPONSE, 'Must be FACTION_DIRECTIVES_QUERY_RESPONSE');
    assert(wsDirAll.factionId === null, 'factionId must be null for global query');
    assert(wsDirAll.directives && typeof wsDirAll.directives === 'object', 'directives map must be present');
    assert(wsDirAll.directives.fac_autocrat === FACTION_DIRECTIVES.ATTACK, 'fac_autocrat directive must match');
    assert('fac_merchants' in wsDirAll.directives, 'fac_merchants must be in global directives');
    assert('fac_military' in wsDirAll.directives, 'fac_military must be in global directives');
    assert('fac_tribe' in wsDirAll.directives, 'fac_tribe must be in global directives');
    assert('fac_devout' in wsDirAll.directives, 'fac_devout must be in global directives');
    console.log('  * WebSocket query single and global directives: PASS');

    // 3d. Query Composure via WebSocket
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.FACTION_COMPOSURE_QUERY_REQUEST,
        factionId: 'fac_autocrat',
        state: {
            splinterRisk: 0.7,
            cohesion: 0.3
        }
    });
    const wsComp = latest(wsActive);
    assert(wsComp.type === MESSAGE_TYPES.FACTION_COMPOSURE_QUERY_RESPONSE, 'Must be FACTION_COMPOSURE_QUERY_RESPONSE');
    assert(wsComp.factionId === 'fac_autocrat', 'factionId must match');
    assert(wsComp.composure.fractured === true, 'Autocracy with high splinter risk must report fractured: true');
    assert(wsComp.composure.scale < 1.0, 'Composure scale must be reduced');

    // Unknown faction composure query returns UNKNOWN_FACTION
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.FACTION_COMPOSURE_QUERY_REQUEST,
        factionId: 'fac_phantom'
    });
    const wsCompUnknown = latest(wsActive);
    assert(wsCompUnknown.type === MESSAGE_TYPES.ERROR_RESPONSE, 'Must be ERROR_RESPONSE');
    assert(wsCompUnknown.code === ERROR_CODES.UNKNOWN_FACTION, 'Code must be UNKNOWN_FACTION');
    console.log('  * WebSocket query composure and handle UNKNOWN_FACTION: PASS');

    // -------------------------------------------------------------------------
    // 4. HTTP REST Route Parity
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 4: HTTP REST route parity ---');

    // 4a. HTTP Faction Register
    const httpResReg = makeResponse();
    activeServer._routeHttpPost('/api/v1/faction/register', {
        factionId: 'fac_http_coward',
        archetype: GOVERNANCE_ARCHETYPES.AUTOCRATIC_DESPOT,
        options: {
            leader: { fear: 0.9, anger: 0.1, bravery: 0.2 }
        }
    }, httpResReg);
    assert(httpResReg.status === 200, 'HTTP register must return 200');
    assert(httpResReg.body.type === MESSAGE_TYPES.FACTION_REGISTER_RESPONSE, 'Type must match');
    assert(httpResReg.body.status === 'REGISTERED', 'Status must be REGISTERED');
    assert(httpResReg.body.factionId === 'fac_http_coward', 'factionId must match');
    assert(httpResReg.body.archetype === GOVERNANCE_ARCHETYPES.AUTOCRATIC_DESPOT, 'archetype must match');

    // 4b. HTTP Faction Deliberate (coward autocrat flees)
    const httpResDelib = makeResponse();
    activeServer._routeHttpPost('/api/v1/faction/deliberate', {
        factionId: 'fac_http_coward',
        incident: {
            type: 'MASSIVE_INVASION',
            severity: 0.9
        },
        context: {
            powerRatio: 0.3
        }
    }, httpResDelib);
    assert(httpResDelib.status === 200, 'HTTP deliberate must return 200');
    assert(httpResDelib.body.type === MESSAGE_TYPES.FACTION_DELIBERATE_RESPONSE, 'Type must match');
    assert(httpResDelib.body.factionId === 'fac_http_coward', 'factionId must match');
    assert(httpResDelib.body.deliberation.directive === FACTION_DIRECTIVES.RETREAT, `Coward autocrat must RETREAT, got ${httpResDelib.body.deliberation.directive}`);

    // 4c. HTTP Faction Directives Query
    const httpResDirSingle = makeResponse();
    activeServer._routeHttpPost('/api/v1/faction/directives', {
        factionId: 'fac_http_coward'
    }, httpResDirSingle);
    assert(httpResDirSingle.status === 200, 'HTTP directives query single must return 200');
    assert(httpResDirSingle.body.type === MESSAGE_TYPES.FACTION_DIRECTIVES_QUERY_RESPONSE, 'Type must match');
    assert(httpResDirSingle.body.directive === FACTION_DIRECTIVES.RETREAT, 'Directive must match RETREAT');

    const httpResDirAll = makeResponse();
    activeServer._routeHttpPost('/api/v1/faction/directives', {}, httpResDirAll);
    assert(httpResDirAll.status === 200, 'HTTP directives query all must return 200');
    assert(httpResDirAll.body.directives.fac_http_coward === FACTION_DIRECTIVES.RETREAT, 'fac_http_coward must be in directives');

    // 4d. HTTP Faction Composure Query
    const httpResComp = makeResponse();
    activeServer._routeHttpPost('/api/v1/faction/composure', {
        factionId: 'fac_http_coward',
        state: {
            leaderVacant: true
        }
    }, httpResComp);
    assert(httpResComp.status === 200, 'HTTP composure query must return 200');
    assert(httpResComp.body.type === MESSAGE_TYPES.FACTION_COMPOSURE_QUERY_RESPONSE, 'Type must match');
    assert(httpResComp.body.composure.fractured === true, 'Vacant autocrat leadership must fracture');

    // 4e. Unknown faction HTTP error handling (returns 404 UNKNOWN_FACTION)
    const httpResUnknownDelib = makeResponse();
    activeServer._routeHttpPost('/api/v1/faction/deliberate', {
        factionId: 'fac_ghost',
        incident: { type: 'TEST' }
    }, httpResUnknownDelib);
    assert(httpResUnknownDelib.status === 404, 'Unknown deliberate must return 404');
    assert(httpResUnknownDelib.body.code === ERROR_CODES.UNKNOWN_FACTION, 'Code must be UNKNOWN_FACTION');

    const httpResUnknownDir = makeResponse();
    activeServer._routeHttpPost('/api/v1/faction/directives', {
        factionId: 'fac_ghost'
    }, httpResUnknownDir);
    assert(httpResUnknownDir.status === 404, 'Unknown directives query must return 404');
    assert(httpResUnknownDir.body.code === ERROR_CODES.UNKNOWN_FACTION, 'Code must be UNKNOWN_FACTION');

    const httpResUnknownComp = makeResponse();
    activeServer._routeHttpPost('/api/v1/faction/composure', {
        factionId: 'fac_ghost'
    }, httpResUnknownComp);
    assert(httpResUnknownComp.status === 404, 'Unknown composure query must return 404');
    assert(httpResUnknownComp.body.code === ERROR_CODES.UNKNOWN_FACTION, 'Code must be UNKNOWN_FACTION');
    console.log('  * HTTP REST routes match WebSocket semantics and 404 on UNKNOWN_FACTION: PASS');

    // -------------------------------------------------------------------------
    // 5. Validation Failure Boundaries
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 5: Validation Failure Boundaries ---');

    // Missing factionId in register
    const resBad1 = makeResponse();
    activeServer._routeHttpPost('/api/v1/faction/register', {}, resBad1);
    assert(resBad1.status === 400, 'Empty register body must return 400');
    assert(resBad1.body.code === ERROR_CODES.VALIDATION_FAILED, 'Code must be VALIDATION_FAILED');

    // Invalid archetype in register
    const resBad2 = makeResponse();
    activeServer._routeHttpPost('/api/v1/faction/register', { factionId: 'f1', archetype: 'SPACE_EMPIRE' }, resBad2);
    assert(resBad2.status === 400, 'Invalid archetype must return 400');
    assert(resBad2.body.code === ERROR_CODES.VALIDATION_FAILED, 'Code must be VALIDATION_FAILED');

    // Missing incident in deliberate
    const resBad3 = makeResponse();
    activeServer._routeHttpPost('/api/v1/faction/deliberate', { factionId: 'f1' }, resBad3);
    assert(resBad3.status === 400, 'Missing incident must return 400');
    assert(resBad3.body.code === ERROR_CODES.VALIDATION_FAILED, 'Code must be VALIDATION_FAILED');

    // Missing incident.type in deliberate
    const resBad4 = makeResponse();
    activeServer._routeHttpPost('/api/v1/faction/deliberate', { factionId: 'f1', incident: { severity: 0.5 } }, resBad4);
    assert(resBad4.status === 400, 'Missing incident.type must return 400');
    assert(resBad4.body.code === ERROR_CODES.VALIDATION_FAILED, 'Code must be VALIDATION_FAILED');

    // Missing factionId in deliberate
    const resBad5 = makeResponse();
    activeServer._routeHttpPost('/api/v1/faction/deliberate', { incident: { type: 'INCIDENT' } }, resBad5);
    assert(resBad5.status === 400, 'Missing factionId in deliberate must return 400');
    assert(resBad5.body.code === ERROR_CODES.VALIDATION_FAILED, 'Code must be VALIDATION_FAILED');

    // Missing factionId in composure
    const resBad6 = makeResponse();
    activeServer._routeHttpPost('/api/v1/faction/composure', {}, resBad6);
    assert(resBad6.status === 400, 'Missing factionId in composure must return 400');
    assert(resBad6.body.code === ERROR_CODES.VALIDATION_FAILED, 'Code must be VALIDATION_FAILED');

    // WebSocket validation failure (missing incident in deliberate)
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.FACTION_DELIBERATE_REQUEST,
        factionId: 'fac_autocrat'
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
        id: 'host_faction_actor_1',
        x: 250,
        y: 0,
        z: -120,
        transform: { position: { x: 250, y: 0, z: -120 }, rotation: { yaw: 90 } },
        physics: { velocity: { vx: 0, vy: 0, vz: 0 }, mass: 75.0 },
        vitalStatus: 'ALIVE'
    };

    const immutabilityAudit = activeServer.simulation.auditFactionGovernanceImmutability(mockHostEntity);
    assert(immutabilityAudit.intact === true, 'Host entity must remain 100% intact');
    assert(immutabilityAudit.physicsMutations === 0, 'Faction governance engine physics mutations must be 0');
    assert(immutabilityAudit.transformMutations === 0, 'Faction governance engine transform mutations must be 0');
    assert(immutabilityAudit.factionGovernanceClean === true, 'Faction governance engine must report clean');
    console.log('  * Host Game Authority Invariant strictly preserved (0 host mutations): PASS');

    console.log('\n============================================================');
    console.log(`ALL FEAR SERVER FACTION GOVERNANCE CHECKS PASSED (${totalAssertions} assertions)`);
    console.log('============================================================');
}

main().catch((err) => {
    console.error('PROBE FAILED:', err);
    process.exit(1);
});
