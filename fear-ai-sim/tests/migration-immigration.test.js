import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';
import { Market } from '../economy.js';

describe('MIGRATION immigration (Constitution §156 / §69)', () => {
    // The audit: "Refugees can: seek settlement entry; create
    // camps; alter labor; increase demand; bring information;
    // trigger political tension; join factions; return home
    // later." The prior MIGRATION slice proved emigration
    // (a town's population drops). This slice proves
    // immigration: the emigrated population appears at
    // another town, closing the §156 population balance on
    // both sides.

    it('MIGRATION events include a toTownId destination', () => {
        const world = createClosedWorldScenario();
        for (let t = 1; t <= 10; t++) {
            world.events.push({ type: 'BANDIT_ATTACK', banditId: 'bandits-1', tick: t, roadId: 'road-a' });
        }
        for (let t = 1; t <= 20; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.8 });
        }
        const migrations = world.events.filter(ev => ev.type === 'MIGRATION');
        expect(migrations.length).toBeGreaterThan(0);
        // Every MIGRATION event must have a toTownId that
        // is different from the townId (the emigrant goes
        // somewhere, not stays).
        for (const m of migrations) {
            expect(m.toTownId).toBeDefined();
            expect(m.toTownId).not.toBe(m.townId);
        }
    });

    it('world total population is conserved across the MIGRATION step', () => {
        // The §156 population balance: emigration +
        // immigration = 0. The world total must stay the
        // same after a MIGRATION event (people move between
        // towns, not out of the world).
        const world = createClosedWorldScenario();
        for (let t = 1; t <= 10; t++) {
            world.events.push({ type: 'BANDIT_ATTACK', banditId: 'bandits-1', tick: t, roadId: 'road-a' });
        }
        let initialTotal = 0;
        for (const [, town] of world.towns) {
            initialTotal += town.population;
        }
        for (let t = 1; t <= 50; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.9 });
        }
        let finalTotal = 0;
        for (const [, town] of world.towns) {
            finalTotal += town.population;
        }
        // R3: close with the booked exogenous terms (massResidual
        // pattern). Tiny pops keep births/deaths at exactly 0.
        const exo = world.exogenousPopulation ?? { inflow: 0, outflow: 0 };
        expect(finalTotal - (exo.inflow ?? 0) + (exo.outflow ?? 0)).toBe(initialTotal);
    });

    it('individual town populations can both increase and decrease across ticks', () => {
        // With the immigration step, a town's population
        // can increase when another town emigrates to it.
        // This is the §69 "refugees can alter labor and
        // bring information" property at the population level.
        // Note: with 2 towns and population 1 each, the
        // oscillation cancels (north→south, then south→north
        // in the same tick). This test uses a 3-town scenario
        // (manually adding a third town) so the oscillation
        // doesn't cancel. The third town is a "neutral"
        // destination that receives emigrants without
        // emitting any.
        //
        // §29 audit (2026-08-28): the per-town migration
        // cooldown (EVID-2026-08-28-MIGRATION-COOLDOWN)
        // means a depopulated town that received an
        // immigrant may itself emit a MIGRATION on a
        // later tick. The right assertion is that the
        // refugee camp *received* at least one immigrant
        // (a positive MIGRATION event with
        // toTownId === 'refugee-camp'), not that its final
        // population is > 0 (which depends on the in/out
        // balance).
        const world = createClosedWorldScenario();
        // Add a third town. It has no market seeds and no
        // attacks on its road, so its migration pressure
        // stays low initially. But with the per-town
        // cooldown, the refugee camp can itself fire
        // MIGRATION on later ticks.
        const refugeeTown = {
            id: 'refugee-camp',
            market: new Market(),
            population: 0,
            consumes: {},
            produces: {}
        };
        world.towns.set('refugee-camp', refugeeTown);
        // Seed attacks only on the north→south road.
        for (let t = 1; t <= 10; t++) {
            world.events.push({ type: 'BANDIT_ATTACK', banditId: 'bandits-1', tick: t, roadId: 'road-a' });
        }
        for (let t = 1; t <= 20; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.9 });
        }
        // The refugee camp must have received at least
        // one immigrant (a MIGRATION event with
        // toTownId === 'refugee-camp'). This proves the
        // §69 "refugees can seek settlement entry" contract
        // at the event level.
        const immigrationsToRefugee = world.events.filter(
            e => e.type === 'MIGRATION' && e.toTownId === 'refugee-camp'
        );
        expect(immigrationsToRefugee.length).toBeGreaterThan(0);
        // The world total is conserved (proves the §156
        // population balance on both sides of the
        // emigration+immigration pair).
        // R3: refugee absorption adds booked inflow on top of the
        // migration pair; the identity closes with it.
        let finalTotal = 0;
        for (const [, town] of world.towns) {
            finalTotal += town.population;
        }
        const exoCamp = world.exogenousPopulation ?? { inflow: 0, outflow: 0 };
        expect(finalTotal - (exoCamp.inflow ?? 0) + (exoCamp.outflow ?? 0)).toBe(2); // north=1, south=1, refugee-camp=0
    });
});
