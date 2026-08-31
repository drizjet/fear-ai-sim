// tests/bandit-recency-decay.test.js
//
// MUT-RECENCY-001 — bandit trafficBelief recency decays when no
// observation arrives, so a stale observation does not continue
// to influence the bandit's destination utility at full weight.
//
// The audit's expectation: a bandit that observed a route at tick
// t=0 must weight that observation less at tick t=20 than at
// tick t=0. Without decay the bandit's payoff multiplier stays
// at 1.0 indefinitely and the "cat-and-mouse" becomes
// memory-only after the first observation, which is unrealistic.

import { describe, expect, it } from '@jest/globals';
import { tickBandit } from '../canonical-trade-system.js';

function makeBanditWorld({ banditAccuracy = 1.0 } = {}) {
    // Rng that *always fails* observations so we can isolate the
    // decay path from the reset path. perceptionAccuracy=1 with
    // rng()>=1 ⇒ always true ⇒ continue ⇒ no reset.
    const failingRng = () => 1.0;
    return {
        bandits: [{
            id: 'bandits-1',
            roadId: 'road-a',
            perceptionAccuracy: banditAccuracy,
            // The decay slice uses a multiplicative coefficient
            // (default 0.95 per tick). The bandit must declare
            // its initial trafficBelief with recency=1.0 so the
            // test can observe decay from a known starting point.
            trafficBelief: {
                'road-a': { estimatedTraffic: 1, recency: 1.0 },
                'road-b': { estimatedTraffic: 0, recency: 0.0 },
                'road-c': { estimatedTraffic: 0, recency: 0.0 },
            },
            relocationThreshold: 0.2,
            cargoValuePerMerchant: 10,
        }],
        merchants: [],          // no merchants → rng is never consulted for the observation loop
        routes: [
            { id: 'road-a', from: 'north', to: 'south', distance: 5, actualDanger: 0.5 },
            { id: 'road-b', from: 'north', to: 'south', distance: 7, actualDanger: 0.1 },
            { id: 'road-c', from: 'south', to: 'north', distance: 5, actualDanger: 0.4 },
        ],
        events: [],
        season: 'SUMMER',
    };
}

describe('MUT-RECENCY-001 bandit trafficBelief recency decays when no observation arrives', () => {
    it('recency on a route strictly decreases over many ticks of silence', () => {
        const world = makeBanditWorld();
        // Place a merchant on road-a so a successful observation
        // at tick 0 resets recency to exactly 1.0 after the
        // initial decay step.
        world.merchants.push({ id: 'merchants-1', selectedRoute: 'road-a' });
        const freshRng = () => 0.0; // banditAccuracy=1, rng()=0 → observation succeeds
        tickBandit(world, 'bandits-1', { tick: 0, rng: freshRng });
        expect(world.bandits[0].trafficBelief['road-a'].recency).toBe(1.0);

        // Remove the merchant so subsequent ticks never reset recency.
        world.merchants.length = 0;
        const silentRng = () => 1.0; // always fail
        const initial = world.bandits[0].trafficBelief['road-a'].recency;
        for (let t = 1; t <= 30; t += 1) {
            tickBandit(world, 'bandits-1', { tick: t, rng: silentRng });
        }
        const afterSilence = world.bandits[0].trafficBelief['road-a'].recency;
        // The decay slice MUST reduce recency monotonically.
        // Without decay, afterSilence === initial === 1.0.
        expect(afterSilence).toBeLessThan(initial);
        expect(afterSilence).toBeGreaterThanOrEqual(0);
        // 30 ticks of multiplicative decay (default 0.95 per tick)
        // is bounded: (0.95)^30 ≈ 0.215.
        expect(afterSilence).toBeLessThan(0.5);
    });

    it('recency on every observed route decays, not only the bandit\'s current road', () => {
        const world = makeBanditWorld();
        // Seed both road-a and road-b with recency=1.0 via the
        // legacy observer loop. Use two seeded trafficBelief rows.
        world.bandits[0].trafficBelief['road-a'].recency = 1.0;
        world.bandits[0].trafficBelief['road-b'].recency = 1.0;
        world.bandits[0].trafficBelief['road-c'].recency = 1.0;

        const silentRng = () => 1.0;
        for (let t = 1; t <= 10; t += 1) {
            tickBandit(world, 'bandits-1', { tick: t, rng: silentRng });
        }
        const beliefs = world.bandits[0].trafficBelief;
        expect(beliefs['road-a'].recency).toBeLessThan(1.0);
        expect(beliefs['road-b'].recency).toBeLessThan(1.0);
        expect(beliefs['road-c'].recency).toBeLessThan(1.0);
    });

    it('a fresh observation resets the affected route\'s recency to 1.0 even after decay', () => {
        const world = makeBanditWorld();
        world.bandits[0].trafficBelief['road-a'].recency = 1.0;

        // Decay for 10 ticks.
        const silentRng = () => 1.0;
        for (let t = 1; t <= 10; t += 1) {
            tickBandit(world, 'bandits-1', { tick: t, rng: silentRng });
        }
        const staleRecency = world.bandits[0].trafficBelief['road-a'].recency;
        expect(staleRecency).toBeLessThan(1.0);

        // Now place a merchant on road-a so a successful observation
        // resets recency.
        world.merchants.push({ id: 'merchants-1', selectedRoute: 'road-a' });
        const freshRng = () => 0.0; // banditAccuracy=1, rng()=0 → observation succeeds
        tickBandit(world, 'bandits-1', { tick: 11, rng: freshRng });

        expect(world.bandits[0].trafficBelief['road-a'].recency).toBe(1.0);
    });
});