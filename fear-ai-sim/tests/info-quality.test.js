import { describe, it, expect } from '@jest/globals';
import { BeliefStore, Evidence } from '../beliefs.js';
import { createClosedWorldScenario, canObserve } from '../closed-world.js';
import { createCanonicalMerchant, tickMerchant } from '../canonical-trade-system.js';

// R3 — info quality: aliasing, canObserve, noisy observation

describe('R3 — BeliefStore aliasing (no shared ref)', () => {
    it('mutating returned belief does not affect store', () => {
        const store = new BeliefStore();
        store.observe({ subject: 'road-a', claim: 'danger', value: 0.5, sourceId: 'test', confidence: 0.9, tick: 1 });
        const b1 = store.get('road-a', 'danger');
        b1.value = 0.9;
        b1.confidence = 0.1;
        const b2 = store.get('road-a', 'danger');
        expect(b2.value).toBeCloseTo(0.5);
        expect(b2.confidence).not.toBe(0.1);
    });

    it('mutating returned observe does not affect store', () => {
        const store = new BeliefStore();
        const ret = store.observe({ subject: 'road-a', claim: 'danger', value: 0.6, sourceId: 'test', confidence: 0.8, tick: 1 });
        ret.value = 0.99;
        const b = store.get('road-a', 'danger');
        expect(b.value).not.toBe(0.99);
        expect(b.value).toBeCloseTo(0.6);
    });

    it('mutating evidence after observe does not affect store', () => {
        const store = new BeliefStore();
        const ev = { subject: 'road-a', claim: 'danger', value: 0.5, sourceId: 'test', confidence: 0.9, tick: 1 };
        store.observe(ev);
        ev.value = 0.9;
        const b = store.get('road-a', 'danger');
        expect(b.value).toBeCloseTo(0.5);
    });
});

describe('R3 — canObserve panopticon removed', () => {
    it('merchant at town without selectedRoute does not see road incident to town', () => {
        const world = createClosedWorldScenario();
        const merchant = { id: 'm1', location: 'north', selectedRoute: null };
        const event = { type: 'BANDIT_ATTACK', roadId: 'road-a', tick: 1 };
        // road-a is north<->south, adjacent to north, but merchant has no selectedRoute
        expect(canObserve(merchant, event, world)).toBe(false);
    });

    it('merchant with selectedRoute sees only that road', () => {
        const world = createClosedWorldScenario();
        const merchant = { id: 'm1', location: 'north', selectedRoute: 'road-a' };
        const eventA = { type: 'BANDIT_ATTACK', roadId: 'road-a', tick: 1 };
        const eventB = { type: 'BANDIT_ATTACK', roadId: 'road-b', tick: 1 };
        expect(canObserve(merchant, eventA, world)).toBe(true);
        expect(canObserve(merchant, eventB, world)).toBe(false);
    });
});

describe('R3 — noisy observation (not exact 0.7)', () => {
    it('merchant observation adds noise 0.6-0.8 not exact 0.7', () => {
        const world = createClosedWorldScenario();
        world.ticksPerSeason = 10000;
        const merchant = world.merchants[0];
        merchant.routeBeliefs = {
            'road-a': { perceivedDanger: 0.1, confidence: 0.5 },
            'road-b': { perceivedDanger: 0.1, confidence: 0.5 },
            'road-c': { perceivedDanger: 0.1, confidence: 0.5 },
        };
        merchant.perceptionAccuracy = 1;
        world.bandits[0].roadId = 'road-a';
        // Use deterministic rng that we can predict: need to test that observedDanger varies
        const draws = [];
        for (let i = 0; i < 5; i++) {
            const m = createCanonicalMerchant({
                id: `m-${i}`, location: 'north', cargo: 10, riskTolerance: 0.5,
                routeBeliefs: { 'road-a': { perceivedDanger: 0.1, confidence: 0.5 } },
            });
            m.perceptionAccuracy = 1;
            const w = createClosedWorldScenario();
            w.merchants = [m];
            w.bandits = [{ id: 'b1', roadId: 'road-a' }];
            w.routes = [{ id: 'road-a', from: 'north', to: 'south', distance: 5 }];
            const result = tickMerchant(w, m.id, { tick: 1, rng: () => 0.1 + i * 0.15 });
            const ev = result.event;
            draws.push(ev.why.observations[0]?.observedDanger);
        }
        // Not all draws should be exactly 0.7, should vary due to noise
        const unique = new Set(draws.filter(Boolean).map(v => v.toFixed(2)));
        expect(unique.size).toBeGreaterThan(1);
        for (const v of draws.filter(Boolean)) {
            expect(v).toBeGreaterThanOrEqual(0.6);
            expect(v).toBeLessThanOrEqual(0.8);
        }
    });
});
