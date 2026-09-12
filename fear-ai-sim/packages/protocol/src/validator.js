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
import { SOCIAL_EVENTS } from '../../core/src/SocialEventEngine.js';
import { INTENT_OUTCOMES, FAILURE_REASONS } from '../../core/src/HostFeedbackLoop.js';

const finiteOr = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const clamp01Finite = (v, fallback) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
    return Math.max(0, Math.min(1.0, v));
};

// R4: opt-in perception channel sanitizer. Mirrors
// PerceptionRobustnessEngine coercion exactly so validated observations
// behave identically to direct engine calls: intensity/loudness Number()
// -coerces with garbage collapsing to 0; reliability collapses to 1
// (trusted); ageTicks collapses to 0 (fresh). Returns null unless the
// channel object carries at least one of its keys (legacy shape kept).
function sanitizePerceptionChannel(rawChannel, levelKey) {
    if (!rawChannel || typeof rawChannel !== 'object' || Array.isArray(rawChannel)) return null;
    const out = {};
    if (levelKey in rawChannel) {
        const n = Number(rawChannel[levelKey]);
        out[levelKey] = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
    }
    if ('reliability' in rawChannel) {
        const r = rawChannel.reliability;
        out.reliability = (typeof r === 'number' && Number.isFinite(r)) ? Math.max(0, Math.min(1, r)) : 1;
    }
    if ('ageTicks' in rawChannel) {
        const a = rawChannel.ageTicks;
        out.ageTicks = (typeof a === 'number' && Number.isFinite(a)) ? Math.max(0, a) : 0;
    }
    return Object.keys(out).length > 0 ? out : null;
}

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

        let result;
        switch (raw.type) {
            case MESSAGE_TYPES.HANDSHAKE_REQUEST:
                result = ProtocolValidator.validateHandshake(raw);
                break;
            case MESSAGE_TYPES.REGISTER_AGENT:
                result = ProtocolValidator.validateRegisterAgent(raw);
                break;
            case MESSAGE_TYPES.UNREGISTER_AGENT:
                result = ProtocolValidator.validateUnregisterAgent(raw);
                break;
            case MESSAGE_TYPES.SOCIAL_EVENT:
                result = ProtocolValidator.validateSocialEvent(raw);
                break;
            case MESSAGE_TYPES.OBSERVATION_DISPATCH:
                result = ProtocolValidator.validateObservation(raw);
                break;
            case MESSAGE_TYPES.BATCH_TICK_REQUEST:
                result = ProtocolValidator.validateBatchTick(raw);
                break;
            case MESSAGE_TYPES.STEP_REQUEST:
                result = { valid: true, value: raw };
                break;
            case MESSAGE_TYPES.RESET_REQUEST:
                result = { valid: true, value: raw };
                break;
            case MESSAGE_TYPES.SAVE_SNAPSHOT_REQUEST:
                result = { valid: true, value: raw };
                break;
            case MESSAGE_TYPES.LOAD_SNAPSHOT_REQUEST:
                if (!raw.snapshot || typeof raw.snapshot !== 'object') {
                    result = { valid: false, errors: ['Missing "snapshot" object'], code: ERROR_CODES.VALIDATION_FAILED };
                } else {
                    result = { valid: true, value: raw };
                }
                break;
            case MESSAGE_TYPES.SET_PACING_OVERRIDE:
                result = { valid: true, value: raw };
                break;
            default:
                // Accept unknown messages defensively
                result = { valid: true, value: raw };
                break;
        }
        if (result && result.valid && result.value && (raw.message_id || raw.id)) {
            result.value.message_id = raw.message_id || raw.id;
        }
        return result;
    }

    static validateHandshake(raw) {
        const clientId = raw.client_id || raw.client_name || `client_${Date.now()}`;
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
        return {
            valid: true,
            value: {
                type: MESSAGE_TYPES.HANDSHAKE_REQUEST,
                protocol_version: raw.protocol_version || PROTOCOL_VERSION,
                client_id: clientId,
                client_name: raw.client_name || clientId,
                capabilities: Array.isArray(raw.capabilities) ? raw.capabilities : []
            }
        };
    }

    static validateRegisterAgent(raw) {
        const errors = [];
        if (raw.agent_id === undefined || raw.agent_id === null) {
            errors.push('Missing required property "agent_id"');
        } else if (typeof raw.agent_id !== 'string' && typeof raw.agent_id !== 'number') {
            errors.push('Property "agent_id" must be a string or number');
        } else if (String(raw.agent_id).trim().length === 0) {
            errors.push('Property "agent_id" cannot be empty or whitespace-only');
        }
        if (errors.length > 0) {
            return { valid: false, errors, code: ERROR_CODES.VALIDATION_FAILED };
        }

        const sanitizedTraits = {};
        if (raw.traits && typeof raw.traits === 'object') {
            for (const [k, v] of Object.entries(raw.traits)) {
                if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
                if (typeof v === 'number' && Number.isFinite(v)) {
                    sanitizedTraits[k] = Math.max(0, Math.min(1.0, v));
                }
            }
        }

        return {
            valid: true,
            value: {
                type: MESSAGE_TYPES.REGISTER_AGENT,
                agent_id: String(raw.agent_id).trim().slice(0, 256),
                name: raw.name ? String(raw.name).slice(0, 256) : String(raw.agent_id).trim().slice(0, 256),
                traits: sanitizedTraits,
                initial_position: raw.initial_position || { x: 0, y: 0, z: 0 }
            }
        };
    }

    static validateUnregisterAgent(raw) {
        if (raw.agent_id === undefined || raw.agent_id === null || String(raw.agent_id).trim().length === 0) {
            return { valid: false, errors: ['Missing or empty "agent_id"'], code: ERROR_CODES.VALIDATION_FAILED };
        }
        return {
            valid: true,
            value: {
                type: MESSAGE_TYPES.UNREGISTER_AGENT,
                agent_id: String(raw.agent_id).trim().slice(0, 256)
            }
        };
    }
    /**
     * R36: sanitize per-tick host capability advertisements. Accepts an
     * array (or capability->bool map); keeps strings, drops garbage,
     * bounds length. Returns null when the request carries nothing
     * (legacy unfiltered output); an explicitly empty set filters
     * everything gated. Unknown names are kept verbatim (forward-compat;
     * filtering only consults known requirement keys).
     */
    static sanitizeTickCapabilities(raw) {
        if (raw === null || raw === undefined) return null;
        let list = [];
        if (Array.isArray(raw)) {
            list = raw;
        } else if (typeof raw === 'object') {
            list = Object.entries(raw).filter(([, v]) => v).map(([k]) => k);
        }
        const caps = [];
        for (const cap of list) {
            if (typeof cap !== 'string') continue;
            const trimmed = cap.trim().slice(0, 128);
            if (trimmed.length === 0 || caps.includes(trimmed)) continue;
            caps.push(trimmed);
            if (caps.length >= 32) break;
        }
        return caps;
    }

    /**
     * R36: validate a host outcome report for the execution-aware loop.
     * Strict on identity and outcome taxonomy (unknown outcomes are
     * host bugs, fail loudly); lenient on reason (defaults UNKNOWN).
     */
    static validateOutcomeReport(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return { valid: false, errors: ['Outcome report must be a non-null object'], code: ERROR_CODES.VALIDATION_FAILED };
        }
        const errors = [];
        if (raw.agent_id === undefined || raw.agent_id === null || String(raw.agent_id).trim().length === 0) {
            errors.push('Missing or empty "agent_id"');
        }
        if (typeof raw.intent_type !== 'string' || raw.intent_type.trim().length === 0) {
            errors.push('Missing or empty "intent_type"');
        }
        if (typeof raw.outcome !== 'string' || !Object.values(INTENT_OUTCOMES).includes(raw.outcome)) {
            errors.push(`Property "outcome" must be one of: ${Object.values(INTENT_OUTCOMES).join(', ')}`);
        }
        if (errors.length > 0) {
            return { valid: false, errors, code: ERROR_CODES.VALIDATION_FAILED };
        }
        return {
            valid: true,
            value: {
                agent_id: String(raw.agent_id).trim().slice(0, 256),
                intent_type: raw.intent_type.trim().slice(0, 128),
                outcome: raw.outcome,
                reason: typeof raw.reason === 'string' && Object.values(FAILURE_REASONS).includes(raw.reason)
                    ? raw.reason
                    : 'UNKNOWN',
                tick: Number.isFinite(Number(raw.tick)) ? Number(raw.tick) : 0
            }
        };
    }

    static validateSocialEvent(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return { valid: false, errors: ['Social event must be a non-null object'], code: ERROR_CODES.VALIDATION_FAILED };
        }
        const errors = [];
        if (typeof raw.event !== 'string' || !SOCIAL_EVENTS.includes(raw.event)) {
            errors.push(`Property "event" must be one of: ${SOCIAL_EVENTS.join(', ')}`);
        }
        for (const key of ['actor_id', 'target_id']) {
            if (raw[key] === undefined || raw[key] === null || String(raw[key]).trim().length === 0) {
                errors.push(`Missing or empty "${key}"`);
            }
        }
        if (errors.length > 0) {
            return { valid: false, errors, code: ERROR_CODES.VALIDATION_FAILED };
        }
        const witnesses = Array.isArray(raw.witnesses)
            ? [...new Set(raw.witnesses.map(String))].filter((w) => w.trim().length > 0).slice(0, 32)
            : [];
        // R4: opt-in location for the R3 location-dread wire. Finite x/y
        // required; finite z rides along, otherwise 0. Attached only when
        // present (legacy shape kept). Zone systems stay server-side.
        let location = null;
        if (raw.location && typeof raw.location === 'object' && !Array.isArray(raw.location)
            && typeof raw.location.x === 'number' && Number.isFinite(raw.location.x)
            && typeof raw.location.y === 'number' && Number.isFinite(raw.location.y)) {
            location = {
                x: raw.location.x,
                y: raw.location.y,
                z: typeof raw.location.z === 'number' && Number.isFinite(raw.location.z) ? raw.location.z : 0
            };
        }
        const value = {
            type: MESSAGE_TYPES.SOCIAL_EVENT,
            event: raw.event,
            actor_id: String(raw.actor_id).trim().slice(0, 256),
            target_id: String(raw.target_id).trim().slice(0, 256),
            weight: typeof raw.weight === 'number' && Number.isFinite(raw.weight) ? raw.weight : 1.0,
            witnesses,
            exposed: raw.exposed === true,
            severity: typeof raw.severity === 'number' && Number.isFinite(raw.severity) ? raw.severity : null
        };
        if (location !== null) value.location = location;
        return { valid: true, value };
    }

    static validateObservation(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return { valid: false, errors: ['Observation must be a non-null object'], code: ERROR_CODES.VALIDATION_FAILED };
        }
        if (!raw.agent_id) {
            return { valid: false, errors: ['Missing required property "agent_id"'], code: ERROR_CODES.VALIDATION_FAILED };
        }
        const value = {
            agent_id: String(raw.agent_id).slice(0, 256),
            x: finiteOr(Number(raw.x), 0) || 0,
            y: finiteOr(Number(raw.y), 0) || 0,
            z: finiteOr(Number(raw.z), 0) || 0,
            velocity: raw.velocity ? {
                x: finiteOr(Number(raw.velocity.x), 0) || 0,
                y: finiteOr(Number(raw.velocity.y), 0) || 0,
                z: finiteOr(Number(raw.velocity.z), 0) || 0
            } : null,
            health: clamp01Finite(raw.health, 1.0),
            energy: clamp01Finite(raw.energy, 1.0),
            inSafeHaven: Boolean(raw.inSafeHaven),
            obstacleAhead: Boolean(raw.obstacleAhead),
            obstaclePresent: Boolean(raw.obstaclePresent),
            threats: Array.isArray(raw.threats) ? raw.threats.map(ProtocolValidator._sanitizeStimulus) : [],
            sounds: Array.isArray(raw.sounds) ? raw.sounds.map(ProtocolValidator._sanitizeStimulus) : []
        };
        // NEXT-182: opt-in protocol context forwarding (JSON path only).
        // Binary Wire v2 fixed 32-byte records cannot carry these — out of scope.
        // `context` must be a plain object; anything else means no context.
        // Exactly six finite-number keys survive: trust is clamped to [-1, 1],
        // the five gains/loads/weights to [0, 1]. Unknown keys are dropped;
        // non-finite values become absent. `value.context` is attached ONLY
        // when at least one valid key survives, preserving the legacy output
        // shape (no `context` key) for old clients.
        const context = ProtocolValidator._sanitizeContext(raw.context);
        if (context !== null) {
            value.context = context;
        }
        // R4: opt-in perception channels for the NEXT-186/187 engine wires.
        // Same attach-only-when-present rule as context above (JSON path;
        // binary v2 fixed slots cannot carry these).
        const visual = sanitizePerceptionChannel(raw.visual, 'intensity');
        if (visual !== null) value.visual = visual;
        const audio = sanitizePerceptionChannel(raw.audio, 'loudness');
        if (audio !== null) value.audio = audio;
        // R36: opt-in visible-peer forwarding (JSON path only). Hosts
        // report peers their NPC can see; IntentResolver uses them for
        // WARN_GROUP/APPROACH_ALLY. Attach-only-when-present like context
        // above, so legacy clients keep the exact old shape (and peerless
        // behavior). Bounded at 32 ids; entries need a usable id.
        if (Array.isArray(raw.peers)) {
            const peers = [];
            for (const p of raw.peers) {
                const id = p && (p.id ?? p.agent_id ?? p);
                if ((typeof id !== 'string' && typeof id !== 'number') || String(id).trim().length === 0) continue;
                peers.push({ id: String(id).trim().slice(0, 256) });
                if (peers.length >= 32) break;
            }
            if (peers.length > 0) value.peers = peers;
        }
        return { valid: true, value };
    }

    static _sanitizeContext(rawContext) {
        if (!rawContext || typeof rawContext !== 'object' || Array.isArray(rawContext)) {
            return null;
        }
        const out = {};
        if (typeof rawContext.trust === 'number' && Number.isFinite(rawContext.trust)) {
            out.trust = Math.max(-1, Math.min(1, rawContext.trust));
        }
        for (const key of ['trustGain', 'calmTrustGain', 'traumaLoad', 'memoryLoad', 'identityWeight']) {
            const v = rawContext[key];
            if (typeof v === 'number' && Number.isFinite(v)) {
                out[key] = Math.max(0, Math.min(1.0, v));
            }
        }
        return Object.keys(out).length > 0 ? out : null;
    }

    static validateBatchTick(raw) {
        const dt = typeof raw.dt === 'number' && Number.isFinite(raw.dt) && raw.dt > 0 ? raw.dt : 0.0166;
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
            distance: typeof s.distance === 'number' && Number.isFinite(s.distance) ? Math.max(0, s.distance) : 10,
            x: finiteOr(Number(s.x), 0) || 0,
            y: finiteOr(Number(s.y), 0) || 0,
            z: finiteOr(Number(s.z), 0) || 0,
            intensity: clamp01Finite(s.intensity, 1.0),
            confidence: clamp01Finite(s.confidence, 1.0),
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
