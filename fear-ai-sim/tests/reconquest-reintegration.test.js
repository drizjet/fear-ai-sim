import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent, saveWorld, loadWorld } from '../closed-world.js';
import { activeTreatiesFor } from '../treaty.js';
import { StanceLadder } from '../factionrelationship.js';

// E18 — reconquest and reintegration. The former ruler's claim gets a
// verdict: accept a poor peace, demand yield from a failing polity,
// or declare war and break the pact — and the existing contest
// machinery (not a script) decides what war wins. Withdrawal answers
// betrayal. Cold claims stay silent: reconquest is never automatic.

function brutalize(world, from, to) {
    for (let t = from; t <= to; t++) {
        world.towns.get('south').market.inventory.set('food', 0);
        appendWorldEvent(world, {
            type: 'BANDIT_ATTACK', roadId: 'road-b', banditId: 'bx',
            merchantId: 'm1', lost: 5, tick: t, attackOpportunityId: `e18-brut-${t}`,
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

function secessionTick(world, townId = 'south', limit = 80) {
    for (let t = 1; t <= limit; t++) {
        brutalize(world, t, t);
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

function e18Events(world, polityId) {
    return world.events.filter(e => (e.polityId === polityId || (e.participants ?? []).includes(polityId))
        && ['INDEPENDENCE_ACCEPTED', 'RECONQUEST_DECLARED', 'REINTEGRATION_DEMANDED', 'TOWN_REINTEGRATED'].includes(e.type));
}

describe('E18 reconquest and reintegration', () => {
    it('a poor town is not worth another war: the former ruler accepts independence', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        world.towns.get('south').population = 5;
        const snap = secessionTick(world);
        expect(snap).not.toBeNull();
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 55);
        forceWar(world, 'south-faction', founded.polityId, snap + 55);
        tickClosedWorld(world, { tick: snap + 56, perceivedDanger: 0.1, encounterRng: () => 0.999 });
        const accepted = world.events.filter(e => e.type === 'INDEPENDENCE_ACCEPTED'
            && e.polityId === founded.polityId);
        expect(accepted.length).toBe(1);
        expect(accepted[0]).toMatchObject({ formerId: 'south-faction', townId: 'south' });
        // The peace holds: no declaration through two more weeks, control stands.
        govern(world, snap + 57, snap + 70);
        expect(e18Events(world, founded.polityId)
            .filter(e => e.type !== 'INDEPENDENCE_ACCEPTED').length).toBe(0);
        expect(world.towns.get('south').controlledBy).toBe(founded.polityId);
    });

    it('a rich town is worth the gamble: declaration breaks the pact, war may still fizzle', () => {
        const world = freshSouth();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 55);
        const pactBefore = activeTreatiesFor(founded.polityId, world, { kind: 'non-aggression' })
            .filter(t => (t.participants ?? []).includes('south-faction'));
        expect(pactBefore.length).toBe(1);
        forceWar(world, 'south-faction', founded.polityId, snap + 55);
        const former = world.factions.find(f => f.id === 'south-faction');
        former.resources = 2;
        former.maxResources = 2;
        tickClosedWorld(world, { tick: snap + 56, perceivedDanger: 0.1, encounterRng: () => 0.999 });
        const declared = world.events.filter(e => e.type === 'RECONQUEST_DECLARED'
            && e.polityId === founded.polityId);
        expect(declared.length).toBe(1);
        expect(declared[0].formerPower).toBeGreaterThanOrEqual(2);
        // Casus belli has a price: the pact is terminated first.
        const pactAfter = activeTreatiesFor(founded.polityId, world, { kind: 'non-aggression' })
            .filter(t => (t.participants ?? []).includes('south-faction'));
        expect(pactAfter.length).toBe(0);
        // But declaration is not conquest: capped power fizzles on the
        // contest (fog of war), and the town stands.
        govern(world, snap + 57, snap + 60);
        expect(world.events.some(e => e.type === 'TOWN_TAKEN' && e.townId === 'south')).toBe(false);
        expect(world.towns.get('south').controlledBy).toBe(founded.polityId);
    });

    it('overwhelming power completes reconquest: take, occupy, tax, and the arc closes in revolt', () => {
        const world = freshSouth();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 55);
        forceWar(world, 'south-faction', founded.polityId, snap + 55);
        const former = world.factions.find(f => f.id === 'south-faction');
        former.resources = 8;
        former.maxResources = 8;
        tickClosedWorld(world, { tick: snap + 56, perceivedDanger: 0.1, encounterRng: () => 0.999 });
        expect(world.events.some(e => e.type === 'RECONQUEST_DECLARED'
            && e.polityId === founded.polityId)).toBe(true);
        govern(world, snap + 57, snap + 62);
        const taken = world.events.filter(e => e.type === 'TOWN_TAKEN' && e.townId === 'south');
        expect(taken.length).toBeGreaterThan(0);
        expect(taken[0]).toMatchObject({ fromFactionId: founded.polityId, toFactionId: 'south-faction' });
        expect(world.towns.get('south').controlledBy).toBe('south-faction');
        // Conquest opens an occupation with the polity on record.
        expect(world.towns.get('south').occupation?.byFactionId).toBe('south-faction');
        expect(world.towns.get('south').occupation?.priorControllerId).toBe(founded.polityId);
        // The former ruler taxes its recovered base.
        const taxRows = world.events.filter(e => e.type === 'TAX_COLLECTED'
            && e.factionId === 'south-faction' && (e.tick ?? 0) > taken[0].tick);
        expect(taxRows.some(e => (e.towns ?? []).some(t => t.townId === 'south'))).toBe(true);
        // And the full arc closes: brutal occupation revolts back to the polity.
        brutalize(world, snap + 63, snap + 90);
        const revolt = world.events.find(e => e.type === 'TOWN_REVOLT' && e.townId === 'south');
        expect(revolt).toBeDefined();
        expect(revolt).toMatchObject({ toFactionId: founded.polityId });
    });

    it('overwhelming threat plus failure yields peace: demand and reintegrate without war', () => {
        const world = freshSouth();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        // Keep brutalizing so the polity never earns standing.
        brutalize(world, snap + 1, snap + 55);
        const polity = world.factions.find(f => f.id === founded.polityId);
        expect(polity.legitimacy).toBeLessThan(0.4);
        forceWar(world, 'south-faction', founded.polityId, snap + 55);
        const former = world.factions.find(f => f.id === 'south-faction');
        former.resources = 10;
        former.maxResources = 10;
        tickClosedWorld(world, { tick: snap + 56, perceivedDanger: 0.1, encounterRng: () => 0.999 });
        const demanded = world.events.filter(e => e.type === 'REINTEGRATION_DEMANDED'
            && e.polityId === founded.polityId);
        expect(demanded.length).toBe(1);
        const yielded = world.events.filter(e => e.type === 'TOWN_REINTEGRATED'
            && e.townId === 'south');
        expect(yielded.length).toBe(1);
        expect(yielded[0]).toMatchObject({ fromFactionId: founded.polityId, toFactionId: 'south-faction' });
        // Peace means peace: no battle, no occupation, polity survives landless.
        expect(world.events.some(e => e.type === 'TOWN_TAKEN' && e.townId === 'south')).toBe(false);
        expect(world.towns.get('south').occupation ?? null).toBeNull();
        expect(world.towns.get('south').controlledBy).toBe('south-faction');
        expect(world.factions.some(f => f.id === founded.polityId)).toBe(true);
    });

    it('betrayal costs standing: a raiding polity loses recognition but keeps its binding pact', () => {
        const world = freshSouth();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 40);
        const recognition = world.treaties.find(t => t?.terms?.kind === 'recognition'
            && t?.terms?.polityId === founded.polityId && t.status === 'ACTIVE');
        expect(recognition).toBeDefined();
        // An unaligned bandit is fair game (no pact covers the stateless).
        world.bandits[0].factionId = null;
        world.bandits[0].roadId = 'road-b';
        const betrayer = world.factions.find(f => f.id === founded.polityId);
        betrayer.grievance = 1;
        betrayer.lastDecision = 'RAID';
        betrayer.resources = 1;
        tickClosedWorld(world, { tick: snap + 41, perceivedDanger: 0.9, encounterRng: () => 0.999 });
        const raids = world.events.filter(e => e.type === 'INVASION'
            && e.factionId === founded.polityId && e.tick === snap + 41);
        expect(raids.length).toBeGreaterThan(0);
        govern(world, snap + 42, snap + 44);
        const withdrawn = world.treaties.find(t => t.id === recognition.id);
        expect(withdrawn.status).toBe('TERMINATED');
        expect(withdrawn.termination?.reason).toBe('POLITY_BETRAYAL');
        // Contracts outlive standing: the pact still binds.
        const pact = world.treaties.find(t => t?.terms?.kind === 'non-aggression'
            && (t.participants ?? []).includes(founded.polityId) && t.status === 'ACTIVE');
        expect(pact).toBeDefined();
        expect(world.towns.get('south').controlledBy).toBe(founded.polityId);
    });

    it('cold claims stay silent: no stance, no verdict, no war', () => {
        const world = freshSouth();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 75);
        expect(e18Events(world, founded.polityId).length).toBe(0);
        expect(world.towns.get('south').controlledBy).toBe(founded.polityId);
    });

    it('content worlds never deliberate: no polities, no verdicts', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        govern(world, 1, 80);
        for (const type of ['INDEPENDENCE_ACCEPTED', 'RECONQUEST_DECLARED', 'REINTEGRATION_DEMANDED', 'TOWN_REINTEGRATED']) {
            expect(world.events.some(e => e.type === type)).toBe(false);
        }
    });

    it('verdicts survive save/load with no duplicate deliberation', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        world.towns.get('south').population = 5;
        const snap = secessionTick(world);
        govern(world, snap + 1, snap + 55);
        forceWar(world, 'south-faction',
            world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south').polityId,
            snap + 55);
        tickClosedWorld(world, { tick: snap + 56, perceivedDanger: 0.1, encounterRng: () => 0.999 });
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        expect(world.events.some(e => e.type === 'INDEPENDENCE_ACCEPTED')).toBe(true);
        const resumed = loadWorld(saveWorld(world));
        govern(world, snap + 57, snap + 70);
        govern(resumed, snap + 57, snap + 70);
        const count = w => e18Events(w, founded.polityId).length;
        expect(count(resumed)).toBe(count(world));
        expect(resumed.towns.get('south').controlledBy).toBe(world.towns.get('south').controlledBy);
    });
});
