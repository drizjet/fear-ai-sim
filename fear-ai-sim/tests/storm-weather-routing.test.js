import { createClosedWorldScenario, tickClosedWorld, saveWorld, loadWorld, appendWorldEvent } from '../closed-world.js';

function stormWorld(roadId = 'road-a', severity = 0.5, remainingTicks = 5) {
    const world = createClosedWorldScenario();
    world.ticksPerSeason = 10000;
    world.storm = { active: true, roadId, severity, remainingTicks, startedTick: 1 };
    const ev = appendWorldEvent(world, { type: 'STORM_STARTED', roadId, severity, duration: remainingTicks, tick: 1 });
    world.storm.startEventId = ev.eventId;
    return world;
}

function calmWorld() {
    const world = createClosedWorldScenario();
    world.ticksPerSeason = 10000;
    return world;
}

describe('storm weather prices road risk through routing (slice AE)', () => {
    test('active storm sets weatherCost = severity x distance on its road only', () => {
        const world = stormWorld('road-a', 0.5, 5);
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.1 });
        expect(world.routes.find(r => r.id === 'road-a').weatherCost).toBeCloseTo(2.5, 10);
        for (const route of world.routes.filter(r => r.id !== 'road-a')) {
            expect(route.weatherCost).toBe(0);
        }
    });

    test('storm end clears weatherCost and emits parented STORM_ENDED', () => {
        const world = stormWorld('road-a', 0.5, 1);
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.1 });
        expect(world.storm.active).toBe(false);
        const ended = world.events.find(e => e.type === 'STORM_ENDED');
        expect(ended).toBeDefined();
        expect(ended.roadId).toBe('road-a');
        expect(ended.parentEventIds ?? ended.parentIds ?? []).toContain(world.storm.startEventId);
        tickClosedWorld(world, { tick: 2, perceivedDanger: 0.1 });
        expect(world.routes.find(r => r.id === 'road-a').weatherCost).toBe(0);
    });

    test('storm flips the live merchant off its preferred road vs calm control', () => {
        const stormy = stormWorld('road-a', 1.0, 5);
        const calm = calmWorld();
        for (const world of [stormy, calm]) {
            const merchant = world.merchants[0];
            merchant.riskTolerance = 0.9;
            // perceptionAccuracy 0 pins the preset beliefs: no legal
            // bandit observation may rewrite them mid-test.
            merchant.perceptionAccuracy = 0;
            merchant.routeBeliefs = {
                'road-a': { perceivedDanger: 0, confidence: 1 },
                'road-b': { perceivedDanger: 0.25, confidence: 1 },
            };
            tickClosedWorld(world, { tick: 1, perceivedDanger: 0.1 });
        }
        expect(calm.merchants[0].selectedRoute).toBe('road-a');
        // road-c (pristine, same length) is the storm refuge — the
        // merchant leaves the stormed road, which is the assertion.
        expect(stormy.merchants[0].selectedRoute).toBe('road-c');
    });

    test('weatherCost scales monotonically with severity', () => {
        const mild = stormWorld('road-a', 0.25, 5);
        const severe = stormWorld('road-a', 0.75, 5);
        tickClosedWorld(mild, { tick: 1, perceivedDanger: 0.1 });
        tickClosedWorld(severe, { tick: 1, perceivedDanger: 0.1 });
        const mildCost = mild.routes.find(r => r.id === 'road-a').weatherCost;
        const severeCost = severe.routes.find(r => r.id === 'road-a').weatherCost;
        expect(mildCost).toBeCloseTo(1.25, 10);
        expect(severeCost).toBeCloseTo(3.75, 10);
        expect(severeCost).toBeGreaterThan(mildCost);
    });

    test('storm state survives save/load with identical weather pricing', () => {
        const world = stormWorld('road-b', 0.6, 5);
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.1 });
        const loaded = loadWorld(saveWorld(world));
        expect(loaded.storm).toEqual(world.storm);
        tickClosedWorld(world, { tick: 2, perceivedDanger: 0.1 });
        tickClosedWorld(loaded, { tick: 2, perceivedDanger: 0.1 });
        expect(loaded.routes.find(r => r.id === 'road-b').weatherCost)
            .toBe(world.routes.find(r => r.id === 'road-b').weatherCost);
    });

    test('calm worlds carry zero weatherCost (legacy migration by construction)', () => {
        const world = calmWorld();
        for (let t = 1; t <= 3; t++) tickClosedWorld(world, { tick: t, perceivedDanger: 0.2 });
        for (const route of world.routes) expect(route.weatherCost).toBe(0);
    });
});
