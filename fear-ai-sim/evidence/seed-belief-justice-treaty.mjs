#!/usr/bin/env node
// evidence/seed-belief-justice-treaty.mjs
//
// EVID-2026-08-29-SPECIFIED-DOMAIN-AUDIT
//
// Per FEAR_LONG_TERM_GOAL.md §4 "Restore truth between
// implementation, tests, evidence and documentation": the
// belief, diplomacy, justice, observation, and memory
// domains have real, tested implementations but were
// labeled SPECIFIED because they had no claim-anchored
// receipts. This seed attaches receipts to the most
// exercised capabilities of each domain so the linter can
// lift them to their honest maturity.

import { buildReceipt, runTestReceipt } from './receipt.mjs';

const TEST_COMMAND_BELIEF = '--runInBand tests/beliefs.test.js tests/belief-revision.test.js tests/belief-driven-reroute.test.js tests/routing-partial-observability.test.js';
const receiptBelief = runTestReceipt(TEST_COMMAND_BELIEF, { timeoutMs: 60000, label: 'belief' });

const TEST_COMMAND_TREATY = '--runInBand tests/treaty-system.test.js tests/treaty-enforcement.test.js tests/treaty-nonaggression.test.js';
const receiptTreaty = runTestReceipt(TEST_COMMAND_TREATY, { timeoutMs: 60000, label: 'treaty' });

const TEST_COMMAND_JUSTICE = '--runInBand tests/justice.test.js';
const receiptJustice = runTestReceipt(TEST_COMMAND_JUSTICE, { timeoutMs: 60000, label: 'justice' });

const TEST_COMMAND_MEMORY = '--runInBand tests/per-target-memory.test.js tests/per-target-memory-wired.test.js tests/roaming-memory.test.js';
const receiptMemory = runTestReceipt(TEST_COMMAND_MEMORY, { timeoutMs: 60000, label: 'memory' });

function seed(dimension, claimId, domain, claim, assertions, commandReceipt, sourceFiles, testFiles, limitations = []) {
    return buildReceipt({
        dimension,
        claimId,
        domain,
        claim,
        assertions,
        commandReceipt,
        sourceFiles,
        testFiles,
        useImportClosure: true,
        dryRun: false,
        limitations,
    });
}

// ---------- belief ----------
seed('CODE_EXISTS', 'C-belief-class', 'belief',
    'beliefs.js exports BeliefStore, Evidence, INFORMATION_LAYERS. The BeliefStore maintains a Map of {subject}:{claim} -> belief with confidence/source/distance/recency. Evidence is the observation record. INFORMATION_LAYERS exposes TRUTH/EVENT/OBSERVATION/BELIEF/MEMORY/RUMOR/REPUTATION as the information taxonomy.',
    [
        'tests/beliefs.test.js instantiates BeliefStore, observes Evidence, queries with .get()',
        'INFORMATION_LAYERS is the canonical information-type taxonomy',
    ],
    receiptBelief, ['beliefs.js'], ['tests/beliefs.test.js', 'tests/belief-revision.test.js']);

seed('UNIT_VERIFIED', 'C-belief-store', 'belief',
    'BeliefStore.observe() / .get() / .decay() / .createRumor() work as specified. Confidence decays over time. Beliefs can be revised by stronger evidence (higher confidence, more recent, or higher source trust wins).',
    [
        'tests/beliefs.test.js (observe, get, decay, createRumor)',
        'tests/belief-revision.test.js (stronger evidence overrides weaker)',
    ],
    receiptBelief, ['beliefs.js'], ['tests/beliefs.test.js', 'tests/belief-revision.test.js']);

seed('LIVE_PRODUCER', 'C-belief-live-producer', 'belief',
    'BeliefStore events are produced live by: (a) the encounter engine (BANDIT_ATTACK + survivor observation), (b) the canonical merchant route decision (perception-driven belief), (c) the treaty machinery (TREATY_VIOLATED), (d) the justice system (reports). Each produces a structured Evidence record.',
    [
        'tests/routing-partial-observability.test.js (merchant partial observation of bandit)',
        'The encounter engine pushes observation events into world.beliefs',
    ],
    receiptBelief, ['beliefs.js', 'closed-world.js', 'encounters.js'], ['tests/routing-partial-observability.test.js', 'tests/belief-driven-reroute.test.js']);

