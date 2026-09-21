#!/usr/bin/env node

/**
 * verify_contagion_transmission.mjs — does fear actually cross between agents?
 *
 * Why this probe exists. Eight probes referenced `contagion`, and every one of
 * them checked BOOKKEEPING: that `lastContagion` has one entry per live agent,
 * that `activeEdges` never exceeds `maxEdges`, that unregister clears both, that
 * a restored snapshot does not resurrect a dead edge. `verify_compound_collisions`
 * exercises `ContagionGraph` directly, but constructs it itself and feeds
 * `contagionFear` in by hand — which means it proves the arithmetic and proves
 * nothing about `RuntimeSimulation`'s own peer-gathering path.
 *
 * The consequence was live in the tree. The canonical narrative demo narrated a
 * cascade next to a peer reading `CALM Fear=0.00`, and no gate anywhere could see
 * it, because nothing asserted that a panicking agent makes a calm neighbour more
 * afraid. This probe asserts exactly that, end to end, through the real runtime.
 *
 * It also pins the property that made the old demo fail, because that property is
 * surprising enough to be worth a tripwire. `ContagionGraph` does not transmit a
 * peer's continuous fear; it transmits a value QUANTIZED BY BAND:
 *
 *     PANIC  -> sourceFear 0.9      ANXIOUS -> sourceFear 0.4      else -> rawFear
 *
 * So an ANXIOUS neighbour transmits a constant impact no matter how afraid it
 * actually is, and for the demo's geometry (8 m apart, radius 300, base strength
 * 0.4) that constant lands at ~0.1495 — just under the 0.15 threshold at which an
 * edge is recorded as telemetry. A peer climbing 0.55 -> 0.85 transmits nothing
 * new and draws no edge, which is precisely what the demo showed. Only a source
 * that has reached the PANIC CLASS raises the value to 0.9 and the impact to
 * ~0.336, which is what lets a neighbour climb at all. If that quantization is
 * ever made continuous, this probe fails and the change is deliberate rather than
 * silent.
 *
 * The panic class itself is section B0, and it is the reason this file's earlier
 * draft needed a caveat. "Is this source panicking?" used to be three disagreeing
 * literals — `band === 'PANIC' || rawFear > 0.8` in the runtime (twice) and
 * `... || fear >= 0.70` in the group contagion system — while the band the first
 * clause names turns PANIC at `enter.PANIC / FEAR_SCALE` = `3.8 / 4.2` = 0.9048.
 * So a source labelled ANXIOUS transmitted at panic strength across a tenth of the
 * fear range. There is now ONE definition (`FearCore.isPanicClass`), band-first
 * with a DERIVED onset, so the two cannot disagree by a hand-written margin, and
 * this probe asserts that rather than documenting the contradiction.
 *
 * Scope: JavaScript runtime behaviour only. It says nothing about engine adapters,
 * host integration, or whether a host reports its threats usefully.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RuntimeSimulation } from '../../packages/runtime/src/RuntimeSimulation.js';
import { isPanicClass, panicOnsetRawFear } from '../../packages/core/src/FearCore.js';
import { ContagionGraph } from '../../packages/core/src/ContagionGraph.js';
import {
    assertMutationsCatch,
    readRepo,
    runModuleSource,
    unguardedVerdicts
} from './helpers/must_be_able_to_fail.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TICK_S = 0.1;

let assertions = 0;
function assert(condition, message) {
    assertions += 1;
    if (!condition) throw new Error(message);
}

function near(a, b, epsilon = 1e-9) {
    return Math.abs(a - b) < epsilon;
}

console.log('============================================================');
console.log('VERIFY CONTAGION TRANSMISSION (RuntimeSimulation end to end)');
console.log('============================================================');

// ---------------------------------------------------------------------------
// Section A: transmission through the runtime's own peer-gathering path.
//
// Diaz is threatened directly; Chen is 8 m away and is given an EMPTY threat
// list on every tick of the whole run. Any fear Chen develops arrived from Diaz.
// ---------------------------------------------------------------------------
const sim = new RuntimeSimulation({ seed: 42 });
sim.registerAgent('diaz', { fear: 0.0, neuroticism: 0.2, resilience: 0.85, leadership: 0.7 },
    { initial_position: { x: 0, y: 0, z: 0 } });
sim.registerAgent('chen', { fear: 0.0, neuroticism: 0.85, resilience: 0.2, leadership: 0.1 },
    { initial_position: { x: 8, y: 0, z: 0 } });

const diaz = sim.agents.get('diaz');
const chen = sim.agents.get('chen');

/**
 * Per-tick record of what the runtime actually did.
 *
 * `sourceBandUsed` is read BEFORE `tick()` deliberately. `RuntimeSimulation`
 * gathers its peer snapshot at the top of the tick, before any agent advances,
 * so the fear a neighbour receives on tick N is sourced from the state at the end
 * of tick N-1. Labelling rows with the post-tick band instead silently mixes a
 * one-tick lag into every conclusion about which band transmits what — which is
 * how an earlier draft of this probe "discovered" that ANXIOUS transmission was
 * unstable when it was in fact perfectly flat.
 */
