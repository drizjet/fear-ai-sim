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
        // Tick until the snap (max 15); stop there — continued
        // brutalization past the restore belongs to E15's secession
        // path, pinned in secession-fragmentation.test.js.
        let revoltTick = -1;
        for (let t = 2; t <= 15; t++) {
            world.towns.get('south').market.inventory.set('food', 0);
            appendWorldEvent(world, {
                type: 'BANDIT_ATTACK', roadId: 'road-b', banditId: 'bx',
                merchantId: 'm1', lost: 5, tick: t, attackOpportunityId: `brut-${t}`,
            });
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.9, encounterRng: () => 0.999 });
            if (world.events.some(e => e.type === 'TOWN_REVOLT' && e.townId === 'south')) {
                revoltTick = t;
                break;
            }
        }
        expect(revoltTick).toBeGreaterThan(0);
        const revolts = world.events.filter(e => e.type === 'TOWN_REVOLT' && e.townId === 'south');
        expect(revolts.length).toBe(1);
        const first = revolts[0];
        expect(first).toMatchObject({ fromFactionId: 'north-faction', toFactionId: 'south-faction' });
        expect(world.towns.get('south').controlledBy).toBe('south-faction');
        expect(world.towns.get('south').occupation ?? null).toBeNull();
        expect(first.populationLost).toBeGreaterThan(0);
        expect(north.resources).toBeLessThanOrEqual(5);
    });

    it('a brutalized free town never revolts (negative control)', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        world.towns.get('south').population = 30;
        brutalize(world, 1, 20);
        // No occupation, no revolt — but E15 gives the brutalized
        // free town its own exit: it secedes instead of restoring.
        expect(world.events.some(e => e.type === 'TOWN_REVOLT')).toBe(false);
        expect(world.towns.get('south').controlledBy).toBeNull();
        expect(world.events.some(e => e.type === 'SECESSION' && e.townId === 'south')).toBe(true);
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
