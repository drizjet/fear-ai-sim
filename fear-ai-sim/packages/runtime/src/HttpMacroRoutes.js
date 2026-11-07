/** Economy and settlement control routes, invoked after transport security boundaries. */
import { MESSAGE_TYPES, ERROR_CODES, ProtocolValidator } from '../../protocol/index.js';

export function dispatchHttpMacroPost(server, path, body, res) {
    switch (path) {
        case '/api/v1/economy/market/register': {
            const val = ProtocolValidator.validateEconomyRegisterMarket(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.economicFeedback) {
                return server._sendJson(res, 400, {
                    error: 'ECONOMIC_FEEDBACK_DISABLED: Server simulation constructed without enableEconomicFeedback: true.',
                    code: ERROR_CODES.ECONOMIC_FEEDBACK_DISABLED
                });
            }
            try {
                const market = server.simulation.registerSettlementMarket(val.value.settlementId, val.value.options);
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.ECONOMY_REGISTER_MARKET_RESPONSE,
                    status: 'REGISTERED',
                    settlementId: val.value.settlementId,
                    market
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }

        case '/api/v1/economy/trade': {
            const val = ProtocolValidator.validateEconomyTrade(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.economicFeedback) {
                return server._sendJson(res, 400, {
                    error: 'ECONOMIC_FEEDBACK_DISABLED: Server simulation constructed without enableEconomicFeedback: true.',
                    code: ERROR_CODES.ECONOMIC_FEEDBACK_DISABLED
                });
            }
            try {
                const success = server.simulation.recordTradeTransaction(
                    val.value.sourceId,
                    val.value.destId,
                    val.value.commodity,
                    val.value.amount
                );
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.ECONOMY_TRADE_RESPONSE,
                    status: success ? 'RECORDED' : 'FAILED',
                    sourceId: val.value.sourceId,
                    destId: val.value.destId,
                    commodity: val.value.commodity,
                    amount: val.value.amount,
                    success
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }

        case '/api/v1/economy/raid/query': {
            const val = ProtocolValidator.validateEconomyRaidQuery(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.economicFeedback) {
                return server._sendJson(res, 400, {
                    error: 'ECONOMIC_FEEDBACK_DISABLED: Server simulation constructed without enableEconomicFeedback: true.',
                    code: ERROR_CODES.ECONOMIC_FEEDBACK_DISABLED
                });
            }
            try {
                const raidDesirability = server.simulation.calculateRaidDesirability(val.value.settlementId);
                const marketSummary = server.simulation.getMarketSummary(val.value.settlementId);
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.ECONOMY_RAID_QUERY_RESPONSE,
                    settlementId: val.value.settlementId,
                    raidDesirability,
                    marketSummary
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }

        case '/api/v1/settlement/register': {
            const val = ProtocolValidator.validateSettlementRegister(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.settlementMigration) {
                return server._sendJson(res, 400, {
                    error: 'SETTLEMENT_MIGRATION_DISABLED: Server simulation constructed without enableSettlementMigration: true.',
                    code: ERROR_CODES.SETTLEMENT_MIGRATION_DISABLED
                });
            }
            try {
                const settlement = server.simulation.registerSettlement(val.value.settlementId, val.value.data);
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.SETTLEMENT_REGISTER_RESPONSE,
                    status: 'REGISTERED',
                    settlementId: val.value.settlementId,
                    settlement
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }

        case '/api/v1/settlement/pressure/query': {
            const val = ProtocolValidator.validateSettlementPressureQuery(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.settlementMigration) {
                return server._sendJson(res, 400, {
                    error: 'SETTLEMENT_MIGRATION_DISABLED: Server simulation constructed without enableSettlementMigration: true.',
                    code: ERROR_CODES.SETTLEMENT_MIGRATION_DISABLED
                });
            }
            try {
                const state = server.simulation.getSettlementMigrationState(val.value.settlementId);
                if (!state) {
                    return server._sendJson(res, 404, {
                        error: `UNKNOWN_SETTLEMENT: settlement ${val.value.settlementId} does not exist.`,
                        code: ERROR_CODES.UNKNOWN_SETTLEMENT
                    });
                }
                const pushPressure = server.simulation.evaluatePushPressure(val.value.settlementId);
                const pullAttraction = server.simulation.evaluatePullAttraction(val.value.settlementId, val.value.corridorDanger);
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.SETTLEMENT_PRESSURE_QUERY_RESPONSE,
                    settlementId: val.value.settlementId,
                    pushPressure,
                    pullAttraction,
                    state
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }

        case '/api/v1/settlement/migration/wave': {
            const val = ProtocolValidator.validateSettlementMigrationWave(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.settlementMigration) {
                return server._sendJson(res, 400, {
                    error: 'SETTLEMENT_MIGRATION_DISABLED: Server simulation constructed without enableSettlementMigration: true.',
                    code: ERROR_CODES.SETTLEMENT_MIGRATION_DISABLED
                });
            }
            try {
                const party = server.simulation.triggerMigrationWave(
                    val.value.sourceId,
                    val.value.destId,
                    val.value.corridorDanger
                );
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.SETTLEMENT_MIGRATION_WAVE_RESPONSE,
                    status: party ? 'DISPATCHED' : 'NO_MIGRATION',
                    sourceId: val.value.sourceId,
                    destId: val.value.destId,
                    party
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }
        default: throw new Error('Unknown macro control route: ' + path);
    }
}
