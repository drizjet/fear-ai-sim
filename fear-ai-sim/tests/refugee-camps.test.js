import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, saveWorld, loadWorld } from '../closed-world.js';
import { encounterCatalog, instantiateEncounter } from '../encounters.js';

// E7 — refugee camps. War displacement no longer teleports into town
// population for free: arrivals camp at the destination (visible,
// countable, eating) and integrate one head per tick. Camped mouths
// consume town food before they produce, so displacement costs.

function griefWorld() {
    const world = createClosedWorldScenario({ season: 'SUMMER' });
    world.ticksPerSeason = 10000;
    world.factions[0].grievance = 0.9;
    return world;
}

function arrive(world, tick) {
    const template = encounterCatalog().find(t => t.id === 'refugee-group');
    return instantiateEncounter(template, world, { tick, rng: () => 0.5, parentEventIds: [] });
}

function campedAt(world, townId) {
    return (world.refugeeCamps ?? []).filter(c => c.townId === townId && c.status === 'CAMPED');
}

describe('E7 refugee camps', () => {
    it('arrival camps instead of instantly growing the town', () => {
        const world = griefWorld();
        const before = world.towns.get('north').population;
        const r1 = arrive(world, 1);
        const r2 = arrive(world, 2);
        expect(r1?.refugeeCount).toBeGreaterThan(0);
        expect(r2?.refugeeCount).toBeGreaterThan(0);
        // Nobody teleports: the town holds exactly who it held.
        expect(world.towns.get('north').population).toBe(before);
        const camps = campedAt(world, 'north');
        expect(camps.length).toBe(2);
        expect(camps.reduce((s, c) => s + c.size, 0))
            .toBe(r1.refugeeCount + r2.refugeeCount);
        expect(r1.campId).toBe(camps[0].id);
        // The heads entered the world: the exogenous ledger still owns them.
        expect(world.exogenousPopulation?.inflow ?? 0)
            .toBe(r1.refugeeCount + r2.refugeeCount);
    });

    it('camps integrate one head per tick until empty, then close exactly once', () => {
        const world = griefWorld();
        world.factions[0].grievance = 1.0;
        const r = arrive(world, 1);
        const total = r.refugeeCount;
        expect(total).toBeGreaterThan(1);
        const before = world.towns.get('north').population;
        for (let t = 1; t <= total; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.0 });
            const integrated = world.towns.get('north').population - before;
            expect(integrated).toBe(Math.min(t, total));
        }
        expect(campedAt(world, 'north').length).toBe(0);
        const closed = world.events.filter(e =>
            e.type === 'REFUGEE_INTEGRATED' && e.campId === r.campId);
        expect(closed.length).toBe(1);
        expect(closed[0].integrated).toBe(total);
    });

    it('camped mouths consume town food before they produce', () => {
        const fed = griefWorld();
        const bare = createClosedWorldScenario({ season: 'SUMMER' });
        bare.ticksPerSeason = 10000;
        for (const world of [fed, bare]) {
            const north = world.towns.get('north');
            north.population = 10;
            north.market.setCapacity('food', 500);
            north.market.inventory.set('food', 200);
        }
        arrive(fed, 1);
        arrive(fed, 2);
        const camped = campedAt(fed, 'north').reduce((s, c) => s + c.size, 0);
        expect(camped).toBeGreaterThan(0);
        tickClosedWorld(fed, { tick: 1, perceivedDanger: 0.0 });
        tickClosedWorld(bare, { tick: 1, perceivedDanger: 0.0 });
        // Same heads working, extra mouths eating: the camped town's
        // food demand prices the campers while production does not.
        expect(fed.towns.get('north').market.getQuote('food').demand)
            .toBe(bare.towns.get('north').market.getQuote('food').demand + camped);
    });

    it('towns plus camps conserve heads against the exogenous ledger', () => {
        const world = griefWorld();
        const headcount = () => {
            let k = 0;
            for (const town of world.towns.values()) k += Number(town.population) || 0;
            for (const camp of world.refugeeCamps ?? []) k += Number(camp.size) || 0;
            return k - (Number(world.exogenousPopulation?.inflow) || 0)
                + (Number(world.exogenousPopulation?.outflow) || 0);
        };
        const baseline = headcount();
        arrive(world, 1);
        arrive(world, 2);
        expect(headcount()).toBe(baseline);
        for (let t = 1; t <= 10; t++) tickClosedWorld(world, { tick: t, perceivedDanger: 0.0 });
        expect(headcount()).toBe(baseline);
    });

    it('camps survive save/load with identical follow-up integration', () => {
        const world = griefWorld();
        arrive(world, 1);
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        const resumed = loadWorld(saveWorld(world));
        expect((resumed.refugeeCamps ?? []).length).toBe((world.refugeeCamps ?? []).length);
        for (let t = 2; t <= 8; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.0 });
            tickClosedWorld(resumed, { tick: t, perceivedDanger: 0.0 });
        }
        expect(resumed.towns.get('north').population)
            .toBe(world.towns.get('north').population);
        expect(campedAt(resumed, 'north').length).toBe(campedAt(world, 'north').length);
    });

    it('arrivals skip an abandoned first town for live ground', () => {
        const world = griefWorld();
        world.towns.get('north').abandoned = true;
        const r = arrive(world, 1);
        expect(r?.refugeeCount).toBeGreaterThan(0);
        expect(campedAt(world, 'north').length).toBe(0);
        expect(campedAt(world, 'south').length).toBe(1);
    });
});
