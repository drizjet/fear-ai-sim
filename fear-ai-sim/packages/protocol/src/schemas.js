/**
 * Canonical Fear AI Protocol v1.0.0 - JSON Schemas
 */

import { PROTOCOL_VERSION, STIMULUS_TYPES, MAX_BATCH_CONTROL_ITEMS } from './types.js';
import { FEAR_BANDS } from '../../core/src/FearCore.js';
import { ACTION_INTENTS } from '../../core/src/IntentResolver.js';

export const HANDSHAKE_REQUEST_SCHEMA = {
    type: 'object',
    required: ['type', 'protocol_version', 'client_id'],
    properties: {
        type: { type: 'string', const: 'HANDSHAKE_REQUEST' },
        protocol_version: { type: 'string', default: PROTOCOL_VERSION },
        client_id: { type: 'string' },
        client_name: { type: 'string' },
        engine: { type: 'string' } // e.g. 'Unity', 'Unreal', 'Godot', 'Custom'
    }
};

export const REGISTER_AGENT_SCHEMA = {
    type: 'object',
    required: ['type', 'agent_id'],
    properties: {
        type: { type: 'string', const: 'REGISTER_AGENT' },
        agent_id: { type: 'string' },
        name: { type: 'string' },
        traits: {
            type: 'object',
            properties: {
                openness: { type: 'number', minimum: 0, maximum: 1 },
                conscientiousness: { type: 'number', minimum: 0, maximum: 1 },
                extraversion: { type: 'number', minimum: 0, maximum: 1 },
                agreeableness: { type: 'number', minimum: 0, maximum: 1 },
                neuroticism: { type: 'number', minimum: 0, maximum: 1 },
                fear: { type: 'number', minimum: 0, maximum: 1 },
                curiosity: { type: 'number', minimum: 0, maximum: 1 },
                leadership: { type: 'number', minimum: 0, maximum: 1 },
                resilience: { type: 'number', minimum: 0, maximum: 1 }
            }
        },
        initial_position: {
            type: 'object',
            properties: {
                x: { type: 'number' },
                y: { type: 'number' },
                z: { type: 'number' }
            }
        }
    }
};

/**
 * Batch counterpart of REGISTER_AGENT. Each element is a REGISTER_AGENT body
 * minus its `type`, so one request can carry a whole host population.
 * `maxItems` mirrors MAX_BATCH_CONTROL_ITEMS. `session_id` and `claim` name
 * the requesting session and what it is allowed to displace (see
 * `ClaimArbitration` in the runtime), so a batch can be attributed ownership.
 */
export const REGISTER_AGENT_BATCH_SCHEMA = {
    type: 'object',
    required: ['type', 'agents'],
    properties: {
        type: { type: 'string', const: 'REGISTER_AGENT_BATCH' },
        agents: {
            type: 'array',
            minItems: 1,
            maxItems: MAX_BATCH_CONTROL_ITEMS,
            items: {
                type: 'object',
                required: ['agent_id'],
                properties: REGISTER_AGENT_SCHEMA.properties
            }
        }
    }
};

export const UNREGISTER_AGENT_BATCH_SCHEMA = {
    type: 'object',
    required: ['type', 'agent_ids'],
    properties: {
        type: { type: 'string', const: 'UNREGISTER_AGENT_BATCH' },
        session_id: { type: 'string' },
        agent_ids: {
            type: 'array',
            minItems: 1,
            maxItems: MAX_BATCH_CONTROL_ITEMS,
            items: { type: 'string' }
        }
    }
};

export const TRAUMA_ZONE_BATCH_SCHEMA = {
    type: 'object',
    required: ['type', 'zones'],
    properties: {
        type: { type: 'string', const: 'TRAUMA_ZONE_BATCH' },
        zones: {
            type: 'array',
            minItems: 1,
            maxItems: MAX_BATCH_CONTROL_ITEMS,
            items: {
                type: 'object',
                required: ['x', 'y'],
                properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                    z: { type: 'number', default: 0 },
                    intensity: { type: 'number', minimum: 0, maximum: 1, default: 1.0 },
                    radius: { type: 'number', exclusiveMinimum: 0, default: 150 },
                    lifetimeTicks: { type: 'integer', minimum: 0, default: 1800 }
                }
            }
        }
    }
};