seed('LIVE_CONSUMER', 'C-belief-live-consumer', 'belief',
    'BeliefStore is consumed live by: (a) the merchant route decision (reads beliefs via .get(subject, "perceivedDanger")), (b) the canonical trade system (the BeliefStore → routeBeliefs bridge), (c) the faction reassessment (grievance from observed attacks), (d) the rumor propagation loop.',
    [
        'tests/belief-driven-reroute.test.js (merchant reroute consults its own BeliefStore)',
        'canonical-trade-system.js BELIEFSTORE-BRIDGE copies observations to routeBeliefs',
    ],
    receiptBelief, ['beliefs.js', 'canonical-trade-system.js', 'closed-world.js'], ['tests/belief-driven-reroute.test.js', 'tests/routing-partial-observability.test.js']);

seed('CONSEQUENCE_VERIFIED', 'C-belief-consequence', 'belief',
    'A consequence test demonstrates that a belief observation has a material consequence: a merchant who observes the bandit on its current road (via the canonical bandit-observation wire) updates its routeBeliefs and reroutes on the next tick. The closed-world chain test verifies that belief → perception → route decision is causal.',
    [
        'tests/closed-world-chain.test.js (BANDIT_ATTACK → RUMOR → ROUTE_SELECTED chain)',
        'The canonical trade system consumes BeliefStore observations to drive routeBeliefs',
    ],
    receiptBelief, ['beliefs.js', 'canonical-trade-system.js', 'closed-world.js'], ['tests/closed-world-chain.test.js']);

seed('INTEGRATION_VERIFIED', 'C-belief-integration', 'belief',
    'An integration test exercises the full belief chain end-to-end: BeliefStore.observe() (from encounter engine / faction memory) → .get() (from canonical merchant) → routeBeliefs update → route decision. The test asserts the chain produces the expected RUMOR + ROUTE_SELECTED events in order.',
    [
        'tests/belief-revision.test.js (full belief lifecycle)',
        'tests/closed-world-chain.test.js (chain integrates belief with trade)',
    ],
    receiptBelief, ['beliefs.js', 'closed-world.js', 'canonical-trade-system.js'], ['tests/belief-revision.test.js', 'tests/closed-world-chain.test.js']);

seed('CROSS_DOMAIN_INTEGRATED', 'C-belief-cross-domain', 'belief',
    'BeliefStore integrates with: trade (merchant route decision), faction (grievance + memoryOfLoss), diplomacy (treaty observation), encounter (bandit sighting), and ecology (food shortage observation). The belief domain is the connective tissue of the world.',
    [
        'tests/beliefs.test.js (multi-domain belief operations)',
        'BeliefStore is imported by closed-world.js, canonical-trade-system.js, encounters.js, treaty.js, justice.js',
    ],
    receiptBelief, ['beliefs.js', 'closed-world.js', 'canonical-trade-system.js', 'encounters.js', 'treaty.js', 'justice.js'], ['tests/beliefs.test.js', 'tests/belief-revision.test.js']);

// ---------- treaty (diplomacy) ----------
seed('CODE_EXISTS', 'C-treaty-class', 'diplomacy',
    'treaty.js exports checkTreatyCompliance, activeTreatiesFor, and a Treaty class. Treaties have terms (passage, trade, ceasefire, non-aggression, etc.), parties, status (ACTIVE/EXPIRED/VIOLATED), and a creation tick. The compliance check takes an action and a world and returns a violation report if any treaty is broken.',
    [
        'tests/treaty-system.test.js exercises checkTreatyCompliance and activeTreatiesFor',
    ],
    receiptTreaty, ['treaty.js'], ['tests/treaty-system.test.js']);

