#!/usr/bin/env node

/**
 * verify_faction_governance_optin.mjs — the §3 promotion for Faction Governance System.
 *
 * `FactionGovernanceSystem` moves from `RELEASE_SURFACE.md` §2 (out of scope) to §1 (in scope)
 * as an opt-in collective faction governance and deliberation service. That policy requires
 * four things, and this probe carries conditions 2, 3 and 4 of them:
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
 *   and identical RNG state draws on default ticks without faction deliberation;
 * - All 5 governance archetypes (AUTOCRATIC_DESPOT, MERCHANT_OLIGARCHY, MILITARY_JUNTA,
 *   TRIBAL_CONSENSUS, ECCLESIASTICAL_DEVOUT) deliberate incidents with deterministic outputs;
 * - Opt-in succession aftermath and cohesion fractures step high-commitment directives down;
 * - The service is strictly ADVISORY: it emits non-binding semantic diplomatic directives
 *   without mutating host transforms, physics, or entity state.
 */

import { RuntimeSimulation } from '../../packages/runtime/src/RuntimeSimulation.js';
import {
    FactionGovernanceSystem,
    GOVERNANCE_ARCHETYPES,
    FACTION_DIRECTIVES,
    governanceComposure
} from '../../packages/core/src/FactionGovernanceSystem.js';

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
console.log('VERIFY FACTION GOVERNANCE OPT-IN SERVICE');
console.log('============================================================');

// ---------------------------------------------------------------------------
// Shared scenario for default-path comparison
// ---------------------------------------------------------------------------
const AGENTS = [
    ['envoy', { neuroticism: 0.3, resilience: 0.7, agreeableness: 0.8 }, 0],
    ['warlord', { neuroticism: 0.4, resilience: 0.9, leadership: 0.9 }, 5],
    ['merchant', { neuroticism: 0.5, resilience: 0.5, agreeableness: 0.6 }, 10]
];

function runFull(options) {
    const sim = new RuntimeSimulation(options);
    for (const [id, traits, x] of AGENTS) {
        sim.registerAgent(id, traits, { initial_position: { x, y: 0, z: 0 } });
    }
    const outputs = [];
    for (let tick = 0; tick < 20; tick += 1) {
        sim.queueObservation('envoy', {
            x: 0, y: 0, z: 0,
            threats: [{ id: 'border-scout', type: 'PREDATOR', distance: 8.0, intensity: 0.4 }]
        });
        sim.queueObservation('warlord', { x: 5, y: 0, z: 0, threats: [] });
        sim.queueObservation('merchant', { x: 10, y: 0, z: 0, threats: [] });
        outputs.push(JSON.stringify(sim.tick(0.1)));
    }
    return { sim, outputs, snapshot: JSON.stringify(sim.saveSnapshot()) };
}

// ---------------------------------------------------------------------------
// Section A: Default path is untouched and the flag is genuinely opt-in.
// ---------------------------------------------------------------------------
console.log('--- Section A: Default path immutability & Opt-in boundary ---');
const absent = runFull({ seed: 4421 });
const explicitOff = runFull({ seed: 4421, enableFactionGovernance: false });
const explicitOn = runFull({ seed: 4421, enableFactionGovernance: true });

assert(absent.sim.factionGovernance === null, 'Default simulation instantiated factionGovernance');
assert(absent.sim.enableFactionGovernance === false, 'Default simulation enableFactionGovernance is not false');
assert(explicitOff.sim.factionGovernance === null, 'Explicit false simulation instantiated factionGovernance');
assert(explicitOff.sim.enableFactionGovernance === false, 'Explicit false simulation enableFactionGovernance is not false');
assert(explicitOn.sim.factionGovernance instanceof Map, 'Opt-in simulation failed to instantiate factionGovernance');
assert(explicitOn.sim.enableFactionGovernance === true, 'Opt-in simulation enableFactionGovernance is not true');