const trace = [];
for (let tick = 1; tick <= 45; tick += 1) {
    sim.queueObservation('diaz', {
        x: 0, y: 0, z: 0,
        threats: [{ id: 'apex', type: 'PREDATOR', distance: 3.0, intensity: 1.0 }]
    });
    sim.queueObservation('chen', { x: 8, y: 0, z: 0, threats: [] });
    const sourceBandUsed = diaz.fearCore.state;
    const sourceFearUsed = diaz.currentFear;
    // The peer snapshot also reads last tick's vocalization hint, so the scream
    // bonus is subject to the same one-tick lag as the band.
    const sourceScreamingUsed = diaz.lastResult?.audio_hints?.vocalization_hint === 'SCREAM';
    sim.tick(TICK_S);
    trace.push({
        tick,
        sourceBandUsed,
        sourceFearUsed,
        sourceScreamingUsed,
        diazBand: diaz.fearCore.state,
        diazFear: diaz.currentFear,
        chenFear: chen.currentFear,
        chenBand: chen.fearCore.state,
        chenContagion: sim.lastContagion.get('chen')?.contagionFear ?? 0,
        chenSensory: chen.lastResult?.debug_trace?.perception_breakdown?.sensory_raw ?? 0
    });
}

// Chen was never given a stimulus, so any sensory term at all would invalidate
// the attribution below and must be impossible rather than merely absent here.
const sensoryLeaks = trace.filter(row => row.chenSensory !== 0);
assert(sensoryLeaks.length === 0,
    `Chen was given no threat list yet registered direct sensory input on ${sensoryLeaks.length} tick(s): `
    + JSON.stringify(sensoryLeaks.slice(0, 3)));
console.log('  * Chen received an empty threat list for all 45 ticks, and his direct sensory term');
console.log('    stayed exactly 0 throughout: PASS');

// A1. Fear actually crosses. Chen must reach PANIC off a consequence-free peer.
const chenPeak = trace.reduce((peak, row) => (row.chenFear > peak.chenFear ? row : peak), trace[0]);
assert(chenPeak.chenFear > 0.8,
    `Chen never escalated from a neighbour he never saw: peak fear ${chenPeak.chenFear.toFixed(3)}`);
assert(chenPeak.chenBand === 'PANIC',
    `Chen's fear peaked at ${chenPeak.chenFear.toFixed(3)} but his band was ${chenPeak.chenBand}, not PANIC`);
assert(chenPeak.chenContagion > 0,
    'Chen reached a panic-class band with zero contagion attributed — the escalation came from nowhere');
console.log(`  * a directly-threatened agent escalates an unthreatened neighbour to PANIC `
    + `(peak fear ${chenPeak.chenFear.toFixed(3)} at tick ${chenPeak.tick}, `
    + `contagion ${chenPeak.chenContagion.toFixed(4)}): PASS`);

// A2. Diaz must have been genuinely panicking, not merely escalated: the claim is
// "panic is contagious", and an ANXIOUS source is a different (weaker) thing.
const diazPanicked = trace.some(row => row.diazBand === 'PANIC');
assert(diazPanicked, 'The source never reached PANIC, so this run does not test panic transmission');
assert(chenPeak.tick > trace.find(row => row.diazBand === 'PANIC').tick,
    'Chen panicked before the source did, which the geometry does not allow');
