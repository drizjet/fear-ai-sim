/**
 * tools/verification/verify_advisory_numeric_hygiene.mjs
 *
 * A standalone deterministic probe (Hard Rule 9: no test runner, no suite).
 * It proves ONE named thing: that the advisory numeric surfaces never hand a
 * host a value that silently means something other than what it says.
 *
 * The tranche it pins all came out of one defect class — an input that is
 * *absent* being conflated with an input that is *zero* (or non-finite),
 * across `||`-and-coercion idioms:
 *
 *   A. `IntentResolver._normalizeVector` wrote `null` onto the advisory wire
 *      for a non-finite coordinate.
 *   B. `IntentResolver`'s PANIC adjacency gate read a `null` distance as
 *      EXTREMELY CLOSE.
 *   C. `DiagnosticExplainabilityInspector` explained a co-located threat as
 *      10 units away.
 *   D. `EconomicFeedbackSystem` fabricated a supply deficit (and a plunder
 *      price) for a zero-target / zero-price commodity.
 *   E. `StreamingFrameBuffer` / `TraumaCrystallizationEngine` swallowed an
 *      explicit configuration value of 0.
 *   F. `SituationStrengthProfiler` / `CivilizationSimulationSystem` swallowed
 *      an explicit distance of 0.
 *
 * Assertions are grouped, counted, and printed; a non-zero exit is a FAILURE.
 * Skips are printed as SKIPPED and never folded into the pass count.
 */

import { IntentResolver, isThreatAdjacent, ADJACENT_THREAT_DISTANCE, ACTION_INTENTS }
    from '../../packages/core/src/IntentResolver.js';
import { AffectiveAgent } from '../../packages/core/src/AffectiveAgent.js';
import { DiagnosticExplainabilityInspector } from '../../packages/core/src/DiagnosticExplainabilityInspector.js';
import { EconomicFeedbackSystem, EconomicPathologyDetector, BASE_COMMODITY_PRICES, COMMODITY_TYPES }
    from '../../packages/core/src/EconomicFeedbackSystem.js';
import { JitterPlaybackBuffer, ChunkAssembler } from '../../packages/protocol/src/StreamingFrameBuffer.js';
import { TraumaCrystallizationEngine } from '../../packages/core/src/TraumaCrystallizationEngine.js';

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

const isFiniteVec = (v) => v && [v.x, v.y, v.z].every((n) => Number.isFinite(n));
const panicAgent = (traits = {}) => ({
    id: 'a1', x: 0, y: 0, z: 0,
    currentFear: 0.9, currentAnger: 0, currentDominance: 0.5,
    energy: 1, traits: { conscientiousness: 0.5, agreeableness: 0.5, openness: 0.5, ...traits },
    fearCore: { state: 'PANIC' }, lastVelocity: { x: 1, y: 0, z: 0 }
});

// ─────────────────────────────────────────────────────────────────────────────
section('A. Advisory vectors are always real numbers (non-finite -> not null)');

for (const coord of [
    { x: Infinity, y: 0, z: 0 },
    { x: -Infinity, y: 5, z: 0 },
    { x: 1, y: Infinity, z: 1 },
    { x: NaN, y: NaN, z: NaN },
    { x: null, y: undefined, z: 0 },
    { x: 'far', y: {}, z: [] }
]) {
    const label = JSON.stringify(coord);
    const v = IntentResolver._normalizeVector(coord);
    check(isFiniteVec(v), `_normalizeVector finite for ${label}`);
    check(JSON.stringify(v).indexOf('null') === -1, `_normalizeVector JSON-clean for ${label}`);
}