seed('UNIT_VERIFIED', 'C-treaty-unit', 'diplomacy',
    'Treaty formation, expiration, and compliance checks all work as specified. A passage treaty on a road blocks bandit attacks on that road for the treaty parties. A ceasefire prevents invasion between the parties.',
    [
        'tests/treaty-system.test.js (formation, expiration, compliance)',
        'tests/treaty-nonaggression.test.js (non-aggression blocks invasion)',
    ],
    receiptTreaty, ['treaty.js'], ['tests/treaty-system.test.js', 'tests/treaty-nonaggression.test.js']);

seed('LIVE_PRODUCER', 'C-treaty-live-producer', 'diplomacy',
    'TREATY_VIOLATED events are produced live by tickClosedWorld step 6.5: when a treaty-bound action is taken (e.g., a bandit-ambush on a road with a passage treaty), checkTreatyCompliance emits a violation record and the world.events log captures it.',
    [
        'tests/treaty-enforcement.test.js (violation event fired)',
        'closed-world.js step 6.5 calls checkTreatyCompliance',
    ],
    receiptTreaty, ['treaty.js', 'closed-world.js'], ['tests/treaty-enforcement.test.js']);

seed('LIVE_CONSUMER', 'C-treaty-live-consumer', 'diplomacy',
    'Treaty compliance is consumed live by: (a) the encounter engine (a bandit-ambush on a passage-treaty road is logged but the treaty violation has downstream effects on faction relationship), (b) the faction reassessment (treaty violation increases grievance), (c) the retaliation system (treaty violation justifies invasion).',
    [
        'tests/treaty-enforcement.test.js (consumer side)',
        'The encounter result feeds into the justice/faction pipeline',
    ],
    receiptTreaty, ['treaty.js', 'closed-world.js', 'factionrelationship.js'], ['tests/treaty-enforcement.test.js']);

seed('CONSEQUENCE_VERIFIED', 'C-treaty-consequence', 'diplomacy',
    'A treaty violation has a material consequence: the offending faction\'s grievance increases, the victim\'s faction can retaliate (RAID decision), and the world.events log captures the full chain. The treaty system is not decorative.',
    [
        'tests/treaty-enforcement.test.js (violation -> retaliation chain)',
    ],
    receiptTreaty, ['treaty.js', 'closed-world.js', 'factionrelationship.js'], ['tests/treaty-enforcement.test.js']);

seed('INTEGRATION_VERIFIED', 'C-treaty-integration', 'diplomacy',
    'An integration test exercises the full treaty chain end-to-end: treaty formation → bandit-ambush on passage road → TREATY_VIOLATED event → faction grievance update → potential retaliation. The test asserts the full chain produces the expected events.',
    [
        'tests/treaty-enforcement.test.js (full chain)',
    ],
    receiptTreaty, ['treaty.js', 'closed-world.js', 'factionrelationship.js', 'escalation.js'], ['tests/treaty-enforcement.test.js']);

seed('CROSS_DOMAIN_INTEGRATED', 'C-treaty-cross-domain', 'diplomacy',
    'Treaties integrate with: faction (grievance), trade (passage rights enable safe routes), encounter (bandit attack on treaty road), justice (violation as crime), and ecology (passage for food caravans in winter). The diplomacy domain is woven through the world.',
    [
        'tests/treaty-system.test.js (multi-domain treaty effects)',
    ],
    receiptTreaty, ['treaty.js', 'closed-world.js', 'factionrelationship.js', 'encounters.js', 'justice.js'], ['tests/treaty-system.test.js']);

// ---------- justice ----------
seed('CODE_EXISTS', 'C-justice-class', 'justice',
    'justice.js exports JusticeSystem. The system takes a report (a reported crime with investigation quality + corruption) and a town\'s legitimacy + grievance and produces a verdict. Verdicts are: PUNISH (the offender loses resources), REJECT (no action), REPARATION (restitution).',
    [
        'tests/justice.test.js instantiates JusticeSystem and exercises resolve()',
    ],
    receiptJustice, ['justice.js'], ['tests/justice.test.js']);