console.log('  * the cascade followed the source\'s PANIC rather than preceding it: PASS');

// A2b. The one-tick lag is asserted rather than assumed, because it is the detail
// that makes a hand-read trace misleading. On the tick the source first becomes
// PANIC, the neighbour must still have received the PREVIOUS band's impact; the
// jump has to appear on the following tick.
const onset = trace.find(row => row.diazBand === 'PANIC');
const next = trace.find(row => row.tick === onset.tick + 1);
assert(onset.sourceBandUsed !== 'PANIC',
    'The source band changed before the tick it was used in, so the one-tick lag no longer exists');
assert(next && next.sourceBandUsed === 'PANIC',
    'The source did not present PANIC to the peer snapshot on the tick after onset');
assert(next.chenContagion > onset.chenContagion,
    `The neighbour received no increase on the tick after onset (${onset.chenContagion.toFixed(4)} -> ${next.chenContagion.toFixed(4)})`);
console.log(`  * transmission lags the source by exactly one tick (onset tick ${onset.tick} still carried the `
    + `previous band; the rise lands on tick ${next.tick}): PASS`);

// A3. Telemetry records the edge. An unattributed cascade is not diagnosable.
const edges = sim.contagion.activeEdges.filter(edge => edge.from === 'diaz' && edge.to === 'chen');
assert(edges.length > 0,
    `No contagion edge diaz -> chen was recorded. Active edges: ${JSON.stringify(sim.contagion.activeEdges)}`);
console.log('  * a diaz -> chen propagation edge is recorded in frame telemetry: PASS');
console.log('');

// ---------------------------------------------------------------------------
// Section B: band quantization, the property that made a cascade invisible.
//
// While the source is ANXIOUS the transmitted impact must be CONSTANT even though
// the source's own fear is climbing. This is asserted as an invariant rather than
// against a magic constant, so a deliberate model change is caught as a change
// rather than as a tolerance failure.
// ---------------------------------------------------------------------------
/**
 * The tier a source transmits at, decided by the SHIPPED predicate rather than by
 * a restatement of it. An earlier draft of this probe mirrored the rule inline
 * (`band === 'PANIC' || rawFear > 0.8`) and therefore could not have noticed the
 * rule changing; it now calls `isPanicClass` so the assertions below test the
 * same function the runtime calls.
 */
function tierOf(row) {
    if (isPanicClass({ fearBand: row.sourceBandUsed, rawFear: row.sourceFearUsed })) return 'panic';
    if (row.sourceBandUsed === 'ANXIOUS') return 'anxious';
    return 'raw';
}

// ---------------------------------------------------------------------------
// Section B0: the panic class has ONE definition, and it is the band's.
//
// This was the defect: `band === 'PANIC' || rawFear > 0.8` in the runtime (twice)
// and `band === 'PANIC' || fear >= 0.70` in the group contagion system — three
// literals, one concept. The band's own PANIC onset is `enter.PANIC / FEAR_SCALE`
// = `3.8 / 4.2` = 0.9048, so the 0.8 override declared a source panicking across
// a tenth of the fear range before its band agreed.
// ---------------------------------------------------------------------------
const panicOnset = panicOnsetRawFear();
assert(Math.abs(panicOnset - (3.8 / 4.2)) < 1e-12,
    `The normalized panic onset is ${panicOnset}, not enter.PANIC / FEAR_SCALE. It must be DERIVED from the band `
    + 'config, because that is the whole point of having one definition');
assert(panicOnset > 0.8,
    `The derived onset (${panicOnset}) is not above the old literal 0.8, so this probe no longer covers the window `
    + 'whose disagreement it exists to prevent');
assert(isPanicClass({ fearBand: 'PANIC', rawFear: 0.1 }) === true,
    'A PANIC band below the onset was not read as panic class — the band is no longer authoritative');
assert(isPanicClass({ fearBand: 'ANXIOUS', rawFear: 0.85 }) === false,
    'An ANXIOUS band at 0.85 raw fear was read as panic class, which is the pre-unification behaviour: a ' +
    'source transmitting at panic strength while its band disagrees');
