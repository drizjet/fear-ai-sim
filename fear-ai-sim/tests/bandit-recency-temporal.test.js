import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, saveWorld, loadWorld } from '../closed-world.js';
import { tickBandit } from '../canonical-trade-system.js';

// V8 corrective checkpoint §8 (2026-08-31): bandit
// recency decay temporal semantics.
//
// The MUT-RECENCY-001 implementation decays recency
// once per tickBandit invocation. This assumes the
// scheduler calls tickBandit exactly once per world
// tick. If the simulation skips ticks (e.g., resume
// after a long pause, batch replay, or save/load across
// a gap), the decay must still reflect the elapsed
// time, not the count of invocations.
//
// Test contract: an observation at tick T with
// recency 1.0, followed by a save+load and the world
// resuming from tick T+5 with no tickBandit call in
// between, must see the belief's recency at the next
// tickBandit call (tick T+6) equal to the
// decay-coefficient^5, not 1.0 (which would mean "no
// decay happened during the skip").

const RECENCY_DECAY = 0.95; // matches canonical-trade-system.js default

function freshRng() {
    return () => 0.0; // always succeed observation
}

function silentRng() {
    return () => 1.0; // always fail observation
}

describe('bandit recency temporal semantics (V8 corrective checkpoint §8): save/load across elapsed ticks', () => {
    it('recency decays by the elapsed tick count, not by the tickBandit invocation count, across a save/load resume', () => {
        const world = createClosedWorldScenario();
        world.bandits[0].perceptionAccuracy = 1.0;
        world.bandits[0].recencyDecayPerTick = RECENCY_DECAY;
        // The bandit observes the merchant only when
        // the merchant has a selected route. Set one
        // so the observation loop fires.
        world.merchants[0].selectedRoute = 'road-a';
        // Fresh observation at tick 1: reset recency to 1.0.
        tickBandit(world, 'bandits-1', { tick: 1, rng: freshRng() });
        const beliefAfterTick1 = world.bandits[0].trafficBelief['road-a'];
        expect(beliefAfterTick1.recency).toBeCloseTo(1.0, 6);
        // Save at tick 1 and load it.
        const saved = saveWorld(world);
        const resumed = loadWorld(saved);
        resumed.merchants[0].selectedRoute = 'road-a';
        // The world did NOT call tickBandit between
        // tick 1 and tick 6. The bandit on the resumed
        // world must still see the recency decay by
        // the elapsed tick count. The first tickBandit
        // after the resume is tick 6, with no observation
        // (silentRng fails every observation).
        tickBandit(resumed, 'bandits-1', { tick: 6, rng: silentRng() });
        const beliefAfterResume = resumed.bandits[0].trafficBelief['road-a'];
        // Expected: 1.0 * 0.95^(6-1) = 0.95^5 ≈ 0.7738
        // (the decay must account for 5 elapsed ticks,
        // not just 1 invocation).
        const expectedDecay = Math.pow(RECENCY_DECAY, 5);
        // The actual implementation we want is
        // "elapsed-tick-based decay". If the
        // implementation is per-invocation only, the
        // recency would be 0.95 (one invocation) — much
        // larger than 0.7738.
        expect(beliefAfterResume.recency).toBeLessThanOrEqual(expectedDecay + 1e-6);
    });
});