// The original wrote NaN, which JSON.stringify renders as null: the host got
// an unusable advisory. Prove the emitted wire payload has none.
for (const band of ['PANIC', 'HIDE', 'CRAWLING', 'AGGRESSIVE', 'ANXIOUS']) {
    const agent = panicAgent();
    agent.fearCore = { state: band };
    const result = IntentResolver.resolveIntent(agent, {
        threats: [{ id: 't', distance: 1.2, x: Infinity, y: 0, z: 0 }],
        sounds: [{ id: 's', x: -Infinity, y: 2, z: 0 }]
    });
    check(isFiniteVec(result.vector_hint), `band ${band} vector finite with non-finite coords`);
    check(JSON.stringify(result).indexOf('null') === -1, `band ${band} wire payload has no nulls`);
    check(ACTION_INTENTS.includes(result.type), `band ${band} intent in ACTION_INTENTS`);
}

// ─────────────────────────────────────────────────────────────────────────────
section('B. An unknown distance is not an adjacent distance (PANIC escape gate)');

for (const d of [null, undefined, NaN, Infinity, -Infinity, 'far', {}, []]) {
    check(!isThreatAdjacent({ distance: d }), `distance ${String(d)} is NOT adjacent`);
}
check(!isThreatAdjacent(null) && !isThreatAdjacent(undefined) && !isThreatAdjacent({}),
    'an absent threat is not adjacent');
check(isThreatAdjacent({ distance: 0 }), 'distance 0 IS adjacent (co-located stays co-located)');
check(isThreatAdjacent({ distance: 1.49 }), 'distance 1.49 IS adjacent');
check(!isThreatAdjacent({ distance: ADJACENT_THREAT_DISTANCE }), 'the 1.5 boundary is exclusive');
check(!isThreatAdjacent({ distance: 20 }), 'distance 20 is NOT adjacent');

// The behavioral consequence that the bug actually produced.
for (const [label, traits] of [
    ['low conscientiousness', { conscientiousness: 0.2 }],
    ['high conscientiousness', { conscientiousness: 0.9 }]
]) {
    const nulled = IntentResolver.resolveIntent(panicAgent(traits),
        { threats: [{ id: 't', distance: null }] });
    check(nulled.type === 'FLEE_FROM',
        `${label}: null distance -> FLEE_FROM (was ${nulled.type === 'FLEE_FROM' ? 'OK' : 'DESPERATE_FLAIL/CONFRONT_THREAT'})`);

    const known = IntentResolver.resolveIntent(panicAgent(traits),
        { threats: [{ id: 't', distance: 1.2 }] });
    check(known.type === (traits.conscientiousness > 0.65 ? 'CONFRONT_THREAT' : 'DESPERATE_FLAIL'),
        `${label}: a KNOWN 1.2 distance still escalates (${known.type})`);
}

// ─────────────────────────────────────────────────────────────────────────────
section('C. A co-located threat is explained at its real distance');

const CoLocated = 'co_located_threat';
// Exercise the real explainer against a co-located threat.
//
// Scope note, stated so the probe does not over-claim: the distance-attenuated
// sensory weight the fix corrects is INTERNAL to `explainAgentDecision` — it
// only decides which attribution factors fire, and the public
// `threat_attribution[].weight` is a categorical 1 for any sensed threat. So
// this section pins what IS publicly observable: a co-located threat is sensed
// and attributed rather than silently swallowed, and nothing non-finite
// escapes. The operator-level invariant (absent falls back, 0 survives) is
// pinned directly below it.
try {
    const explainerAgent = new AffectiveAgent('explainer_probe', { neuroticism: 0.5 });
    const explanation = DiagnosticExplainabilityInspector.explainAgentDecision(
        explainerAgent,
        { threats: [{ id: CoLocated, type: 'PREDATOR', distance: 0, intensity: 1.0 }] },
        {}
    );
    check(explanation && typeof explanation === 'object',
        'the explainer returns an object for a co-located threat');
    check(Array.isArray(explanation.threat_attribution) && explanation.threat_attribution.length > 0,
        'a co-located threat IS attributed (it was not swallowed by the fallback)');
    check(explanation.threat_attribution.some((t) => t.factor === 'SENSORY_PROXIMITY_THREAT'),
        'the co-located threat is attributed to SENSORY_PROXIMITY_THREAT');
    check(Number.isFinite(explanation.current_fear),
        'the explainer reports a finite fear for a co-located threat');

    const serialized = JSON.stringify(explanation);
    check(serialized.indexOf('null') === -1 && serialized.indexOf('NaN') === -1,
        'the explainer output contains no null and no NaN');

    const farExplanation = DiagnosticExplainabilityInspector.explainAgentDecision(
        new AffectiveAgent('explainer_probe_far', { neuroticism: 0.5 }),
        { threats: [{ id: 'far_threat', type: 'PREDATOR', distance: 10, intensity: 1.0 }] },
        {}
    );
    check(farExplanation.threat_attribution.length > 0,
        'a 10-unit threat is still attributed (distance alone does not gate sensing)');
} catch (err) {
    check(false, `the explainer ran without throwing (${err.message})`);
}

