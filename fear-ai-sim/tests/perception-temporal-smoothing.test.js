/**
 * @file perception-temporal-smoothing.test.js
 *
 * NEXT-188: opt-in temporal smoothing completes Perception V2 (LXXXVI).
 * Profile `smoothingWindow` (default 0 = legacy single-sample path,
 * bit-identical) replaces the raw with the mean of the last W buffered
 * raw values before occlusion/noise. Deterministic, RNG untouched.
 */

import { describe, it, expect } from '@jest/globals';
import { PerceptionRobustnessEngine } from '../packages/core/index.js';

const engine = (profile) => {
    const e = new PerceptionRobustnessEngine({ seed: 5 });
    e.setProfile('a', { noiseStd: 0, ...profile });
    return e;
};

describe('NEXT-188: temporal smoothing', () => {
    it('1. Window 0, absent, or garbage keeps the legacy path bit-identical', () => {
        const seq = [0.8, 0.2, 0.9, 0.1];
        const run = (profile) => {
            const e = engine(profile);
            return seq.map((v, i) => e.perceive('a', i + 1, { visual: { intensity: v } }).visual.value);
        };
        const legacy = run({});
        expect(run({ smoothingWindow: 0 })).toEqual(legacy);
        expect(run({ smoothingWindow: 1 })).toEqual(legacy);
        expect(run({ smoothingWindow: 'x' })).toEqual(legacy);
        expect(run({ smoothingWindow: NaN })).toEqual(legacy);
        expect(run({ smoothingWindow: -4 })).toEqual(legacy);
        expect(legacy).toEqual([0.8, 0.2, 0.9, 0.1]);
    });

    it('2. Window 3 attenuates oscillation with exact warm-up means', () => {
        const e = engine({ smoothingWindow: 3 });
        const seq = [0.8, 0, 0.8, 0, 0.8];
        const got = seq.map((v, i) => e.perceive('a', i + 1, { visual: { intensity: v } }).visual.value);
        // t1: 0.8; t2: (0.8+0)/2; t3: 1.6/3; t4: 0.8/3; t5: 1.6/3.
        expect(got).toEqual([0.8, 0.4, 0.5333, 0.2667, 0.5333]);
    });
    it('3. Single spike is attenuated, never amplified (metamorphic)', () => {
        const plain = engine({});
        const smooth = engine({ smoothingWindow: 4 });
        const seq = [0.2, 0.2, 1.0, 0.2, 0.2];
        const pVals = seq.map((v, i) => plain.perceive('a', i + 1, { visual: { intensity: v } }).visual.value);
        const sVals = seq.map((v, i) => smooth.perceive('a', i + 1, { visual: { intensity: v } }).visual.value);
        expect(Math.max(...sVals)).toBeLessThan(Math.max(...pVals));
        expect(sVals[2]).toBe(0.4667);
    });

    it('4. Null raws are excluded; all-null window stays null', () => {
        const e = engine({ smoothingWindow: 3 });
        const r1 = e.perceive('a', 1, { visual: { intensity: 0.9 } });
        expect(r1.visual.value).toBe(0.9);
        const r2 = e.perceive('a', 2, {});
        expect(r2.visual.value).toBe(null);
        const r3 = e.perceive('a', 3, { visual: { intensity: 0.9 } });
        // Window holds [0.9, null, 0.9] -> mean over non-null = 0.9.
        expect(r3.visual.value).toBe(0.9);
        const e2 = engine({ smoothingWindow: 3 });
        const rNull = e2.perceive('a', 1, {});
        expect(rNull.visual.value).toBe(null);
        expect(rNull.fusedThreat).toBe(0.05);
    });

    it('5. Smoothing composes with reliability and age; replay is exact', () => {
        const run = () => {
            const e = engine({ smoothingWindow: 3 });
            return [0.8, 0.8, 0.8].map((v, i) => e.perceive('a', i + 1, {
                visual: { intensity: v, reliability: 0, ageTicks: 10 }
            }));
        };
        const a = run();
        const b = run();
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
        // Steady input: smoothed raw stays 0.8 -> threat 0.8; uncertainty
        // = 0.3 base + 0.5 reliability + 0.25 age = 1.05 -> clamped 1.
        expect(a[2].visual.value).toBe(0.8);
        expect(a[2].fusedThreat).toBe(0.8);
        expect(a[2].uncertainty).toBe(1);
    });

    it('6. Window clamps to 16 and averages only available history', () => {
        const e = engine({ smoothingWindow: 99 });
        const r1 = e.perceive('a', 1, { visual: { intensity: 0.6 } });
        expect(r1.visual.value).toBe(0.6);
        const r2 = e.perceive('a', 2, { visual: { intensity: 0.2 } });
        expect(r2.visual.value).toBe(0.4);
    });
});
