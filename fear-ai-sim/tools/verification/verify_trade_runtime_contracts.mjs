#!/usr/bin/env node
/**
 * tools/verification/verify_trade_runtime_contracts.mjs — the trade-chain
 * runtime contracts, proven against the production reducer itself.
 *
 * Why this probe exists: Guardian V4 §5 (MOVEMENT B2) requires a real
 * source-mutation harness whose mutants are killed by a *protected verifier*.
 * The Jest suites that used to hold these contracts were retired by Hard
 * Rule 9, so the verifier is the deterministic probe suite — and until this
 * probe existed, no probe in the roster asserted any trade-runtime contract
 * (the mutation harness re-plants one real defect per contract; nothing in
 * the suite failed on the planted defects, which would have been recorded
 * as a verifier weakness, not as a pass).
 *
 * Contracts proven here, one section each:
 *   TRADE.RUNTIME.NO_DOUBLE_EXECUTION
 *       One canonical merchant tick per merchant per tick. Every
 *       MERCHANT_ROUTE_DECISION observed in tick T belongs to a distinct
 *       merchant; the double-tick regression fires a second decision for
 *       the same merchant in the same tick.
 *   TRADE.RUNTIME.AUTHORITATIVE_PATH
 *       Simulation.runClosedWorldStep invokes tickClosedWorld. The reducer
 *       is exercised behaviorally below (tickHistory grows every call);
 *       the *call site* is checked at source level because `Simulation` is
 *       DOM-bound (canvas + document.createElement in its constructor) and
 *       this probe must stay runnable in plain Node — the pre-retirement
 *       jest run used jsdom, which Hard Rule 9 removed.
 *   TRADE.CATMOUSE.LEGAL_OBSERVATION_ONLY
 *       Merchant route selection reads belief state only: the canonical
 *       merchant tick body must not reference `world.bandits` (the illegal
 *       shortcut is "merchant reads the bandit's authoritative position"),
 *       and the encounter-facing alias `merchant.selectedRoute` must equal
 *       the decision event's `chosenRoute` for every decision.
 *   MIGRATION.DRIVEN_BY_RECENT_GRIEVANCE
 *       Migration fires only with a PRESSURE_EXCEEDS_THRESHOLD FIRE
 *       decision, never inside the per-town cooldown window. The scenario
 *       forces attacks so the justice loop actually evaluates migration;
 *       a scenario that produces no migration FAILS this probe rather than
 *       passing vacuously.
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
console.log('VERIFY TRADE-RUNTIME CONTRACTS (NO_DOUBLE_EXECUTION, AUTHORITATIVE_PATH,');
console.log('LEGAL_OBSERVATION_ONLY, MIGRATION_DRIVEN_BY_RECENT_GRIEVANCE)');
console.log('============================================================');

// ---------------------------------------------------------------- section 0
// Scenario sanity: the probes below are only meaningful on a scenario that
// actually has merchants with canonical identity, routes, and bandits.
// A silently empty world would let every later assertion pass vacuously.
const world = createClosedWorldScenario();
if (typeof formClosedWorldConvoy === 'function') formClosedWorldConvoy(world);
check(Array.isArray(world.merchants) && world.merchants.length >= 1,
    `scenario has at least 1 merchant (has ${world.merchants?.length ?? 'none'})`);
check(world.merchants.every(m => m.riskTolerance !== undefined),
    'every scenario merchant has canonical identity (riskTolerance defined)');
check(Array.isArray(world.routes) && world.routes.length >= 2,
    `scenario has at least 2 routes (has ${world.routes?.length ?? 'none'})`);
check(Array.isArray(world.bandits) && world.bandits.length >= 1,
    `scenario has at least 1 bandit (has ${world.bandits?.length ?? 'none'})`);
console.log(`  * scenario: ${world.merchants.length} merchants, ${world.routes.length} routes, ${world.bandits.length} bandits: PASS`);

// ---------------------------------------------------------------- section 1
// TRADE.RUNTIME.NO_DOUBLE_EXECUTION + reducer behavior.
// Drive the canonical reducer directly (the production path — this is the
// same function Simulation.runClosedWorldStep calls) and require:
//   - tickHistory grows with every reducer call;
//   - each tick observed at least one MERCHANT_ROUTE_DECISION (the merchant
//     wire is live, not silently skipped);
//   - no merchant emits a second MERCHANT_ROUTE_DECISION in the same tick.
const rng = deterministicRng(0x5EEDCAFE);
const TICKS = 3;
let decisionsSeen = 0;
for (let tick = 1; tick <= TICKS; tick += 1) {
    const historyBefore = world.tickHistory?.length ?? 0;
    tickClosedWorld(world, { tick, perceivedDanger: 0.8, attackRoadId: null, encounterRng: rng });
    check((world.tickHistory?.length ?? 0) > historyBefore,
        `tick ${tick}: reducer appended a tickHistory entry (the canonical chain ran)`);
    const perMerchant = new Map();
    for (const event of world.events) {
        if (event.type !== 'MERCHANT_ROUTE_DECISION' || event.tick !== tick) continue;
        perMerchant.set(event.merchantId, (perMerchant.get(event.merchantId) ?? 0) + 1);
    }
    check(perMerchant.size >= 1,
        `tick ${tick}: at least one merchant made a route decision (observed ${perMerchant.size})`);
    for (const [merchantId, count] of perMerchant) {
        check(count === 1,
            `tick ${tick}: merchant ${merchantId} decided exactly once (observed ${count})`);
    }
    decisionsSeen += perMerchant.size;
}
check(decisionsSeen >= TICKS, `reducer produced route decisions across all ${TICKS} ticks (${decisionsSeen} total)`);

// Alias contract: the encounter engine reads merchant.selectedRoute and it
// must be the route the decision event records — not a shadow value.
for (const event of world.events) {
    if (event.type !== 'MERCHANT_ROUTE_DECISION') continue;
    const merchant = world.merchants.find(m => m.id === event.merchantId);
    check(Boolean(merchant), `decision references a live merchant (${event.merchantId})`);
    check(merchant.selectedRoute === event.chosenRoute,
        `tick ${event.tick}: merchant ${event.merchantId} selectedRoute (${merchant.selectedRoute}) === chosenRoute (${event.chosenRoute})`);
}
console.log(`  * NO_DOUBLE_EXECUTION + alias: ${decisionsSeen} decisions over ${TICKS} ticks, each merchant once per tick: PASS`);

// ---------------------------------------------------------------- section 2
// TRADE.RUNTIME.AUTHORITATIVE_PATH — source tripwire on the call site.
const simulationSource = read('simulation.js');
const methodStart = simulationSource.indexOf('runClosedWorldStep(');
check(methodStart !== -1, 'simulation.js contains runClosedWorldStep');
const methodEnd = simulationSource.indexOf('\n    }', methodStart);
check(methodEnd !== -1 && methodEnd > methodStart, 'runClosedWorldStep body is extractable');
const methodBody = simulationSource.slice(methodStart, methodEnd);
check(/^\s*tickClosedWorld\(this\.closedWorld,\s*\{ tick, perceivedDanger, attackRoadId \}\);/m.test(methodBody),
    'runClosedWorldStep invokes tickClosedWorld with the canonical arguments (uncommented)');
check(/this\.closedWorldTick \+= 1;/.test(methodBody),
    'runClosedWorldStep advances the closed-world tick exactly once');
console.log('  * AUTHORITATIVE_PATH: runClosedWorldStep invokes the canonical reducer: PASS');

// ---------------------------------------------------------------- section 3
// TRADE.CATMOUSE.LEGAL_OBSERVATION_ONLY — the merchant tick must select
// routes from belief state; reading `world.bandits` inside tickMerchant is
// the forbidden shortcut (authoritative ground truth observed directly).
const tradeSource = read('canonical-trade-system.js');
const fnStart = tradeSource.indexOf('export function tickMerchant');
check(fnStart !== -1, 'canonical-trade-system.js exports tickMerchant');
// The destructured options parameter closes with `} = {}) {` at column 0,
// so the function body is only reached after that marker.
const paramClose = tradeSource.indexOf('} = {}) {', fnStart);
check(paramClose !== -1 && paramClose > fnStart, 'tickMerchant parameter list is extractable');
const closeIdx = tradeSource.indexOf('\n}', paramClose);
const nextExportIdx = tradeSource.indexOf('\nexport ', paramClose);
const fnEnd = Math.min(
    closeIdx === -1 ? Number.MAX_SAFE_INTEGER : closeIdx,
    nextExportIdx === -1 ? Number.MAX_SAFE_INTEGER : nextExportIdx
);
check(fnEnd !== Number.MAX_SAFE_INTEGER, 'tickMerchant function end is extractable');
const fnBody = tradeSource.slice(paramClose, fnEnd);
check(/MERCHANT_ROUTE_DECISION/.test(fnBody), 'extraction sanity: tickMerchant event construction captured');
const fnCode = fnBody
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(line => !/^\s*\/\//.test(line))
    .join('\n');
check(!/world\.bandits/.test(fnCode),
    'tickMerchant never reads world.bandits in live code (comments excluded; route selection is belief-based, not panopticon)');
check(/chooseMerchantRouteDecision\(/.test(fnBody),
    'tickMerchant selects routes through chooseMerchantRouteDecision');
check(/\bbeliefs\b/.test(fnBody),
    'tickMerchant selection is driven by the belief map');
console.log('  * LEGAL_OBSERVATION_ONLY: route selection reads beliefs only, never authoritative bandit state: PASS');

// ---------------------------------------------------------------- section 4
// MIGRATION.DRIVEN_BY_RECENT_GRIEVANCE — force attacks so the justice loop
// reports crime and evaluates migration, then assert the decision chain.
const cooldownMatch = /const MIGRATION_COOLDOWN = (\d+);/.exec(read('closed-world.js'));
check(Boolean(cooldownMatch), 'closed-world.js declares MIGRATION_COOLDOWN');
const MIGRATION_COOLDOWN = Number(cooldownMatch[1]);

const world2 = createClosedWorldScenario();
if (typeof formClosedWorldConvoy === 'function') formClosedWorldConvoy(world2);
const rng2 = deterministicRng(0x5EEDF00D);
const MIG_TICKS = 90;
let attacksObserved = 0;
for (let tick = 1; tick <= MIG_TICKS; tick += 1) {
    const road = world2.routes[(tick - 1) % world2.routes.length];
    tickClosedWorld(world2, { tick, perceivedDanger: 0.9, attackRoadId: road.id, encounterRng: rng2 });
}
for (const event of world2.events) {
    if (event.type === 'BANDIT_ATTACK') attacksObserved += 1;
}
check(attacksObserved >= 1,
    `forced-attack scenario produced at least one BANDIT_ATTACK (observed ${attacksObserved})`);

const migrationDecisions = world2.events.filter(e => e.type === 'MIGRATION_DECISION');
const migrations = world2.events.filter(e => e.type === 'MIGRATION');
console.log(`  * migration scenario: ${world2.events.length} events, ${attacksObserved} attacks, ${migrationDecisions.length} decisions, ${migrations.length} migrations`);
check(migrationDecisions.length >= 1,
    'justice loop evaluated migration at least once (reportedCrime reached)');
check(migrations.length >= 1,
    'scenario produced at least one actual MIGRATION (a probe that proves nothing must fail, not pass)');

for (const decision of migrationDecisions) {
    if (decision.decision !== 'FIRE') continue;
    check(decision.reason === 'PRESSURE_EXCEEDS_THRESHOLD',
        `tick ${decision.tick} town ${decision.townId}: FIRE decision carries PRESSURE_EXCEEDS_THRESHOLD (got ${decision.reason})`);
}
for (const migration of migrations) {
    const firing = migrationDecisions.find(d =>
        d.townId === migration.townId && d.tick === migration.tick && d.decision === 'FIRE');
    check(Boolean(firing),
        `tick ${migration.tick} town ${migration.townId}: MIGRATION is parented to a FIRE decision on the same tick`);
}
const ticksByTown = new Map();
for (const migration of migrations) {
    if (!ticksByTown.has(migration.townId)) ticksByTown.set(migration.townId, []);
    ticksByTown.get(migration.townId).push(migration.tick);
}
for (const [townId, ticks] of ticksByTown) {
    ticks.sort((a, b) => a - b);
    for (let i = 1; i < ticks.length; i += 1) {
        check(ticks[i] - ticks[i - 1] >= MIGRATION_COOLDOWN,
            `town ${townId}: migrations ${ticks[i - 1]} -> ${ticks[i]} respect MIGRATION_COOLDOWN (${MIGRATION_COOLDOWN})`);
    }
    console.log(`  * town ${townId}: ${ticks.length} migration(s) at ticks [${ticks.join(', ')}]`);
}
console.log('  * MIGRATION_DRIVEN_BY_RECENT_GRIEVANCE: FIRE decisions carry threshold reason, cooldown respected: PASS');

console.log('');
console.log(`All ${checks} trade-runtime contract assertions PASSED.`);