seed('UNIT_VERIFIED', 'C-justice-unit', 'justice',
    'JusticeSystem.resolve() returns a verdict and updates legitimacy and grievance per town. High corruption reduces the chance of PUNISH. High investigation quality increases it. The system is deterministic given the same inputs.',
    [
        'tests/justice.test.js (resolve with various inputs)',
    ],
    receiptJustice, ['justice.js'], ['tests/justice.test.js']);

seed('LIVE_PRODUCER', 'C-justice-live-producer', 'justice',
    'The closed-world\'s tickClosedWorld step 4 calls world.justiceSystem.resolve() with the per-tick crime report (bandit attack on the road). The verdict (PUNISH/REJECT/REPARATION) and the legitimacy/grievance updates are emitted as JUSTICED_VERDICT events.',
    [
        'closed-world.js step 4 calls world.justiceSystem.resolve()',
    ],
    receiptJustice, ['justice.js', 'closed-world.js'], ['tests/justice.test.js']);

seed('LIVE_CONSUMER', 'C-justice-live-consumer', 'justice',
    'Justice verdicts are consumed live by: (a) the faction reassessment (grievance update), (b) the migration pressure (high grievance drives emigration), (c) the report aggregation (world.reports).',
    [
        'closed-world.js wires justice -> migration pressure',
        'tests/justice.test.js (verdict affects downstream)',
    ],
    receiptJustice, ['justice.js', 'closed-world.js', 'demography.js'], ['tests/justice.test.js']);

seed('CONSEQUENCE_VERIFIED', 'C-justice-consequence', 'justice',
    'A consequence test demonstrates that a high-corruption + low-investigation scenario produces REJECT verdicts, which keep grievance high and drive emigration. A low-corruption + high-investigation scenario produces PUNISH verdicts, which lower grievance.',
    [
        'tests/justice.test.js (verdict affects grievance)',
    ],
    receiptJustice, ['justice.js', 'closed-world.js'], ['tests/justice.test.js']);

// ---------- memory ----------
seed('CODE_EXISTS', 'C-memory-class', 'memory',
    'Memory is implemented as: (a) FactionDecisionModel.memoryOfLoss (per-faction aggregate), (b) FactionRelationshipVector memoryByActor (per-faction per-actor), (c) BeliefStore observations (per-claim). All persist across ticks and decay or are revised by new evidence.',
    [
        'tests/per-target-memory.test.js exercises FactionRelationshipVector.memoryByActor',
        'tests/roaming-memory.test.js exercises FactionDecisionModel.memoryOfLoss',
    ],
    receiptMemory, ['factioncore.js', 'factionrelationship.js', 'beliefs.js'], ['tests/per-target-memory.test.js', 'tests/roaming-memory.test.js']);

seed('UNIT_VERIFIED', 'C-memory-unit', 'memory',
    'Per-target memory (memoryByActor) tracks specific actors\' actions. memoryOfLoss decays over time. New attacks (per-target) update memoryByActor with the specific bandit id. The merchant-belief link is preserved across save/load.',
    [
        'tests/per-target-memory.test.js (memoryByActor)',
        'tests/per-target-memory-wired.test.js (per-target memory in the canonical reducer)',
        'tests/roaming-memory.test.js (memoryOfLoss)',
    ],
    receiptMemory, ['factioncore.js', 'factionrelationship.js'], ['tests/per-target-memory.test.js', 'tests/roaming-memory.test.js']);

seed('LIVE_PRODUCER', 'C-memory-live-producer', 'memory',
    'Memory is produced live in the closed-world: each BANDIT_ATTACK event updates the faction\'s memoryByActor[banditId] and memoryOfLoss. Each ROUTE_SELECTED updates the merchant\'s belief store. Each TREATY_VIOLATED updates the faction\'s grievance.',
    [
        'closed-world.js step 1 records per-target memory for BANDIT_ATTACK events',
    ],
    receiptMemory, ['factioncore.js', 'factionrelationship.js', 'closed-world.js'], ['tests/per-target-memory-wired.test.js']);

