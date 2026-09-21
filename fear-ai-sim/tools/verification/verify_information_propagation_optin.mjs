#!/usr/bin/env node

/**
 * verify_information_propagation_optin.mjs — the §3 promotion, proven both ways.
 *
 * `InformationPropagationEngine` is the first module to move from
 * `RELEASE_SURFACE.md` §2 (out of scope) to §1 (in scope). That policy requires
 * four things, and this probe is conditions 2, 3 and 4 of them:
 *
 *   1. wired into RuntimeSimulation as an explicit OPT-IN service;
 *   2. a standalone deterministic verifier proves the opt-in path AND the
 *      unchanged default path;
 *   3. its ledger row is promoted with bounded evidence;
 *   4. the negative tripwire and the release surface are updated in the same
 *      change.
 *
 * The harder half is the second one, and it is harder in the direction people
 * expect less. It is easy to show that a flag turns a feature ON. What needs
 * proving is that NOTHING changed for every host that did not ask for it — so
 * this probe compares a default run against a run with the flag explicitly off
 * byte for byte, and then against a run with the service ENABLED, and requires
 * the simulation's own outputs and its persistence snapshot to be identical in
 * all three. A service that quietly perturbed the fear trajectory, consumed the
 * simulation's RNG, or changed the snapshot contract would be a change to the
 * default path wearing an opt-in flag's clothes.
 *
 * Scope: the JavaScript opt-in wiring and the module's behaviour through that
 * path. It does not certify the module's research claims, which remain
 * EXPERIMENTAL, and it says nothing about any engine adapter or host.
 */

import { RuntimeSimulation } from '../../packages/runtime/src/RuntimeSimulation.js';

let assertions = 0;
function assert(condition, message) {
    assertions += 1;
    if (!condition) throw new Error(message);
}

function assertThrows(fn, pattern, label) {
    assertions += 1;
    try {
        fn();
    } catch (error) {
        if (pattern.test(String(error && error.message))) return;
        throw new Error(`${label}: threw the wrong error — ${error && error.message}`);
    }
    throw new Error(`${label}: expected a refusal, but the call succeeded`);
}

console.log('============================================================');
console.log('VERIFY INFORMATION-PROPAGATION OPT-IN SERVICE');
console.log('============================================================');

// ---------------------------------------------------------------------------
// A shared scenario, so the three runs below differ only in their flag.
// ---------------------------------------------------------------------------
const AGENTS = [
    ['scout', { neuroticism: 0.6, resilience: 0.4, openness: 0.7 }, 0],
    ['medic', { neuroticism: 0.8, resilience: 0.3, openness: 0.5 }, 4],
    ['captain', { neuroticism: 0.2, resilience: 0.8, openness: 0.3 }, 12]
];

/**
 * One full scenario. Tick outputs and the persistence snapshot are both captured,
 * because "the default path is unchanged" has to hold on the advisory surface
 * (fear bands, intents, heartbeat) AND on the persisted contract.
 */
function runFull(options) {
    const sim = new RuntimeSimulation(options);
    for (const [id, traits, x] of AGENTS) {
        sim.registerAgent(id, traits, { initial_position: { x, y: 0, z: 0 } });
    }
    const outputs = [];
    for (let tick = 0; tick < 30; tick += 1) {
        sim.queueObservation('scout', {
            x: 0, y: 0, z: 0,
            threats: [{ id: 'apex', type: 'PREDATOR', distance: 3.0, intensity: 1.0 }]
        });
        sim.queueObservation('medic', { x: 4, y: 0, z: 0, threats: [] });
        sim.queueObservation('captain', { x: 12, y: 0, z: 0, threats: [] });
        outputs.push(JSON.stringify(sim.tick(0.1)));
    }
    return { sim, outputs, snapshot: JSON.stringify(sim.saveSnapshot()) };
}

// ---------------------------------------------------------------------------
// Section A: the default path is untouched, and the flag is genuinely opt-in.
// ---------------------------------------------------------------------------
const absent = runFull({ seed: 99 });
const explicitOff = runFull({ seed: 99, enableInformationPropagation: false });

assert(absent.sim.informationPropagation === null,
    'A default RuntimeSimulation constructed the optional service, so it is not opt-in');
assert(absent.sim.enableInformationPropagation === false,
    'The opt-in flag does not default to false');
assert(absent.outputs.join('\n') === explicitOff.outputs.join('\n'),
    'Omitting the flag and passing it as false produced different simulation outputs');
assert(absent.snapshot === explicitOff.snapshot,
    'Omitting the flag and passing it as false produced different persistence snapshots');