assert(isPanicClass({ fearBand: 'ANXIOUS', rawFear: panicOnset + 0.01 }) === true,
    'An ANXIOUS band above the derived onset was not read as panic class');
// The extended bands reached FROM PANIC (FREEZE, HIDE, PRESENCE_BREAK, ...) are
// the reason a derived threshold is needed at all: their names do not say panic.
assert(isPanicClass({ fearBand: 'FREEZE', rawFear: 0.95 }) === true,
    'A FREEZE agent at high fear is not panic class, so a frozen panicker stops being contagious');
assert(isPanicClass({ fearBand: 'FREEZE', rawFear: 0.5 }) === false,
    'A FREEZE agent at low fear is panic class, so the extended bands are being over-reached');
assert(isPanicClass({ fearBand: 'ANXIOUS', rawFear: 0.5 }, { PANIC: 2.1 }) === true,
    'A custom enter.PANIC did not move the onset with it, so the two can still disagree by a margin');
console.log(`  * one definition, band-first, with the onset DERIVED from enter.PANIC (${panicOnset.toFixed(4)}): a PANIC `
    + 'band is panic class, ANXIOUS at 0.85 is not, FREEZE at 0.95 is, and a custom config moves both: PASS');

// Section B1: the plateau is proven on a CONTROLLED source range, not on a live
// trace. The panic tier's onset is 0.9048 and a driven source saturates at 1.0
// within a few ticks of reaching it, so a live run cannot show a non-trivial
// plateau there — the flattened trace would satisfy a flatness assertion for the
// uninteresting reason that the source stopped moving. Feeding `ContagionGraph`
// a range of peer states separates the two.
const probeGraph = new ContagionGraph({ contagionRadius: 300, leaderRadius: 0 });
const focal = {
    id: 'focal', x: 0, y: 0, z: 0,
    traits: { extraversion: 0.5, neuroticism: 0.5 }
};
const impactOf = (peer) => probeGraph.evaluateContagion(focal, [{
    id: 'source', x: 8, y: 0, z: 0, leadership: 0, isScreaming: false, ...peer
}]).contagionFear;

const panicTierImpacts = [0.92, 0.95, 0.99, 1.0]
    .map(rawFear => impactOf({ fearBand: 'ANXIOUS', isPanicking: true, rawFear }));
const anxiousTierImpacts = [0.25, 0.35, 0.39]
    .map(rawFear => impactOf({ fearBand: 'ANXIOUS', isPanicking: false, rawFear }));
const rawTierImpacts = [0.25, 0.3, 0.39]
    .map(rawFear => impactOf({ fearBand: 'ALERT', isPanicking: false, rawFear }));

assert(new Set(panicTierImpacts.map(v => v.toFixed(9))).size === 1,
    `The panic tier is not flat across 0.92..1.0 of source fear: ${panicTierImpacts.map(v => v.toFixed(6)).join(', ')}`);
assert(new Set(anxiousTierImpacts.map(v => v.toFixed(9))).size === 1,
    `The anxious tier is not flat across 0.25..0.39 of source fear: ${anxiousTierImpacts.map(v => v.toFixed(6)).join(', ')}`);
assert(new Set(rawTierImpacts.map(v => v.toFixed(9))).size > 1,
    'Sub-ANXIOUS transmission was flat, so quantization starts below the band rather than at it');
assert(panicTierImpacts[0] > anxiousTierImpacts[0],
    'The panic tier does not transmit harder than the anxious tier at a controlled distance');
console.log(`  * controlled: across 0.92..1.0 of source fear the panic tier holds a flat `
    + `${panicTierImpacts[0].toFixed(6)}, the anxious tier a flat ${anxiousTierImpacts[0].toFixed(6)}, and only `
    + `below ANXIOUS does the impact vary (${rawTierImpacts.map(v => v.toFixed(4)).join(', ')}): PASS`);

const withContagion = trace.filter(row => row.chenContagion > 0);
assert(withContagion.length >= 6, `Only ${withContagion.length} ticks carried a contagion term at all`);

