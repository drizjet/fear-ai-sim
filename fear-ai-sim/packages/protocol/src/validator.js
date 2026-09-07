/**
 * Protocol Validator - Zero-dependency schema validation and defensive sanitization.
 */

import {
    PROTOCOL_VERSION,
    MESSAGE_TYPES,
    STIMULUS_TYPES,
    ERROR_CODES
} from './types.js';
import { FEAR_BANDS } from '../../core/src/FearCore.js';
import { ACTION_INTENTS } from '../../core/src/IntentResolver.js';

export class ProtocolValidator {
    /**
     * Validate incoming raw message structure
     * @param {any} raw - Parsed JSON or object
     * @returns {{ valid: boolean, errors?: string[], value?: object }}
     */
    static validateIncomingMessage(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return {
                valid: false,
                errors: ['Message must be a non-null JSON object'],
                code: ERROR_CODES.MALFORMED_MESSAGE
            };
        }

        if (!raw.type || typeof raw.type !== 'string') {
            return {
                valid: false,
                errors: ['Missing or invalid "type" string property'],
                code: ERROR_CODES.MALFORMED_MESSAGE
            };
        }

        switch (raw.type) {
            case MESSAGE_TYPES.HANDSHAKE_REQUEST:
                return ProtocolValidator.validateHandshake(raw);
            case MESSAGE_TYPES.REGISTER_AGENT:
                return ProtocolValidator.validateRegisterAgent(raw);
            case MESSAGE_TYPES.UNREGISTER_AGENT:
                return ProtocolValidator.validateUnregisterAgent(raw);
            case MESSAGE_TYPES.OBSERVATION_DISPATCH:
                return ProtocolValidator.validateObservation(raw);
            case MESSAGE_TYPES.BATCH_TICK_REQUEST:
                return ProtocolValidator.validateBatchTick(raw);
            case MESSAGE_TYPES.STEP_REQUEST:
                return { valid: true, value: raw };
            case MESSAGE_TYPES.RESET_REQUEST:
                return { valid: true, value: raw };
            case MESSAGE_TYPES.SAVE_SNAPSHOT_REQUEST:
                return { valid: true, value: raw };
            case MESSAGE_TYPES.LOAD_SNAPSHOT_REQUEST:
                if (!raw.snapshot || typeof raw.snapshot !== 'object') {
                    return { valid: false, errors: ['Missing "snapshot" object'], code: ERROR_CODES.VALIDATION_FAILED };
                }
                return { valid: true, value: raw };
            case MESSAGE_TYPES.SET_PACING_OVERRIDE:
                return { valid: true, value: raw };
            default:
                // Accept unknown messages defensively
                return { valid: true, value: raw };
        }
    }

    static validateHandshake(raw) {
        const errors = [];
        if (!raw.client_id) {
            errors.push('Missing required property "client_id"');
        }
        if (raw.protocol_version && typeof raw.protocol_version === 'string') {
            const major = raw.protocol_version.split('.')[0];
            const expectedMajor = PROTOCOL_VERSION.split('.')[0];
            if (major !== expectedMajor) {
                return {
                    valid: false,
                    errors: [`Incompatible protocol major version: expected ${expectedMajor}.x, got ${raw.protocol_version}`],
                    code: ERROR_CODES.INVALID_PROTOCOL_VERSION
                };
            }
        }
        if (errors.length > 0) {
            return { valid: false, errors, code: ERROR_CODES.VALIDATION_FAILED };
        }
        return {
            valid: true,
            value: {
                type: MESSAGE_TYPES.HANDSHAKE_REQUEST,
                protocol_version: raw.protocol_version || PROTOCOL_VERSION,
                client_id: String(raw.client_id),
                client_name: raw.client_name ? String(raw.client_name) : 'unknown_client',
                engine: raw.engine ? String(raw.engine) : 'custom'
            }
        };
    }

    static validateRegisterAgent(raw) {
        const errors = [];
        if (!raw.agent_id) {
            errors.push('Missing required property "agent_id"');
        }
        if (errors.length > 0) {
            return { valid: false, errors, code: ERROR_CODES.VALIDATION_FAILED };
        }

        const sanitizedTraits = {};
        if (raw.traits && typeof raw.traits === 'object') {
            for (const [k, v] of Object.entries(raw.traits)) {
                if (typeof v === 'number' && Number.isFinite(v)) {
                    sanitizedTraits[k] = Math.max(0, Math.min(1.0, v));
                }
            }
        }

        return {
            valid: true,
            value: {
                type: MESSAGE_TYPES.REGISTER_AGENT,
                agent_id: String(raw.agent_id),
                name: raw.name ? String(raw.name) : String(raw.agent_id),
                traits: sanitizedTraits,
                initial_position: raw.initial_position || { x: 0, y: 0, z: 0 }
            }
        };
    }

    static validateUnregisterAgent(raw) {
        if (!raw.agent_id) {
            return { valid: false, errors: ['Missing "agent_id"'], code: ERROR_CODES.VALIDATION_FAILED };
        }
        return {
            valid: true,
            value: {
                type: MESSAGE_TYPES.UNREGISTER_AGENT,
                agent_id: String(raw.agent_id)
            }
        };
    }

    static validateObservation(raw) {
        if (!raw.agent_id) {
            return { valid: false, errors: ['Missing required property "agent_id"'], code: ERROR_CODES.VALIDATION_FAILED };
        }
        return {
            valid: true,
            value: {
                agent_id: String(raw.agent_id),
                x: Number(raw.x) || 0,
                y: Number(raw.y) || 0,
                z: Number(raw.z) || 0,
                velocity: raw.velocity ? {
                    x: Number(raw.velocity.x) || 0,
                    y: Number(raw.velocity.y) || 0,
                    z: Number(raw.velocity.z) || 0
                } : null,
                health: typeof raw.health === 'number' ? Math.max(0, Math.min(1.0, raw.health)) : 1.0,
                energy: typeof raw.energy === 'number' ? Math.max(0, Math.min(1.0, raw.energy)) : 1.0,
                inSafeHaven: Boolean(raw.inSafeHaven),
                obstacleAhead: Boolean(raw.obstacleAhead),
                obstaclePresent: Boolean(raw.obstaclePresent),
                threats: Array.isArray(raw.threats) ? raw.threats.map(ProtocolValidator._sanitizeStimulus) : [],
                sounds: Array.isArray(raw.sounds) ? raw.sounds.map(ProtocolValidator._sanitizeStimulus) : []
            }
        };
    }

    static validateBatchTick(raw) {
        const dt = typeof raw.dt === 'number' && raw.dt > 0 ? raw.dt : 0.0166;
        const observations = [];
        if (Array.isArray(raw.observations)) {
            for (const obs of raw.observations) {
                const res = ProtocolValidator.validateObservation(obs);
                if (res.valid) {
                    observations.push(res.value);
                }
            }
        }
        return {
            valid: true,
            value: {
                type: MESSAGE_TYPES.BATCH_TICK_REQUEST,
                dt,
                observations
            }
        };
    }

    static _sanitizeStimulus(s) {
        if (!s || typeof s !== 'object') {
            return { type: 'PREDATOR', distance: 10, intensity: 1.0 };
        }
        return {
            id: s.id ? String(s.id) : null,
            type: STIMULUS_TYPES.includes(s.type) ? s.type : 'PREDATOR',
            distance: typeof s.distance === 'number' ? Math.max(0, s.distance) : 10,
            x: Number(s.x) || 0,
            y: Number(s.y) || 0,
            z: Number(s.z) || 0,
            intensity: typeof s.intensity === 'number' ? Math.max(0, Math.min(1.0, s.intensity)) : 1.0,
            confidence: typeof s.confidence === 'number' ? Math.max(0, Math.min(1.0, s.confidence)) : 1.0,
            occluded: Boolean(s.occluded)
        };
    }

    /**
     * Validate outgoing agent state output
     * @param {object} output
     * @returns {boolean}
     */
    static isValidAgentOutput(output) {
        if (!output || typeof output !== 'object') return false;
        if (!output.agent_id || typeof output.tick !== 'number') return false;
        if (!FEAR_BANDS.includes(output.fear_band)) return false;
        if (!output.affective_state || !output.action_intent || !output.audio_hints) return false;
        if (!ACTION_INTENTS.includes(output.action_intent.type)) return false;
        return true;
    }
}

export default ProtocolValidator;
