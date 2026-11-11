/** WebSocket pack commands only; invoked after WsMessagePreflight binds identity, gates signatures and validates. */
import { MESSAGE_TYPES, ERROR_CODES } from '../../protocol/index.js';

export function dispatchWsPackMessage(server, ws, payload, correlationId) {
    switch (payload.type) {
        case MESSAGE_TYPES.PACK_CREATE_REQUEST: {
            if (!server.simulation.packCoordination) {
                server._sendWsError(
                    ws,
                    'PACK_COORDINATION_DISABLED: Server simulation constructed without enablePackCoordination: true.',
                    ERROR_CODES.PACK_COORDINATION_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const pack = server.simulation.createPack(payload.packId, payload.options);
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.PACK_CREATE_RESPONSE,
                    status: 'CREATED',
                    packId: pack.id,
                    phase: pack.phase,
                    pattern: pack.pattern
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }

        case MESSAGE_TYPES.PACK_ASSIGN_MEMBER_REQUEST: {
            if (!server.simulation.packCoordination) {
                server._sendWsError(
                    ws,
                    'PACK_COORDINATION_DISABLED: Server simulation constructed without enablePackCoordination: true.',
                    ERROR_CODES.PACK_COORDINATION_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const member = server.simulation.registerPackMember(
                    payload.packId,
                    payload.agentId,
                    payload.traits,
                    payload.position,
                    payload.role
                );
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.PACK_ASSIGN_MEMBER_RESPONSE,
                    status: 'ASSIGNED',
                    packId: payload.packId,
                    agentId: payload.agentId,
                    role: member.role
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }

        case MESSAGE_TYPES.PACK_REMOVE_MEMBER_REQUEST: {
            if (!server.simulation.packCoordination) {
                server._sendWsError(
                    ws,
                    'PACK_COORDINATION_DISABLED: Server simulation constructed without enablePackCoordination: true.',
                    ERROR_CODES.PACK_COORDINATION_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                const ok = server.simulation.removePackMember(payload.packId, payload.agentId);
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.PACK_REMOVE_MEMBER_RESPONSE,
                    status: ok ? 'REMOVED' : 'NOT_FOUND',
                    packId: payload.packId,
                    agentId: payload.agentId
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }

        case MESSAGE_TYPES.PACK_UPDATE_REQUEST: {
            if (!server.simulation.packCoordination) {
                server._sendWsError(
                    ws,
                    'PACK_COORDINATION_DISABLED: Server simulation constructed without enablePackCoordination: true.',
                    ERROR_CODES.PACK_COORDINATION_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                if (payload.phase) server.simulation.setPackPhase(payload.packId, payload.phase);
                if (payload.pattern) server.simulation.setPackPattern(payload.packId, payload.pattern);
                if (payload.targetThreat) server.simulation.setPackTargetThreat(payload.packId, payload.targetThreat);
                server._sendWs(ws, {
                    type: MESSAGE_TYPES.PACK_UPDATE_RESPONSE,
                    status: 'UPDATED',
                    packId: payload.packId
                }, correlationId);
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }

        case MESSAGE_TYPES.PACK_QUERY_REQUEST: {
            if (!server.simulation.packCoordination) {
                server._sendWsError(
                    ws,
                    'PACK_COORDINATION_DISABLED: Server simulation constructed without enablePackCoordination: true.',
                    ERROR_CODES.PACK_COORDINATION_DISABLED,
                    correlationId
                );
                return;
            }
            try {
                if (payload.packId) {
                    const advisories = server.simulation.getPackAdvisories(payload.packId);
                    if (!advisories) {
                        server._sendWsError(ws, `UNKNOWN_PACK: pack ${payload.packId} does not exist.`, ERROR_CODES.UNKNOWN_PACK, correlationId);
                        return;
                    }
                    server._sendWs(ws, {
                        type: MESSAGE_TYPES.PACK_QUERY_RESPONSE,
                        packId: payload.packId,
                        advisories
                    }, correlationId);
                } else {
                    const allAdvisories = server.simulation.getAllPackAdvisories();
                    server._sendWs(ws, {
                        type: MESSAGE_TYPES.PACK_QUERY_RESPONSE,
                        packId: null,
                        packs: allAdvisories
                    }, correlationId);
                }
            } catch (err) {
                server._sendWsError(ws, err.message, ERROR_CODES.SIMULATION_ERROR, correlationId);
            }
            return;
        }
        default: throw new Error('Unsupported WS pack command: ' + payload.type);
    }
}
