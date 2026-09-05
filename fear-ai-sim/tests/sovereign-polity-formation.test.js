import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent, saveWorld, loadWorld } from '../closed-world.js';
import { StanceLadder } from '../factionrelationship.js';

// E16 — sovereign polity formation. Secession must create a real
// political actor, not a permanent null: the seceding town's control
// passes to a newborn faction funded by a booked transfer (never
// minted), wired into the relationship graph with the former ruler
// holding a claim, governing through the canonical tax/justice loops.

function brutalize(world, from, to) {
    for (let t = from; t <= to; t++) {
        world.towns.get('south').market.inventory.set('food', 0);
        appendWorldEvent(world, {
            type: 'BANDIT_ATTACK', roadId: 'road-b', banditId: 'bx',
            merchantId: 'm1', lost: 5, tick: t, attackOpportunityId: `e16-brut-${t}`,
        });
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.9, encounterRng: () => 0.999 });
    }
}

function freshSouth(days = 30) {
    const world = createClosedWorldScenario({ season: 'SUMMER' });
    world.ticksPerSeason = 10000;
    world.towns.get('south').population = days;
    return world;
}

function secessionTick(world, townId = 'south', limit = 60) {
    for (let t = 1; t <= limit; t++) {
        brutalize(world, t, t);
        const snap = world.events.find(e => e.type === 'SECESSION' && e.townId === townId);
        if (snap) return snap.tick;
    }
    return null;
}

