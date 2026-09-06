import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent, saveWorld, loadWorld } from '../closed-world.js';

// E22 — tribute lapse and renegotiation. Dead ground pays nothing:
// a tributary town that yields zero levy five ticks running lapses
// its deal (control stays put), and only lapsed deals may be
// renegotiated once the town lives again. Betrayed deals stay dead.

function brutalize(world, from, to) {
    for (let t = from; t <= to; t++) {
        world.towns.get('south').market.inventory.set('food', 0);
        appendWorldEvent(world, {
            type: 'BANDIT_ATTACK', roadId: 'road-b', banditId: 'bx',
            merchantId: 'm1', lost: 5, tick: t, attackOpportunityId: `e22-brut-${t}`,
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

function autonomyDeals(world, polityId) {
    return world.treaties.filter(t => t?.terms?.kind === 'autonomy'
        && t?.terms?.polityId === polityId);
}

function sealDeal(world) {
    const snap = secessionTick(world);
    expect(snap).not.toBeNull();
    const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
    govern(world, snap + 1, snap + 55);
    const former = world.factions.find(f => f.id === 'south-faction');
    former.resources = 6;
    former.maxResources = 6;
    govern(world, snap + 56, snap + 80);
    const deal = autonomyDeals(world, founded.polityId).find(t => t.status === 'ACTIVE');
    expect(deal).toBeDefined();
    return { snap, founded, deal };
}

describe('E22 tribute lapse and renegotiation', () => {
    it('dead ground lapses: five barren ticks end the deal, control stays put', () => {
        const world = lonePolityWorld();
        const { snap, founded, deal } = sealDeal(world);
        world.towns.get('south').population = 0;
        govern(world, snap + 81, snap + 90);
        const ended = world.treaties.find(t => t.id === deal.id);
        expect(ended.status).toBe('TERMINATED');
        expect(ended.termination?.reason).toBe('TRIBUTE_LAPSED');
        expect(world.towns.get('south').controlledBy).toBe(founded.polityId);
        // No verdict rides the lapse: the claim simply goes quiet.
        for (const type of ['RECONQUEST_DECLARED', 'INDEPENDENCE_ACCEPTED', 'REINTEGRATION_DEMANDED']) {
            expect(world.events.some(e => e.type === type && e.polityId === founded.polityId)).toBe(false);
        }
    });

    it('living towns never lapse: the streak resets on every payment', () => {
        const world = lonePolityWorld();
        const { snap, founded, deal } = sealDeal(world);
        govern(world, snap + 81, snap + 100);
        expect(world.treaties.find(t => t.id === deal.id).status).toBe('ACTIVE');
        const rows = world.events.filter(e => e.type === 'TAX_COLLECTED'
            && (e.tick ?? 0) > deal.startTick
            && (e.towns ?? []).some(t => t.townId === 'south' && (t.tribute ?? 0) > 0));
        expect(rows.length).toBeGreaterThan(0);
    });

    it('lapsed deals renegotiate: repopulated towns seal anew and pay again', () => {
        const world = lonePolityWorld();
        const { snap, founded, deal } = sealDeal(world);
        world.towns.get('south').population = 0;
        govern(world, snap + 81, snap + 90);
        expect(world.treaties.find(t => t.id === deal.id).status).toBe('TERMINATED');
        world.towns.get('south').population = 30;
        govern(world, snap + 91, snap + 120);
        const renewed = autonomyDeals(world, founded.polityId).filter(t => t.status === 'ACTIVE');
        expect(renewed.length).toBe(1);
        expect(renewed[0].id).not.toBe(deal.id);
        const rows = world.events.filter(e => e.type === 'TAX_COLLECTED'
            && (e.tick ?? 0) > renewed[0].startTick
            && (e.towns ?? []).some(t => t.townId === 'south' && (t.tribute ?? 0) > 0));
        expect(rows.length).toBeGreaterThan(0);
    });

    it('betrayed deals stay dead: repopulation never reopens them', () => {
        const world = lonePolityWorld();
        const { snap, founded, deal } = sealDeal(world);
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
        world.towns.get('south').population = 30;
        govern(world, snap + 85, snap + 115);
        expect(autonomyDeals(world, founded.polityId).filter(t => t.status === 'ACTIVE').length).toBe(0);
    });

    it('lapse streaks survive save/load and lapse on the same tick', () => {
        const world = lonePolityWorld();
        const { snap, founded, deal } = sealDeal(world);
        world.towns.get('south').population = 0;
        govern(world, snap + 81, snap + 82);
        const resumed = loadWorld(saveWorld(world));
        govern(world, snap + 83, snap + 90);
        govern(resumed, snap + 83, snap + 90);
        const status = w => w.treaties.find(t => t.id === deal.id);
        expect(status(resumed).status).toBe('TERMINATED');
        expect(status(world).status).toBe('TERMINATED');
        const lapseTick = w => w.events.find(e => e.type === 'TREATY_TERMINATED' && e.treatyId === deal.id)?.tick;
        expect(lapseTick(resumed)).toBe(lapseTick(world));
    });

    it('content worlds never lapse: no deals, no lapse machinery', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        govern(world, 1, 90);
        expect(world.treaties.some(t => t?.termination?.reason === 'TRIBUTE_LAPSED')).toBe(false);
    });
});
