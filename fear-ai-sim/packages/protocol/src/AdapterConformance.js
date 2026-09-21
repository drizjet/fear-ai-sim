/**
 * packages/protocol/src/AdapterConformance.js
 *
 * NEXT-126 (CCI-28 frontier 10 groundwork): third-party adapter conformance
 * harness (Section CLXXXVII). Lets any engine adapter prove it speaks the
 * canonical Fear AI wire contract WITHOUT a live server: handshake,
 * registration, tick request/response shapes, intent vocabulary, band
 * vocabulary, version agreement, and unknown-field tolerance.
 *
 * A passing harness means the adapter's bytes will be accepted by the
 * middleware; it does not promise gameplay quality (that needs a real
 * host run). Failing checks name the exact contract clause.
 */

import { PROTOCOL_VERSION, MESSAGE_TYPES } from './types.js';
import { ProtocolValidator } from './validator.js';
import { INTENT_CODES } from './BinaryWireProtocol.js';

const CANONICAL_INTENTS = new Set(Object.keys(INTENT_CODES).filter((k) => k !== 'UNKNOWN'));
// Mirrors FearCore FEAR_BANDS (protocol must not import core; the parity
// test below fails loudly on drift).
const CANONICAL_BANDS = new Set(['CALM', 'ALERT', 'ANXIOUS', 'PANIC', 'PRESENCE_BREAK',
    'RECOVER', 'AGGRESSIVE', 'HIDE', 'FREEZE', 'VAULTING', 'CRAWLING']);
function check(id, pass, detail = '') {
    return { id, pass: pass === true, detail };
}
/**
 * Run the full adapter conformance battery.
 * @param {object} adapter
 * @param {string} adapter.name adapter label (e.g. 'godot-gdscript-1.0')
 * @param {object} adapter.handshake sample HANDSHAKE_REQUEST payload
 * @param {object} adapter.register sample REGISTER_AGENT payload
 * @param {object} adapter.tickRequest sample BATCH_TICK_REQUEST payload
 * @param {object} adapter.tickResponse sample single-agent state from a tick reply
 * @param {string[]} [adapter.declaredIntents] intent strings the adapter may emit/consume
 * @param {string[]} [adapter.declaredBands] fear-band strings the adapter may emit/consume
 * @returns {{ adapter, passed, failed, checks }}
 */
export function runAdapterConformance(adapter = {}) {
    const checks = [];
    const name = adapter.name || 'unnamed-adapter';

    // 1. Handshake validates and agrees on the major protocol version.
    const hs = ProtocolValidator.validateIncomingMessage(adapter.handshake || {});
    checks.push(check('handshake-valid', hs.valid === true, hs.valid ? '' : JSON.stringify(hs.errors || hs)));
    const major = String(adapter.handshake?.protocol_version || '').split('.')[0];
    checks.push(check('version-major-match', major === String(PROTOCOL_VERSION).split('.')[0],
        `adapter=${adapter.handshake?.protocol_version || '?'} canonical=${PROTOCOL_VERSION}`));

    // 2. Unknown fields are tolerated, not rejected (forward compatibility).
    const hsExtra = ProtocolValidator.validateIncomingMessage({ ...(adapter.handshake || {}), future_field_xyz: 1 });
    checks.push(check('unknown-field-tolerance', hsExtra.valid === true));

    // 3. Registration validates.
    const reg = ProtocolValidator.validateIncomingMessage(adapter.register || {});
    checks.push(check('register-valid', reg.valid === true, reg.valid ? '' : JSON.stringify(reg.errors || reg)));

    // 4. Tick request validates.
    const tick = ProtocolValidator.validateIncomingMessage(adapter.tickRequest || {});
    checks.push(check('tick-request-valid', tick.valid === true, tick.valid ? '' : JSON.stringify(tick.errors || tick)));

    // 5. Tick response carries a usable advisory state.
    const st = adapter.tickResponse || {};
    const intent = st.action_intent || st.active_intent || {};
    checks.push(check('response-has-agent', typeof st.agent_id === 'string' && st.agent_id.length > 0));
    checks.push(check('response-band-known', CANONICAL_BANDS.has(st.fear_band),
        `band=${st.fear_band || '?'}`));
    checks.push(check('response-intent-known', CANONICAL_INTENTS.has(intent.type),
        `intent=${intent.type || '?'}`));

    // 6. Declared vocabularies stay inside the canonical sets.
    for (const [label, declared, canonical] of [
        ['intent', adapter.declaredIntents || [], CANONICAL_INTENTS],
        ['band', adapter.declaredBands || [], CANONICAL_BANDS]
    ]) {
        const bad = declared.filter((v) => !canonical.has(v));
        checks.push(check(`declared-${label}-vocabulary-clean`, bad.length === 0,
            bad.length > 0 ? `unknown: ${bad.join(',')}` : `${declared.length} declared`));
    }

    // 7. Message-type constants exist for the core verbs.
    for (const verb of [
        'HANDSHAKE_REQUEST',
        'REGISTER_AGENT',
        'REGISTER_AGENT_BATCH',
        'UNREGISTER_AGENT_BATCH',
        'TRAUMA_ZONE_BATCH',
        'BATCH_TICK_REQUEST'
    ]) {
        checks.push(check(`message-type-${verb}`, typeof MESSAGE_TYPES[verb] === 'string'));
    }

    const passed = checks.filter((c) => c.pass).length;
    return { adapter: name, passed, failed: checks.length - passed, checks };
}

/**
 * Canonical reference payloads: a correct adapter passes every check.
 * Third parties copy these shapes into their own language.
 */
export function canonicalAdapterSample() {
    return {
        name: 'canonical-reference',
        handshake: { type: 'HANDSHAKE_REQUEST', protocol_version: PROTOCOL_VERSION, client_id: 'ref', engine: 'Reference' },
        register: {
            type: 'REGISTER_AGENT', agent_id: 'a1', name: 'a1',
            traits: { neuroticism: 0.5, resilience: 0.5 }
        },
        registerBatch: {
            type: 'REGISTER_AGENT_BATCH',
            // `session_id` is what lets the server attribute ownership so a
            // returning host is recognised instead of fought with.
            session_id: 'host-session-1',
            claim: 'adopt',
            agents: [
                { agent_id: 'a1', name: 'a1', traits: { neuroticism: 0.5, resilience: 0.5 } },
                { agent_id: 'a2', name: 'a2', traits: { neuroticism: 0.2, resilience: 0.8 } }
            ]
        },
        unregisterBatch: {
            type: 'UNREGISTER_AGENT_BATCH',
            session_id: 'host-session-1',
            agent_ids: ['a1', 'a2']
        },
        traumaBatch: {
            type: 'TRAUMA_ZONE_BATCH',
            zones: [
                { x: 12, y: 0, z: 0, intensity: 0.9, radius: 120, lifetimeTicks: 900 },
                { x: 44, y: 8, z: 0, intensity: 0.4, radius: 150 }
            ]
        },
        tickRequest: {
            type: 'BATCH_TICK_REQUEST', dt: 0.016,
            observations: [{ agent_id: 'a1', threats: [{ id: 't', intensity: 0.7, distance: 8 }] }]
        },
        tickResponse: {
            agent_id: 'a1', fear_band: 'ALERT',
            action_intent: { type: 'FLEE_FROM', urgency: 0.8 }
        },
        declaredIntents: [...CANONICAL_INTENTS],
        declaredBands: [...CANONICAL_BANDS]
    };
}
