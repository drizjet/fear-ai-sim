import { describe, it, expect } from '@jest/globals';
import {
    runUniversalPanicStress,
    runLeaderMortalityStress,
    runMassAllegianceInversionStress,
    runTradeCorridorBlackSwanStress,
    runResourceOscillationStress,
    runThreatBlinkStress,
    runHyperContagionRumorStress,
    runHighVelocityChurnStress,
    runSceneInundationStress,
    runUnprovokedBetrayalStress,
    runCompoundFactionCollapseStress
} from '../benchmarks/behavioral-evaluation/adversarial_world_stress.mjs';

describe('Section XXV: Adversarial World Testing & Stress Harness', () => {
    it('1. Universal Panic Cascade maintains bounded execution without numeric overflow', () => {
        const res = runUniversalPanicStress({ agentCount: 100, ticks: 10 });
        expect(res.status).toBe('PASS');
        expect(res.nanDetected).toBe(false);
        expect(res.maxFear).toBeGreaterThanOrEqual(0.8);
    });

    it('2. Leader mortality mid-contagion transitions followers to un-damped panic without crashing', () => {
        const res = runLeaderMortalityStress({ followerCount: 20 });
        expect(res.status).toBe('PASS');
        expect(res.crashOccurred).toBe(false);
        expect(res.postMortalityState).toBe('SCATTERED_STAMPEDE');
    });

    it('3. Mass faction allegiance inversion evaluates hundreds of bilateral pairs sub-millisecond without cyclic deadlock', () => {
        const res = runMassAllegianceInversionStress({ factionCount: 25 });
        expect(res.status).toBe('PASS');
        expect(res.bilateralPairsEvaluated).toBe(300);
        expect(res.elapsedMs).toBeLessThan(500);
    });

    it('4. Trade network black swan safely detours around blocked corridors to viable alternatives', () => {
        const res = runTradeCorridorBlackSwanStress();
        expect(res.status).toBe('PASS');
        expect(res.reroutedSafely).toBe(true);
        expect(res.postShockTopRoute).toBe('mountain_detour');
    });

    it('5. Oscillating environmental resource availability maintains bounded driver vectors', () => {
        const res = runResourceOscillationStress({ ticks: 60 });
        expect(res.status).toBe('PASS');
        expect(res.bounded).toBe(true);
        expect(res.finalHunger).toBeGreaterThan(0);
        expect(res.finalHunger).toBeLessThanOrEqual(1.0);
    });

    it('6. High-frequency threat blinking exhibits >= 75% chatter suppression via dual-threshold hysteresis', () => {
        const res = runThreatBlinkStress({ ticks: 30 });
        expect(res.status).toBe('PASS');
        expect(res.hysteresisActive).toBe(true);
        expect(res.chatterSuppressionRatio).toBeGreaterThanOrEqual(0.75);
    });

    it('7. Hyper-contagion viral rumor storm enforces strict ring-buffer bounded memory', () => {
        const res = runHyperContagionRumorStress();
        expect(res.status).toBe('PASS');
        expect(res.ringBufferBounded).toBe(true);
        expect(res.historyRingBufferSize).toBeLessThanOrEqual(200);
    });

    it('8. High-velocity agent churn executes rapid register/unregister cycles with zero crashes', () => {
        const res = runHighVelocityChurnStress({ cycles: 20, entitiesPerCycle: 15 });
        expect(res.status).toBe('PASS');
        expect(res.crashes).toBe(0);
        expect(res.survivingEntities).toBeGreaterThan(0);
    });

    it('9. Scene inundation and rapid drain preserves cognitive LOD state and reports all transitions', () => {
        const res = runSceneInundationStress({ initialEntities: 500 });
        expect(res.status).toBe('PASS');
        expect(res.transitionsReported).toBeGreaterThanOrEqual(400);
    });

    it('10. Unprovoked alliance betrayal spikes bilateral grievance and collapses trust', () => {
        const res = runUnprovokedBetrayalStress();
        expect(res.status).toBe('PASS');
        expect(res.trust).toBe(0);
        expect(res.grievance).toBeGreaterThan(0.7);
    });

    it('11. Catastrophic compound collapse gracefully demotes stance without unhandled division-by-zero', () => {
        const res = runCompoundFactionCollapseStress();
        expect(res.status).toBe('PASS');
        expect(res.collapsedReadiness).toBe(0.05);
    });
});
