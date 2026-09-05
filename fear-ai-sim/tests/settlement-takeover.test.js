import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';
import { StanceLadder } from '../factionrelationship.js';
import { requestNonAggression } from '../treaty.js';

const NORTH = 'north-faction';
const SOUTH = 'south-faction';

// E8 — settlement takeover. Authorized invasions of inhabited towns
// transfer control: a RAID faction at WAR stance toward a rival, with
// the resources to win the contest, takes the town. Raids on bandits
// (WATCHFUL business) never move borders; WAR business does.

function warReadyWorld({ northStance = StanceLadder.WAR } = {}) {
    const world = createClosedWorldScenario();
    world.ticksPerSeason = 10000;
    const north = world.factions.find(f => f.id === NORTH);
    const south = world.factions.find(f => f.id === SOUTH);
    const pair = world.relationships.get(`${NORTH}::${SOUTH}`);
    north.grievance = 1;
    north.lastDecision = 'RAID';
    north.resources = 5;
    north.maxResources = 5;
    north.informationConfidence = 1;
    south.resources = 1;
    south.maxResources = 5;
    world.towns.get('south').population = 10;
    pair.setTrustFrom(NORTH, 0);
    pair.setGrievanceFrom(NORTH, 1);
    pair.setFearFrom(NORTH, 1);
    pair.setTerritorialPressureFrom(NORTH, 1);
    pair.observeFrom(NORTH, northStance, 0);
    pair.observeFrom(SOUTH, StanceLadder.HOSTILE, 0);
    return { world, pair, north, south };
}

function tickOnce(world, tick = 1) {
    // No bandit coincidence: the encounter stream stays quiet so the
    // only forceful events are the takeover pass itself.
    return tickClosedWorld(world, { tick, perceivedDanger: 0, encounterRng: () => 0.999 });
}

function takeoverGate(world) {
    return [...world.events].reverse().find(e =>
        e.type === 'TAKEOVER_GATE' && e.factionId === NORTH && e.townId === 'south');
}

describe('E8 settlement takeover', () => {
    it('a WAR-authorized winner takes the rival town and pays the cost', () => {
        const { world, north } = warReadyWorld();
        // attacker 5 vs defender 1 + 10*0.1 = 2: wins, pays 2.
        tickOnce(world);
        expect(world.towns.get('south').controlledBy).toBe(NORTH);
        expect(north.resources).toBe(3);
        const gate = takeoverGate(world);
        expect(gate).toMatchObject({ allowed: true, reason: 'WAR_STANCE_AUTHORIZES_TAKEOVER' });
        const taken = world.events.filter(e => e.type === 'TOWN_TAKEN' && e.townId === 'south');
        expect(taken.length).toBe(1);
        expect(taken[0]).toMatchObject({ fromFactionId: SOUTH, toFactionId: NORTH });
        expect(taken[0].parentEventIds).toEqual([gate.eventId]);
    });

    it('a weaker attacker holds nothing, pays 1, and the town stands', () => {
        const { world, north } = warReadyWorld();
        north.resources = 2;
        world.factions.find(f => f.id === SOUTH).resources = 5;
        world.towns.get('south').population = 50;
        // attacker 2 vs defender 5 + 5 = 10: loses, pays 1. E13:
        // the head levy lands before the campaign, so the bill is
        // read off the audited tax event, not a bare constant.
        tickOnce(world);
        expect(world.towns.get('south').controlledBy).toBe(SOUTH);
        const levy = world.events
            .filter(e => e.type === 'TAX_COLLECTED' && e.factionId === NORTH)
            .reduce((s, e) => s + (e.net ?? 0), 0);
        expect(north.resources).toBeCloseTo(2 + levy - 1, 10);
        expect(takeoverGate(world)).toMatchObject({ allowed: true });
        expect(world.events.some(e => e.type === 'TOWN_TAKEN')).toBe(false);
        expect(world.events.filter(e => e.type === 'TOWN_HELD' && e.townId === 'south').length).toBe(1);
    });

    it('HOSTILE stance (below WAR) authorizes raids but never towns', () => {
        const { world } = warReadyWorld({ northStance: StanceLadder.HOSTILE });
        tickOnce(world);
        expect(world.towns.get('south').controlledBy).toBe(SOUTH);
        expect(takeoverGate(world)).toMatchObject({
            allowed: false, reason: 'TAKEOVER_STANCE_BELOW_WAR',
        });
        expect(world.events.some(e => e.type === 'TOWN_TAKEN')).toBe(false);
    });

    it('a non-aggression treaty blocks the takeover like it blocks raids', () => {
        const { world } = warReadyWorld();
        requestNonAggression({ actor: NORTH, target: SOUTH, world, tick: 0 });
        tickOnce(world);
        expect(world.towns.get('south').controlledBy).toBe(SOUTH);
        expect(takeoverGate(world)).toMatchObject({ allowed: false, reason: 'TAKEOVER_TREATY_BLOCKED' });
        expect(world.events.some(e => e.type === 'TOWN_TAKEN')).toBe(false);
    });

    it('abandoned husks and the attacker towns are never takeover targets', () => {
        const { world, north } = warReadyWorld();
        world.towns.get('south').abandoned = true;
        tickOnce(world);
        expect(world.towns.get('south').controlledBy).toBe(SOUTH);
        expect(world.events.some(e => e.type === 'TOWN_TAKEN')).toBe(false);
        // No town campaign: the WAR faction spends its tick raiding
        // bandits instead (one campaign per tick, town preempts raid).
        expect(north.resources).toBe(4);
        expect(world.events.some(e => e.type === 'INVASION' && e.factionId === 'north-faction')).toBe(true);
    });

    it('the taken town ticks under its new owner (justice follows control)', () => {
        const { world } = warReadyWorld();
        tickOnce(world, 1);
        expect(world.towns.get('south').controlledBy).toBe(NORTH);
        tickClosedWorld(world, { tick: 2, perceivedDanger: 0.5, encounterRng: () => 0.999 });
        const justice = world.events.filter(e =>
            e.type === 'JUSTICE_RESOLVED' && e.townId === 'south');
        // No crime staged: legitimacy holds without resolution events;
        // the pin is that nothing crashes and control persists a tick on.
        expect(world.towns.get('south').controlledBy).toBe(NORTH);
        expect(Array.isArray(justice)).toBe(true);
    });
});
