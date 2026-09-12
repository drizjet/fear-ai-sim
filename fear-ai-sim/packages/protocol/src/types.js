/**
 * Canonical Fear AI Protocol v1.0.0 - Types & Enums
 */

export const PROTOCOL_VERSION = '1.0.0';

/**
 * R8: runtime-honored optional wire fields, advertised in handshake
 * responses so hosts discover what the server sanitizes and forwards
 * (CXXVIII). This manifest is contractual: the completeness test pins
 * that every key listed here survives validation, and every key the
 * validator forwards appears here. Binary Wire Protocol v2 fixed slots
 * carry none of these (JSON path only).
 */
export const SUPPORTED_OBSERVATION_FIELDS = Object.freeze({
    visual: Object.freeze(['intensity', 'reliability', 'ageTicks']),
    audio: Object.freeze(['loudness', 'reliability', 'ageTicks']),
    context: Object.freeze(['trust', 'trustGain', 'calmTrustGain', 'traumaLoad', 'memoryLoad', 'identityWeight'])
});

export const SUPPORTED_SOCIAL_EVENT_FIELDS = Object.freeze({
    location: Object.freeze(['x', 'y', 'z'])
});

export const SUPPORTED_PACING_METRICS = Object.freeze(['averageFear', 'panickingCount', 'cohesion']);

export const MESSAGE_TYPES = Object.freeze({
    // Client to Server
    HANDSHAKE_REQUEST: 'HANDSHAKE_REQUEST',
    REGISTER_AGENT: 'REGISTER_AGENT',
    UNREGISTER_AGENT: 'UNREGISTER_AGENT',
    OBSERVATION_DISPATCH: 'OBSERVATION_DISPATCH',
    BATCH_TICK_REQUEST: 'BATCH_TICK_REQUEST',
    STEP_REQUEST: 'STEP_REQUEST',
    RESET_REQUEST: 'RESET_REQUEST',
    SAVE_SNAPSHOT_REQUEST: 'SAVE_SNAPSHOT_REQUEST',
    LOAD_SNAPSHOT_REQUEST: 'LOAD_SNAPSHOT_REQUEST',
    SET_PACING_OVERRIDE: 'SET_PACING_OVERRIDE',
    MODULE_HANDSHAKE_REQUEST: 'MODULE_HANDSHAKE_REQUEST',
    WORLD_QUERY_REQUEST: 'WORLD_QUERY_REQUEST',
    FACTION_STANCE_QUERY_REQUEST: 'FACTION_STANCE_QUERY_REQUEST',
    SOCIAL_EVENT: 'SOCIAL_EVENT',
    // Server to Client
    HANDSHAKE_RESPONSE: 'HANDSHAKE_RESPONSE',
    MODULE_HANDSHAKE_RESPONSE: 'MODULE_HANDSHAKE_RESPONSE',
    WORLD_QUERY_RESPONSE: 'WORLD_QUERY_RESPONSE',
    FACTION_STANCE_QUERY_RESPONSE: 'FACTION_STANCE_QUERY_RESPONSE',
    AGENT_STATE_UPDATE: 'AGENT_STATE_UPDATE',
    BATCH_TICK_RESPONSE: 'BATCH_TICK_RESPONSE',
    SNAPSHOT_RESPONSE: 'SNAPSHOT_RESPONSE',
    SOCIAL_EVENT_ACK: 'SOCIAL_EVENT_ACK',
    ERROR_RESPONSE: 'ERROR_RESPONSE'
});

export const OPTIONAL_MODULES = Object.freeze({
    AFFECT: 'affect',
    MEMORY: 'memory',
    RELATIONSHIPS: 'relationships',
    GROUPS: 'groups',
    FACTIONS: 'factions',
    CIVILIZATION_LOD: 'civilization_lod',
    WORLD_SIMULATION: 'world_simulation'
});


export const STIMULUS_TYPES = Object.freeze([
    'PREDATOR',
    'SOUND',
    'LIGHT_FLICKER',
    'GORE_OBJECT',
    'SCREAM',
    'ENVIRONMENTAL_DREAD',
    'ANOMALY'
]);

export const ERROR_CODES = Object.freeze({
    INVALID_PROTOCOL_VERSION: 'INVALID_PROTOCOL_VERSION',
    MALFORMED_MESSAGE: 'MALFORMED_MESSAGE',
    VALIDATION_FAILED: 'VALIDATION_FAILED',
    AGENT_ALREADY_REGISTERED: 'AGENT_ALREADY_REGISTERED',
    AGENT_NOT_FOUND: 'AGENT_NOT_FOUND',
    SIMULATION_ERROR: 'SIMULATION_ERROR',
    SNAPSHOT_ERROR: 'SNAPSHOT_ERROR'
});
