#!/usr/bin/env node
/**
 * tools/verification/verify_trade_chain_causal_edges.mjs — the closed-world
 * causal chain, proven against the production reducer itself.
 *
 * Why this probe exists: Guardian V3 §1 item #2 flagged the retired
 * closed-world-chain Jest test for weakening "ordered causal sequence" down
 * to membership (toContain). Hard Rule 9 retired that suite, so the standing
 * verifier is the deterministic probe suite (same migration pattern as
 * TRADE.RUNTIME.* / MOVEMENT B2 and RUNTIME.REAL_BROWSER.* / MOVEMENT D2).
 * This probe re-proves BOTH halves of the chain contract
 * (docs/contracts/BEHAVIOR_CONTRACTS.json TRADE.CHAIN.ORDERED_CAUSAL_SEQUENCE;
 * registry MUT-CHAIN-001):
 *
 *   Section 1 — one-shot ordered TYPE sequence
 *       runClosedWorldScenario (Constitution §53 one-shot) with the declared
 *       V3 preconditions (bandit.lootExpectation === 0.95, switchMargin === 0,
 *       perceivedDanger 0.8) must emit CONVOY_FORMED, BANDIT_ATTACK, RUMOR,
 *       ROUTE_SELECTED, FACTION_REASSESSMENT, FACTION_ACTION, INVASION,
 *       BANDIT_RELOCATION as an ORDERED subsequence (strictly increasing
 *       event indices). Membership (toContain) is not sufficient, and it is
 *       not asserted: an event stream whose order is broken fails here.
 *
 *   Section 2 — parent-linked causal EDGE chain (the MUT-CHAIN-001 contract)
 *       OBSERVATION -> BELIEF_UPDATE -> ROUTE_DECISION -> TRIP_COMMITMENT ->
 *       EXPOSURE -> ENCOUNTER -> CONSEQUENCE -> MEMORY/REPUTATION/FACTION
 *       REACTION. Driven over forced-attack ticks (the production reducer
 *       path), every child event must name its legal parent eventId; the
 *       mutation (clear the decision's BELIEF_UPDATE parents) is killed by
 *       the decision-parent rule below — 87 of 90 decisions carry a belief
 *       parent in the healthy trajectory, so removing the edge cannot pass.
 *
 * Deterministic: fixed seeds, no network, no ports, no test runner.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    createClosedWorldScenario,
    tickClosedWorld,
    deterministicRng,
    formClosedWorldConvoy,
    runClosedWorldScenario,
} from '../../closed-world.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
void repoRoot;

let checks = 0;
function check(condition, what) {
    checks += 1;
    if (!condition) {
        console.error(`\nFAILED check ${checks}: ${what}`);
        process.exit(1);
    }
}

console.log('============================================================');
console.log('VERIFY TRADE CHAIN CAUSAL EDGES (ordered one-shot sequence,');
console.log('parent-linked OBSERVATION -> ... -> FACTION_REACTION chain)');
console.log('============================================================');

// ---------------------------------------------------------------- section 1
// One-shot ordered TYPE sequence (V3 §1 item #2: order, not membership).
const ONE_SHOT_SEQUENCE = [
    'CONVOY_FORMED',
    'BANDIT_ATTACK',
    'RUMOR',
    'ROUTE_SELECTED',
    'FACTION_REASSESSMENT',
    'FACTION_ACTION',
    'INVASION',
    'BANDIT_RELOCATION',
];
const oneShotWorld = createClosedWorldScenario();
check(Array.isArray(oneShotWorld.bandits) && oneShotWorld.bandits.length >= 1,
    `one-shot scenario has at least 1 bandit (has ${oneShotWorld.bandits?.length ?? 'none'})`);
oneShotWorld.bandits[0].lootExpectation = 0.95;
oneShotWorld.bandits[0].switchMargin = 0;
runClosedWorldScenario({ perceivedDanger: 0.8, world: oneShotWorld });
const oneShotTypes = oneShotWorld.events.map(event => event.type);
let sequenceCursor = -1;
const sequencePositions = [];
let sequenceOrdered = true;
for (const expectedType of ONE_SHOT_SEQUENCE) {
    const index = oneShotTypes.indexOf(expectedType, sequenceCursor + 1);
    if (index === -1) {
        sequenceOrdered = false;
        sequencePositions.push(`${expectedType}:MISSING-AFTER-${sequenceCursor}`);
        break;
    }
    sequencePositions.push(`${expectedType}@${index}`);
    sequenceCursor = index;
}
check(sequenceOrdered,
    `one-shot event stream preserves the ordered causal sequence (membership alone is not enough; positions: ${sequencePositions.join(', ')})`);
console.log(`  * one-shot ordered sequence: ${sequencePositions.join(' -> ')}: PASS`);

// ---------------------------------------------------------------- section 2
// Parent-linked causal EDGE chain over driven forced-attack ticks.
const CHAIN_TICKS = 90;
const world = createClosedWorldScenario();
if (typeof formClosedWorldConvoy === 'function') formClosedWorldConvoy(world);
const rng = deterministicRng(0x5EEDBEEF);
for (let tick = 1; tick <= CHAIN_TICKS; tick += 1) {
    const road = world.routes[(tick - 1) % world.routes.length];
    tickClosedWorld(world, { tick, perceivedDanger: 0.9, attackRoadId: road.id, encounterRng: rng });
}

const eventsById = new Map();
for (const event of world.events) {
    if (typeof event.eventId === 'string' && event.eventId.length > 0) {
        eventsById.set(event.eventId, event);
    }
}
const parentsOf = event => (Array.isArray(event.parentEventIds) ? event.parentEventIds : []);
const resolvedParents = event => parentsOf(event).map(id => eventsById.get(id)).filter(Boolean);
function findByType(type) {
    return world.events.filter(event => event.type === type);
}

// 2a. No dangling causal parents anywhere in the driven ledger.
let danglingViolations = 0;
let parentsScanned = 0;
for (const event of world.events) {
    for (const parentId of parentsOf(event)) {
        parentsScanned += 1;
        if (!eventsById.has(parentId)) {
            danglingViolations += 1;
            if (danglingViolations <= 3) {
                console.error(`  dangling parent: ${event.type}@${event.tick} references unknown ${parentId}`);
            }
        }
    }
}
check(danglingViolations === 0,
    `every causal parent id resolves to a ledger event (scanned ${parentsScanned} parent references; violations ${danglingViolations})`);
console.log(`  * parent integrity: ${parentsScanned} parent references across ${world.events.length} events, all resolve: PASS`);

// 2b. OBSERVATION <- BANDIT_ATTACK | BANDIT_RELOCATION.
const observations = findByType('OBSERVATION');
check(observations.length >= 1,
    `driven scenario produced at least one OBSERVATION (observed ${observations.length}; a probe that proves nothing must fail, not pass)`);
const observationViolations = observations.filter(observation =>
    !resolvedParents(observation).some(parent => parent.type === 'BANDIT_ATTACK' || parent.type === 'BANDIT_RELOCATION'));
check(observationViolations.length === 0,
    `every OBSERVATION names its source attack/relocation event (violations ${observationViolations.length} of ${observations.length})`);

// 2c. BELIEF_UPDATE <- OBSERVATION (same merchant).
const beliefs = findByType('BELIEF_UPDATE');
check(beliefs.length >= 1,
    `driven scenario produced at least one BELIEF_UPDATE (observed ${beliefs.length})`);
const beliefViolations = beliefs.filter(belief =>
    !resolvedParents(belief).some(parent => parent.type === 'OBSERVATION' && parent.merchantId === belief.merchantId));
check(beliefViolations.length === 0,
    `every BELIEF_UPDATE is parented to its witness OBSERVATION (violations ${beliefViolations.length} of ${beliefs.length})`);

// 2d. MERCHANT_ROUTE_DECISION <- BELIEF_UPDATE (the MUT-CHAIN-001 kill rule).
// Whenever the merchant owns a BELIEF_UPDATE at or before the decision tick,
// the decision MUST name a BELIEF_UPDATE parent. The healthy trajectory links
// 87 of 90 decisions; clearing beliefParentIds in the reducer kills this rule.
const decisions = findByType('MERCHANT_ROUTE_DECISION');
check(decisions.length >= CHAIN_TICKS,
    `reducer produced a route decision every tick (${decisions.length} decisions over ${CHAIN_TICKS} ticks)`);
let decisionsLinkedToBelief = 0;
for (const decision of decisions) {
    const beliefParent = resolvedParents(decision).some(parent => parent.type === 'BELIEF_UPDATE');
    if (beliefParent) decisionsLinkedToBelief += 1;
    const hadEarlierBelief = beliefs.some(belief =>
        belief.merchantId === decision.merchantId && Number.isFinite(belief.tick) && belief.tick <= decision.tick);
    if (hadEarlierBelief) {
        check(beliefParent,
            `tick ${decision.tick}: merchant ${decision.merchantId} decision names a BELIEF_UPDATE parent (merchant held a belief; parents=[${parentsOf(decision).join(', ') || 'empty'}])`);
    }
}
check(decisionsLinkedToBelief >= 1,
    `at least one decision is parented to a BELIEF_UPDATE (linked ${decisionsLinkedToBelief} of ${decisions.length})`);
console.log(`  * decisions: ${decisions.length}, belief-parented ${decisionsLinkedToBelief}: PASS`);

// 2e. TRIP_COMMITMENT <- MERCHANT_ROUTE_DECISION (same merchant, same tick).
const commitments = findByType('TRIP_COMMITMENT');
check(commitments.length >= 1,
    `driven scenario produced at least one TRIP_COMMITMENT (observed ${commitments.length})`);
for (const commitment of commitments) {
    const decisionParent = resolvedParents(commitment).find(parent => parent.type === 'MERCHANT_ROUTE_DECISION');
    check(Boolean(decisionParent),
        `tick ${commitment.tick}: merchant ${commitment.merchantId} TRIP_COMMITMENT names its route decision (parents=[${parentsOf(commitment).join(', ') || 'empty'}])`);
    check(decisionParent.merchantId === commitment.merchantId && decisionParent.tick === commitment.tick,
        `tick ${commitment.tick}: TRIP_COMMITMENT parent is the same-merchant same-tick decision (parent ${decisionParent.merchantId}@${decisionParent.tick})`);
}

// 2f. ROUTE_EXPOSURE <- TRIP_COMMITMENT (same merchant, same tick).
const exposures = findByType('ROUTE_EXPOSURE');
check(exposures.length >= 1,
    `driven scenario produced at least one ROUTE_EXPOSURE (observed ${exposures.length})`);
for (const exposure of exposures) {
    const commitmentParent = resolvedParents(exposure).find(parent => parent.type === 'TRIP_COMMITMENT');
    check(Boolean(commitmentParent),
        `tick ${exposure.tick}: merchant ${exposure.merchantId} ROUTE_EXPOSURE names its trip commitment (parents=[${parentsOf(exposure).join(', ') || 'empty'}])`);
    check(commitmentParent.merchantId === exposure.merchantId && commitmentParent.tick === exposure.tick,
        `tick ${exposure.tick}: ROUTE_EXPOSURE parent is the same-merchant same-tick commitment (parent ${commitmentParent.merchantId}@${commitmentParent.tick})`);
}

// 2g. CANDIDATE_ENCOUNTER <- ROUTE_EXPOSURE (where exposures exist).
const candidates = findByType('CANDIDATE_ENCOUNTER');
check(candidates.length >= 1,
    `driven scenario produced at least one CANDIDATE_ENCOUNTER (observed ${candidates.length})`);
let candidatesLinkedToExposure = 0;
for (const candidate of candidates) {
    const exposureParent = resolvedParents(candidate).find(parent => parent.type === 'ROUTE_EXPOSURE');
    if (exposureParent) candidatesLinkedToExposure += 1;
    if (parentsOf(candidate).length > 0) {
        check(Boolean(exposureParent),
            `tick ${candidate.tick}: CANDIDATE_ENCOUNTER parents include a ROUTE_EXPOSURE (parents=[${parentsOf(candidate).join(', ') || 'empty'}])`);
    }
}
check(candidatesLinkedToExposure >= 1,
    `at least one encounter consideration is parented to a route exposure (linked ${candidatesLinkedToExposure} of ${candidates.length})`);

// 2h. ENCOUNTER <- CANDIDATE_ENCOUNTER.
const encounters = findByType('ENCOUNTER');
check(encounters.length >= 1,
    `driven scenario produced at least one ENCOUNTER (observed ${encounters.length})`);
for (const encounter of encounters) {
    check(resolvedParents(encounter).some(parent => parent.type === 'CANDIDATE_ENCOUNTER'),
        `tick ${encounter.tick}: ENCOUNTER ${encounter.encounterId} names its candidate consideration (parents=[${parentsOf(encounter).join(', ') || 'empty'}])`);
}

// 2i. CONSEQUENCE (BANDIT_ATTACK) <- ENCOUNTER.
const attackConsequences = findByType('BANDIT_ATTACK');
check(attackConsequences.length >= 1,
    `driven scenario produced at least one BANDIT_ATTACK consequence (observed ${attackConsequences.length})`);
let attacksLinkedToEncounter = 0;
for (const attack of attackConsequences) {
    const encounterParent = resolvedParents(attack).some(parent => parent.type === 'ENCOUNTER');
    if (encounterParent) attacksLinkedToEncounter += 1;
    check(encounterParent,
        `tick ${attack.tick}: BANDIT_ATTACK consequence names its encounter (parents=[${parentsOf(attack).join(', ') || 'empty'}])`);
}
check(attacksLinkedToEncounter >= 1, `encounter-parented attacks observed (${attacksLinkedToEncounter})`);

// 2j. MEMORY/REPUTATION/FACTION REACTION <- CONSEQUENCE, with tick order.
const reactions = findByType('FACTION_REACTION');
check(reactions.length >= 1,
    `driven scenario produced at least one FACTION_REACTION (observed ${reactions.length})`);
for (const reaction of reactions) {
    check(resolvedParents(reaction).some(parent => parent.type === 'BANDIT_ATTACK'),
        `tick ${reaction.tick}: FACTION_REACTION names its attack consequence (parents=[${parentsOf(reaction).join(', ') || 'empty'}])`);
}

// 2k. Partial order: no child may precede its causal parent in tick order.
let orderViolations = 0;
for (const event of world.events) {
    for (const parent of resolvedParents(event)) {
        if (Number.isFinite(parent.tick) && Number.isFinite(event.tick) && parent.tick > event.tick) {
            orderViolations += 1;
            if (orderViolations <= 3) {
                console.error(`  order violation: ${event.type}@${event.tick} parented to ${parent.type}@${parent.tick}`);
            }
        }
    }
}
check(orderViolations === 0,
    `causal parents never post-date their children (violations ${orderViolations})`);

// 2l. Walk one full ancestry from the first reaction to a root.
const walk = [];
let cursor = reactions[0];
let walkGuard = 0;
while (cursor && walkGuard < 40) {
    walk.push(`${cursor.type}@t${cursor.tick}`);
    cursor = resolvedParents(cursor)[0];
    walkGuard += 1;
}
check(walkGuard < 40, `ancestry walk terminates (guard not exceeded): ${walk.join(' <- ')}`);
check(!cursor, `ancestry walk reaches a root event without further parents`);
const WALK_PREFIX = ['FACTION_REACTION', 'BANDIT_ATTACK', 'ENCOUNTER', 'CANDIDATE_ENCOUNTER', 'ROUTE_EXPOSURE', 'TRIP_COMMITMENT', 'MERCHANT_ROUTE_DECISION'];
const walkTypes = walk.map(stage => stage.split('@')[0]);
check(WALK_PREFIX.every((type, index) => walkTypes[index] === type),
    `reaction ancestry preserves the chain order ${WALK_PREFIX.join(' <- ')} (observed ${walkTypes.join(' <- ')})`);
console.log(`  * chain walk (root <- reaction): ${walk.slice().reverse().join(' -> ')}: PASS`);

console.log('');
console.log(`All ${checks} trade-chain causal-edge assertions PASSED.`);
