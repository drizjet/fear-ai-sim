import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, schedulePendingTradeTrip, appendWorldEvent } from '../closed-world.js';
import { createPatrol, tickPatrol } from '../canonical-trade-system.js';
import { encounterCatalog, instantiateEncounter } from '../encounters.js';

// Slice J — patrol resource gating (faction resources → patrol cost → safety)

describe('Slice J — patrol needs faction resources to operate', () => {
    it('patrol with 0 resources cannot detect/intercept, with resources can', () => {
        const world = createClosedWorldScenario();
        world.patrols = [createPatrol({ id: 'patrol-1', route: 'road-a', detectionRate: 1, interceptionRate: 1, factionId: 'north-faction' })];
        const northFaction = world.factions.find(f => f.id === 'north-faction');
        // Attack on road-a
        appendWorldEvent(world, { type: 'BANDIT_ATTACK', tick: 1, roadId: 'road-a', banditId: 'bandits-1', merchantId: 'merchant-1', lost: 10, delivered: 10 });
        // 0 resources → gated
        northFaction.resources = 0;
        const r0 = tickPatrol(world, 'patrol-1', { tick: 1, rng: () => 0.1 });
        expect(r0.gated).toBe(true);
        expect(r0.events.length).toBe(0);
        // With resources → detects
        northFaction.resources = 2;
        const r2 = tickPatrol(world, 'patrol-1', { tick: 1, rng: () => 0.1 });
        expect(r2.events.length).toBeGreaterThan(0);
        expect(r2.events[0].type).toBe('PATROL_INTERCEPTION');
    });

    it('scheduling trip with patrol deducts faction resources and gates when empty', () => {
        const world = createClosedWorldScenario();
        world.patrols = [createPatrol({ id: 'patrol-save-1', route: 'road-b', detectionRate: 0.75, interceptionRate: 0.5, travelCost: 1, factionId: 'north-faction' })];
        const northFaction = world.factions.find(f => f.id === 'north-faction');
        northFaction.resources = 1;
        northFaction.maxResources = 2;
        const before = northFaction.resources;
        const trip = schedulePendingTradeTrip(world, {
            merchantId: 'merchant-1', routeId: 'road-b', destinationTownId: 'south',
            cargoKind: 'food', cargoAmount: 5, travelTicks: 2, startTick: 0, patrolId: 'patrol-save-1',
        });
        expect(trip).toBeDefined();
        expect(northFaction.resources).toBe(before - 1);
        expect(world.patrolAssignments.some(a => a.patrolId === 'patrol-save-1' && a.status === 'ACTIVE')).toBe(true);

        // Now 0 resources → gated, no assignment, but trip still ships
        northFaction.resources = 0;
        world.merchants[0].cargo = 10;
        const trip2 = schedulePendingTradeTrip(world, {
            merchantId: 'merchant-1', routeId: 'road-b', destinationTownId: 'south',
            cargoKind: 'food', cargoAmount: 2, travelTicks: 2, startTick: 1, patrolId: 'patrol-save-1',
        });
        expect(trip2).toBeDefined();
        expect(world.patrolAssignments.filter(a => a.tripId === trip2.tripId).length).toBe(0);
        expect(world.events.some(e => e.type === 'PATROL_ASSIGNMENT_GATED' && e.tripId === trip2.tripId)).toBe(true);
    });

    it('patrol toll restores resources but respects cap', () => {
        const world = createClosedWorldScenario();
        world.ticksPerSeason = 10000;
        world.factions.find(f => f.id === 'north-faction').resources = 0;
        world.factions.find(f => f.id === 'north-faction').maxResources = 2;
        world.merchants[0].cargo = 20;
        world.guards = [{ id: 'guard-1', factionId: 'north-faction', canReport: true }];
        const template = encounterCatalog().find(t => t.id === 'patrol-checkpoint');
        const before = world.factions.find(f => f.id === 'north-faction').resources;
        instantiateEncounter(template, world, { tick: 1, rng: () => 0.5 });
        const after = world.factions.find(f => f.id === 'north-faction').resources;
        expect(after).toBeGreaterThan(before);
        expect(after).toBeLessThanOrEqual(2);
    });

    it('closed-world patrol interception is gated by resources via tickClosedWorld', () => {
        const worldWith = createClosedWorldScenario();
        const worldWithout = createClosedWorldScenario();
        for (const w of [worldWith, worldWithout]) {
            w.ticksPerSeason = 10000;
            w.patrols = [createPatrol({ id: 'patrol-1', route: 'road-a', detectionRate: 1, interceptionRate: 1, factionId: 'north-faction' })];
            appendWorldEvent(w, { type: 'BANDIT_ATTACK', tick: 1, roadId: 'road-a', banditId: 'bandits-1', merchantId: 'merchant-1', lost: 10, delivered: 10 });
        }
        const withFaction = worldWith.factions.find(f => f.id === 'north-faction');
        withFaction.resources = 2;
        withFaction.maxResources = 2;
        withFaction.lastDecision = 'HOLD';
        const withoutFaction = worldWithout.factions.find(f => f.id === 'north-faction');
        withoutFaction.resources = 0;
        withoutFaction.maxResources = 0; // cap 0 so refill cannot give resources
        withoutFaction.lastDecision = 'HOLD';
        tickClosedWorld(worldWith, { tick: 1, perceivedDanger: 0.5 });
        tickClosedWorld(worldWithout, { tick: 1, perceivedDanger: 0.5 });
        const withInterceptions = worldWith.events.filter(e => e.type === 'PATROL_INTERCEPTION').length;
        const withoutInterceptions = worldWithout.events.filter(e => e.type === 'PATROL_INTERCEPTION').length;
        expect(withInterceptions).toBeGreaterThan(withoutInterceptions);
        expect(withoutInterceptions).toBe(0);
    });
});