// A source transmits at a FLAT impact per (tier, scream) cell. Screaming is a
// further multiplier on top of the tier, so the two cells of the panic tier differ
// by exactly the configured scream multiplier — which is why an "is panic
// contagious" question cannot be answered by the band alone even after the tier is
// resolved.
const keyOf = (row) => `${tierOf(row)}${row.sourceScreamingUsed ? '+scream' : ''}`;
const cells = new Map();
for (const row of withContagion) {
    const key = keyOf(row);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(row);
}
const flatCells = [...cells.entries()].filter(([key]) => key.startsWith('anxious') || key.startsWith('panic'));
assert(flatCells.length >= 2, `Only ${flatCells.length} quantized cell(s) were exercised, so the plateaus are untested`);
for (const [key, rows] of flatCells) {
    // Non-triviality is demanded only where the live trace can demonstrate it. The
    // anxious tier is entered at a source fear of ~0.4 and climbs, so real spread
    // exists there; the panic tier is entered at 0.9048 and the source saturates,
    // so its plateau is proven on the controlled range in Section B1 instead.
    const spread = Math.max(...rows.map(r => r.sourceFearUsed)) - Math.min(...rows.map(r => r.sourceFearUsed));
    if (key.startsWith('anxious')) {
        assert(spread > 0.05,
            `Cell ${key} covers only ${spread.toFixed(3)} of source fear, so a flat impact there proves nothing `
            + 'about quantization');
    }
    const distinct = [...new Set(rows.map(row => row.chenContagion.toFixed(9)))];
    assert(distinct.length === 1,
        `Cell ${key} transmitted ${distinct.length} different impacts (${distinct.join(', ')}) while the source `
        + `fear moved ${spread.toFixed(3)}. Transmission is no longer quantized for ${key}; the narrative demo `
        + 'and the ledger\'s contagion row must be revisited.');
}

const anxiousRows = withContagion.filter(row => tierOf(row) === 'anxious');
const panicRows = withContagion.filter(row => tierOf(row) === 'panic');
const anxiousPlateau = anxiousRows[0].chenContagion;
const panicQuiet = cells.get('panic')?.[0]?.chenContagion;
const panicScream = cells.get('panic+scream')?.[0]?.chenContagion;
assert(panicQuiet !== undefined, 'No non-screaming panic tick was captured, so the scream multiplier is unproven');
assert(panicScream !== undefined, 'No SCREAMING panic tick was captured, so the scream multiplier is unproven');
const anxiousSpread = Math.max(...anxiousRows.map(r => r.sourceFearUsed)) - Math.min(...anxiousRows.map(r => r.sourceFearUsed));

assert(panicQuiet > anxiousPlateau * 1.5,
    `The panic tier transmits ${panicQuiet.toFixed(4)} against ${anxiousPlateau.toFixed(4)} at the anxious tier — `
    + 'the step between tiers is no longer material');
const screamRatio = panicScream / panicQuiet;
assert(Math.abs(screamRatio - 1.8) < 0.01,
    `A screaming panic source transmits ${screamRatio.toFixed(4)}x a quiet one; the configured scream multiplier `
    + 'of 1.8 no longer governs transmission');
console.log(`  * a scream is heard for 1.8x: a quiet PANIC source transmits ${panicQuiet.toFixed(6)} and a screaming `
    + `one ${panicScream.toFixed(6)}: PASS`);
console.log(`  * source fear is quantized rather than continuous: the anxious tier holds a FLAT `
    + `${anxiousPlateau.toFixed(6)} across ${anxiousSpread.toFixed(3)} of climbing source fear: PASS`);

// Agreement across the whole live trace. Before the unification this counted
// ticks where an ANXIOUS label transmitted at panic strength; it must now be zero,
// and it must be zero by construction rather than by luck.
const mislabelled = panicRows.filter(row => row.sourceBandUsed === 'ANXIOUS');
assert(mislabelled.length === 0,
    `The band and the tier disagree on ${mislabelled.length} tick(s) `
    + `(e.g. ${JSON.stringify(mislabelled[0])}) — a source transmitting at panic strength while its band says `
    + 'something else, which is exactly the contradiction the shared predicate removed');
