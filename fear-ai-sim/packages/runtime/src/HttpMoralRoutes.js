/** Moral dissonance routes. HTTP signature and WS identity/signing/validation remain at ingress. */
import { MESSAGE_TYPES, ERROR_CODES, ProtocolValidator } from '../../protocol/index.js';

export function dispatchHttpMoralPost(server, path, body, res) {
    switch (path) {
        case '/api/v1/moral/profile/register': {
            const val = ProtocolValidator.validateMoralProfileRegister(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.enableMoralDissonance) {
                return server._sendJson(res, 400, {
                    error: 'MORAL_DISSONANCE_DISABLED: Server simulation constructed without enableMoralDissonance: true.',
                    code: ERROR_CODES.MORAL_DISSONANCE_DISABLED
                });
            }
            try {
                const profile = server.simulation.registerAgentMoralProfile(val.value.agentId, val.value.profile);
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.MORAL_PROFILE_REGISTER_RESPONSE,
                    status: 'REGISTERED',
                    agentId: val.value.agentId,
                    profile
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }

        case '/api/v1/moral/dissonance/query': {
            const val = ProtocolValidator.validateMoralDissonanceQuery(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.enableMoralDissonance) {
                return server._sendJson(res, 400, {
                    error: 'MORAL_DISSONANCE_DISABLED: Server simulation constructed without enableMoralDissonance: true.',
                    code: ERROR_CODES.MORAL_DISSONANCE_DISABLED
                });
            }
            try {
                const evaluation = server.simulation.computeMoralDissonance(
                    val.value.agentId,
                    val.value.transgressionType,
                    val.value.context
                );
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.MORAL_DISSONANCE_QUERY_RESPONSE,
                    agentId: val.value.agentId,
                    dissonance: evaluation
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }

        case '/api/v1/moral/transgression': {
            const val = ProtocolValidator.validateMoralTransgression(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.enableMoralDissonance) {
                return server._sendJson(res, 400, {
                    error: 'MORAL_DISSONANCE_DISABLED: Server simulation constructed without enableMoralDissonance: true.',
                    code: ERROR_CODES.MORAL_DISSONANCE_DISABLED
                });
            }
            try {
                const report = server.simulation.recordMoralTransgression(
                    val.value.agentId,
                    val.value.transgressionType,
                    val.value.context
                );
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.MORAL_TRANSGRESSION_RESPONSE,
                    status: 'RECORDED',
                    agentId: val.value.agentId,
                    transgression: report
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }

        case '/api/v1/moral/atonement': {
            const val = ProtocolValidator.validateMoralAtonement(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.enableMoralDissonance) {
                return server._sendJson(res, 400, {
                    error: 'MORAL_DISSONANCE_DISABLED: Server simulation constructed without enableMoralDissonance: true.',
                    code: ERROR_CODES.MORAL_DISSONANCE_DISABLED
                });
            }
            try {
                const report = server.simulation.recordMoralAtonement(
                    val.value.agentId,
                    val.value.atonementType,
                    val.value.context
                );
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.MORAL_ATONEMENT_RESPONSE,
                    status: 'RECORDED',
                    agentId: val.value.agentId,
                    atonement: report
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }

        case '/api/v1/moral/order/compliance': {
            const val = ProtocolValidator.validateMoralOrderCompliance(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.enableMoralDissonance) {
                return server._sendJson(res, 400, {
                    error: 'MORAL_DISSONANCE_DISABLED: Server simulation constructed without enableMoralDissonance: true.',
                    code: ERROR_CODES.MORAL_DISSONANCE_DISABLED
                });
            }
            try {
                const compliance = server.simulation.evaluateMoralOrderCompliance(
                    val.value.agentId,
                    val.value.proposedTransgression,
                    val.value.context
                );
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.MORAL_ORDER_COMPLIANCE_RESPONSE,
                    agentId: val.value.agentId,
                    compliance
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }

        case '/api/v1/moral/state/query': {
            const val = ProtocolValidator.validateMoralStateQuery(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.enableMoralDissonance) {
                return server._sendJson(res, 400, {
                    error: 'MORAL_DISSONANCE_DISABLED: Server simulation constructed without enableMoralDissonance: true.',
                    code: ERROR_CODES.MORAL_DISSONANCE_DISABLED
                });
            }
            try {
                const state = server.simulation.getAgentMoralState(val.value.agentId);
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.MORAL_STATE_QUERY_RESPONSE,
                    agentId: val.value.agentId,
                    moralState: state
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }
        default: throw new Error('Unknown moral control route: ' + path);
    }
}
