import { createClosedWorldScenario, tickClosedWorld, saveWorld, loadWorld, appendWorldEvent } from '../closed-world.js';
import { tickBandit } from '../canonical-trade-system.js';

function huntWorld({ stormRoadId = null, severity = 1.0 } = {}) {
    const world = createClosedWorldScenario();
    world.ticksPerSeason = 10000;
    world.wildlifeGroups = [];
    const bandit = world.bandits[0];
    bandit.roadId = 'road-a';
    bandit.perceptionAccuracy = 0;
    bandit.trafficBelief = {
        'road-a': { estimatedTraffic: 3, recency: 1, lastDecayTick: 1 },
        'road-b': { estimatedTraffic: 5, recency: 1, lastDecayTick: 1 },
        'road-c': { estimatedTraffic: 0, recency: 0, lastDecayTick: 1 },
    };
    world.merchants[0].selectedRoute = 'road-c';
    world.merchants[0].lastRoute = 'road-c';
    if (stormRoadId) {
        world.storm = { active: true, roadId: stormRoadId, severity, remainingTicks: 20, startedTick: 1 };
        const ev = appendWorldEvent(world, { type: 'STORM_STARTED', roadId: stormRoadId, severity, duration: 20, tick: 1 });
        world.storm.startEventId = ev.eventId;
    }
    return world;
}

describe('storms suppress the bandit hunt (slice AF)', () => {
    test('stormed road holds the bandit while the calm control relocates', () => {
        const stormy = huntWorld({ stormRoadId: 'road-b', severity: 1.0 });
        tickClosedWorld(stormy, { tick: 1, perceivedDanger: 0.1 });
        expect(stormy.bandits[0].roadId).toBe('road-a');

        const calm = huntWorld({});
        const result = tickBandit(calm, calm.bandits[0].id, { tick: 1, rng: () => 0.99 });
        expect(result.relocated).toBe(true);
        expect(calm.bandits[0].roadId).toBe('road-b');
    });

    test('calm payoff ratio is factor-free (5:3), storm halves the top payoff', () => {
        const calm = huntWorld({});
        tickBandit(calm, calm.bandits[0].id, { tick: 1, rng: () => 0.99 });
        const calmEvent = calm.events.find(e => e.type === 'BANDIT_RELOCATION');
        expect(calmEvent.topPayoff / calmEvent.currentPayoff).toBeCloseTo(5 / 3, 10);

        const stormy = huntWorld({ stormRoadId: 'road-b', severity: 1.0 });
        stormy.routes.find(r => r.id === 'road-b').weatherCost = 9;
        const result = tickBandit(stormy, stormy.bandits[0].id, { tick: 1, rng: () => 0.99 });
        expect(result.relocated ?? false).toBe(false);
    });

    test('storm on an unrelated road does not affect the hunt', () => {
        const world = huntWorld({ stormRoadId: 'road-c', severity: 1.0 });
        world.routes.find(r => r.id === 'road-c').weatherCost = 5;
        const result = tickBandit(world, world.bandits[0].id, { tick: 1, rng: () => 0.99 });
        expect(result.relocated).toBe(true);
        expect(world.bandits[0].roadId).toBe('road-b');
    });

    test('mild storm still hunts, severe storm holds (severity monotonicity)', () => {
        const mild = huntWorld({ stormRoadId: 'road-b', severity: 0.25 });
        mild.routes.find(r => r.id === 'road-b').weatherCost = 0.25 * 9;
        const mildResult = tickBandit(mild, mild.bandits[0].id, { tick: 1, rng: () => 0.99 });
        expect(mildResult.relocated).toBe(true);

        const severe = huntWorld({ stormRoadId: 'road-b', severity: 1.0 });
        severe.routes.find(r => r.id === 'road-b').weatherCost = 9;
        const severeResult = tickBandit(severe, severe.bandits[0].id, { tick: 1, rng: () => 0.99 });
        expect(severeResult.relocated ?? false).toBe(false);
    });

    test('bandit holding the stormed road stays when it is still the best hunt', () => {
        const world = huntWorld({ stormRoadId: 'road-b', severity: 1.0 });
        world.bandits[0].roadId = 'road-b';
        world.routes.find(r => r.id === 'road-b').weatherCost = 9;
        const result = tickBandit(world, world.bandits[0].id, { tick: 1, rng: () => 0.99 });
        expect(result.relocated ?? false).toBe(false);
        expect(world.bandits[0].roadId).toBe('road-b');
    });

    test('storm suppression survives save/load with identical follow-up decision', () => {
        const world = huntWorld({ stormRoadId: 'road-b', severity: 1.0 });
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.1 });
        const loaded = loadWorld(saveWorld(world));
        const before = tickBandit(world, world.bandits[0].id, { tick: 2, rng: () => 0.99 });
        const after = tickBandit(loaded, loaded.bandits[0].id, { tick: 2, rng: () => 0.99 });
        expect(after.relocated ?? false).toBe(before.relocated ?? false);
        expect(loaded.bandits[0].roadId).toBe(world.bandits[0].roadId);
    });
});
