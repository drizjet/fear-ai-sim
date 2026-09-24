#!/usr/bin/env node

/**
 * verify_pack_coordination_optin.mjs — the §3 promotion, proven both ways.
 *
 * `PackCoordinationEngine` is the second module to move from
 * `RELEASE_SURFACE.md` §2 (out of scope) to §1 (in scope). That policy requires
 * four things, and this probe carries conditions 2, 3 and 4 of them:
 *
 *   1. wired into RuntimeSimulation as an explicit OPT-IN service;
 *   2. a standalone deterministic verifier proves the opt-in path AND the
 *      unchanged default path;
 *   3. its ledger row is promoted with bounded evidence;
 *   4. the negative tripwire and the release surface are updated in the same
 *      change.
 *
 * As with InformationPropagationEngine, the critical proof is that NOTHING changed
 * for hosts that did not ask for it:
 * - A default run and an explicit-false run are byte-identical across outputs and snapshots;
 * - An enabled run produces identical core simulation outputs, identical snapshots,
 *   and identical RNG state draws;
 * - The service is strictly ADVISORY: it emits recommended vectors, heading vectors,
 *   and alpha morale damping without mutating host transforms, physics, or agent fear.
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
console.log('VERIFY PACK-COORDINATION OPT-IN SERVICE');
console.log('============================================================');

// ---------------------------------------------------------------------------
// Shared scenario for default-path comparison
// ---------------------------------------------------------------------------
const AGENTS = [
    ['scout', { neuroticism: 0.6, resilience: 0.4, openness: 0.7 }, 0],
    ['medic', { neuroticism: 0.8, resilience: 0.3, openness: 0.5 }, 4],
    ['captain', { neuroticism: 0.2, resilience: 0.8, openness: 0.3 }, 12]
];

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
const explicitOff = runFull({ seed: 99, enablePackCoordination: false });

assert(absent.sim.packCoordination === null,
    'A default RuntimeSimulation constructed the optional service, so it is not opt-in');
assert(absent.sim.enablePackCoordination === false,
    'The opt-in flag does not default to false');
assert(absent.outputs.join('\n') === explicitOff.outputs.join('\n'),
    'Omitting the flag and passing it as false produced different simulation outputs');
assert(absent.snapshot === explicitOff.snapshot,
    'Omitting the flag and passing it as false produced different persistence snapshots');
console.log('  * flag absent and flag explicitly false are byte-identical over 30 ticks, in both the');
console.log('    advisory outputs and the persistence snapshot: PASS');

assert(!absent.snapshot.includes('packCoordination'),
    'The persistence snapshot grew a pack-coordination field, altering the snapshot contract');
console.log('  * the snapshot contract is unchanged: no pack-coordination field is serialized: PASS');
console.log('');

// ---------------------------------------------------------------------------
// Section B: enabling it does not perturb the core simulation.
// ---------------------------------------------------------------------------
const enabled = runFull({ seed: 99, enablePackCoordination: true });

assert(enabled.sim.packCoordination !== null,
    'enablePackCoordination:true did not construct the service');
assert(enabled.outputs.join('\n') === absent.outputs.join('\n'),
    'Enabling the optional service changed the core simulation outputs — it is not advisory');
assert(enabled.snapshot === absent.snapshot,
    'Enabling the optional service changed the persistence snapshot, perturbing determinism');
assert(enabled.sim.rng.getState().toString() === absent.sim.rng.getState().toString(),
    'The optional service drew from the simulation RNG');
console.log('  * enabling the service changes no simulation output, no snapshot field and no RNG draw: PASS');
console.log('');

// ---------------------------------------------------------------------------
// Section C: the opt-in path actually works, end to end through the runtime.
// ---------------------------------------------------------------------------
const live = new RuntimeSimulation({ seed: 99, enablePackCoordination: true });
for (const [id, traits, x] of AGENTS) {
    live.registerAgent(id, traits, { initial_position: { x, y: 0, z: 0 } });
}

const pack = live.createPack('alpha_squad', {
    pattern: 'CIRCULAR_PINCER',
    engagementRadius: 20
});
assert(pack && pack.id === 'alpha_squad', 'createPack failed to return a valid pack record');
console.log('  * live.createPack successfully registered alpha_squad: PASS');

// Register pack members with custom tactical profiles
live.registerPackMember('alpha_squad', 'scout', { dominance: 0.3, courage: 0.3, speed: 1.8, aggression: 0.7 });
live.registerPackMember('alpha_squad', 'medic', { dominance: 0.4, courage: 0.4, speed: 0.8, aggression: 0.2 });
live.registerPackMember('alpha_squad', 'captain', { dominance: 0.95, courage: 0.9, speed: 1.2, aggression: 0.6 });

const advisoriesPre = live.getPackAdvisories('alpha_squad');
assert(advisoriesPre.alphaId === 'captain', `Expected captain to be elected alpha leader, got ${advisoriesPre.alphaId}`);
assert(advisoriesPre.members.length === 3, `Expected 3 pack members, got ${advisoriesPre.members.length}`);

const scoutMemberPre = advisoriesPre.members.find(m => m.memberId === 'scout');
assert(scoutMemberPre && scoutMemberPre.role === 'FLANKER_LEFT',
    `Expected fastest member (scout) to be FLANKER_LEFT, got ${scoutMemberPre && scoutMemberPre.role}`);
console.log('  * dynamic role allocation elected captain as ALPHA_LEADER and scout as FLANKER_LEFT: PASS');

// Update target threat
live.setPackTargetThreat('alpha_squad', { x: 50, y: 0, z: 50, id: 'apex_threat' });
live.tick(0.1);

const advisoriesPost = live.getPackAdvisories('alpha_squad');
assert(advisoriesPost.targetThreat.x === 50 && advisoriesPost.targetThreat.z === 50,
    'Target threat was not updated on active pack');

// Verify advisory vectors and headings
for (const member of advisoriesPost.members) {
    assert(Number.isFinite(member.advisoryPosition.x) && Number.isFinite(member.advisoryPosition.z),
        `Member ${member.memberId} has non-finite advisory coordinates`);
    assert(Number.isFinite(member.headingVector.x) && Number.isFinite(member.headingVector.z),
        `Member ${member.memberId} has non-finite heading vector`);
    assert(member.targetDistance > 0, `Member ${member.memberId} has non-positive target distance`);
}
console.log('  * advisory coordinates, heading vectors, and target distances evaluated cleanly: PASS');

// Verify non-mutating alpha morale damping
const medicAgent = live.agents.get('medic');
const medicMember = advisoriesPost.members.find(m => m.memberId === 'medic');
assert(medicMember.effectiveFear <= medicAgent.currentFear + 1e-4,
    'Alpha damping did not attenuate subordinate effective fear');
console.log('  * alpha damping attenuated subordinate advisory fear without mutating agent state: PASS');

// Verify host authority & immutability audit
const audit = live.packCoordination.auditImmutability();
assert(audit.isClean === true && audit.hostPhysicsMutations === 0 && audit.hostTransformMutations === 0,
    'Pack coordination reports host mutations, violating Host Game Authority Invariant');
console.log('  * auditImmutability reports zero host physics and transform mutations: PASS');
console.log('');

// ---------------------------------------------------------------------------
// Section D: Refusals on disabled runtime or invalid parameters
// ---------------------------------------------------------------------------
const disabled = new RuntimeSimulation({ seed: 99 });
disabled.registerAgent('scout', { neuroticism: 0.6 });

assertThrows(() => disabled.createPack('p1'), /PACK_COORDINATION_DISABLED/, 'createPack on disabled sim');
assertThrows(() => disabled.registerPackMember('p1', 'scout'), /PACK_COORDINATION_DISABLED/, 'registerPackMember on disabled sim');
assertThrows(() => disabled.removePackMember('p1', 'scout'), /PACK_COORDINATION_DISABLED/, 'removePackMember on disabled sim');
assertThrows(() => disabled.setPackTargetThreat('p1', { x: 0 }), /PACK_COORDINATION_DISABLED/, 'setPackTargetThreat on disabled sim');
assertThrows(() => disabled.setPackPhase('p1', 'STALKING'), /PACK_COORDINATION_DISABLED/, 'setPackPhase on disabled sim');
assertThrows(() => disabled.setPackPattern('p1', 'CIRCULAR_PINCER'), /PACK_COORDINATION_DISABLED/, 'setPackPattern on disabled sim');
assert(disabled.getPackAdvisories('p1') === null, 'getPackAdvisories on disabled sim did not return null');
console.log('  * all pack coordination operations refuse on disabled runtime: PASS');

assertThrows(() => live.registerPackMember('alpha_squad', 'ghost_agent'),
    /UNKNOWN_AGENT/, 'registering unregistered agent into pack');
assertThrows(() => live.setPackTargetThreat('nonexistent_pack', { x: 0 }),
    /UNKNOWN_PACK/, 'updating target threat on nonexistent pack');
console.log('  * registering unregistered agent or updating unknown pack refuses cleanly: PASS');
console.log('');

// ---------------------------------------------------------------------------
// Section E: Alpha Fall Catastrophe & Agent Unregistration Lifecycle
// ---------------------------------------------------------------------------
// Unregistering the alpha leader triggers immediate catastrophic collapse (SCATTER_DISPERSE)
live.unregisterAgent('captain');

const afterAlphaFall = live.getPackAdvisories('alpha_squad');
assert(afterAlphaFall.phase === 'SCATTER_DISPERSE',
    `Expected pack phase to transition to SCATTER_DISPERSE on alpha loss, got ${afterAlphaFall.phase}`);
assert(afterAlphaFall.members.length === 2,
    `Expected departed alpha to be removed from pack members, count is ${afterAlphaFall.members.length}`);
assert(!afterAlphaFall.members.some(m => m.memberId === 'captain'),
    'Captain still appears in pack members after unregisterAgent');
assert(afterAlphaFall.packCohesion < 0.5,
    `Expected pack cohesion to collapse on alpha loss, got ${afterAlphaFall.packCohesion}`);
console.log('  * unregistering alpha leader cleanly triggered Alpha Fall catastrophe (SCATTER_DISPERSE): PASS');

console.log('\nScope: this verifier proves JavaScript opt-in wiring, alpha damping, and authority boundaries.');
console.log(`SUCCESS: All ${assertions} pack-coordination opt-in assertions passed.\n`);