export const STIMULUS_SCHEMA = {
    type: 'object',
    required: ['type'],
    properties: {
        id: { type: 'string' },
        type: { type: 'string', enum: STIMULUS_TYPES },
        distance: { type: 'number', minimum: 0 },
        x: { type: 'number' },
        y: { type: 'number' },
        z: { type: 'number' },
        intensity: { type: 'number', minimum: 0, maximum: 1 },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        occluded: { type: 'boolean' }
    }
};

export const OBSERVATION_DISPATCH_SCHEMA = {
    type: 'object',
    required: ['agent_id'],
    properties: {
        agent_id: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        z: { type: 'number' },
        velocity: {
            type: 'object',
            properties: {
                x: { type: 'number' },
                y: { type: 'number' },
                z: { type: 'number' }
            }
        },
        health: { type: 'number', minimum: 0, maximum: 1 },
        energy: { type: 'number', minimum: 0, maximum: 1 },
        inSafeHaven: { type: 'boolean' },
        obstacleAhead: { type: 'boolean' },
        obstaclePresent: { type: 'boolean' },
        threats: {
            type: 'array',
            items: STIMULUS_SCHEMA
        },
        sounds: {
            type: 'array',
            items: STIMULUS_SCHEMA
        }
    }
};

export const BATCH_TICK_REQUEST_SCHEMA = {
    type: 'object',
    properties: {
        type: { type: 'string', const: 'BATCH_TICK_REQUEST' },
        dt: { type: 'number', minimum: 0.0001, default: 0.0166 },
        observations: {
            type: 'array',
            items: OBSERVATION_DISPATCH_SCHEMA
        }
    }
};

export const AGENT_STATE_OUTPUT_SCHEMA = {
    type: 'object',
    required: ['agent_id', 'tick', 'fear_band', 'affective_state', 'action_intent', 'audio_hints'],
    properties: {
        agent_id: { type: 'string' },
        tick: { type: 'integer' },
        fear_band: { type: 'string', enum: FEAR_BANDS },
        affective_state: {
            type: 'object',
            required: ['valence', 'arousal', 'dominance', 'raw_fear', 'adrenaline', 'morale'],
            properties: {
                valence: { type: 'number', minimum: -1, maximum: 1 },
                arousal: { type: 'number', minimum: 0, maximum: 1 },
                dominance: { type: 'number', minimum: 0, maximum: 1 },
                raw_fear: { type: 'number', minimum: 0, maximum: 1 },
                adrenaline: { type: 'number', minimum: 0, maximum: 1 },
                morale: { type: 'number', minimum: 0, maximum: 1 }
            }
        },
        action_intent: {
            type: 'object',
            required: ['type', 'urgency', 'vector_hint'],
            properties: {
                type: { type: 'string', enum: ACTION_INTENTS },
                target_id: { type: ['string', 'null'] },
                urgency: { type: 'number', minimum: 0, maximum: 1 },
                vector_hint: {
                    type: 'object',
                    required: ['x', 'y', 'z'],
                    properties: {
                        x: { type: 'number' },
                        y: { type: 'number' },
                        z: { type: 'number' }
                    }
                },
                suggested_posture: { type: 'string' }
            }
        },
        audio_hints: {
            type: 'object',
            required: ['heartbeat_bpm', 'shepard_mix', 'lowpass_cutoff_hz', 'infrasound_intensity', 'vocalization_hint'],
            properties: {
                heartbeat_bpm: { type: 'number' },
                shepard_mix: { type: 'number', minimum: 0, maximum: 1 },
                lowpass_cutoff_hz: { type: 'number', minimum: 500, maximum: 22000 },
                infrasound_intensity: { type: 'number', minimum: 0, maximum: 1 },
                vocalization_hint: { type: 'string' }
            }
        },
        debug_trace: { type: 'object' }
    }
};
