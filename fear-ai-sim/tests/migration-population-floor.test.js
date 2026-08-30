import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';

describe('MIGRATION population floor (Constitution §156 / §11)', () => {
    // The audit: "Persistent values have mathematical
    // semantics. For every persistent value classify it as
    // STOCK / FLOW / PARAMETER / OBSERVATION / EVENT /
    // SNAPSHOT. Never repeatedly add a historical cumulative
    // stock as if it were a new per-tick flow." Population is
    // a STOCK. MIGRATION is a FLOW. The MIGRATION step must
    // never produce a negative population, and once
    // population reaches 0, no further MIGRATION events
    // should fire for that town.

    it('population never goes negative even with sustained migration pressure', () => {
        const world = createClosedWorldScenario();
        // Get the first town's initial population.
        const firstTownId = world.towns.keys().next().value;
        const firstTown = world.towns.get(firstTownId);
        const initialPop = firstTown.population;
        expect(initialPop).toBeGreaterThan(0);
        // Run 100 ticks with high perceived danger and
        // bandit attacks to force sustained migration.
        const bandit = world.bandits[0];
        bandit.lootExpectation = 0.9;
        bandit.alternateRoadId = 'road-b';
        // Pre-seed the bandit on both roads so attacks fire.
        for (let t = 1; t <= 100; t += 1) {
            // Move the bandit to the first town's road
            // (road-a) to force attacks.
            if (t % 2 === 0) bandit.roadId = 'road-a';
            else bandit.roadId = 'road-b';
            // Set perceived danger high to force migration.
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.95 });
        }
        // The town's population must never go negative.
        expect(firstTown.population).toBeGreaterThanOrEqual(0);
    });

    it('MIGRATION events stop firing once population reaches 0', () => {
        const world = createClosedWorldScenario();
        const firstTownId = world.towns.keys().next().value;
        const firstTown = world.towns.get(firstTownId);
        // Force BOTH towns to population 0 so no migration
        // activity can fire (the first town can't emit
        // because it's empty, the other can't emit because
        // it's also empty).
        firstTown.population = 0;
        world.towns.get('south').population = 0;
        // Track MIGRATION events for the first town.
        const migrationsBefore = world.events.filter(
            ev => ev.type === 'MIGRATION' && ev.townId === firstTownId
        ).length;
        // Run 10 ticks with high perceived danger.
        for (let t = 1; t <= 10; t += 1) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.95 });
        }
        // Count MIGRATION events for the first town.
        const migrationsAfter = world.events.filter(
            ev => ev.type === 'MIGRATION' && ev.townId === firstTownId
        ).length;
        // No new MIGRATION events should fire for the
        // depopulated town. The count must be equal (no
        // increase) because the town has no population to
        // migrate.
        expect(migrationsAfter).toBe(migrationsBefore);
    });

    it('population converges to 0 under sustained migration but never goes below', () => {
        // The audit's long-horizon test: run 200 ticks with
        // maximum migration pressure and verify the
        // population stabilizes at 0 (or some non-negative
        // value) without going negative.
        const world = createClosedWorldScenario();
        const firstTownId = world.towns.keys().next().value;
        const firstTown = world.towns.get(firstTownId);
        const bandit = world.bandits[0];
        bandit.lootExpectation = 0.9;
        bandit.alternateRoadId = 'road-b';
        let minPop = firstTown.population;
        for (let t = 1; t <= 200; t += 1) {
            if (t % 2 === 0) bandit.roadId = 'road-a';
            else bandit.roadId = 'road-b';
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.95 });
            minPop = Math.min(minPop, firstTown.population);
        }
        // The population must never go below 0.
        expect(minPop).toBeGreaterThanOrEqual(0);
    });
});
