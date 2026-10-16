#!/usr/bin/env node

/**
 * verify_optin_engine_lifecycle.mjs — long-world state hygiene for the opt-in services
 * across the runtime's lifecycle events, and the bounded contradiction log.
 *
 * Two defects in the same class are pinned here:
 *
 *   1. reset() and loadSnapshot() rebuild `coreTrauma`, `social`, `personaSignatures` and
 *      `factionGovernance` from construction options, but left the per-agent opt-in
 *      services — information propagation, epistemic belief, moral dissonance, pack
 *      coordination — holding state from the world being discarded, including state keyed
 *      by agents a hard reset had just deleted. A restored agent meanwhile had no
 *      epistemic engine and no moral profile, so recordEpistemicObservation() refused with
 *      UNKNOWN_AGENT even though the agent was registered.
 *
 *   2. EpistemicBeliefEngine.contradictionLog appended a record on every rumor its
 *      beliefs resolved and was never trimmed, so a long-lived oracle accumulated an
 *      unbounded log.
 *
 *   3. MoralDissonanceEngine.registerAgentMoralProfile read weights off whatever it
 *      was handed, so a string profile name ('COLD_UTILITARIAN') silently became a
 *      uniform 0.2/0.2/0.2/0.2/0.2 profile — none of the five — while the runtime's
 *      public endpoint resolved the same string to the real profile. registerAgent
 *      passed raw strings, so the two entry points disagreed about the same input.
 *
 * Invariants proven:
 * - A hard reset leaves every opt-in service empty and ghost-free, and clears the
 *   per-agent config registry;
 * - A soft reset rebuilds each survivor's opt-in services EMPTY but in the shape they
 *   were registered with: per-agent epistemic config and moral profile survive through
 *   the registry, beliefs and guilt do not;
 * - loadSnapshot gives every restored agent fresh, live services, so the epistemic and
 *   moral entries work instead of refusing with UNKNOWN_AGENT, and no old-world belief
 *   leaks into the restored service;
 * - The default path stays opt-out: with the flags off, reset() still builds no service
 *   and the persisted snapshot is byte-identical to a run with the services enabled;
 * - contradictionLog is bounded by maxContradictionLogEntries on both record paths,
 *   newest kept;
 * - A named moral profile means the same thing at registration, through the public
 *   endpoint, and inside the engine, and an unknown name or a non-object profile is
 *   refused instead of silently becoming a uniform profile.
 */

import { RuntimeSimulation } from '../../packages/runtime/src/RuntimeSimulation.js';
import {
    EpistemicBeliefEngine,
    EPISTEMIC_PROVENANCE,
    BELIEF_CATEGORIES,
    DEFAULT_EPISTEMIC_CONFIG
} from '../../packages/core/src/EpistemicBeliefEngine.js';
import { MoralDissonanceEngine, DEFAULT_MORAL_PROFILES } from '../../packages/core/src/MoralDissonanceEngine.js';

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
console.log('VERIFY OPT-IN ENGINE LIFECYCLE (reset / load / bounded log)');
console.log('============================================================');

const OPT_INS = {
    enableInformationPropagation: true,
    enableEpistemicBelief: true,
    enableMoralDissonance: true,
    enablePackCoordination: true
};

const APEX = { id: 'apex', x: 0, y: 0, z: 0, distance: 3.0, intensity: 1.0, type: 'PREDATOR' };

function buildWorld(seed) {
    const sim = new RuntimeSimulation({ seed, ...OPT_INS });
    sim.registerAgent('scout', { neuroticism: 0.4 }, { initial_position: { x: 0, y: 0, z: 0 } });
    sim.registerAgent('medic', { neuroticism: 0.6 }, { initial_position: { x: 4, y: 0, z: 0 } });
    sim.registerAgent('captain', { neuroticism: 0.2 }, { initial_position: { x: 12, y: 0, z: 0 } });
    return sim;
}

