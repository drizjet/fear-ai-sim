import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent, saveWorld, loadWorld } from '../closed-world.js';
import { StanceLadder } from '../factionrelationship.js';

// E15 — secession and fragmentation. Misrule has an exit: a free
// town (never conquered) at rock-bottom legitimacy and maxed
// grievance declares independence. No occupation is needed and
// none is created — the town simply stops being ruled. The
// independent town pays no tax and cannot be taken (no ruler to
// depose); re-conquest of independents is later work.

function brutalize(world, from, to) {
    for (let t = from; t <= to; t++) {
        world.towns.get('south').market.inventory.set('food', 0);
        appendWorldEvent(world, {
            type: 'BANDIT_ATTACK', roadId: 'road-b', banditId: 'bx',
            merchantId: 'm1', lost: 5, tick: t, attackOpportunityId: `sec-${t}`,
        });
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.9, encounterRng: () => 0.999 });
    }
}

describe('E15 secession and fragmentation', () => {
    it('a brutalized free town secedes exactly once and stops paying tax', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        world.towns.get('south').population = 30;
        brutalize(world, 1, 25);
        const secessions = world.events.filter(e => e.type === 'SECESSION' && e.townId === 'south');
        expect(secessions.length).toBeGreaterThan(0);
        expect(secessions[0]).toMatchObject({ fromFactionId: 'south-faction' });
        // E16: independence means NOT RULED BY THE FORMER RULER —
        // control passes to the newborn polity, never null forever.
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        expect(founded).toBeDefined();
        expect(world.towns.get('south').controlledBy).toBe(founded.polityId);
        // Independence sticks: further brutalization founds no second
        // polity (re-conquest of independents is later work).
        brutalize(world, 26, 50);
        expect(world.events.filter(e => e.type === 'SECESSION' && e.townId === 'south').length)
            .toBe(secessions.length);
        // The former ruler never taxes the town again — counting only
        // ticks after the snap (pre-secession levies were legitimate
        // rule, not leakage; the new polity's own levies are its
        // lawful fiscal capacity, proved in E16).
        const snapTick = secessions[0].tick;
        const taxedTowns = new Set();
        for (const e of world.events) {
            if (e.type !== 'TAX_COLLECTED' || !(e.tick > snapTick)) continue;
            if (e.factionId !== 'south-faction') continue;
            for (const t of e.towns ?? []) taxedTowns.add(t.townId);
        }
        expect(taxedTowns.has('south')).toBe(false);
    });

    it('a content free town never secedes (negative control)', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        for (let t = 1; t <= 60; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.0, encounterRng: () => 0.999 });
        }
        expect(world.towns.get('south').controlledBy).toBe('south-faction');
        expect(world.events.some(e => e.type === 'SECESSION')).toBe(false);
    });

    it('occupied brutalized towns revolt instead of seceding (path precedence)', () => {
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
        brutalize(world, 2, 25);
        // All roads touch both towns, so both justices brutalize
        // together; the pin is ORDER, not exclusivity: while south
        // is occupied its snap is a revolt, and any secession comes
        // strictly after the restore in ledger order (revolt loop
        // runs before the secession loop each tick).
        const idx = type => world.events.findIndex(e =>
            e.type === type && e.townId === 'south');
        expect(idx('TOWN_REVOLT')).toBeGreaterThanOrEqual(0);
        const sec = idx('SECESSION');
        if (sec >= 0) expect(sec).toBeGreaterThan(idx('TOWN_REVOLT'));
    });

    it('secession survives save/load with identical follow-up control', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        world.towns.get('south').population = 30;
        brutalize(world, 1, 10);
        const resumed = loadWorld(saveWorld(world));
        brutalize(world, 11, 25);
        brutalize(resumed, 11, 25);
        expect(resumed.towns.get('south').controlledBy)
            .toBe(world.towns.get('south').controlledBy);
        const count = w => w.events.filter(e => e.type === 'SECESSION').length;
        expect(count(resumed)).toBe(count(world));
    });
});
