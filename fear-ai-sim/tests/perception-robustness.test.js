/**
 * @file perception-robustness.test.js
 *
 * Front B/E / Sections 219–222: Uncertainty, Sensor Conflict & Degradation.
 */

import { PerceptionRobustnessEngine, NOISE_PROFILES } from '../packages/core/index.js';

describe('Front B/E / Sections 219–222: Perception Robustness', () => {
    test('1. Occlusion attenuates visual intensity monotonically', () => {
        const lo = new PerceptionRobustnessEngine({ seed: 7 });
        lo.setProfile('a', { occlusion: 0.2, noiseStd: 0 });
        const hi = new PerceptionRobustnessEngine({ seed: 7 });
        hi.setProfile('a', { occlusion: 0.8, noiseStd: 0 });
        const rLo = lo.perceive('a', 1, { visual: { intensity: 0.9 } });
        const rHi = hi.perceive('a', 1, { visual: { intensity: 0.9 } });
        expect(rLo.visual.value).toBeCloseTo(0.72, 2);
        expect(rHi.visual.value).toBeCloseTo(0.18, 2);
        expect(rHi.fusedThreat).toBeLessThan(rLo.fusedThreat);
    });

    test('2. Latency delays observations and flags stale ticks', () => {
        const e = new PerceptionRobustnessEngine({ seed: 11 });
        e.setProfile('a', { latencyTicks: 2, noiseStd: 0 });
        const t0 = e.perceive('a', 0, { visual: { intensity: 0.9 } });
        expect(t0.visual.stale).toBe(true);
        e.perceive('a', 1, { visual: { intensity: 0.1 } });
        const t2 = e.perceive('a', 2, { visual: { intensity: 0.1 } });
        expect(t2.visual.stale).toBe(false);
        expect(t2.visual.value).toBeCloseTo(0.9, 2);
        expect(e.metricsFor('a').staleTicks).toBeGreaterThanOrEqual(1);
    });

    test('3. Dropout schedule is deterministic across reruns', () => {
        const run = () => {
            const e = new PerceptionRobustnessEngine({ seed: 21 });
            e.setProfile('a', { dropoutPeriod: 3, noiseStd: 0 });
            return [0, 1, 2, 3, 4, 5].map((t) => e.perceive('a', t, { visual: { intensity: 0.8 } }).visual);
        };
        const a = run();
        const b = run();
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        expect(a[0].dropped).toBe(true);
        expect(a[1].dropped).not.toBe(true);
        expect(a[3].dropped).toBe(true);
    });

    test('4. Ghosts stay visible and misses are counted, never silent', () => {
        const g = new PerceptionRobustnessEngine({ seed: 33 });
        g.setProfile('a', { falsePositiveRate: 1.0, noiseStd: 0 });
        const ghost = g.perceive('a', 1, {});
        expect(ghost.visual.ghost).toBe(true);
        expect(ghost.advisoryIntent).toBe('CAUTIOUS_EXPLORE');
        expect(ghost.uncertainty).toBeGreaterThanOrEqual(0.4);
        // Both silent channels ghost under fpRate 1.0 — nothing is ever silent
        expect(g.metricsFor('a').ghosts).toBe(2);

        const m = new PerceptionRobustnessEngine({ seed: 34 });
        m.setProfile('a', { falseNegativeRate: 1.0, noiseStd: 0 });
        const miss = m.perceive('a', 1, { visual: { intensity: 0.95 } });
        expect(miss.visual.missed).toBe(true);
        expect(m.metricsFor('a').misses).toBe(1);
    });

    test('5. Audio-danger plus visual-safe investigates with high uncertainty', () => {
        const e = new PerceptionRobustnessEngine({ seed: 44 });
        e.setProfile('a', { noiseStd: 0 });
        const r = e.perceive('a', 1, { visual: null, audio: { loudness: 0.85 } });
        expect(r.conflict).toBe(true);
        expect(r.uncertainty).toBeGreaterThanOrEqual(0.6);
        expect(r.advisoryIntent).toBe('INVESTIGATE_SOUND');
        expect(r.fusedThreat).toBeLessThan(0.85);
        expect(e.metricsFor('a').conflicts).toBe(1);
    });

    test('6. Non-Gaussian profiles generalize beyond textbook noise', () => {
        const spike = new PerceptionRobustnessEngine({ seed: 55 });
        spike.setProfile('a', { noiseStd: 0.1, noiseProfile: NOISE_PROFILES.SPIKE });
        const spikeVals = [];
        for (let t = 0; t < 200; t++) spikeVals.push(spike.perceive('a', t, { visual: { intensity: 0.5 } }).visual.value);
        const spikeRange = Math.max(...spikeVals) - Math.min(...spikeVals);
        expect(spikeRange).toBeGreaterThan(0.35);

        const bias = new PerceptionRobustnessEngine({ seed: 55 });
        bias.setProfile('a', { noiseStd: 0.01, noiseProfile: NOISE_PROFILES.BIAS, noiseBias: 0.2 });
        let biasMean = 0;
        for (let t = 0; t < 100; t++) biasMean += bias.perceive('a', t, { visual: { intensity: 0.5 } }).visual.value;
        biasMean /= 100;
        expect(biasMean).toBeGreaterThan(0.6);

        const again = new PerceptionRobustnessEngine({ seed: 55 });
        again.setProfile('a', { noiseStd: 0.1, noiseProfile: NOISE_PROFILES.SPIKE });
        const first = again.perceive('a', 0, { visual: { intensity: 0.5 } }).visual.value;
        const fresh = new PerceptionRobustnessEngine({ seed: 55 });
        fresh.setProfile('a', { noiseStd: 0.1, noiseProfile: NOISE_PROFILES.SPIKE });
        expect(fresh.perceive('a', 0, { visual: { intensity: 0.5 } }).visual.value).toBe(first);
    });

    test('7. Authority invariant and replay determinism hold', () => {
        const run = () => {
            const e = new PerceptionRobustnessEngine({ seed: 99 });
            e.setProfile('a', { occlusion: 0.3, noiseStd: 0.05 });
            return [0, 1, 2].map((t) => e.perceive('a', t, { visual: { intensity: 0.7 }, audio: { loudness: 0.2 } }));
        };
        expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
        const e = new PerceptionRobustnessEngine({ seed: 99 });
        const audit = e.auditImmutability();
        expect(audit.isClean).toBe(true);
        expect(audit.hostPhysicsMutations).toBe(0);
    });
});