// ---------------------------------------------------------------------------
// Section A: A hard reset leaves no opt-in state and no ghosts.
// ---------------------------------------------------------------------------
const hard = buildWorld(4242);
hard.recordEpistemicObservation('scout', { threats: [APEX] });
hard.injectRumor('MONSTER_SIGHTING', { threatId: 'apex', distance: 20 }, 'medic');
hard.createPack('pack_alpha', {});
hard.registerPackMember('pack_alpha', 'scout');
hard.registerPackMember('pack_alpha', 'medic');

assert(hard.agentEpistemicEngines.size === 3, 'World setup did not build three epistemic engines');
assert(hard.getEpistemicEngine('scout').threatBeliefs.has('apex'),
    'World setup did not record the apex belief for scout');
assert(hard.informationPropagation.rumors.size === 1, 'World setup did not retain the injected rumor');
assert(hard.packCoordination.packs.size === 1, 'World setup did not create the pack');
assert(hard._agentOptInConfig.size === 3, 'World setup did not populate the per-agent opt-in registry');

hard.reset({ clearAgents: true });

assert(hard.agents.size === 0, 'Hard reset did not clear the agent roster');
assert(hard.agentEpistemicEngines !== null && hard.agentEpistemicEngines.size === 0,
    'Hard reset left epistemic engines for cleared agents (ghost engines)');
assert(hard.getEpistemicEngine('scout') === null, 'Hard reset left a readable epistemic engine for a cleared agent');
assertThrows(() => hard.recordEpistemicObservation('scout', { threats: [] }), /UNKNOWN_AGENT/,
    'Hard reset: cleared agent recordEpistemicObservation');
assert(hard.moralDissonance.agents.size === 0, 'Hard reset left moral records for cleared agents');
assert(hard.informationPropagation.rumors.size === 0, 'Hard reset left retained rumors describing a dead world');
assert(hard.informationPropagation.listenEdges.size === 0, 'Hard reset left the rumor roster populated');
assert(hard.informationPropagation.inboxes.size === 0, 'Hard reset left per-agent rumor inboxes populated');
assert(hard.informationPropagation.credibility.size === 0, 'Hard reset left agent credibility entries');
assert(hard.informationPropagation.susceptibility.size === 0, 'Hard reset left agent susceptibility entries');
assert(hard.packCoordination.packs.size === 0, 'Hard reset left packs holding only ghost member ids');
assert(hard._agentOptInConfig.size === 0, 'Hard reset left per-agent opt-in config entries for cleared agents');

// Re-registration after a hard reset must behave like a fresh world.
hard.registerAgent('scout', { neuroticism: 0.4 }, {
    initial_position: { x: 0, y: 0, z: 0 },
    epistemicConfig: { minBeliefConfidence: 0.2 }
});
const reborn = hard.getEpistemicEngine('scout');
assert(reborn !== null, 'Re-registration after a hard reset did not build a fresh epistemic engine');
assert(reborn.config.minBeliefConfidence === 0.2,
    'Re-registered engine ignored the per-registration epistemic config');
hard.recordEpistemicObservation('scout', { threats: [APEX] });
assert(reborn.threatBeliefs.has('apex'), 'Re-registered agent could not record an epistemic observation');
console.log('  * Section A (hard reset leaves no opt-in ghosts): PASS');

// ---------------------------------------------------------------------------
// Section B: A soft reset rebuilds survivor services empty, in registered shape.
// ---------------------------------------------------------------------------
const soft = buildWorld(4243);
soft.registerAgent('scholar', { neuroticism: 0.5 }, {
    initial_position: { x: 8, y: 0, z: 0 },
    epistemicConfig: { minBeliefConfidence: 0.2 },
    moralProfile: 'COLD_UTILITARIAN'
});
soft.recordEpistemicObservation('scout', { threats: [APEX] });
soft.recordEpistemicObservation('scholar', { threats: [APEX] });
soft.injectRumor('MONSTER_SIGHTING', { threatId: 'apex', distance: 20 }, 'medic');
soft.createPack('pack_beta', {});
soft.registerPackMember('pack_beta', 'scout');
soft.registerPackMember('pack_beta', 'medic');
soft.recordMoralTransgression('scholar', 'EXECUTE_DEFENSELESS', {});
soft.recordMoralTransgression('scout', 'EXECUTE_DEFENSELESS', {});

