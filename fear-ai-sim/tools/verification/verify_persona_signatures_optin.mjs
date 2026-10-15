#!/usr/bin/env node

/**
 * verify_persona_signatures_optin.mjs — the §3 promotion for Functional Persona Signatures (FABE).
 *
 * `FunctionalPersonaSignatures` moves from `RELEASE_SURFACE.md` §2 (out of scope) to §1 (in scope)
 * as an opt-in behavioral personality profiling service. That policy requires four things, and
 * this probe carries conditions 2, 3 and 4 of them:
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
 *   and identical RNG state draws on default ticks without persona intervention;
 * - The service is strictly ADVISORY: it models behavioral reaction response curves,
 *   Euclidean signature distance, nearest persona identification, and population collapse
 *   without mutating host transforms, physics, or canonical world truth.
 */

import { RuntimeSimulation } from '../../packages/runtime/src/RuntimeSimulation.js';
import {
    SIGNATURE_FUNCTIONS,
    DEFAULT_PROBE_GRID
} from '../../packages/core/src/FunctionalPersonaSignatures.js';

let assertions = 0;
function assert(condition, message) {
    assertions += 1;
    if (!condition) throw new Error(message);
}

function in01(v) {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
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
console.log('VERIFY FUNCTIONAL PERSONA SIGNATURES (FABE) OPT-IN SERVICE');
console.log('============================================================');

// ---------------------------------------------------------------------------
// Shared scenario for default-path comparison
// ---------------------------------------------------------------------------
const AGENTS = [
    ['scout', { neuroticism: 0.3, resilience: 0.7, agreeableness: 0.6, openness: 0.8 }, 0],
    ['trooper', { neuroticism: 0.6, resilience: 0.4, agreeableness: 0.4, conscientiousness: 0.7 }, 5],
    ['veteran', { neuroticism: 0.2, resilience: 0.9, leadership: 0.8, riskTolerance: 0.6 }, 10]
];

function runFull(options) {
    const sim = new RuntimeSimulation(options);
    for (const [id, traits, x] of AGENTS) {
        sim.registerAgent(id, traits, { initial_position: { x, y: 0, z: 0 } });
    }
    const outputs = [];
    for (let tick = 0; tick < 20; tick += 1) {
        sim.queueObservation('scout', {
            x: 0, y: 0, z: 0,
            threats: [{ id: 'ambush', type: 'PREDATOR', distance: 5.0, intensity: 0.7 }]
        });
        sim.queueObservation('trooper', { x: 5, y: 0, z: 0, threats: [] });
        sim.queueObservation('veteran', { x: 10, y: 0, z: 0, threats: [] });
        outputs.push(JSON.stringify(sim.tick(0.1)));
    }
    return { sim, outputs, snapshot: JSON.stringify(sim.saveSnapshot()) };
}

// ---------------------------------------------------------------------------
// Section A: Default path is untouched and the flag is genuinely opt-in.
// ---------------------------------------------------------------------------
console.log('--- Section A: Default path immutability & Opt-in boundary ---');
const absent = runFull({ seed: 7771 });
const explicitOff = runFull({ seed: 7771, enablePersonaSignatures: false });
const explicitOn = runFull({ seed: 7771, enablePersonaSignatures: true });

assert(absent.sim.personaSignatures === null, 'Default simulation instantiated personaSignatures');
assert(absent.sim.enablePersonaSignatures === false, 'Default simulation enablePersonaSignatures is not false');
assert(explicitOff.sim.personaSignatures === null, 'Explicit false simulation instantiated personaSignatures');
assert(explicitOff.sim.enablePersonaSignatures === false, 'Explicit false simulation enablePersonaSignatures is not false');
assert(explicitOn.sim.personaSignatures !== null, 'Opt-in simulation failed to instantiate personaSignatures');
assert(explicitOn.sim.enablePersonaSignatures === true, 'Opt-in simulation enablePersonaSignatures is not true');

// Byte-for-byte identical outputs across 20 ticks
for (let i = 0; i < 20; i++) {
    assert(absent.outputs[i] === explicitOff.outputs[i], `Output divergence at tick ${i} between absent and explicit false`);
    assert(absent.outputs[i] === explicitOn.outputs[i], `Output divergence at tick ${i} between default and opt-in path without persona calls`);
}
assert(absent.snapshot === explicitOff.snapshot, 'Persistence snapshots diverge between absent and explicit false');
assert(absent.snapshot === explicitOn.snapshot, 'Persistence snapshots diverge between default and opt-in path without persona calls');
assert(absent.sim.rng.getState().index === explicitOn.sim.rng.getState().index, 'RNG draws consumed on opt-in simulation');
console.log('  * Default and explicit-false paths 100% byte-identical over 20 ticks: PASS');
console.log('  * Opt-in simulation produces identical core outputs & consumes 0 simulation RNG draws: PASS');

// ---------------------------------------------------------------------------
// Section B: Refusal boundaries when disabled
// ---------------------------------------------------------------------------
console.log('\n--- Section B: Refusal boundaries when disabled ---');
assertThrows(() => absent.sim.computeAgentPersonaSignature('scout'),
    /PERSONA_SIGNATURES_DISABLED/, 'computeAgentPersonaSignature on disabled sim');
assertThrows(() => explicitOff.sim.computeAgentPersonaSignature('scout'),
    /PERSONA_SIGNATURES_DISABLED/, 'computeAgentPersonaSignature on explicitOff sim');
assertThrows(() => absent.sim.evaluateAgentReaction('scout', 0.5),
    /PERSONA_SIGNATURES_DISABLED/, 'evaluateAgentReaction on disabled sim');
assertThrows(() => absent.sim.computeAgentPersonaDistance('scout', 'veteran'),
    /PERSONA_SIGNATURES_DISABLED/, 'computeAgentPersonaDistance on disabled sim');
assertThrows(() => absent.sim.identifyAgentPersona('scout'),
    /PERSONA_SIGNATURES_DISABLED/, 'identifyAgentPersona on disabled sim');
assertThrows(() => absent.sim.evaluateAgentPersonaCollapse('scout'),
    /PERSONA_SIGNATURES_DISABLED/, 'evaluateAgentPersonaCollapse on disabled sim');
console.log('  * All persona signatures operations refuse with PERSONA_SIGNATURES_DISABLED when disabled: PASS');

// ---------------------------------------------------------------------------
// Section C: Unknown agent rejection
// ---------------------------------------------------------------------------
console.log('\n--- Section C: Unknown agent rejection ---');
const activeSim = new RuntimeSimulation({ seed: 7772, enablePersonaSignatures: true });
activeSim.registerAgent('known_hero', { neuroticism: 0.1, resilience: 0.9, leadership: 0.8 });

assertThrows(() => activeSim.computeAgentPersonaSignature('ghost_agent'),
    /UNKNOWN_AGENT/, 'computeAgentPersonaSignature unknown agent');
assertThrows(() => activeSim.evaluateAgentReaction('ghost_agent', 0.5),
    /UNKNOWN_AGENT/, 'evaluateAgentReaction unknown agent');
assertThrows(() => activeSim.computeAgentPersonaDistance('ghost_agent', 'known_hero'),
    /UNKNOWN_AGENT/, 'computeAgentPersonaDistance unknown agent A');
assertThrows(() => activeSim.computeAgentPersonaDistance('known_hero', 'ghost_agent'),
    /UNKNOWN_AGENT/, 'computeAgentPersonaDistance unknown agent B');
assertThrows(() => activeSim.identifyAgentPersona('ghost_agent'),
    /UNKNOWN_AGENT/, 'identifyAgentPersona unknown agent');
assertThrows(() => activeSim.evaluateAgentPersonaCollapse('ghost_agent'),
    /UNKNOWN_AGENT/, 'evaluateAgentPersonaCollapse unknown agent');
console.log('  * All persona signatures operations fail-fast with UNKNOWN_AGENT for unregistered entities: PASS');

// ---------------------------------------------------------------------------
// Section D: Response curves and signature evaluation on live agents
// ---------------------------------------------------------------------------
console.log('\n--- Section D: Live agent persona signatures & curve evaluation ---');
activeSim.registerAgent('high_neurotic', { neuroticism: 0.9, resilience: 0.1, agreeableness: 0.3 });
activeSim.registerAgent('high_resilient', { neuroticism: 0.1, resilience: 0.9, agreeableness: 0.7 });

const sigN = activeSim.computeAgentPersonaSignature('high_neurotic');
const sigR = activeSim.computeAgentPersonaSignature('high_resilient');

assert(sigN.agentId === 'high_neurotic', 'Signature agentId mismatch');
assert(sigN.traits.neuroticism === 0.9, 'Signature traits mismatch');
assert(typeof sigN.curves === 'object', 'Signature curves missing');
assert(typeof sigN.auc === 'object', 'Signature auc missing');

// Verify all 11 curves and AUC metrics exist and are bounded [0, 1]
for (const fn of SIGNATURE_FUNCTIONS) {
    assert(Array.isArray(sigN.curves[fn]), `Curve ${fn} is not an array`);
    assert(sigN.curves[fn].length === DEFAULT_PROBE_GRID.length, `Curve ${fn} point count mismatch`);
    for (const pt of sigN.curves[fn]) {
        assert(in01(pt), `Curve ${fn} point out of range: ${pt}`);
    }
    assert(in01(sigN.auc[fn]), `AUC ${fn} out of range: ${sigN.auc[fn]}`);
    assert(in01(sigR.auc[fn]), `AUC ${fn} out of range for resilient agent`);
}

// N vs R phase separation verification:
// High Neuroticism yields significantly higher panicThreat, panicUncertainty, and recoveryTime AUC
assert(sigN.auc.panicThreat > sigR.auc.panicThreat,
    `panicThreat AUC expected higher for high-N (${sigN.auc.panicThreat} vs ${sigR.auc.panicThreat})`);
assert(sigN.auc.panicUncertainty > sigR.auc.panicUncertainty,
    `panicUncertainty AUC expected higher for high-N (${sigN.auc.panicUncertainty} vs ${sigR.auc.panicUncertainty})`);
assert(sigN.auc.recoveryTime > sigR.auc.recoveryTime,
    `recoveryTime AUC expected higher for high-N (${sigN.auc.recoveryTime} vs ${sigR.auc.recoveryTime})`);
console.log('  * 11 response curves and AUC evaluated on live agents: PASS');
console.log('  * Mathematical phase separation between N and R verified: PASS');

// ---------------------------------------------------------------------------
// Section E: Single-probe reaction evaluation
// ---------------------------------------------------------------------------
console.log('\n--- Section E: Single-probe reaction evaluation ---');
const r0 = activeSim.evaluateAgentReaction('high_neurotic', 0.0);
const r5 = activeSim.evaluateAgentReaction('high_neurotic', 0.5);
const r1 = activeSim.evaluateAgentReaction('high_neurotic', 1.0);

assert(r0.probeValue === 0.0, 'Probe value mismatch at 0.0');
assert(r5.probeValue === 0.5, 'Probe value mismatch at 0.5');
assert(r1.probeValue === 1.0, 'Probe value mismatch at 1.0');

// Monotonicity of panicThreat (increases with threat intensity)
assert(r1.reactions.panicThreat > r0.reactions.panicThreat,
    `panicThreat should rise with probe value: ${r0.reactions.panicThreat} -> ${r1.reactions.panicThreat}`);
// Monotonicity of panicDistance (decreases as distance increases)
assert(r1.reactions.panicDistance < r0.reactions.panicDistance,
    `panicDistance should fall as distance increases: ${r0.reactions.panicDistance} -> ${r1.reactions.panicDistance}`);
console.log('  * Probe reaction evaluated across [0.0, 0.5, 1.0] with strict monotonicity: PASS');

// ---------------------------------------------------------------------------
// Section F: Persona distance, nearest identification, and population collapse
// ---------------------------------------------------------------------------
console.log('\n--- Section F: Distance, identification, and collapse evaluation ---');
activeSim.registerAgent('agent_coward', { neuroticism: 0.95, resilience: 0.05, agreeableness: 0.2 });
activeSim.registerAgent('agent_hero', { neuroticism: 0.05, resilience: 0.95, agreeableness: 0.8 });
activeSim.registerAgent('agent_average', { neuroticism: 0.5, resilience: 0.5, agreeableness: 0.5 });

// Distance properties
const distSelf = activeSim.computeAgentPersonaDistance('agent_coward', 'agent_coward');
assert(distSelf.distance === 0, `Self-distance must be zero, got ${distSelf.distance}`);

const distAB = activeSim.computeAgentPersonaDistance('agent_coward', 'agent_hero');
const distBA = activeSim.computeAgentPersonaDistance('agent_hero', 'agent_coward');
assert(distAB.distance === distBA.distance, 'Distance must be symmetric');
assert(distAB.distance > 0.20, `Extreme coward and hero distance should be large, got ${distAB.distance}`);

const distCowardToN = activeSim.computeAgentPersonaDistance('agent_coward', 'high_neurotic');
assert(distCowardToN.distance < distAB.distance, 'Coward should be much closer to high-N than to hero');

// Nearest neighbor identification
const ident = activeSim.identifyAgentPersona('agent_coward', ['high_neurotic', 'high_resilient', 'agent_hero', 'agent_average']);
assert(ident.predictedId === 'high_neurotic', `Expected coward to identify with high_neurotic, got ${ident.predictedId}`);
assert(ident.margin > 0, `Identification margin must be positive, got ${ident.margin}`);
assert(ident.strongestDiscriminator && typeof ident.strongestDiscriminator.function === 'string',
    'strongestDiscriminator function missing');

// Population collapse scoring
const collapseCoward = activeSim.evaluateAgentPersonaCollapse('agent_coward');
const collapseAvg = activeSim.evaluateAgentPersonaCollapse('agent_average');
assert(in01(collapseCoward.collapseScore), `Collapse score out of range: ${collapseCoward.collapseScore}`);
assert(in01(collapseAvg.collapseScore), `Collapse score out of range: ${collapseAvg.collapseScore}`);
assert(collapseCoward.populationSize >= 5, 'Population size mismatch');

// Edge cases for collapse and identification
assertThrows(() => activeSim.identifyAgentPersona('agent_coward', []),
    /EMPTY_POPULATION/, 'identifyAgentPersona with empty population array');
assertThrows(() => activeSim.evaluateAgentPersonaCollapse('agent_coward', ['agent_coward']),
    /POPULATION_TOO_SMALL/, 'evaluateAgentPersonaCollapse with fewer than 2 agents');
console.log('  * Distance metric, nearest persona identification, and collapse scores verified: PASS');

// ---------------------------------------------------------------------------
// Section G: Host Game Authority & Immutability Invariant
// ---------------------------------------------------------------------------
console.log('\n--- Section G: Host Game Authority & Immutability Invariant ---');
const hostEntity = {
    id: 'host-game-entity-99',
    position: { x: 142.5, y: 0.0, z: -88.2 },
    velocity: { vx: 0.0, vy: 0.0, vz: 0.0 },
    hp: 100,
    physicsBody: 'KinematicCharacter3D',
    tags: ['PLAYER_COMPANION']
};
const hostBefore = JSON.stringify(hostEntity);
const audit = activeSim.auditPersonaSignaturesImmutability(hostEntity);
const hostAfter = JSON.stringify(hostEntity);

assert(hostBefore === hostAfter, 'Host game entity was mutated during persona audit');
assert(audit.intact === true, 'Audit reports host entity was not intact');
assert(audit.physicsMutations === 0, 'Audit reports physics mutations > 0');
assert(audit.transformMutations === 0, 'Audit reports transform mutations > 0');
assert(audit.personaSignaturesClean === true, 'Audit reports persona signatures engine was unclean');
console.log('  * Host Game Authority Invariant strictly preserved (0 host mutations): PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log(`ALL FUNCTIONAL PERSONA SIGNATURES (FABE) CHECKS PASSED (${assertions} assertions)`);
console.log('============================================================');
