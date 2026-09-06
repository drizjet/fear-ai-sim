import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent, saveWorld, loadWorld } from '../closed-world.js';
import { createTreaty } from '../treaty.js';
import { StanceLadder, FactionRelationshipVector } from '../factionrelationship.js';
import { FactionDecisionModel } from '../factioncore.js';

// E24 — chained allegiances and hierarchy contention between overlords.
// Feudal structures are not flat: an intermediate overlord that is
// itself subordinate to a grand overlord passes a portion of incoming
// tribute up the chain. The grand overlord lends defense weight down
// the chain; betrayal fractures the chain; and war stance between
// overlords triggers hierarchy contention.

function brutalize(world, from, to) {
    for (let t = from; t <= to; t++) {
        world.towns.get('south').market.inventory.set('food', 0);
        appendWorldEvent(world, {
            type: 'BANDIT_ATTACK', roadId: 'road-b', banditId: 'bx',
            merchantId: 'm1', lost: 5, tick: t, attackOpportunityId: 'e24-brut-' + t,
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
        && t?.terms?.polityId === polityId);
}

function setupChainedHierarchy(world) {
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

    // Now establish south-faction as subordinate to north-faction (grand overlord)
    const superiorTreaty = createTreaty({
        id: 'treaty-vassalage-north-faction-south-faction-' + (snap + 80),
        participants: ['north-faction', 'south-faction'],
        terms: {
            kind: 'vassalage',
            overlordId: 'north-faction',
            polityId: 'south-faction',
            tributeRate: 0.25,
            rank: 1,
        },
        startTick: snap + 80,
    });
    if (!Array.isArray(world.treaties)) world.treaties = [];
    world.treaties.push(superiorTreaty);

    const north = world.factions.find(f => f.id === 'north-faction');
    north.maxResources = 100;
    former.maxResources = 100;

    return { snap, founded, deal, superiorTreaty, former, north };
}

describe('E24 chained allegiances and hierarchy contention', () => {
    it('tribute flows up the chain: vassal pays intermediate overlord, who passes through to grand overlord', () => {
        const world = lonePolityWorld();
        const { snap, founded, former, north } = setupChainedHierarchy(world);

        const northInitial = Number(north.resources) || 0;
        const formerInitial = Number(former.resources) || 0;

        govern(world, snap + 81, snap + 85);

        const passEvents = world.events.filter(e => e.type === 'TRIBUTE_PASSED_UP'
            && e.fromOverlordId === 'south-faction' && e.toOverlordId === 'north-faction');
        expect(passEvents.length).toBeGreaterThan(0);

        const ev = passEvents[0];
        expect(ev.tributePassedUp).toBeGreaterThan(0);
        expect(ev.retainedTribute).toBeGreaterThan(0);
        expect(ev.tributeReceived).toBeCloseTo(ev.tributePassedUp + ev.retainedTribute, 9);

        // North-faction received the pass-through tribute
        expect(Number(north.resources)).toBeGreaterThan(northInitial);
    });

    it('grand overlord lends chained defense weight down to subordinate walls', () => {
        const world = lonePolityWorld();
        const { snap, founded, north } = setupChainedHierarchy(world);

        north.resources = 10;
        govern(world, snap + 81, snap + 85);

        // Force a takeover gate evaluation on south
        const eastFaction = new FactionDecisionModel({ id: 'east-faction', townId: 'east', resources: 8, maxResources: 8 });
        eastFaction.grievance = 1;
        eastFaction.lastDecision = 'RAID';
        eastFaction.informationConfidence = 1;
        world.factions.push(eastFaction);

        const pair = new FactionRelationshipVector('east-faction', founded.polityId);
        pair.setGrievanceFrom('east-faction', 1);
        pair.setTrustFrom('east-faction', 0);
        pair.observeFrom('east-faction', StanceLadder.WAR, snap + 85);
        world.relationships.set('east-faction::' + founded.polityId, pair);

        tickClosedWorld(world, { tick: snap + 86, perceivedDanger: 0.1, encounterRng: () => 0.999 });

        const gates = world.events.filter(e => e.type === 'TAKEOVER_GATE'
            && e.townId === 'south' && e.factionId === 'east-faction' && e.tick === snap + 86);
        expect(gates.length).toBeGreaterThan(0);
        const gate = gates[0];
        expect(gate.alliedWeight).toBeGreaterThan(0);
    });

    it('fracture stops pass-through: intermediate overlord betrayal ends pass-through', () => {
        const world = lonePolityWorld();
        const { snap, founded, superiorTreaty, north } = setupChainedHierarchy(world);

        // Terminate superior treaty via betrayal
        superiorTreaty.status = 'TERMINATED';
        superiorTreaty.termination = { reason: 'POLITY_BETRAYAL', tick: snap + 81 };

        const northResBefore = Number(north.resources) || 0;
        govern(world, snap + 82, snap + 88);

        const passEventsAfter = world.events.filter(e => e.type === 'TRIBUTE_PASSED_UP'
            && e.tick >= snap + 82);
        expect(passEventsAfter.length).toBe(0);
    });

    it('hierarchy contention: war between intermediate and grand overlord triggers contention event', () => {
        const world = lonePolityWorld();
        const { snap, founded, former, north } = setupChainedHierarchy(world);

        const pair = world.relationships.get('north-faction::south-faction')
            ?? world.relationships.get('south-faction::north-faction');
        if (pair) {
            pair.observeFrom('north-faction', StanceLadder.WAR, snap + 85);
        }

        govern(world, snap + 86, snap + 90);

        const contentions = world.events.filter(e => e.type === 'HIERARCHY_CONTESTED');
        expect(contentions.length).toBeGreaterThan(0);
        expect(contentions[0]).toMatchObject({
            superiorOverlordId: 'north-faction',
            intermediateOverlordId: 'south-faction',
        });
    });

    it('content worlds without chains pass zero tribute up', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        govern(world, 1, 90);
        expect(world.events.some(e => e.type === 'TRIBUTE_PASSED_UP')).toBe(false);
        expect(world.events.some(e => e.type === 'HIERARCHY_CONTESTED')).toBe(false);
    });

    it('chained hierarchies survive save/load round-trip', () => {
        const world = lonePolityWorld();
        const { snap, founded } = setupChainedHierarchy(world);
        govern(world, snap + 81, snap + 85);

        const resumed = loadWorld(saveWorld(world));
        govern(world, snap + 86, snap + 90);
        govern(resumed, snap + 86, snap + 90);

        const passesWorld = world.events.filter(e => e.type === 'TRIBUTE_PASSED_UP').length;
        const passesResumed = resumed.events.filter(e => e.type === 'TRIBUTE_PASSED_UP').length;
        expect(passesResumed).toBe(passesWorld);
    });
});