const preScholarScore = soft.computeMoralDissonance('scholar', 'EXECUTE_DEFENSELESS', {}).netDissonance;
const preScoutScore = soft.computeMoralDissonance('scout', 'EXECUTE_DEFENSELESS', {}).netDissonance;
assert(preScholarScore !== preScoutScore,
    'Distinct moral profiles produced identical dissonance, so the fidelity check would be blind');
assert(soft.getAgentMoralState('scout').guilt > 0, 'World setup did not accumulate guilt for scout');
assert(soft.getEpistemicEngine('scout').threatBeliefs.has('apex'), 'World setup did not record scout belief');
assert(soft._agentOptInConfig.get('scholar').moralProfile === 'COLD_UTILITARIAN',
    'Registry did not record the raw moral profile of scholar');

soft.reset();

assert(soft.agents.size === 4, 'Soft reset did not keep the living roster');
assert(soft.getEpistemicEngine('scout') !== null, 'Soft reset did not rebuild scout\'s epistemic engine');
assert(soft.getEpistemicEngine('scout').threatBeliefs.size === 0,
    'Soft reset left scout carrying beliefs from the world it was reset out of');
assert(soft.getEpistemicEngine('scout').config.minBeliefConfidence === DEFAULT_EPISTEMIC_CONFIG.minBeliefConfidence,
    'Soft reset gave an agent with no epistemic config a non-default one');
assert(soft.getEpistemicEngine('scholar').config.minBeliefConfidence === 0.2,
    'Soft reset did not rebuild scholar\'s engine with its registered epistemic config');
assert(soft.moralDissonance.agents.size === 4, 'Soft reset did not re-register moral records for survivors');
assert(soft.getAgentMoralState('scout').guilt === 0, 'Soft reset left residual guilt on a survivor');
assert(soft.computeMoralDissonance('scholar', 'EXECUTE_DEFENSELESS', {}).netDissonance === preScholarScore,
    'Soft reset did not rebuild scholar\'s COLD_UTILITARIAN profile');
assert(soft.computeMoralDissonance('scout', 'EXECUTE_DEFENSELESS', {}).netDissonance === preScoutScore,
    'Soft reset did not rebuild scout\'s registered moral profile');
assert(soft.informationPropagation.rumors.size === 0, 'Soft reset left rumors from the previous world');
assert(soft.informationPropagation.listenEdges.size === 4, 'Soft reset did not rebuild the rumor roster');
for (const inbox of soft.informationPropagation.inboxes.values()) {
    assert(inbox.size === 0, 'Soft reset left a rumor inbox carrying previous-world deliveries');
}
assert(soft.packCoordination.packs.size === 1,
    'Soft reset dropped a pack whose members are all still alive');
assert(soft.packCoordination.packs.get('pack_beta').members.has('scout')
    && soft.packCoordination.packs.get('pack_beta').members.has('medic'),
    'Soft reset left the pack roster inconsistent with the living members');
assert(soft._agentOptInConfig.size === 4, 'Soft reset dropped registered opt-in configs for survivors');
console.log('  * Section B (soft reset rebuilds survivors empty, in shape): PASS');

// ---------------------------------------------------------------------------
// Section C: loadSnapshot restores live, empty, ghost-free services.
// ---------------------------------------------------------------------------
const origin = buildWorld(4244);
origin.recordEpistemicObservation('scout', { threats: [APEX] });
origin.injectRumor('MONSTER_SIGHTING', { threatId: 'apex', distance: 20 }, 'medic');
origin.recordMoralTransgression('scout', 'EXECUTE_DEFENSELESS', {});
origin.createPack('pack_gamma', {});
origin.registerPackMember('pack_gamma', 'scout');
origin.registerPackMember('pack_gamma', 'medic');
const snapshot = origin.saveSnapshot();

