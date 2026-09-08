import { describe, it, expect } from '@jest/globals';
import {
    counterfactualResourceScarcity,
    counterfactualTradeDependency,
    counterfactualBetrayal,
    counterfactualLeadershipPanicDamping,
    counterfactualVictoryVsDefeatMorale,
    counterfactualIncursionMobilization,
    counterfactualRouteDangerReroute,
    counterfactualRumorNetworkDensity
} from '../benchmarks/behavioral-evaluation/counterfactual_world_validation.mjs';

describe('Section XL: World Simulation Validation (Counterfactual Causal Experiments)', () => {
    it('1. Resource scarcity causes nomad group to enter foraging/migration intent', () => {
        const res = counterfactualResourceScarcity();
        expect(res.status).toBe('PASS');
        expect(res.migrationOrForageTriggered).toBe(true);
        expect(res.conditionB_State).toBe('FORAGING');
    });

    it('2. Trade dependency suppresses military escalation under identical border provocation', () => {
        const res = counterfactualTradeDependency();
        expect(res.status).toBe('PASS');
        expect(res.tradeSuppressedEscalation).toBe(true);
        expect(res.escalationIndexTrade).toBeLessThanOrEqual(res.escalationIndexAutarky);
    });

    it('3. Unprovoked betrayal causes monotonic trust collapse and massive grievance surge', () => {
        const res = counterfactualBetrayal();
        expect(res.status).toBe('PASS');
        expect(res.causalInvariantPreserved).toBe(true);
        expect(res.conditionB_Betrayal_Trust).toBe(0);
        expect(res.conditionB_Betrayal_Grievance).toBeGreaterThan(0.7);
    });

    it('4. Calm high-dominance leader dampens follower panic contagion by >= 40%', () => {
        const res = counterfactualLeadershipPanicDamping();
        expect(res.status).toBe('PASS');
        expect(res.dampedAtLeast40Percent).toBe(true);
        expect(res.dampingRatio).toBeGreaterThanOrEqual(0.40);
    });

    it('5. Repeated victory vs defeat creates significant divergence in military readiness and posture', () => {
        const res = counterfactualVictoryVsDefeatMorale();
        expect(res.status).toBe('PASS');
        expect(res.postureDivergence).toBe(true);
        expect(res.victorReadiness).toBeGreaterThan(res.defeatedReadiness);
    });

    it('6. Hostile border incursions drive deterministic progression from unaware to mobilization/skirmish', () => {
        const res = counterfactualIncursionMobilization();
        expect(res.status).toBe('PASS');
        expect(res.escalatedDueToIncursions).toBe(true);
        expect(res.stageBIndex).toBeGreaterThan(res.stageAIndex);
    });

    it('7. Economic route danger spikes cause dynamic trade utility rerouting to alternate corridors', () => {
        const res = counterfactualRouteDangerReroute();
        expect(res.status).toBe('PASS');
        expect(res.switchedToSafeAlternate).toBe(true);
        expect(res.conditionB_Dangerous_TopRoute).toBe('byway');
    });

    it('8. High-contact dense social networks disseminate rumors with greater breadth than sparse networks', () => {
        const res = counterfactualRumorNetworkDensity();
        expect(res.status).toBe('PASS');
        expect(res.densePropagatesWider).toBe(true);
        expect(res.informedCountDense).toBeGreaterThan(res.informedCountSparse);
    });
});