// Byte-for-byte identical outputs across 20 ticks
for (let i = 0; i < 20; i++) {
    assert(absent.outputs[i] === explicitOff.outputs[i], `Output divergence at tick ${i} between absent and explicit false`);
    assert(absent.outputs[i] === explicitOn.outputs[i], `Output divergence at tick ${i} between absent and explicit true`);
}

// Snapshots and RNG state draws byte-for-byte identical
assert(absent.snapshot === explicitOff.snapshot, 'Snapshots diverge between absent and explicit false');
assert(absent.snapshot === explicitOn.snapshot, 'Snapshots diverge between absent and explicit true');
assert(JSON.stringify(absent.sim.rng.getState()) === JSON.stringify(explicitOff.sim.rng.getState()), 'RNG state diverged between absent and explicit false');
assert(JSON.stringify(absent.sim.rng.getState()) === JSON.stringify(explicitOn.sim.rng.getState()), 'RNG state diverged between absent and explicit true');
console.log('  * Default path outputs, snapshots, and RNG state completely unperturbed: PASS');

// ---------------------------------------------------------------------------
// Section B: Operational verification of all 5 Governance Archetypes
// ---------------------------------------------------------------------------
console.log('--- Section B: Operational verification of all 5 archetypes ---');

const sim = new RuntimeSimulation({ seed: 4421, enableFactionGovernance: true });

// 1. AUTOCRATIC DESPOT
const despot = sim.registerFaction('fac_despot', GOVERNANCE_ARCHETYPES.AUTOCRATIC_DESPOT, {
    leader: { fear: 0.1, anger: 0.8, bravery: 0.8, neuroticism: 0.3 }
});
assert(sim.getFactionGovernance('fac_despot') === despot, 'getFactionGovernance returned unexpected instance');

// Enraged despot attacks when power ratio is favorable
const attackResult = sim.deliberateFactionIncident('fac_despot', {
    type: 'RAID_OUTPOST',
    severity: 0.8,
    targetFactionId: 'fac_rival'
}, { powerRatio: 1.2 });
assert(attackResult.directive === FACTION_DIRECTIVES.ATTACK, `Expected ATTACK, got ${attackResult.directive}`);
assert(attackResult.isHostAuthoritative === true, 'deliberation result isHostAuthoritative must be true');
assert(attackResult.grievanceLevel > 0, 'grievance level must accumulate');

// Terrified despot retreats when threatened with poor power ratio
const terrifiedDespot = sim.registerFaction('fac_coward', GOVERNANCE_ARCHETYPES.AUTOCRATIC_DESPOT, {
    leader: { fear: 0.9, anger: 0.1, bravery: 0.2, neuroticism: 0.8 }
});
const retreatResult = sim.deliberateFactionIncident('fac_coward', {
    type: 'ARMY_APPROACHING',
    severity: 0.9,
    targetFactionId: 'fac_enemy'
}, { powerRatio: 0.2 });
assert(retreatResult.directive === FACTION_DIRECTIVES.RETREAT, `Expected RETREAT, got ${retreatResult.directive}`);

// Despot interregnum: headless autocracy falls back to OBSERVE
const headlessResult = sim.deliberateFactionIncident('fac_despot', {
    type: 'BORDER_CLASH',
    severity: 0.7,
    targetFactionId: 'fac_rival'
}, { leaderVacant: true });
assert(headlessResult.directive === FACTION_DIRECTIVES.OBSERVE, `Expected OBSERVE for headless autocracy, got ${headlessResult.directive}`);
assert(headlessResult.rationale.includes('Headless autocracy cannot will'), 'Rationale must cite headless interregnum');

// 2. MERCHANT OLIGARCHY
const merchants = sim.registerFaction('fac_merchants', GOVERNANCE_ARCHETYPES.MERCHANT_OLIGARCHY, {
    resources: 0.8,
    tradeDependence: 0.9
});

