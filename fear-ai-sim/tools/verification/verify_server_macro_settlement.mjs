/**
 * tools/verification/verify_server_macro_settlement.mjs
 *
 * Verifies FearServer WebSocket and HTTP REST control plane contracts for
 * the opt-in Tier 2 Macro & Settlement Systems:
 * - EconomicFeedbackSystem (Section 43)
 * - SettlementMigrationSystem (Section 44)
 *
 * Suites:
 * 1. Opt-in boundaries: when enableEconomicFeedback / enableSettlementMigration are false (default),
 *    all economy and settlement routes (WebSocket + HTTP) refuse cleanly with *_DISABLED error codes.
 * 2. Handshake contract: advertises economic_feedback and settlement_migration booleans matching server options.
 * 3. WebSocket macro/settlement lifecycle: market registration, commodity trading, raid query,
 *    settlement registration, push/pull pressure evaluation, and migration wave triggers.
 * 4. HTTP REST route parity: /api/v1/economy/market/register, /api/v1/economy/trade,
 *    /api/v1/economy/raid/query, /api/v1/settlement/register, /api/v1/settlement/pressure/query,
 *    /api/v1/settlement/migration/wave.
 * 5. Validation failure boundaries: missing or malformed fields rejected with VALIDATION_FAILED.
 * 6. Population Conservation & Host Game Authority Invariant: zero mutations on host transforms or physics.
 *
 * Hard Rule 9 Compliant: standalone deterministic script; no automated test framework.
 */

