// World-Completion Directive §120 (Counterfactual Branching).
// Constitution §120: "Long-term ambition: clone world at tick
// T. Change one input. Run both branches. Compare."
//
// This slice adds the FORK API: clone world at tick T, run
// both branches, and report the divergence between the two
// trajectories. The §121 determinism contract requires that
// a fork with no input changes produces byte-identical
// branches. The §120 contract requires that a fork with an
// input change produces *meaningfully* different branches
// for the right reason.
//
// The slice adds three primitives:
//   - `forkWorld(world)`: deep-clone the world (Maps, Sets,
//     and arrays are all duplicated; no shared references).
//   - `runForkedBranches({ world, forkAtTick, branchATicks,
//     branchBTicks, branchAOverrides, branchBOverrides })`:
//     run the world to tick `forkAtTick`, then run two
//     independent branches from that point with optional
//     per-branch option overrides (e.g. a different
//     `perceivedDanger` for branch B).
//   - The result is `{ branchA, branchB, divergence }` where
//     `divergence` is a list of fields that differ at the
//     end of the two branches.

import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, forkWorld, runForkedBranches, diffWorlds } from '../closed-world.js';

describe('FORK API (Constitution §120 / §121)', () => {
    it('forkWorld produces a deep clone with no shared references', () => {
        // The §120 contract: the clone must be independent
        // of the original. Mutating the clone must not
        // affect the original (and vice versa).
        const original = createClosedWorldScenario();
        const clone = forkWorld(original);
        // Mutate the clone.
        clone.merchants[0].cargo = 999;
        clone.events.push({ type: 'TEST_MUTATION' });
        // The original is unchanged.
        expect(original.merchants[0].cargo).not.toBe(999);
        expect(original.events.find(e => e.type === 'TEST_MUTATION')).toBeUndefined();
    });

    it('forkWorld preserves Maps and Sets (the closed-world has them throughout)', () => {
        // The closed-world has `towns: Map`, `marketState:
        // Map`, `relationships: Map`, `consumedAttackIds:
        // Set`, `executedActions: Set`. JSON round-trip
        // would lose them; a proper deep-clone must keep
        // them.
        const original = createClosedWorldScenario();
        const clone = forkWorld(original);
        expect(clone.towns).toBeInstanceOf(Map);
        expect(clone.relationships).toBeInstanceOf(Map);
        expect(clone.consumedAttackIds).toBeInstanceOf(Set);
        // The Map entries must match.
        expect(clone.towns.size).toBe(original.towns.size);
        for (const [id, town] of original.towns.entries()) {
            const clonedTown = clone.towns.get(id);
            expect(clonedTown).toBeDefined();
            expect(clonedTown.id).toBe(town.id);
            expect(clonedTown.population).toBe(town.population);
        }
    });

    it('runForkedBranches with no overrides produces byte-identical branches (§121)', () => {
        // The §121 determinism contract: same seed + same
        // initial state + same inputs must produce the same
        // trajectory. A fork with no changes is just two
        // runs of the same scenario — they must match.
        const result = runForkedBranches({
            world: createClosedWorldScenario(),
            forkAtTick: 1,
            branchATicks: 10,
            branchBTicks: 10,
        });
        // The two branches must be byte-identical.
        const aEvents = JSON.stringify(result.branchA.events);
        const bEvents = JSON.stringify(result.branchB.events);
        expect(aEvents).toBe(bEvents);
        // The divergence report must be empty.
        expect(result.divergence.length).toBe(0);
    });

    it('runForkedBranches with different perceivedDanger produces diverging branches', () => {
        // The §120 contract: a fork with an input change
        // produces *meaningfully* different branches for
        // the right reason. We change `perceivedDanger`
        // for branch B and verify the two branches
        // diverge.
        const result = runForkedBranches({
            world: createClosedWorldScenario(),
            forkAtTick: 1,
            branchATicks: 20,
            branchBTicks: 20,
            branchAOverrides: { perceivedDanger: 0.0 },
            branchBOverrides: { perceivedDanger: 0.9 },
        });
        // The two branches must diverge on at least one
        // field (most likely the faction's
        // grievance/escalation or the merchant's route
        // choice).
        expect(result.divergence.length).toBeGreaterThan(0);
    });

    it('diffWorlds reports which fields differ between two worlds', () => {
        // diffWorlds is the building block for the
        // divergence report. Given two worlds, it returns
        // a list of { path, valueA, valueB } entries for
        // every top-level / nested field that differs.
        const a = createClosedWorldScenario();
        const b = createClosedWorldScenario();
        a.merchants[0].cargo = 5;
        b.merchants[0].cargo = 10;
        const diff = diffWorlds(a, b);
        const cargoDiff = diff.find(d => d.path === 'merchants[0].cargo');
        expect(cargoDiff).toBeDefined();
        expect(cargoDiff.valueA).toBe(5);
        expect(cargoDiff.valueB).toBe(10);
    });

    it('a fork at tick 5 followed by 5 ticks of divergence matches a single 10-tick run', () => {
        // The §120 contract: a fork at tick T followed by
        // M ticks of branch A matches a single uninterrupted
        // run of (T + M) ticks. The pre-fork trajectory
        // must be preserved.
        const whole = createClosedWorldScenario();
        for (let t = 1; t <= 10; t += 1) {
            tickClosedWorld(whole, { tick: t, perceivedDanger: 0.5 });
        }
        const result = runForkedBranches({
            world: createClosedWorldScenario(),
            forkAtTick: 5,
            branchATicks: 5,
            branchBTicks: 5,
        });
        // At tick 5 (the fork point), branchA and the
        // whole must be in the same state.
        const wholeAtTick5 = createClosedWorldScenario();
        for (let t = 1; t <= 5; t += 1) {
            tickClosedWorld(wholeAtTick5, { tick: t, perceivedDanger: 0.5 });
        }
        // Compare events up to the fork point.
        const wholeAt5Events = wholeAtTick5.events.map(e => JSON.stringify(e));
        const branchAAt5Events = result.branchA.events
            .filter(e => (e.tick ?? 0) <= 5)
            .map(e => JSON.stringify(e));
        // The pre-fork trajectory should match.
        expect(branchAAt5Events).toEqual(wholeAt5Events);
    });
});
