import { createClosedWorldScenario, tickClosedWorld, formClosedWorldConvoy } from '../closed-world.js';
import { requestPassage, violateTreaty, terminateTreaty } from '../treaty.js';

// R2 (V8 audit F6/F7) — every live emission flows through the allocator
// with an id and a parent-or-root. Bare world.events.push bypasses the
// WORLD-EVENT-* allocator and the ledger index, leaving orphans whose
// causes exist but are unwired.

const ALLOCATED = /^WORLD-EVENT-/;
function assertParented(event, label) {
    expect(event.eventId).toMatch(ALLOCATED);
    const hasParents = Array.isArray(event.parentEventIds) && event.parentEventIds.length > 0;
    expect(hasParents || Boolean(event.rootReason)).toBe(true);
}

describe('event parentage authority (R2)', () => {
    test('CONVOY_AMBUSH carries an allocator id and a BANDIT_ATTACK parent or root', () => {
        const world = createClosedWorldScenario();
        // E11: ambushes need a hired convoy. Stage the economic
        // precondition so the merchant buys its escort on tick 1.
        const merchant = world.merchants[0];
        merchant.cargo = 20;
        merchant.capital = 100;
        merchant.routeBeliefs['road-a'] = { perceivedDanger: 0.9, confidence: 0.9 };
        merchant.routeBeliefs['road-b'] = { perceivedDanger: 1, confidence: 0.9 };
        merchant.routeBeliefs['road-c'] = { perceivedDanger: 1, confidence: 0.9 };
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0, relationshipGate: true, encounterRng: () => 0.999 });
        expect(world.convoy).not.toBeNull();
        world.bandits[0].roadId = world.merchants[0].selectedRoute ?? world.merchants[0].lastRoute ?? 'road-a';
        world.bandits[0]._lastRelocationTick = 2;
        world.bandits[0].relocationCooldownTicks = 10000;
        for (let t = 2; t <= 4; t += 1) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.0, relationshipGate: true, attackRoadId: world.bandits[0].roadId, encounterRng: () => 0.999 });
        }
        const ambushes = world.events.filter(e => e.type === 'CONVOY_AMBUSH');
        for (const ambush of ambushes) {
            assertParented(ambush, 'CONVOY_AMBUSH');
            // R2b: the ambush names its convoy members so a later
            // MERCHANT_RESPAWN can parent to the loss that caused it.
            expect(Array.isArray(ambush.merchantIds)).toBe(true);
            expect(ambush.merchantIds).toContain('merchant-1');
            // The sibling-attack parent branch is unreachable by
            // construction (convoy block precedes same-tick direct
            // attacks); every live ambush declares its root case.
            if ((ambush.parentEventIds ?? []).length === 0) {
                expect(['CONVOY_FIRST_DEBIT', 'CONVOY_DERIVED_VIEW']).toContain(ambush.rootReason);
            }
        }
    });

    test('MERCHANT_RESPAWN carries an allocator id and a loss parent or root', () => {
        const world = createClosedWorldScenario();
        world.merchants[0].cargo = 0;
        world.merchants[0].location = 'north';
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        const respawns = world.events.filter(e => e.type === 'MERCHANT_RESPAWN' && e.tick === 1);
        expect(respawns.length).toBeGreaterThan(0);
        for (const respawn of respawns) assertParented(respawn, 'MERCHANT_RESPAWN');
    });

    test('SEASON_CHANGE carries allocator ids chained parent-to-child', () => {
        const world = createClosedWorldScenario();
        world.ticksPerSeason = 1;
        for (let t = 1; t <= 3; t += 1) tickClosedWorld(world, { tick: t, perceivedDanger: 0.0 });
        const seasons = world.events.filter(e => e.type === 'SEASON_CHANGE');
        expect(seasons.length).toBeGreaterThanOrEqual(2);
        const ids = new Set(seasons.map(e => e.eventId));
        expect([...ids].every(id => ALLOCATED.test(id ?? ''))).toBe(true);
        expect(new Set(seasons.map(e => e.eventId)).size).toBe(seasons.length);
        for (let i = 1; i < seasons.length; i += 1) {
            expect(seasons[i].parentEventIds ?? []).toContain(seasons[i - 1].eventId);
        }
    });

    test('ENCOUNTER carries an allocator id parented to its candidate', () => {
        const world = createClosedWorldScenario();
        world.merchants[0].routeBeliefs = {
            'road-a': { perceivedDanger: 0.05, confidence: 0.9 },
            'road-b': { perceivedDanger: 0.8, confidence: 0.5 },
            'road-c': { perceivedDanger: 0.8, confidence: 0.5 },
        };
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0, attackRoadId: 'road-a' });
        const encounters = world.events.filter(e => e.type === 'ENCOUNTER' && e.encounterId === 'bandit-ambush');
        expect(encounters.length).toBeGreaterThan(0);
        for (const encounter of encounters) {
            expect(encounter.eventId).toMatch(ALLOCATED);
            const parents = encounter.parentEventIds ?? [];
            expect(parents.length).toBeGreaterThan(0);
            const parent = world.events.find(e => e.eventId === parents[0]);
            expect(parent?.type).toBe('CANDIDATE_ENCOUNTER');
        }
        // The encounter-produced BANDIT_ATTACK must parent to the
        // ENCOUNTER that produced it (not to an undefined id).
        const children = world.events.filter(e => e.type === 'BANDIT_ATTACK' && e.tick === 1);
        expect(children.length).toBeGreaterThan(0);
        for (const child of children) {
            const encounter = encounters.find(e => e.eventId === (child.parentEventIds ?? [])[0]);
            expect(encounter?.encounterId).toBe('bandit-ambush');
        }
    });

    test('treaty chain links FORMED -> VIOLATED -> TERMINATED by parentage', () => {
        const world = createClosedWorldScenario();
        const formed = requestPassage({ actor: 'north-faction', target: 'south-faction', scope: 'road-a', world, tick: 1 });
        expect(formed.ok).toBe(true);
        violateTreaty({ treaty: formed.treaty, violator: 'north-faction', reason: 'test', world, tick: 2 });
        terminateTreaty({ treaty: formed.treaty, reason: 'test', world, tick: 3 });
        const evFormed = world.events.find(e => e.type === 'TREATY_FORMED');
        const evViolated = world.events.find(e => e.type === 'TREATY_VIOLATED');
        const evTerminated = world.events.find(e => e.type === 'TREATY_TERMINATED');
        expect(evFormed?.eventId).toMatch(ALLOCATED);
        expect(evViolated?.parentEventIds ?? []).toContain(evFormed?.eventId);
        expect(evTerminated?.parentEventIds ?? []).toContain(evViolated?.eventId);
    });

    test('one-shot CONVOY_FORMED carries an allocator id', () => {
        const world = createClosedWorldScenario();
        formClosedWorldConvoy(world);
        const formed = world.events.filter(e => e.type === 'CONVOY_FORMED');
        expect(formed.length).toBeGreaterThan(0);
        for (const event of formed) assertParented(event, 'CONVOY_FORMED');
    });
});
