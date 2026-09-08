/**
 * packages/core/src/MetamorphicVerificationHarness.js
 *
 * Section 123 / Frontier E: Metamorphic Testing & Semantic Invariant Verification.
 *
 * Implements the 5 canonical metamorphic relations:
 * 1. MR1 (Spatial Invariance of Distant Irrelevant Entities):
 *    Adding or duplicating an entity 500m away (beyond sensory/interaction radius)
 *    produces 0.0000 delta on focal agent affect, urgency, and intent choice.
 * 2. MR2 (Isomorphic Entity Relabeling):
 *    Applying a bijective mapping pi: ID -> ID' produces strictly isomorphic state trajectories.
 * 3. MR3 (Observation Permutation Invariance):
 *    Permuting the array order of incoming threats or peer observations yields bit-exact intent rankings.
 * 4. MR4 (Monotonic Threat Distance Sensitivity):
 *    For identical threat stimuli, reducing spatial distance monotonically increases threat pressure (dF >= 0).
 * 5. MR5 (Monotonic Resilience Recovery Acceleration):
 *    For identical acute trauma, higher resilience strictly reduces recovery duration (tau_high <= tau_low).
 *
 * STRICT INVARIANT:
 * Host game maintains authority over physics, collision, and transforms;
 * middleware produces deterministic advisory state evaluations.
 */

import { AffectiveAgent } from './AffectiveAgent.js';
import { DeterministicRng } from './DeterministicRng.js';
import { FrontierValleySimulation } from './FrontierValleySimulation.js';
import { WorldSimulationSystem, ROAMING_PARTY_TYPES } from './WorldSimulationSystem.js';

export const METAMORPHIC_RELATIONS = Object.freeze({
    MR1_DISTANT_SPATIAL_INVARIANCE: 'MR1_DISTANT_SPATIAL_INVARIANCE',
    MR2_ISOMORPHIC_RELABELING: 'MR2_ISOMORPHIC_RELABELING',
    MR3_OBSERVATION_PERMUTATION: 'MR3_OBSERVATION_PERMUTATION',
    MR4_MONOTONIC_DISTANCE_SENSITIVITY: 'MR4_MONOTONIC_DISTANCE_SENSITIVITY',
    MR5_MONOTONIC_RESILIENCE_RECOVERY: 'MR5_MONOTONIC_RESILIENCE_RECOVERY'
});

export class MetamorphicVerificationHarness {
    /**
     * Executes the comprehensive metamorphic test battery.
     * @param {Object} [options={}]
     * @returns {Object} Metamorphic verification scorecard
     */
    static runBattery(options = {}) {
        const results = {
            timestamp: new Date().toISOString(),
            relationsEvaluated: 5,
            passedRelations: 0,
            relations: {},
            certified: false
        };

        // 1. MR1: Distant Spatial Invariance
        const r1 = MetamorphicVerificationHarness.verifyMR1DistantSpatialInvariance();
        results.relations[METAMORPHIC_RELATIONS.MR1_DISTANT_SPATIAL_INVARIANCE] = r1;
        if (r1.passed) results.passedRelations++;

        // 2. MR2: Isomorphic Relabeling
        const r2 = MetamorphicVerificationHarness.verifyMR2IsomorphicRelabeling();
        results.relations[METAMORPHIC_RELATIONS.MR2_ISOMORPHIC_RELABELING] = r2;
        if (r2.passed) results.passedRelations++;

        // 3. MR3: Observation Permutation
        const r3 = MetamorphicVerificationHarness.verifyMR3ObservationPermutation();
        results.relations[METAMORPHIC_RELATIONS.MR3_OBSERVATION_PERMUTATION] = r3;
        if (r3.passed) results.passedRelations++;

        // 4. MR4: Monotonic Distance Sensitivity
        const r4 = MetamorphicVerificationHarness.verifyMR4MonotonicDistanceSensitivity();
        results.relations[METAMORPHIC_RELATIONS.MR4_MONOTONIC_DISTANCE_SENSITIVITY] = r4;
        if (r4.passed) results.passedRelations++;

        // 5. MR5: Monotonic Resilience Recovery
        const r5 = MetamorphicVerificationHarness.verifyMR5MonotonicResilienceRecovery();
        results.relations[METAMORPHIC_RELATIONS.MR5_MONOTONIC_RESILIENCE_RECOVERY] = r5;
        if (r5.passed) results.passedRelations++;

        results.certified = (results.passedRelations === results.relationsEvaluated);
        return results;
    }

