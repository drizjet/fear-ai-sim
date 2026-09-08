/**
 * tests/metamorphic-verification.test.js
 *
 * Section 123 / Frontier E: Comprehensive Metamorphic Testing & Semantic Invariant Battery.
 *
 * Verifies all 5 canonical Metamorphic Relations (MR1-MR5):
 * 1. MR1 (Spatial Invariance of Distant Irrelevant Entities)
 * 2. MR2 (Isomorphic Entity Relabeling)
 * 3. MR3 (Observation Permutation Invariance)
 * 4. MR4 (Monotonic Threat Distance Sensitivity)
 * 5. MR5 (Monotonic Resilience Recovery Acceleration)
 */

import { describe, it, expect } from '@jest/globals';
import {
    MetamorphicVerificationHarness,
    METAMORPHIC_RELATIONS
} from '../packages/core/index.js';

describe('Frontier E: Metamorphic Testing & Semantic Invariant Verification (Section 123)', () => {
    it('1. Executes full metamorphic battery with 100% certification (5/5 passed relations)', () => {
        const scorecard = MetamorphicVerificationHarness.runBattery();
        expect(scorecard.relationsEvaluated).toBe(5);
        expect(scorecard.passedRelations).toBe(5);
        expect(scorecard.certified).toBe(true);
        expect(Object.keys(scorecard.relations).length).toBe(5);
    });

    it('2. Verifies MR1: Spatial Invariance of Distant Irrelevant Entities', () => {
        const result = MetamorphicVerificationHarness.verifyMR1DistantSpatialInvariance();
        expect(result.passed).toBe(true);
        expect(result.relation).toBe(METAMORPHIC_RELATIONS.MR1_DISTANT_SPATIAL_INVARIANCE);
        expect(result.metrics.deltaFear).toBeLessThan(1e-4);
        expect(result.metrics.deltaArousal).toBeLessThan(1e-4);
        expect(result.metrics.intentMatch).toBe(true);
        expect(result.metrics.worldGroupStateIdentical).toBe(true);
    });

    it('3. Verifies MR2: Isomorphic Entity Relabeling', () => {
        const result = MetamorphicVerificationHarness.verifyMR2IsomorphicRelabeling();
        expect(result.passed).toBe(true);
        expect(result.relation).toBe(METAMORPHIC_RELATIONS.MR2_ISOMORPHIC_RELABELING);
        expect(result.metrics.maxFearDiff).toBeLessThan(1e-5);
        expect(result.metrics.intentsIdentical).toBe(true);
        expect(result.metrics.stepsCompared).toBeGreaterThanOrEqual(5);
    });

    it('4. Verifies MR3: Observation Permutation Invariance', () => {
        const result = MetamorphicVerificationHarness.verifyMR3ObservationPermutation();
        expect(result.passed).toBe(true);
        expect(result.relation).toBe(METAMORPHIC_RELATIONS.MR3_OBSERVATION_PERMUTATION);
        expect(result.metrics.fearExact).toBe(true);
        expect(result.metrics.intentExact).toBe(true);
        expect(result.metrics.fearOrdered).toBeCloseTo(result.metrics.fearPermuted, 5);
    });

    it('5. Verifies MR4: Monotonic Threat Distance Sensitivity', () => {
        const result = MetamorphicVerificationHarness.verifyMR4MonotonicDistanceSensitivity();
        expect(result.passed).toBe(true);
        expect(result.relation).toBe(METAMORPHIC_RELATIONS.MR4_MONOTONIC_DISTANCE_SENSITIVITY);
        expect(result.metrics.monotonicallyNonDecreasing).toBe(true);
        expect(result.metrics.peakFearAt5m).toBeGreaterThan(result.metrics.initialFearAt50m);
    });

    it('6. Verifies MR5: Monotonic Resilience Recovery Acceleration', () => {
        const result = MetamorphicVerificationHarness.verifyMR5MonotonicResilienceRecovery();
        expect(result.passed).toBe(true);
        expect(result.relation).toBe(METAMORPHIC_RELATIONS.MR5_MONOTONIC_RESILIENCE_RECOVERY);
        expect(result.metrics.highResilienceRecoveryTicks).toBeLessThanOrEqual(result.metrics.lowResilienceRecoveryTicks);
        expect(result.metrics.recoveryAccelerationFactor).toBeGreaterThan(1.0);
    });
});
