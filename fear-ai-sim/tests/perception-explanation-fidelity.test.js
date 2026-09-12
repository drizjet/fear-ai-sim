/**
 * @file perception-explanation-fidelity.test.js
 *
 * R1 (audit 190): WhyNotExplainer.explainUncertainty attributes
 * PerceptionRobustnessEngine uncertainty to its exact additive terms.
 * Fidelity rule: cited terms must re-sum to the recorded uncertainty
 * within the documented two-rounding tolerance, and the dominant term
 * must be the argmax. Tampering must fail the receipt (mutation-caught).
 */

import { describe, it, expect } from '@jest/globals';
import { PerceptionRobustnessEngine, WhyNotExplainer } from '../packages/core/index.js';

function perceive(profile, observation, tick = 1) {
    const e = new PerceptionRobustnessEngine({ seed: 5 });
    e.setProfile('a', { noiseStd: 0, ...profile });
    return e.perceive('a', tick, observation);
}

const explainer = new WhyNotExplainer();
const BASE_OBS = { visual: { intensity: 0.8 }, audio: { loudness: 0.6 } };

describe('R1: perception uncertainty attribution', () => {
    it('1. Bare result attributes everything to the fused-estimate base', () => {
        const r = perceive({}, BASE_OBS);
        expect(r.uncertainty).toBe(0.15);
        const ans = explainer.explainUncertainty(r);
        expect(ans.terms).toEqual([
            { name: 'fused-estimate', value: 0.15 },
            { name: 'source-reliability', value: 0 },
            { name: 'observation-age', value: 0 }
        ]);
        expect(ans.dominant).toBe('fused-estimate');
        expect(ans.receipt.matches).toBe(true);
        expect(ans.smoothing).toBe(null);
    });

    it('2. Flaky reliability dominates with the exact NEXT-186 term', () => {
        const r = perceive({}, {
            visual: { intensity: 0.8, reliability: 0 },
            audio: { loudness: 0.6, reliability: 0 }
        });
        expect(r.uncertainty).toBe(0.65);
        const ans = explainer.explainUncertainty(r);
        expect(ans.terms).toEqual([
            { name: 'fused-estimate', value: 0.15 },
            { name: 'source-reliability', value: 0.5 },
            { name: 'observation-age', value: 0 }
        ]);
        expect(ans.dominant).toBe('source-reliability');
        expect(ans.receipt.matches).toBe(true);
    });

    it('3. Stale age dominates with the exact NEXT-187 term', () => {
        const r = perceive({}, {
            visual: { intensity: 0.8, ageTicks: 10 },
            audio: { loudness: 0.6, ageTicks: 10 }
        });
        expect(r.uncertainty).toBe(0.4);
        const ans = explainer.explainUncertainty(r);
        expect(ans.terms).toEqual([
            { name: 'fused-estimate', value: 0.15 },
            { name: 'source-reliability', value: 0 },
            { name: 'observation-age', value: 0.25 }
        ]);
        expect(ans.dominant).toBe('observation-age');
        expect(ans.receipt.matches).toBe(true);
    });

    it('4. Combined penalties re-sum within tolerance on live outputs', () => {
        const cases = [
            [{ visual: { intensity: 0.8, reliability: 0.3, ageTicks: 4 }, audio: { loudness: 0.6, reliability: 0.7, ageTicks: 6 } }],
            [{ visual: { intensity: 0.1, reliability: 0, ageTicks: 50 }, audio: { loudness: 0.9, reliability: 0, ageTicks: 50 } }],
            [{ visual: { intensity: 0.8, reliability: 0.99 }, audio: { loudness: 0.6 } }]
        ];
        for (const [obs] of cases) {
            const r = perceive({}, obs);
            const ans = explainer.explainUncertainty(r);
            expect(ans.receipt.matches).toBe(true);
            const top = Math.max(...ans.terms.map((t) => t.value));
            expect(ans.terms.find((t) => t.name === ans.dominant).value).toBe(top);
        }
    });

    it('5. Smoothing context is informational; absent without context', () => {
        const e = new PerceptionRobustnessEngine({ seed: 5 });
        e.setProfile('a', { noiseStd: 0, smoothingWindow: 3 });
        e.perceive('a', 1, { visual: { intensity: 0.2 } });
        const r = e.perceive('a', 2, { visual: { intensity: 1.0 } });
        const withCtx = explainer.explainUncertainty(r, {
            observation: { visual: { intensity: 1.0 } },
            smoothingWindow: 3
        });
        expect(withCtx.smoothing).toEqual({ window: 3, rawIntensity: 1, smoothedValue: 0.6, delta: -0.4 });
        expect(withCtx.receipt.matches).toBe(true);
        const bare = explainer.explainUncertainty(r);
        expect(bare.smoothing).toBe(null);
        expect(bare.receipt.matches).toBe(true);
    });

    it('6. Tampered uncertainty or echoes fail the receipt (wrong explanation caught)', () => {
        const r = perceive({}, BASE_OBS);
        const ok = explainer.explainUncertainty(r);
        expect(ok.receipt.matches).toBe(true);
        expect(ok.receipt.baseExpected).toBe(0.15);
        // Tamper the top-line number: penalty-stripped base no longer
        // matches the fuse table re-derivation from recorded values.
        const tampered = { ...r, uncertainty: r.uncertainty + 0.1 };
        expect(explainer.explainUncertainty(tampered).receipt.matches).toBe(false);
        // Tamper an echo instead: the rel term moves but the recorded
        // channel values still imply the old base.
        const wired = perceive({}, {
            visual: { intensity: 0.8, reliability: 0 },
            audio: { loudness: 0.6, reliability: 0 }
        });
        expect(explainer.explainUncertainty(wired).receipt.matches).toBe(true);
        const echoTampered = { ...wired, reliability: { visual: 1, audio: 1, fused: 1 } };
        expect(explainer.explainUncertainty(echoTampered).receipt.matches).toBe(false);
        // Saturated ceiling: weakening an echo below the saturation bound
        // must also fail, so the bound check is not vacuous either.
        const sat = perceive({}, {
            visual: { intensity: 0.1, reliability: 0, ageTicks: 50 },
            audio: { loudness: 0.9, reliability: 0, ageTicks: 50 }
        });
        expect(sat.uncertainty).toBe(1);
        expect(explainer.explainUncertainty(sat).receipt.matches).toBe(true);
        const satWeakened = {
            ...sat,
            reliability: { visual: 0.9, audio: 0.9, fused: 0.9 },
            ageTicks: { visual: 0, audio: 0, fused: 0 }
        };
        expect(explainer.explainUncertainty(satWeakened).receipt.matches).toBe(false);

    });
    it('7. Malformed results throw instead of inventing', () => {
        expect(() => explainer.explainUncertainty(null)).toThrow('RESULT_NEEDS_UNCERTAINTY');
        expect(() => explainer.explainUncertainty({})).toThrow('RESULT_NEEDS_UNCERTAINTY');
        expect(() => explainer.explainUncertainty({ uncertainty: NaN })).toThrow('RESULT_NEEDS_UNCERTAINTY');
    });

    it('8. Explanation replays exactly under the same inputs', () => {
        const run = () => {
            const r = perceive({}, {
                visual: { intensity: 0.8, reliability: 0.3, ageTicks: 4 },
                audio: { loudness: 0.6, reliability: 0.7, ageTicks: 6 }
            });
            return explainer.explainUncertainty(r);
        };
        expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
    });
});