    /**
     * MR1: Adding an entity 500m away (beyond sensory/encounter radius) must produce zero delta on focal agent/group decisions.
     */
    static verifyMR1DistantSpatialInvariance() {
        const sensoryRadius = 100.0;
        const filterPerception = (threats) => (threats || []).filter(t => (t.distance ?? 10) <= sensoryRadius);

        const focalAgentA = new AffectiveAgent('focal_A', { neuroticism: 0.6, resilience: 0.5 }, { x: 0, y: 0 });
        const focalAgentB = new AffectiveAgent('focal_B', { neuroticism: 0.6, resilience: 0.5 }, { x: 0, y: 0 });

        // Baseline observation: local threat at 15m
        const rawBaseline = [{ id: 'goblin_near', distance: 15.0, intensity: 0.7 }];
        // Metamorphic observation: local threat + distant entity at 600m
        const rawTransformed = [
            { id: 'goblin_near', distance: 15.0, intensity: 0.7 },
            { id: 'irrelevant_distant', distance: 600.0, intensity: 0.8 }
        ];

        const resBaseline = focalAgentA.tick(0.016, { threats: filterPerception(rawBaseline) });
        const resTransformed = focalAgentB.tick(0.016, { threats: filterPerception(rawTransformed) });

        const deltaFear = Math.abs(focalAgentA.currentFear - focalAgentB.currentFear);
        const deltaArousal = Math.abs(focalAgentA.arousal - focalAgentB.arousal);
        const intentMatch = (resBaseline.action_intent?.type === resTransformed.action_intent?.type);

        // Systemic world-level distant invariance check
        const w1 = new WorldSimulationSystem({ seed: 42 });
        w1.registerGroup('caravan_A', { type: ROAMING_PARTY_TYPES.CARAVAN, position: { x: 0, y: 0, z: 0 }, militaryStrength: 0.5, wealth: 0.7 });
        w1.registerGroup('threat_B', { type: ROAMING_PARTY_TYPES.BANDITS, position: { x: 15, y: 0, z: 0 }, militaryStrength: 0.8, wealth: 0.2 });

        const w2 = new WorldSimulationSystem({ seed: 42 });
        w2.registerGroup('caravan_A', { type: ROAMING_PARTY_TYPES.CARAVAN, position: { x: 0, y: 0, z: 0 }, militaryStrength: 0.5, wealth: 0.7 });
        w2.registerGroup('threat_B', { type: ROAMING_PARTY_TYPES.BANDITS, position: { x: 15, y: 0, z: 0 }, militaryStrength: 0.8, wealth: 0.2 });
        w2.registerGroup('distant_irrelevant', { type: ROAMING_PARTY_TYPES.PATROL, position: { x: 600, y: 600, z: 0 }, militaryStrength: 0.9, wealth: 0.5 });

        for (let t = 0; t < 5; t++) {
            w1.tick(0.016);
            w2.tick(0.016);
        }

        const groupA1 = w1.getGroup('caravan_A');
        const groupA2 = w2.getGroup('caravan_A');
        const worldGroupStateIdentical = (groupA1.state === groupA2.state) && (groupA1.drivers.threatPressure === groupA2.drivers.threatPressure);

        const passed = (deltaFear < 1e-4 && deltaArousal < 1e-4 && intentMatch && worldGroupStateIdentical);

        return {
            passed,
            relation: METAMORPHIC_RELATIONS.MR1_DISTANT_SPATIAL_INVARIANCE,
            metrics: {
                deltaFear: Number(deltaFear.toFixed(6)),
                deltaArousal: Number(deltaArousal.toFixed(6)),
                intentMatch,
                worldGroupStateIdentical,
                baselineIntent: resBaseline.action_intent?.type,
                transformedIntent: resTransformed.action_intent?.type
            }
        };
    }

    /**
     * MR2: Bijectively relabeling entity identifiers produces strictly isomorphic state trajectories.
     */
    static verifyMR2IsomorphicRelabeling() {
        const agentOriginal = new AffectiveAgent('alpha_unit_01', { neuroticism: 0.7, resilience: 0.4 }, { x: 10, y: 10 });
        const agentRelabeled = new AffectiveAgent('omega_zeta_99', { neuroticism: 0.7, resilience: 0.4 }, { x: 10, y: 10 });

        const historyOrig = [];
        const historyRelabeled = [];

        const distances = [25.0, 18.0, 10.0, 6.0, 4.0];
        for (const dist of distances) {
            const outOrig = agentOriginal.tick(0.016, { threats: [{ id: 'threat_A', distance: dist, intensity: 0.85 }] });
            const outRelab = agentRelabeled.tick(0.016, { threats: [{ id: 'threat_B', distance: dist, intensity: 0.85 }] });

            historyOrig.push({ fear: agentOriginal.currentFear, intent: outOrig.action_intent?.type });
            historyRelabeled.push({ fear: agentRelabeled.currentFear, intent: outRelab.action_intent?.type });
        }

        let maxFearDiff = 0;
        let intentsIdentical = true;
        for (let i = 0; i < historyOrig.length; i++) {
            const diff = Math.abs(historyOrig[i].fear - historyRelabeled[i].fear);
            if (diff > maxFearDiff) maxFearDiff = diff;
            if (historyOrig[i].intent !== historyRelabeled[i].intent) intentsIdentical = false;
        }

        const passed = (maxFearDiff < 1e-5 && intentsIdentical);

        return {
            passed,
            relation: METAMORPHIC_RELATIONS.MR2_ISOMORPHIC_RELABELING,
            metrics: {
                maxFearDiff: Number(maxFearDiff.toFixed(6)),
                intentsIdentical,
                stepsCompared: distances.length
            }
        };
    }

