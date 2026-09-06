import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent, saveWorld, loadWorld } from '../closed-world.js';
import { activeTreatiesFor } from '../treaty.js';
import { StanceLadder } from '../factionrelationship.js';

// E21 — federation between polities and vassalage with teeth. Kin
// polities bind mutual restraint and mutual walls; strong strangers
// buy tributaries with protection, not just forbearance. Suzerainty
// was tribute for non-interference; vassalage is tribute under shield.

function brutalize(world, from, to, townId = 'south') {
    for (let t = from; t <= to; t++) {
        world.towns.get(townId).market.inventory.set('food', 0);
        appendWorldEvent(world, {
            type: 'BANDIT_ATTACK', roadId: 'road-b', banditId: 'bx',
            merchantId: 'm1', lost: 5, tick: t, attackOpportunityId: `e21-brut-${townId}-${t}`,
        });
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.9, encounterRng: () => 0.999 });
    }
}

function freshWorld(northPop = 30, southPop = 30) {
    const world = createClosedWorldScenario({ season: 'SUMMER' });
    world.ticksPerSeason = 10000;
    world.towns.get('north').population = northPop;
    world.towns.get('south').population = southPop;
    return world;
}

function lonePolityWorld() {
    const world = createClosedWorldScenario({ season: 'SUMMER' });
    world.ticksPerSeason = 10000;
    world.towns.get('north').population = 0;
    world.towns.get('south').population = 30;
    return world;
}

function secessionTick(world, townId = 'south', limit = 80) {
    for (let t = 1; t <= limit; t++) {
        brutalize(world, t, t, townId);
        const snap = world.events.find(e => e.type === 'SECESSION' && e.townId === townId);
        if (snap) return snap.tick;
    }
    return null;
}

function govern(world, from, to) {
    for (let t = from; t <= to; t++) {
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.1, encounterRng: () => 0.999 });
    }
}

function federations(world) {
    return world.treaties.filter(t => t?.terms?.kind === 'federation');
}

function vassalages(world, polityId) {
    return world.treaties.filter(t => t?.terms?.kind === 'vassalage'
        && t?.terms?.polityId === polityId);
}

function forceWar(world, attackerId, defenderId, tick) {
    const attacker = world.factions.find(f => f.id === attackerId);
    const pair = world.relationships.get(`${attackerId}::${defenderId}`)
        ?? world.relationships.get(`${defenderId}::${attackerId}`);
    attacker.grievance = 1;
    attacker.lastDecision = 'RAID';
    attacker.informationConfidence = 1;
    pair.setTrustFrom(attackerId, 0);
    pair.setGrievanceFrom(attackerId, 1);
    pair.setFearFrom(attackerId, 1);
    pair.setTerritorialPressureFrom(attackerId, 1);
    pair.observeFrom(attackerId, StanceLadder.WAR, tick);
    return { attacker, pair };
}

