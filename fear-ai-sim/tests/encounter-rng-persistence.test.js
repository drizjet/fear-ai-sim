import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, saveWorld, loadWorld, appendWorldEvent } from '../closed-world.js';

// Slice E — encounter RNG persistence (W1-CONTINUITY-RNG)
// Proves save/load preserves encounter randomness via world.rngStreams.encounter,
// not a closure that is dropped on save. A real restart (fresh loadWorld) must
// resume the identical trajectory as an uninterrupted run when no custom
// encounterRng is supplied — the persistent stream carries the state.

describe('encounter RNG persistence (MUT-SAVE-001 / W1-CONTINUITY-RNG)', () => {
    it('save/load with persistent encounter stream resumes identical trajectory', () => {
        const worldA = createClosedWorldScenario();
        const worldB = createClosedWorldScenario();
        // Seed both with same initial RNG state (createClosedWorldScenario does this)
        // Run 5 ticks on A, then checkpoint
        for (let t = 1; t <= 5; t++) tickClosedWorld(worldA, { tick: t, perceivedDanger: 0.5 });
        const checkpoint = saveWorld(worldA);
        const resumed = loadWorld(checkpoint);

        // Verify the encounter stream survived serialization
        expect(resumed.rngStreams.encounter).toBeDefined();
        expect(resumed.rngStreams.encounter.state).toBe(worldA.rngStreams.encounter.state);
        expect(resumed.rngStreams.encounter.draws).toBe(worldA.rngStreams.encounter.draws);

        // Continue both branches 10 more ticks WITHOUT supplying encounterRng
        // (persistent stream is the source of truth)
        for (let t = 6; t <= 15; t++) {
            tickClosedWorld(worldA, { tick: t, perceivedDanger: 0.5 });
            tickClosedWorld(resumed, { tick: t, perceivedDanger: 0.5 });
        }

        // Strict byte-identity: same events, same IDs, same RNG position
        expect(saveWorld(resumed)).toBe(saveWorld(worldA));
        expect(resumed.rngStreams.encounter.state).toBe(worldA.rngStreams.encounter.state);
        expect(resumed.rngStreams.encounter.draws).toBe(worldA.rngStreams.encounter.draws);
    });

    it('custom encounterRng still overrides but does not break persistence', () => {
        const world = createClosedWorldScenario();
        const customRng = (() => {
            let s = 12345;
            return () => {
                s = (s * 1664525 + 1013904223) >>> 0;
                return s / 0x100000000;
            };
        })();
        // Tick with custom RNG — should not corrupt persistent stream for later ticks
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.5, encounterRng: customRng });
        const streamAfterCustom = world.rngStreams.encounter.draws;
        // Next tick without custom RNG uses persistent stream and advances it
        tickClosedWorld(world, { tick: 2, perceivedDanger: 0.5 });
        expect(world.rngStreams.encounter.draws).toBeGreaterThan(streamAfterCustom);
    });

    it('drought + encounter stream both survive save/load', () => {
        const world = createClosedWorldScenario();
        world.drought = { active: true, severity: 0.5, kind: 'food', townId: 'north', remainingTicks: 10, startedTick: 1 };
        appendWorldEvent(world, { type: 'DROUGHT_STARTED', townId: 'north', kind: 'food', severity: 0.5, duration: 10, tick: 1 });
        world.drought.startEventId = world.events.find(e => e.type === 'DROUGHT_STARTED')?.eventId;
        for (let t = 1; t <= 3; t++) tickClosedWorld(world, { tick: t, perceivedDanger: 0.3 });
        const checkpoint = saveWorld(world);
        const resumed = loadWorld(checkpoint);
        expect(resumed.drought.active).toBe(true);
        expect(resumed.rngStreams.encounter).toBeDefined();
        for (let t = 4; t <= 8; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.3 });
            tickClosedWorld(resumed, { tick: t, perceivedDanger: 0.3 });
        }
        expect(saveWorld(resumed)).toBe(saveWorld(world));
    });
});
