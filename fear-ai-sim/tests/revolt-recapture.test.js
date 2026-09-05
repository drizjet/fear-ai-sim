import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent, saveWorld, loadWorld } from '../closed-world.js';
import { StanceLadder } from '../factionrelationship.js';

// E14 — revolt and recapture from within. Occupation plus sustained
// brutalization snaps: the town throws off its controller and
// restores its prior ruler (or stands independent), at cost in
// lives and garrison resources. Content occupations and free
// towns never snap, no matter the background noise.

function conqueredWorld() {
    const world = createClosedWorldScenario({ season: 'SUMMER' });
    world.ticksPerSeason = 10000;
    const north = world.factions.find(f => f.id === 'north-faction');
    const south = world.factions.find(f => f.id === 'south-faction');
    const pair = world.relationships.get('north-faction::south-faction');
    north.grievance = 1;
    north.lastDecision = 'RAID';
    north.resources = 5;
    north.maxResources = 5;
    north.informationConfidence = 1;
    south.resources = 1;
    south.maxResources = 5;
    world.towns.get('south').population = 30;
    pair.setTrustFrom('north-faction', 0);
    pair.setGrievanceFrom('north-faction', 1);
    pair.setFearFrom('north-faction', 1);
    pair.setTerritorialPressureFrom('north-faction', 1);
    pair.observeFrom('north-faction', StanceLadder.WAR, 0);
    tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0, encounterRng: () => 0.999 });
    expect(world.towns.get('south').controlledBy).toBe('north-faction');
    return world;
}

function brutalize(world, from, to) {
    for (let t = from; t <= to; t++) {
        world.towns.get('south').market.inventory.set('food', 0);
        appendWorldEvent(world, {
            type: 'BANDIT_ATTACK', roadId: 'road-b', banditId: 'bx',
            merchantId: 'm1', lost: 5, tick: t, attackOpportunityId: `brut-${t}`,
        });
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.9, encounterRng: () => 0.999 });
    }
}

describe('E14 revolt and recapture from within', () => {
    it('a brutalized occupation revolts: control reverts at cost, exactly once', () => {
        const world = conqueredWorld();
        const north = world.factions.find(f => f.id === 'north-faction');
        brutalize(world, 2, 15);
        const revolts = world.events.filter(e => e.type === 'TOWN_REVOLT' && e.townId === 'south');
        expect(revolts.length).toBeGreaterThan(0);
        const first = revolts[0];
        expect(first).toMatchObject({ fromFactionId: 'north-faction', toFactionId: 'south-faction' });
        expect(world.towns.get('south').controlledBy).toBe('south-faction');
        expect(world.towns.get('south').occupation ?? null).toBeNull();
        expect(first.populationLost).toBeGreaterThan(0);
        // One snap per occupation: further brutalization finds no
        // occupation to detonate (re-takeover would be a new one).
        brutalize(world, 16, 40);
        expect(world.events.filter(e => e.type === 'TOWN_REVOLT' && e.townId === 'south').length)
            .toBe(revolts.length);
        expect(north.resources).toBeLessThanOrEqual(5);
    });

    it('a content occupation never snaps (negative control)', () => {
        const world = conqueredWorld();
        for (let t = 2; t <= 60; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.0, encounterRng: () => 0.999 });
        }
        expect(world.towns.get('south').controlledBy).toBe('north-faction');
        expect(world.events.some(e => e.type === 'TOWN_REVOLT')).toBe(false);
    });

    it('a brutalized free town never revolts (negative control)', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        world.towns.get('south').population = 30;
        brutalize(world, 1, 20);
        expect(world.towns.get('south').controlledBy).toBe('south-faction');
        expect(world.events.some(e => e.type === 'TOWN_REVOLT')).toBe(false);
    });

    it('revolt survives save/load with identical follow-up control', () => {
        const world = conqueredWorld();
        brutalize(world, 2, 6);
        const resumed = loadWorld(saveWorld(world));
        brutalize(world, 7, 15);
        brutalize(resumed, 7, 15);
        expect(resumed.towns.get('south').controlledBy)
            .toBe(world.towns.get('south').controlledBy);
        const count = w => w.events.filter(e => e.type === 'TOWN_REVOLT').length;
        expect(count(resumed)).toBe(count(world));
    });
});
