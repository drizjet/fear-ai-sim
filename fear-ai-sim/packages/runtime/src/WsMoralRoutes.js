/** Moral dissonance routes. HTTP signature and WS identity/signing/validation remain at ingress. */
import { MESSAGE_TYPES, ERROR_CODES, ProtocolValidator } from '../../protocol/index.js';

export function dispatchWsMoralMessage(server, ws, payload, correlationId) {
    switch (payload.type) {
        case MESSAGE_TYPES.MORAL_PROFILE_REGISTER_REQUEST: {
            if (!server.simulation.enableMoralDissonance) {
                server._sendWsError(
                    ws,
                    'MORAL_DISSONANCE_DISABLED: Server simulation constructed without enableMoralDissonance: true.',
                    ERROR_CODES.MORAL_DISSONANCE_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const profile = server.simulation.registerAgentMoralProfile(payload.agentId, payload.profile);
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.MORAL_PROFILE_REGISTER_RESPONSE,
                    status: 'REGISTERED',
                    agentId: payload.agentId,
                    profile
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }

        case MESSAGE_TYPES.MORAL_DISSONANCE_QUERY_REQUEST: {
            if (!server.simulation.enableMoralDissonance) {
                server._sendWsError(
                    ws,
                    'MORAL_DISSONANCE_DISABLED: Server simulation constructed without enableMoralDissonance: true.',
                    ERROR_CODES.MORAL_DISSONANCE_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const evaluation = server.simulation.computeMoralDissonance(
                    payload.agentId,
                    payload.transgressionType,
                    payload.context
                );
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.MORAL_DISSONANCE_QUERY_RESPONSE,
                    agentId: payload.agentId,
                    dissonance: evaluation
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }

        case MESSAGE_TYPES.MORAL_TRANSGRESSION_REQUEST: {
            if (!server.simulation.enableMoralDissonance) {
                server._sendWsError(
                    ws,
                    'MORAL_DISSONANCE_DISABLED: Server simulation constructed without enableMoralDissonance: true.',
                    ERROR_CODES.MORAL_DISSONANCE_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const report = server.simulation.recordMoralTransgression(
                    payload.agentId,
                    payload.transgressionType,
                    payload.context
                );
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.MORAL_TRANSGRESSION_RESPONSE,
                    status: 'RECORDED',
                    agentId: payload.agentId,
                    transgression: report
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }

        case MESSAGE_TYPES.MORAL_ATONEMENT_REQUEST: {
            if (!server.simulation.enableMoralDissonance) {
                server._sendWsError(
                    ws,
                    'MORAL_DISSONANCE_DISABLED: Server simulation constructed without enableMoralDissonance: true.',
                    ERROR_CODES.MORAL_DISSONANCE_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const report = server.simulation.recordMoralAtonement(
                    payload.agentId,
                    payload.atonementType,
                    payload.context
                );
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.MORAL_ATONEMENT_RESPONSE,
                    status: 'RECORDED',
                    agentId: payload.agentId,
                    atonement: report
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }

        case MESSAGE_TYPES.MORAL_ORDER_COMPLIANCE_REQUEST: {
            if (!server.simulation.enableMoralDissonance) {
                server._sendWsError(
                    ws,
                    'MORAL_DISSONANCE_DISABLED: Server simulation constructed without enableMoralDissonance: true.',
                    ERROR_CODES.MORAL_DISSONANCE_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const compliance = server.simulation.evaluateMoralOrderCompliance(
                    payload.agentId,
                    payload.proposedTransgression,
                    payload.context
                );
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.MORAL_ORDER_COMPLIANCE_RESPONSE,
                    agentId: payload.agentId,
                    compliance
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }

        case MESSAGE_TYPES.MORAL_STATE_QUERY_REQUEST: {
            if (!server.simulation.enableMoralDissonance) {
                server._sendWsError(
                    ws,
                    'MORAL_DISSONANCE_DISABLED: Server simulation constructed without enableMoralDissonance: true.',
                    ERROR_CODES.MORAL_DISSONANCE_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const state = server.simulation.getAgentMoralState(payload.agentId);
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.MORAL_STATE_QUERY_RESPONSE,
                    agentId: payload.agentId,
                    moralState: state
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }
        default: throw new Error('Unknown moral control route: ' + payload.type);
    }
}