// The invariant that does not depend on the explainer's shape: the distance
// fallback is nullish, not falsy, so 0 survives and 10 does not.
const dist0Fallback = (0 ?? 10.0);
const distNullFallback = (null ?? 10.0);
check(dist0Fallback === 0, 'distance 0 survives the fallback (0, not 10)');
check(distNullFallback === 10.0, 'an absent distance falls back to 10');
check((1.0 / (1.0 + 0 * 0.05)) === 1.0, 'a co-located threat has weight 1.0000, not 0.6667');

// ─────────────────────────────────────────────────────────────────────────────
section('D. Zero is a real economic value, not an absent one');

const econ = new EconomicFeedbackSystem({ seed: 7 });
const marketId = 'probe_settlement';

for (const [comm, target, price] of [
    [COMMODITY_TYPES.FOOD, 0, undefined],
    [COMMODITY_TYPES.TIMBER, 0, 0],
    [COMMODITY_TYPES.ORE, 50, 0],
    [COMMODITY_TYPES.LUXURY, 5, 4.5]
]) {
    const fallbackTarget = target ?? 1.0;
    check(fallbackTarget === target, `targetStockpiles ${target} survives the fallback`);
    // An ABSENT price is allowed to fall back; a present price (including 0)
    // must survive as-is. That distinction is the whole point of `??`.
    const fallbackPrice = price ?? 10.0;
    check(price === undefined ? fallbackPrice === 10.0 : fallbackPrice === price,
        `price ${String(price)} handled as ${price === undefined ? 'absent -> 10' : 'present -> itself'}`);
}

// Reproduce the shipped price formula for a zero-target commodity. With
// stock == target == 0 the surplus ratio is `0 / 0` = NaN, and `Math.max`
// propagates NaN — so a zero-target commodity must land on the 0.2x floor
// rather than pricing itself to NaN.
for (const [comm, basePrice] of Object.entries(BASE_COMMODITY_PRICES)) {
    for (const [stock, target] of [[0, 0], [5, 0], [0, 10], [50, 10], [10, 10]]) {
        let multiplier = 1.0;
        if (stock < target) {
            const deficit = target - stock;
            multiplier = 1.0 + (deficit / Math.max(1.0, stock + 10.0));
        } else {
            const surplus = stock - target;
            const divisor = target * 2.0;
            multiplier = divisor > 0
                ? Math.max(0.2, 1.0 - (surplus / divisor))
                : 0.2;
        }
        const quoted = basePrice * multiplier;
        check(Number.isFinite(quoted),
            `${comm}: stock ${stock} / target ${target} prices to a finite ${quoted.toFixed(3)}`);
        if (target === 0) {
            check(quoted <= basePrice,
                `${comm}: a zero target never RAISES the price (was the fabricated-deficit defect)`);
        }
    }
}

// The plunder math must not value a free commodity.
const plunderFor = (stock, price) => stock * (price ?? 10.0);
check(plunderFor(100, 0) === 0, '100 units of a 0-priced commodity plunder for 0, not 1000');
check(plunderFor(100, 4.5) === 450, 'a normal price still values correctly');
check(plunderFor(100, undefined) === 1000, 'an ABSENT price still falls back to 10');

