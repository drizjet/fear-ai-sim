#!/usr/bin/env node
/**
 * tools/verification/verify_all_systems_runtime.mjs - the closed-world
 * all-systems emission mix, proven against the production reducer itself.
 *
 * Why this probe exists: Guardian V3 audit (docs/contracts/AUDIT_v1.md,
 * Change 3.2) recorded that the retired closed-world-all-systems Jest suite
 * had been weakened from "the chain surfaces RUMOR + FACTION_REASSESSMENT +
 * FACTION_ACTION" down to a core-8 membership check, because the canonical
 * reducer did not visibly emit the faction pair on the old 5-tick window.
 * V4 resolution (SS7.2): the canonical runtime DOES emit both -
 * FACTION_REASSESSMENT on escalation change and FACTION_ACTION only behind
 * an authorizing FACTION_ACTION_GATE - while RUMOR creation is scoped to
 * scenario setup (rootReason SCENARIO_SETUP; the tick loop has no rumor
 * source), with the canonical information channel carried by
 * OBSERVATION/BELIEF_UPDATE events. This probe proves all three claims and
 * is the living verifier for protected test T-ALLSYS-001
 * (contractId TRADE.RUNTIME.AUTHORITATIVE_PATH, canonical-runtime emission
 * segment; registry MUT-CHAIN-001).
 *
 *   Section 1 - the V3 five-tick window, unchanged and now sufficient for
 *       the core-8 membership PLUS FACTION_REASSESSMENT (tick 2 on the
 *       canonical fixture: interlinked with the belief wire, not stalled).
 *   Section 2 - extended window (60 ticks): FACTION_ACTION fires (tick 9
 *       first), every action is parented to the FACTION_ACTION_GATE that
 *       authorized it (allowed === true, same faction/target, not later
 *       than the action), and every INVASION is parented to the RAID action
 *       whose actionId it carries as causationId.
 *   Section 3 - RUMOR scoping: the canonical tick loop emits no RUMOR (the
 *       rumor channel is scenario-setup-scoped: exactly one createRumor
 *       call site, inside applySurvivorEvidence) while the canonical
 *       information channel is alive (OBSERVATION/BELIEF_UPDATE). The
 *       one-shot scenario path mints the RUMOR with rootReason
 *       SCENARIO_SETUP. If a future change gives the tick loop a rumor
 *       source, this probe fails until the contract is revised deliberately.
 *
 * Deterministic: fixed seeds, no network, no ports, no test runner.
 */

