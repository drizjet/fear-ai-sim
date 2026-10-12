/**
 * tools/codegen/rust_fear_oracle/scenarios.mjs
 *
 * Shared by the oracle generator and `verify_cross_tree_parity.mjs`, so both build the
 * scenario list — and its hash — the same way. If they disagreed about the bytes, a
 * stale results file would look current.
 */
import crypto from 'node:crypto';

export const RUST_BAND_FOR_JS = Object.freeze({
    CALM: 'Calm',
    ALERT: 'Alert',
    ANXIOUS: 'Afraid',
    PANIC: 'Panicked'
});

/** Rust band -> the JS core state name that means the same thing, or null if JS has none. */
export const JS_STATE_FOR_RUST = Object.freeze({
    Calm: 'CALM',
    Alert: 'ALERT',
    Afraid: 'ANXIOUS',
    Panicked: 'PANIC',
    Routed: null,
    BerserkOverride: null
});

/** Ordered, fixed-key scenario list. NaN is encoded as `null` (JSON has no NaN). */
export function buildScenarios(vectors) {
    return vectors.boundary_test_vectors.map(v => {
        const s = v.rust_scenario;
        if (!s) throw new Error(`Vector ${v.id} has no rust_scenario`);
        return {
            id: v.id,
            initial_band: s.initial_band,
            recovery_lock_until: s.recovery_lock_until,
            eval_tick: s.eval_tick,
            score: s.score
        };
    });
}

export function sha256(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
}

/** Hash of the scenarios only; editing an `expected_*` field does not change it. */
export function scenariosSha256(vectors) {
    return sha256(JSON.stringify(buildScenarios(vectors)));
}

/** Source hash with line endings normalised so a CRLF checkout hashes like an LF one. */
export function sourceSha256(text) {
    return sha256(text.replace(/\r\n/g, '\n'));
}
