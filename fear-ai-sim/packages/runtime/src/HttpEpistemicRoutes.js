/** Epistemic belief control routes; ingress security and identity remain upstream. */
import { MESSAGE_TYPES, ERROR_CODES, ProtocolValidator } from '../../protocol/index.js';

export function dispatchHttpEpistemicPost(server, path, body, res) {
    switch (path) {
        case '/api/v1/epistemic/observe': {
            const val = ProtocolValidator.validateEpistemicObserve(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.enableEpistemicBelief) {
                return server._sendJson(res, 400, {
                    error: 'EPISTEMIC_BELIEF_DISABLED: Server simulation constructed without enableEpistemicBelief: true.',
                    code: ERROR_CODES.EPISTEMIC_BELIEF_DISABLED
                });
            }
            try {
                const engine = server.simulation.recordEpistemicObservation(val.value.agentId, val.value.observations);
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.EPISTEMIC_OBSERVE_RESPONSE,
                    status: 'OBSERVED',
                    agentId: val.value.agentId,
                    believedThreatsCount: engine.threatBeliefs.size,
                    contradictionsCount: engine.contradictionLog.length
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }

        case '/api/v1/epistemic/rumor': {
            const val = ProtocolValidator.validateEpistemicRumor(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.enableEpistemicBelief) {
                return server._sendJson(res, 400, {
                    error: 'EPISTEMIC_BELIEF_DISABLED: Server simulation constructed without enableEpistemicBelief: true.',
                    code: ERROR_CODES.EPISTEMIC_BELIEF_DISABLED
                });
            }
            try {
                const engine = server.simulation.recordEpistemicRumor(val.value.agentId, val.value.message, val.value.senderTrust);
                const belief = engine.threatBeliefs.get(val.value.message.id)
                    || engine.routeBeliefs.get(val.value.message.id)
                    || engine.factionBeliefs.get(val.value.message.id)
                    || engine.sanctuaryBeliefs.get(val.value.message.id)
                    || null;
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.EPISTEMIC_RUMOR_RESPONSE,
                    status: 'INGESTED',
                    agentId: val.value.agentId,
                    messageId: val.value.message.id,
                    belief
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }

        case '/api/v1/epistemic/discrepancy/query': {
            const val = ProtocolValidator.validateEpistemicDiscrepancyQuery(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.enableEpistemicBelief) {
                return server._sendJson(res, 400, {
                    error: 'EPISTEMIC_BELIEF_DISABLED: Server simulation constructed without enableEpistemicBelief: true.',
                    code: ERROR_CODES.EPISTEMIC_BELIEF_DISABLED
                });
            }
            try {
                const report = server.simulation.evaluateEpistemicDiscrepancy(val.value.agentId, val.value.worldGroundTruth);
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.EPISTEMIC_DISCREPANCY_QUERY_RESPONSE,
                    agentId: val.value.agentId,
                    discrepancy: report
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }

        case '/api/v1/epistemic/subjective/query': {
            const val = ProtocolValidator.validateEpistemicSubjectiveQuery(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.enableEpistemicBelief) {
                return server._sendJson(res, 400, {
                    error: 'EPISTEMIC_BELIEF_DISABLED: Server simulation constructed without enableEpistemicBelief: true.',
                    code: ERROR_CODES.EPISTEMIC_BELIEF_DISABLED
                });
            }
            try {
                const subjective = server.simulation.getSubjectiveObservations(val.value.agentId);
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.EPISTEMIC_SUBJECTIVE_QUERY_RESPONSE,
                    agentId: val.value.agentId,
                    subjectiveObservations: subjective
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }
        default: throw new Error('Unknown epistemic control route: ' + path);
    }
}