// Profitable trade corridor favors negotiation
const tradeResult = sim.deliberateFactionIncident('fac_merchants', {
    type: 'TARIFF_DISPUTE',
    severity: 0.5,
    targetFactionId: 'fac_ports'
}, { tradeVolume: 50, powerRatio: 0.9 });
assert(tradeResult.directive === FACTION_DIRECTIVES.NEGOTIATE, `Expected NEGOTIATE, got ${tradeResult.directive}`);
assert(tradeResult.voteBreakdown !== null, 'Merchant oligarchy must include vote breakdown');

// High severity incident with ample resources leads to paying tribute/bribe
const tributeResult = sim.deliberateFactionIncident('fac_merchants', {
    type: 'CARAVAN_EXTORTION',
    severity: 0.7,
    targetFactionId: 'fac_raiders'
}, { tradeVolume: 10, powerRatio: 0.8 });
assert(tributeResult.directive === FACTION_DIRECTIVES.PAY_TRIBUTE, `Expected PAY_TRIBUTE, got ${tributeResult.directive}`);

// Severe threat with overwhelming power ratio leads to mobilizing security forces
const merchantMobilizeResult = sim.deliberateFactionIncident('fac_merchants', {
    type: 'HARBOR_BLOCKADE',
    severity: 0.85,
    targetFactionId: 'fac_pirates'
}, { tradeVolume: 5, powerRatio: 1.5 });
assert(merchantMobilizeResult.directive === FACTION_DIRECTIVES.MOBILIZE, `Expected MOBILIZE, got ${merchantMobilizeResult.directive}`);

// 3. MILITARY JUNTA
const junta = sim.registerFaction('fac_junta', GOVERNANCE_ARCHETYPES.MILITARY_JUNTA, {
    militaryReadiness: 0.9
});

// Favorable martial supremacy ratio leads to ATTACK
const juntaAttackResult = sim.deliberateFactionIncident('fac_junta', {
    type: 'INCURSION',
    severity: 0.6,
    targetFactionId: 'fac_foes'
}, { powerRatio: 1.4 });
assert(juntaAttackResult.directive === FACTION_DIRECTIVES.ATTACK, `Expected ATTACK, got ${juntaAttackResult.directive}`);

// Broken readiness forces tactical retreat
const brokenJunta = sim.registerFaction('fac_broken_junta', GOVERNANCE_ARCHETYPES.MILITARY_JUNTA, {
    militaryReadiness: 0.15
});
const juntaRetreatResult = sim.deliberateFactionIncident('fac_broken_junta', {
    type: 'INCURSION',
    severity: 0.5,
    targetFactionId: 'fac_foes'
}, { powerRatio: 1.0 });
assert(juntaRetreatResult.directive === FACTION_DIRECTIVES.RETREAT, `Expected RETREAT for shattered readiness, got ${juntaRetreatResult.directive}`);

// 4. TRIBAL CONSENSUS
const clan = sim.registerFaction('fac_clan', GOVERNANCE_ARCHETYPES.TRIBAL_CONSENSUS, {
    consensusThreshold: 2 / 3
});

// Minor incident fails to achieve supermajority (blocked -> WARN)
const clanBlockedResult = sim.deliberateFactionIncident('fac_clan', {
    type: 'CATTLE_THEFT',
    severity: 0.2,
    targetFactionId: 'fac_neighbors'
}, { powerRatio: 1.0 });
assert(clanBlockedResult.directive === FACTION_DIRECTIVES.WARN, `Expected WARN for blocked consensus, got ${clanBlockedResult.directive}`);
assert(clanBlockedResult.voteBreakdown.ratio < clanBlockedResult.voteBreakdown.threshold, 'Vote ratio must be under threshold');

