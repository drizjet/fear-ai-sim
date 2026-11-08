/** Persona routes; HTTP signing and WS identity/signing/validation remain at ingress. */
import { MESSAGE_TYPES, ERROR_CODES } from '../../protocol/index.js';

const PERSONA_DISABLED_MESSAGE = 'PERSONA_SIGNATURES_DISABLED: Server simulation constructed without enablePersonaSignatures: true.';

export function dispatchWsPersonaMessage(server, ws, payload, correlationId) {
    switch (payload.type) {
        case MESSAGE_TYPES.PERSONA_SIGNATURE_QUERY_REQUEST: {
            if (!server.simulation.enablePersonaSignatures) {
                server._sendWsError(
                    ws,
                    PERSONA_DISABLED_MESSAGE,
                    ERROR_CODES.PERSONA_SIGNATURES_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const result = server.simulation.computeAgentPersonaSignature(payload.agentId);
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.PERSONA_SIGNATURE_QUERY_RESPONSE,
                    ...result
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }

        case MESSAGE_TYPES.PERSONA_REACTION_QUERY_REQUEST: {
            if (!server.simulation.enablePersonaSignatures) {
                server._sendWsError(
                    ws,
                    PERSONA_DISABLED_MESSAGE,
                    ERROR_CODES.PERSONA_SIGNATURES_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const result = server.simulation.evaluateAgentReaction(payload.agentId, payload.probeValue);
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.PERSONA_REACTION_QUERY_RESPONSE,
                    ...result
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }

        case MESSAGE_TYPES.PERSONA_DISTANCE_QUERY_REQUEST: {
            if (!server.simulation.enablePersonaSignatures) {
                server._sendWsError(
                    ws,
                    PERSONA_DISABLED_MESSAGE,
                    ERROR_CODES.PERSONA_SIGNATURES_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const result = server.simulation.computeAgentPersonaDistance(payload.agentIdA, payload.agentIdB);
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.PERSONA_DISTANCE_QUERY_RESPONSE,
                    ...result
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }

        case MESSAGE_TYPES.PERSONA_IDENTIFY_REQUEST: {
            if (!server.simulation.enablePersonaSignatures) {
                server._sendWsError(
                    ws,
                    PERSONA_DISABLED_MESSAGE,
                    ERROR_CODES.PERSONA_SIGNATURES_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const result = server.simulation.identifyAgentPersona(payload.agentId, payload.candidateIds);
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.PERSONA_IDENTIFY_RESPONSE,
                    ...result
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }

        case MESSAGE_TYPES.PERSONA_COLLAPSE_QUERY_REQUEST: {
            if (!server.simulation.enablePersonaSignatures) {
                server._sendWsError(
                    ws,
                    PERSONA_DISABLED_MESSAGE,
                    ERROR_CODES.PERSONA_SIGNATURES_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const result = server.simulation.evaluateAgentPersonaCollapse(payload.agentId, payload.populationIds);
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.PERSONA_COLLAPSE_QUERY_RESPONSE,
                    ...result
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }
        default: throw new Error('Unhandled persona route: ' + payload.type);
    }
}