const restored = new RuntimeSimulation({ seed: 4244, ...OPT_INS });
const load = restored.loadSnapshot(snapshot);
assert(load.success === true, 'loadSnapshot refused a snapshot saved by the same build');
assert(restored.agents.size === 3, 'loadSnapshot did not restore the agent roster');
assert(restored.agentEpistemicEngines.size === 3,
    'loadSnapshot left restored agents without epistemic engines');
assert(restored.getEpistemicEngine('scout') !== null, 'Restored agent has no readable epistemic engine');
assert(restored.getEpistemicEngine('scout').threatBeliefs.size === 0,
    'loadSnapshot leaked a previous-world belief into a restored engine');
assert(restored.getEpistemicEngine('scout').config.minBeliefConfidence === DEFAULT_EPISTEMIC_CONFIG.minBeliefConfidence,
    'Restored engine did not take the construction-default epistemic config');
restored.recordEpistemicObservation('scout', { threats: [{ ...APEX, id: 'fresh_t1' }] });
assert(restored.getEpistemicEngine('scout').threatBeliefs.has('fresh_t1'),
    'Restored agent still refuses epistemic observations (UNKNOWN_AGENT regression)');
assert(!restored.getEpistemicEngine('scout').threatBeliefs.has('apex'),
    'A belief from the pre-save world survived into the restored service');
assert(restored.moralDissonance.agents.size === 3,
    'loadSnapshot left restored agents without moral records');
assert(restored.getAgentMoralState('scout').guilt === 0,
    'Restored agent inherited guilt from the pre-save world');
assert(restored.computeMoralDissonance('scout', 'EXECUTE_DEFENSELESS', {}).netDissonance
    === origin.computeMoralDissonance('scout', 'EXECUTE_DEFENSELESS', {}).netDissonance,
    'Restored agent did not receive the default moral profile');
assert(restored.informationPropagation.listenEdges.size === 3,
    'loadSnapshot did not rebuild the rumor roster for restored agents');
restored.injectRumor('MONSTER_SIGHTING', { threatId: 'fresh_t1', distance: 30 }, 'medic');
assert(restored.informationPropagation.rumors.size === 1,
    'Restored roster refused a rumor injection from a restored agent');
assert(restored.packCoordination.packs.size === 0,
    'loadSnapshot left packs describing the pre-save world (packs are not serialized)');
assert(restored._agentOptInConfig.size === 3,
    'loadSnapshot did not record the construction shapes its restored services were built from');
for (const entry of restored._agentOptInConfig.values()) {
    assert(entry.epistemicConfig === null && entry.moralProfile === DEFAULT_MORAL_PROFILES.HONORABLE_GUARDIAN,
        'A restored registry entry does not describe the service that was actually built');
}
const restoredDefaultScore = restored.computeMoralDissonance('scout', 'EXECUTE_DEFENSELESS', {}).netDissonance;
restored.reset();
assert(restored.getEpistemicEngine('scout').config.minBeliefConfidence === DEFAULT_EPISTEMIC_CONFIG.minBeliefConfidence,
    'A soft reset after a load did not rebuild restored engines in the recorded shape');
assert(restored.computeMoralDissonance('scout', 'EXECUTE_DEFENSELESS', {}).netDissonance === restoredDefaultScore,
    'A soft reset after a load did not rebuild restored moral profiles in the recorded shape');
console.log('  * Section C (loadSnapshot restores live empty services): PASS');

