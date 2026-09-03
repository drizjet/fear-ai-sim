import { createClosedWorldScenario, tickClosedWorld, saveWorld, loadWorld } from '../closed-world.js';

function scheduledWorld(schedule) {
    const world = createClosedWorldScenario();
    world.ticksPerSeason = 10000;
    if (schedule) world.stormSchedule = { ...schedule };
    return world;
}

const SCHEDULE = { everyTicks: 5, durationTicks: 3, severity: 0.5, roadIds: ['road-a', 'road-b'] };

describe('opt-in storm scheduler (slice AH)', () => {
    test('cadence starts storms with the scheduled shape', () => {
        const world = scheduledWorld(SCHEDULE);
        for (let t = 1; t <= 5; t++) tickClosedWorld(world, { tick: t, perceivedDanger: 0.1 });
        expect(world.storm).toMatchObject({ active: true, roadId: 'road-a', severity: 0.5, remainingTicks: 3 });
        const started = world.events.filter(e => e.type === 'STORM_STARTED');
        expect(started.length).toBe(1);
        expect(started[0]).toMatchObject({ roadId: 'road-a', severity: 0.5, duration: 3, scheduled: true });
        expect(world.storm.startEventId).toBe(started[0].eventId);
    });

    test('roads rotate and storms never stack', () => {
        const world = scheduledWorld(SCHEDULE);
        // duration 3 < cadence 5: storm ends before the next cadence tick.
        for (let t = 1; t <= 10; t++) tickClosedWorld(world, { tick: t, perceivedDanger: 0.1 });
        const started = world.events.filter(e => e.type === 'STORM_STARTED');
        expect(started.map(e => e.roadId)).toEqual(['road-a', 'road-b']);
        expect(world.stormSchedule.nextRoadIndex).toBe(2);

        // Long storm + short cadence: the cadence tick during an active
        // storm is skipped, never stacked.
        const overlap = scheduledWorld({ everyTicks: 2, durationTicks: 10, severity: 0.5, roadIds: ['road-a'] });
        for (let t = 1; t <= 6; t++) tickClosedWorld(overlap, { tick: t, perceivedDanger: 0.1 });
        expect(overlap.events.filter(e => e.type === 'STORM_STARTED').length).toBe(1);
        expect(overlap.storm).toMatchObject({ active: true, roadId: 'road-a' });
    });

    test('scheduled storms price weather and end on schedule', () => {
        const world = scheduledWorld(SCHEDULE);
        for (let t = 1; t <= 5; t++) tickClosedWorld(world, { tick: t, perceivedDanger: 0.1 });
        // The scheduler runs after the pricing pass, so the tick-5 storm
        // prices weather from tick 6.
        tickClosedWorld(world, { tick: 6, perceivedDanger: 0.1 });
        expect(world.routes.find(r => r.id === 'road-a').weatherCost).toBeCloseTo(2.5, 10);
        for (let t = 7; t <= 8; t++) tickClosedWorld(world, { tick: t, perceivedDanger: 0.1 });
        expect(world.storm.active).toBe(false);
        expect(world.events.some(e => e.type === 'STORM_ENDED')).toBe(true);
        tickClosedWorld(world, { tick: 9, perceivedDanger: 0.1 });
        expect(world.routes.find(r => r.id === 'road-a').weatherCost).toBe(0);
    });

    test('malformed schedules are honest no-ops', () => {
        for (const bad of [
            undefined,
            { everyTicks: 0, durationTicks: 3, severity: 0.5, roadIds: ['road-a'] },
            { everyTicks: 5, durationTicks: 3, severity: 0.5, roadIds: [] },
            { everyTicks: 5, durationTicks: 3, severity: 0.5, roadIds: ['road-nowhere'] },
        ]) {
            const world = scheduledWorld(bad);
            for (let t = 1; t <= 10; t++) tickClosedWorld(world, { tick: t, perceivedDanger: 0.1 });
            expect(world.storm ?? null).toBeNull();
            expect(world.events.some(e => e.type === 'STORM_STARTED')).toBe(false);
        }
    });

    test('unscheduled worlds never storm (baseline control)', () => {
        const world = scheduledWorld(undefined);
        for (let t = 1; t <= 20; t++) tickClosedWorld(world, { tick: t, perceivedDanger: 0.2 });
        expect(world.storm ?? null).toBeNull();
        expect(world.events.some(e => e.type === 'STORM_STARTED')).toBe(false);
    });

    test('schedule rotation survives save/load without double-scheduling', () => {
        const world = scheduledWorld(SCHEDULE);
        for (let t = 1; t <= 5; t++) tickClosedWorld(world, { tick: t, perceivedDanger: 0.1 });
        const loaded = loadWorld(saveWorld(world));
        expect(loaded.stormSchedule).toEqual(world.stormSchedule);
        for (let t = 6; t <= 10; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.1 });
            tickClosedWorld(loaded, { tick: t, perceivedDanger: 0.1 });
        }
        const roads = w => w.events.filter(e => e.type === 'STORM_STARTED').map(e => e.roadId);
        expect(roads(loaded)).toEqual(roads(world));
        expect(roads(world)).toEqual(['road-a', 'road-b']);
    });
});