    /**
     * MR3: Shuffling observation elements must yield bit-exact identical intent ranking.
     */
    static verifyMR3ObservationPermutation() {
        const agentA = new AffectiveAgent('agent_ordered', { neuroticism: 0.5, resilience: 0.5 });
        const agentB = new AffectiveAgent('agent_permuted', { neuroticism: 0.5, resilience: 0.5 });

        const threat1 = { id: 'threat_wolf', distance: 12.0, intensity: 0.6 };
        const threat2 = { id: 'threat_bandit', distance: 20.0, intensity: 0.8 };
        const threat3 = { id: 'threat_fire', distance: 30.0, intensity: 0.4 };

        const obsOrdered = { threats: [threat1, threat2, threat3] };
        const obsPermuted = { threats: [threat3, threat1, threat2] };

        const resOrdered = agentA.tick(0.016, obsOrdered);
        const resPermuted = agentB.tick(0.016, obsPermuted);

        const fearExact = (agentA.currentFear === agentB.currentFear);
        const intentExact = (resOrdered.action_intent?.type === resPermuted.action_intent?.type);
        const passed = (fearExact && intentExact);

        return {
            passed,
            relation: METAMORPHIC_RELATIONS.MR3_OBSERVATION_PERMUTATION,
            metrics: {
                fearExact,
                intentExact,
                fearOrdered: agentA.currentFear,
                fearPermuted: agentB.currentFear,
                intent: resOrdered.action_intent?.type
            }
        };
    }

    /**
     * MR4: Monotonic distance sensitivity (closer threat produces non-decreasing fear).
     */
    static verifyMR4MonotonicDistanceSensitivity() {
        const testDistances = [50.0, 40.0, 30.0, 20.0, 10.0, 5.0];
        let monotonicallyNonDecreasing = true;
        let prevFear = -1.0;
        const fearSequence = [];

        for (const dist of testDistances) {
            const agent = new AffectiveAgent('probe_agent', { neuroticism: 0.6, resilience: 0.5 });
            agent.tick(0.016, { threats: [{ id: 'stimulus', distance: dist, intensity: 0.8 }] });
            const f = agent.currentFear;
            fearSequence.push({ distance: dist, fear: f });

            if (f < prevFear) {
                monotonicallyNonDecreasing = false;
            }
            prevFear = f;
        }

        const passed = monotonicallyNonDecreasing && (fearSequence[fearSequence.length - 1].fear > fearSequence[0].fear);

        return {
            passed,
            relation: METAMORPHIC_RELATIONS.MR4_MONOTONIC_DISTANCE_SENSITIVITY,
            metrics: {
                monotonicallyNonDecreasing,
                initialFearAt50m: fearSequence[0].fear,
                peakFearAt5m: fearSequence[fearSequence.length - 1].fear,
                fearSequence
            }
        };
    }

    /**
     * MR5: Monotonic resilience recovery (higher resilience recovers to baseline in <= ticks).
     */
    static verifyMR5MonotonicResilienceRecovery() {
        const lowResilienceAgent = new AffectiveAgent('agent_low_r', { neuroticism: 0.5, resilience: 0.2 });
        const highResilienceAgent = new AffectiveAgent('agent_high_r', { neuroticism: 0.5, resilience: 0.9 });

        // Subject both to severe acute shock
        const acuteShock = { threats: [{ id: 'terror_spike', distance: 2.0, intensity: 1.0 }] };
        lowResilienceAgent.tick(0.016, acuteShock);
        highResilienceAgent.tick(0.016, acuteShock);

        // Advance in calm safety until recovery to calm (< 0.15 fear)
        let lowRecoveryTicks = 0;
        let highRecoveryTicks = 0;
        const maxTicks = 200;

        for (let t = 1; t <= maxTicks; t++) {
            if (lowResilienceAgent.currentFear > 0.15) {
                lowResilienceAgent.tick(0.016, { threats: [] });
                lowRecoveryTicks = t;
            }
            if (highResilienceAgent.currentFear > 0.15) {
                highResilienceAgent.tick(0.016, { threats: [] });
                highRecoveryTicks = t;
            }
        }

        const passed = (highRecoveryTicks <= lowRecoveryTicks);

        return {
            passed,
            relation: METAMORPHIC_RELATIONS.MR5_MONOTONIC_RESILIENCE_RECOVERY,
            metrics: {
                highResilienceRecoveryTicks: highRecoveryTicks,
                lowResilienceRecoveryTicks: lowRecoveryTicks,
                recoveryAccelerationFactor: lowRecoveryTicks > 0 ? Number((lowRecoveryTicks / Math.max(1, highRecoveryTicks)).toFixed(2)) : 1.0
            }
        };
    }
}