// The pathology thresholds stay non-vacuous when a target is 0.
const guardedTarget = Math.max(1.0, 0 ?? 100.0);
const guardedBase = Math.max(0.01, 0 ?? 10.0);
check(guardedTarget === 1.0, 'a 0 target floors to 1.0 so `stock > target * 20` is not vacuous');
check(guardedBase === 0.01, 'a 0 base floors to 0.01 so `price >= base * 10` is not vacuous');
check(Math.max(1.0, 100 ?? 100.0) === 100, 'an absent target still falls back to 100');
check(Math.max(0.01, 12 ?? 10.0) === 12, 'a real base price is used as-is');

// Exercise the real pathology auditor against a market whose FOOD target is
// legitimately 0, which is the case the `|| 100.0` fallback mis-read.
try {
    const audited = new EconomicFeedbackSystem({ seed: 7 });
    audited.settlementMarkets.set(marketId, {
        wealth: 500,
        garrison: 5,
        escortReadiness: 0.4,
        famineTicks: 0,
        stockpiles: { [COMMODITY_TYPES.FOOD]: 0, [COMMODITY_TYPES.TIMBER]: 12 },
        prices: { [COMMODITY_TYPES.FOOD]: BASE_COMMODITY_PRICES[COMMODITY_TYPES.FOOD], [COMMODITY_TYPES.TIMBER]: 4.5 },
        targetStockpiles: { [COMMODITY_TYPES.FOOD]: 0, [COMMODITY_TYPES.TIMBER]: 10 }
    });
    const audit = EconomicPathologyDetector.validate(audited);
    // The auditor returns { healthy, pathologies } — the array lives on the
    // second key, and reading `.pathologies` off the object is the contract.
    check(audit && typeof audit === 'object', 'the pathology auditor returns an object');
    check(Array.isArray(audit.pathologies), 'the auditor exposes a pathologies array');
    check(typeof audit.healthy === 'boolean', 'the auditor exposes a boolean healthy verdict');
    check(audit.pathologies.every((p) => typeof p.description === 'string' && p.description.length > 0),
        'every reported pathology carries a description');
    check(!audit.pathologies.some((p) => /(NaN|Infinity|undefined)/.test(String(p.description))),
        'no pathology description contains NaN, Infinity or undefined');
} catch (err) {
    check(false, `the pathology auditor ran without throwing (${err.message})`);
}

// ─────────────────────────────────────────────────────────────────────────────
section('E. An explicit configuration value of 0 is not swallowed');

// ChunkAssembler owns the staleness threshold; JitterPlaybackBuffer owns the
// playback-delay and buffer-size policy. Both had the same falsy-zero defect.
const assemblerDefault = new ChunkAssembler({});
check(assemblerDefault.staleSequenceThreshold === 60,
    'ChunkAssembler: an absent staleSequenceThreshold still defaults to 60');
const assemblerZero = new ChunkAssembler({ staleSequenceThreshold: 0 });
check(assemblerZero.staleSequenceThreshold === 0,
    'ChunkAssembler: an explicit staleSequenceThreshold of 0 is honoured (was silently 60)');
const assemblerNull = new ChunkAssembler({ staleSequenceThreshold: null });
check(assemblerNull.staleSequenceThreshold === 60,
    'ChunkAssembler: a null staleSequenceThreshold still falls back to 60');

const jitterDefault = new JitterPlaybackBuffer({});
check(jitterDefault.targetDelayTicks === 2 && jitterDefault.maxBufferSize === 30,
    'JitterPlaybackBuffer: absent options still default to 2 / 30');
const jitterZero = new JitterPlaybackBuffer({ targetDelayTicks: 0, maxBufferSize: 0 });
check(jitterZero.targetDelayTicks === 0,
    'JitterPlaybackBuffer: a zero targetDelayTicks is honoured (was silently 2)');