assert(panicRows.every(row => row.sourceFearUsed >= panicOnset - 1e-9),
    'A panic-tier tick transmitted with source fear below the derived onset, so the tier is not the predicate');
console.log(`  * no tick transmits at panic strength while its band disagrees, and every panic-tier tick is at or `
    + `above the derived onset (${panicOnset.toFixed(4)}): PASS`);

// And the runtime must not have quietly grown a literal back: a threshold typed
// into the peer snapshot is how this class of defect returns.
// The pattern matched is the DEFECT SHAPE, not any raw-fear comparison: several
// honest thresholds nearby are unrelated (a fear below 0.2 resolves an active
// trauma; a panicking leader above 0.75 is treated as broken). What must not
// return is the OR of a band test with a typed-in literal, which is how the panic
// class acquired a second definition in the first place.
const runtimeSource = readFileSync(join(repoRoot, 'packages', 'runtime', 'src', 'RuntimeSimulation.js'), 'utf8');
assert(!/fearCore\.state\s*===\s*'PANIC'\s*\|\|/.test(runtimeSource),
    'RuntimeSimulation ORs the PANIC band with a literal again, so the panic class has more than one definition');
assert((runtimeSource.match(/agent\.panicClass/g) || []).length >= 2,
    'RuntimeSimulation no longer asks the agent for its panic class in both places that need it');
const groupSource = readFileSync(join(repoRoot, 'packages', 'core', 'src', 'GroupContagionSystem.js'), 'utf8');
assert(!/memberData\.isPanicking\s*\|\|/.test(groupSource),
    'GroupContagionSystem re-derives its own panic classification, which disagreed with the runtime and the band');
assert(groupSource.includes('isPanicClass'),
    'GroupContagionSystem no longer uses the shared panic predicate');
console.log('  * the runtime and the group system both ask for the shared panic class and carry no threshold of');
console.log('    their own: PASS');

// Below ANXIOUS the source transmits its actual fear, so the tier must vary. This is
// the other half of the claim: quantization starts at ANXIOUS, not at zero.
const rawRows = cells.get('raw') || [];
assert(rawRows.length >= 3, `Only ${rawRows.length} sub-ANXIOUS tick(s) transmitted, so the continuous band is untested`);
const rawDistinct = new Set(rawRows.map(row => row.chenContagion.toFixed(9)));
assert(rawDistinct.size > 1,
    'Sub-ANXIOUS transmission was flat, so source fear is quantized below the ANXIOUS band too');
console.log(`  * below ANXIOUS transmission tracks actual fear instead (${rawDistinct.size} distinct impacts over `
    + `${rawRows.length} ticks), so quantization begins at the band rather than at zero: PASS`);

// Both sides of the 0.15 edge-recording threshold, so the explanation for a demo
// that drew no edge cannot rot into folklore.
assert(anxiousPlateau < 0.15,
    `The anxious plateau is ${anxiousPlateau.toFixed(4)}, at or above the 0.15 edge threshold, so this run no `
    + 'longer reproduces the condition under which the narrative demo silently drew no edge');
assert(panicQuiet >= 0.15,
    `The quiet panic impact is ${panicQuiet.toFixed(4)}, below the 0.15 edge threshold, so no edge could ever be recorded`);
console.log(`  * the anxious plateau (${anxiousPlateau.toFixed(4)}) sits just under the 0.15 telemetry-edge `
    + `threshold while a quiet panic source (${panicQuiet.toFixed(4)}) clears it: PASS`);
console.log('');

// ---------------------------------------------------------------------------
// Section C: the negative half. Transmission that cannot be switched off or
// confined is not a mechanism, it is a leak.
// ---------------------------------------------------------------------------
const distant = new RuntimeSimulation({ seed: 7, contagionConfig: { contagionRadius: 20 } });
distant.registerAgent('far_a', { neuroticism: 0.5, resilience: 0.5 }, { initial_position: { x: 0, y: 0, z: 0 } });
distant.registerAgent('far_b', { neuroticism: 0.5, resilience: 0.5 }, { initial_position: { x: 100, y: 0, z: 0 } });
for (let tick = 0; tick < 30; tick += 1) {
    distant.queueObservation('far_a', { x: 0, y: 0, z: 0, threats: [{ id: 't', type: 'PREDATOR', distance: 2, intensity: 1 }] });
    distant.queueObservation('far_b', { x: 100, y: 0, z: 0, threats: [] });
    distant.tick(TICK_S);
}
const farFear = distant.agents.get('far_b').currentFear;
assert(farFear === 0,
    `A neighbour 100 m away transmitted across a 20 m radius: fear ${farFear.toFixed(4)}`);
