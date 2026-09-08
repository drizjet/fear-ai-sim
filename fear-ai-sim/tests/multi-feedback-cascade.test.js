/**
 * tests/multi-feedback-cascade.test.js
 * Front E / Sections 61–65: System-of-Systems Multi-Feedback Cascade & Runaway Loop Detector.
 */

import {
    MultiFeedbackCascadeSystem,
    COUPLING_VARIABLES,
    CASCADE_PATHOLOGIES,
    CIRCUIT_BREAKER_INTERVENTIONS
} from '../packages/core/index.js';

describe('Front E / Sections 61–65: Multi-Feedback Cascade & Runaway Loop Detector', () => {
    let system;

    beforeEach(() => {
        system = new MultiFeedbackCascadeSystem();
    });

    test('1. Discovers closed feedback cycles across interconnected living-world subsystems', () => {
        const cycles = system.findFeedbackCycles();
        expect(cycles.length).toBeGreaterThanOrEqual(3);

        const cycleStrings = cycles.map(c => c.join(' -> '));
        // Check for Famine-Panic cycle
        expect(cycleStrings.some(s => s.includes(COUPLING_VARIABLES.COMMODITY_SCARCITY) && s.includes(COUPLING_VARIABLES.POPULATION_FEAR))).toBe(true);
        // Check for Retaliation cycle
        expect(cycleStrings.some(s => s.includes(COUPLING_VARIABLES.FACTION_GRIEVANCE) && s.includes(COUPLING_VARIABLES.MILITARY_ESCALATION))).toBe(true);
    });

    test('2. Calculates loop gain and distinguishes positive destabilizing vs negative stabilizing feedback', () => {
        // Evaluate the homeostatic garrison loop: Danger -> Garrison -> Danger (-1 polarity)
        const cycles = system.findFeedbackCycles();
        const garrisonCycle = cycles.find(c => c.includes(COUPLING_VARIABLES.CORRIDOR_DANGER) && c.includes(COUPLING_VARIABLES.GARRISON_STRENGTH));
        expect(garrisonCycle).toBeDefined();

        const evaluation = system.evaluateCycleGain(garrisonCycle);
        expect(evaluation.netPolarity).toBe(-1); // Negative feedback
        expect(evaluation.isPositiveFeedback).toBe(false);
        expect(evaluation.isRunaway).toBe(false); // Stabilizing loop
    });

    test('3. Detects Famine-Panic Runaway Loop with loop gain G > 1.0', () => {
        const cycles = system.findFeedbackCycles();
        const famineCycle = cycles.find(c => c.includes(COUPLING_VARIABLES.COMMODITY_SCARCITY) && c.includes(COUPLING_VARIABLES.POPULATION_FEAR));
        expect(famineCycle).toBeDefined();

        const evaluation = system.evaluateCycleGain(famineCycle);
        // Scarcity (1.25) * Price (0.85) * Fear (1.10) = 1.16875 > 1.0
        expect(evaluation.isPositiveFeedback).toBe(true);
        expect(evaluation.loopGain).toBeGreaterThan(1.0);
        expect(evaluation.isRunaway).toBe(true);
    });

    test('4. Diagnoses active cascade pathologies and triggers targeted advisory circuit breakers', () => {
        const diagnosis = system.diagnoseRunawayCascades();
        expect(diagnosis.isSystemStable).toBe(false);
        expect(diagnosis.runawayLoopCount).toBeGreaterThanOrEqual(2);

        const faminePathology = diagnosis.detectedPathologies.find(p => p.pathology === CASCADE_PATHOLOGIES.RUNAWAY_FAMINE_PANIC_CASCADE);
        expect(faminePathology).toBeDefined();
        expect(faminePathology.severity).toBeGreaterThan(0.5);

        const warPathology = diagnosis.detectedPathologies.find(p => p.pathology === CASCADE_PATHOLOGIES.PERPETUAL_RETALIATION_WAR_VORTEX);
        expect(warPathology).toBeDefined();

        // Verify circuit breaker interventions
        const grainBreaker = diagnosis.recommendedCircuitBreakers.find(b => b.intervention === CIRCUIT_BREAKER_INTERVENTIONS.INJECT_STRATEGIC_GRAIN_RESERVE);
        expect(grainBreaker).toBeDefined();
        expect(grainBreaker.targetSubsystem).toBe('ECONOMY');
        expect(grainBreaker.targetGainReduction).toBeGreaterThan(0.2);

        const truceBreaker = diagnosis.recommendedCircuitBreakers.find(b => b.intervention === CIRCUIT_BREAKER_INTERVENTIONS.BROKER_TEMPORARY_CEASEFIRE_SUMMIT);
        expect(truceBreaker).toBeDefined();
        expect(truceBreaker.targetSubsystem).toBe('DIPLOMACY');
    });

    test('5. Restores macro stability when coupling gains are dampened below runaway threshold', () => {
        // Create custom system with dampened parameters
        const stableSystem = new MultiFeedbackCascadeSystem();
        stableSystem.couplingEdges.clear();

        // Weak coupling: Scarcity(0.8) -> Price(0.7) -> Fear(0.6) -> Loop Gain = 0.336 < 1.0
        stableSystem.addCouplingEdge(COUPLING_VARIABLES.COMMODITY_SCARCITY, COUPLING_VARIABLES.MARKET_PRICE, 0.80, 1);
        stableSystem.addCouplingEdge(COUPLING_VARIABLES.MARKET_PRICE, COUPLING_VARIABLES.POPULATION_FEAR, 0.70, 1);
        stableSystem.addCouplingEdge(COUPLING_VARIABLES.POPULATION_FEAR, COUPLING_VARIABLES.COMMODITY_SCARCITY, 0.60, 1);

        const diagnosis = stableSystem.diagnoseRunawayCascades();
        expect(diagnosis.isSystemStable).toBe(true);
        expect(diagnosis.runawayLoopCount).toBe(0);
        expect(diagnosis.detectedPathologies).toHaveLength(0);
    });

    test('6. Strictly preserves Host Game Authority Invariant during telemetry evaluation', () => {
        const hostTelemetry = {
            tick: 105,
            settlementStockpiles: { Food: 42.0, Timber: 18.5 },
            factionGrievances: { 'Bandits->Alliance': 0.85 },
            activeEncounters: [{ type: 'RAID', intensity: 0.7 }]
        };

        const isUnmutated = system.validateHostAuthorityInvariant(hostTelemetry);
        expect(isUnmutated).toBe(true);
        expect(hostTelemetry.settlementStockpiles.Food).toBe(42.0);
        expect(hostTelemetry.tick).toBe(105);
    });
});
