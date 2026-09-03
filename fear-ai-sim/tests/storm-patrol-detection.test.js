import { createClosedWorldScenario, tickClosedWorld, resolveBanditAttack, saveWorld, loadWorld, appendWorldEvent } from '../closed-world.js';
import { createPatrol, tickPatrol } from '../canonical-trade-system.js';

function stagedWorld({ stormRoadId = null, weatherCost = 0 } = {}) {
    const world = createClosedWorldScenario();
    world.ticksPerSeason = 10000;
    const patrol = createPatrol({
        id: 'patrol-weather', route: 'road-a', detectionRate: 0.4,
        interceptionRate: 1, factionId: 'north-faction',
    });
    world.patrols = [patrol];
    // Strip town laws: LAW_VIOLATED would add a lawfulness attention
    // bonus (Slice V) and mask the weather scaling under test.
    for (const [, town] of world.towns) town.laws = [];
    world.merchants[0].cargo = 20;
    resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: 5 });
    if (stormRoadId) {
        world.routes.find(r => r.id === stormRoadId).weatherCost = weatherCost;
    }
    return { world, patrol };
}

describe('storms blind patrol detection (slice AG)', () => {
    test('storm halves the rate: calm intercepts, stormed misses at rng 0.3', () => {
        const { world: calm, patrol: calmPatrol } = stagedWorld({});
        const calmResult = tickPatrol(calm, calmPatrol.id, { tick: 5, rng: () => 0.3 });
        expect(calmResult.events.map(e => e.type)).toEqual(['PATROL_INTERCEPTION']);
        expect(calm.detections ?? calmPatrol.detections).toBe(1);

        const { world: stormy, patrol: stormPatrol } = stagedWorld({ stormRoadId: 'road-a', weatherCost: 5 });
        const stormResult = tickPatrol(stormy, stormPatrol.id, { tick: 5, rng: () => 0.3 });
        expect(stormResult.events.map(e => e.type)).toEqual(['PATROL_DETECTION_MISS']);
        expect(stormPatrol.detections).toBe(0);
    });

    test('enforcementWhy audits the weather exposure', () => {
        const { world, patrol } = stagedWorld({ stormRoadId: 'road-a', weatherCost: 5 });
        const result = tickPatrol(world, patrol.id, { tick: 5, rng: () => 0.3 });
        expect(result.events[0].enforcementWhy).toMatchObject({
            baseDetectionRate: 0.4,
            weatherCost: 5,
            weatherFactor: 0.5,
            effectiveDetectionRate: 0.2,
        });
    });

    test('calm patrols factor exactly 1 and keep the legacy rate', () => {
        const { world, patrol } = stagedWorld({});
        const result = tickPatrol(world, patrol.id, { tick: 5, rng: () => 0.3 });
        expect(result.events[0].enforcementWhy).toMatchObject({
            weatherCost: 0,
            weatherFactor: 1,
            effectiveDetectionRate: 0.4,
        });
    });

    test('storm on an unrelated road does not blind this patrol', () => {
        const { world, patrol } = stagedWorld({ stormRoadId: 'road-b', weatherCost: 9 });
        const result = tickPatrol(world, patrol.id, { tick: 5, rng: () => 0.3 });
        expect(result.events.map(e => e.type)).toEqual(['PATROL_INTERCEPTION']);
        expect(result.events[0].enforcementWhy.weatherFactor).toBe(1);
    });

    test('live storm prices the patrol through the reducer', () => {
        const stormy = createClosedWorldScenario();
        stormy.ticksPerSeason = 10000;
        stormy.patrols = [createPatrol({ id: 'p-live', route: 'road-a', detectionRate: 1, interceptionRate: 0, factionId: 'north-faction' })];
        stormy.storm = { active: true, roadId: 'road-a', severity: 1.0, remainingTicks: 5, startedTick: 1 };
        const ev = appendWorldEvent(stormy, { type: 'STORM_STARTED', roadId: 'road-a', severity: 1.0, duration: 5, tick: 1 });
        stormy.storm.startEventId = ev.eventId;
        tickClosedWorld(stormy, { tick: 1, perceivedDanger: 0.1, attackRoadId: 'road-a' });
        const whys = stormy.events
            .filter(e => (e.type === 'PATROL_INTERCEPTION' || e.type === 'PATROL_DETECTION_MISS') && e.enforcementWhy)
            .map(e => e.enforcementWhy.weatherFactor);
        expect(whys.length).toBeGreaterThan(0);
        for (const factor of whys) expect(factor).toBeLessThan(1);
    });

    test('storm patrol outcome survives save/load with identical follow-up', () => {
        const { world, patrol } = stagedWorld({ stormRoadId: 'road-a', weatherCost: 5 });
        const loaded = loadWorld(saveWorld(world));
        const before = tickPatrol(world, patrol.id, { tick: 5, rng: () => 0.3 });
        const after = tickPatrol(loaded, patrol.id, { tick: 5, rng: () => 0.3 });
        expect(after.events.map(e => e.type)).toEqual(before.events.map(e => e.type));
        expect(after.events[0].enforcementWhy).toMatchObject({ weatherFactor: 0.5 });
    });
});
