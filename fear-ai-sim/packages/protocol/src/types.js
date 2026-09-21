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

// Upper bound on one control-plane batch (register, unregister, trauma zones).
// Chosen to cover a large host population in a single request while keeping
// the request, the response, and the per-entry work bounded. Over-limit
// batches are REJECTED rather than truncated: silently dropping entries would
// leave a host believing state exists that does not (or does not, that still
// does). The bound is per REQUEST, not per verb, so the same population can be
// drained in a bounded number of requests regardless of which verb it is.
export const MAX_BATCH_CONTROL_ITEMS = 512;

// The registration route's name for the same bound. Kept exported because the
// registration batch shipped under this name and the Godot client and its
// schema both reference it; it is an alias, not a second limit.
export const MAX_BATCH_REGISTRATION_AGENTS = MAX_BATCH_CONTROL_ITEMS;

// Ownership mode for a registration claim. `adopt` takes an agent whose owning
// session is detached (the reconnect / host-migration path); `takeover`
// additionally takes one whose owner is still live, which is deliberately
// explicit because it is how a duplicate host fights the real one for a crowd.
export const CLAIM_MODES = Object.freeze(['join', 'adopt', 'takeover']);

export const MESSAGE_TYPES = Object.freeze({
    // Client to Server
    HANDSHAKE_REQUEST: 'HANDSHAKE_REQUEST',
    REGISTER_AGENT: 'REGISTER_AGENT',
    REGISTER_AGENT_BATCH: 'REGISTER_AGENT_BATCH',
    UNREGISTER_AGENT: 'UNREGISTER_AGENT',
    UNREGISTER_AGENT_BATCH: 'UNREGISTER_AGENT_BATCH',
    TRAUMA_ZONE_BATCH: 'TRAUMA_ZONE_BATCH',
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
    // R36: host execution-outcome reports for the advisory feedback loop.
    INTENT_OUTCOME_REPORT: 'INTENT_OUTCOME_REPORT',
    // Request signing: answer the per-connection challenge with a signature
    // over it. One signature per CONNECTION, not per message, so the observation
    // hot path never pays for RSA. Additive: a host that ignores the challenge
    // behaves exactly as it did before signing existed.
    AUTH_RESPONSE: 'AUTH_RESPONSE',
    // Server to Client
    HANDSHAKE_RESPONSE: 'HANDSHAKE_RESPONSE',
    AUTH_CHALLENGE: 'AUTH_CHALLENGE',
    REGISTER_AGENT_BATCH_RESPONSE: 'REGISTER_AGENT_BATCH_RESPONSE',
    UNREGISTER_AGENT_BATCH_RESPONSE: 'UNREGISTER_AGENT_BATCH_RESPONSE',
    TRAUMA_ZONE_BATCH_RESPONSE: 'TRAUMA_ZONE_BATCH_RESPONSE',
    MODULE_HANDSHAKE_RESPONSE: 'MODULE_HANDSHAKE_RESPONSE',
    WORLD_QUERY_RESPONSE: 'WORLD_QUERY_RESPONSE',
    FACTION_STANCE_QUERY_RESPONSE: 'FACTION_STANCE_QUERY_RESPONSE',
    AGENT_STATE_UPDATE: 'AGENT_STATE_UPDATE',
    BATCH_TICK_RESPONSE: 'BATCH_TICK_RESPONSE',
    SNAPSHOT_RESPONSE: 'SNAPSHOT_RESPONSE',
    SOCIAL_EVENT_ACK: 'SOCIAL_EVENT_ACK',
    INTENT_OUTCOME_ACK: 'INTENT_OUTCOME_ACK',
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
