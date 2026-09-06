import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent, saveWorld, loadWorld } from '../closed-world.js';

// E23 — layered allegiances and contested hierarchies. One town may
// carry an ordered stack: a primary service deal plus junior shields.
// Tribute follows exactly one ACTIVE deal; defense sums shields with
// an audited cap; rival claimants queue instead of forking history.

function brutalize(world, from, to) {
    for (let t = from; t <= to; t++) {
        world.towns.get('south').market.inventory.set('food', 0);
        appendWorldEvent(world, {
            type: 'BANDIT_ATTACK', roadId: 'road-b', banditId: 'bx',
            merchantId: 'm1', lost: 5, tick: t, attackOpportunityId: `e23-brut-${t}`,
        });
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.9, encounterRng: () => 0.999 });
    }
}

function lonePolityWorld() {
    const world = createClosedWorldScenario({ season: 'SUMMER' });
    world.ticksPerSeason = 10000;
    world.towns.get('north').population = 0;
    world.towns.get('south').population = 30;
    return world;
}

function secessionTick(world, limit = 80) {
    for (let t = 1; t <= limit; t++) {
        brutalize(world, t, t);
        const snap = world.events.find(e => e.type === 'SECESSION' && e.townId === 'south');
        if (snap) return snap.tick;
    }
    return null;
}

function govern(world, from, to) {
    for (let t = from; t <= to; t++) {
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.1, encounterRng: () => 0.999 });
    }
}

function serviceDeals(world, polityId) {
    return world.treaties.filter(t => (t?.terms?.kind === 'autonomy' || t?.terms?.kind === 'vassalage')
        && t?.terms?.polityId === polityId && t?.terms?.townId === 'south');
}

function sealAutonomy(world) {
    const snap = secessionTick(world);
    expect(snap).not.toBeNull();
    const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
    govern(world, snap + 1, snap + 55);
    const former = world.factions.find(f => f.id === 'south-faction');
    former.resources = 6;
    former.maxResources = 6;
    govern(world, snap + 56, snap + 80);
    const deal = serviceDeals(world, founded.polityId).find(t => t.status === 'ACTIVE');
    expect(deal).toBeDefined();
    return { snap, founded, deal };
}

describe('E23 layered allegiances and contested hierarchies', () => {
    it('a second shield stacks defense without forking tribute', () => {
        const world = lonePolityWorld();
        const { snap, founded } = sealAutonomy(world);
        const north = world.factions.find(f => f.id === 'north-faction');
        north.resources = 6;
        north.maxResources = 6;
        govern(world, snap + 81, snap + 100);
        const active = serviceDeals(world, founded.polityId).filter(t => t.status === 'ACTIVE');
        expect(active.length).toBe(2);
        const ranks = active.map(t => t.terms?.rank).sort();
        expect(ranks).toEqual([1, 2]);
        const rows = world.events.filter(e => e.type === 'TAX_COLLECTED'
            && (e.tick ?? 0) > active[1].startTick
            && (e.towns ?? []).some(t => t.townId === 'south' && (t.tribute ?? 0) > 0));
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
            const town = row.towns.find(t => t.townId === 'south');
            expect(town.tributeOverlord).toBe(active[0].terms?.overlordId);
        }
    });

    it('rival claimants queue: only one ACTIVE deal per town, others wait', () => {
        const world = lonePolityWorld();
        const { snap, founded } = sealAutonomy(world);
        const north = world.factions.find(f => f.id === 'north-faction');
        north.resources = 6;
        north.maxResources = 6;
        govern(world, snap + 81, snap + 100);
        const active = serviceDeals(world, founded.polityId).filter(t => t.status === 'ACTIVE');
        const queued = world.events.filter(e => e.type === 'HIERARCHY_QUEUED' && e.polityId === founded.polityId);
        expect(active.length).toBeLessThanOrEqual(2);
        expect(queued.length).toBeGreaterThan(0);
        expect(world.towns.get('south').controlledBy).toBe(founded.polityId);
    });

    it('defense sums shields with an audited cap, never explodes', () => {
        const world = lonePolityWorld();
        const { snap, founded } = sealAutonomy(world);
        const north = world.factions.find(f => f.id === 'north-faction');
        north.resources = 6;
        north.maxResources = 6;
        govern(world, snap + 81, snap + 100);
        const active = serviceDeals(world, founded.polityId).filter(t => t.status === 'ACTIVE');
        expect(active.length).toBeGreaterThan(0);
        const gates = world.events.filter(e => e.type === 'TAKEOVER_GATE' && e.townId === 'south');
        expect(gates.length).toBeGreaterThan(0);
        for (const gate of gates) {
            expect(Number.isFinite(gate.defenderPower)).toBe(true);
            expect(gate.alliedWeight ?? 0).toBeLessThanOrEqual(gate.defenderPower);
        }
    });

    it('lapse promotes the queue: the junior shield becomes primary', () => {
        const world = lonePolityWorld();
        const { snap, founded, deal } = sealAutonomy(world);
        const north = world.factions.find(f => f.id === 'north-faction');
        north.resources = 6;
        north.maxResources = 6;
        govern(world, snap + 81, snap + 100);
        world.towns.get('south').population = 0;
        govern(world, snap + 101, snap + 110);
        expect(world.treaties.find(t => t.id === deal.id).status).toBe('TERMINATED');
        world.towns.get('south').population = 30;
        govern(world, snap + 111, snap + 140);
        const active = serviceDeals(world, founded.polityId).filter(t => t.status === 'ACTIVE');
        expect(active.length).toBeGreaterThan(0);
        expect(active[0].terms?.rank).toBe(1);
    });

    it('content worlds build no hierarchies', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        govern(world, 1, 90);
        expect(world.events.some(e => e.type === 'HIERARCHY_QUEUED')).toBe(false);
        expect(world.treaties.some(t => (t?.terms?.rank ?? 0) > 1)).toBe(false);
    });

    it('hierarchies survive save/load with identical ranks', () => {
        const world = lonePolityWorld();
        const { snap, founded } = sealAutonomy(world);
        const north = world.factions.find(f => f.id === 'north-faction');
        north.resources = 6;
        north.maxResources = 6;
        govern(world, snap + 81, snap + 100);
        const resumed = loadWorld(saveWorld(world));
        govern(world, snap + 101, snap + 110);
        govern(resumed, snap + 101, snap + 110);
        const ranks = w => serviceDeals(w, founded.polityId)
            .filter(t => t.status === 'ACTIVE').map(t => `${t.id}:${t.terms?.rank}`).sort();
        expect(ranks(resumed)).toEqual(ranks(world));
    });
});
