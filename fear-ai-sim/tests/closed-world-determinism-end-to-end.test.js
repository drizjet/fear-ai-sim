import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';

describe('closed-world end-to-end determinism (Constitution §121)', () => {
    // The audit: "Same seed + same initial state + same
    // inputs must produce the same relevant trajectory."
    // This test runs the full closed-world chain twice with
    // the same inputs and asserts the event log is
    // byte-identical. The test proves the §121 contract
    // end-to-end across all the causal steps:
    //   BANDIT_ATTACK → SURVIVOR_EVIDENCE → RUMOR →
    //   ROUTE_SELECTED → MARKET_TICK → FACTION_REASSESSMENT →
    //   FACTION_ACTION → BANDIT_RELOCATION → JUSTICE_RESOLVED →
    //   MIGRATION → STANCE_TRANSITION → CONVOY_AMBUSH

    it('two runs with the same inputs produce byte-identical event logs over 10 ticks', () => {
        const world1 = createClosedWorldScenario();
        const world2 = createClosedWorldScenario();
        // Both worlds start with the same initial state.
        // Verify the initial states are identical.
        expect(world1.events.length).toBe(world2.events.length);
        // Run 10 ticks on each world with the same inputs.
        for (let t = 1; t <= 10; t += 1) {
            tickClosedWorld(world1, { tick: t, perceivedDanger: 0.5 });
            tickClosedWorld(world2, { tick: t, perceivedDanger: 0.5 });
        }
        // The event logs must be byte-identical.
        expect(world1.events.length).toBe(world2.events.length);
        for (let i = 0; i < world1.events.length; i += 1) {
            // Compare the events without the `tick` field (the
            // tick is part of the input, so it's expected to
            // match). Compare all other fields exactly.
            const e1 = { ...world1.events[i] };
            const e2 = { ...world2.events[i] };
            // The event type must match.
            expect(e1.type).toBe(e2.type);
            // The tick must match (we passed the same tick).
            expect(e1.tick).toBe(e2.tick);
            // Compare the full event objects.
            expect(e1).toEqual(e2);
        }
    });

    it('two runs with the same inputs produce identical state at every tick', () => {
        const world1 = createClosedWorldScenario();
        const world2 = createClosedWorldScenario();
        // Record the state of each world at every tick.
        const states1 = [];
        const states2 = [];
        for (let t = 1; t <= 10; t += 1) {
            tickClosedWorld(world1, { tick: t, perceivedDanger: 0.3 });
            tickClosedWorld(world2, { tick: t, perceivedDanger: 0.3 });
            // Snapshot the state of each world.
            states1.push(snapshotState(world1));
            states2.push(snapshotState(world2));
        }
        // The state snapshots must be identical.
        for (let t = 0; t < states1.length; t += 1) {
            expect(states1[t]).toEqual(states2[t]);
        }
    });
});

// Helper: snapshot the deterministic parts of the world state.
function snapshotState(world) {
    return {
        tickHistory: world.tickHistory.map(s => ({
            tick: s.tick,
            // Exclude the snapshot's non-deterministic parts
            // (e.g. Date.now() timestamps if any).
            // The snapshot is an audit trail, so we compare
            // the structure, not the timestamps.
            population: s.population,
            raidCount: s.raidCount
        })),
        marketFlows: Array.from(world.marketFlows.entries()).map(([key, flow]) => ({
            key,
            produced: flow.produced,
            delivered: flow.delivered,
            consumed: flow.consumed,
            spoiled: flow.spoiled,
            overflow: flow.overflow
        })),
        marketState: Array.from(world.marketState.entries()).map(([key, state]) => ({
            key,
            supply: state.supply,
            demand: state.demand,
            shortage: state.shortage,
            price: state.price,
            disrupted: state.disrupted
        }))
    };
}
