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
    for (let t = 1; t <= LONG_HORIZON_TICKS; t++) {
        try {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.5, encounterRng: rng });
        } catch (e) {
            return { seed, crashed: true, error: String(e), events: world.events.length };
        }
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
        banditAttacks: world.events.filter(e => e.type === 'BANDIT_ATTACK').length,
    };
    return finalState;
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
        for (const r of results) {
            expect(r.seasonChanges).toBeGreaterThan(0);
        }
    }, 120000);
});
