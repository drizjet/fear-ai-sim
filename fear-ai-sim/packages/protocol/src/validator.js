/**
 * Protocol Validator - Zero-dependency schema validation and defensive sanitization.
 */

import {
    PROTOCOL_VERSION,
    MESSAGE_TYPES,
    STIMULUS_TYPES,
    ERROR_CODES,
    MAX_BATCH_CONTROL_ITEMS,
    CLAIM_MODES
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
            case MESSAGE_TYPES.REGISTER_AGENT_BATCH:
                result = ProtocolValidator.validateRegisterBatch(raw);
                break;
            case MESSAGE_TYPES.UNREGISTER_AGENT:
                result = ProtocolValidator.validateUnregisterAgent(raw);
                break;
            case MESSAGE_TYPES.UNREGISTER_AGENT_BATCH:
                result = ProtocolValidator.validateUnregisterBatch(raw);
                break;
            case MESSAGE_TYPES.TRAUMA_ZONE_BATCH:
                result = ProtocolValidator.validateTraumaZoneBatch(raw);
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
                result = ProtocolValidator.validatePacingOverride(raw);
                break;
            case MESSAGE_TYPES.AUTH_RESPONSE:
                result = ProtocolValidator.validateAuthResponse(raw);
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
                initial_position: raw.initial_position || { x: 0, y: 0, z: 0 },
                ...ProtocolValidator.sanitizeClaim(raw)
            }
        };
    }

    /**
     * Extract the optional ownership-claim fields shared by the singular and
     * batch registration paths.
     *
     * `session_id` is what makes a reconnect an identity instead of a guess: a
     * returning host presents the same session id and the server can tell it
     * from a second host that merely happens to name the same agents.
     * A caller that omits it keeps today's behaviour exactly - registration is
     * accepted with no ownership recorded, and no arbitration is claimed for
     * it. `claim` defaults to `join`, which never displaces a live owner.
     */
    static sanitizeClaim(raw) {
        const out = {};
        if (raw && typeof raw.session_id === 'string' && raw.session_id.trim().length > 0) {
            out.session_id = raw.session_id.trim().slice(0, 256);
        }
        // The token proves continuity of the same host process. It is the
        // server's own 256-bit value echoed back, so it is length-bounded but
        // otherwise never interpreted: no structure to validate.
        if (raw && typeof raw.session_token === 'string' && raw.session_token.trim().length > 0) {
            out.session_token = raw.session_token.trim().slice(0, 512);
        }
        const claim = raw && typeof raw.claim === 'string' ? raw.claim.toLowerCase() : 'join';
        out.claim = CLAIM_MODES.includes(claim) ? claim : 'join';
        // "replace my credential with a fresh one". Only REGISTRATION acts on
        // this, and only for an identity that already proved itself with a
        // matching token; on the teardown routes it is carried and ignored, so a
        // client can send one consistent claim envelope everywhere.
        if (raw && raw.rotate_token === true) out.rotate_token = true;
        // The session's PUBLIC signing key, if the host registers one. Only the
        // PEM envelope is checked here - whether it is a real, usable key is a
        // cryptographic question the arbitration layer answers, and it refuses
        // an unparseable one rather than storing a key it could never verify
        // against. Bounded so a hostile client cannot push a megabyte of PEM
        // through the control plane.
        if (raw && typeof raw.signing_public_key === 'string'
            && raw.signing_public_key.includes('-----BEGIN PUBLIC KEY-----')) {
            out.signing_public_key = raw.signing_public_key.trim().slice(0, 4096);
        }
        return out;
    }

    /**
     * Validate a response to a WebSocket authentication challenge.
     *
     * Both fields are opaque to this layer: the challenge is echoed back because
     * the server needs to find the question it asked (and must not accept an
     * answer to a question it never asked), and the signature is base64 the
     * verifier either accepts or refuses.
     */
    static validateAuthResponse(raw) {
        const challenge = raw && typeof raw.challenge === 'string' ? raw.challenge.trim() : '';
        const signature = raw && typeof raw.signature === 'string' ? raw.signature.trim() : '';
        const errors = [];
        if (challenge.length === 0) errors.push('Missing required property "challenge"');
        if (signature.length === 0) errors.push('Missing required property "signature"');
        if (errors.length > 0) {
            return { valid: false, errors, code: ERROR_CODES.VALIDATION_FAILED };
        }
        return {
            valid: true,
            value: {
                type: MESSAGE_TYPES.AUTH_RESPONSE,
                challenge: challenge.slice(0, 256),
                signature: signature.slice(0, 4096),
                ...ProtocolValidator.sanitizeClaim(raw)
            }
        };
    }

    /**
     * Validate a batch of agent registrations.
     *
     * Semantics chosen deliberately: a malformed ENTRY is reported, not fatal.
     * A host registering a crowd must not lose 27 NPCs because one entry has a
     * bad trait, and it has to be able to see exactly which entries to fix. The
     * batch as a whole is rejected only when the envelope itself is unusable:
     * not an object, no `agents` array, an empty array, or more entries than
     * `MAX_BATCH_REGISTRATION_AGENTS`.
     *
     * Duplicate ids inside one batch collapse to the last entry, so a single
     * request can never register the same agent twice.
     */
    static validateRegisterBatch(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return { valid: false, errors: ['Batch registration must be a non-null object'], code: ERROR_CODES.VALIDATION_FAILED };
        }
        if (!Array.isArray(raw.agents)) {
            return { valid: false, errors: ['Missing required property "agents" (array)'], code: ERROR_CODES.VALIDATION_FAILED };
        }
        if (raw.agents.length === 0) {
            return { valid: false, errors: ['Property "agents" cannot be empty'], code: ERROR_CODES.VALIDATION_FAILED };
        }
        if (raw.agents.length > MAX_BATCH_CONTROL_ITEMS) {
            return {
                valid: false,
                errors: [`Property "agents" exceeds the ${MAX_BATCH_CONTROL_ITEMS}-agent batch limit; split the batch`],
                code: ERROR_CODES.VALIDATION_FAILED
            };
        }

        // Envelope-level ownership applies to every entry that does not state
        // its own, so a host naming one session for a whole crowd does not have
        // to repeat it 512 times.
        const envelopeClaim = ProtocolValidator.sanitizeClaim(raw);
        const agents = [];
        const rejected = [];
        const seenIndex = new Map();
        for (let i = 0; i < raw.agents.length; i++) {
            const entry = raw.agents[i];
            const res = ProtocolValidator.validateRegisterAgent(entry);
            if (!res.valid) {
                rejected.push({
                    index: i,
                    agent_id: entry && entry.agent_id !== undefined && entry.agent_id !== null ? String(entry.agent_id) : null,
                    errors: res.errors
                });
                continue;
            }
            const merged = { ...res.value };
            if (!entry || entry.session_id === undefined) merged.session_id = envelopeClaim.session_id;
            if (!entry || entry.session_token === undefined) merged.session_token = envelopeClaim.session_token;
            if (!entry || entry.claim === undefined) merged.claim = envelopeClaim.claim;
            if (seenIndex.has(merged.agent_id)) {
                agents[seenIndex.get(merged.agent_id)] = merged;
            } else {
                seenIndex.set(merged.agent_id, agents.length);
                agents.push(merged);
            }
        }

        return {
            valid: true,
            value: {
                type: MESSAGE_TYPES.REGISTER_AGENT_BATCH,
                session_id: envelopeClaim.session_id,
                // The envelope token must survive validation: it is the request's
                // proof of identity, and a batch establishes identity ONCE for
                // the whole request rather than per entry.
                session_token: envelopeClaim.session_token,
                claim: envelopeClaim.claim,
                rotate_token: envelopeClaim.rotate_token === true,
                // A signing key belongs to the REQUEST's identity, not to an
                // individual agent entry, so it is carried at the envelope level
                // exactly like the token.
                signing_public_key: envelopeClaim.signing_public_key,
                agents,
                rejected
            }
        };
    }

    /**
     * Validate a batch of agent unregistrations.
     *
     * Same non-fatal-per-entry discipline as registration, with one deliberate
     * difference in what counts as success: an agent that was not registered is
     * a terminal, non-error outcome. The caller's intent is "this agent is not
     * in the session", and that is already true - but the client still has to
     * be told, or it would requeue the id forever waiting for a confirmation
     * that will never come.
     */
    static validateUnregisterBatch(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return { valid: false, errors: ['Batch unregistration must be a non-null object'], code: ERROR_CODES.VALIDATION_FAILED };
        }
        if (!Array.isArray(raw.agent_ids)) {
            return { valid: false, errors: ['Missing required property "agent_ids" (array)'], code: ERROR_CODES.VALIDATION_FAILED };
        }
        if (raw.agent_ids.length === 0) {
            return { valid: false, errors: ['Property "agent_ids" cannot be empty'], code: ERROR_CODES.VALIDATION_FAILED };
        }
        if (raw.agent_ids.length > MAX_BATCH_CONTROL_ITEMS) {
            return {
                valid: false,
                errors: [`Property "agent_ids" exceeds the ${MAX_BATCH_CONTROL_ITEMS}-item batch limit; split the batch`],
                code: ERROR_CODES.VALIDATION_FAILED
            };
        }

        const agentIds = [];
        const rejected = [];
        const seen = new Set();
        for (let i = 0; i < raw.agent_ids.length; i++) {
            const res = ProtocolValidator.validateUnregisterAgent({ agent_id: raw.agent_ids[i] });
            if (!res.valid) {
                rejected.push({
                    index: i,
                    agent_id: raw.agent_ids[i] === undefined || raw.agent_ids[i] === null ? null : String(raw.agent_ids[i]),
                    errors: res.errors
                });
                continue;
            }
            // A duplicate id is idempotent here rather than last-write-wins:
            // unregistering twice cannot mean anything different from once.
            if (seen.has(res.value.agent_id)) continue;
            seen.add(res.value.agent_id);
            agentIds.push(res.value.agent_id);
        }

        return {
            valid: true,
            value: {
                type: MESSAGE_TYPES.UNREGISTER_AGENT_BATCH,
                session_id: ProtocolValidator.sanitizeClaim(raw).session_id,
                session_token: ProtocolValidator.sanitizeClaim(raw).session_token,
                agent_ids: agentIds,
                rejected
            }
        };
    }

    /**
     * Validate a batch of trauma-zone authorings.
     *
     * Unlike the other two, entries here are world state rather than identity,
     * so a malformed entry is rejected with its index and the rest are still
     * applied. Zones are independent: partial application is the correct
     * outcome, because a settlement with 40 authored zone positions should not
     * lose all of them to one typo.
     */
    static validateTraumaZoneBatch(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return { valid: false, errors: ['Batch trauma authoring must be a non-null object'], code: ERROR_CODES.VALIDATION_FAILED };
        }
        if (!Array.isArray(raw.zones)) {
            return { valid: false, errors: ['Missing required property "zones" (array)'], code: ERROR_CODES.VALIDATION_FAILED };
        }
        if (raw.zones.length === 0) {
            return { valid: false, errors: ['Property "zones" cannot be empty'], code: ERROR_CODES.VALIDATION_FAILED };
        }
        if (raw.zones.length > MAX_BATCH_CONTROL_ITEMS) {
            return {
                valid: false,
                errors: [`Property "zones" exceeds the ${MAX_BATCH_CONTROL_ITEMS}-item batch limit; split the batch`],
                code: ERROR_CODES.VALIDATION_FAILED
            };
        }

        const zones = [];
        const rejected = [];
        for (let i = 0; i < raw.zones.length; i++) {
            const entry = raw.zones[i];
            const errors = [];
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                rejected.push({ index: i, errors: ['Zone must be a non-null object'] });
                continue;
            }
            for (const axis of ['x', 'y']) {
                if (typeof entry[axis] !== 'number' || !Number.isFinite(entry[axis])) {
                    errors.push(`Property "${axis}" must be a finite number`);
                }
            }
            if (entry.z !== undefined && (typeof entry.z !== 'number' || !Number.isFinite(entry.z))) {
                errors.push('Property "z" must be a finite number when present');
            }
            if (entry.intensity !== undefined && (typeof entry.intensity !== 'number' || !Number.isFinite(entry.intensity) || entry.intensity < 0 || entry.intensity > 1)) {
                errors.push('Property "intensity" must be a finite number in [0, 1]');
            }
            if (entry.radius !== undefined && (typeof entry.radius !== 'number' || !Number.isFinite(entry.radius) || entry.radius <= 0)) {
                errors.push('Property "radius" must be a finite number greater than 0');
            }
            if (entry.lifetimeTicks !== undefined && (!Number.isInteger(entry.lifetimeTicks) || entry.lifetimeTicks < 0)) {
                errors.push('Property "lifetimeTicks" must be a non-negative integer');
            }
            if (errors.length > 0) {
                rejected.push({ index: i, errors });
                continue;
            }
            zones.push({
                x: entry.x,
                y: entry.y,
                z: entry.z ?? 0,
                intensity: entry.intensity ?? 1.0,
                radius: entry.radius ?? 150,
                lifetimeTicks: entry.lifetimeTicks ?? 1800
            });
        }

        return {
            valid: true,
            value: { type: MESSAGE_TYPES.TRAUMA_ZONE_BATCH, zones, rejected }
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
                agent_id: String(raw.agent_id).trim().slice(0, 256),
                // Teardown is ownership-gated, so it has to be able to carry the
                // same identity a claim does. Without this a host could not
                // prove it owns the agent it is retiring, and the gate would
                // read its own host as a stranger.
                ...ProtocolValidator.sanitizeClaim(raw)
            }
        };
    }

    /**
     * Validate a session revocation: the host ending its own session.
     *
     * Both fields are required, because a name alone must never be enough to
     * destroy a session - that would make revocation the cheapest denial-of-
     * service in the protocol.
     */
    static validateSessionRevoke(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return { valid: false, errors: ['Revocation must be a non-null object'], code: ERROR_CODES.VALIDATION_FAILED };
        }
        if (typeof raw.session_id !== 'string' || raw.session_id.trim().length === 0) {
            return { valid: false, errors: ['Missing or empty "session_id"'], code: ERROR_CODES.VALIDATION_FAILED };
        }
        if (typeof raw.session_token !== 'string' || raw.session_token.trim().length === 0) {
            return { valid: false, errors: ['Missing or empty "session_token"'], code: ERROR_CODES.VALIDATION_FAILED };
        }
        return {
            valid: true,
            value: {
                type: 'SESSION_REVOKE',
                session_id: raw.session_id.trim().slice(0, 256),
                session_token: raw.session_token.trim().slice(0, 512)
            }
        };
    }

    static validatePacingOverride(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return { valid: false, errors: ['Pacing override must be a non-null object'], code: ERROR_CODES.VALIDATION_FAILED };
        }
        const intensity = raw.intensity ?? null;
        if (intensity !== null && (typeof intensity !== 'number' || !Number.isFinite(intensity))) {
            return { valid: false, errors: ['Property "intensity" must be a finite number or null'], code: ERROR_CODES.VALIDATION_FAILED };
        }
        return {
            valid: true,
            value: {
                type: MESSAGE_TYPES.SET_PACING_OVERRIDE,
                intensity: intensity === null ? null : Math.max(0, Math.min(1.5, intensity))
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