import { readFileSync } from 'node:fs';
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
function read(relativePath) {
    return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

let checks = 0;
function check(condition, what) {
    checks += 1;
    if (!condition) {
        console.error(`\nFAILED check ${checks}: ${what}`);
        process.exit(1);
    }
}

console.log('============================================================');
console.log('VERIFY ALL-SYSTEMS RUNTIME (core-8 + FACTION_REASSESSMENT,');
console.log('gate-parented FACTION_ACTION, INVASION causation, RUMOR scoping)');
console.log('============================================================');

// ---------------------------------------------------------------- section 0
// Scenario sanity: an empty world would let every later assertion pass
// vacuously, so the fixture is asserted to exist before it is driven.
const world = createClosedWorldScenario();
check(Array.isArray(world.merchants) && world.merchants.length >= 1,
    `scenario has at least 1 merchant (has ${world.merchants?.length ?? 'none'})`);
check(Array.isArray(world.routes) && world.routes.length >= 2,
    `scenario has at least 2 routes (has ${world.routes?.length ?? 'none'})`);
check(Array.isArray(world.bandits) && world.bandits.length >= 1,
    `scenario has at least 1 bandit (has ${world.bandits?.length ?? 'none'})`);
formClosedWorldConvoy(world);

// The V3 fixture: the bandit's traffic belief points at road-c (the road the
// merchant actually uses), attacks are forced onto road-a, danger is high.
// This is the same fixture the retired all-systems suite declared.
check(typeof world.bandits[0].trafficBelief === 'object' && world.bandits[0].trafficBelief !== null,
    'bandit carries a traffic belief store for the fixture seed');
world.bandits[0].trafficBelief['road-c'] = { estimatedTraffic: 3, recency: 1.0, lastDecayTick: 1 };

const WINDOW_TICKS = 60;
const rng = deterministicRng(0x5EEDBEEF);
for (let tick = 1; tick <= WINDOW_TICKS; tick += 1) {
    tickClosedWorld(world, { tick, perceivedDanger: 0.8, attackRoadId: 'road-a', encounterRng: rng });
}
check(world.events.length > 0, 'the reducer produced events (a silent reducer fails, not passes)');
console.log(`  * scenario: ${world.merchants.length} merchants, ${world.routes.length} routes, ${world.bandits.length} bandits, ${world.events.length} events over ${WINDOW_TICKS} ticks: PASS`);

const byEventId = new Map(world.events.map(e => [e.eventId, e]));
const firstTickOf = (type) => world.events.find(e => e.type === type)?.tick ?? null;

// ---------------------------------------------------------------- section 1
// The V3 five-tick window: the core-8 membership the V3 suite settled for,
// plus the FACTION_REASSESSMENT that V3 recorded as missing. The window is
// a filter over the same 60-tick world (identical seed => identical
// trajectory), not a second run.
const V3_CORE_EIGHT = [
    'CONVOY_FORMED',
    'ROUTE_SELECTED',
    'MERCHANT_ROUTE_DECISION',
    'BANDIT_ATTACK',
    'BANDIT_RELOCATION',
    'MARKET_TICK',
    'JUSTICE_RESOLVED',
    'REPORT_FILED',
];
// Setup events (CONVOY_FORMED) are minted before tick 1 and carry no tick
// yet; they belong to the opening window rather than being excluded by it.
const earlyTypes = new Set(world.events.filter(e => (e.tick ?? 0) <= 5).map(e => e.type));
for (const type of V3_CORE_EIGHT) {
    check(earlyTypes.has(type), `5-tick window contains ${type}`);
}
check(earlyTypes.has('FACTION_REASSESSMENT'),
    `5-tick window contains FACTION_REASSESSMENT (observed first at tick ${firstTickOf('FACTION_REASSESSMENT')}) - the V3 weakening is closed`);
console.log('  * V3 core-8 + FACTION_REASSESSMENT within 5 ticks: PASS');

// ---------------------------------------------------------------- section 2
// Extended window (SS7.2): the faction pair must actually fire, and the
// fired actions must carry their authorizing gate and downstream invasion.
const factionActions = world.events.filter(e => e.type === 'FACTION_ACTION');
const invasions = world.events.filter(e => e.type === 'INVASION');
const reassessments = world.events.filter(e => e.type === 'FACTION_REASSESSMENT');
check(factionActions.length >= 1,
    `extended window produced at least one FACTION_ACTION (observed ${factionActions.length}, first at tick ${firstTickOf('FACTION_ACTION')})`);
check(reassessments.length >= 1,
    `extended window produced at least one FACTION_REASSESSMENT (observed ${reassessments.length})`);
check(invasions.length >= 1,
    `extended window produced at least one INVASION (observed ${invasions.length}, first at tick ${firstTickOf('INVASION')})`);

for (const action of factionActions) {
    check(action.action && ['RAID', 'RETALIATION'].includes(action.action.type),
        `tick ${action.tick}: FACTION_ACTION carries a RAID/RETALIATION action (got ${action.action?.type ?? 'none'})`);
    check(Number.isFinite(action.action?.tick) && typeof action.action?.actionId === 'string',
        `tick ${action.tick}: the action has a finite tick and an actionId`);
    const parents = (action.parentEventIds ?? []).map(id => byEventId.get(id));
    const gate = parents.find(parent => parent && parent.type === 'FACTION_ACTION_GATE');
    check(Boolean(gate),
        `tick ${action.tick}: FACTION_ACTION ${action.eventId} is parented to a FACTION_ACTION_GATE (parents: ${(action.parentEventIds ?? []).join(', ') || 'none'})`);
    check(gate.allowed === true,
        `tick ${action.tick}: the authorizing gate allowed the raid (allowed=${gate.allowed}, reason=${gate.reason})`);
    check(gate.tick <= action.tick,
        `tick ${action.tick}: the authorizing gate (tick ${gate.tick}) does not post-date the action`);
    check(gate.factionId === action.factionId && gate.targetId === action.targetId,
        `tick ${action.tick}: gate faction/target match the action (${gate.factionId}/${gate.targetId})`);
}
for (const invasion of invasions) {
    check(Number.isFinite(invasion.resourcesLeft),
        `tick ${invasion.tick}: INVASION carries a finite resourcesLeft (${invasion.resourcesLeft})`);
    const parents = (invasion.parentEventIds ?? []).map(id => byEventId.get(id));
    const authorizingAction = parents.find(parent => parent && parent.type === 'FACTION_ACTION');
    check(Boolean(authorizingAction),
        `tick ${invasion.tick}: INVASION ${invasion.eventId} is parented to its FACTION_ACTION (parents: ${(invasion.parentEventIds ?? []).join(', ') || 'none'})`);
    check(authorizingAction.action?.actionId === invasion.causationId,
        `tick ${invasion.tick}: INVASION causationId (${invasion.causationId}) matches the authorizing actionId (${authorizingAction.action?.actionId})`);
    check(invasion.tick === authorizingAction.tick,
        `tick ${invasion.tick}: the invasion rides the same tick as its authorizing action (${authorizingAction.tick})`);
}
for (const reassessment of reassessments) {
    check(reassessment.result && ['HOLD', 'RAID'].includes(reassessment.result.decision),
        `tick ${reassessment.tick}: FACTION_REASSESSMENT carries a HOLD/RAID decision (got ${reassessment.result?.decision ?? 'none'})`);
    check(Number.isFinite(reassessment.result?.escalation),
        `tick ${reassessment.tick}: FACTION_REASSESSMENT carries a finite escalation snapshot`);
    check(reassessment.rootReason === 'WORLD_STATE_DERIVED',
        `tick ${reassessment.tick}: FACTION_REASSESSMENT declares its root (WORLD_STATE_DERIVED, got ${reassessment.rootReason ?? 'none'})`);
}
check(factionActions.length === invasions.length,
    `every authorized action resolved into one invasion (actions ${factionActions.length}, invasions ${invasions.length})`);
console.log(`  * gate-parented FACTION_ACTION (${factionActions.length}) and caused INVASION (${invasions.length}): PASS`);

// ---------------------------------------------------------------- section 3
// RUMOR scoping (SS7.2 resolution evidence). Two halves:
//   (a) the canonical tick loop never mints a RUMOR - and this is not
//       vacuous: the canonical information channel is alive
//       (OBSERVATION/BELIEF_UPDATE present), so the absence is scoping,
//       not silence;
//   (b) the single createRumor call site lives inside applySurvivorEvidence
//       (scenario setup), and the one-shot scenario path mints the RUMOR
//       with rootReason SCENARIO_SETUP.
const rumorsInLoop = world.events.filter(e => e.type === 'RUMOR');
check(rumorsInLoop.length === 0,
    `canonical tick loop emits no RUMOR (observed ${rumorsInLoop.length}) - rumor creation is scenario-setup-scoped`);
const observations = world.events.filter(e => e.type === 'OBSERVATION');
const beliefUpdates = world.events.filter(e => e.type === 'BELIEF_UPDATE');
check(observations.length >= 1,
    `canonical information channel is alive: OBSERVATION present (observed ${observations.length})`);
check(beliefUpdates.length >= 1,
    `canonical information channel is alive: BELIEF_UPDATE present (observed ${beliefUpdates.length})`);
check(Array.isArray(world.rumorsInTransit),
    'rumor transit machinery exists (rumorsInTransit) but is fed only by scenario setup');

const closedWorldSource = read('closed-world.js');
const createRumorCallSites = (closedWorldSource.match(/createRumor\(/g) ?? []).length;
check(createRumorCallSites === 1,
    `closed-world.js contains exactly one createRumor call site (observed ${createRumorCallSites}) - a new rumor source must revise this contract deliberately`);
const applyStart = closedWorldSource.indexOf('function applySurvivorEvidence');
check(applyStart !== -1, 'applySurvivorEvidence exists in closed-world.js');
const applyEnd = closedWorldSource.indexOf('\n}', applyStart);
const createRumorIndex = closedWorldSource.indexOf('createRumor(', applyStart);
check(createRumorIndex !== -1 && createRumorIndex < applyEnd,
    'the single createRumor call site lives inside applySurvivorEvidence (scenario setup)');

const oneShotWorld = createClosedWorldScenario();
formClosedWorldConvoy(oneShotWorld);
runClosedWorldScenario({ perceivedDanger: 0.8, world: oneShotWorld });
const oneShotRumors = oneShotWorld.events.filter(e => e.type === 'RUMOR');
check(oneShotRumors.length >= 1,
    `scenario-setup path (runClosedWorldScenario) mints the RUMOR event (observed ${oneShotRumors.length})`);
check(oneShotRumors.every(rumor => rumor.rootReason === 'SCENARIO_SETUP'),
    'every scenario-setup RUMOR declares rootReason SCENARIO_SETUP');
console.log('  * RUMOR scoping: canonical loop silent, scenario setup mints, single call site: PASS');

console.log('');
console.log(`All ${checks} all-systems runtime assertions PASSED.`);
