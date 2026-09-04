// tests/long-horizon-5000tick.test.js
//
// EVID-2026-08-29-LONG-HORIZON
//
// Per FEAR_LONG_TERM_GOAL.md §40: 5000+ tick runs are the next
// acceptance test after the 50/100/500/1000 ladder. This file
// runs the canonical trade loop (tickClosedWorld) for 5000
// ticks with a few seeds and reports:
//   - tick duration (mean / p95 / max)
//   - event log size
//   - world state drift (population, market inventory, bandit road)
//   - any crash, NaN, Infinity, or negative inventory
//
// Failures here are not test failures per se; they are
// observations that need to be addressed. The assertions are
// loose (the world should be coherent after 5000 ticks, not
// produce NaN or throw).

import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';

const LONG_HORIZON_TICKS = 5000;
const SEEDS = [1, 2, 3];

function runLongHorizon(seed) {
    const world = createClosedWorldScenario({ season: 'SPRING' });
    world.ticksPerSeason = 100; // 50 seasons over 5000 ticks
    const bandit = world.bandits[0];
    bandit.trafficBelief = {
        'road-a': { estimatedTraffic: 3, recency: 0.8 },
        'road-b': { estimatedTraffic: 1, recency: 0.5 },
        'road-c': { estimatedTraffic: 0, recency: 0.1 },
    };
    bandit.roadId = 'road-b';
    bandit.relocationThreshold = 0.1;
    // Bigger starting population so the demography loop has
    // something to chew on.
    world.towns.get('north').population = 100;
    world.towns.get('south').population = 100;
    const rng = (() => {
        let state = seed >>> 0 || 1;
        return () => {
            state ^= state << 13; state >>>= 0;
            state ^= state >>> 17;
            state ^= state << 5; state >>>= 0;
            return state / 0x100000000;
        };
    })();
    let nanFound = false;
    let negativeInventory = false;
    const tickStart = process.hrtime.bigint();
    let maxTickMs = 0;
    for (let t = 1; t <= LONG_HORIZON_TICKS; t++) {
        const oneStart = process.hrtime.bigint();
        try {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.5, encounterRng: rng });
        } catch (e) {
            return { seed, crashed: true, error: String(e), events: world.events.length };
        }
        // A5-F7: per-tick worst case, not just the mean. A hanging
        // tick hides inside a healthy mean; the tripwire is generous
        // (10s vs observed ~1ms) — catastrophic only.
        maxTickMs = Math.max(maxTickMs, Number(process.hrtime.bigint() - oneStart) / 1e6);
        // Spot-check: any NaN in inventory or population?
        for (const [townId, town] of world.towns) {
            const pop = town.population;
            if (!Number.isFinite(pop)) nanFound = true;
            if (pop < 0) nanFound = true;
            if (town.market && town.market.inventory) {
                for (const [kind, amount] of town.market.inventory) {
                    if (!Number.isFinite(amount) || amount < 0) negativeInventory = true;
                }
            }
        }
    }
    const tickEnd = process.hrtime.bigint();
    const totalMs = Number(tickEnd - tickStart) / 1e6;
    const finalState = {
        seed,
        maxTickMs,
        crashed: false,
        nanFound,
        negativeInventory,
        totalMs,
        msPerTick: totalMs / LONG_HORIZON_TICKS,
        events: world.events.length,
        finalSeason: world.season,
        finalPopulation: world.towns.get('north').population + world.towns.get('south').population,
        finalNorthFood: world.towns.get('north').market.inventory.get('food') ?? 0,
        finalSouthFood: world.towns.get('south').market.inventory.get('food') ?? 0,
        finalBanditRoad: world.bandits[0].roadId,
        seasonChanges: world.events.filter(e => e.type === 'SEASON_CHANGE').length,
        banditRelocations: world.events.filter(e => e.type === 'BANDIT_RELOCATION').length,
        populationChanges: world.events.filter(e => e.type === 'POPULATION_CHANGE').length,
        routeDecisions: world.events.filter(e => e.type === 'MERCHANT_ROUTE_DECISION').length,
        tripCommitments: world.events.filter(e => e.type === 'TRIP_COMMITMENT').length,
        cargoDeliveries: world.events.filter(e => e.type === 'PENDING_CARGO_DELIVERED').length,
        banditAttacks: world.events.filter(e => e.type === 'BANDIT_ATTACK').length,
    };
    return finalState;
}

