/** Persona routes; HTTP signing and WS identity/signing/validation remain at ingress. */
import { MESSAGE_TYPES, ERROR_CODES, ProtocolValidator } from '../../protocol/index.js';

const PERSONA_DISABLED_MESSAGE = 'PERSONA_SIGNATURES_DISABLED: Server simulation constructed without enablePersonaSignatures: true.';

export function dispatchHttpPersonaPost(server, path, body, res) {
    switch (path) {
        case '/api/v1/persona/signature/query': {
            const val = ProtocolValidator.validatePersonaSignatureQuery(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.enablePersonaSignatures) {
                return server._sendJson(res, 400, {
                    error: PERSONA_DISABLED_MESSAGE,
                    code: ERROR_CODES.PERSONA_SIGNATURES_DISABLED
                });
            }
            try {
                const result = server.simulation.computeAgentPersonaSignature(val.value.agentId);
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.PERSONA_SIGNATURE_QUERY_RESPONSE,
                    ...result
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }

        case '/api/v1/persona/reaction/query': {
            const val = ProtocolValidator.validatePersonaReactionQuery(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.enablePersonaSignatures) {
                return server._sendJson(res, 400, {
                    error: PERSONA_DISABLED_MESSAGE,
                    code: ERROR_CODES.PERSONA_SIGNATURES_DISABLED
                });
            }
            try {
                const result = server.simulation.evaluateAgentReaction(val.value.agentId, val.value.probeValue);
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.PERSONA_REACTION_QUERY_RESPONSE,
                    ...result
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }

        case '/api/v1/persona/distance/query': {
            const val = ProtocolValidator.validatePersonaDistanceQuery(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.enablePersonaSignatures) {
                return server._sendJson(res, 400, {
                    error: PERSONA_DISABLED_MESSAGE,
                    code: ERROR_CODES.PERSONA_SIGNATURES_DISABLED
                });
            }
            try {
                const result = server.simulation.computeAgentPersonaDistance(val.value.agentIdA, val.value.agentIdB);
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.PERSONA_DISTANCE_QUERY_RESPONSE,
                    ...result
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }

        case '/api/v1/persona/identify': {
            const val = ProtocolValidator.validatePersonaIdentify(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.enablePersonaSignatures) {
                return server._sendJson(res, 400, {
                    error: PERSONA_DISABLED_MESSAGE,
                    code: ERROR_CODES.PERSONA_SIGNATURES_DISABLED
                });
            }
            try {
                const result = server.simulation.identifyAgentPersona(val.value.agentId, val.value.candidateIds);
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.PERSONA_IDENTIFY_RESPONSE,
                    ...result
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }

        case '/api/v1/persona/collapse/query': {
            const val = ProtocolValidator.validatePersonaCollapseQuery(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.enablePersonaSignatures) {
                return server._sendJson(res, 400, {
                    error: PERSONA_DISABLED_MESSAGE,
                    code: ERROR_CODES.PERSONA_SIGNATURES_DISABLED
                });
            }
            try {
                const result = server.simulation.evaluateAgentPersonaCollapse(val.value.agentId, val.value.populationIds);
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.PERSONA_COLLAPSE_QUERY_RESPONSE,
                    ...result
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }
        default: throw new Error('Unhandled persona route: ' + path);
    }
}
