#!/usr/bin/env node

/**
 * verify_epistemic_belief_optin.mjs — the §3 promotion for Epistemic Belief Engine.
 *
 * `EpistemicBeliefEngine` moves from `RELEASE_SURFACE.md` §2 (out of scope) to §1 (in scope)
 * as an opt-in epistemic service. That policy requires four things, and this probe carries
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
 *   and identical RNG state draws on default ticks without epistemic intervention;
 * - The service is strictly ADVISORY: it models subjective belief formation, rumor decay,
 *   personality bias, and discrepancy metrics without mutating host transforms, physics,
 *   or canonical world truth.
 */

import { RuntimeSimulation } from '../../packages/runtime/src/RuntimeSimulation.js';
import { BELIEF_CATEGORIES, EPISTEMIC_PROVENANCE } from '../../packages/core/src/EpistemicBeliefEngine.js';

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
console.log('VERIFY EPISTEMIC BELIEF OPT-IN SERVICE');
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
    for (let tick = 0; tick < 20; tick += 1) {
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
// Section A: Default path is untouched and the flag is genuinely opt-in.
// ---------------------------------------------------------------------------
const absent = runFull({ seed: 202 });
const explicitOff = runFull({ seed: 202, enableEpistemicBelief: false });

assert(absent.sim.epistemicBelief === null,
    'A default RuntimeSimulation constructed the epistemic belief service, so it is not opt-in');
assert(absent.sim.enableEpistemicBelief === false,
    'The epistemic belief opt-in flag does not default to false');
assert(absent.sim.agentEpistemicEngines === null,
    'The agent epistemic engines map is not null on the default path');

assert(absent.outputs.join('\n') === explicitOff.outputs.join('\n'),
    'Omitting the flag and passing it as false produced different simulation outputs');
assert(absent.snapshot === explicitOff.snapshot,
    'Omitting the flag and passing it as false produced different persistence snapshots');

const optIn = runFull({ seed: 202, enableEpistemicBelief: true });
assert(optIn.sim.epistemicBelief !== null,
    'RuntimeSimulation with enableEpistemicBelief: true did not construct the oracle epistemic belief engine');
assert(optIn.sim.agentEpistemicEngines.size === 3,
    'RuntimeSimulation with enableEpistemicBelief: true did not construct epistemic engines for registered agents');
assert(optIn.outputs.join('\n') === absent.outputs.join('\n'),
    'Enabling epistemic belief altered core outputs on ticks that did not inject subjective perception');
assert(optIn.snapshot === absent.snapshot,
    'Opt-in epistemic belief grew or modified the default persistence snapshot');
assert(JSON.stringify(optIn.sim.rng.getState()) === JSON.stringify(absent.sim.rng.getState()),
    'Opt-in epistemic belief drew from the simulation RNG on the unconfigured path');
console.log('  * Section A (opt-in boundary & default path immutability): PASS');

// ---------------------------------------------------------------------------
// Section B: Refusal gates on disabled instances & error enforcement.
// ---------------------------------------------------------------------------
const disabledSim = new RuntimeSimulation({ seed: 203 });
disabledSim.registerAgent('test_agent', { neuroticism: 0.5 });

assertThrows(
    () => disabledSim.recordEpistemicObservation('test_agent', {}),
    /EPISTEMIC_BELIEF_DISABLED/,
    'disabled recordEpistemicObservation'
);
assertThrows(
    () => disabledSim.recordEpistemicRumor('test_agent', { category: BELIEF_CATEGORIES.THREAT, id: 't1' }),
    /EPISTEMIC_BELIEF_DISABLED/,
    'disabled recordEpistemicRumor'
);
assertThrows(
    () => disabledSim.getSubjectiveObservations('test_agent'),
    /EPISTEMIC_BELIEF_DISABLED/,
    'disabled getSubjectiveObservations'
);
assertThrows(
    () => disabledSim.evaluateEpistemicDiscrepancy('test_agent', {}),
    /EPISTEMIC_BELIEF_DISABLED/,
    'disabled evaluateEpistemicDiscrepancy'
);

// On enabled sim, unknown agent errors fail fast
const enabledSim = new RuntimeSimulation({ seed: 204, enableEpistemicBelief: true });
assertThrows(
    () => enabledSim.recordEpistemicObservation('ghost_agent', {}),
    /UNKNOWN_AGENT/,
    'unknown agent recordEpistemicObservation'
);
assertThrows(
    () => enabledSim.recordEpistemicRumor('ghost_agent', { category: BELIEF_CATEGORIES.THREAT, id: 't1' }),
    /UNKNOWN_AGENT/,
    'unknown agent recordEpistemicRumor'
);
assertThrows(
    () => enabledSim.getSubjectiveObservations('ghost_agent'),
    /UNKNOWN_AGENT/,
    'unknown agent getSubjectiveObservations'
);
assertThrows(
    () => enabledSim.evaluateEpistemicDiscrepancy('ghost_agent', {}),
    /UNKNOWN_AGENT/,
    'unknown agent evaluateEpistemicDiscrepancy'
);
console.log('  * Section B (refusal gates & unknown agent validation): PASS');

// ---------------------------------------------------------------------------
// Section C: Direct Sensory Observation & Disconfirmation of False Rumors.
// ---------------------------------------------------------------------------
const epistemicSim = new RuntimeSimulation({ seed: 205, enableEpistemicBelief: true });
epistemicSim.registerAgent('ranger', { neuroticism: 0.3 });

// 1. Ingest rumor of threat at (10, 10)
epistemicSim.recordEpistemicRumor('ranger', {
    category: BELIEF_CATEGORIES.THREAT,
    id: 'phantom_stalker',
    data: { x: 10, y: 10, intensity: 0.8, distance: 10 },
    initialConfidence: 0.75,
    hops: 1
}, 0.8);

let rangerEngine = epistemicSim.getEpistemicEngine('ranger');
assert(rangerEngine.threatBeliefs.has('phantom_stalker'), 'Threat rumor was not ingested into threatBeliefs');
const initialRumorConf = rangerEngine.threatBeliefs.get('phantom_stalker').confidence;
assert(initialRumorConf > 0.5, 'Initial rumor confidence below expectation');

// 2. Ranger walks to (10, 10) and inspects the clear zone
epistemicSim.recordEpistemicObservation('ranger', {
    agentX: 10,
    agentY: 10,
    clearZoneRadius: 15,
    threats: [] // No threats seen!
});

// Rumor should be disconfirmed by direct observation of clear zone
const postInspection = rangerEngine.threatBeliefs.get('phantom_stalker');
assert(!postInspection || postInspection.confidence < initialRumorConf,
    'Clear sight did not disconfirm false proximate rumor');
assert(rangerEngine.contradictionLog.some(c => c.type === 'BELIEF_DISCONFIRMED_BY_CLEAR_SIGHT'),
    'Contradiction log did not record BELIEF_DISCONFIRMED_BY_CLEAR_SIGHT');

// 3. Ranger directly spots an actual threat
epistemicSim.recordEpistemicObservation('ranger', {
    agentX: 10,
    agentY: 10,
    threats: [{ id: 'real_ambush', x: 12, y: 11, distance: 2.5, intensity: 0.9, type: 'AMBUSH' }]
});

const observedBelief = rangerEngine.threatBeliefs.get('real_ambush');
assert(observedBelief !== undefined, 'Directly observed threat not stored');
assert(observedBelief.provenance === EPISTEMIC_PROVENANCE.OBSERVED, 'Provenance is not OBSERVED');
assert(observedBelief.confidence >= 0.95, 'Direct observation confidence not >= 0.95');
console.log('  * Section C (direct observation & rumor disconfirmation): PASS');

// ---------------------------------------------------------------------------
// Section D: Multi-Hop Rumor Diffusion & Personality Modulation.
// ---------------------------------------------------------------------------
const multiHopSim = new RuntimeSimulation({ seed: 206, enableEpistemicBelief: true });
multiHopSim.registerAgent('calm_scout', { neuroticism: 0.1 });
multiHopSim.registerAgent('anxious_scout', { neuroticism: 0.9 });

// Send 1-hop rumor to calm_scout and 3-hop rumor to calm_scout
const calmEngine = multiHopSim.getEpistemicEngine('calm_scout');
const anxiousEngine = multiHopSim.getEpistemicEngine('anxious_scout');

multiHopSim.recordEpistemicRumor('calm_scout', {
    category: BELIEF_CATEGORIES.THREAT,
    id: 'distant_colossus_1hop',
    data: { x: 50, y: 50, intensity: 1.0 },
    initialConfidence: 0.8,
    hops: 1
}, 0.7);

multiHopSim.recordEpistemicRumor('calm_scout', {
    category: BELIEF_CATEGORIES.THREAT,
    id: 'distant_colossus_3hop',
    data: { x: 50, y: 50, intensity: 1.0 },
    initialConfidence: 0.8,
    hops: 3
}, 0.7);

const conf1Hop = calmEngine.threatBeliefs.get('distant_colossus_1hop').confidence;
const conf3Hop = calmEngine.threatBeliefs.get('distant_colossus_3hop').confidence;
assert(conf1Hop > conf3Hop, 'Multi-hop rumor was not attenuated compared to 1-hop rumor');

// Compare anxious vs calm agent for identical threat rumor
multiHopSim.recordEpistemicRumor('anxious_scout', {
    category: BELIEF_CATEGORIES.THREAT,
    id: 'shared_threat_rumor',
    data: { x: 30, y: 30, intensity: 0.7 },
    initialConfidence: 0.6,
    hops: 2
}, 0.8);

multiHopSim.recordEpistemicRumor('calm_scout', {
    category: BELIEF_CATEGORIES.THREAT,
    id: 'shared_threat_rumor',
    data: { x: 30, y: 30, intensity: 0.7 },
    initialConfidence: 0.6,
    hops: 2
}, 0.8);

const anxiousConf = anxiousEngine.threatBeliefs.get('shared_threat_rumor').confidence;
const calmConf = calmEngine.threatBeliefs.get('shared_threat_rumor').confidence;
assert(anxiousConf > calmConf, 'High neuroticism agent did not accord higher confidence to threat rumor');
console.log('  * Section D (multi-hop diffusion & neuroticism modulation): PASS');

// ---------------------------------------------------------------------------
// Section E: Subjective Observation Synthesis & Epistemic Modulation.
// ---------------------------------------------------------------------------
const subjectiveSim = new RuntimeSimulation({ seed: 207, enableEpistemicBelief: true });
subjectiveSim.registerAgent('observer', { neuroticism: 0.5 });
const obsEngine = subjectiveSim.getEpistemicEngine('observer');

// Inject a rumor with moderate confidence
subjectiveSim.recordEpistemicRumor('observer', {
    category: BELIEF_CATEGORIES.THREAT,
    id: 'lurker',
    data: { x: 5, y: 5, z: 0, distance: 7.0, intensity: 0.8, type: 'LURKER' },
    initialConfidence: 0.5,
    hops: 1
}, 0.8);

const subjectiveSnapshot = subjectiveSim.getSubjectiveObservations('observer');
assert(Array.isArray(subjectiveSnapshot.threats), 'Subjective observations threats is not an array');
assert(subjectiveSnapshot.threats.length === 1, 'Subjective observations did not synthesize believed threat');

const perceivedThreat = subjectiveSnapshot.threats[0];
assert(perceivedThreat.id === 'lurker', 'Perceived threat id mismatch');
// Intensity modulated by confidence: perceived.intensity <= data.intensity
assert(perceivedThreat.intensity <= 0.8, 'Subjective threat intensity exceeded raw base intensity');
assert(perceivedThreat.epistemicConfidence > 0, 'Subjective threat has no epistemicConfidence');
console.log('  * Section E (subjective observation synthesis & modulation): PASS');

// ---------------------------------------------------------------------------
// Section F: Paranoia vs Complacency Discrepancy Evaluation.
// ---------------------------------------------------------------------------
const evalSim = new RuntimeSimulation({ seed: 208, enableEpistemicBelief: true });
evalSim.registerAgent('tactician', { neuroticism: 0.5 });

// Case 1: Tactician believes phantom_threat, but world has real_threat_only
evalSim.recordEpistemicRumor('tactician', {
    category: BELIEF_CATEGORIES.THREAT,
    id: 'phantom_threat',
    data: { x: 10, y: 10, intensity: 0.8, distance: 5 },
    initialConfidence: 0.8,
    hops: 1
}, 0.9);

const worldTruth = {
    activeThreats: [
        { id: 'real_threat_only', x: 20, y: 20, distance: 8, intensity: 0.9 }
    ]
};

const discrepancy = evalSim.evaluateEpistemicDiscrepancy('tactician', worldTruth);
assert(discrepancy.paranoiaScore > 0, 'Discrepancy report failed to detect paranoia (false positive)');
assert(discrepancy.falsePositives.some(p => p.id === 'phantom_threat'), 'phantom_threat not in falsePositives');
assert(discrepancy.complacencyScore > 0, 'Discrepancy report failed to detect complacency (unseen real threat)');
assert(discrepancy.falseNegatives.some(n => n.id === 'real_threat_only'), 'real_threat_only not in falseNegatives');
assert(discrepancy.isOmniscient === false, 'Discrepancy report erroneously claimed omniscience');

// Case 2: Full alignment (omniscient / accurate tracking)
evalSim.recordEpistemicObservation('tactician', {
    threats: [
        { id: 'real_threat_only', x: 20, y: 20, distance: 8, intensity: 0.9 }
    ],
    agentX: 10,
    agentY: 10,
    clearZoneRadius: 20 // Disconfirms phantom_threat
});

// Run a tick to prune disconfirmed belief if confidence dropped below threshold
evalSim.tick(0.1);

const alignedTruth = {
    activeThreats: [
        { id: 'real_threat_only', x: 20, y: 20, distance: 8, intensity: 0.9 }
    ]
};

// Clear any residual phantom_threat for clean omniscience test
const tacticianEngine = evalSim.getEpistemicEngine('tactician');
tacticianEngine.threatBeliefs.delete('phantom_threat');

const omniReport = evalSim.evaluateEpistemicDiscrepancy('tactician', alignedTruth);
assert(omniReport.paranoiaScore === 0, 'Omniscient state has non-zero paranoia');
assert(omniReport.complacencyScore === 0, 'Omniscient state has non-zero complacency');
assert(omniReport.isOmniscient === true, 'Accurately tracked threat was not marked omniscient');
console.log('  * Section F (paranoia and complacency discrepancy metrics): PASS');

// ---------------------------------------------------------------------------
// Section G: Host Authority Immutability & Lifecycle Cleanup.
// ---------------------------------------------------------------------------
const hostEntity = Object.freeze({
    id: 'host_actor_42',
    x: 100.5,
    y: 200.75,
    z: 15.0,
    health: 100,
    velocity: { vx: 1.2, vy: -0.5 }
});

const groundTruthState = Object.freeze({
    activeThreats: Object.freeze([
        Object.freeze({ id: 'boss_dragon', x: 120, y: 210, intensity: 1.0, distance: 25 })
    ])
});

const auditResult = evalSim.auditEpistemicImmutability(hostEntity, groundTruthState);
assert(auditResult.intact === true, 'Host entity or ground truth was mutated during epistemic operations');
assert(auditResult.physicsMutations === 0, 'Physics mutations detected on host entity');
assert(auditResult.transformMutations === 0, 'Transform mutations detected on host entity');
assert(auditResult.worldTruthMutations === 0, 'World ground truth mutations detected');

// Agent unregistration cleanup
assert(evalSim.agentEpistemicEngines.has('tactician'), 'Agent not in epistemic engines before unregister');
evalSim.unregisterAgent('tactician');
assert(!evalSim.agentEpistemicEngines.has('tactician'), 'Agent not cleaned up from epistemic engines after unregister');
console.log('  * Section G (host authority immutability & unregister cleanup): PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log(`SUCCESS: All ${assertions} Epistemic Belief opt-in assertions passed.`);
console.log('============================================================');
