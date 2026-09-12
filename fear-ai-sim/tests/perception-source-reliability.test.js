/**
 * @file perception-source-reliability.test.js
 *
 * Post-25 audit candidate 24: per-source reliability inputs.
 *
 * Hypothesis: per-source reliability (trusted vs flaky sensors) and
 * stale-age discounting condition confidence outputs.
 *
 * MEASURED OUTCOME (probed live against PerceptionRobustnessEngine):
 * The engine has NO per-source reliability input. `perceive()` reads only
 * `observation.visual.intensity` and `observation.audio.loudness`; extra
 * descriptor fields (reliability, source, age, staleness) are silently
 * ignored. Degradation is per-AGENT profile (occlusion, latencyTicks,
 * noiseStd/Profile, falsePositive/NegativeRate, dropoutPeriod), not
 * per-source. There is no `confidence` output field — the closest
 * analogue is `uncertainty` (inverse confidence) from `fuse()`.
 * Staleness exists only as the latency/dropout `stale: true` flag
 * (both channels null -> threat 0.05, uncertainty 0.4).
 * Tests 1-2 therefore pin the ABSENCE honestly (INCONCLUSIVE-with-evidence);
 * tests 3-6 pin what the engine DOES condition on.
 */

import { describe, it, expect } from '@jest/globals';
import { PerceptionRobustnessEngine } from '../packages/core/index.js';

const OBS = () => ({ visual: { intensity: 0.8 }, audio: { loudness: 0.6 } });

describe('Post-25 audit 24: perception source-reliability inputs', () => {
    it('1. INCONCLUSIVE: reliability/source descriptors do not change outputs', () => {
        const trusted = new PerceptionRobustnessEngine({ seed: 5 });
        trusted.setProfile('a', { noiseStd: 0 });
        const rTrusted = trusted.perceive('a', 1, {
            visual: { intensity: 0.8, reliability: 0.99, source: 'trusted' },
            audio: { loudness: 0.6, reliability: 0.99, source: 'trusted' }
        });
        const flaky = new PerceptionRobustnessEngine({ seed: 5 });
        flaky.setProfile('a', { noiseStd: 0 });
        const rFlaky = flaky.perceive('a', 1, {
            visual: { intensity: 0.8, reliability: 0.01, source: 'flaky' },
            audio: { loudness: 0.6, reliability: 0.01, source: 'flaky' }
        });
        // Pinned absence: identical outputs despite opposite reliability labels.
        expect(rFlaky).toEqual(rTrusted);
        expect(rTrusted.fusedThreat).toBe(0.72);
        expect(rTrusted.uncertainty).toBe(0.15);
    });

    it('2. INCONCLUSIVE: observation age/staleness fields do not discount outputs', () => {
        const fresh = new PerceptionRobustnessEngine({ seed: 5 });
        fresh.setProfile('a', { noiseStd: 0 });
        const rFresh = fresh.perceive('a', 1, OBS());
        const aged = new PerceptionRobustnessEngine({ seed: 5 });
        aged.setProfile('a', { noiseStd: 0 });
        const rAged = aged.perceive('a', 1, {
            visual: { intensity: 0.8, age: 50, staleness: 50 },
            audio: { loudness: 0.6, age: 50, staleness: 50 }
        });
        // Pinned absence: no stale-age discounting on the observation path.
        expect(rAged).toEqual(rFresh);
        expect(rAged.visual.stale).toBe(false);
    });

    it('3. Latency-stale ticks yield lower-or-equal threat and higher-or-equal uncertainty (metamorphic)', () => {
        const eFresh = new PerceptionRobustnessEngine({ seed: 5 });
        eFresh.setProfile('f', { noiseStd: 0 });
        const rFresh = eFresh.perceive('f', 1, OBS());
        const eStale = new PerceptionRobustnessEngine({ seed: 5 });
        eStale.setProfile('s', { latencyTicks: 3, noiseStd: 0 });
        const rStale = eStale.perceive('s', 1, OBS());
        expect(rStale.visual.stale).toBe(true);
        expect(rStale.audio.stale).toBe(true);
        // Pinned numbers: fresh (0.72, 0.15) vs stale (0.05, 0.4).
        expect(rFresh.fusedThreat).toBe(0.72);
        expect(rFresh.uncertainty).toBe(0.15);
        expect(rStale.fusedThreat).toBe(0.05);
        expect(rStale.uncertainty).toBe(0.4);
        expect(rStale.fusedThreat).toBeLessThanOrEqual(rFresh.fusedThreat);
        expect(rStale.uncertainty).toBeGreaterThanOrEqual(rFresh.uncertainty);
        expect(eStale.metricsFor('s').staleTicks).toBeGreaterThanOrEqual(1);
    });

    it('4. Conflicting sources surface conflict flag, INVESTIGATE intent, and conflict metrics', () => {
        const e = new PerceptionRobustnessEngine({ seed: 5 });
        e.setProfile('c', { noiseStd: 0 });
        const r = e.perceive('c', 1, { visual: { intensity: 0.1 }, audio: { loudness: 0.9 } });
        // Pinned numbers: threat max(0.1, 0.9*0.7)=0.63, uncertainty 0.65.
        expect(r.conflict).toBe(true);
        expect(r.fusedThreat).toBeCloseTo(0.63, 2);
        expect(r.uncertainty).toBe(0.65);
        expect(r.advisoryIntent).toBe('INVESTIGATE_SOUND');
        expect(e.metricsFor('c').conflicts).toBe(1);
    });

    it('5. Malformed descriptors degrade safely; null observation throws', () => {
        const e = new PerceptionRobustnessEngine({ seed: 5 });
        // Garbage intensities coerce via clamp01(NaN)->0: calm, no throw.
        const rGarbage = e.perceive('m', 1, { visual: { intensity: 'garbage' }, audio: { loudness: NaN } });
        expect(rGarbage.visual.value).toBe(0);
        expect(rGarbage.audio.value).toBe(0);
        expect(rGarbage.fusedThreat).toBe(0);
        expect(rGarbage.advisoryIntent).toBe('IDLE_VIGILANT');
        // Garbage profile fields collapse to safe defaults (NaN noiseStd -> 0 via `|| 0`).
        e.setProfile('m2', {
            occlusion: 'xx', latencyTicks: -5, noiseStd: NaN,
            noiseProfile: 'BOGUS', falsePositiveRate: 99,
            falseNegativeRate: -3, dropoutPeriod: 'x'
        });
        const rProfile = e.perceive('m2', 1, OBS());
        expect(rProfile.fusedThreat).toBe(0.72);
        expect(rProfile.uncertainty).toBe(0.15);
        // Missing observation degrades to the both-null branch; explicit null throws.
        const rEmpty = e.perceive('m3', 1, {});
        expect(rEmpty.fusedThreat).toBe(0.05);
        expect(() => e.perceive('m4', 1, null)).toThrow(TypeError);
    });

    it('6. Exact replay: same seed and sequence reproduce identical outputs', () => {
        const run = () => {
            const e = new PerceptionRobustnessEngine({ seed: 5 });
            e.setProfile('a', { noiseStd: 0.1 });
            return [0, 1, 2].map((t) => e.perceive('a', t, OBS()));
        };
        const a = run();
        const b = run();
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
        expect(a[0].fusedThreat).toBe(b[0].fusedThreat);
        expect(a[0].uncertainty).toBe(b[0].uncertainty);
    });
});
