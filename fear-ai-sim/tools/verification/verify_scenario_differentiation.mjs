#!/usr/bin/env node
/**
 * tools/verification/verify_scenario_differentiation.mjs - the long-horizon
 * scenario profiles, proven against the production reducer itself.
 *
 * Why this probe exists: Guardian V3 audit (docs/contracts/AUDIT_v1.md,
 * Change 6.1) recorded that the retired scenario-differentiation suite
 * produced its "no attacks" profile through a noObservations fixture switch.
 * The contract (BEHAVIOR_CONTRACTS.json TRADE.SCENARIO.NATURAL_NO_ATTACKS;
 * protected test T-DIFF-001, SS7.5) requires 0 BANDIT_ATTACK through
 * natural causal conditions - the merchant and the bandit simply never
 * share a road - and never through a perception override. This probe never
 * touches perceptionAccuracy or noObservations; the canonical perception
 * channel stays in place and the peaceful profile must emerge anyway.
 *
 *   Section 1 - natural profile: 50 canonical ticks on the declared fixture
 *       (perceivedDanger 0.5, relationshipGate false as the V3 suite
 *       declared) produce 0 BANDIT_ATTACK and 0 MIGRATION while trips,
 *       decisions, and market traffic flow - the world is alive, so the
 *       zero is a mechanism, not a dead hammer. The mechanism is asserted:
 *       merchant and bandit end on different roads.
 *   Section 2 - sustained profile: the same fixture with canonical attacks
 *       forced onto road-a on alternating ticks produces real attacks, real
 *       reactions (LAW_VIOLATED, FACTION_REACTION), and real migration.
 *       The profiles must differ directionally: sustained attacks and
 *       migrations both strictly exceed the natural run.
 *   Section 3 - determinism: both profiles replay identically from the same
 *       seed (counts, merchant route, bandit road) - a differentiation
 *       claim on a nondeterministic base would prove nothing.
 *
 * Registry kill obligation: MUT-MIG-001 (migration must not be a periodic
 * event that fires because a threshold happens to be crossed). The natural
 * run's 0-migration profile is exactly the pressure-gated behavior the
 * mutation removes; a periodic-event regression in this scenario shows up
 * as natural migrations and fails section 1.
 *
 * Deterministic: fixed seeds, no network, no ports, no test runner.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    createClosedWorldScenario,
    tickClosedWorld,
    deterministicRng,
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
console.log('VERIFY SCENARIO DIFFERENTIATION (natural no-attacks profile,');
console.log('sustained-attacks profile, directional divergence, determinism)');
console.log('============================================================');

const HORIZON_TICKS = 50;
const FIXTURE_SEED = 0x5EEDBEEF;

function runProfile({ sustained }) {
    const world = createClosedWorldScenario();
    const rng = deterministicRng(FIXTURE_SEED);
    for (let tick = 1; tick <= HORIZON_TICKS; tick += 1) {
        const attackRoadId = sustained && tick % 2 === 0 ? 'road-a' : null;
        tickClosedWorld(world, {
            tick,
            perceivedDanger: 0.5,
            relationshipGate: false,
            attackRoadId,
            encounterRng: rng,
        });
    }
    const countOf = (type) => world.events.filter(e => e.type === type).length;
    return {
        totalEvents: world.events.length,
        attacks: countOf('BANDIT_ATTACK'),
        migrations: countOf('MIGRATION'),
        lawViolated: countOf('LAW_VIOLATED'),
        factionReactions: countOf('FACTION_REACTION'),
        merchantDecisions: countOf('MERCHANT_ROUTE_DECISION'),
        tripCommitments: countOf('TRIP_COMMITMENT'),
        merchantRoute: world.merchants[0]?.selectedRoute ?? null,
        banditRoad: world.bandits[0]?.roadId ?? null,
    };
}

// ---------------------------------------------------------------- section 0
{
    const sanity = createClosedWorldScenario();
    check(Array.isArray(sanity.merchants) && sanity.merchants.length >= 1,
        `scenario has at least 1 merchant (has ${sanity.merchants?.length ?? 'none'})`);
    check(Array.isArray(sanity.bandits) && sanity.bandits.length >= 1,
        `scenario has at least 1 bandit (has ${sanity.bandits?.length ?? 'none'})`);
    check(Array.isArray(sanity.routes) && sanity.routes.length >= 2,
        `scenario has at least 2 routes (has ${sanity.routes?.length ?? 'none'})`);
}

// ---------------------------------------------------------------- section 1
// Natural profile: 0 attacks must emerge while the world lives.
const natural = runProfile({ sustained: false });
check(natural.attacks === 0,
    `natural profile produced 0 BANDIT_ATTACK through natural conditions (observed ${natural.attacks})`);
check(natural.migrations === 0,
    `natural profile produced 0 MIGRATION (no attacks, no reported crime, no pressure; observed ${natural.migrations})`);
check(natural.merchantDecisions >= HORIZON_TICKS,
    `natural profile is alive: route decisions on every tick (${natural.merchantDecisions} over ${HORIZON_TICKS})`);
check(natural.tripCommitments >= 1,
    `natural profile is alive: trips were committed (${natural.tripCommitments})`);
check(natural.totalEvents >= HORIZON_TICKS,
    `natural profile is alive: the event stream flows (${natural.totalEvents} events)`);
check(natural.merchantRoute !== null && natural.banditRoad !== null,
    'natural profile ended with a merchant route and a bandit road');
check(natural.merchantRoute !== natural.banditRoad,
    `the natural mechanism: merchant (${natural.merchantRoute}) and bandit (${natural.banditRoad}) never share a road`);
console.log(`  * natural profile: 0 attacks, 0 migrations, ${natural.totalEvents} events, roads diverge (${natural.merchantRoute} vs ${natural.banditRoad}): PASS`);

// ---------------------------------------------------------------- section 2
// Sustained profile: canonical forced attacks must bite and differentiate.
const sustained = runProfile({ sustained: true });
check(sustained.attacks >= 1,
    `sustained profile produced real attacks (observed ${sustained.attacks})`);
check(sustained.lawViolated >= 1,
    `sustained attacks were reported as law violations (observed ${sustained.lawViolated})`);
check(sustained.factionReactions >= 1,
    `sustained attacks produced faction reactions (observed ${sustained.factionReactions})`);
check(sustained.migrations >= 1,
    `sustained profile produced migration under sustained pressure (observed ${sustained.migrations})`);
check(sustained.attacks > natural.attacks,
    `profiles diverge on attacks: sustained ${sustained.attacks} > natural ${natural.attacks}`);
check(sustained.migrations > natural.migrations,
    `profiles diverge on migration: sustained ${sustained.migrations} > natural ${natural.migrations}`);
console.log(`  * sustained profile: ${sustained.attacks} attacks, ${sustained.lawViolated} violations, ${sustained.factionReactions} reactions, ${sustained.migrations} migrations: PASS`);

// ---------------------------------------------------------------- section 3
// Determinism: identical seed, identical profile - twice each.
const naturalReplay = runProfile({ sustained: false });
const sustainedReplay = runProfile({ sustained: true });
check(JSON.stringify(naturalReplay) === JSON.stringify(natural),
    `natural profile is deterministic across replays (${JSON.stringify({ attacks: natural.attacks, migrations: natural.migrations })} vs ${JSON.stringify({ attacks: naturalReplay.attacks, migrations: naturalReplay.migrations })})`);
check(JSON.stringify(sustainedReplay) === JSON.stringify(sustained),
    `sustained profile is deterministic across replays (${JSON.stringify({ attacks: sustained.attacks, migrations: sustained.migrations })} vs ${JSON.stringify({ attacks: sustainedReplay.attacks, migrations: sustainedReplay.migrations })})`);
console.log('  * determinism: both profiles replay identically from the fixed seed: PASS');

console.log('');
console.log(`All ${checks} scenario-differentiation assertions PASSED.`);
