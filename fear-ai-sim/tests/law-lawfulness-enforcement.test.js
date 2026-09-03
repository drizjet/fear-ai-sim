import { createClosedWorldScenario, tickClosedWorld, resolveBanditAttack, saveWorld, loadWorld, appendWorldEvent } from '../closed-world.js';
import { createPatrol, tickPatrol } from '../canonical-trade-system.js';
import { getReputationObservation, REPUTATION_DIMENSIONS } from '../reputation.js';

function configurePatrol(world, id = 'patrol-law-slice-v') {
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

describe('law violation -> lawfulness -> patrol attention (slice V)', () => {
    test('LAW_VIOLATED records observer-scoped lawfulness without touching trade reliability', () => {
        const world = createClosedWorldScenario();
        world.merchants[0].cargo = 20;
        const result = resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        expect(result.ok).toBe(true);
        const lawEvents = world.events.filter(e => e.type === 'LAW_VIOLATED');
        expect(lawEvents.length).toBe(1);
        const ev = lawEvents[0];
        // Default bandit belongs to south-faction; violated town owner observes.
        expect(ev.violatorFactionId).toBe('south-faction');
        expect(ev.observerFactionId).toBe('north-faction');
        expect(ev.lawfulness).toMatchObject({ score: 0, outcome: 'VIOLATION' });
        const observer = world.factions.find(f => f.id === 'north-faction');
        const record = getReputationObservation(observer, REPUTATION_DIMENSIONS.LAWFULNESS, 'south-faction');
        expect(record).not.toBeNull();
        expect(record.score).toBe(0);
        expect(record.lastOutcome).toBe('VIOLATION');
        // Dimension isolation: no trade reliability observation leaked.
        expect(getReputationObservation(observer, REPUTATION_DIMENSIONS.TRADE_RELIABILITY, 'south-faction')).toBeNull();
    });

    test('no town law means no lawfulness observation (mutation-sensitive)', () => {
        const world = createClosedWorldScenario();
        for (const [, town] of world.towns) town.laws = [];
        world.merchants[0].cargo = 20;
        const result = resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        expect(result.ok).toBe(true);
        expect(world.events.filter(e => e.type === 'LAW_VIOLATED').length).toBe(0);
        const observer = world.factions.find(f => f.id === 'north-faction');
        expect(getReputationObservation(observer, REPUTATION_DIMENSIONS.LAWFULNESS, 'south-faction')).toBeNull();
    });

    test('law-driven lawfulness raises the observing patrol faction attention only', () => {
        const observedWorld = createClosedWorldScenario();
        const observedPatrol = configurePatrol(observedWorld);
        observedWorld.merchants[0].cargo = 20;
        resolveBanditAttack(observedWorld, { merchantId: 'merchant-1', roadId: 'road-a', tick: 5 });
        const observedResult = tickPatrol(observedWorld, observedPatrol.id, { tick: 5, rng: () => 0.45 });

        const unknownWorld = createClosedWorldScenario();
        // Same attack but laws stripped, so no lawfulness observation exists.
        for (const [, town] of unknownWorld.towns) town.laws = [];
        const unknownPatrol = configurePatrol(unknownWorld);
        unknownWorld.merchants[0].cargo = 20;
        resolveBanditAttack(unknownWorld, { merchantId: 'merchant-1', roadId: 'road-a', tick: 5 });
        const unknownResult = tickPatrol(unknownWorld, unknownPatrol.id, { tick: 5, rng: () => 0.45 });

        expect(observedResult.events.length).toBe(1);
        expect(unknownResult.events.length).toBe(1);
        const observedEvent = observedResult.events[0];
        const unknownEvent = unknownResult.events[0];
        expect(observedEvent.enforcementWhy).toMatchObject({
            violatorFactionId: 'south-faction',
            lawfulnessObserverId: 'north-faction',
            lawfulnessObserved: true,
        });
        expect(observedEvent.enforcementWhy.lawfulness).toBeLessThan(0.5);
        expect(observedEvent.enforcementWhy.effectiveDetectionRate).toBeGreaterThan(0.4);
        expect(unknownEvent.enforcementWhy).toMatchObject({
            lawfulnessObserved: false,
            lawfulnessAttentionBonus: 0,
            effectiveDetectionRate: 0.4,
        });
        expect(observedPatrol.detections).toBe(1);
        expect(unknownPatrol.detections).toBe(0);
    });

    test('encounter-path LAW_VIOLATED carries faction identity for patrol', () => {
        const world = createClosedWorldScenario();
        tickClosedWorld(world, { tick: 1, attackRoadId: 'road-a' });
        const laws = world.events.filter(e => e.type === 'LAW_VIOLATED' && e.tick === 1);
        expect(laws.length).toBeGreaterThan(0);
        for (const law of laws) {
            expect(law.violatorFactionId).toBe('south-faction');
            expect(law.observerFactionId).toBe('north-faction');
        }
        const attacks = world.events.filter(e => e.type === 'BANDIT_ATTACK' && e.tick === 1);
        expect(attacks.length).toBeGreaterThan(0);
    });

    test('lawfulness from a law violation survives save/load with identical enforcement', () => {
        const world = createClosedWorldScenario();
        configurePatrol(world);
        world.merchants[0].cargo = 20;
        resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: 5 });
        const json = saveWorld(world);
        const loaded = loadWorld(json);
        const before = tickPatrol(world, world.patrols[0].id, { tick: 5, rng: () => 0.45 });
        const after = tickPatrol(loaded, loaded.patrols[0].id, { tick: 5, rng: () => 0.45 });
        expect(after.events.length).toBe(before.events.length);
        expect(after.events[0].enforcementWhy).toMatchObject({
            violatorFactionId: 'south-faction',
            lawfulnessObserved: true,
        });
        expect(after.events[0].enforcementWhy.effectiveDetectionRate).toBeCloseTo(
            before.events[0].enforcementWhy.effectiveDetectionRate, 10
        );
        // LAW_VIOLATED record itself round-trips byte-identically (plain JSON).
        const beforeLaw = world.events.filter(e => e.type === 'LAW_VIOLATED');
        const afterLaw = loaded.events.filter(e => e.type === 'LAW_VIOLATED');
        // LAW_VIOLATED is plain JSON; key order may differ after stable
        // stringify, so compare structurally rather than by raw string.
        expect(afterLaw).toEqual(beforeLaw);
    });

    test('free-agent bandit still emits LAW_VIOLATED without inventing a faction', () => {
        const world = createClosedWorldScenario();
        delete world.bandits[0].factionId;
        world.merchants[0].cargo = 20;
        const result = resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        expect(result.ok).toBe(true);
        expect(result.event.factionId).toBeUndefined();
        const laws = world.events.filter(e => e.type === 'LAW_VIOLATED');
        expect(laws.length).toBe(1);
        expect(laws[0].violatorFactionId).toBe(world.bandits[0].id);
    });
});
