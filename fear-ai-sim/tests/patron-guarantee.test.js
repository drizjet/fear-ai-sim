import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent, saveWorld, loadWorld } from '../closed-world.js';
import { activeTreatiesFor } from '../treaty.js';
import { StanceLadder } from '../factionrelationship.js';

// E19 — external patrons and guarantees. A governed polity seeks a
// protector; a strong third party weighs cost and value, pays a booked
// grant, and lends its weight to the town's defense — forcing the
// former ruler to recalculate. Charity without standing buys nothing;
// deterrence without books is a rumor.

function brutalize(world, from, to) {
    for (let t = from; t <= to; t++) {
        world.towns.get('south').market.inventory.set('food', 0);
        appendWorldEvent(world, {
            type: 'BANDIT_ATTACK', roadId: 'road-b', banditId: 'bx',
            merchantId: 'm1', lost: 5, tick: t, attackOpportunityId: `e19-brut-${t}`,
        });
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.9, encounterRng: () => 0.999 });
    }
}

// One secession only: north stands empty (pop 0 skips every exit
// pass), so south founds the single polity and north is the sole
// patron candidate besides the excluded former ruler.
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

function guarantees(world, polityId) {
    return world.treaties.filter(t => t?.terms?.kind === 'guarantee'
        && t?.terms?.polityId === polityId);
}