console.log('  * flag absent and flag explicitly false are byte-identical over 30 ticks, in both the');
console.log('    advisory outputs and the persistence snapshot: PASS');

assert(!absent.snapshot.includes('informationPropagation'),
    'The persistence snapshot grew an information-propagation field, so the snapshot contract '
    + 'changed for every host that never enabled the service');
console.log('  * the snapshot contract is unchanged: no information-propagation field is serialized: PASS');
console.log('');

// ---------------------------------------------------------------------------
// Section B: enabling it does not perturb the simulation.
//
// This is the strongest available statement of "advisory only", and it is
// checked against the runtime's own outputs rather than against a promise in a
// comment: an enabled run must produce the same fear trajectories, the same
// advisory intents, the same RNG stream and the same snapshot as a disabled one.
// ---------------------------------------------------------------------------
const enabled = runFull({ seed: 99, enableInformationPropagation: true });

assert(enabled.sim.informationPropagation !== null,
    'enableInformationPropagation:true did not construct the service');
assert(enabled.outputs.join('\n') === absent.outputs.join('\n'),
    'Enabling the optional service changed the simulation outputs — it is not advisory');
assert(enabled.snapshot === absent.snapshot,
    'Enabling the optional service changed the persistence snapshot, so it consumed the '
    + 'simulation RNG or mutated simulation state');
assert(enabled.sim.rng.getState().toString() === absent.sim.rng.getState().toString(),
    'The optional service drew from the simulation RNG');
console.log('  * enabling the service changes no simulation output, no snapshot field and no RNG draw: PASS');
console.log('');

// ---------------------------------------------------------------------------
// Section C: the opt-in path actually works, end to end through the runtime.
// ---------------------------------------------------------------------------
const live = new RuntimeSimulation({ seed: 99, enableInformationPropagation: true });
for (const [id, traits, x] of AGENTS) {
    live.registerAgent(id, traits, { initial_position: { x, y: 0, z: 0 } });
}
const statsBefore = live.informationPropagation.networkStats();
assert(statsBefore.agentsTracked === AGENTS.length,
    `Registering ${AGENTS.length} agents left the service tracking ${statsBefore.agentsTracked}`);
console.log(`  * registering an agent joins the listening network too (${statsBefore.agentsTracked} tracked): PASS`);

live.informationPropagation.addListenEdge('medic', 'scout');
live.informationPropagation.addListenEdge('captain', 'medic');
const rumorId = live.injectRumor('MONSTER_SIGHTING', 'something is in the treeline', 'scout',
    { confidence: 0.8 });
assert(typeof rumorId === 'string' && rumorId.length > 0, 'injectRumor did not return a rumor id');

live.tick(0.1);
const medicHeld = live.propagatedInformation('medic');
assert(medicHeld.length === 1, `The listener holds ${medicHeld.length} rumor(s) after one tick, expected 1`);
const firstHop = medicHeld[0];
assert(firstHop.rumorId === rumorId, 'The listener holds a different rumor than the one injected');
assert(firstHop.hops === 1, `One hop should be 1, got ${firstHop.hops}`);
// 0.8 * hopDecay(0.85) * (0.5 + sourceCredibility(0.5) * 0.5) * susceptibility(default 1.0)
const expectedConfidence = 0.8 * 0.85 * 0.75 * 1.0;
assert(Math.abs(firstHop.confidence - expectedConfidence) < 1e-6,
    `Received confidence ${firstHop.confidence} does not match the documented hop formula `
    + `(${expectedConfidence})`);
console.log(`  * a rumor injected at 'scout' reaches 'medic' in exactly one tick at the documented `
    + `confidence (${firstHop.confidence}) with hops=1: PASS`);

live.tick(0.1);
const captainHeld = live.propagatedInformation('captain');
assert(captainHeld.length === 1,
    `The two-hop listener holds ${captainHeld.length} rumor(s), expected the rumor relayed through 'medic'`);
assert(captainHeld[0].hops === 2, `Relayed rumor should carry hops=2, got ${captainHeld[0].hops}`);
assert(captainHeld[0].confidence < firstHop.confidence,
    'Confidence did not decay across the second hop');
console.log(`  * it relays onward to 'captain' at a lower confidence (${captainHeld[0].confidence} at hops=2): PASS`);

const stats = live.informationPropagation.networkStats();
assert(stats.rumorsInjected === 1 && stats.rumorsActive === 1,
    `Network stats report ${stats.rumorsInjected} injected / ${stats.rumorsActive} active, expected 1/1`);
