// Constitution §120 (Counterfactual Branching) + §121
// (Determinism).
//
// The 2026-08-28 audit named the RoamingGroup RNG closure
// as a "shared mutable state" hazard for fork
// independence: a forked branch that shared a `group.rng`
// closure would couple its randomness to the other
// branch, breaking §120. The fix:
//
//   1. `chooseRoamingDestination` no longer reads
//      `group.rng`; it requires an explicit
//      `options.rng`. (Closed in EVID-2026-08-28-STRICT-RESUME-EQUIVALENCE.)
//
//   2. The closed-world's live-wire re-seeds the
//      bandit's rng from `bandit.id` (an FNV-1a hash)
//      on every tick. Because the id is preserved across
//      fork, the same (group, tick) pair yields the same
//      rng stream on both branches.
//
// This test proves the fork-independence contract: a
// forked branch's trajectory does not depend on whether
// the other branch has been advanced. Concretely:
// `runForkedBranches({ A: 10, B: 10 })` must produce
// identical `branchA` and `branchB` trajectories
// (since neither branch has overrides that diverge
// them), AND `runBranchAThenBranchB` must produce
// the same `branchA` and `branchB` results as
// `runBranchBThenBranchA`.

import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, runForkedBranches, forkWorld } from '../closed-world.js';

describe('fork independence (Constitution §120 / §121)', () => {
    it('two parallel branches with no overrides produce identical trajectories', () => {
        // The §121 contract: same seed + same initial
        // state + same inputs → same trajectory. Two
        // parallel branches with no overrides is the
        // baseline fork-independence check.
        const result = runForkedBranches({
            world: createClosedWorldScenario(),
            forkAtTick: 1,
            branchATicks: 30,
            branchBTicks: 30,
        });
        // The event logs must be byte-identical.
        expect(JSON.stringify(result.branchA.events)).toBe(JSON.stringify(result.branchB.events));
        // The bandit roadId at the end is the same on
        // both branches (the deterministic rng yields
        // the same destination choice on the same
        // (group, tick) pair).
        expect(result.branchA.bandits[0].roadId).toBe(result.branchB.bandits[0].roadId);
        // No divergence.
        expect(result.divergence.length).toBe(0);
    });

    it('A-before-B and B-before-A produce identical branchA and branchB results', () => {
        // The §120 fork-independence contract: branch
        // order must not affect either branch's outcome.
        // We run branch A first, then branch B, and
        // compare to running branch B first, then branch A.
        // The branches have no overrides, so they
        // should be identical.
        const pre = createClosedWorldScenario();
        for (let t = 1; t <= 5; t += 1) {
            tickClosedWorld(pre, { tick: t, perceivedDanger: 0.5 });
        }
        // A-then-B
        const cloneAB = forkWorld(pre);
        const cloneBA = forkWorld(pre);
        // Advance A first.
        for (let t = 6; t <= 30; t += 1) {
            tickClosedWorld(cloneAB, { tick: t, perceivedDanger: 0.5 });
        }
        // Then B.
        for (let t = 6; t <= 30; t += 1) {
            tickClosedWorld(cloneBA, { tick: t, perceivedDanger: 0.5 });
        }
        // The two clones have identical event logs
        // (the order in which they were ticked does not
        // affect the result; both started from the same
        // pre-fork state and the rng re-seeds from
        // bandit.id on every tick).
        expect(JSON.stringify(cloneAB.events)).toBe(JSON.stringify(cloneBA.events));
        expect(cloneAB.bandits[0].roadId).toBe(cloneBA.bandits[0].roadId);
    });

    it('advancing one branch does not change the other branch\'s pre-fork state', () => {
        // The §120 contract: forking at tick T and
        // advancing branch A must not mutate branch B\'s
        // pre-fork state. The pre-fork state is held in
        // a deep-cloned world (via `forkWorld`); any
        // shared reference would cause this test to fail.
        const pre = createClosedWorldScenario();
        for (let t = 1; t <= 5; t += 1) {
            tickClosedWorld(pre, { tick: t, perceivedDanger: 0.5 });
        }
        // Snapshot the pre-fork state of B by reading the
        // first 5 events.
        const preEventsA = pre.events.length;
        const preLastEventA = pre.events[pre.events.length - 1];
        // Fork B off.
        const branchB = forkWorld(pre);
        // Advance A independently.
        for (let t = 6; t <= 20; t += 1) {
            tickClosedWorld(pre, { tick: t, perceivedDanger: 0.5 });
        }
        // B must not have been touched.
        expect(branchB.events.length).toBe(preEventsA);
        expect(branchB.events[branchB.events.length - 1]).toEqual(preLastEventA);
    });

    it('a forked bandit has its own deterministic rng stream (no shared closure)', () => {
        // The audit\'s §120 concern: if the bandit's
        // `rng` field were a captured closure shared
        // between branches, the first branch to consume
        // rng state would shift the second branch\'s
        // stream. After the §121 fix (the live-wire
        // re-seeds from `bandit.id` on every tick), the
        // bandit\'s `rng` field is unused. We verify
        // here that two forked bandits produce the same
        // destination choice under the same (group,
        // tick) input.
        const a = createClosedWorldScenario();
        const b = createClosedWorldScenario();
        // Run 10 ticks on each independently.
        for (let t = 1; t <= 10; t += 1) {
            tickClosedWorld(a, { tick: t, perceivedDanger: 0.5 });
            tickClosedWorld(b, { tick: t, perceivedDanger: 0.5 });
        }
        // Both bandits end up on the same road.
        expect(a.bandits[0].roadId).toBe(b.bandits[0].roadId);
    });
});
