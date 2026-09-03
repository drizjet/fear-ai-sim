import { describe, expect, test } from '@jest/globals';
import {
    appendWorldEvent,
    createClosedWorldScenario,
    loadWorld,
    saveWorld,
} from '../closed-world.js';
import { createPatrol, tickPatrol } from '../canonical-trade-system.js';
import { FactionDecisionModel } from '../factioncore.js';
import {
    getReputationObservation,
    recordLawfulnessViolation,
    recordTradeReliability,
    REPUTATION_DIMENSIONS,
} from '../reputation.js';
import { requestPassage, violateTreaty } from '../treaty.js';

function configurePatrol(world, id = 'patrol-lawfulness') {
    const patrol = createPatrol({
        id,
        route: 'road-a',
        detectionRate: 0.4,
        interceptionRate: 0,
        factionId: 'north-faction',
        lawfulnessWeight: 0.5,
        lawfulnessHalfLifeTicks: 40,
    });
    world.patrols = [patrol];
    return patrol;
}

function appendFactionAttack(world, tick = 5) {
    world.bandits[0].factionId = 'south-faction';
    return appendWorldEvent(world, {
        type: 'BANDIT_ATTACK',
        tick,
        roadId: 'road-a',
        banditId: world.bandits[0].id,
        factionId: 'south-faction',
        merchantId: 'merchant-1',
        lost: 1,
        delivered: 0,
        rootReason: 'TEST_ATTACK',
    });
}

function seedObservedViolation(world, tick = 1) {
    const { treaty } = requestPassage({
        actor: 'north-faction',
        target: 'south-faction',
        scope: 'road-a',
        world,
        tick: 0,
    });
    violateTreaty({
        treaty,
        violator: 'south-faction',
        reason: 'bandit-ambush',
        world,
        tick,
    });
    return treaty;
}

describe('lawfulness reputation and observer-scoped patrol enforcement', () => {
    test('treaty violation records lawfulness for observers without contaminating other dimensions', () => {
        const world = createClosedWorldScenario();
        const north = world.factions.find(faction => faction.id === 'north-faction');
        north.memoryByActor = { 'bandits-1': 0.8 };
        recordTradeReliability(north, 'south', {
            shipped: 10,
            stored: 10,
            tick: 0,
            tripId: 'TRADE-1',
        });

        const treaty = seedObservedViolation(world, 3);
        const northLawfulness = getReputationObservation(
            north,
            REPUTATION_DIMENSIONS.LAWFULNESS,
            'south-faction',
        );
        const southLawfulness = getReputationObservation(
            world.factions.find(faction => faction.id === 'south-faction'),
            REPUTATION_DIMENSIONS.LAWFULNESS,
            'south-faction',
        );

        expect(treaty.violations).toHaveLength(1);
        expect(northLawfulness).toMatchObject({
            score: 0,
            observations: 1,
            failures: 1,
            lastOutcome: 'VIOLATION',
        });
        expect(southLawfulness).toBeNull();
        expect(north.memoryByActor).toEqual({ 'bandits-1': 0.8 });
        expect(north.reputationByDimension[REPUTATION_DIMENSIONS.TRADE_RELIABILITY].south)
            .toMatchObject({ score: 1, observations: 1 });
        const event = world.events.find(item => item.type === 'TREATY_VIOLATED');
        expect(event.reputation).toEqual([
            expect.objectContaining({
                observerId: 'north-faction',
                violatorId: 'south-faction',
                dimension: 'lawfulness',
                score: 0,
                outcome: 'VIOLATION',
            }),
        ]);
    });

    test('low lawfulness raises only the observing patrol faction\'s detection attention', () => {
        const observedWorld = createClosedWorldScenario();
        const observedPatrol = configurePatrol(observedWorld);
        seedObservedViolation(observedWorld, 1);
        appendFactionAttack(observedWorld, 5);
        const observedResult = tickPatrol(observedWorld, observedPatrol.id, {
            tick: 5,
            rng: () => 0.45,
        });

        const unknownWorld = createClosedWorldScenario();
        const unknownPatrol = configurePatrol(unknownWorld);
        appendFactionAttack(unknownWorld, 5);
        const unknownResult = tickPatrol(unknownWorld, unknownPatrol.id, {
            tick: 5,
            rng: () => 0.45,
        });

        const observedEvent = observedResult.events[0];
        const unknownEvent = unknownResult.events[0];
        expect(observedEvent.type).toBe('PATROL_DETECTION_MISS');
        expect(unknownEvent.type).toBe('PATROL_DETECTION_MISS');
        expect(observedEvent.enforcementWhy).toMatchObject({
            lawfulnessObserverId: 'north-faction',
            lawfulnessObserved: true,
            baseDetectionRate: 0.4,
        });
        expect(observedEvent.enforcementWhy.lawfulness).toBeLessThan(0.5);
        expect(observedEvent.enforcementWhy.effectiveDetectionRate).toBeGreaterThan(0.4);
        expect(unknownEvent.enforcementWhy).toMatchObject({
            lawfulnessObserverId: 'north-faction',
            lawfulness: null,
            lawfulnessObserved: false,
            lawfulnessAttentionBonus: 0,
            effectiveDetectionRate: 0.4,
        });
        expect(observedPatrol.detections).toBe(1);
        expect(unknownPatrol.detections).toBe(0);
    });

    test('lawfulness held by an unrelated observer does not affect the patrol', () => {
        const world = createClosedWorldScenario();
        const outsider = new FactionDecisionModel({
            id: 'outsider-faction',
            resources: 1,
            maxResources: 1,
        });
        world.factions.push(outsider);
        recordLawfulnessViolation(outsider, 'south-faction', {
            tick: 1,
            treatyId: 'outsider-observation',
            reason: 'unrelated-breach',
        });
        const patrol = configurePatrol(world);
        appendFactionAttack(world, 5);

        const result = tickPatrol(world, patrol.id, {
            tick: 5,
            rng: () => 0.45,
        });
        const event = result.events[0];

        expect(event.enforcementWhy.lawfulnessObserverId).toBe('north-faction');
        expect(event.enforcementWhy.lawfulnessObserved).toBe(false);
        expect(event.enforcementWhy.lawfulness).toBeNull();
        expect(event.enforcementWhy.effectiveDetectionRate).toBe(0.4);
        expect(patrol.detections).toBe(0);
    });

    test('lawfulness state and patrol enforcement survive save/load deterministically', () => {
        const original = createClosedWorldScenario();
        const patrol = configurePatrol(original);
        seedObservedViolation(original, 1);
        appendFactionAttack(original, 5);
        const restored = loadWorld(saveWorld(original));

        const originalFaction = original.factions.find(faction => faction.id === 'north-faction');
        const restoredFaction = restored.factions.find(faction => faction.id === 'north-faction');
        expect(restoredFaction.reputationByDimension).toEqual(originalFaction.reputationByDimension);

        const originalResult = tickPatrol(original, patrol.id, {
            tick: 5,
            rng: () => 0.45,
        });
        const restoredResult = tickPatrol(restored, patrol.id, {
            tick: 5,
            rng: () => 0.45,
        });

        expect(restoredResult.events[0].enforcementWhy).toEqual(
            originalResult.events[0].enforcementWhy,
        );
        expect(restored.patrols[0].detections).toBe(original.patrols[0].detections);
        expect(saveWorld(restored)).toBe(saveWorld(original));
    });
});