assert(stats.totalReach === 3, `Expected the rumor to have reached 3 agents, got ${stats.totalReach}`);

const immutability = live.informationPropagation.auditImmutability();
assert(immutability.isClean === true && immutability.hostPhysicsMutations === 0
    && immutability.hostTransformMutations === 0,
    'The service reports host mutation, which the opt-in contract forbids');
console.log('  * the service reports zero host physics and transform mutations: PASS');
console.log('');

// ---------------------------------------------------------------------------
// Section D: refusals. A service that cannot refuse is a service that silently
// accepts work it will never do.
// ---------------------------------------------------------------------------
const disabled = new RuntimeSimulation({ seed: 99 });
disabled.registerAgent('scout', { neuroticism: 0.6 }, { initial_position: { x: 0, y: 0, z: 0 } });
assertThrows(() => disabled.injectRumor('MONSTER_SIGHTING', 'x', 'scout'),
    /INFORMATION_PROPAGATION_DISABLED/, 'injectRumor on a disabled runtime');
assertThrows(() => disabled.correctRumor('rumor_1', true),
    /INFORMATION_PROPAGATION_DISABLED/, 'correctRumor on a disabled runtime');
assert(disabled.propagatedInformation('scout').length === 0,
    'A disabled runtime reported held information');
console.log('  * injecting or correcting a rumor on a runtime that never enabled the service refuses,');
console.log('    naming INFORMATION_PROPAGATION_DISABLED rather than silently no-oping: PASS');

assertThrows(() => live.injectRumor('NOT_A_TOPIC', 'x', 'scout'),
    /UNKNOWN_RUMOR_TOPIC/, 'injecting an unknown topic');
assertThrows(() => live.injectRumor('MONSTER_SIGHTING', 'x', 'ghost'),
    /UNKNOWN_AGENT/, 'injecting from an unregistered agent');
assertThrows(() => live.correctRumor('rumor_9999', true),
    /UNKNOWN_RUMOR/, 'correcting an unknown rumor');
console.log('  * an unknown topic, an unregistered origin and an unknown rumor id are each refused: PASS');
console.log('');

// ---------------------------------------------------------------------------
// Section E: the service tracks the roster it describes.
//
// The engine's standalone `injectRumor` registers an unknown origin as a
// convenience. Through the runtime that would resurrect a deliberately retired
// agent, so the runtime refuses and the retirement is asserted to stick.
// ---------------------------------------------------------------------------
live.unregisterAgent('captain');
const afterRetirement = live.informationPropagation.networkStats();
assert(afterRetirement.agentsTracked === AGENTS.length - 1,
    `Retiring an agent left ${afterRetirement.agentsTracked} tracked, expected ${AGENTS.length - 1}`);
assert(!live.informationPropagation.listenEdges.has('captain'),
    'A retired agent still has a listening edge, so it is still being heard');
assert(afterRetirement.totalReach === 2,
    `Reported reach is ${afterRetirement.totalReach} after a retirement, so the departed is still counted`);
assert(live.propagatedInformation('captain').length === 0,
    'A retired agent still holds information');
assertThrows(() => live.injectRumor('MONSTER_SIGHTING', 'x', 'captain'),
    /UNKNOWN_AGENT/, 'injecting from a retired agent');
console.log('  * retiring an agent drops its edges, its beliefs and its contribution to reported');
console.log('    reach, and it can no longer originate a rumor: PASS');

// The source is retired mid-stream: a listener must stop hearing it, not merely
// have it absent from the roster.
const relay = new RuntimeSimulation({ seed: 5, enableInformationPropagation: true });
relay.registerAgent('voice', { neuroticism: 0.5 }, { initial_position: { x: 0, y: 0, z: 0 } });
relay.registerAgent('ear', { neuroticism: 0.5 }, { initial_position: { x: 2, y: 0, z: 0 } });
relay.informationPropagation.addListenEdge('ear', 'voice');
relay.injectRumor('ROAD_AMBUSH', 'the road is watched', 'voice');
relay.tick(0.1);
assert(relay.propagatedInformation('ear').length === 1, 'The listener did not hear the live source');
relay.unregisterAgent('voice');
assert(!relay.informationPropagation.listenEdges.get('ear').has('voice'),
    "The retired source remains in the listener's source set, so the dead keep talking");
relay.injectRumor('ROAD_AMBUSH', 'a second report', 'ear');
relay.tick(0.1);
assert(relay.propagatedInformation('ear').length === 2, 'The surviving listener stopped receiving entirely');
console.log('  * a retired source is removed from every listener\'s source set, so the dead stop talking: PASS');
console.log('');