// A5-F1 activity floors (anti-stasis tripwires, fixture-calibrated
// 2026-09-05: seed-1 census gives 5000 decisions, 5000 commitments,
// 989 deliveries, 3706 encounters, 1572 invasions, 1 relocation,
// 0 bandit attacks). Floors sit an order of magnitude below the
// live counts. They fail a frozen world (see the agency-free
// contrast test below) while the old crash/NaN/season gates pass
// it — that gap is exactly the audit finding.
//
// The 0-attack stalemate is NOT floored here: the bandit sits on
// road-a for 5000 ticks while trade flows elsewhere (deterrence
// equilibrium or initiative failure — owned by A5-F5, with the
// count logged below as its input). Flooring attacks>0 on this
// fixture would invent vigor the mechanism does not have.
function expectLiveActivity(r) {
    expect(r.routeDecisions).toBeGreaterThanOrEqual(2500);
    expect(r.tripCommitments).toBeGreaterThanOrEqual(2500);
    expect(r.cargoDeliveries).toBeGreaterThanOrEqual(100);
    expect(r.banditRelocations).toBeGreaterThanOrEqual(1);
    expect(r.maxTickMs).toBeLessThan(10000);
    expect(r.seasonChanges).toBeGreaterThan(0);
}

describe('long-horizon 5000-tick run (EVID-2026-08-29-LONG-HORIZON)', () => {

    it('5000 ticks complete without crash across 3 seeds', () => {
        // EVID-2026-08-29-LONG-HORIZON: the canonical trade
        // loop must remain coherent over 5000 ticks. Any
        // crash, NaN, or negative inventory is a P0 defect.
        const results = [];
        for (const seed of SEEDS) {
            const r = runLongHorizon(seed);
            results.push(r);
            // The loop must not crash, must not produce NaN, and
            // must not produce negative inventory.
            expect(r.crashed).toBe(false);
            expect(r.nanFound).toBe(false);
            expect(r.negativeInventory).toBe(false);
        }
        // Cross-seed summary.
        const meanMs = results.reduce((s, r) => s + r.msPerTick, 0) / results.length;
        const meanEvents = results.reduce((s, r) => s + r.events, 0) / results.length;
        // Report to console for human inspection.
        // eslint-disable-next-line no-console
        console.log(`LONG-HORIZON-5000: ${results.length} seeds, mean ms/tick=${meanMs.toFixed(4)}, mean events=${meanEvents.toFixed(0)}`);
        for (const r of results) {
            // eslint-disable-next-line no-console
            console.log(`  seed=${r.seed} events=${r.events} season=${r.finalSeason} pop=${r.finalPopulation} northFood=${r.finalNorthFood.toFixed(1)} southFood=${r.finalSouthFood.toFixed(1)} banditRoad=${r.finalBanditRoad} seasonChanges=${r.seasonChanges} relocations=${r.banditRelocations} attacks=${r.banditAttacks} ms/tick=${r.msPerTick.toFixed(3)}`);
        }
        // The world must remain coherent: at least one season
        // change must have fired (proving the season loop is
        // running) and at least one bandit relocation (proving
        // the bandit is responsive).
        // A5-F1: activity floors — a frozen world passes the
        // crash/NaN gates above but fails these.
        for (const r of results) {
            expectLiveActivity(r);
        }
        // A5-F1/F7: seeds must genuinely vary the world (R5 lesson:
        // identical worlds measured a constant). Event totals and
        // delivery counts differ across seeds.
        expect(new Set(results.map(r => r.events)).size).toBeGreaterThan(1);
        // A5-F7 rates with exposure denominators, logged per seed.
        for (const r of results) {
            // eslint-disable-next-line no-console
            console.log(`  seed=${r.seed} attacks/encounter=${(r.banditAttacks / Math.max(1, r.routeDecisions)).toFixed(4)} deliveries/commitment=${(r.cargoDeliveries / Math.max(1, r.tripCommitments)).toFixed(3)} relocations=${r.banditRelocations} attacks=${r.banditAttacks}`);
        }
    }, 120000);

    it('agency-free world passes coherence gates but fails every activity floor (contrast)', () => {
        // A5-F1 contrast: strip bandits and merchants. Seasons,
        // encounters (town-driven types), markets, and demography
        // still tick — the old gates stay green — but every
        // agency-requiring count is structurally zero, failing the
        // floors above. Run the floors against these zeros in
        // scratch to confirm they fire; here pin the zeros.
        const world = createClosedWorldScenario({ season: 'SPRING' });
        world.ticksPerSeason = 100;
        world.bandits = [];
        world.merchants = [];
        world.towns.get('north').population = 100;
        world.towns.get('south').population = 100;
        let crashed = false;
        for (let t = 1; t <= 500; t++) {
            try {
                tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
            } catch (e) {
                crashed = true;
                break;
            }
        }
        // Old gates: still green on a frozen world (the finding).
        expect(crashed).toBe(false);
        expect(world.events.filter(e => e.type === 'SEASON_CHANGE').length).toBeGreaterThan(0);
        // Agency counts: structurally zero — each would fail its
        // corresponding live floor above.
        expect(world.events.filter(e => e.type === 'MERCHANT_ROUTE_DECISION').length).toBe(0);
        expect(world.events.filter(e => e.type === 'PENDING_CARGO_DELIVERED').length).toBe(0);
        expect(world.events.filter(e => e.type === 'BANDIT_RELOCATION').length).toBe(0);
        expect(world.events.filter(e => e.type === 'BANDIT_ATTACK').length).toBe(0);
    });
});
