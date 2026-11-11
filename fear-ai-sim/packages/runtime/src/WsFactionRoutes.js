/** Faction governance routes. Ingress retains HTTP raw signing, WS identity/signing/typed validation. */
import { MESSAGE_TYPES, ERROR_CODES } from '../../protocol/index.js';

const FACTION_DISABLED_MESSAGE = 'FACTION_GOVERNANCE_DISABLED: Server simulation constructed without enableFactionGovernance: true.';

export function dispatchWsFactionMessage(server, ws, payload, correlationId) {
    switch (payload.type) {
        case MESSAGE_TYPES.FACTION_REGISTER_REQUEST: {
            if (!server.simulation.enableFactionGovernance) {
                server._sendWsError(
                    ws,
                    FACTION_DISABLED_MESSAGE,
                    ERROR_CODES.FACTION_GOVERNANCE_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const system = server.simulation.registerFaction(payload.factionId, payload.archetype, payload.options);
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.FACTION_REGISTER_RESPONSE,
                    status: 'REGISTERED',
                    factionId: payload.factionId,
                    archetype: system.archetype,
                    currentDirective: system.currentDirective
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }

        case MESSAGE_TYPES.FACTION_DELIBERATE_REQUEST: {
            if (!server.simulation.enableFactionGovernance) {
                server._sendWsError(
                    ws,
                    FACTION_DISABLED_MESSAGE,
                    ERROR_CODES.FACTION_GOVERNANCE_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const deliberation = server.simulation.deliberateFactionIncident(payload.factionId, payload.incident, payload.context);
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.FACTION_DELIBERATE_RESPONSE,
                    factionId: payload.factionId,
                    deliberation
                }, correlationId);
            } catch (err) {
                const isUnknown = err.message && err.message.includes('UNKNOWN_FACTION');
                server._sendWsError(ws, err.message, isUnknown ? ERROR_CODES.UNKNOWN_FACTION : ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }

        case MESSAGE_TYPES.FACTION_DIRECTIVES_QUERY_REQUEST: {
            if (!server.simulation.enableFactionGovernance) {
                server._sendWsError(
                    ws,
                    FACTION_DISABLED_MESSAGE,
                    ERROR_CODES.FACTION_GOVERNANCE_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                if (payload.factionId) {
                    const gov = server.simulation.getFactionGovernance(payload.factionId);
                    if (!gov) {
                        server._sendWsError(ws, `UNKNOWN_FACTION: faction ${payload.factionId} does not exist.`, ERROR_CODES.UNKNOWN_FACTION, correlationId);
                        return;
                    }
                    server._sendWs(ws, {
                        type: MESSAGE_TYPES.FACTION_DIRECTIVES_QUERY_RESPONSE,
                        factionId: payload.factionId,
                        directive: gov.currentDirective,
                        grievanceLevel: gov.grievanceLevel
                    }, correlationId);
                } else {
                    const directives = server.simulation.getAllFactionDirectives();
                    server._sendWs(ws, {
                        type: MESSAGE_TYPES.FACTION_DIRECTIVES_QUERY_RESPONSE,
                        factionId: null,
                        directives
                    }, correlationId);
                }
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }

        case MESSAGE_TYPES.FACTION_COMPOSURE_QUERY_REQUEST: {
            if (!server.simulation.enableFactionGovernance) {
                server._sendWsError(
                    ws,
                    FACTION_DISABLED_MESSAGE,
                    ERROR_CODES.FACTION_GOVERNANCE_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const composure = server.simulation.getFactionComposure(payload.factionId, payload.state);
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.FACTION_COMPOSURE_QUERY_RESPONSE,
                    factionId: payload.factionId,
                    composure
                }, correlationId);
            } catch (err) {
                const isUnknown = err.message && err.message.includes('UNKNOWN_FACTION');
                server._sendWsError(ws, err.message, isUnknown ? ERROR_CODES.UNKNOWN_FACTION : ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }
        default: throw new Error('Unhandled faction route: ' + payload.type);
    }
}
