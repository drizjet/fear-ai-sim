/**
 * @file perception-source-reliability.test.js
 *
 * Post-25 audit candidate 24: per-source reliability inputs.
 *
 * HISTORY: probed as INCONCLUSIVE (no reliability input existed; inline
 * reliability/source/age descriptors were silently ignored). NEXT-186 then
 * built the bridge: inline `visual.reliability` / `audio.reliability` in
 * [0, 1] now condition uncertainty (same estimate, lower confidence).
 * Tests 1-2 were rewritten from absence-pins to behavior-pins; the original
 * absence wording survives in git history and ledger milestone 184.
 * Stale-age discounting (age/staleness fields) REMAINS unbuilt — test 2
 * still pins that absence honestly.
 */

import { describe, it, expect } from '@jest/globals';
import { PerceptionRobustnessEngine } from '../packages/core/index.js';

const OBS = () => ({ visual: { intensity: 0.8 }, audio: { loudness: 0.6 } });

describe('Post-25 audit 24: perception source-reliability inputs', () => {
    it('1. BUILT (NEXT-186): flaky sources raise uncertainty, threat unchanged', () => {
        const trusted = new PerceptionRobustnessEngine({ seed: 5 });
        trusted.setProfile('a', { noiseStd: 0 });
        const rTrusted = trusted.perceive('a', 1, {
            visual: { intensity: 0.8, reliability: 0.99 },
            audio: { loudness: 0.6, reliability: 0.99 }
        });
        const flaky = new PerceptionRobustnessEngine({ seed: 5 });
        flaky.setProfile('a', { noiseStd: 0 });
        const rFlaky = flaky.perceive('a', 1, {
            visual: { intensity: 0.8, reliability: 0.01 },
            audio: { loudness: 0.6, reliability: 0.01 }
        });
        // Same estimate, lower confidence: 0.15 + (1-0.99)*0.5 = 0.155 vs
        // 0.15 + (1-0.01)*0.5 = 0.645. Threat and intent untouched.
        expect(rTrusted.fusedThreat).toBe(0.72);
        expect(rFlaky.fusedThreat).toBe(0.72);
        expect(rTrusted.uncertainty).toBe(0.155);
        expect(rFlaky.uncertainty).toBe(0.645);
        expect(rFlaky.advisoryIntent).toBe(rTrusted.advisoryIntent);
        expect(rFlaky.reliability).toEqual({ visual: 0.01, audio: 0.01, fused: 0.01 });
        expect(rTrusted.reliability).toEqual({ visual: 0.99, audio: 0.99, fused: 0.99 });
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

    it('7. Reliability clamps to [0,1]; garbage collapses to trusted; absent keeps legacy shape', () => {
        const e = new PerceptionRobustnessEngine({ seed: 5 });
        e.setProfile('a', { noiseStd: 0 });
        const hi = e.perceive('a', 1, { visual: { intensity: 0.8, reliability: 5 }, audio: { loudness: 0.6, reliability: 5 } });
        expect(hi.uncertainty).toBe(0.15);
        expect(hi.reliability).toEqual({ visual: 1, audio: 1, fused: 1 });
        const lo = e.perceive('a', 2, { visual: { intensity: 0.8, reliability: -3 }, audio: { loudness: 0.6, reliability: -3 } });
        expect(lo.uncertainty).toBe(0.65);
        const nan = e.perceive('a', 3, { visual: { intensity: 0.8, reliability: NaN }, audio: { loudness: 0.6, reliability: 'x' } });
        expect(nan.uncertainty).toBe(0.15);
        const legacy = e.perceive('a', 4, OBS());
        expect(legacy.uncertainty).toBe(0.15);
        expect('reliability' in legacy).toBe(false);
    });

    it('8. Uncertainty is monotone non-decreasing as reliability falls (LXXXVIII)', () => {
        const run = (rel) => {
            const e = new PerceptionRobustnessEngine({ seed: 5 });
            e.setProfile('a', { noiseStd: 0 });
            return e.perceive('a', 1, { visual: { intensity: 0.8, reliability: rel }, audio: { loudness: 0.6, reliability: rel } });
        };
        const us = [1, 0.75, 0.5, 0.25, 0].map((r) => run(r).uncertainty);
        expect(us).toEqual([0.15, 0.275, 0.4, 0.525, 0.65]);
        for (let i = 1; i < us.length; i++) expect(us[i]).toBeGreaterThanOrEqual(us[i - 1]);
        // Single contributing channel uses only its own reliability.
        const e = new PerceptionRobustnessEngine({ seed: 5 });
        e.setProfile('s', { noiseStd: 0 });
        const single = e.perceive('s', 1, { visual: { intensity: 0.8, reliability: 0 } });
        expect(single.fusedThreat).toBe(0.8);
        expect(single.uncertainty).toBe(0.8);
        expect(single.reliability).toEqual({ visual: 0, audio: 1, fused: 0 });
    });

    it('9. Reliability path replays exactly under the same seed', () => {
        const run = () => {
            const e = new PerceptionRobustnessEngine({ seed: 5 });
            e.setProfile('a', { noiseStd: 0.1 });
            return [0, 1, 2].map((t) => e.perceive('a', t, { visual: { intensity: 0.8, reliability: 0.3 }, audio: { loudness: 0.6, reliability: 0.7 } }));
        };
        const a = run();
        const b = run();
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
        expect(a[0].reliability).toEqual({ visual: 0.3, audio: 0.7, fused: 0.5 });
    });
});
