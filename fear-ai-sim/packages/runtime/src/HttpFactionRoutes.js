/** Faction governance routes. Ingress retains HTTP raw signing, WS identity/signing/typed validation. */
import { MESSAGE_TYPES, ERROR_CODES, ProtocolValidator } from '../../protocol/index.js';

const FACTION_DISABLED_MESSAGE = 'FACTION_GOVERNANCE_DISABLED: Server simulation constructed without enableFactionGovernance: true.';

export function dispatchHttpFactionPost(server, path, body, res) {
    switch (path) {
        case '/api/v1/faction/register': {
            const val = ProtocolValidator.validateFactionRegister(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.enableFactionGovernance) {
                return server._sendJson(res, 400, {
                    error: FACTION_DISABLED_MESSAGE,
                    code: ERROR_CODES.FACTION_GOVERNANCE_DISABLED
                });
            }
            try {
                const system = server.simulation.registerFaction(val.value.factionId, val.value.archetype, val.value.options);
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.FACTION_REGISTER_RESPONSE,
                    status: 'REGISTERED',
                    factionId: val.value.factionId,
                    archetype: system.archetype,
                    currentDirective: system.currentDirective
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }

        case '/api/v1/faction/deliberate': {
            const val = ProtocolValidator.validateFactionDeliberate(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.enableFactionGovernance) {
                return server._sendJson(res, 400, {
                    error: FACTION_DISABLED_MESSAGE,
                    code: ERROR_CODES.FACTION_GOVERNANCE_DISABLED
                });
            }
            try {
                const deliberation = server.simulation.deliberateFactionIncident(val.value.factionId, val.value.incident, val.value.context);
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.FACTION_DELIBERATE_RESPONSE,
                    factionId: val.value.factionId,
                    deliberation
                });
            } catch (err) {
                const isUnknown = err.message && err.message.includes('UNKNOWN_FACTION');
                return server._sendJson(res, isUnknown ? 404 : 400, {
                    error: err.message,
                    code: isUnknown ? ERROR_CODES.UNKNOWN_FACTION : ERROR_CODES.SIMULATION_ERROR
                });
            }
        }

        case '/api/v1/faction/directives': {
            const val = ProtocolValidator.validateFactionDirectivesQuery(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.enableFactionGovernance) {
                return server._sendJson(res, 400, {
                    error: FACTION_DISABLED_MESSAGE,
                    code: ERROR_CODES.FACTION_GOVERNANCE_DISABLED
                });
            }
            try {
                if (val.value.factionId) {
                    const gov = server.simulation.getFactionGovernance(val.value.factionId);
                    if (!gov) {
                        return server._sendJson(res, 404, {
                            error: `UNKNOWN_FACTION: faction ${val.value.factionId} does not exist.`,
                            code: ERROR_CODES.UNKNOWN_FACTION
                        });
                    }
                    return server._sendJson(res, 200, {
                        type: MESSAGE_TYPES.FACTION_DIRECTIVES_QUERY_RESPONSE,
                        factionId: val.value.factionId,
                        directive: gov.currentDirective,
                        grievanceLevel: gov.grievanceLevel
                    });
                } else {
                    const directives = server.simulation.getAllFactionDirectives();
                    return server._sendJson(res, 200, {
                        type: MESSAGE_TYPES.FACTION_DIRECTIVES_QUERY_RESPONSE,
                        factionId: null,
                        directives
                    });
                }
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }

        case '/api/v1/faction/composure': {
            const val = ProtocolValidator.validateFactionComposureQuery(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.enableFactionGovernance) {
                return server._sendJson(res, 400, {
                    error: FACTION_DISABLED_MESSAGE,
                    code: ERROR_CODES.FACTION_GOVERNANCE_DISABLED
                });
            }
            try {
                const composure = server.simulation.getFactionComposure(val.value.factionId, val.value.state);
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.FACTION_COMPOSURE_QUERY_RESPONSE,
                    factionId: val.value.factionId,
                    composure
                });
            } catch (err) {
                const isUnknown = err.message && err.message.includes('UNKNOWN_FACTION');
                return server._sendJson(res, isUnknown ? 404 : 400, {
                    error: err.message,
                    code: isUnknown ? ERROR_CODES.UNKNOWN_FACTION : ERROR_CODES.SIMULATION_ERROR
                });
            }
        }
        default: throw new Error('Unhandled faction route: ' + path);
    }
}