describe('E19 external patrons and guarantees', () => {
    it('a governed polity wins a sealed guarantee: booked grant, founding parentage, no duplicates', () => {
        const world = lonePolityWorld();
        const snap = secessionTick(world);
        expect(snap).not.toBeNull();
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 30);
        const north = world.factions.find(f => f.id === 'north-faction');
        north.resources = 6;
        north.maxResources = 6;
        govern(world, snap + 31, snap + 55);
        const sealed = guarantees(world, founded.polityId).filter(t => t.status === 'ACTIVE');
        expect(sealed.length).toBe(1);
        const treaty = sealed[0];
        expect(treaty.terms).toMatchObject({ guarantorId: 'north-faction', polityId: founded.polityId });
        expect(treaty.startTick).toBeGreaterThanOrEqual(founded.tick + 30);
        // Books balance: a bounded grant leaves the patron.
        expect(treaty.terms.grant).toBeGreaterThan(0);
        expect(treaty.terms.grant).toBeLessThanOrEqual(1);
        expect(treaty.terms.patronAfter + treaty.terms.grant).toBeLessThanOrEqual(6 + 1e-9);
        const formed = world.events.find(e => e.type === 'TREATY_FORMED' && e.treatyId === treaty.id);
        expect(formed).toBeDefined();
        expect(formed.parentEventIds ?? []).toContain(founded.eventId);
        // One protector: no duplicate through three more weeks.
        govern(world, snap + 56, snap + 75);
        expect(guarantees(world, founded.polityId).length).toBe(1);
    });

    it('deterrence recalculates war: declaration fizzles on patron weight, then peace', () => {
        const world = lonePolityWorld();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 30);
        const north = world.factions.find(f => f.id === 'north-faction');
        north.resources = 6;
        north.maxResources = 6;
        govern(world, snap + 31, snap + 55);
        expect(guarantees(world, founded.polityId).some(t => t.status === 'ACTIVE')).toBe(true);
        // The former ruler storms exactly as in the E18 gamble — fog
        // of war still declares — but patron weight holds the walls.
        const former = world.factions.find(f => f.id === 'south-faction');
        const pair = world.relationships.get(`south-faction::${founded.polityId}`)
            ?? world.relationships.get(`${founded.polityId}::south-faction`);
        // Refresh the patron's weight: it raids away its chest in
        // peacetime, so deterrence is measured at contest time.
        north.resources = 6;
        // Overmatch against the bare town (5 > 1+3): without patron
        // weight this attack takes the town, so only deterrence
        // explains the hold that follows.
        former.grievance = 1;
        former.lastDecision = 'RAID';
        former.informationConfidence = 1;
        former.resources = 5;
        former.maxResources = 5;
        pair.setTrustFrom('south-faction', 0);
        pair.setGrievanceFrom('south-faction', 1);
        pair.setFearFrom('south-faction', 1);
        pair.setTerritorialPressureFrom('south-faction', 1);
        pair.observeFrom('south-faction', StanceLadder.WAR, snap + 55);
        tickClosedWorld(world, { tick: snap + 56, perceivedDanger: 0.1, encounterRng: () => 0.999 });
        expect(world.events.some(e => e.type === 'RECONQUEST_DECLARED'
            && e.polityId === founded.polityId)).toBe(true);
        govern(world, snap + 57, snap + 65);
        expect(world.events.some(e => e.type === 'TOWN_TAKEN' && e.townId === 'south')).toBe(false);
        expect(world.events.some(e => e.type === 'TOWN_HELD' && e.townId === 'south')).toBe(true);
        // Recalculation: a failed, guaranteed war ends in acceptance.
        expect(world.events.some(e => e.type === 'INDEPENDENCE_ACCEPTED'
            && e.polityId === founded.polityId)).toBe(true);
        expect(world.towns.get('south').controlledBy).toBe(founded.polityId);
    });

    it('a failing polity finds no patron: no standing, no guarantee', () => {
        const world = lonePolityWorld();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        const north = world.factions.find(f => f.id === 'north-faction');
        north.resources = 6;
        north.maxResources = 6;
        brutalize(world, snap + 1, snap + 55);
        const polity = world.factions.find(f => f.id === founded.polityId);
        expect(polity.legitimacy).toBeLessThan(0.4);
        expect(guarantees(world, founded.polityId).length).toBe(0);
    });

    it('a poor patron is asked and declines: the ask is recorded, the books never move', () => {
        const world = lonePolityWorld();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 55);
        expect(guarantees(world, founded.polityId).length).toBe(0);
        const polity = world.factions.find(f => f.id === founded.polityId);
        // North was the only candidate and stays capped at 2: asked,
        // declined, never asked twice.
        expect((polity.requestedPatrons ?? [])).toContain('north-faction');
        const north = world.factions.find(f => f.id === 'north-faction');
        expect(north.resources).toBeLessThanOrEqual(north.maxResources);
    });

    it('the former ruler is never the patron, even as the most trusted neighbor', () => {
        const world = lonePolityWorld();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 30);
        // Bribe the books: the former is beloved, the stranger merely liked.
        const pair = world.relationships.get(`south-faction::${founded.polityId}`)
            ?? world.relationships.get(`${founded.polityId}::south-faction`);
        pair.setTrustFrom(founded.polityId, 0.9);
        const north = world.factions.find(f => f.id === 'north-faction');
        north.resources = 6;
        north.maxResources = 6;
        govern(world, snap + 31, snap + 55);
        const sealed = guarantees(world, founded.polityId).filter(t => t.status === 'ACTIVE');
        expect(sealed.length).toBe(1);
        expect(sealed[0].terms.guarantorId).toBe('north-faction');
    });
    it('betrayal costs the guarantee too: a raiding polity loses standing, never land', () => {
        const world = lonePolityWorld();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 30);
        const north = world.factions.find(f => f.id === 'north-faction');
        north.resources = 6;
        north.maxResources = 6;
        govern(world, snap + 31, snap + 55);
        const treaty = guarantees(world, founded.polityId).find(t => t.status === 'ACTIVE');
        expect(treaty).toBeDefined();
        // An unaligned bandit is fair game (no pact covers the stateless).
        world.bandits[0].factionId = null;
        world.bandits[0].roadId = 'road-b';
        const betrayer = world.factions.find(f => f.id === founded.polityId);
        betrayer.grievance = 1;
        betrayer.lastDecision = 'RAID';
        betrayer.resources = 1;
        tickClosedWorld(world, { tick: snap + 56, perceivedDanger: 0.9, encounterRng: () => 0.999 });
        const raids = world.events.filter(e => e.type === 'INVASION'
            && e.factionId === founded.polityId && e.tick === snap + 56);
        expect(raids.length).toBeGreaterThan(0);
        govern(world, snap + 57, snap + 59);
        expect(world.treaties.find(t => t.id === treaty.id).status).toBe('TERMINATED');
        expect(world.treaties.find(t => t.id === treaty.id).termination?.reason).toBe('POLITY_BETRAYAL');
        expect(world.towns.get('south').controlledBy).toBe(founded.polityId);
    });

    it('guarantees survive save/load with no duplicate patrons', () => {
        const world = lonePolityWorld();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 30);
        const north = world.factions.find(f => f.id === 'north-faction');
        north.resources = 6;
        north.maxResources = 6;
        govern(world, snap + 31, snap + 55);
        expect(guarantees(world, founded.polityId).length).toBe(1);
        const resumed = loadWorld(saveWorld(world));
        govern(world, snap + 56, snap + 70);
        govern(resumed, snap + 56, snap + 70);
        const count = w => guarantees(w, founded.polityId).length;
        expect(count(resumed)).toBe(count(world));
        const ids = w => guarantees(w, founded.polityId).map(t => t.id).sort();
        expect(ids(resumed)).toEqual(ids(world));
    });

    it('content worlds seek no patrons: no polities, no guarantees', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        govern(world, 1, 80);
        expect(world.treaties.some(t => t?.terms?.kind === 'guarantee')).toBe(false);
    });
});