assert(distant.contagion.activeEdges.length === 0,
    `An out-of-radius pair produced ${distant.contagion.activeEdges.length} edge(s)`);
console.log('  * beyond the contagion radius nothing transmits and no edge is drawn: PASS');

const muted = new RuntimeSimulation({ seed: 7, enableContagion: false });
muted.registerAgent('mut_a', { neuroticism: 0.5, resilience: 0.5 }, { initial_position: { x: 0, y: 0, z: 0 } });
muted.registerAgent('mut_b', { neuroticism: 0.5, resilience: 0.5 }, { initial_position: { x: 8, y: 0, z: 0 } });
for (let tick = 0; tick < 30; tick += 1) {
    muted.queueObservation('mut_a', { x: 0, y: 0, z: 0, threats: [{ id: 't', type: 'PREDATOR', distance: 2, intensity: 1 }] });
    muted.queueObservation('mut_b', { x: 8, y: 0, z: 0, threats: [] });
    muted.tick(TICK_S);
}
assert(muted.agents.get('mut_a').currentFear > 0.5,
    'The opt-out run did not threaten its source, so it proves nothing about the opt-out');
assert(muted.agents.get('mut_b').currentFear === 0,
    `enableContagion:false still transmitted: neighbour fear ${muted.agents.get('mut_b').currentFear.toFixed(4)}`);
console.log('  * enableContagion:false transmits nothing even to an adjacent panicking peer: PASS');
console.log('');

// ---------------------------------------------------------------------------
// Section D: determinism. A cascade that varies run to run cannot be reasoned
// about, and this probe's own numbers above would be unreproducible.
// ---------------------------------------------------------------------------
function trajectory(seed) {
    const local = new RuntimeSimulation({ seed });
    local.registerAgent('a', { fear: 0.0, neuroticism: 0.2, resilience: 0.85, leadership: 0.7 },
        { initial_position: { x: 0, y: 0, z: 0 } });
    local.registerAgent('b', { fear: 0.0, neuroticism: 0.85, resilience: 0.2, leadership: 0.1 },
        { initial_position: { x: 8, y: 0, z: 0 } });
    const out = [];
    for (let tick = 1; tick <= 45; tick += 1) {
        local.queueObservation('a', { x: 0, y: 0, z: 0, threats: [{ id: 'apex', type: 'PREDATOR', distance: 3.0, intensity: 1.0 }] });
        local.queueObservation('b', { x: 8, y: 0, z: 0, threats: [] });
        local.tick(TICK_S);
        out.push(`${local.agents.get('a').currentFear.toFixed(9)}/${local.agents.get('b').currentFear.toFixed(9)}`);
    }
    return out;
}
const first = trajectory(42);
const second = trajectory(42);
assert(first.length === second.length, 'Two runs of the same seed produced different tick counts');
const drift = first.findIndex((value, index) => value !== second[index]);
assert(drift === -1, `Same seed diverged at tick ${drift + 1}: ${first[drift]} vs ${second[drift]}`);
const other = trajectory(43);
assert(other.some((value, index) => value !== first[index]),
    'A different seed produced an identical trajectory, so the seed is not reaching the cascade');
console.log(`  * the cascade is bit-identical across ${first.length} ticks for a fixed seed, and differs for `
    + 'another seed: PASS');
console.log('');

// ---------------------------------------------------------------------------
// Section E: the front door is gated.
//
// `examples/cli/neutral-horror-demo.mjs` is the one command a newcomer runs to see
// the product, and it was referenced by no probe, no workflow and no document. It
// narrates claims in prose, so it is only worth anything if those claims can go
// red. This section runs it, then runs MUTATED copies of it and requires the
// mutations to be caught — otherwise a green demo would be indistinguishable from
// a demo whose assertions had been quietly neutered.
// ---------------------------------------------------------------------------
const demoPath = 'examples/cli/neutral-horror-demo.mjs';