// ---------------------------------------------------------------------------
// Section F: host-validated truth. This is the one path by which the module
// changes its own future behaviour, so it is asserted rather than assumed.
// ---------------------------------------------------------------------------
const truth = new RuntimeSimulation({ seed: 11, enableInformationPropagation: true });
truth.registerAgent('liar', { neuroticism: 0.5 }, { initial_position: { x: 0, y: 0, z: 0 } });
const liarCredibilityBefore = truth.informationPropagation.credibilityOf('liar');
const badRumor = truth.injectRumor('LEADER_DEATH', 'the captain is dead', 'liar');
const status = truth.correctRumor(badRumor, false);
assert(status === 'CORRECTED', `An untruthful rumor was marked ${status}`);
const liarCredibilityAfter = truth.informationPropagation.credibilityOf('liar');
assert(liarCredibilityAfter < liarCredibilityBefore,
    'Correcting a false rumor did not penalize its origin, so a liar keeps full weight');
console.log(`  * a rumor the host corrects is marked CORRECTED and its origin's credibility falls `
    + `${liarCredibilityBefore} -> ${liarCredibilityAfter}: PASS`);

const confirmed = truth.injectRumor('SAFE_SANCTUARY', 'the chapel holds', 'liar');
assert(truth.correctRumor(confirmed, true) === 'CONFIRMED', 'A truthful rumor was not marked CONFIRMED');
console.log('  * a rumor the host confirms is marked CONFIRMED: PASS');
console.log('');

// ---------------------------------------------------------------------------
// Section G: determinism and isolation. The service is seeded from the
// simulation seed, so a recorded run is reproducible from `seed` alone, and two
// runtimes must not share a channel.
// ---------------------------------------------------------------------------
const digest = (sim) => JSON.stringify({
    stats: sim.informationPropagation.networkStats(),
    rumors: [...sim.informationPropagation.rumors.values()]
        .map(r => [r.id, r.topic, r.hops, r.mutations, r.status, r.recipients.size])
        .sort()
});

function rumorRun(seed) {
    const sim = new RuntimeSimulation({ seed, enableInformationPropagation: true });
    for (const [id, traits, x] of AGENTS) {
        sim.registerAgent(id, traits, { initial_position: { x, y: 0, z: 0 } });
    }
    sim.informationPropagation.addListenEdge('medic', 'scout');
    sim.informationPropagation.addListenEdge('captain', 'medic');
    sim.injectRumor('RESOURCE_SCARCITY', 'the wells are dry', 'scout', { confidence: 0.9 });
    for (let tick = 0; tick < 12; tick += 1) sim.tick(0.1);
    return { digest: digest(sim), engineSeed: sim.informationPropagation.seed };
}

const runA = rumorRun(2024);
const runB = rumorRun(2024);
const runC = rumorRun(2025);
assert(runA.digest === runB.digest,
    'Two runs with the same seed produced different rumor timelines, so the service is '
    + 'not deterministic and no reported cascade can be reproduced');
assert(runA.engineSeed !== runC.engineSeed,
    'Two different simulation seeds produced the same engine seed, so the service is not '
    + 'seeded from the simulation');
console.log(`  * the rumor timeline is identical across 12 ticks for a fixed seed (engine seed `
    + `${runA.engineSeed}), and the engine seed is derived from the simulation seed: PASS`);

const left = new RuntimeSimulation({ seed: 1, enableInformationPropagation: true });
const right = new RuntimeSimulation({ seed: 1, enableInformationPropagation: true });
left.registerAgent('only_left', { neuroticism: 0.5 }, { initial_position: { x: 0, y: 0, z: 0 } });
left.injectRumor('SAFE_SANCTUARY', 'the chapel holds', 'only_left');
left.tick(0.1);
right.tick(0.1);
assert(right.informationPropagation.networkStats().rumorsInjected === 0
    && right.informationPropagation.rumors.size === 0,
    'Two runtimes share information state, so one host can inject into another');
console.log('  * two runtimes share no information state: PASS');
console.log('');

console.log('Scope: the JavaScript opt-in wiring and the service\'s behaviour through that path.');
console.log('The module\'s research claims remain EXPERIMENTAL, and no engine adapter is covered.');
console.log(`All ${assertions} information-propagation opt-in assertions PASSED.`);
console.log('SUCCESS: the service is opt-in, advisory, roster-tracking, refusing and deterministic.');
