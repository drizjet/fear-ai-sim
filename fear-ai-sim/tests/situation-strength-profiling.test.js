import { describe, it, expect } from '@jest/globals';
import {
    SituationStrengthProfiler,
    SITUATION_STRENGTH_LEVELS,
    AFFORDANCE_DIMENSIONS,
    SITUATION_PATHOLOGIES,
    AffectiveAgent,
    CANONICAL_PRESETS
} from '../packages/core/index.js';

describe('Front B / Sections 15–16: Opportunity-Normalized Behavioral Metrics & Situation-Strength Profiling', () => {
    it('1. Calculates Mischel Situation Strength score and discrete classification', () => {
        const profiler = new SituationStrengthProfiler();

        const weakSituation = profiler.calculateSituationStrength({
            clarity: 0.15,
            consistency: 0.20,
            constraints: 0.10,
            consequences: 0.10
        });
        expect(weakSituation.level).toBe(SITUATION_STRENGTH_LEVELS.WEAK);
        expect(weakSituation.score).toBeLessThan(0.35);

        const moderateSituation = profiler.calculateSituationStrength({
            clarity: 0.50,
            consistency: 0.50,
            constraints: 0.50,
            consequences: 0.50
        });
        expect(moderateSituation.level).toBe(SITUATION_STRENGTH_LEVELS.MODERATE);
        expect(moderateSituation.score).toBeGreaterThanOrEqual(0.35);
        expect(moderateSituation.score).toBeLessThan(0.70);

        const strongSituation = profiler.calculateSituationStrength({
            clarity: 0.90,
            consistency: 0.85,
            constraints: 0.80,
            consequences: 0.95
        });
        expect(strongSituation.level).toBe(SITUATION_STRENGTH_LEVELS.STRONG);
        expect(strongSituation.score).toBeGreaterThanOrEqual(0.70);
    });

    it('2. Demonstrates that opportunity normalization isolates true behavioral propensity over raw counts', () => {
        const profiler = new SituationStrengthProfiler();

        // Agent A: Exposed to 50 danger ticks, performs 10 flight actions -> rate = 0.20
        for (let i = 0; i < 50; i++) {
            const isFlightAction = i < 10;
            profiler.recordTick('agent_A', {
                type: isFlightAction ? 'FLEE_FROM' : 'IDLE_VIGILANT'
            }, {
                threats: [{ id: 'threat_1', distance: 15 }]
            });
        }

        // Agent B: Exposed to 2 danger ticks, performs 2 flight actions -> rate = 1.00
        for (let i = 0; i < 2; i++) {
            profiler.recordTick('agent_B', {
                type: 'FLEE_FROM'
            }, {
                threats: [{ id: 'threat_1', distance: 15 }]
            });
        }
        // Agent B also has 48 calm ticks with no threat
        for (let i = 0; i < 48; i++) {
            profiler.recordTick('agent_B', {
                type: 'CAUTIOUS_EXPLORE'
            }, {
                threats: []
            });
        }

        const ratesA = profiler.getOpportunityNormalizedRates('agent_A');
        const ratesB = profiler.getOpportunityNormalizedRates('agent_B');

        // Raw count shows Agent A had 10 flight actions vs Agent B had 2 flight actions
        expect(ratesA.dimensions[AFFORDANCE_DIMENSIONS.FLIGHT].actionCount).toBe(10);
        expect(ratesB.dimensions[AFFORDANCE_DIMENSIONS.FLIGHT].actionCount).toBe(2);

        // Opportunity-normalized rate correctly identifies Agent B as 100% flight propensity and Agent A as only 20%
        expect(ratesA.dimensions[AFFORDANCE_DIMENSIONS.FLIGHT].normalizedRate).toBe(0.20);
        expect(ratesB.dimensions[AFFORDANCE_DIMENSIONS.FLIGHT].normalizedRate).toBe(1.00);
        expect(ratesB.dimensions[AFFORDANCE_DIMENSIONS.FLIGHT].normalizedRate).toBeGreaterThan(
            ratesA.dimensions[AFFORDANCE_DIMENSIONS.FLIGHT].normalizedRate
        );
    });

    it('3. Situation-Strength Compression Theorem: Extreme threat compresses cross-persona behavioral variance', () => {
        const profiler = new SituationStrengthProfiler();

        // Instantiate diverse cohort
        const presets = [
            CANONICAL_PRESETS.COWARDLY_CIVILIAN,
            CANONICAL_PRESETS.STOIC_VETERAN,
            CANONICAL_PRESETS.RECKLESS_RAIDER,
            CANONICAL_PRESETS.CHARISMATIC_LEADER,
            CANONICAL_PRESETS.CAUTIOUS_MERCHANT
        ];

        const weakAgents = presets.map((p, i) => new AffectiveAgent(`agent_${p.id}`, p.traits, { x: i * 5, y: 0 }));
        const strongAgents = presets.map((p, i) => new AffectiveAgent(`agent_${p.id}`, p.traits, { x: i * 5, y: 0 }));

        const weakConfig = {
            clarity: 0.20,
            consistency: 0.20,
            constraints: 0.15,
            consequences: 0.10,
            threatPressure: 0.05,
            ambientSoundIntensity: 0.40,
            anomaliesPresent: true
        };

        const strongConfig = {
            clarity: 0.95,
            consistency: 0.90,
            constraints: 0.85,
            consequences: 0.95,
            threatPressure: 0.90,
            threatDistance: 3.0,
            threatIntensity: 0.95
        };

        const weakResult = profiler.evaluateCohort(weakAgents, weakConfig, 25, 42);
        const strongResult = profiler.evaluateCohort(strongAgents, strongConfig, 25, 42);

        const compression = profiler.evaluateCompression(weakResult, strongResult);

        // Verification of Mischel's Theorem:
        expect(weakResult.situationStrength.level).toBe(SITUATION_STRENGTH_LEVELS.WEAK);
        expect(strongResult.situationStrength.level).toBe(SITUATION_STRENGTH_LEVELS.STRONG);
        expect(weakResult.meanBehavioralVariance).toBeGreaterThan(0.01);
        expect(compression.isCompressed).toBe(true);
        expect(compression.compressionRatio).toBeLessThan(0.50); // Greater than 50% compression
    });

    it('4. Reversible Trait Restoration Protocol: Constraint release restores behavioral profile with zero trait drift', () => {
        const profiler = new SituationStrengthProfiler();

        const presets = [
            CANONICAL_PRESETS.COWARDLY_CIVILIAN,
            CANONICAL_PRESETS.STOIC_VETERAN,
            CANONICAL_PRESETS.RECKLESS_RAIDER,
            CANONICAL_PRESETS.CHARISMATIC_LEADER
        ];

        const agents = presets.map((p, i) => new AffectiveAgent(`rev_agent_${p.id}`, p.traits, { x: i * 8, y: 0 }));

        const weakConfig = {
            clarity: 0.20,
            consistency: 0.20,
            constraints: 0.15,
            consequences: 0.10,
            threatPressure: 0.05,
            ambientSoundIntensity: 0.35,
            anomaliesPresent: true
        };

        const strongConfig = {
            clarity: 0.90,
            consistency: 0.90,
            constraints: 0.85,
            consequences: 0.90,
            threatPressure: 0.85,
            threatDistance: 4.0,
            threatIntensity: 0.90
        };

        const result = profiler.runReversibilityProtocol(agents, weakConfig, strongConfig, 20);

        // Trait Integrity Invariant
        expect(result.traitDrift).toBe(0.0);
        expect(result.traitIntegrityPreserved).toBe(true);

        // High-Fidelity Recovery
        expect(result.restorationFidelityCorrelation).toBeGreaterThanOrEqual(0.90);
        expect(result.restorationSucceeded).toBe(true);
        expect(result.recoveryRatio).toBeGreaterThan(0.70);
    });

    it('5. Computes Shannon Intent Entropy demonstrating behavioral focus under acute pressure', () => {
        const profiler = new SituationStrengthProfiler();

        // Agent with uniform distribution across 4 intents
        const uniformDist = {
            IDLE_VIGILANT: 0.25,
            CAUTIOUS_EXPLORE: 0.25,
            INVESTIGATE_SOUND: 0.25,
            APPROACH_ALLY: 0.25
        };
        const entropyUniform = profiler.calculateEntropy(uniformDist);
        expect(entropyUniform).toBeCloseTo(2.0, 2); // log2(4) = 2.0 bits

        // Agent under acute constraint: 95% FLEE_FROM, 5% SEEK_COVER
        const focusedDist = {
            FLEE_FROM: 0.95,
            SEEK_COVER: 0.05
        };
        const entropyFocused = profiler.calculateEntropy(focusedDist);
        expect(entropyFocused).toBeLessThan(0.40);
        expect(entropyFocused).toBeLessThan(entropyUniform);
    });

    it('6. Situation Pathology Detector flags unresponsiveness and un-normalized metric anomalies', () => {
        const profiler = new SituationStrengthProfiler();

        const unreactiveAgent = new AffectiveAgent('broken_npc', {
            fear: 0.0,
            neuroticism: 0.0,
            resilience: 1.0,
            openness: 1.0
        });

        // Artificially simulate an unreactive agent that only investigates during strong lethal duress
        const artificialCohort = {
            situationStrength: {
                level: SITUATION_STRENGTH_LEVELS.STRONG,
                score: 0.88
            },
            agentProfiles: [
                {
                    agentId: 'broken_npc',
                    dimensions: {
                        [AFFORDANCE_DIMENSIONS.FLIGHT]: { actionCount: 0, opportunityCount: 30, normalizedRate: 0.0 },
                        [AFFORDANCE_DIMENSIONS.CONFRONTATION]: { actionCount: 0, opportunityCount: 30, normalizedRate: 0.0 },
                        [AFFORDANCE_DIMENSIONS.INVESTIGATION]: { actionCount: 25, opportunityCount: 30, normalizedRate: 0.8333 }
                    }
                },
                {
                    agentId: 'distorted_metric_npc',
                    dimensions: {
                        [AFFORDANCE_DIMENSIONS.HELPING]: { actionCount: 5, opportunityCount: 0, normalizedRate: 0.0 }
                    }
                }
            ]
        };

        const pathologies = profiler.detectPathologies(artificialCohort);

        const unresponsive = pathologies.find(p => p.type === SITUATION_PATHOLOGIES.UNRESPONSIVE_TO_SITUATION_STRENGTH);
        expect(unresponsive).toBeDefined();
        expect(unresponsive.severity).toBe('CRITICAL');
        expect(unresponsive.agentId).toBe('broken_npc');

        const distorted = pathologies.find(p => p.type === SITUATION_PATHOLOGIES.UNNORMALIZED_METRIC_DISTORTION);
        expect(distorted).toBeDefined();
        expect(distorted.severity).toBe('WARNING');
        expect(distorted.agentId).toBe('distorted_metric_npc');
    });

    it('7. Strictly preserves Host Game Authority Invariant during profiling', () => {
        const profiler = new SituationStrengthProfiler();
        const agent = new AffectiveAgent('authority_check_npc', CANONICAL_PRESETS.STOIC_VETERAN.traits, {
            x: 100.0,
            y: 200.0,
            z: 0.0
        });

        const initialX = agent.x;
        const initialY = agent.y;
        const initialZ = agent.z;

        profiler.evaluateCohort([agent], {
            clarity: 0.8,
            consistency: 0.8,
            constraints: 0.8,
            consequences: 0.8,
            threatPressure: 0.8,
            threatDistance: 5.0,
            threatIntensity: 0.8
        }, 10, 999);

        // Host engine owns spatial coordinates: agent coordinates are strictly preserved
        expect(agent.x).toBe(initialX);
        expect(agent.y).toBe(initialY);
        expect(agent.z).toBe(initialZ);
    });
});