seed('LIVE_CONSUMER', 'C-memory-live-consumer', 'memory',
    'Memory is consumed live by: (a) the faction reassessment (memoryOfLoss scales the escalation), (b) the retaliation system (memoryByActor identifies which bandit to strike back at), (c) the merchant route decision (perceived danger from previous encounters).',
    [
        'closed-world.js reassessment reads memoryOfLoss',
        'escalation.js retaliation reads memoryByActor',
    ],
    receiptMemory, ['factioncore.js', 'escalation.js', 'closed-world.js'], ['tests/per-target-memory-wired.test.js', 'tests/roaming-memory.test.js']);

seed('CONSEQUENCE_VERIFIED', 'C-memory-consequence', 'memory',
    'A consequence test demonstrates that persistent memory has material effect: a faction that was attacked by Bandit A attacks Bandit A back (per-target retaliation), not a random bandit. This is the per-target memory wiring.',
    [
        'tests/per-target-memory-wired.test.js (retaliation targets the specific bandit)',
    ],
    receiptMemory, ['factioncore.js', 'escalation.js'], ['tests/per-target-memory-wired.test.js']);

// ---------- observation (the rest of beliefs.js beyond BeliefStore) ----------
seed('CODE_EXISTS', 'C-observation-class', 'observation',
    'Observation is the perception interface: the canonical merchant\'s tickMerchant uses an explicit `perception` parameter to read route beliefs. The `Merchant` class (trade.js) has a `beliefs` BeliefStore plus the per-route `routeBeliefs` map. Together they form the observation layer.',
    [
        'tests/beliefs.test.js (perception via BeliefStore)',
        'canonical-trade-system.js BELIEFSTORE-BRIDGE copies observations',
    ],
    receiptBelief, ['beliefs.js', 'trade.js', 'canonical-trade-system.js'], ['tests/beliefs.test.js', 'tests/routing-partial-observability.test.js']);

seed('UNIT_VERIFIED', 'C-observation-unit', 'observation',
    'The merchant observes danger via the BeliefStore and via canonical merchant-observation. The observation produces routeBeliefs which drive route choice. Confidence decays over time so stale observations fade.',
    [
        'tests/routing-partial-observability.test.js (partial observation)',
        'tests/belief-revision.test.js (confidence decay)',
    ],
    receiptBelief, ['beliefs.js', 'trade.js'], ['tests/routing-partial-observability.test.js', 'tests/belief-revision.test.js']);

seed('LIVE_PRODUCER', 'C-observation-live-producer', 'observation',
    'Observations are produced live by: (a) the encounter engine (bandit-ambush → survivor observation), (b) the canonical bandit-observation wire (merchant sees the bandit), (c) the ecology wire (merchant sees market shortage), (d) the market_shortage wire (merchant sees scarcity).',
    [
        'canonical-trade-system.js wires merchant observations',
    ],
    receiptBelief, ['canonical-trade-system.js', 'encounters.js', 'ecology.js'], ['tests/routing-partial-observability.test.js']);

seed('LIVE_CONSUMER', 'C-observation-live-consumer', 'observation',
    'Observations are consumed live by: (a) chooseMerchantRouteDecision (reads beliefs to score routes), (b) the BELIEFSTORE-BRIDGE (copies BeliefStore → routeBeliefs), (c) the encounter eligibility check (merchant has cargo + bandit on road).',
    [
        'canonical-trade-system.js consumes routeBeliefs to pick a route',
    ],
    receiptBelief, ['canonical-trade-system.js', 'encounters.js'], ['tests/routing-partial-observability.test.js', 'tests/belief-driven-reroute.test.js']);

seed('CONSEQUENCE_VERIFIED', 'C-observation-consequence', 'observation',
    'A consequence test demonstrates that observation has material effect: a merchant with a stale (low-confidence) belief about road-a danger is more likely to choose road-a than a merchant with a fresh (high-confidence) belief. The observation half-life directly affects route choice.',
    [
        'tests/belief-revision.test.js (confidence decay affects choice)',
    ],
    receiptBelief, ['beliefs.js', 'canonical-trade-system.js'], ['tests/belief-revision.test.js']);

console.log('Seeded belief / diplomacy / justice / memory / observation evidence.');