describe('E21 federation between polities and vassalage with teeth', () => {
    it('kin polities federate: sealed once, parented, mutual standing', () => {
        const world = freshWorld();
        const snapS = secessionTick(world, 'south');
        const snapN = secessionTick(world, 'north');
        expect(snapS).not.toBeNull();
        expect(snapN).not.toBeNull();
        const snap = Math.max(snapS, snapN);
        const south = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        const north = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'north');
        govern(world, snap + 1, snap + 70);
        const sealed = federations(world).filter(t => t.status === 'ACTIVE'
            && (t.participants ?? []).includes(south.polityId)
            && (t.participants ?? []).includes(north.polityId));
        expect(sealed.length).toBe(1);
        expect(sealed[0].startTick).toBeGreaterThanOrEqual(Math.max(south.tick, north.tick) + 60);
        const formed = world.events.find(e => e.type === 'TREATY_FORMED' && e.treatyId === sealed[0].id);
        expect(formed).toBeDefined();
        govern(world, snap + 71, snap + 85);
        expect(federations(world).filter(t => t.status === 'ACTIVE'
            && (t.participants ?? []).includes(south.polityId)
            && (t.participants ?? []).includes(north.polityId)).length).toBe(1);
    });

    it('federation restrains kin: a driven takeover dies on the bond, credited to it', () => {
        const world = freshWorld();
        const snapS = secessionTick(world, 'south');
        secessionTick(world, 'north');
        const snap = Math.max(snapS, world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'north').tick);
        const south = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        const north = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'north');
        govern(world, snap + 1, snap + 70);
        const bond = federations(world).find(t => t.status === 'ACTIVE'
            && (t.participants ?? []).includes(south.polityId)
            && (t.participants ?? []).includes(north.polityId));
        expect(bond).toBeDefined();
        const aggressor = world.factions.find(f => f.id === south.polityId);
        aggressor.resources = 8;
        aggressor.maxResources = 8;
        forceWar(world, south.polityId, north.polityId, snap + 70);
        tickClosedWorld(world, { tick: snap + 71, perceivedDanger: 0.1, encounterRng: () => 0.999 });
        const blocks = world.events.filter(e => e.type === 'TAKEOVER_GATE'
            && e.townId === 'north' && e.reason === 'TAKEOVER_TREATY_BLOCKED');
        expect(blocks.length).toBeGreaterThan(0);
        expect(blocks[0].treatyId).toBe(bond.id);
        expect(world.towns.get('north').controlledBy).toBe(north.polityId);
    });

    it('federation walls hold: the gate books allied weight above bare defense', () => {
        // Small towns keep the arithmetic honest: bare defense cannot
        // explain the booked number, allied weight must.
        const world = freshWorld(5, 5);
        secessionTick(world, 'south');
        secessionTick(world, 'north');
        const snap = Math.max(
            world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south').tick,
            world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'north').tick);
        const south = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 70);
        expect(federations(world).some(t => t.status === 'ACTIVE')).toBe(true);
        // North-faction storms at default strength; the gate audits the
        // defense either way (audit fires before the verdict).
        const { attacker: storm } = forceWar(world, 'north-faction', south.polityId, snap + 70);
        // Fund the minimum: the gate audits any affordable attempt.
        storm.resources = 2;
        storm.maxResources = 2;
        tickClosedWorld(world, { tick: snap + 71, perceivedDanger: 0.1, encounterRng: () => 0.999 });
        const gates = world.events.filter(e => e.type === 'TAKEOVER_GATE'
            && e.townId === 'south' && e.factionId === 'north-faction' && e.tick === snap + 71);
        expect(gates.length).toBeGreaterThan(0);
        const gate = gates[0];
        const polity = world.factions.find(f => f.id === south.polityId);
        const bare = Math.max(0, Number(polity.resources) || 0)
            + Math.max(0, Number(world.towns.get('south').population) || 0) * 0.1;
        // Allied weight stands clearly above bare defense plus any
        // single-tick drift (ally holds ~1 against ≤0.2 noise).
        expect(gate.defenderPower - bare).toBeGreaterThan(0.5);
        expect(world.events.some(e => e.type === 'TOWN_TAKEN' && e.townId === 'south')).toBe(false);
        expect(world.towns.get('south').controlledBy).toBe(south.polityId);
    });

    it('a strong stranger buys a shielded tributary: vassalage sealed with tribute flowing', () => {
        const world = lonePolityWorld();
        const snap = secessionTick(world);
        expect(snap).not.toBeNull();
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 55);
        const north = world.factions.find(f => f.id === 'north-faction');
        north.resources = 6;
        north.maxResources = 6;
        govern(world, snap + 56, snap + 85);
        const sealed = vassalages(world, founded.polityId).filter(t => t.status === 'ACTIVE');
        expect(sealed.length).toBe(1);
        expect(sealed[0].terms).toMatchObject({
            overlordId: 'north-faction', polityId: founded.polityId,
            townId: 'south', tributeRate: 0.25,
        });
        const formed = world.events.find(e => e.type === 'TREATY_FORMED' && e.treatyId === sealed[0].id);
        expect(formed).toBeDefined();
        expect(formed.parentEventIds ?? []).toContain(founded.eventId);
        govern(world, snap + 86, snap + 95);
        const rows = world.events.filter(e => e.type === 'TAX_COLLECTED'
            && (e.tick ?? 0) > sealed[0].startTick
            && (e.towns ?? []).some(t => t.townId === 'south'));
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) expect(row.factionId).toBe(founded.polityId);
        const town = rows[0].towns.find(t => t.townId === 'south');
        expect(town.tribute).toBeCloseTo(town.levy * 0.25, 10);
        expect(town.tributeOverlord).toBe('north-faction');
    });

    it('vassalage shields: the gate books overlord weight above bare defense', () => {
        const world = lonePolityWorld();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 55);
        const north = world.factions.find(f => f.id === 'north-faction');
        north.resources = 6;
        north.maxResources = 6;
        govern(world, snap + 56, snap + 85);
        expect(vassalages(world, founded.polityId).some(t => t.status === 'ACTIVE')).toBe(true);
        // The former storms with bare overmatch (5 beats ~4.7 bare);
        // the gate must book the overlord's refreshed weight on top.
        north.resources = 6;
        forceWar(world, 'south-faction', founded.polityId, snap + 85);
        const former = world.factions.find(f => f.id === 'south-faction');
        former.resources = 5;
        former.maxResources = 5;
        tickClosedWorld(world, { tick: snap + 86, perceivedDanger: 0.1, encounterRng: () => 0.999 });
        const gates = world.events.filter(e => e.type === 'TAKEOVER_GATE'
            && e.townId === 'south' && e.factionId === 'south-faction' && e.tick === snap + 86);
        expect(gates.length).toBeGreaterThan(0);
        const polity = world.factions.find(f => f.id === founded.polityId);
        const bare = Math.max(0, Number(polity.resources) || 0)
            + Math.max(0, Number(world.towns.get('south').population) || 0) * 0.1;
        // Overlord weight (~6) clears bare defense plus drift by miles.
        expect(gates[0].defenderPower - bare).toBeGreaterThan(2);
        expect(world.events.some(e => e.type === 'TOWN_TAKEN' && e.townId === 'south')).toBe(false);
        expect(world.towns.get('south').controlledBy).toBe(founded.polityId);
    });

    it('a stronger polity refuses vassalage: one audited refusal, never a deal', () => {
        const world = lonePolityWorld();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 55);
        const north = world.factions.find(f => f.id === 'north-faction');
        north.resources = 3;
        north.maxResources = 3;
        govern(world, snap + 56, snap + 90);
        const refusals = world.events.filter(e => e.type === 'VASSALAGE_REFUSED'
            && e.polityId === founded.polityId);
        expect(refusals.length).toBe(1);
        expect(vassalages(world, founded.polityId).length).toBe(0);
    });

    it('betrayal ends kinship: a raiding federate breaks the bond, never land', () => {
        const world = freshWorld();
        secessionTick(world, 'south');
        secessionTick(world, 'north');
        const snap = Math.max(
            world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south').tick,
            world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'north').tick);
        const south = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 70);
        const bond = federations(world).find(t => t.status === 'ACTIVE'
            && (t.participants ?? []).includes(south.polityId));
        expect(bond).toBeDefined();
        world.bandits[0].factionId = null;
        world.bandits[0].roadId = 'road-b';
        const betrayer = world.factions.find(f => f.id === south.polityId);
        betrayer.grievance = 1;
        betrayer.lastDecision = 'RAID';
        betrayer.resources = 1;
        tickClosedWorld(world, { tick: snap + 71, perceivedDanger: 0.9, encounterRng: () => 0.999 });
        expect(world.events.some(e => e.type === 'INVASION'
            && e.factionId === south.polityId && e.tick === snap + 71)).toBe(true);
        govern(world, snap + 72, snap + 74);
        expect(world.treaties.find(t => t.id === bond.id).status).toBe('TERMINATED');
        expect(world.treaties.find(t => t.id === bond.id).termination?.reason).toBe('POLITY_BETRAYAL');
        expect(world.towns.get('south').controlledBy).toBe(south.polityId);
    });

    it('content worlds sign nothing: no polities, no bonds, no service', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        govern(world, 1, 90);
        expect(world.treaties.some(t => t?.terms?.kind === 'federation')).toBe(false);
        expect(world.treaties.some(t => t?.terms?.kind === 'vassalage')).toBe(false);
    });

    it('bonds survive save/load with no duplicate seals', () => {
        const world = freshWorld();
        secessionTick(world, 'south');
        secessionTick(world, 'north');
        const snap = Math.max(
            world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south').tick,
            world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'north').tick);
        govern(world, snap + 1, snap + 70);
        expect(federations(world).length).toBeGreaterThan(0);
        const resumed = loadWorld(saveWorld(world));
        govern(world, snap + 71, snap + 80);
        govern(resumed, snap + 71, snap + 80);
        const ids = w => federations(w).map(t => t.id).sort();
        expect(ids(resumed)).toEqual(ids(world));
    });
});