// Major incident achieves supermajority -> MOBILIZE
const clanEscalateResult = sim.deliberateFactionIncident('fac_clan', {
    type: 'VILLAGE_RAID',
    severity: 0.95,
    targetFactionId: 'fac_neighbors'
}, { powerRatio: 1.2 });
assert(clanEscalateResult.directive === FACTION_DIRECTIVES.MOBILIZE, `Expected MOBILIZE on supermajority, got ${clanEscalateResult.directive}`);
assert(clanEscalateResult.voteBreakdown.ratio >= clanEscalateResult.voteBreakdown.threshold, 'Vote ratio must meet or exceed threshold');

// 5. ECCLESIASTICAL DEVOUT
const church = sim.registerFaction('fac_church', GOVERNANCE_ARCHETYPES.ECCLESIASTICAL_DEVOUT);

// Sanctuary desecration triggers immediate holy crusade (ATTACK)
const holyWarResult = sim.deliberateFactionIncident('fac_church', {
    type: 'SANCTUARY_DESECRATED',
    severity: 0.5,
    targetFactionId: 'fac_heretics'
});
assert(holyWarResult.directive === FACTION_DIRECTIVES.ATTACK, `Expected ATTACK for sanctuary desecration, got ${holyWarResult.directive}`);

// Minor secular incident leads to prayer/OBSERVE
const churchObserveResult = sim.deliberateFactionIncident('fac_church', {
    type: 'BORDER_TRESPASS',
    severity: 0.3,
    targetFactionId: 'fac_neighbors'
});
assert(churchObserveResult.directive === FACTION_DIRECTIVES.OBSERVE, `Expected OBSERVE for minor incident, got ${churchObserveResult.directive}`);

// Directives map verification
const allDirectives = sim.getAllFactionDirectives();
assert(typeof allDirectives === 'object', 'getAllFactionDirectives must return an object map');
assert(allDirectives.fac_church === FACTION_DIRECTIVES.OBSERVE, 'Directives map must record current church directive');
assert(sim.getAllFactionGovernances().length >= 5, 'getAllFactionGovernances must list all registered factions');
console.log('  * All 5 governance archetypes and council deliberation mechanics verified: PASS');

// ---------------------------------------------------------------------------
// Section C: Composure Scaling and Fractured Step-Down (R15 / R21 / R29)
// ---------------------------------------------------------------------------
console.log('--- Section C: Composure scaling & fractured step-down ---');

// Pure function governanceComposure
const wholeComposure = sim.getFactionComposure('fac_clan', { splinterRisk: 0.1, cohesion: 0.9 });
assert(wholeComposure.scale === 1.0 && wholeComposure.fractured === false, 'Whole governance composure must be scale 1.0, not fractured');

const fracturedComposure = sim.getFactionComposure('fac_clan', { splinterRisk: 0.6, cohesion: 0.8 });
assert(fracturedComposure.scale === 0.5 && fracturedComposure.fractured === true, 'Fractured governance composure must be scale 0.5, fractured');

const vacantAutocratComposure = sim.getFactionComposure('fac_despot', { leaderVacant: true });
assert(vacantAutocratComposure.scale === 0.25 && vacantAutocratComposure.fractured === true, 'Vacant autocrat composure must be scale 0.25, fractured');

// High-commitment directive stepped down when fractured
// Junta with overwhelming ratio would normally order ATTACK; fractured council steps down to MOBILIZE
const fracturedJuntaResult = sim.deliberateFactionIncident('fac_junta', {
    type: 'INCURSION',
    severity: 0.8,
    targetFactionId: 'fac_foes'
}, { powerRatio: 1.5, splinterRisk: 0.7, cohesion: 0.2 });
assert(fracturedJuntaResult.directive === FACTION_DIRECTIVES.MOBILIZE, `Expected stepped down MOBILIZE, got ${fracturedJuntaResult.directive}`);
assert(fracturedJuntaResult.steppedDown === true, 'steppedDown flag must be true');

