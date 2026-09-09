/**
 * @file misinformation-cascade.test.js
 *
 * Section XXII: false-alarm cascades with trust cost.
 */

import { MisinformationCascadeHarness } from '../packages/core/index.js';

describe('Section XXII: Misinformation Cascade', () => {
    test('1. False army rumor panics part of the settlement', () => {
        const h = new MisinformationCascadeHarness();
        const arm = h.runArm(false);
        expect(arm.peakPanic).toBeGreaterThan(0);
        expect(arm.correctionStatus).toBe('CORRECTED');
        expect(arm.panicSeries.length).toBe(10);
    });

    test('2. Correction costs the origin credibility', () => {
        const h = new MisinformationCascadeHarness();
        const arm = h.runArm(false);
        expect(arm.trustLoss).toBeGreaterThan(0);
        expect(arm.originCredAfter).toBeLessThan(arm.originCredBefore);
    });

    test('3. True rumors confirm without trust loss', () => {
        const h = new MisinformationCascadeHarness();
        const arm = h.runArm(true);
        expect(arm.correctionStatus).toBe('CONFIRMED');
        expect(arm.trustLoss).toBe(0);
        expect(arm.peakPanic).toBeGreaterThan(0);
    });

    test('4. Two-arm experiment shows trust asymmetry', () => {
        const h = new MisinformationCascadeHarness();
        const exp = h.runExperiment();
        expect(exp.verdict).toBe('CASCADE_WITH_TRUST_COST');
        expect(exp.trustAsymmetry).toBeGreaterThan(0);
        expect(exp.falseArm.rerouted || exp.falseArm.northRoadAdvisory !== 'USE').toBe(true);
    });

    test('5. Small settlements still cascade deterministically', () => {
        const h = new MisinformationCascadeHarness();
        const a = h.runArm(false, { agents: 5, ticks: 6, seed: 3 });
        const b = h.runArm(false, { agents: 5, ticks: 6, seed: 3 });
        expect(a).toEqual(b);
        expect(a.peakPanic).toBeGreaterThan(0);
        expect(h.auditImmutability().isClean).toBe(true);
        expect(h.auditImmutability().hostPhysicsMutations).toBe(0);
    });
});
