import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, resolveBanditAttack } from '../closed-world.js';

describe('migration event emitted when justice pressure is high (Constitution §164 / §213)', () => {
    // The audit's row 29: "Add persistent population/faction
    // state and crime/reporting/migration execution loop."
    // The JusticeSystem computes a migrationPressure value
    // but the closed-world reducer does not yet emit a
    // MIGRATION event. This test proves the gap and then
    // the fix wires the migration event into the reducer.

    it('after sustained attacks and chronic shortage, the reducer emits a MIGRATION event', () => {
        // Set up a scenario where the migration pressure is
        // expected to be high: sustained bandit attacks
        // (raise grievance) and chronic supply shortage
        // (lower legitimacy). After 20 ticks, the
        // migrationPressure should exceed 0.5 and a
        // MIGRATION event should fire.
        const world = createClosedWorldScenario();
        // Seed many attacks to drive grievance high.
        for (let t = 1; t <= 10; t++) {
            world.events.push({ type: 'BANDIT_ATTACK', banditId: 'bandits-1', tick: t, roadId: 'road-a' });
        }
        for (let t = 1; t <= 20; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.8 });
        }
        const migrationEvents = world.events.filter(ev => ev.type === 'MIGRATION');
        // At least one MIGRATION event should fire under
        // sustained pressure.
        expect(migrationEvents.length).toBeGreaterThan(0);
    });

    it('under low pressure, fewer MIGRATION events fire than under high pressure (peaceful default)', () => {
        // The complement: under low pressure (no attacks,
        // low perceivedDanger), STRICTLY fewer migrations
        // should occur than under sustained attacks. Per
        // Guardian §8: "Migration must not be a periodic
        // event that fires because a threshold happens to
        // be crossed." The EVID-2026-08-29-REPORTED-CRIME-DECAY
        // fix makes `reportedCrime` true only within a
        // 5-tick window of the most recent BANDIT_ATTACK,
        // so the JusticeSystem's grievance decays in a
        // peaceful world and migration pressure drops
        // below the 0.5 threshold. The low-pressure world
        // (no attacks ever) produces 0 MIGRATION events
        // from the justice system. The high-pressure
        // world (10 attacks pre-loaded) produces several.
        const worldLow = createClosedWorldScenario();
        for (let t = 1; t <= 20; t++) {
            tickClosedWorld(worldLow, { tick: t, perceivedDanger: 0.0 });
        }
        const worldHigh = createClosedWorldScenario();
        for (let t = 1; t <= 10; t++) {
            worldHigh.events.push({ type: 'BANDIT_ATTACK', banditId: 'bandits-1', tick: t, roadId: 'road-a' });
        }
        for (let t = 1; t <= 20; t++) {
            tickClosedWorld(worldHigh, { tick: t, perceivedDanger: 0.8 });
        }
        const lowCount = worldLow.events.filter(ev => ev.type === 'MIGRATION').length;
        const highCount = worldHigh.events.filter(ev => ev.type === 'MIGRATION').length;
        // EVID-2026-08-29-REPORTED-CRIME-DECAY: the low-
        // pressure world has no BANDIT_ATTACK events, so
        // reportedCrime is always false, grievance decays,
        // and migration pressure drops below 0.5. The
        // high-pressure world has 10 attacks pre-loaded
        // (on ticks 1-10), each within the 5-tick window
        // of subsequent ticks, so reportedCrime is true
        // for the first ~15 ticks and MIGRATION fires
        // multiple times.
        expect(highCount).toBeGreaterThan(lowCount);
    });
});