// Consecutive deliberation without fractured context does not leak steppedDown state
const recoveredJuntaResult = sim.deliberateFactionIncident('fac_junta', {
    type: 'INCURSION',
    severity: 0.8,
    targetFactionId: 'fac_foes'
}, { powerRatio: 1.5, splinterRisk: 0.0, cohesion: 1.0 });
assert(recoveredJuntaResult.directive === FACTION_DIRECTIVES.ATTACK, `Expected restored ATTACK, got ${recoveredJuntaResult.directive}`);
assert(recoveredJuntaResult.steppedDown === false, 'steppedDown flag must reset to false on whole council');
console.log('  * Composure scaling and isolated fractured step-down verified: PASS');

// ---------------------------------------------------------------------------
// Section D: Refusal guarantees when disabled
// ---------------------------------------------------------------------------
console.log('--- Section D: Refusal guarantees when disabled ---');

const disabledSim = new RuntimeSimulation({ seed: 4421, enableFactionGovernance: false });

assertThrows(() => disabledSim.registerFaction('fac_test'),
    /FACTION_GOVERNANCE_DISABLED/,
    'registerFaction when disabled');

assertThrows(() => disabledSim.deliberateFactionIncident('fac_test', { type: 'RAID' }),
    /FACTION_GOVERNANCE_DISABLED/,
    'deliberateFactionIncident when disabled');

assertThrows(() => disabledSim.getFactionComposure('fac_test'),
    /FACTION_GOVERNANCE_DISABLED/,
    'getFactionComposure when disabled');

assert(disabledSim.getFactionGovernance('fac_test') === null, 'getFactionGovernance when disabled must return null');
assert(disabledSim.getAllFactionGovernances().length === 0, 'getAllFactionGovernances when disabled must return empty array');
assert(Object.keys(disabledSim.getAllFactionDirectives()).length === 0, 'getAllFactionDirectives when disabled must return empty object');

// Unknown faction in enabled simulation throws UNKNOWN_FACTION
assertThrows(() => sim.deliberateFactionIncident('fac_nonexistent', { type: 'RAID' }),
    /UNKNOWN_FACTION/,
    'deliberateFactionIncident on unknown faction');

assertThrows(() => sim.getFactionComposure('fac_nonexistent'),
    /UNKNOWN_FACTION/,
    'getFactionComposure on unknown faction');
console.log('  * Refusal contracts and error signatures verified: PASS');

// ---------------------------------------------------------------------------
// Section E: Host Game Authority & Immutability Audit
// ---------------------------------------------------------------------------
console.log('--- Section E: Host Game Authority & Immutability Audit ---');

const mockHostEntity = {
    id: 'host_actor_42',
    transform: { x: 12.5, y: 0.0, z: -45.2, rotation: 180.0 },
    physics: { velocity: [0.0, 0.0, 0.0], mass: 75.0, grounded: true },
    combat: { hp: 100.0, maxHp: 100.0, armor: 25.0 },
    inventory: ['iron_sword', 'health_potion', 'gold_coins_50']
};

const hostAudit = sim.auditFactionGovernanceImmutability(mockHostEntity);
assert(hostAudit.intact === true, 'Host entity was modified during immutability audit');
assert(hostAudit.physicsMutations === 0, 'Host physics mutations detected');
assert(hostAudit.transformMutations === 0, 'Host transform mutations detected');
assert(hostAudit.factionGovernanceClean === true, 'Faction governance clean flag false');

// Deliberation produces advisory results with isHostAuthoritative: true
const finalResult = sim.deliberateFactionIncident('fac_despot', {
    type: 'DIPLOMATIC_ENVOY',
    severity: 0.1,
    targetFactionId: 'fac_peaceful'
});
assert(finalResult.isHostAuthoritative === true, 'Final deliberation must assert host authority');
assert(typeof finalResult.directive === 'string', 'Directive must be string enum');
assert(typeof finalResult.rationale === 'string', 'Rationale must be descriptive string');
console.log('  * Host authority invariant and zero-mutation audit verified: PASS');

console.log('============================================================');
console.log(`All ${assertions} Faction Governance opt-in assertions PASSED.`);
console.log('============================================================');