import { FearServer } from '../../packages/runtime/src/FearServer.js';
import { ERROR_CODES, MESSAGE_TYPES } from '../../packages/protocol/index.js';
import { COMMODITY_TYPES } from '../../packages/core/index.js';

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
    console.log('VERIFY FEAR SERVER MACRO & SETTLEMENT CONTROL PLANE');
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
    assert(handshakeDefault.economic_feedback === false, 'Default server must advertise economic_feedback: false');
    assert(handshakeDefault.settlement_migration === false, 'Default server must advertise settlement_migration: false');
    console.log('  * Default server advertises economic_feedback: false, settlement_migration: false: PASS');

    // HTTP Handshake check
    const httpHandshake = makeResponse();
    defaultServer._routeHttpPost('/api/v1/handshake', { client_id: 'http-client' }, httpHandshake);
    assert(httpHandshake.status === 200, 'HTTP handshake must return 200');
    assert(httpHandshake.body.economic_feedback === false, 'HTTP handshake must advertise economic_feedback: false');
    assert(httpHandshake.body.settlement_migration === false, 'HTTP handshake must advertise settlement_migration: false');
    console.log('  * HTTP handshake advertises disabled flags: PASS');

    // WebSocket economy routes refuse cleanly
    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.ECONOMY_REGISTER_MARKET_REQUEST,
        settlementId: 'market_1'
    });
    assert(latest(wsDefault).type === MESSAGE_TYPES.ERROR_RESPONSE, 'ECONOMY_REGISTER on disabled server must error');
    assert(latest(wsDefault).code === ERROR_CODES.ECONOMIC_FEEDBACK_DISABLED, 'Code must be ECONOMIC_FEEDBACK_DISABLED');

    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.ECONOMY_TRADE_REQUEST,
        sourceId: 'm1',
        destId: 'm2',
        commodity: 'FOOD',
        amount: 10
    });
    assert(latest(wsDefault).code === ERROR_CODES.ECONOMIC_FEEDBACK_DISABLED, 'ECONOMY_TRADE on disabled server must error');

    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.ECONOMY_RAID_QUERY_REQUEST,
        settlementId: 'm1'
    });
    assert(latest(wsDefault).code === ERROR_CODES.ECONOMIC_FEEDBACK_DISABLED, 'ECONOMY_RAID on disabled server must error');

    // WebSocket settlement routes refuse cleanly
    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.SETTLEMENT_REGISTER_REQUEST,
        settlementId: 'haven_1'
    });
    assert(latest(wsDefault).code === ERROR_CODES.SETTLEMENT_MIGRATION_DISABLED, 'SETTLEMENT_REGISTER on disabled server must error');

    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.SETTLEMENT_PRESSURE_QUERY_REQUEST,
        settlementId: 'haven_1'
    });
    assert(latest(wsDefault).code === ERROR_CODES.SETTLEMENT_MIGRATION_DISABLED, 'SETTLEMENT_PRESSURE on disabled server must error');

    defaultServer._handleWsMessage(wsDefault, {
        type: MESSAGE_TYPES.SETTLEMENT_MIGRATION_WAVE_REQUEST,
        sourceId: 'h1',
        destId: 'h2'
    });
    assert(latest(wsDefault).code === ERROR_CODES.SETTLEMENT_MIGRATION_DISABLED, 'SETTLEMENT_MIGRATION_WAVE on disabled server must error');
    console.log('  * WebSocket economy/settlement routes refuse with *_DISABLED: PASS');

    // HTTP economy routes refuse cleanly
    const httpEconRegister = makeResponse();
    defaultServer._routeHttpPost('/api/v1/economy/market/register', { settlementId: 'm1' }, httpEconRegister);
    assert(httpEconRegister.status === 400, 'HTTP /api/v1/economy/market/register must return 400');
    assert(httpEconRegister.body.code === ERROR_CODES.ECONOMIC_FEEDBACK_DISABLED, 'Code must be ECONOMIC_FEEDBACK_DISABLED');

    const httpEconTrade = makeResponse();
    defaultServer._routeHttpPost('/api/v1/economy/trade', { sourceId: 'm1', destId: 'm2', commodity: 'FOOD', amount: 10 }, httpEconTrade);
    assert(httpEconTrade.status === 400, 'HTTP /api/v1/economy/trade must return 400');
    assert(httpEconTrade.body.code === ERROR_CODES.ECONOMIC_FEEDBACK_DISABLED, 'Code must be ECONOMIC_FEEDBACK_DISABLED');

    const httpEconRaid = makeResponse();
    defaultServer._routeHttpPost('/api/v1/economy/raid/query', { settlementId: 'm1' }, httpEconRaid);
    assert(httpEconRaid.status === 400, 'HTTP /api/v1/economy/raid/query must return 400');
    assert(httpEconRaid.body.code === ERROR_CODES.ECONOMIC_FEEDBACK_DISABLED, 'Code must be ECONOMIC_FEEDBACK_DISABLED');

    // HTTP settlement routes refuse cleanly
    const httpSetRegister = makeResponse();
    defaultServer._routeHttpPost('/api/v1/settlement/register', { settlementId: 'h1' }, httpSetRegister);
    assert(httpSetRegister.status === 400, 'HTTP /api/v1/settlement/register must return 400');
    assert(httpSetRegister.body.code === ERROR_CODES.SETTLEMENT_MIGRATION_DISABLED, 'Code must be SETTLEMENT_MIGRATION_DISABLED');

    const httpSetPressure = makeResponse();
    defaultServer._routeHttpPost('/api/v1/settlement/pressure/query', { settlementId: 'h1' }, httpSetPressure);
    assert(httpSetPressure.status === 400, 'HTTP /api/v1/settlement/pressure/query must return 400');
    assert(httpSetPressure.body.code === ERROR_CODES.SETTLEMENT_MIGRATION_DISABLED, 'Code must be SETTLEMENT_MIGRATION_DISABLED');

    const httpSetWave = makeResponse();
    defaultServer._routeHttpPost('/api/v1/settlement/migration/wave', { sourceId: 'h1', destId: 'h2' }, httpSetWave);
    assert(httpSetWave.status === 400, 'HTTP /api/v1/settlement/migration/wave must return 400');
    assert(httpSetWave.body.code === ERROR_CODES.SETTLEMENT_MIGRATION_DISABLED, 'Code must be SETTLEMENT_MIGRATION_DISABLED');
    console.log('  * HTTP economy/settlement routes refuse with *_DISABLED: PASS');

    // -------------------------------------------------------------------------
    // 2. Active Server Handshake
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 2: Active server handshake contract ---');
    const activeServer = new FearServer({
        seed: 54321,
        enableEconomicFeedback: true,
        enableSettlementMigration: true
    });
    const wsActive = makeWs();

    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.HANDSHAKE_REQUEST,
        client_id: 'active-client'
    });
    const handshakeActive = latest(wsActive);
    assert(handshakeActive.type === MESSAGE_TYPES.HANDSHAKE_RESPONSE, 'Active handshake must succeed');
    assert(handshakeActive.economic_feedback === true, 'Active server must advertise economic_feedback: true');
    assert(handshakeActive.settlement_migration === true, 'Active server must advertise settlement_migration: true');
    console.log('  * Active server advertises economic_feedback: true and settlement_migration: true: PASS');

    // -------------------------------------------------------------------------
    // 3. Active Server: WebSocket Macro/Settlement Lifecycle
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 3: WebSocket Macro & Settlement Lifecycle ---');

    // 3a. Register Markets
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.ECONOMY_REGISTER_MARKET_REQUEST,
        settlementId: 'ws_agri_hub',
        options: {
            population: 100,
            initialStockpiles: { FOOD: 500, TIMBER: 100 },
            production: { FOOD: 15, TIMBER: 2 }
        }
    });
    const wsReg1 = latest(wsActive);
    assert(wsReg1.type === MESSAGE_TYPES.ECONOMY_REGISTER_MARKET_RESPONSE, 'Market registration must succeed');
    assert(wsReg1.status === 'REGISTERED', 'Status must be REGISTERED');
    assert(wsReg1.settlementId === 'ws_agri_hub', 'SettlementId must match');
    assert(wsReg1.market.stockpiles[COMMODITY_TYPES.FOOD] === 500, 'Initial food stockpile must be 500');

    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.ECONOMY_REGISTER_MARKET_REQUEST,
        settlementId: 'ws_mining_camp',
        options: {
            population: 80,
            initialStockpiles: { FOOD: 50, ORE: 300 },
            production: { FOOD: 1, ORE: 10 }
        }
    });
    assert(latest(wsActive).status === 'REGISTERED', 'Mining camp registration must succeed');

    // 3b. Trade Transaction
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.ECONOMY_TRADE_REQUEST,
        sourceId: 'ws_agri_hub',
        destId: 'ws_mining_camp',
        commodity: 'FOOD',
        amount: 80
    });
    const wsTrade = latest(wsActive);
    assert(wsTrade.type === MESSAGE_TYPES.ECONOMY_TRADE_RESPONSE, 'Trade response must be ECONOMY_TRADE_RESPONSE');
    assert(wsTrade.status === 'RECORDED', 'Trade status must be RECORDED');
    assert(wsTrade.success === true, 'Trade success must be true');
    assert(wsTrade.amount === 80, 'Trade amount must be 80');

    // 3c. Raid Desirability Query
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.ECONOMY_RAID_QUERY_REQUEST,
        settlementId: 'ws_agri_hub'
    });
    const wsRaid = latest(wsActive);
    assert(wsRaid.type === MESSAGE_TYPES.ECONOMY_RAID_QUERY_RESPONSE, 'Raid query response must match');
    assert(typeof wsRaid.raidDesirability.raidUtility === 'number', 'Raid utility must be numeric');
    assert(typeof wsRaid.marketSummary.foodStockpile === 'number', 'Market summary food must be numeric');
    assert(wsRaid.marketSummary.id === 'ws_agri_hub', 'Summary id must match ws_agri_hub');
    console.log('  * WebSocket economy market registration, trade, and raid query: PASS');

    // 3d. Register Settlements for Migration
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.SETTLEMENT_REGISTER_REQUEST,
        settlementId: 'ws_haven_outpost',
        data: {
            population: 180,
            housingCapacity: 100,
            foodStock: 10,
            threatLevel: 0.85
        }
    });
    const wsSet1 = latest(wsActive);
    assert(wsSet1.type === MESSAGE_TYPES.SETTLEMENT_REGISTER_RESPONSE, 'Settlement register response must match');
    assert(wsSet1.status === 'REGISTERED', 'Settlement status must be REGISTERED');

    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.SETTLEMENT_REGISTER_REQUEST,
        settlementId: 'ws_haven_sanctuary',
        data: {
            population: 60,
            housingCapacity: 200,
            foodStock: 150,
            threatLevel: 0.05,
            garrisonStrength: 0.95
        }
    });
    assert(latest(wsActive).status === 'REGISTERED', 'Sanctuary settlement registration must succeed');

    // 3e. Settlement Pressure Query
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.SETTLEMENT_PRESSURE_QUERY_REQUEST,
        settlementId: 'ws_haven_outpost',
        corridorDanger: 0.1
    });
    const wsPressure = latest(wsActive);
    assert(wsPressure.type === MESSAGE_TYPES.SETTLEMENT_PRESSURE_QUERY_RESPONSE, 'Pressure query response must match');
    assert(wsPressure.pushPressure.netPush > 0.40, 'Outpost push pressure must be elevated (> 0.40)');
    assert(wsPressure.state.population === 180, 'State population must be 180');

    // Unknown settlement pressure query
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.SETTLEMENT_PRESSURE_QUERY_REQUEST,
        settlementId: 'non_existent_haven'
    });
    assert(latest(wsActive).code === ERROR_CODES.UNKNOWN_SETTLEMENT, 'Unknown settlement must return UNKNOWN_SETTLEMENT');

    // 3f. Trigger Migration Wave
    activeServer._handleWsMessage(wsActive, {
        type: MESSAGE_TYPES.SETTLEMENT_MIGRATION_WAVE_REQUEST,
        sourceId: 'ws_haven_outpost',
        destId: 'ws_haven_sanctuary',
        corridorDanger: 0.1
    });
    const wsWave = latest(wsActive);
    assert(wsWave.type === MESSAGE_TYPES.SETTLEMENT_MIGRATION_WAVE_RESPONSE, 'Wave response must match');
    assert(wsWave.status === 'DISPATCHED', 'Wave status must be DISPATCHED');
    assert(wsWave.party !== null, 'Dispatched migrant party must exist');
    assert(wsWave.party.headcount > 0, 'Migrant cohort headcount must be > 0');
    console.log('  * WebSocket settlement registration, pressure query, and migration wave: PASS');

    // -------------------------------------------------------------------------
    // 4. Active Server: HTTP REST Route Parity
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 4: HTTP REST Route Parity ---');

    // 4a. HTTP Market Registration
    const httpResReg = makeResponse();
    activeServer._routeHttpPost('/api/v1/economy/market/register', {
        settlementId: 'http_market_val',
        options: {
            population: 120,
            initialStockpiles: { FOOD: 400, TIMBER: 150 },
            production: { FOOD: 10 }
        }
    }, httpResReg);
    assert(httpResReg.status === 200, 'HTTP market register must return 200');
    assert(httpResReg.body.type === MESSAGE_TYPES.ECONOMY_REGISTER_MARKET_RESPONSE, 'HTTP response type must match');
    assert(httpResReg.body.status === 'REGISTERED', 'HTTP response status must be REGISTERED');

    const httpResReg2 = makeResponse();
    activeServer._routeHttpPost('/api/v1/economy/market/register', {
        settlementId: 'http_market_dest',
        options: {
            population: 90,
            initialStockpiles: { FOOD: 30, TIMBER: 20 },
            production: { FOOD: 2 }
        }
    }, httpResReg2);
    assert(httpResReg2.status === 200, 'HTTP market register 2 must return 200');

    // 4b. HTTP Trade
    const httpResTrade = makeResponse();
    activeServer._routeHttpPost('/api/v1/economy/trade', {
        sourceId: 'http_market_val',
        destId: 'http_market_dest',
        commodity: 'FOOD',
        amount: 50
    }, httpResTrade);
    assert(httpResTrade.status === 200, 'HTTP trade must return 200');
    assert(httpResTrade.body.status === 'RECORDED', 'HTTP trade status must be RECORDED');
    assert(httpResTrade.body.success === true, 'HTTP trade success must be true');

    // 4c. HTTP Raid Query
    const httpResRaid = makeResponse();
    activeServer._routeHttpPost('/api/v1/economy/raid/query', {
        settlementId: 'http_market_val'
    }, httpResRaid);
    assert(httpResRaid.status === 200, 'HTTP raid query must return 200');
    assert(typeof httpResRaid.body.raidDesirability.raidUtility === 'number', 'HTTP raid utility must be numeric');
    assert(httpResRaid.body.marketSummary.id === 'http_market_val', 'Summary id must match');

    // 4d. HTTP Settlement Register
    const httpResSet1 = makeResponse();
    activeServer._routeHttpPost('/api/v1/settlement/register', {
        settlementId: 'http_haven_src',
        data: {
            population: 200,
            housingCapacity: 100,
            foodStock: 15,
            threatLevel: 0.90
        }
    }, httpResSet1);
    assert(httpResSet1.status === 200, 'HTTP settlement register must return 200');
    assert(httpResSet1.body.status === 'REGISTERED', 'HTTP status must be REGISTERED');

    const httpResSet2 = makeResponse();
    activeServer._routeHttpPost('/api/v1/settlement/register', {
        settlementId: 'http_haven_dest',
        data: {
            population: 40,
            housingCapacity: 250,
            foodStock: 200,
            threatLevel: 0.05,
            garrisonStrength: 0.90
        }
    }, httpResSet2);
    assert(httpResSet2.status === 200, 'HTTP settlement register 2 must return 200');

    // 4e. HTTP Pressure Query
    const httpResPressure = makeResponse();
    activeServer._routeHttpPost('/api/v1/settlement/pressure/query', {
        settlementId: 'http_haven_src',
        corridorDanger: 0.05
    }, httpResPressure);
    assert(httpResPressure.status === 200, 'HTTP pressure query must return 200');
    assert(httpResPressure.body.pushPressure.netPush > 0.40, 'Push pressure must be elevated');

    // 4f. HTTP Unknown Settlement -> 404
    const httpResUnknown = makeResponse();
    activeServer._routeHttpPost('/api/v1/settlement/pressure/query', {
        settlementId: 'ghost_settlement'
    }, httpResUnknown);
    assert(httpResUnknown.status === 404, 'Unknown settlement must return 404');
    assert(httpResUnknown.body.code === ERROR_CODES.UNKNOWN_SETTLEMENT, 'Error code must be UNKNOWN_SETTLEMENT');

    // 4g. HTTP Migration Wave
    const httpResWave = makeResponse();
    activeServer._routeHttpPost('/api/v1/settlement/migration/wave', {
        sourceId: 'http_haven_src',
        destId: 'http_haven_dest',
        corridorDanger: 0.05
    }, httpResWave);
    assert(httpResWave.status === 200, 'HTTP migration wave must return 200');
    assert(httpResWave.body.status === 'DISPATCHED', 'HTTP wave status must be DISPATCHED');
    assert(httpResWave.body.party !== null, 'Party must exist');
    console.log('  * HTTP REST economy and settlement routes match WebSocket semantics: PASS');

    // -------------------------------------------------------------------------
    // 5. Validation Failure Boundaries
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 5: Validation Failure Boundaries ---');

    // Missing settlementId
    const resBad1 = makeResponse();
    activeServer._routeHttpPost('/api/v1/economy/market/register', {}, resBad1);
    assert(resBad1.status === 400, 'Empty register body must return 400');
    assert(resBad1.body.code === ERROR_CODES.VALIDATION_FAILED, 'Code must be VALIDATION_FAILED');

    // Invalid trade amount
    const resBad2 = makeResponse();
    activeServer._routeHttpPost('/api/v1/economy/trade', {
        sourceId: 'http_market_val',
        destId: 'http_market_dest',
        commodity: 'FOOD',
        amount: -5
    }, resBad2);
    assert(resBad2.status === 400, 'Negative trade amount must return 400');
    assert(resBad2.body.code === ERROR_CODES.VALIDATION_FAILED, 'Code must be VALIDATION_FAILED');

    // Missing destination for migration
    const resBad3 = makeResponse();
    activeServer._routeHttpPost('/api/v1/settlement/migration/wave', {
        sourceId: 'http_haven_src'
    }, resBad3);
    assert(resBad3.status === 400, 'Missing destination must return 400');
    assert(resBad3.body.code === ERROR_CODES.VALIDATION_FAILED, 'Code must be VALIDATION_FAILED');
    console.log('  * Validation failures rejected cleanly with 400 VALIDATION_FAILED: PASS');

    // -------------------------------------------------------------------------
    // 6. Population Conservation & Host Authority Immutability
    // -------------------------------------------------------------------------
    console.log('\n--- Suite 6: Population Conservation & Host Authority Invariant ---');

    // Total initial population for all 4 registered settlements = 180 + 60 + 200 + 40 = 480
    const initialTotal = 180 + 60 + 200 + 40;
    const auditResult = activeServer.simulation.auditPopulationConservation(initialTotal);
    assert(auditResult.isConserved === true, `Population must be strictly conserved: accounted=${auditResult.accountedTotal}, initial=${auditResult.initialTotal}`);
    console.log(`  * Population strictly conserved (${auditResult.accountedTotal}/${auditResult.initialTotal}): PASS`);

    // Host entity immutability check
    const mockHostEntity = {
        id: 'ws_agri_hub',
        transform: { position: { x: 100, y: 0, z: -50 }, rotation: { yaw: 45 } },
        physics: { velocity: { vx: 0, vy: 0, vz: 0 }, mass: 1000 },
        inventory: { canonicalFood: 500 }
    };
    const immutabilityAudit = activeServer.simulation.auditMacroSettlementImmutability(mockHostEntity);
    assert(immutabilityAudit.intact === true, 'Host entity must remain 100% intact');
    assert(immutabilityAudit.physicsMutations === 0, 'Host physics mutations must be 0');
    assert(immutabilityAudit.transformMutations === 0, 'Host transform mutations must be 0');
    console.log('  * Host Game Authority Invariant strictly preserved (0 physics/transform mutations): PASS');

    console.log('\n============================================================');
    console.log('ALL FEAR SERVER MACRO & SETTLEMENT CHECKS PASSED');
    console.log('============================================================');
}

main().catch((err) => {
    console.error('PROBE FAILED:', err);
    process.exit(1);
});