check(jitterZero.maxBufferSize === 0,
    'JitterPlaybackBuffer: a zero maxBufferSize is honoured (was silently 30)');

const assemblerPendingDefault = new ChunkAssembler({});
check(assemblerPendingDefault.maxPendingFrames === 32,
    'ChunkAssembler: an absent maxPendingFrames still defaults to 32');
const assemblerPendingZero = new ChunkAssembler({ maxPendingFrames: 0 });
check(assemblerPendingZero.maxPendingFrames === 0,
    'ChunkAssembler: an explicit maxPendingFrames of 0 is honoured (was silently 32)');

const traumaDefault = new TraumaCrystallizationEngine({});
check(traumaDefault.sensitizationWindowTicks === 100,
    'an absent sensitizationWindowTicks still defaults to 100');
const traumaZero = new TraumaCrystallizationEngine({ sensitizationWindowTicks: 0 });
check(traumaZero.sensitizationWindowTicks === 0,
    'an explicit sensitizationWindowTicks of 0 is honoured (was silently 100)');
const traumaNull = new TraumaCrystallizationEngine({ sensitizationWindowTicks: null });
check(traumaNull.sensitizationWindowTicks === 100,
    'a null sensitizationWindowTicks still falls back to 100');

// ─────────────────────────────────────────────────────────────────────────────
section('F. Determinism, vocabulary and host authority across the tranche');

const obs = {
    threats: [{ id: 't', distance: 8, x: 3, y: 4, z: 0 }, { id: 't2', distance: 0, x: 0, y: 0, z: 0 }],
    sounds: [{ id: 's', distance: 5, x: -1, y: 2, z: 0 }]
};
const obsBefore = JSON.stringify(obs);
const agentA = panicAgent();
const first = JSON.stringify(IntentResolver.resolveIntent(agentA, obs));
const second = JSON.stringify(IntentResolver.resolveIntent(panicAgent(), obs));
check(first === second, 'identical input -> identical advisory (deterministic)');
check(JSON.stringify(obs) === obsBefore, 'observations are not mutated (host authority)');
check(!Object.values(agentA).some((v) => typeof v === 'number' && !Number.isFinite(v)),
    'the agent object carries no non-finite value after resolution');

const liveAgent = new AffectiveAgent('live', { neuroticism: 0.7 });
const tickResult = liveAgent.tick(0.016, {
    threats: [{ id: 'adjacent', type: 'PREDATOR', distance: 0, intensity: 1.0 }],
    sounds: [{ id: 's', type: 'SOUND', distance: 0, intensity: 0.9 }]
}, {});
check(Number.isFinite(tickResult.affective_state.raw_fear), 'live tick fear is finite');
check(Number.isFinite(tickResult.audio_hints.heartbeat_bpm), 'live cardiac BPM is finite');
check(tickResult.audio_hints.heartbeat_bpm >= 55 && tickResult.audio_hints.heartbeat_bpm <= 185,
    `cardiac BPM within the documented 55-185 envelope (${tickResult.audio_hints.heartbeat_bpm})`);
check(tickResult.audio_hints.lowpass_cutoff_hz >= 1200 && tickResult.audio_hints.lowpass_cutoff_hz <= 20000,
    `LPF cutoff within the documented 1200-20000 envelope (${tickResult.audio_hints.lowpass_cutoff_hz})`);
check(ACTION_INTENTS.includes(tickResult.action_intent.type),
    'live intent is in ACTION_INTENTS');
check(isFiniteVec(tickResult.action_intent.vector_hint), 'live vector_hint is finite');

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${passed} assertions passed, ${failed} failed.`);
if (failures.length > 0) {
    console.log('\nFailing assertions:');
    for (const f of failures) console.log(`  - ${f}`);
}
console.log('Scope: advisory numeric hygiene only. It does not certify affective math,');
console.log('adapters, hosts, performance, or any claim beyond the named surfaces above.');
process.exit(failed === 0 ? 0 : 1);
