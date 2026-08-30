// tests/demography-system.test.js
//
// EVID-2026-08-29-DEMOGRAPHY
//
// Per FEAR_LONG_TERM_GOAL.md §14: population accounting driven
// by ecology + scarcity. The test exercises:
//   1. tickClosedWorld applies per-tick per-town population
//      update via tickDemography;
//   2. POPULATION_CHANGE structured events are emitted;
//   3. winter + high scarcity produce emigration > 0;
//   4. conservation: births + immigration - deaths - emigration
//      == newPopulation - previousPopulation (for the town with
//      no external migration, immigration is 0).

import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';
import { tickDemography, computeDemographicUpdate } from '../demography.js';

describe('demography system (EVID-2026-08-29-DEMOGRAPHY)', () => {

    it('computeDemographicUpdate returns a structured result for a normal town', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        const update = computeDemographicUpdate(world, 'north', 1);
        expect(update).toBeDefined();
        expect(update.townId).toBe('north');
        expect(update.previousPopulation).toBeGreaterThanOrEqual(1);
        expect(update.births).toBeGreaterThanOrEqual(0);
        expect(update.deaths).toBeGreaterThanOrEqual(0);
        expect(update.emigration).toBeGreaterThanOrEqual(0);
        expect(update.newPopulation).toBeGreaterThanOrEqual(0);
    });

    it('POPULATION_CHANGE event is emitted by tickClosedWorld', () => {
        // Use a larger population so any demographic event is
        // visible (small populations may have births = 0).
        const world = createClosedWorldScenario({ season: 'SPRING' });
        world.towns.get('north').population = 100;
        for (let i = 1; i <= 30; i++) {
            tickClosedWorld(world, { tick: i, perceivedDanger: 0.1 });
        }
        const popEvents = world.events.filter(e => e.type === 'POPULATION_CHANGE');
        expect(popEvents.length).toBeGreaterThan(0);
        const ev = popEvents[0];
        expect(ev).toHaveProperty('previousPopulation');
        expect(ev).toHaveProperty('newPopulation');
        expect(ev).toHaveProperty('births');
        expect(ev).toHaveProperty('deaths');
        expect(ev).toHaveProperty('emigration');
    });

    it('high scarcity + winter produces emigration > 0', () => {
        // Force a winter + high-scarcity scenario.
        const world = createClosedWorldScenario({ season: 'WINTER' });
        world.towns.get('north').population = 1000;
        // Drain the food inventory and set a high demand to force shortage.
        const market = world.towns.get('north').market;
        market.inventory.set('food', 0);
        market.setDemand('food', 1000, 10);
        tickDemography(world, 1);
        const popEvents = world.events.filter(e => e.type === 'POPULATION_CHANGE' && e.townId === 'north');
        expect(popEvents.length).toBe(1);
        expect(popEvents[0].emigration).toBeGreaterThan(0);
    });

    it('conservation: births - deaths - emigration == newPopulation - previousPopulation', () => {
        const world = createClosedWorldScenario({ season: 'SPRING' });
        world.towns.get('north').population = 100;
        for (let i = 1; i <= 10; i++) {
            tickDemography(world, i);
        }
        const ev = world.events.find(e => e.type === 'POPULATION_CHANGE' && e.townId === 'north');
        expect(ev).toBeDefined();
        const computed = ev.births - ev.deaths - ev.emigration;
        const observed = ev.newPopulation - ev.previousPopulation;
        expect(computed).toBe(observed);
    });

    it('migration: emigrants from a short town arrive at a less-short town', () => {
        // EVID-2026-08-29-MIGRATION: when a town has high food
        // scarcity, its emigrants are routed to the destination
        // town with the lowest shortage. The receiving town
        // gets a POPULATION_CHANGE event with immigration > 0.
        // The exact delta may be reduced by the receiver's
        // own emigration in the same tick; the invariant we
        // check is: SOME emigrant arrived at a less-short town.
        const world = createClosedWorldScenario({ season: 'WINTER' });
        const north = world.towns.get('north');
        const south = world.towns.get('south');
        north.population = 1000;
        south.population = 1000;
        const northMarket = north.market;
        northMarket.inventory.set('food', 0);
        northMarket.setDemand('food', 1000, 10);
        // Boost south's inventory so it is clearly the less-short
        // destination.
        const southMarket = south.market;
        southMarket.inventory.set('food', 100000);
        southMarket.setDemand('food', 10, 10);
        tickDemography(world, 1);
        // North should have a POPULATION_CHANGE with emigration > 0.
        const northEvent = world.events.find(e => e.type === 'POPULATION_CHANGE' && e.townId === 'north');
        expect(northEvent).toBeDefined();
        expect(northEvent.emigration).toBeGreaterThan(0);
        // South should have received the emigrants (it has lower
        // shortage so it is the preferred destination).
        const southEvent = world.events.find(e => e.type === 'POPULATION_CHANGE' && e.townId === 'south' && (e.immigration || 0) > 0);
        expect(southEvent).toBeDefined();
        // The immigration count should equal the north emigration
        // count (the receiver has a near-zero shortage, so its
        // own emigration is 0 in this scenario).
        expect(southEvent.immigration).toBe(northEvent.emigration);
    });

    it('global conservation: sum of all town populations is preserved minus deaths (migration is just transfer)', () => {
        // EVID-2026-08-29-MIGRATION: when emigrants from north
        // arrive at south, the SUM of all town populations is
        // reduced only by deaths (not by emigration). Emigration
        // is a transfer; the population that leaves one town
        // arrives at another.
        const world = createClosedWorldScenario({ season: 'SPRING' });
        // Force ONLY north to have emigration by giving it high
        // shortage and south very low shortage.
        const north = world.towns.get('north');
        const south = world.towns.get('south');
        north.population = 1000;
        south.population = 1000;
        const northMarket = north.market;
        northMarket.inventory.set('food', 0);
        northMarket.setDemand('food', 1000, 10);
        const southMarket = south.market;
        southMarket.inventory.set('food', 100000);
        southMarket.setDemand('food', 1, 10);
        const beforeSum = north.population + south.population;
        tickDemography(world, 1);
        const afterSum = north.population + south.population;
        // Sum decreases only by deaths (not by emigration, which
        // is a transfer).
        const popEvents = world.events.filter(e => e.type === 'POPULATION_CHANGE');
        const totalDeaths = popEvents.reduce((s, e) => s + (e.deaths || 0), 0);
        const totalBirths = popEvents.reduce((s, e) => s + (e.births || 0), 0);
        expect(afterSum).toBe(beforeSum - totalDeaths + totalBirths);
    });
});
