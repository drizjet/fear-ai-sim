import { describe, it, expect } from '@jest/globals';
import {
    AgentStateDecomposition,
    runLongHorizonSimulation
} from '../benchmarks/behavioral-evaluation/long_horizon_affect_identity_benchmark.mjs';
import { CANONICAL_ARCHETYPES } from '../benchmarks/behavioral-evaluation/fabe_v2_benchmark.mjs';
import { AffectiveAgent } from '../packages/core/index.js';

describe('Long-Horizon Affect & Personality Identity Benchmark (Milestone C)', () => {
    const stoic = CANONICAL_ARCHETYPES.find(a => a.id === 'stoic_veteran');
    const cowardly = CANONICAL_ARCHETYPES.find(a => a.id === 'cowardly_civilian');
    const bystander = CANONICAL_ARCHETYPES.find(a => a.id === 'frozen_bystander');

    describe('Tripartite Architectural State Decomposition', () => {
        it('decomposes agent state into stable identity, dynamic affect, and mid-term adaptation', () => {
            const agent = new AffectiveAgent('test_agent', stoic.traits);
            agent.tick(0.016, { threats: [{ id: 't', distance: 5.0, intensity: 0.8 }] });

            const decomp = AgentStateDecomposition.decompose(agent);

            // 1. Stable Identity
            expect(decomp.stableIdentity).toBeDefined();
            expect(decomp.stableIdentity.id).toBe('test_agent');
            expect(decomp.stableIdentity.traits.neuroticism).toBe(stoic.traits.neuroticism);
            expect(decomp.stableIdentity.traits.resilience).toBe(stoic.traits.resilience);

            // 2. Dynamic Affective State
            expect(decomp.dynamicAffectiveState).toBeDefined();
            expect(decomp.dynamicAffectiveState.rawFear).toBeGreaterThan(0);
            expect(decomp.dynamicAffectiveState.valence).toBeLessThanOrEqual(1.0);
            expect(decomp.dynamicAffectiveState.fearBand).toBeDefined();

            // 3. Mid-Term Adaptation
            expect(decomp.midTermAdaptation).toBeDefined();
            expect(decomp.midTermAdaptation.energy).toBeLessThanOrEqual(1.0);
            expect(decomp.midTermAdaptation.tickCount).toBe(1);
        });
    });

    describe('Identity Invariance Invariant (Zero Drift Property)', () => {
        it('verifies traits remain strictly immutable across 1,000 ticks of terror and recovery', () => {
            const res = runLongHorizonSimulation(cowardly, { ticks: 1000 });
            expect(res.identityInvariance.invariantPreserved).toBe(true);
            expect(res.identityInvariance.maxTraitDrift).toBe(0.0);
        });
    });

    describe('Checkpoint Restore & Replay Determinism', () => {
        it('verifies midpoint save/restore produces bit-for-bit identical trajectory to end', () => {
            const resStoic = runLongHorizonSimulation(stoic, { ticks: 1000 });
            const resCowardly = runLongHorizonSimulation(cowardly, { ticks: 1000 });

            expect(resStoic.checkpointReplayDeterminism).toBe(true);
            expect(resCowardly.checkpointReplayDeterminism).toBe(true);
        });
    });

    describe('Trauma Relapse & Sensitization Dynamics', () => {
        it('verifies high-neuroticism personas experience greater trauma relapse than stoic veteran', () => {
            const simStoic = runLongHorizonSimulation(stoic, { ticks: 5000 });
            const simCowardly = runLongHorizonSimulation(cowardly, { ticks: 5000 });
            const simBystander = runLongHorizonSimulation(bystander, { ticks: 5000 });

            expect(simCowardly.traumaDynamics.epoch4RelapsePeakFear).toBeGreaterThan(simStoic.traumaDynamics.epoch4RelapsePeakFear);
            expect(simBystander.traumaDynamics.epoch4RelapsePeakFear).toBeGreaterThan(simStoic.traumaDynamics.epoch4RelapsePeakFear);
            expect(simBystander.traumaDynamics.epoch4RelapsePeakFear).toBeGreaterThan(simCowardly.traumaDynamics.epoch4RelapsePeakFear);
        });
    });

    describe('Behavioral Motifs & Repertoire Complexity', () => {
        it('computes positive Shannon entropy and distinct 3-gram motifs', () => {
            const sim = runLongHorizonSimulation(stoic, { ticks: 1000 });

            expect(sim.motifs.unique3GramMotifs).toBeGreaterThan(5);
            expect(sim.motifs.shannonEntropy).toBeGreaterThan(1.0);
            expect(sim.motifs.top3Motifs).toHaveLength(3);
        });
    });
});
