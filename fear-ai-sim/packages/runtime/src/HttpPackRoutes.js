/** Domain-local HTTP pack control routes. Called only after global HTTP signing gate. */
import { ProtocolValidator, ERROR_CODES, MESSAGE_TYPES } from '../../protocol/index.js';

export function dispatchHttpPackPost(server, path, body, res) {
    switch (path) {
        case '/api/v1/pack/create': {
            const val = ProtocolValidator.validatePackCreate(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.packCoordination) {
                return server._sendJson(res, 400, {
                    error: 'PACK_COORDINATION_DISABLED: Server simulation constructed without enablePackCoordination: true.',
                    code: ERROR_CODES.PACK_COORDINATION_DISABLED
                });
            }
            try {
                const pack = server.simulation.createPack(val.value.packId, val.value.options);
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.PACK_CREATE_RESPONSE,
                    status: 'CREATED',
                    packId: pack.id,
                    phase: pack.phase,
                    pattern: pack.pattern
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }

        case '/api/v1/pack/assign': {
            const val = ProtocolValidator.validatePackAssignMember(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.packCoordination) {
                return server._sendJson(res, 400, {
                    error: 'PACK_COORDINATION_DISABLED: Server simulation constructed without enablePackCoordination: true.',
                    code: ERROR_CODES.PACK_COORDINATION_DISABLED
                });
            }
            try {
                const member = server.simulation.registerPackMember(
                    val.value.packId,
                    val.value.agentId,
                    val.value.traits,
                    val.value.position,
                    val.value.role
                );
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.PACK_ASSIGN_MEMBER_RESPONSE,
                    status: 'ASSIGNED',
                    packId: val.value.packId,
                    agentId: val.value.agentId,
                    role: member.role
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }

        case '/api/v1/pack/remove': {
            const val = ProtocolValidator.validatePackRemoveMember(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.packCoordination) {
                return server._sendJson(res, 400, {
                    error: 'PACK_COORDINATION_DISABLED: Server simulation constructed without enablePackCoordination: true.',
                    code: ERROR_CODES.PACK_COORDINATION_DISABLED
                });
            }
            try {
                const ok = server.simulation.removePackMember(val.value.packId, val.value.agentId);
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.PACK_REMOVE_MEMBER_RESPONSE,
                    status: ok ? 'REMOVED' : 'NOT_FOUND',
                    packId: val.value.packId,
                    agentId: val.value.agentId
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }

        case '/api/v1/pack/update': {
            const val = ProtocolValidator.validatePackUpdate(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.packCoordination) {
                return server._sendJson(res, 400, {
                    error: 'PACK_COORDINATION_DISABLED: Server simulation constructed without enablePackCoordination: true.',
                    code: ERROR_CODES.PACK_COORDINATION_DISABLED
                });
            }
            try {
                if (val.value.phase) server.simulation.setPackPhase(val.value.packId, val.value.phase);
                if (val.value.pattern) server.simulation.setPackPattern(val.value.packId, val.value.pattern);
                if (val.value.targetThreat) server.simulation.setPackTargetThreat(val.value.packId, val.value.targetThreat);
                return server._sendJson(res, 200, {
                    type: MESSAGE_TYPES.PACK_UPDATE_RESPONSE,
                    status: 'UPDATED',
                    packId: val.value.packId
                });
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }

        case '/api/v1/pack/query': {
            const val = ProtocolValidator.validatePackQuery(body || {});
            if (!val.valid) return server._sendJson(res, 400, { errors: val.errors, code: val.code });
            if (!server.simulation.packCoordination) {
                return server._sendJson(res, 400, {
                    error: 'PACK_COORDINATION_DISABLED: Server simulation constructed without enablePackCoordination: true.',
                    code: ERROR_CODES.PACK_COORDINATION_DISABLED
                });
            }
            try {
                if (val.value.packId) {
                    const advisories = server.simulation.getPackAdvisories(val.value.packId);
                    if (!advisories) {
                        return server._sendJson(res, 404, {
                            error: `UNKNOWN_PACK: pack ${val.value.packId} does not exist.`,
                            code: ERROR_CODES.UNKNOWN_PACK
                        });
                    }
                    return server._sendJson(res, 200, {
                        type: MESSAGE_TYPES.PACK_QUERY_RESPONSE,
                        packId: val.value.packId,
                        advisories
                    });
                } else {
                    const allAdvisories = server.simulation.getAllPackAdvisories();
                    return server._sendJson(res, 200, {
                        type: MESSAGE_TYPES.PACK_QUERY_RESPONSE,
                        packId: null,
                        packs: allAdvisories
                    });
                }
            } catch (err) {
                return server._sendJson(res, 400, { error: err.message, code: ERROR_CODES.SIMULATION_ERROR });
            }
        }
        default: throw new Error(`Unsupported HTTP pack route: ${path}`);
    }
}
