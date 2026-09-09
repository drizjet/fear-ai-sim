/**
 * @file long-horizon-character-life.test.js
 *
 * Sections XIII-XIV: drift, stability, and collapse over long lives.
 */

import { LongHorizonCharacterLife } from '../packages/core/index.js';

const VETERAN = { neuroticism: 0.45, resilience: 0.65, agreeableness: 0.55, openness: 0.5, extraversion: 0.5, leadership: 0.6, riskTolerance: 0.5, conscientiousness: 0.6 };

describe('Sections XIII-XIV: Long-Horizon Character Life', () => {
    test('1. 100-tick life stays stable and deterministic', () => {
        const life = new LongHorizonCharacterLife();
        const a = life.runLife(VETERAN, 100, 42);
        const b = life.runLife(VETERAN, 100, 42);
        expect(a).toEqual(b);
        expect(a.verdict).toBe('STABLE');
        expect(a.driftSeries.length).toBeGreaterThanOrEqual(4);
        // Drift bounded; signature barely moves: experience modulates, never replaces.
        expect(a.finalDrift).toBeLessThan(1);
        expect(a.finalStabilityGap).toBeLessThan(0.1);
    });

    test('2. 1000-tick life modulates without replacing identity', () => {
        const life = new LongHorizonCharacterLife();
        const rep = life.runLife(VETERAN, 1000, 7);
        expect(rep.verdict).toBe('STABLE');
        expect(rep.finalStabilityGap).toBeLessThan(0.45);
        expect(rep.nearestAttractor.name).not.toBe(null);
    });

    test('3. Different seeds diverge but both stay bounded', () => {
        const life = new LongHorizonCharacterLife();
        const a = life.runLife(VETERAN, 1000, 1);
        const b = life.runLife(VETERAN, 1000, 2);
        expect(a.stabilitySeries).not.toEqual(b.stabilitySeries);
        expect(a.verdict).toBe('STABLE');
        expect(b.verdict).toBe('STABLE');
    });

    test('4. Unsupported horizons and bad inputs fail loudly', () => {
        const life = new LongHorizonCharacterLife();
        expect(() => life.runLife(VETERAN, 500)).toThrow(/UNSUPPORTED_HORIZON/);
        expect(life.auditImmutability().isClean).toBe(true);
        expect(life.auditImmutability().hostPhysicsMutations).toBe(0);
    });

    test('5. 10000-tick soak converges to steady state without collapse', () => {
        const life = new LongHorizonCharacterLife();
        const rep = life.runLife(VETERAN, 10000, 3);
        expect(rep.verdict).toBe('STABLE');
        expect(Number.isFinite(rep.finalDrift)).toBe(true);
        // Steady state: second-half drift oscillates narrowly instead of diverging.
        const tail = rep.driftSeries.slice(5);
        expect(Math.max(...tail) - Math.min(...tail)).toBeLessThan(0.1);
        expect(rep.finalStabilityGap).toBeLessThan(0.1);
    });
});
