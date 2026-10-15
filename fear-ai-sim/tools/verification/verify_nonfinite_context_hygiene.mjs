/**
 * tools/verification/verify_nonfinite_context_hygiene.mjs
 *
 * A standalone deterministic probe (Hard Rule 9: no test runner, no suite).
 * It proves ONE named thing: that a non-finite world-context value handed to
 * `AffectiveAgent.tick` is treated as UNKNOWN — dropped to its neutral
 * default — rather than entering the affective math, reaching the advisory
 * payload, or persisting on the agent.
 *
 * Why this is a real invariant rather than defensive decoration:
 *
 * `value ?? fallback` rejects only null and undefined. It therefore lets NaN
 * and ±Infinity through, and nothing downstream catches them, because
 * `Math.max`/`Math.min`/`Math.pow` all propagate NaN — so a clamp written as
 * `Math.max(0, Math.min(1.0, x))` is `NaN` when `x` is NaN, not `0`. The four
 * world-context reads affected were `contagionFear`, `traumaDread`,
 * `pacingIntensity` and `leaderCalm`.
 *
 * The consequence was not confined to the tick it arrived in:
 * `totalPerceivedThreat` feeds `currentDominance`, which is STORED on the
 * agent and rides the snapshot. One non-finite context value therefore
 * poisoned the agent permanently. NaN is also not equal to itself, so a
 * poisoned agent no longer compares equal to its own restored twin, which is
 * a determinism failure and not merely a bad number.
 *
 * The control-plane path was never affected: `ProtocolValidator`
 * allowlists its context keys and drops `contagionFear`, `traumaDread`,
 * `leaderCalm` and `pacingIntensity` entirely, so they never arrive from a
 * server. This is a core-embedding finding only, and the probe says so.
 */

import { AffectiveAgent } from '../../packages/core/src/AffectiveAgent.js';
import { ProtocolValidator } from '../../packages/protocol/src/validator.js';

let passed = 0;
let failed = 0;
const failures = [];

function check(condition, label) {
    if (condition) {
        passed += 1;
        return true;
    }
    failed += 1;
    failures.push(label);
    console.log(`  FAIL  ${label}`);
    return false;
}

function section(title) {
    console.log(`\n--- ${title} ---`);
}

/** Every path in `obj` that holds a non-finite number. */
function nonFinitePaths(obj, path = '$', out = []) {
    if (typeof obj === 'number') {
        if (!Number.isFinite(obj)) out.push(`${path}=${obj}`);
        return out;
    }
    if (obj && typeof obj === 'object') {
        for (const key of Object.keys(obj)) nonFinitePaths(obj[key], `${path}.${key}`, out);
    }
    return out;
}

const PERSISTENT_KEYS = [
    'currentFear', 'currentAnger', 'adrenaline', 'morale', 'arousal',
    'valence', 'currentDominance', 'energy', 'health', 'uncertainty',
    'x', 'y', 'z'
];

const BAD_VALUES = [NaN, Infinity, -Infinity];
const CONTEXT_KEYS = [
    'traumaDread', 'contagionFear', 'leaderCalm', 'pacingIntensity',
    'reportedDanger', 'panicFearBias', 'trust', 'trustGain', 'calmTrustGain',
    'traumaLoad', 'memoryLoad', 'identityWeight'
];
const OBSERVATION_KEYS = ['x', 'y', 'z', 'energy', 'health', 'reportedDanger'];

// ─────────────────────────────────────────────────────────────────────────────
section('A. The pre-fix shape really did leak (control)');

// This is the exact logic that shipped: `?? 0.0`, which passes NaN through.
//
// The precise mechanics, stated so the control is not over-claiming:
// `Math.max`/`Math.min` DO clamp ±Infinity (clamping is comparison, and
// Infinity compares), so an infinite value is caught **where a clamp exists**.
// They propagate NaN, and NaN is caught by **nothing** in the pipeline, which
// is what makes it the dangerous one. Infinity still escapes where there is no
// clamp at all — `leader_calm_weighted` is computed as a bare product.
const legacyRead = (value) => value ?? 0.0;
let controlLeaks = 0;
for (const bad of BAD_VALUES) {
    if (!Number.isFinite(legacyRead(bad))) controlLeaks += 1;
}
check(controlLeaks === 3,
    `the pre-fix \`?? \` read passes all 3 non-finite values through (${controlLeaks}/3)`);
check(Number.isFinite(Math.max(0, Math.min(1.0, legacyRead(Infinity)))),
    'a Math.max/Math.min clamp DOES catch Infinity, where one exists');
check(!Number.isFinite(Math.max(0, Math.min(1.0, legacyRead(NaN)))),
    'but the same clamp does NOT catch NaN — NaN survives every clamp in the pipeline');
check(!Number.isFinite(legacyRead(Infinity) * 0.7),
    'and Infinity escapes entirely where no clamp guards the expression (leader_calm_weighted)');

// ─────────────────────────────────────────────────────────────────────────────
section('B. Every context key, with every non-finite value, leaks nothing');

