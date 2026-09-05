import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent, saveWorld, loadWorld } from '../closed-world.js';
import { activeTreatiesFor } from '../treaty.js';
import { StanceLadder } from '../factionrelationship.js';

// E20 — autonomy, tribute, and negotiated orders. Not every claim ends
// binary: a strong former may offer suzerainty, a weaker polity may
// take it, and the town pays split tribute while ruling itself. Deals
// hold while honored; betrayal ends them; verdicts skip tributaries.

function brutalize(world, from, to) {
    for (let t = from; t <= to; t++) {
        world.towns.get('south').market.inventory.set('food', 0);
        appendWorldEvent(world, {
            type: 'BANDIT_ATTACK', roadId: 'road-b', banditId: 'bx',
            merchantId: 'm1', lost: 5, tick: t, attackOpportunityId: `e20-brut-${t}`,
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

function autonomyTreaties(world, polityId) {
    return world.treaties.filter(t => t?.terms?.kind === 'autonomy'
        && t?.terms?.polityId === polityId);
}

function forceWar(world, formerId, polityId, tick) {
    const former = world.factions.find(f => f.id === formerId);
    const pair = world.relationships.get(`${formerId}::${polityId}`)
        ?? world.relationships.get(`${polityId}::${formerId}`);
    former.grievance = 1;
    former.lastDecision = 'RAID';
    former.informationConfidence = 1;
    pair.setTrustFrom(formerId, 0);
    pair.setGrievanceFrom(formerId, 1);
    pair.setFearFrom(formerId, 1);
    pair.setTerritorialPressureFrom(formerId, 1);
    pair.observeFrom(formerId, StanceLadder.WAR, tick);
    return { former, pair };
}

describe('E20 autonomy, tribute, and negotiated orders', () => {
    it('a weaker polity takes the deal: autonomy agreed, parented, self-rule kept', () => {
        const world = lonePolityWorld();
        const snap = secessionTick(world);
        expect(snap).not.toBeNull();
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 55);
        const former = world.factions.find(f => f.id === 'south-faction');
        former.resources = 6;
        former.maxResources = 6;
        govern(world, snap + 56, snap + 80);
        const deals = autonomyTreaties(world, founded.polityId).filter(t => t.status === 'ACTIVE');
        expect(deals.length).toBe(1);
        expect(deals[0].terms).toMatchObject({
            overlordId: 'south-faction', polityId: founded.polityId,
            townId: 'south', tributeRate: 0.25,
        });
        expect(deals[0].startTick).toBeGreaterThanOrEqual(founded.tick + 60);
        const formed = world.events.find(e => e.type === 'TREATY_FORMED' && e.treatyId === deals[0].id);
        expect(formed).toBeDefined();
        expect(formed.parentEventIds ?? []).toContain(founded.eventId);
        // Self-rule kept: control never moves, no verdict supplants the deal.
        expect(world.towns.get('south').controlledBy).toBe(founded.polityId);
        expect(world.events.some(e => e.type === 'RECONQUEST_DECLARED'
            && e.polityId === founded.polityId)).toBe(false);
    });

    it('tribute splits the levy: one payment, two books, no double tax', () => {
        const world = lonePolityWorld();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 55);
        const former = world.factions.find(f => f.id === 'south-faction');
        former.resources = 6;
        former.maxResources = 6;
        govern(world, snap + 56, snap + 80);
        const deal = autonomyTreaties(world, founded.polityId).find(t => t.status === 'ACTIVE');
        expect(deal).toBeDefined();
        govern(world, snap + 81, snap + 90);
        const rows = world.events.filter(e => e.type === 'TAX_COLLECTED'
            && (e.tick ?? 0) > deal.startTick
            && (e.towns ?? []).some(t => t.townId === 'south'));
        expect(rows.length).toBeGreaterThan(0);
        // The town pays once, to its ruler — never to both.
        for (const row of rows) expect(row.factionId).toBe(founded.polityId);
        const tributes = rows.flatMap(e => (e.towns ?? [])
            .filter(t => t.townId === 'south').map(t => t.tribute ?? 0));
        expect(tributes.some(v => v > 0)).toBe(true);
        for (const row of rows) {
            const town = row.towns.find(t => t.townId === 'south');
            expect(town.tribute).toBeCloseTo(town.levy * 0.25, 10);
            expect(town.tributeOverlord).toBe('south-faction');
        }
        expect(world.events.some(e => e.type === 'TAX_COLLECTED'
            && e.factionId === 'south-faction' && (e.tick ?? 0) > deal.startTick
            && (e.towns ?? []).some(t => t.townId === 'south'))).toBe(false);
    });

    it('the overlord cannot take what tribute already buys: blocked by the deal itself', () => {
        const world = lonePolityWorld();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 55);
        const former = world.factions.find(f => f.id === 'south-faction');
        former.resources = 6;
        former.maxResources = 6;
        govern(world, snap + 56, snap + 80);
        const deal = autonomyTreaties(world, founded.polityId).find(t => t.status === 'ACTIVE');
        expect(deal).toBeDefined();
        forceWar(world, 'south-faction', founded.polityId, snap + 80);
        former.resources = 8;
        former.maxResources = 8;
        tickClosedWorld(world, { tick: snap + 81, perceivedDanger: 0.1, encounterRng: () => 0.999 });
        const blocks = world.events.filter(e => e.type === 'TAKEOVER_GATE'
            && e.townId === 'south' && e.reason === 'TAKEOVER_TREATY_BLOCKED');
        expect(blocks.length).toBeGreaterThan(0);
        expect(blocks[0].treatyId).toBe(deal.id);
        expect(world.towns.get('south').controlledBy).toBe(founded.polityId);
    });

    it('a stronger polity refuses: one audited refusal, never a deal', () => {
        const world = lonePolityWorld();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 55);
        // Overlord just strong enough to offer, too weak to impress:
        // capacity 3 opens the question, polity weight (~4.7) refuses it.
        const former = world.factions.find(f => f.id === 'south-faction');
        former.resources = 3;
        former.maxResources = 3;
        govern(world, snap + 56, snap + 85);
        const refusals = world.events.filter(e => e.type === 'AUTONOMY_REFUSED'
            && e.polityId === founded.polityId);
        expect(refusals.length).toBe(1);
        expect(autonomyTreaties(world, founded.polityId).length).toBe(0);
    });

    it('a poor overlord makes no offer: silence, not refusal', () => {
        const world = lonePolityWorld();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 85);
        expect(autonomyTreaties(world, founded.polityId).length).toBe(0);
        expect(world.events.some(e => e.type === 'AUTONOMY_REFUSED')).toBe(false);
    });

    it('a failing polity gets verdicts, not deals: no autonomy without standing', () => {
        const world = lonePolityWorld();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        const former = world.factions.find(f => f.id === 'south-faction');
        former.resources = 6;
        former.maxResources = 6;
        brutalize(world, snap + 1, snap + 85);
        const polity = world.factions.find(f => f.id === founded.polityId);
        expect(polity.legitimacy).toBeLessThan(0.4);
        expect(autonomyTreaties(world, founded.polityId).length).toBe(0);
    });

    it('verdicts skip tributaries: even hot claims honor the deal', () => {
        const world = lonePolityWorld();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 55);
        const former = world.factions.find(f => f.id === 'south-faction');
        former.resources = 6;
        former.maxResources = 6;
        govern(world, snap + 56, snap + 80);
        expect(autonomyTreaties(world, founded.polityId).some(t => t.status === 'ACTIVE')).toBe(true);
        forceWar(world, 'south-faction', founded.polityId, snap + 80);
        former.resources = 8;
        former.maxResources = 8;
        govern(world, snap + 81, snap + 95);
        for (const type of ['RECONQUEST_DECLARED', 'INDEPENDENCE_ACCEPTED', 'REINTEGRATION_DEMANDED']) {
            expect(world.events.some(e => e.type === type && e.polityId === founded.polityId)).toBe(false);
        }
        expect(world.towns.get('south').controlledBy).toBe(founded.polityId);
    });

    it('betrayal ends the deal: a raiding tributary loses status, never land', () => {
        const world = lonePolityWorld();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 55);
        const former = world.factions.find(f => f.id === 'south-faction');
        former.resources = 6;
        former.maxResources = 6;
        govern(world, snap + 56, snap + 80);
        const deal = autonomyTreaties(world, founded.polityId).find(t => t.status === 'ACTIVE');
        expect(deal).toBeDefined();
        world.bandits[0].factionId = null;
        world.bandits[0].roadId = 'road-b';
        const betrayer = world.factions.find(f => f.id === founded.polityId);
        betrayer.grievance = 1;
        betrayer.lastDecision = 'RAID';
        betrayer.resources = 1;
        tickClosedWorld(world, { tick: snap + 81, perceivedDanger: 0.9, encounterRng: () => 0.999 });
        expect(world.events.some(e => e.type === 'INVASION'
            && e.factionId === founded.polityId && e.tick === snap + 81)).toBe(true);
        govern(world, snap + 82, snap + 84);
        expect(world.treaties.find(t => t.id === deal.id).status).toBe('TERMINATED');
        expect(world.treaties.find(t => t.id === deal.id).termination?.reason).toBe('POLITY_BETRAYAL');
        expect(world.towns.get('south').controlledBy).toBe(founded.polityId);
    });

    it('deals survive save/load with no duplicate offers', () => {
        const world = lonePolityWorld();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 55);
        const former = world.factions.find(f => f.id === 'south-faction');
        former.resources = 6;
        former.maxResources = 6;
        govern(world, snap + 56, snap + 80);
        expect(autonomyTreaties(world, founded.polityId).length).toBe(1);
        const resumed = loadWorld(saveWorld(world));
        govern(world, snap + 81, snap + 90);
        govern(resumed, snap + 81, snap + 90);
        const count = w => autonomyTreaties(w, founded.polityId).length;
        expect(count(resumed)).toBe(count(world));
        const ids = w => autonomyTreaties(w, founded.polityId).map(t => t.id).sort();
        expect(ids(resumed)).toEqual(ids(world));
        expect(resumed.towns.get('south').controlledBy).toBe(world.towns.get('south').controlledBy);
    });
});