describe('E16 sovereign polity formation', () => {
    it('secession founds exactly one polity from the secession event', () => {
        const world = freshSouth();
        const snap = secessionTick(world);
        expect(snap).not.toBeNull();
        const secession = world.events.find(e => e.type === 'SECESSION' && e.townId === 'south');
        const founded = world.events.filter(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        expect(founded.length).toBe(1);
        expect(founded[0]).toMatchObject({ fromFactionId: 'south-faction', townId: 'south' });
        expect(typeof founded[0].polityId).toBe('string');
        // Causal parent is the secession, not a later global generator.
        expect(founded[0].tick).toBe(secession.tick);
    });

    it('control passes to the newborn polity, never null forever', () => {
        const world = freshSouth();
        secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        expect(world.towns.get('south').controlledBy).toBe(founded.polityId);
        const polity = world.factions.find(f => f.id === founded.polityId);
        expect(polity).toBeDefined();
        expect(polity.townId).toBe('south');
        // The polity is a full decision-model citizen: it ticks.
        expect(typeof polity.advanceEmotion).toBe('function');
        expect(typeof polity.reassess).toBe('function');
    });

    it('founding books a transfer: source decreases, polity increases, nothing minted', () => {
        const probe = freshSouth();
        const snap = secessionTick(probe);
        const world = freshSouth();
        brutalize(world, 1, snap - 1);
        const formerBefore = world.factions.find(f => f.id === 'south-faction').resources;
        brutalize(world, snap, snap);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        const polity = world.factions.find(f => f.id === founded.polityId);
        const moved = founded.transferredResources;
        expect(moved).toBeGreaterThanOrEqual(0);
        expect(moved).toBeLessThanOrEqual(1);
        // Full accounting for the snap tick: the former's lawful tax
        // income (audited in its TAX_COLLECTED row) minus the booked
        // transfer equals the event-recorded aftermath; the polity
        // holds exactly what left the former. Regen may refill later
        // ticks, but at the founding instant stock is conserved.
        const taxRow = world.events.find(e => e.type === 'TAX_COLLECTED'
            && e.factionId === 'south-faction' && e.tick === snap);
        const net = taxRow ? (taxRow.gross - taxRow.garrisonCost) : 0;
        const cap = world.factions.find(f => f.id === 'south-faction').maxResources;
        expect(founded.formerResourcesAfter).toBeCloseTo(Math.min(cap, formerBefore + net) - moved, 10);
        expect(polity.resources).toBeGreaterThanOrEqual(0);
        expect(founded.polityResourcesAfter).toBeCloseTo(moved, 10);
        expect(founded.formerResourcesAfter + moved).toBeCloseTo(Math.min(cap, formerBefore + net), 10);
        expect(polity.maxResources).toBe(1);
    });

    it('legitimacy is provisional hope, not magic perfection; grievance memory survives', () => {
        const world = freshSouth();
        secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        const polity = world.factions.find(f => f.id === founded.polityId);
        expect(polity.legitimacy).toBeGreaterThan(0);
        expect(polity.legitimacy).toBeLessThanOrEqual(0.6);
        expect(polity.legitimacy).toBeLessThan(0.9);
        expect(polity.grievance).toBe(0);
        // The town's scar is not doctored: independence alone heals
        // nothing — hope lives in the polity and must exceed the
        // memory it inherits, while grievance stays hot.
        const townJustice = world.justiceState.get('south');
        expect(townJustice.legitimacy).toBeLessThan(0.3);
        expect(polity.legitimacy).toBeGreaterThan(townJustice.legitimacy);
        expect(townJustice.grievance).toBeGreaterThan(0.5);
    });

    it('the polity enters the relationship graph; the former ruler holds a claim, not omniscience', () => {
        const world = freshSouth();
        secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        const pairId = `south-faction::${founded.polityId}`;
        const pair = world.relationships.get(pairId)
            ?? world.relationships.get(`${founded.polityId}::south-faction`);
        expect(pair).toBeDefined();
        // Former ruler perspective carries the territorial claim.
        expect(pair.getTrustFrom('south-faction')).toBeLessThan(0.5);
        // Newborn perspective starts neutral — no borrowed omniscience.
        expect(pair.getTrustFrom(founded.polityId)).toBe(0.5);
        // Wired into every existing faction, not just the former ruler.
        const northPair = world.relationships.get(`north-faction::${founded.polityId}`)
            ?? world.relationships.get(`${founded.polityId}::north-faction`);
        expect(northPair).toBeDefined();
        const polity = world.factions.find(f => f.id === founded.polityId);
        expect(polity.relationships.get('south-faction')).toBe(pair);
        expect(polity.relationships.get('north-faction')).toBe(northPair);
    });

    it('the polity governs through canonical tax: old ruler loses the base, no double taxation', () => {
        const world = freshSouth();
        const snap = secessionTick(world);
        brutalize(world, snap + 1, snap + 12);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        const taxRows = world.events.filter(e => e.type === 'TAX_COLLECTED' && (e.tick ?? 0) > snap);
        const polityRows = taxRows.filter(e => e.factionId === founded.polityId);
        expect(polityRows.length).toBeGreaterThan(0);
        expect(polityRows.some(e => (e.towns ?? []).some(t => t.townId === 'south'))).toBe(true);
        for (const e of taxRows.filter(e => e.factionId === 'south-faction')) {
            expect((e.towns ?? []).some(t => t.townId === 'south')).toBe(false);
        }
    });

    it('physical continuity: market, production, routes and merchant beliefs survive the break', () => {
        const probe = freshSouth();
        const snap = secessionTick(probe);
        expect(snap).not.toBeNull();
        const world = freshSouth();
        brutalize(world, 1, snap - 1);
        const before = {
            produces: JSON.parse(JSON.stringify(world.towns.get('south').produces)),
            routes: world.routes.length,
            beliefs: JSON.parse(JSON.stringify(world.merchants[0].routeBeliefs)),
            population: world.towns.get('south').population,
        };
        brutalize(world, snap, snap);
        expect(world.events.some(e => e.type === 'SECESSION' && e.townId === 'south')).toBe(true);
        // Sovereignty changes; the forge, roads, food stock, people
        // and merchant memory survive the constitutional break. Live
        // merchant learning still takes its normal small step on the
        // founding tick (confidence drifts, perception holds) — a
        // reset would snap confidence back to 0.5, an order larger.
        expect(world.towns.get('south').produces).toEqual(before.produces);
        expect(world.routes.length).toBe(before.routes);
        for (const [road, prior] of Object.entries(before.beliefs)) {
            const now = world.merchants[0].routeBeliefs[road];
            expect(now.perceivedDanger).toBe(prior.perceivedDanger);
            expect(Math.abs(now.confidence - prior.confidence)).toBeLessThan(0.03);
        }
        // People are not culled or minted at the break: normal
        // demographic noise only (a founding cull would cost many).
        expect(Math.abs(world.towns.get('south').population - before.population)).toBeLessThanOrEqual(2);
    });
    it('negative controls: content towns never secede, null towns never spawn polities', () => {
        const calm = createClosedWorldScenario({ season: 'SUMMER' });
        calm.ticksPerSeason = 10000;
        for (let t = 1; t <= 60; t++) {
            tickClosedWorld(calm, { tick: t, perceivedDanger: 0.0, encounterRng: () => 0.999 });
        }
        expect(calm.events.some(e => e.type === 'SECESSION')).toBe(false);
        expect(calm.events.some(e => e.type === 'POLITY_FOUNDED')).toBe(false);
        expect(calm.factions.length).toBe(2);
        // An already-uncontrolled town is not a secession: no event, no polity.
        // (The shared attacks also brutalize the ruled north town, which
        // may lawfully found its own polity — the pin is that the NULL
        // town spawns nothing.)
        const orphan = freshSouth();
        orphan.towns.get('south').controlledBy = null;
        brutalize(orphan, 1, 25);
        expect(orphan.events.some(e => e.type === 'SECESSION' && e.townId === 'south')).toBe(false);
        expect(orphan.events.some(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south')).toBe(false);
        expect(orphan.towns.get('south').controlledBy).toBeNull();
    });

    it('occupied brutalized towns revolt first; no polity predates the restore', () => {
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
        const revolt = world.events.find(e => e.type === 'TOWN_REVOLT' && e.townId === 'south');
        expect(revolt).toBeDefined();
        // The pin is per-town ORDER: south's snap is a revolt first;
        // its polity (if continued misrule secedes it next) comes later.
        // (North shares the attacks and may found earlier — different town.)
        const southPolity = world.events.filter(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        for (const p of southPolity) expect(p.tick).toBeGreaterThan(revolt.tick);
    });
    it('one town, one polity: extended misrule and save/load never duplicate sovereignty', () => {
        const world = freshSouth();
        secessionTick(world);
        brutalize(world, 26, 60);
        // Shared attacks brutalize both towns, so each may lawfully
        // found at most one polity — the pin is per-town exactly-once.
        const founded = world.events.filter(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        expect(founded.length).toBe(1);
        expect(world.events.filter(e => e.type === 'POLITY_FOUNDED' && e.townId === 'north').length)
            .toBeLessThanOrEqual(1);
        expect(world.factions.length).toBeLessThanOrEqual(4);
        const polityId = founded[0].polityId;
        const resumed = loadWorld(saveWorld(world));
        expect(resumed.factions.map(f => f.id).sort()).toEqual(world.factions.map(f => f.id).sort());
        expect(resumed.towns.get('south').controlledBy).toBe(polityId);
        brutalize(world, 61, 75);
        brutalize(resumed, 61, 75);
        expect(resumed.towns.get('south').controlledBy).toBe(world.towns.get('south').controlledBy);
        expect(resumed.events.filter(e => e.type === 'POLITY_FOUNDED').length)
            .toBe(world.events.filter(e => e.type === 'POLITY_FOUNDED').length);
        const a = world.factions.find(f => f.id === polityId);
        const b = resumed.factions.find(f => f.id === polityId);
        expect(b.resources).toBeCloseTo(a.resources, 10);
        expect(b.legitimacy).toBeCloseTo(a.legitimacy, 10);
    });

    it('the polity persists and stays bounded over dozens of ticks', () => {
        const world = freshSouth();
        const snap = secessionTick(world);
        brutalize(world, snap + 1, snap + 60);
        const founded = world.events.filter(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        expect(founded.length).toBe(1);
        expect(world.factions.length).toBe(2 + world.events.filter(e => e.type === 'POLITY_FOUNDED').length);
        const polity = world.factions.find(f => f.id === founded[0].polityId);
        expect(world.towns.get('south').controlledBy).toBe(polity.id);
        expect(polity.resources).toBeLessThanOrEqual(polity.maxResources + 1e-9);
        expect(polity.legitimacy).toBeGreaterThanOrEqual(0);
        expect(polity.legitimacy).toBeLessThanOrEqual(1);
    });
});