/**
 * Run the demo from its own directory, optionally with its source mutated.
 * The mutation harness itself is shared (helpers/must_be_able_to_fail.mjs) so
 * that "can this go red?" is one implementation rather than one per probe.
 */
const runDemo = (source) => runModuleSource(source, { cwd: join(repoRoot, 'examples', 'cli') });

const demoSource = readRepo(repoRoot, demoPath);
const demoRun = runDemo(demoSource);
const demoOutput = demoRun.output;
assert(demoRun.status === 0,
    `The narrative demo exited ${demoRun.status}. Output tail:\n${demoOutput.split(/\r?\n/).slice(-12).join('\n')}`);
const heldMatch = /CHECKS:\s*(\d+)\/(\d+)\s+held/.exec(demoOutput);
assert(heldMatch, 'The narrative demo did not report a CHECKS: n/n held line, so its claims are unreadable');
assert(heldMatch[1] === heldMatch[2],
    `The narrative demo exited 0 while only ${heldMatch[1]} of ${heldMatch[2]} claims held`);
assert(Number(heldMatch[2]) >= 10,
    `The narrative demo reports only ${heldMatch[2]} claims, which is too few for a canonical walkthrough`);
console.log(`  * the narrative demo runs end to end and reports ${heldMatch[1]}/${heldMatch[2]} claims held: PASS`);

// The static half first: a file that prints a verdict it cannot withhold is
// unguarded no matter what it does at runtime.
const guardScan = unguardedVerdicts(demoSource);
assert(guardScan.verdictLines.length > 0, 'The demo no longer states a verdict at all, so this gate is moot');
assert(!guardScan.unguarded,
    'The demo prints a success verdict with no mechanism to withhold it');
assert(/process\.exitCode\s*=\s*1/.test(demoSource),
    'The demo states a verdict but never sets a non-zero exit code');
console.log('  * the demo states a verdict AND carries a mechanism to withhold it: PASS');

const matrix = assertMutationsCatch({
    label: 'examples/cli/neutral-horror-demo.mjs',
    source: demoSource,
    run: runDemo,
    mutations: [
        {
            // M1: starve the cascade window — Chen can no longer reach PANIC.
            label: 'M1 starved cascade window',
            expect: 'red',
            mutate: (src) => src.replace(
                'for (let t = 19; t <= 40; t++) step({ threatDiaz: true });',
                'for (let t = 19; t <= 22; t++) step({ threatDiaz: true });'
            ),
            mustMention: /VERDICT: FAILED[\s\S]*Chen reaches PANIC/
        },
        {
            // M2: remove the stimulus entirely — nothing downstream can hold.
            label: 'M2 no stimulus at all',
            expect: 'red',
            mutate: (src) => src.replace(
                'for (let t = 4; t <= 18; t++) step({ threatDiaz: true });',
                'for (let t = 4; t <= 18; t++) step({ threatDiaz: false });'
            ),
            mustMention: /Diaz escalates to PANIC/
        },
        {
            // M3: the control. Neutralize the assertion helper and the SAME
            // starvation must go green, which is what proves the red above came
            // from the checks rather than from a crash that would have happened
            // anyway.
            label: 'M3 control: assertions disabled',
            expect: 'green',
            mutate: (src) => src.replace(
                '    checks.run += 1;\n    if (condition) {',
                '    checks.run += 1;\n    if (true) {'
            )
        }
    ]
});
assert(matrix.length === 3, `Expected three mutation outcomes, got ${matrix.length}`);
console.log(`  * the mutation matrix is caught: ${matrix.map(row => row.label).join(', ')} — and the control`);
console.log('    goes green once the assertions are disabled, so the red is the checks talking: PASS');
console.log('');

console.log('Scope: JavaScript RuntimeSimulation contagion behaviour and the narrative demo only.');
console.log('It does not certify the appraisers, the adapters, or any external host integration.');
console.log(`All ${assertions} contagion transmission assertions PASSED.`);
console.log('SUCCESS: contagion transmission is real, bounded, opt-outable, deterministic, and gated.');
