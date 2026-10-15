#!/usr/bin/env node

/**
 * verify_moral_dissonance_optin.mjs — the §3 promotion for Moral Dissonance Engine.
 *
 * `MoralDissonanceEngine` moves from `RELEASE_SURFACE.md` §2 (out of scope) to §1 (in scope)
 * as an opt-in moral cognition service. That policy requires four things, and this probe carries
 * conditions 2, 3 and 4 of them:
 *
 *   1. wired into RuntimeSimulation as an explicit OPT-IN service;
 *   2. a standalone deterministic verifier proves the opt-in path AND the
 *      unchanged default path;
 *   3. its ledger row is promoted with bounded evidence;
 *   4. the negative tripwire and the release surface are updated in the same change.
 *
 * Invariants proven here:
 * - A default run and an explicit-false run are byte-identical across outputs and snapshots;
 * - An enabled run produces identical core simulation outputs, identical snapshots,
 *   and identical RNG state draws on default ticks without moral intervention;
 * - The service is strictly ADVISORY: it models moral cognitive dissonance, guilt accumulation,
 *   personality drift, and insubordination defiance without mutating host transforms, physics,
 *   or canonical world truth.
 */

import { RuntimeSimulation } from '../../packages/runtime/src/RuntimeSimulation.js';
import {
    MORAL_FOUNDATIONS,
    DEFAULT_MORAL_PROFILES,
    TRANSGRESSION_TYPES,
    ATONEMENT_TYPES
} from '../../packages/core/src/MoralDissonanceEngine.js';

let assertions = 0;
function assert(condition, message) {
    assertions += 1;
    if (!condition) throw new Error(message);
}