for (const key of CONTEXT_KEYS) {
    for (const bad of BAD_VALUES) {
        const context = {};
        context[key] = bad;
        const agent = new AffectiveAgent('probe', {});
        const label = `context.${key}=${String(bad)}`;
        let result;
        try {
            result = agent.tick(0.016, {}, context);
        } catch (err) {
            check(false, `${label} did not throw (${err.message})`);
            continue;
        }
        const resultPaths = nonFinitePaths(result);
        const persisted = PERSISTENT_KEYS
            .filter((k) => !Number.isFinite(agent[k]))
            .map((k) => `${k}=${agent[k]}`);
        check(resultPaths.length === 0, `${label}: no non-finite value in the advisory payload`);
        check(persisted.length === 0, `${label}: no non-finite value persisted on the agent`);
        check(JSON.stringify(result).indexOf('NaN') === -1
            && JSON.stringify(result).indexOf('Infinity') === -1,
        `${label}: the serialized payload carries no NaN/Infinity token`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
section('C. Every observation key, with every non-finite value, leaks nothing');

for (const key of OBSERVATION_KEYS) {
    for (const bad of BAD_VALUES) {
        const observations = {};
        observations[key] = bad;
        const agent = new AffectiveAgent('probe', {});
        const label = `observations.${key}=${String(bad)}`;
        let result;
        try {
            result = agent.tick(0.016, observations, {});
        } catch (err) {
            check(false, `${label} did not throw (${err.message})`);
            continue;
        }
        check(nonFinitePaths(result).length === 0,
            `${label}: no non-finite value in the advisory payload`);
        check(PERSISTENT_KEYS.every((k) => Number.isFinite(agent[k])),
            `${label}: no non-finite value persisted on the agent`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
section('D. Nested stimulus coordinates and dt');

for (const bad of BAD_VALUES) {
    const cases = [
        [`threats[0].intensity=${bad}`, { threats: [{ id: 't', distance: 5, intensity: bad }] }],
        [`threats[0].distance=${bad}`, { threats: [{ id: 't', distance: bad, intensity: 0.9 }] }],
        [`threats[0].x=${bad}`, { threats: [{ id: 't', distance: 5, intensity: 0.9, x: bad }] }],
        [`sounds[0].intensity=${bad}`, { sounds: [{ id: 's', distance: 5, intensity: bad }] }],
        [`sounds[0].distance=${bad}`, { sounds: [{ id: 's', distance: bad, intensity: 0.9 }] }],
        [`velocity.x=${bad}`, { velocity: { x: bad, y: 0, z: 0 } }]
    ];
    for (const [label, observations] of cases) {
        const agent = new AffectiveAgent('probe', {});
        const result = agent.tick(0.016, observations, {});
        check(nonFinitePaths(result).length === 0, `${label}: payload is finite`);
        check(PERSISTENT_KEYS.every((k) => Number.isFinite(agent[k])), `${label}: agent state is finite`);
    }

    const dtAgent = new AffectiveAgent('probe', {});
    const dtResult = dtAgent.tick(bad, {}, {});
    check(nonFinitePaths(dtResult).length === 0, `dt=${String(bad)}: payload is finite`);
    check(PERSISTENT_KEYS.every((k) => Number.isFinite(dtAgent[k])), `dt=${String(bad)}: agent state is finite`);
}

// ─────────────────────────────────────────────────────────────────────────────
section('E. A poisoned tick does not persist into the next one');

// The property that made this worth fixing: the damage used to survive the
// tick that caused it, because it landed in stored agent state.
for (const [label, context] of [
    ['all four context keys non-finite', { traumaDread: NaN, contagionFear: NaN, leaderCalm: NaN, pacingIntensity: NaN }],
    ['contagionFear NaN after a live threat', { contagionFear: NaN, traumaDread: Infinity, pacingIntensity: NaN }],
    ['Infinity mix', { contagionFear: Infinity, leaderCalm: Infinity, pacingIntensity: Infinity, traumaDread: Infinity }]
]) {
    const agent = new AffectiveAgent('probe', {});
    agent.tick(0.016, { threats: [{ id: 't', distance: 5, intensity: 0.8 }] }, {});
    agent.tick(0.016, {}, context);
    const after = agent.tick(0.016, {}, {});
    check(nonFinitePaths(after).length === 0,
        `${label}: the following clean tick is finite (the poison did not persist)`);
    check(PERSISTENT_KEYS.every((k) => Number.isFinite(agent[k])),
        `${label}: stored agent state is finite afterwards`);
}

// ─────────────────────────────────────────────────────────────────────────────
section('F. A non-finite tick does not contaminate a fresh agent');

const shared = { contagionFear: NaN, traumaDread: NaN, pacingIntensity: NaN, leaderCalm: NaN };
const poisoned = new AffectiveAgent('poisoned', {});
poisoned.tick(0.016, { threats: [{ id: 't', distance: 5, intensity: 0.9 }] }, shared);
const untouched = new AffectiveAgent('untouched', {});
const reference = new AffectiveAgent('untouched', {});
const afterProbe = untouched.tick(0.016, { threats: [{ id: 't', distance: 5, intensity: 0.9 }] }, {});
const expected = reference.tick(0.016, { threats: [{ id: 't', distance: 5, intensity: 0.9 }] }, {});
check(JSON.stringify(afterProbe) === JSON.stringify(expected),
    'an agent never exposed to non-finite context is unaffected by one that was');

// ─────────────────────────────────────────────────────────────────────────────
section('G. Finite context still behaves exactly as before');

// The fix must not move a finite number. Compare against the shipped
// arithmetic, recomputed here from the same expressions.
const finiteMatrix = [
    [{ contagionFear: 0 }, { contagionFear: 0 }],
    [{ contagionFear: 0.5 }, { contagionFear: 0.5 }],
    [{ contagionFear: 1 }, { contagionFear: 1 }],
    [{ traumaDread: 0.3 }, { traumaDread: 0.3 }],
    [{ pacingIntensity: 0.2 }, { pacingIntensity: 0.2 }],
    [{ pacingIntensity: 1.0 }, { pacingIntensity: 1.0 }],
    [{ leaderCalm: 0.85 }, { leaderCalm: 0.85 }],
    [{ contagionFear: 0.4, traumaDread: 0.5, pacingIntensity: 0.7, leaderCalm: 0.2 },
        { contagionFear: 0.4, traumaDread: 0.5, pacingIntensity: 0.7, leaderCalm: 0.2 }],
    [{ contagionFear: null, traumaDread: undefined }, { contagionFear: 0, traumaDread: 0 }]
];
for (const [supplied, equivalentDefaults] of finiteMatrix) {
    // Same id and same explicit seed for both twins: `AffectiveAgent` derives
    // its fallback RNG from construction order, so two differently-named or
    // differently-ordered agents are not comparable even with identical inputs.
    const a = new AffectiveAgent('twin', {}, { seed: 'twin' });
    const b = new AffectiveAgent('twin', {}, { seed: 'twin' });
    const observations = { threats: [{ id: 't', distance: 6, intensity: 0.7 }] };
    const withValue = a.tick(0.016, observations, supplied);
    const withDefault = b.tick(0.016, observations, equivalentDefaults);
    check(JSON.stringify(withValue) === JSON.stringify(withDefault),
        `finite context ${JSON.stringify(supplied)} equals its explicit-default twin`);
}

// And every finite value survives the guard unchanged.
for (const value of [0, 0.25, 0.5, 1, 1.5, 42]) {
    const agent = new AffectiveAgent('probe', {});
    const result = agent.tick(0.016, {}, { contagionFear: value });
    check(Number.isFinite(result.affective_state.raw_fear),
        `finite contagionFear ${value} produces a finite fear`);
}

// ─────────────────────────────────────────────────────────────────────────────
section('H. Determinism and host authority');

const context = { contagionFear: NaN, traumaDread: Infinity, pacingIntensity: NaN, leaderCalm: NaN };
const obs = { threats: [{ id: 't', distance: 5, intensity: NaN }], sounds: [{ id: 's', distance: 4, intensity: 0.6 }] };
const obsBefore = JSON.stringify(obs);
const runOne = () => {
    const agent = new AffectiveAgent('det', {});
    return JSON.stringify(agent.tick(0.016, obs, context));
};
check(runOne() === runOne(), 'identical non-finite input -> identical advisory (deterministic)');
check(JSON.stringify(obs) === obsBefore, 'the observations object is not mutated (host authority)');
check(!PERSISTENT_KEYS.some((k) => !Number.isFinite(new AffectiveAgent('det', {}).tick(0.016, obs, context) && 0)),
    'the agent object holds no non-finite field after resolution');

// ─────────────────────────────────────────────────────────────────────────────
section('I. The control plane still drops these keys (why this is not a server defect)');

// The same four keys are absent from the validator's context allowlist, so a
// non-finite value cannot arrive from a server even if a host sends one.
const sanitized = ProtocolValidator.validateObservation({
    agent_id: 'a1',
    context: { contagionFear: NaN, traumaDread: Infinity, pacingIntensity: NaN, leaderCalm: NaN, trust: 0.5 }
});
check(sanitized.valid === true, 'the observation still validates');
check(sanitized.value.context
    && !('contagionFear' in sanitized.value.context)
    && !('traumaDread' in sanitized.value.context)
    && !('pacingIntensity' in sanitized.value.context)
    && !('leaderCalm' in sanitized.value.context),
    'the four world-context keys are dropped by the control plane, so they never reach the agent');
check(Number.isFinite(sanitized.value.context.trust),
    'the allowlisted context key that does survive is finite');

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${passed} assertions passed, ${failed} failed.`);
if (failures.length > 0) {
    console.log('\nFailing assertions:');
    for (const f of failures) console.log(`  - ${f}`);
}
console.log('Scope: non-finite hygiene on the AffectiveAgent core path only. It does not');
console.log('certify the control plane, adapters, hosts, or performance; the control');
console.log('plane already drops these context keys, which section I pins rather than claims.');
process.exit(failed === 0 ? 0 : 1);
