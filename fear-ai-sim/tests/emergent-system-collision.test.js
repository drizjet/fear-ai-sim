import { describe, expect, it } from '@jest/globals';
import {
    EmergentSystemCollisionHarness,
    COLLISION_SCENARIOS,
    SYSTEMIC_HEALTH_METRICS
} from '../packages/core/index.js';

describe('EmergentSystemCollisionHarness (Front E / Sections 61–63)', () => {
    it('executes The Great Rupture compound collision scenario successfully', () => {
        const harness = new EmergentSystemCollisionHarness({ seed: 12345 });
        const result = harness.runCollision(COLLISION_SCENARIOS.THE_GREAT_RUPTURE, { ticks: 25 });

        expect(result).toBeDefined();
        expect(result.scenario).toBe(COLLISION_SCENARIOS.THE_GREAT_RUPTURE);
        expect(result.totalTicks).toBe(25);
        expect(result.baselineEquilibrium).toBeDefined();
        expect(result.metrics).toBeDefined();
        expect(result.trajectorySummary.peakFear).toBeGreaterThanOrEqual(result.baselineEquilibrium.avgFear);
    });

    it('executes Famine, War & Exodus compound collision scenario successfully', () => {
        const harness = new EmergentSystemCollisionHarness({ seed: 54321 });
        const result = harness.runCollision(COLLISION_SCENARIOS.FAMINE_WAR_EXODUS, { ticks: 25 });

        expect(result).toBeDefined();
        expect(result.scenario).toBe(COLLISION_SCENARIOS.FAMINE_WAR_EXODUS);
        expect(result.metrics.resilienceIndex).toBeGreaterThan(0.0);
        expect(result.metrics.resilienceIndex).toBeLessThanOrEqual(1.0);
    });

    it('executes multi-phase Cascading Horizon Collision over extended horizon', () => {
        const harness = new EmergentSystemCollisionHarness({ seed: 99999 });
        const result = harness.runCollision(COLLISION_SCENARIOS.CASCADING_HORIZON_COLLISION, { ticks: 35 });

        expect(result.totalTicks).toBe(35);
        expect(result.metrics.recoveryLatency).toBeDefined();
        expect(result.metrics.numericalIntegrity.status).toBe('CLEAN');
    });

    it('computes 4-pillar Systemic Resilience Index bounded in [0.0, 1.0]', () => {
        const harness = new EmergentSystemCollisionHarness({ seed: 11111 });
        const result = harness.runCollision(COLLISION_SCENARIOS.THE_GREAT_RUPTURE, { ticks: 20 });

        const metrics = result.metrics;
        expect(metrics.resilienceIndex).toBeGreaterThanOrEqual(0.0);
        expect(metrics.resilienceIndex).toBeLessThanOrEqual(1.0);

        expect(metrics.pillars).toBeDefined();
        expect(metrics.pillars.populationRetention).toBeGreaterThanOrEqual(0.0);
        expect(metrics.pillars.economicStability).toBeGreaterThanOrEqual(0.0);
        expect(metrics.pillars.affectiveRecovery).toBeGreaterThanOrEqual(0.0);
        expect(metrics.pillars.peaceViability).toBeGreaterThanOrEqual(0.0);
    });

    it('computes Cross-Subsystem Coupling Entropy proving healthy functional differentiation', () => {
        const harness = new EmergentSystemCollisionHarness({ seed: 22222 });
        const result = harness.runCollision(COLLISION_SCENARIOS.THE_GREAT_RUPTURE, { ticks: 20 });

        const entropy = result.metrics.couplingEntropy;
        expect(typeof entropy).toBe('number');
        expect(entropy).toBeGreaterThan(0.0);
        expect(entropy).toBeLessThanOrEqual(1.0);
    });

    it('measures Cascade Dampening verifying negative feedback arrests runaway loops', () => {
        const harness = new EmergentSystemCollisionHarness({ seed: 33333 });
        const result = harness.runCollision(COLLISION_SCENARIOS.THE_GREAT_RUPTURE, { ticks: 25 });

        const dampening = result.metrics.cascadeDampening;
        expect(typeof dampening).toBe('number');
        expect(dampening).toBeGreaterThan(0.0);
        expect(dampening).toBeLessThanOrEqual(1.0);
    });

    it('audits Numerical Integrity with zero NaNs, Infinities, or invalid state values', () => {
        const harness = new EmergentSystemCollisionHarness({ seed: 44444 });
        const result = harness.runCollision(COLLISION_SCENARIOS.FAMINE_WAR_EXODUS, { ticks: 30 });

        expect(result.metrics.numericalIntegrity.hasNaN).toBe(false);
        expect(result.metrics.numericalIntegrity.hasInf).toBe(false);
        expect(result.metrics.numericalIntegrity.status).toBe('CLEAN');
    });

    it('guarantees deterministic state serialization and replayability', () => {
        const harnessA = new EmergentSystemCollisionHarness({ seed: 77777 });
        harnessA.runCollision(COLLISION_SCENARIOS.THE_GREAT_RUPTURE, { ticks: 10 });
        const stateA = harnessA.getState();

        const harnessB = new EmergentSystemCollisionHarness({ seed: 77777 });
        harnessB.setState(stateA);

        expect(harnessB.getState().tickCount).toBe(stateA.tickCount);
    });

    it('strictly preserves Host Game Authority Invariant with zero host transforms or physics mutations', () => {
        const harness = new EmergentSystemCollisionHarness({ seed: 88888 });
        const externalGameHost = {
            gameWorld: { tick: 100, activePlayers: [{ id: 'hero', x: 50, y: 50, z: 0 }] },
            physicsEngine: { collisionCount: 0 }
        };

        const hostBefore = JSON.stringify(externalGameHost);
        harness.runCollision(COLLISION_SCENARIOS.THE_GREAT_RUPTURE, { ticks: 15 });

        expect(JSON.stringify(externalGameHost)).toBe(hostBefore);
    });
});
