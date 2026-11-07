/** Economy and settlement control routes, invoked after transport security boundaries. */
import { MESSAGE_TYPES, ERROR_CODES, ProtocolValidator } from '../../protocol/index.js';

export function dispatchWsMacroMessage(server, ws, payload, correlationId) {
    switch (payload.type) {
        case MESSAGE_TYPES.ECONOMY_REGISTER_MARKET_REQUEST: {
            if (!server.simulation.economicFeedback) {
                server._sendWsError(
                    ws,
                    'ECONOMIC_FEEDBACK_DISABLED: Server simulation constructed without enableEconomicFeedback: true.',
                    ERROR_CODES.ECONOMIC_FEEDBACK_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const market = server.simulation.registerSettlementMarket(payload.settlementId, payload.options);
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.ECONOMY_REGISTER_MARKET_RESPONSE,
                    status: 'REGISTERED',
                    settlementId: payload.settlementId,
                    market
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }

        case MESSAGE_TYPES.ECONOMY_TRADE_REQUEST: {
            if (!server.simulation.economicFeedback) {
                server._sendWsError(
                    ws,
                    'ECONOMIC_FEEDBACK_DISABLED: Server simulation constructed without enableEconomicFeedback: true.',
                    ERROR_CODES.ECONOMIC_FEEDBACK_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const success = server.simulation.recordTradeTransaction(
                    payload.sourceId,
                    payload.destId,
                    payload.commodity,
                    payload.amount
                );
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.ECONOMY_TRADE_RESPONSE,
                    status: success ? 'RECORDED' : 'FAILED',
                    sourceId: payload.sourceId,
                    destId: payload.destId,
                    commodity: payload.commodity,
                    amount: payload.amount,
                    success
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }

        case MESSAGE_TYPES.ECONOMY_RAID_QUERY_REQUEST: {
            if (!server.simulation.economicFeedback) {
                server._sendWsError(
                    ws,
                    'ECONOMIC_FEEDBACK_DISABLED: Server simulation constructed without enableEconomicFeedback: true.',
                    ERROR_CODES.ECONOMIC_FEEDBACK_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const raidDesirability = server.simulation.calculateRaidDesirability(payload.settlementId);
                const marketSummary = server.simulation.getMarketSummary(payload.settlementId);
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.ECONOMY_RAID_QUERY_RESPONSE,
                    settlementId: payload.settlementId,
                    raidDesirability,
                    marketSummary
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }

        case MESSAGE_TYPES.SETTLEMENT_REGISTER_REQUEST: {
            if (!server.simulation.settlementMigration) {
                server._sendWsError(
                    ws,
                    'SETTLEMENT_MIGRATION_DISABLED: Server simulation constructed without enableSettlementMigration: true.',
                    ERROR_CODES.SETTLEMENT_MIGRATION_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const settlement = server.simulation.registerSettlement(payload.settlementId, payload.data);
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.SETTLEMENT_REGISTER_RESPONSE,
                    status: 'REGISTERED',
                    settlementId: payload.settlementId,
                    settlement
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }

        case MESSAGE_TYPES.SETTLEMENT_PRESSURE_QUERY_REQUEST: {
            if (!server.simulation.settlementMigration) {
                server._sendWsError(
                    ws,
                    'SETTLEMENT_MIGRATION_DISABLED: Server simulation constructed without enableSettlementMigration: true.',
                    ERROR_CODES.SETTLEMENT_MIGRATION_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const state = server.simulation.getSettlementMigrationState(payload.settlementId);
                if (!state) {
                    server._sendWsError(
                        ws,
                        `UNKNOWN_SETTLEMENT: settlement ${payload.settlementId} does not exist.`,
                        ERROR_CODES.UNKNOWN_SETTLEMENT,
                        correlationId
                    );
                    return;
                }
                const pushPressure = server.simulation.evaluatePushPressure(payload.settlementId);
                const pullAttraction = server.simulation.evaluatePullAttraction(payload.settlementId, payload.corridorDanger);
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.SETTLEMENT_PRESSURE_QUERY_RESPONSE,
                    settlementId: payload.settlementId,
                    pushPressure,
                    pullAttraction,
                    state
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }

        case MESSAGE_TYPES.SETTLEMENT_MIGRATION_WAVE_REQUEST: {
            if (!server.simulation.settlementMigration) {
                server._sendWsError(
                    ws,
                    'SETTLEMENT_MIGRATION_DISABLED: Server simulation constructed without enableSettlementMigration: true.',
                    ERROR_CODES.SETTLEMENT_MIGRATION_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const party = server.simulation.triggerMigrationWave(
                    payload.sourceId,
                    payload.destId,
                    payload.corridorDanger
                );
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.SETTLEMENT_MIGRATION_WAVE_RESPONSE,
                    status: party ? 'DISPATCHED' : 'NO_MIGRATION',
                    sourceId: payload.sourceId,
                    destId: payload.destId,
                    party
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }
        default: throw new Error('Unknown macro control route: ' + payload.type);
    }
}
