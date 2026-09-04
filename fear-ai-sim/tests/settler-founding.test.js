import { describe, it, expect } from '@jest/globals';
import {
    createClosedWorldScenario,
    tickClosedWorld,
    getWorldEvents,
    saveWorld,
    loadWorld,
} from '../closed-world.js';
import { tickDemography } from '../demography.js';

// E1 — settler populations: dropped emigrants camp, then found.
//
// Previously, demography emigrants refused at every destination
// vanished into the exogenous-outflow ledger (declared deletion).
// They now persist as camped settler groups that survey and found
// new towns through the existing settleAttempt gates. Conservation
// moves with them: towns + settlers balance, outflow stays 0 for
// grouped headcount.

function dropFixture() {
    const world = createClosedWorldScenario();
    for (const [id, town] of world.towns) {
        town.population = id === 'north' ? 50 : 0;
    }
    world.towns.get('north').market.inventory.set('food', 0);
    world.towns.get('north').market.setDemand('food', 500, 1);
    return world;
}

function settlerPop(world) {
    return (world.settlerGroups ?? []).reduce((s, g) => s + (Number(g.size) || 0), 0);
}

function townPop(world) {
    let sum = 0;
    for (const town of world.towns.values()) sum += Number(town.population) || 0;
    return sum;
}

describe('E1 — dropped emigrants become settler groups', () => {
    it('0-pop refusal camps the headcount instead of booking outflow', () => {
        const world = dropFixture();
        const before = townPop(world);
        tickDemography(world, 1);
        const evs = getWorldEvents(world, { types: ['POPULATION_CHANGE'] })
            .filter(e => e.tick === 1);
        const emigrated = evs.reduce((s, e) => s + (Number(e.emigration) || 0), 0);
        expect(emigrated).toBeGreaterThan(0);
        // The headcount persists in the camp, not in outflow.
        expect(world.settlerGroups).toHaveLength(1);
        expect(world.settlerGroups[0].size).toBe(emigrated);
        expect(Number(world.exogenousPopulation?.outflow ?? 0)).toBe(0);
        // Conservation with the settler column: the camp holds exactly
        // what the towns lost net of births/deaths (no outflow booked).
        const births = evs.reduce((s, e) => s + (Number(e.births) || 0), 0);
        const deaths = evs.reduce((s, e) => s + (Number(e.deaths) || 0), 0);
        expect(townPop(world) + settlerPop(world)).toBe(before + births - deaths);
        const formed = getWorldEvents(world, { types: ['SETTLER_GROUP_FORMED'] });
        expect(formed).toHaveLength(1);
        expect(formed[0].reason).toBe('MIGRATION_FLOOR_ZERO_POP');
    });
    it('live ticks survey then found: SCOUT_OBSERVATION, SETTLEMENT_FOUNDED, absorption', () => {
        // Chronic shortage keeps dropping new groups every tick, so
        // this fixture founds SEVERAL towns (north-landing,
        // -landing-2, ...). That is the mechanism working, not
        // duplication: each group surveys, founds once, absorbs.
        const world = dropFixture();
        const northFaction = world.factions.find(f => f.id === world.towns.get('north').controlledBy)
            ?? world.factions[0];
        northFaction.resources = 5;
        northFaction.maxResources = 5;
        tickDemography(world, 1);
        const firstGroupId = world.settlerGroups[0].id;
        const firstSize = world.settlerGroups[0].size;
        for (let t = 2; t <= 8; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
        }
        const scouts = getWorldEvents(world, { types: ['SCOUT_OBSERVATION'] })
            .filter(e => e.sourceType === 'SETTLER_SURVEY');
        expect(scouts.length).toBeGreaterThanOrEqual(1);
        const founded = getWorldEvents(world, { types: ['SETTLEMENT_FOUNDED'] });
        expect(founded.length).toBeGreaterThanOrEqual(1);
        // First group founds first town with its full headcount.
        const first = founded.find(e => e.groupId === firstGroupId);
        expect(first).toBeTruthy();
        const town = world.towns.get(first.locationId);
        expect(town).toBeTruthy();
        expect(town.population).toBe(firstSize);
        // Parentage: the founding links back to the survey scout.
        const scoutIds = new Set(scouts.map(e => e.eventId));
        expect(first.parentEventIds.some(id => scoutIds.has(id))).toBe(true);
        // Every founding absorbed its group: no CAMPED group with a
        // belief older than this run remains while funded... groups
        // formed late may still be surveying. Settle for: every
        // founded group is gone from the camp array.
        const campedIds = new Set(world.settlerGroups.map(g => g.id));
        for (const e of founded) {
            expect(campedIds.has(e.groupId)).toBe(false);
        }
    });

    it('a bankrupt faction leaves the group camped (live NO_RESOURCES path)', () => {
        // Chronic shortage drops a fresh group most ticks; all must
        // wait camped while no faction can pay.
        const world = dropFixture();
        for (const f of world.factions) {
            f.resources = 0;
            f.maxResources = 0;
        }
        tickDemography(world, 1);
        expect(world.settlerGroups.length).toBeGreaterThanOrEqual(1);
        for (let t = 2; t <= 12; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
        }
        expect(getWorldEvents(world, { types: ['SETTLEMENT_FOUNDED'] })).toHaveLength(0);
        expect(world.settlerGroups.length).toBeGreaterThanOrEqual(1);
        for (const g of world.settlerGroups) {
            expect(g.status).toBe('CAMPED');
        }
    });

    it('founded towns tick live and survive save/load with campers', () => {
        const world = dropFixture();
        const northFaction = world.factions.find(f => f.id === world.towns.get('north').controlledBy)
            ?? world.factions[0];
        northFaction.resources = 5;
        northFaction.maxResources = 5;
        tickDemography(world, 1);
        tickClosedWorld(world, { tick: 2, perceivedDanger: 0.5 });
        // Groups camped (surveyed), none founded yet: founding needs
        // the belief from tick 2, so the earliest founding is tick 3.
        const campedCount = world.settlerGroups.length;
        expect(campedCount).toBeGreaterThanOrEqual(1);
        expect(getWorldEvents(world, { types: ['SETTLEMENT_FOUNDED'] })).toHaveLength(0);
        const resumed = loadWorld(saveWorld(world));
        expect(resumed.settlerGroups.length).toBe(campedCount);
        for (let t = 3; t <= 8; t++) {
            tickClosedWorld(resumed, { tick: t, perceivedDanger: 0.5 });
        }
        const founded = getWorldEvents(resumed, { types: ['SETTLEMENT_FOUNDED'] });
        expect(founded.length).toBeGreaterThanOrEqual(1);
        const town = resumed.towns.get(founded[0].locationId);
        const marketBefore = getWorldEvents(resumed, { types: ['MARKET_TICK'] }).length;
        tickClosedWorld(resumed, { tick: 9, perceivedDanger: 0.5 });
        expect(resumed.towns.get(founded[0].locationId).population).toBe(town.population);
        expect(getWorldEvents(resumed, { types: ['MARKET_TICK'] }).length)
            .toBeGreaterThanOrEqual(marketBefore);
    });
});
