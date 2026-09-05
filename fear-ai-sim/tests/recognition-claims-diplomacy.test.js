import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent, saveWorld, loadWorld } from '../closed-world.js';
import { activeTreatiesFor } from '../treaty.js';
import { StanceLadder } from '../factionrelationship.js';

// E17 — recognition, claims, and secession diplomacy. A governed
// polity must be observed: incumbents grant or refuse recognition,
// recognition unlocks treaty access (non-aggression), and the former
// ruler's claim survives recognition. Withdrawal and reconquest are
// E18 work — this slice proves observe → decide → access.

function brutalize(world, from, to) {
    for (let t = from; t <= to; t++) {
        world.towns.get('south').market.inventory.set('food', 0);
        appendWorldEvent(world, {
            type: 'BANDIT_ATTACK', roadId: 'road-b', banditId: 'bx',
            merchantId: 'm1', lost: 5, tick: t, attackOpportunityId: `e17-brut-${t}`,
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

function recognitionTreaties(world, polityId) {
    // Direction matters: the polity must be the recognized party
    // (it also grants recognition to other polities elsewhere).
    return world.treaties.filter(t => t?.terms?.kind === 'recognition'
        && t?.terms?.polityId === polityId);
}
describe('E17 recognition, claims, and secession diplomacy', () => {
    it('a governed polity is recognized: treaty parented to the founding, trust dividend paid', () => {
        const world = freshSouth();
        const snap = secessionTick(world);
        expect(snap).not.toBeNull();
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 45);
        const grants = recognitionTreaties(world, founded.polityId)
            .filter(t => t.status === 'ACTIVE');
        expect(grants.length).toBeGreaterThan(0);
        const grant = grants[0];
        // The polity must govern first: no instant coronations.
        expect(grant.startTick).toBeGreaterThanOrEqual(founded.tick + 10);
        // Causal chain: founding -> recognition, never an orphan.
        const formed = world.events.find(e => e.type === 'TREATY_FORMED' && e.treatyId === grant.id);
        expect(formed).toBeDefined();
        expect(formed.parentEventIds ?? []).toContain(founded.eventId);
        // The recognizer's trust in the polity rises through the
        // existing trade dimension — recognition is priced, not free.
        const recognizer = grant.participants.find(p => p !== founded.polityId);
        const pair = world.relationships.get(`${recognizer}::${founded.polityId}`)
            ?? world.relationships.get(`${founded.polityId}::${recognizer}`);
        expect(pair.getTrustFrom(recognizer)).toBeGreaterThan(0.5);
    });

    it('recognition unlocks treaty access: a pact follows, and it blocks a real takeover', () => {
        const world = freshSouth();
        const snap = secessionTick(world);
        expect(snap).not.toBeNull();
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 45);
        // The former ruler's own pact (other pairs may pact too —
        // the survival pin needs the ex-ruler's signature).
        const pact = activeTreatiesFor(founded.polityId, world, { kind: 'non-aggression' })
            .filter(t => (t.participants ?? []).includes('south-faction'));
        expect(pact.length).toBe(1);
        // The pact is downstream of recognition, never standalone.
        const recognition = recognitionTreaties(world, founded.polityId)
            .find(t => t.status === 'ACTIVE' && (t.participants ?? []).includes('south-faction'));
        expect(recognition).toBeDefined();
        expect(pact[0].startTick).toBeGreaterThanOrEqual(recognition.startTick);
        // Survival proof: drive the former ruler to WAR + RAID and
        // watch the pact — not luck — stop the conquest machinery.
        const former = world.factions.find(f => f.id === 'south-faction');
        const pair = world.relationships.get(`south-faction::${founded.polityId}`)
            ?? world.relationships.get(`${founded.polityId}::south-faction`);
        former.grievance = 1;
        former.lastDecision = 'RAID';
        former.resources = 5;
        former.maxResources = 5;
        former.informationConfidence = 1;
        const polity = world.factions.find(f => f.id === founded.polityId);
        polity.resources = 1;
        pair.setTrustFrom('south-faction', 0);
        pair.setGrievanceFrom('south-faction', 1);
        pair.setFearFrom('south-faction', 1);
        pair.setTerritorialPressureFrom('south-faction', 1);
        pair.observeFrom('south-faction', StanceLadder.WAR, snap + 45);
        const attackTick = snap + 46;
        tickClosedWorld(world, { tick: attackTick, perceivedDanger: 0.0, encounterRng: () => 0.999 });
        const blocks = world.events.filter(e => e.type === 'TAKEOVER_GATE'
            && e.townId === 'south' && e.reason === 'TAKEOVER_TREATY_BLOCKED');
        expect(blocks.length).toBeGreaterThan(0);
        expect(blocks[0].treatyId).toBe(pact[0].id);
        expect(world.towns.get('south').controlledBy).toBe(founded.polityId);
    });

    it('a misruled polity is refused exactly once and never pacted', () => {
        const world = freshSouth();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        // Keep brutalizing: legitimacy can never earn recognition.
        brutalize(world, snap + 1, snap + 45);
        const polity = world.factions.find(f => f.id === founded.polityId);
        expect(polity.legitimacy).toBeLessThan(0.5);
        const refusals = world.events.filter(e => e.type === 'RECOGNITION_REFUSED'
            && e.polityId === founded.polityId);
        expect(refusals.length).toBeGreaterThan(0);
        expect(refusals[0]).toMatchObject({ reason: 'LOW_LEGITIMACY' });
        // No treaty access without recognition — the gate holds.
        expect(recognitionTreaties(world, founded.polityId).length).toBe(0);
        expect(activeTreatiesFor(founded.polityId, world, { kind: 'non-aggression' }).length).toBe(0);
    });

    it('young polities get no diplomacy: the polity must govern first', () => {
        const world = freshSouth();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 5);
        expect(recognitionTreaties(world, founded.polityId).length).toBe(0);
        expect(world.events.some(e => e.type === 'RECOGNITION_REFUSED')).toBe(false);
        expect(activeTreatiesFor(founded.polityId, world).length).toBe(0);
    });

    it('recognition never absolves: the former-ruler claim survives the treaty', () => {
        const world = freshSouth();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 45);
        expect(recognitionTreaties(world, founded.polityId).length).toBeGreaterThan(0);
        const pair = world.relationships.get(`south-faction::${founded.polityId}`)
        // The founding claim is sticky institutional memory: political
        // recognition does not erase the territorial dispute (E18 fuel).
        // The HARM stays on the pair's audit trail forever, and one
        // recognition dividend never heals trust to pristine.
        const harms = (pair.events ?? []).filter(e => e?.type === 'HARM'
            && e?.fromFactionId === founded.polityId);
        expect(harms.length).toBeGreaterThan(0);
        expect(pair.getTrustFrom('south-faction')).toBeLessThan(0.6);
    });

    it('recognition survives save/load with no duplicate grants', () => {
        const world = freshSouth();
        const snap = secessionTick(world);
        const founded = world.events.find(e => e.type === 'POLITY_FOUNDED' && e.townId === 'south');
        govern(world, snap + 1, snap + 45);
        expect(recognitionTreaties(world, founded.polityId).length).toBeGreaterThan(0);
        const resumed = loadWorld(saveWorld(world));
        govern(world, snap + 46, snap + 65);
        govern(resumed, snap + 46, snap + 65);
        const count = w => recognitionTreaties(w, founded.polityId).length;
        expect(count(resumed)).toBe(count(world));
        expect(resumed.towns.get('south').controlledBy).toBe(world.towns.get('south').controlledBy);
        const ids = w => recognitionTreaties(w, founded.polityId).map(t => t.id).sort();
        expect(ids(resumed)).toEqual(ids(world));
    });

    it('content worlds stay undiplomatic: no polities, no treaties, no refusals', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        govern(world, 1, 60);
        expect(world.events.some(e => e.type === 'POLITY_FOUNDED')).toBe(false);
        expect(world.treaties.some(t => t?.terms?.kind === 'recognition')).toBe(false);
        expect(world.events.some(e => e.type === 'RECOGNITION_REFUSED')).toBe(false);
    });
});