function approx(a, b, eps = 1e-4) {
    return Math.abs(a - b) <= eps;
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
console.log('VERIFY MORAL DISSONANCE OPT-IN SERVICE');
console.log('============================================================');

// ---------------------------------------------------------------------------
// Shared scenario for default-path comparison
// ---------------------------------------------------------------------------
const AGENTS = [
    ['paladin', { neuroticism: 0.2, resilience: 0.8, agreeableness: 0.8 }, 0],
    ['mercenary', { neuroticism: 0.5, resilience: 0.5, agreeableness: 0.3 }, 5],
    ['zealot', { neuroticism: 0.8, resilience: 0.3, agreeableness: 0.2 }, 10]
];

function runFull(options) {
    const sim = new RuntimeSimulation(options);
    for (const [id, traits, x] of AGENTS) {
        sim.registerAgent(id, traits, { initial_position: { x, y: 0, z: 0 } });
    }
    const outputs = [];
    for (let tick = 0; tick < 20; tick += 1) {
        sim.queueObservation('paladin', {
            x: 0, y: 0, z: 0,
            threats: [{ id: 'goblin', type: 'PREDATOR', distance: 6.0, intensity: 0.6 }]
        });
        sim.queueObservation('mercenary', { x: 5, y: 0, z: 0, threats: [] });
        sim.queueObservation('zealot', { x: 10, y: 0, z: 0, threats: [] });
        outputs.push(JSON.stringify(sim.tick(0.1)));
    }
    return { sim, outputs, snapshot: JSON.stringify(sim.saveSnapshot()) };
}

// ---------------------------------------------------------------------------
// Section A: Default path is untouched and the flag is genuinely opt-in.
// ---------------------------------------------------------------------------
console.log('--- Section A: Default path immutability & Opt-in boundary ---');
const absent = runFull({ seed: 303 });
const explicitOff = runFull({ seed: 303, enableMoralDissonance: false });

assert(absent.sim.moralDissonance === null,
    'A default RuntimeSimulation constructed the moral dissonance service, so it is not opt-in');
assert(absent.sim.enableMoralDissonance === false,
    'The moral dissonance opt-in flag does not default to false');

assert(absent.outputs.join('\n') === explicitOff.outputs.join('\n'),
    'Omitting the flag and passing it as false produced different simulation outputs');
assert(absent.snapshot === explicitOff.snapshot,
    'Omitting the flag and passing it as false produced different persistence snapshots');

const optIn = runFull({ seed: 303, enableMoralDissonance: true });
assert(optIn.sim.moralDissonance !== null,
    'RuntimeSimulation with enableMoralDissonance: true did not construct MoralDissonanceEngine');
assert(optIn.sim.moralDissonance.agents.size === 3,
    'RuntimeSimulation with enableMoralDissonance: true did not register profiles for agents');
assert(optIn.outputs.join('\n') === absent.outputs.join('\n'),
    'Enabling moral dissonance altered core outputs on ticks that did not introduce moral transgressions');
assert(optIn.snapshot === absent.snapshot,
    'Enabling moral dissonance altered snapshots on default runs');

// PRNG independence check: simulation RNG states must be bit-identical
const rngDisabled = runFull({ seed: 777, enableMoralDissonance: false });
const rngEnabled = runFull({ seed: 777, enableMoralDissonance: true });
assert(JSON.stringify(rngDisabled.sim.rng.getState()) === JSON.stringify(rngEnabled.sim.rng.getState()),
    'MoralDissonanceEngine consumed draws from sim.rng, violating PRNG isolation');
console.log('  * Section A (default path immutability and PRNG isolation): PASS');

// ---------------------------------------------------------------------------
// Section B: Refusal gates when service is disabled and unknown agents.
// ---------------------------------------------------------------------------
console.log('--- Section B: Refusal gates when service is disabled ---');
const disabledSim = new RuntimeSimulation({ seed: 404, enableMoralDissonance: false });
disabledSim.registerAgent('hero', { neuroticism: 0.3 });

assertThrows(
    () => disabledSim.registerAgentMoralProfile('hero', DEFAULT_MORAL_PROFILES.HONORABLE_GUARDIAN),
    /MORAL_DISSONANCE_DISABLED/,
    'registerAgentMoralProfile on disabled sim'
);
assertThrows(
    () => disabledSim.computeMoralDissonance('hero', TRANSGRESSION_TYPES.ABANDON_COMRADE),
    /MORAL_DISSONANCE_DISABLED/,
    'computeMoralDissonance on disabled sim'
);
assertThrows(
    () => disabledSim.recordMoralTransgression('hero', TRANSGRESSION_TYPES.ABANDON_COMRADE),
    /MORAL_DISSONANCE_DISABLED/,
    'recordMoralTransgression on disabled sim'
);
assertThrows(
    () => disabledSim.recordMoralAtonement('hero', ATONEMENT_TYPES.AID_VICTIMS),
    /MORAL_DISSONANCE_DISABLED/,
    'recordMoralAtonement on disabled sim'
);
assertThrows(
    () => disabledSim.evaluateMoralOrderCompliance('hero', TRANSGRESSION_TYPES.ABANDON_COMRADE),
    /MORAL_DISSONANCE_DISABLED/,
    'evaluateMoralOrderCompliance on disabled sim'
);
assertThrows(
    () => disabledSim.getAgentMoralState('hero'),
    /MORAL_DISSONANCE_DISABLED/,
    'getAgentMoralState on disabled sim'
);

// Unknown agent checks on enabled simulation
const enabledSim = new RuntimeSimulation({ seed: 505, enableMoralDissonance: true });
assertThrows(
    () => enabledSim.computeMoralDissonance('ghost_agent', TRANSGRESSION_TYPES.ABANDON_COMRADE),
    /UNKNOWN_AGENT/,
    'computeMoralDissonance on unknown agent'
);
assertThrows(
    () => enabledSim.recordMoralTransgression('ghost_agent', TRANSGRESSION_TYPES.ABANDON_COMRADE),
    /UNKNOWN_AGENT/,
    'recordMoralTransgression on unknown agent'
);
console.log('  * Section B (refusal gates for disabled service and unknown agents): PASS');

// ---------------------------------------------------------------------------
// Section C: Haidt 5-foundation profiles & Festinger cognitive dissonance.
// ---------------------------------------------------------------------------
console.log('--- Section C: Haidt 5-foundation profiles & Festinger dissonance ---');
const moralSim = new RuntimeSimulation({ seed: 606, enableMoralDissonance: true });
moralSim.registerAgent('guardian', { neuroticism: 0.3 }, {
    moralProfile: DEFAULT_MORAL_PROFILES.HONORABLE_GUARDIAN
});

// Raw Dissonance dot product verification:
// Guardian: CARE .35 FAIR .25 LOY .25 AUTH .10 SANC .05
// ABANDON_COMRADE: CARE .80 FAIR .50 LOY .85 AUTH .30 SANC .10
// raw = .35*.80 + .25*.50 + .25*.85 + .10*.30 + .05*.10 = .28 + .125 + .2125 + .03 + .005 = .6525
const dZero = moralSim.computeMoralDissonance('guardian', TRANSGRESSION_TYPES.ABANDON_COMRADE, {});
assert(approx(dZero.rawDissonance, 0.6525), `Raw dissonance expected 0.6525, got ${dZero.rawDissonance}`);
assert(approx(dZero.netDissonance, dZero.rawDissonance), 'Zero context should yield net == raw dissonance');
assert(dZero.rationalization.total === 0, 'Zero context rationalization must be 0');

// Fear rationalization: fear = 1.0 => min(0.60, 0.65) = 0.60; net = raw * (1 - 0.60) = 0.6525 * 0.40 = 0.261
const dFear = moralSim.computeMoralDissonance('guardian', TRANSGRESSION_TYPES.ABANDON_COMRADE, { fear: 1.0 });
assert(approx(dFear.rationalization.fearRationalization, 0.60), 'Fear rationalization capped at 0.60');
assert(approx(dFear.netDissonance, dZero.rawDissonance * 0.40), `Expected net ${dZero.rawDissonance * 0.40}, got ${dFear.netDissonance}`);

// Direct order rationalization: AUTHORITY (.10) * 0.50 = 0.05
const dOrder = moralSim.computeMoralDissonance('guardian', TRANSGRESSION_TYPES.ABANDON_COMRADE, { isDirectOrder: true });
assert(approx(dOrder.rationalization.orderRationalization, 0.05), 'Order rationalization matches AUTHORITY * 0.5');

// Necessity rationalization: necessity = 0.5 => 0.5 * 0.40 = 0.20
const dNec = moralSim.computeMoralDissonance('guardian', TRANSGRESSION_TYPES.ABANDON_COMRADE, { necessity: 0.5 });
assert(approx(dNec.rationalization.necessityRationalization, 0.20), 'Necessity rationalization matches necessity * 0.4');

// Combined rationalization cap at 0.75
const dCap = moralSim.computeMoralDissonance('guardian', TRANSGRESSION_TYPES.ABANDON_COMRADE, {
    fear: 1.0,
    isDirectOrder: true,
    necessity: 1.0
});
assert(approx(dCap.rationalization.total, 0.75), 'Total rationalization must be capped at 0.75');
assert(approx(dCap.netDissonance, dZero.rawDissonance * 0.25), 'Net dissonance at max rationalization is raw * 0.25');
console.log('  * Section C (Haidt 5-foundation profiles and Festinger rationalization): PASS');

// ---------------------------------------------------------------------------
// Section D: Guilt accumulation and passive temporal decay.
// ---------------------------------------------------------------------------
console.log('--- Section D: Guilt accumulation & passive temporal decay ---');
// Record a transgression without mitigation
const transReport = moralSim.recordMoralTransgression('guardian', TRANSGRESSION_TYPES.ABANDON_COMRADE, {});
// addedGuilt = netDissonance * 0.80 = 0.6525 * 0.80 = 0.5220
assert(approx(transReport.addedGuilt, 0.5220), `Expected added guilt 0.5220, got ${transReport.addedGuilt}`);
assert(approx(transReport.currentGuilt, 0.5220), `Expected current guilt 0.5220, got ${transReport.currentGuilt}`);

const initialGuilt = transReport.currentGuilt;
// Advance 10 simulation ticks: guilt decays passively by G_t = G_0 * (1 - 0.005)^10
for (let t = 0; t < 10; t++) {
    moralSim.tick(0.1);
}
const decayedState = moralSim.getAgentMoralState('guardian');
const expectedDecayedGuilt = initialGuilt * Math.pow(1.0 - 0.005, 10);
assert(approx(decayedState.guilt, expectedDecayedGuilt), `Expected decayed guilt ${expectedDecayedGuilt}, got ${decayedState.guilt}`);
console.log('  * Section D (guilt accumulation and passive exponential decay): PASS');

// ---------------------------------------------------------------------------
// Section E: Chronic moral injury and character remodeling.
// ---------------------------------------------------------------------------
console.log('--- Section E: Chronic moral injury & character remodeling ---');
moralSim.registerAgent('veteran', { neuroticism: 0.2, agreeableness: 0.7, dominance: 0.6 }, {
    moralProfile: DEFAULT_MORAL_PROFILES.HONORABLE_GUARDIAN
});

// Incur severe guilt (EXECUTE_DEFENSELESS x2 drives guilt to 1.0)
moralSim.recordMoralTransgression('veteran', TRANSGRESSION_TYPES.EXECUTE_DEFENSELESS, {});
moralSim.recordMoralTransgression('veteran', TRANSGRESSION_TYPES.EXECUTE_DEFENSELESS, {});
const severeState = moralSim.getAgentMoralState('veteran');
assert(severeState.guilt >= 0.75, 'Veteran guilt must be in severe tier (>= 0.75)');
assert(severeState.moralInjury === false, 'Moral injury should not trigger immediately');

// Run 55 ticks to cross injuryThresholdTicks (50)
for (let t = 0; t < 55; t++) {
    // Top up guilt to stay above 0.75 threshold
    if (moralSim.getAgentMoralState('veteran').guilt < 0.80) {
        moralSim.recordMoralTransgression('veteran', TRANSGRESSION_TYPES.EXECUTE_DEFENSELESS, {});
    }
    moralSim.tick(0.1);
}

const injuredState = moralSim.getAgentMoralState('veteran');
assert(injuredState.moralInjury === true, 'Sustained severe guilt must trigger moral injury');
assert(injuredState.moralInjuryCount === 1, 'Moral injury count must be 1');
assert(injuredState.personalityDeltas.neuroticism > 0.10, 'Neuroticism must drift upward (+0.15)');
assert(injuredState.personalityDeltas.agreeableness < -0.15, 'Agreeableness must erode (-0.20)');
assert(injuredState.personalityDeltas.dominance < -0.10, 'Dominance must erode (-0.15)');
console.log('  * Section E (chronic moral injury and character remodeling): PASS');

// ---------------------------------------------------------------------------
// Section F: Restorative atonement & order compliance deliberation.
// ---------------------------------------------------------------------------
console.log('--- Section F: Restorative atonement & order defiance deliberation ---');
const preAtonementGuilt = injuredState.guilt;
const atonementReport = moralSim.recordMoralAtonement('veteran', ATONEMENT_TYPES.SACRIFICIAL_INTERVENTION);
// SACRIFICIAL_INTERVENTION relief is 0.50
assert(approx(atonementReport.guiltRelieved, 0.50, 0.05), `Relief should be approx 0.50, got ${atonementReport.guiltRelieved}`);
assert(atonementReport.currentGuilt < preAtonementGuilt, 'Atonement must reduce current guilt');

// Evaluate order compliance on fresh honorable agent vs injured veteran
moralSim.registerAgent('loyalist', { neuroticism: 0.1 }, {
    moralProfile: DEFAULT_MORAL_PROFILES.ZEALOUS_CRUSADER // High authority (.30)
});
const loyalistCompliance = moralSim.evaluateMoralOrderCompliance('loyalist', TRANSGRESSION_TYPES.LOOT_SETTLEMENT);
assert(loyalistCompliance.refusalProbability < 0.35, 'Loyalist with low guilt should have low refusal probability');

// Morally injured veteran under high prospective dissonance has elevated insubordination pressure
const veteranCompliance = moralSim.evaluateMoralOrderCompliance('veteran', TRANSGRESSION_TYPES.EXECUTE_DEFENSELESS);
assert(veteranCompliance.refusalProbability > 0.40, 'Injured veteran must have elevated refusal probability');
assert(typeof veteranCompliance.willComply === 'boolean', 'willComply must be boolean');
assert(typeof veteranCompliance.rationale === 'string', 'Deliberation rationale must be a string');
console.log('  * Section F (restorative atonement and order compliance deliberation): PASS');

// ---------------------------------------------------------------------------
// Section G: Host Game Authority & Immutability Invariant & Agent Lifecycle.
// ---------------------------------------------------------------------------
console.log('--- Section G: Host authority immutability & lifecycle cleanup ---');
const mockHostEntity = {
    id: 'guardian',
    x: 100, y: 50, z: -10,
    physics: { velocity: { vx: 2, vy: 0, vz: 1 }, mass: 80 },
    inventory: { gold: 500, sword: 'excalibur' }
};

const audit = moralSim.auditMoralImmutability(mockHostEntity);
assert(audit.intact === true, 'Host entity must remain 100% intact');
assert(audit.physicsMutations === 0, 'Host physics mutations must be 0');
assert(audit.transformMutations === 0, 'Host transform mutations must be 0');
assert(audit.moralDissonanceClean === true, 'Moral dissonance audit must report clean');

// Agent unregistration cleanup
moralSim.unregisterAgent('guardian');
assert(!moralSim.agents.has('guardian'), 'Agent must be removed from simulation');
assert(!moralSim.moralDissonance.agents.has('guardian'), 'Agent must be purged from MoralDissonanceEngine');
console.log('  * Section G (host authority immutability and agent lifecycle cleanup): PASS');

console.log('\n============================================================');
console.log(`ALL ${assertions} MORAL DISSONANCE OPT-IN ASSERTIONS PASSED`);
console.log('============================================================');
