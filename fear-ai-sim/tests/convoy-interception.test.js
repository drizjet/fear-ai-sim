import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, appendWorldEvent } from '../closed-world.js';
import { createPatrol, tickPatrol } from '../canonical-trade-system.js';

// R7 (V8 audit MAT-002/MAT-003): the convoy is interceptable, and
// every opportunity intercepts at most once — across patrols and
// across the two views (BANDIT_ATTACK / CONVOY_AMBUSH) of one
// incident. Double recovery fabricates material.

function armedWorld() {
    const world = createClosedWorldScenario();
    const faction = world.factions.find(f => f.id === 'north-faction');
    faction.resources = 5;
    faction.maxResources = 10;
    // The default scenario ships one merchant; convoy tests need two.
    if (world.merchants.length < 2) {
        world.merchants.push({ id: 'merchant-2', location: 'north', cargo: 0, cargoKind: 'food', routeBeliefs: {} });
    }
    return world;
}

function stageConvoyAmbush(world, { opportunityId, lost, merchantIds }) {
    return appendWorldEvent(world, {
        type: 'CONVOY_AMBUSH',
        attackOpportunityId: opportunityId,
        convoyId: 'convoy-1',
        lost,
        roadId: 'road-a',
        merchantIds: [...merchantIds],
        derived: false,
        tick: 1,
        rootReason: 'CONVOY_FIRST_DEBIT',
    }, []);
}

describe('R7 — convoy interception (MAT-002) and exactly-once recovery (MAT-003)', () => {
    it('a patrol intercepts a convoy ambush and splits recovery across members', () => {
        const world = armedWorld();
        const [m1, m2] = world.merchants;
        m1.cargo = 5; m1.cargoKind = 'food';
        m2.cargo = 5; m2.cargoKind = 'food';
        world.transitLoss = { food: 10 };
        world.patrols = [createPatrol({ id: 'p1', route: 'road-a', detectionRate: 1, interceptionRate: 1, factionId: 'north-faction' })];
        stageConvoyAmbush(world, { opportunityId: 'opp-convoy-1', lost: 10, merchantIds: [m1.id, m2.id] });
        const result = tickPatrol(world, 'p1', { tick: 1, rng: () => 0 });
        const interceptions = result.events.filter(e => e.type === 'PATROL_INTERCEPTION');
        expect(interceptions.length).toBe(1);
        expect(interceptions[0].recoveredCargo).toBe(10);
        expect(interceptions[0].merchantIds).toEqual(expect.arrayContaining([m1.id, m2.id]));
        expect(m1.cargo).toBeCloseTo(10);
        expect(m2.cargo).toBeCloseTo(10);
        expect(world.transitLoss.food).toBe(0);
    });

    it('two patrols on the same road recover the same opportunity only once', () => {
        const world = armedWorld();
        const [m1, m2] = world.merchants;
        m1.cargo = 5; m1.cargoKind = 'food';
        m2.cargo = 5; m2.cargoKind = 'food';
        world.transitLoss = { food: 10 };
        world.patrols = [
            createPatrol({ id: 'p1', route: 'road-a', detectionRate: 1, interceptionRate: 1, factionId: 'north-faction' }),
            createPatrol({ id: 'p2', route: 'road-a', detectionRate: 1, interceptionRate: 1, factionId: 'north-faction' }),
        ];
        stageConvoyAmbush(world, { opportunityId: 'opp-convoy-2', lost: 10, merchantIds: [m1.id, m2.id] });
        const r1 = tickPatrol(world, 'p1', { tick: 1, rng: () => 0 });
        const r2 = tickPatrol(world, 'p2', { tick: 1, rng: () => 0 });
        const total = [...r1.events, ...r2.events].filter(e => e.type === 'PATROL_INTERCEPTION');
        expect(total.length).toBe(1);
        expect(m1.cargo).toBeCloseTo(10);
        expect(m2.cargo).toBeCloseTo(10);
        expect(world.transitLoss.food).toBe(0);
        expect(world.interceptedAttackIds.has('opp-convoy-2')).toBe(true);
    });

    it('dual views of one incident (direct + convoy) intercept only once', () => {
        const world = armedWorld();
        const [m1] = world.merchants;
        m1.cargo = 4; m1.cargoKind = 'food';
        world.transitLoss = { food: 6 };
        world.patrols = [createPatrol({ id: 'p1', route: 'road-a', detectionRate: 1, interceptionRate: 1, factionId: 'north-faction' })];
        appendWorldEvent(world, {
            type: 'BANDIT_ATTACK', tick: 1, roadId: 'road-a',
            banditId: 'bandits-1', merchantId: m1.id, lost: 6, delivered: 4,
            attackOpportunityId: 'opp-dual-1',
        }, []);
        stageConvoyAmbush(world, { opportunityId: 'opp-dual-1', lost: 6, merchantIds: [m1.id] });
        const result = tickPatrol(world, 'p1', { tick: 1, rng: () => 0 });
        const interceptions = result.events.filter(e => e.type === 'PATROL_INTERCEPTION');
        expect(interceptions.length).toBe(1);
        expect(m1.cargo).toBeCloseTo(10);
        expect(world.transitLoss.food).toBe(0);
    });

    it('a derived convoy view (direct attack already debited) is not intercepted', () => {
        const world = armedWorld();
        const [m1] = world.merchants;
        m1.cargo = 4; m1.cargoKind = 'food';
        world.transitLoss = { food: 6 };
        world.patrols = [createPatrol({ id: 'p1', route: 'road-a', detectionRate: 1, interceptionRate: 1, factionId: 'north-faction' })];
        appendWorldEvent(world, {
            type: 'CONVOY_AMBUSH', attackOpportunityId: 'opp-derived-1', convoyId: 'convoy-1',
            lost: 6, roadId: 'road-a', merchantIds: [m1.id], derived: true,
            tick: 1, rootReason: 'CONVOY_DERIVED_VIEW',
        }, []);
        const result = tickPatrol(world, 'p1', { tick: 1, rng: () => 0 });
        expect(result.events.filter(e => e.type === 'PATROL_INTERCEPTION').length).toBe(0);
        expect(m1.cargo).toBe(4);
    });
});