// ---------------------------------------------------------------------------
// Section D: The default path stays opt-out and stays byte-identical.
// ---------------------------------------------------------------------------
const off = new RuntimeSimulation({ seed: 4245 });
const on = new RuntimeSimulation({ seed: 4245, ...OPT_INS });
for (const sim of [off, on]) {
    sim.registerAgent('scout', { neuroticism: 0.4 }, { initial_position: { x: 0, y: 0, z: 0 } });
    sim.registerAgent('medic', { neuroticism: 0.6 }, { initial_position: { x: 4, y: 0, z: 0 } });
    for (let tick = 0; tick < 5; tick += 1) {
        sim.queueObservation('scout', { x: 0, y: 0, z: 0, threats: [APEX] });
        sim.queueObservation('medic', { x: 4, y: 0, z: 0, threats: [] });
        sim.tick(0.1);
    }
}
assert(off.informationPropagation === null && off.epistemicBelief === null
    && off.moralDissonance === null && off.packCoordination === null,
    'Default path constructed an opt-in service');
assert(JSON.stringify(off.saveSnapshot()) === JSON.stringify(on.saveSnapshot()),
    'Opt-in services grew or modified the persisted snapshot');
assert(!JSON.stringify(on.saveSnapshot()).includes('_agentOptInConfig'),
    'The per-agent opt-in registry leaked into the persisted snapshot');

off.reset();
on.reset();
assert(off.informationPropagation === null && off.epistemicBelief === null
    && off.moralDissonance === null && off.packCoordination === null,
    'reset() on a default-path instance constructed an opt-in service');
assert(JSON.stringify(off.saveSnapshot()) === JSON.stringify(on.saveSnapshot()),
    'Reset state differs between the default and opt-in paths');

off.reset({ clearAgents: true });
on.reset({ clearAgents: true });
assert(off.informationPropagation === null && off.epistemicBelief === null
    && off.moralDissonance === null && off.packCoordination === null,
    'Hard reset on a default-path instance constructed an opt-in service');
assert(JSON.stringify(off.saveSnapshot()) === JSON.stringify(on.saveSnapshot()),
    'Hard-reset state differs between the default and opt-in paths');
console.log('  * Section D (default path opt-out and byte-identical after resets): PASS');

// ---------------------------------------------------------------------------
// Section E: contradictionLog is bounded, newest kept, on both record paths.
// ---------------------------------------------------------------------------
const oracle = new EpistemicBeliefEngine('oracle');
assert(oracle.config.maxContradictionLogEntries === 250,
    'Default contradiction log cap is not the documented 250');

const pushVerify = (engine, index) => {
    const id = `rumor_${index}`;
    engine.threatBeliefs.set(id, {
        id,
        category: BELIEF_CATEGORIES.THREAT,
        data: { x: 0, y: 0, z: 0, distance: 5, intensity: 0.5, type: 'PREDATOR' },
        confidence: 0.5,
        provenance: EPISTEMIC_PROVENANCE.RUMOR,
        lastUpdatedTick: 0,
        sourceId: 'peer',
        hops: 1
    });
    engine.observeDirect({ threats: [{ id, x: 0, y: 0, z: 0, distance: 5, intensity: 0.5 }] });
};

for (let i = 0; i < 300; i += 1) pushVerify(oracle, i);
assert(oracle.contradictionLog.length === 250,
    `contradictionLog grew past its cap (length ${oracle.contradictionLog.length})`);
assert(oracle.contradictionLog[0].threatId === 'rumor_50',
    'contradictionLog trimmed the wrong end (newest should be kept)');
assert(oracle.contradictionLog[249].threatId === 'rumor_299',
    'contradictionLog does not end on the newest contradiction');
assert(oracle.contradictionLog.every((entry) => entry.type === 'RUMOR_VERIFIED_BY_OBSERVATION'),
    'Trimmed log carries unexpected record types');

const tiny = new EpistemicBeliefEngine('tiny_oracle', {}, { maxContradictionLogEntries: 3 });
for (let i = 0; i < 5; i += 1) pushVerify(tiny, i);
assert(tiny.contradictionLog.length === 3, 'Configured contradiction log cap is not respected');
assert(tiny.contradictionLog[0].threatId === 'rumor_2' && tiny.contradictionLog[2].threatId === 'rumor_4',
    'Configured cap kept the wrong contradiction records');

