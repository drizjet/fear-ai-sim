/** Epistemic belief control routes; ingress security and identity remain upstream. */
import { MESSAGE_TYPES, ERROR_CODES, ProtocolValidator } from '../../protocol/index.js';

export function dispatchWsEpistemicMessage(server, ws, payload, correlationId) {
    switch (payload.type) {
        case MESSAGE_TYPES.EPISTEMIC_OBSERVE_REQUEST: {
            if (!server.simulation.enableEpistemicBelief) {
                server._sendWsError(
                    ws,
                    'EPISTEMIC_BELIEF_DISABLED: Server simulation constructed without enableEpistemicBelief: true.',
                    ERROR_CODES.EPISTEMIC_BELIEF_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const engine = server.simulation.recordEpistemicObservation(payload.agentId, payload.observations);
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.EPISTEMIC_OBSERVE_RESPONSE,
                    status: 'OBSERVED',
                    agentId: payload.agentId,
                    believedThreatsCount: engine.threatBeliefs.size,
                    contradictionsCount: engine.contradictionLog.length
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }

        case MESSAGE_TYPES.EPISTEMIC_RUMOR_REQUEST: {
            if (!server.simulation.enableEpistemicBelief) {
                server._sendWsError(
                    ws,
                    'EPISTEMIC_BELIEF_DISABLED: Server simulation constructed without enableEpistemicBelief: true.',
                    ERROR_CODES.EPISTEMIC_BELIEF_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const engine = server.simulation.recordEpistemicRumor(payload.agentId, payload.message, payload.senderTrust);
                const belief = engine.threatBeliefs.get(payload.message.id)
                    || engine.routeBeliefs.get(payload.message.id)
                    || engine.factionBeliefs.get(payload.message.id)
                    || engine.sanctuaryBeliefs.get(payload.message.id)
                    || null;
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.EPISTEMIC_RUMOR_RESPONSE,
                    status: 'INGESTED',
                    agentId: payload.agentId,
                    messageId: payload.message.id,
                    belief
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }

        case MESSAGE_TYPES.EPISTEMIC_DISCREPANCY_QUERY_REQUEST: {
            if (!server.simulation.enableEpistemicBelief) {
                server._sendWsError(
                    ws,
                    'EPISTEMIC_BELIEF_DISABLED: Server simulation constructed without enableEpistemicBelief: true.',
                    ERROR_CODES.EPISTEMIC_BELIEF_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const report = server.simulation.evaluateEpistemicDiscrepancy(payload.agentId, payload.worldGroundTruth);
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.EPISTEMIC_DISCREPANCY_QUERY_RESPONSE,
                    agentId: payload.agentId,
                    discrepancy: report
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }

        case MESSAGE_TYPES.EPISTEMIC_SUBJECTIVE_QUERY_REQUEST: {
            if (!server.simulation.enableEpistemicBelief) {
                server._sendWsError(
                    ws,
                    'EPISTEMIC_BELIEF_DISABLED: Server simulation constructed without enableEpistemicBelief: true.',
                    ERROR_CODES.EPISTEMIC_BELIEF_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const subjective = server.simulation.getSubjectiveObservations(payload.agentId);
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.EPISTEMIC_SUBJECTIVE_QUERY_RESPONSE,
                    agentId: payload.agentId,
                    subjectiveObservations: subjective
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }
        default: throw new Error('Unknown epistemic control route: ' + payload.type);
    }
}