const disconfirmer = new EpistemicBeliefEngine('disconfirmer');
disconfirmer.threatBeliefs.set('ghost', {
    id: 'ghost',
    category: BELIEF_CATEGORIES.THREAT,
    data: { x: 0, y: 0, z: 0, distance: 5, intensity: 0.5, type: 'PREDATOR' },
    confidence: 0.5,
    provenance: EPISTEMIC_PROVENANCE.OBSERVED,
    lastUpdatedTick: 0,
    sourceId: 'SELF',
    hops: 0
});
disconfirmer.observeDirect({ agentX: 0, agentY: 0, clearZoneRadius: 10, threats: [] });
assert(disconfirmer.contradictionLog.length === 1
    && disconfirmer.contradictionLog[0].type === 'BELIEF_DISCONFIRMED_BY_CLEAR_SIGHT',
    'The clear-sight disconfirmation path does not record through the bounded log');
for (let i = 0; i < 3; i += 1) pushVerify(disconfirmer, i);
assert(disconfirmer.contradictionLog.length === 4,
    'Mixed-path contradictions are not counted against the shared cap');
console.log('  * Section E (bounded contradictionLog on both record paths): PASS');

// ---------------------------------------------------------------------------
// Section F: A named moral profile means one thing on every entry point.
// ---------------------------------------------------------------------------
const namer = new RuntimeSimulation({ seed: 4246, enableMoralDissonance: true });
namer.registerAgent('byRegistration', {}, { moralProfile: 'COLD_UTILITARIAN' });
namer.registerAgent('byWrapper', {});
namer.registerAgent('defaulted', {});
namer.registerAgentMoralProfile('byWrapper', 'COLD_UTILITARIAN');

assert(namer.getAgentMoralState('byRegistration').moralProfile === 'COLD_UTILITARIAN',
    'String profile at registration did not record the chosen name');
const byRegistrationScore = namer.computeMoralDissonance('byRegistration', 'EXECUTE_DEFENSELESS', {}).netDissonance;
const byWrapperScore = namer.computeMoralDissonance('byWrapper', 'EXECUTE_DEFENSELESS', {}).netDissonance;
const defaultedScore = namer.computeMoralDissonance('defaulted', 'EXECUTE_DEFENSELESS', {}).netDissonance;
assert(byRegistrationScore === byWrapperScore,
    'The same named profile scored differently at registration and through the public endpoint');
assert(byRegistrationScore !== defaultedScore,
    'A named profile collapsed onto the default, so the name was not really resolved');

const eng = new MoralDissonanceEngine({});
const fromName = eng.registerAgentMoralProfile('from_name', 'COLD_UTILITARIAN');
const fromObject = eng.registerAgentMoralProfile('from_object', DEFAULT_MORAL_PROFILES.COLD_UTILITARIAN);
assert(JSON.stringify(fromName.foundations) === JSON.stringify(fromObject.foundations),
    'Engine resolved a profile name to different foundations than the resolved object');
assertThrows(() => eng.registerAgentMoralProfile('typo', 'COLD_UTILITARAN'), /MORAL_PROFILE_UNKNOWN/,
    'Engine accepted a misspelled profile name');
assertThrows(() => eng.registerAgentMoralProfile('number', 42), /MORAL_PROFILE_INVALID/,
    'Engine accepted a non-object profile');
const partial = eng.registerAgentMoralProfile('partial', { CARE: 0.9 });
assert(Math.abs(partial.foundations.CARE - (0.9 / 1.7)) < 1e-9,
    'Partial custom object profile no longer normalizes against per-key fallbacks');
console.log('  * Section F (named profiles agree on every entry point): PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log(`SUCCESS: All ${assertions} opt-in engine lifecycle assertions passed.`);
console.log('============================================================');
