import { describe, it, expect } from '@jest/globals';
import {
    TraumaCrystallizationEngine,
    PhobicTriggerRegistry,
    TRAUMA_TYPES,
    TRAUMA_STAGES,
    PHOBIC_CATEGORIES
} from '../packages/core/index.js';

describe('Front B / Sections 12–14: Diachronic Persona Mutation & Trauma Crystallization Engine', () => {
    describe('1. 4-Stage Trauma Lifecycle & Consolidation', () => {
        it('advances through ACUTE_SHOCK -> SENSITIZATION_WINDOW -> CONSOLIDATION_LOCKING -> CRYSTALLIZED_MUTATION', () => {
            const engine = new TraumaCrystallizationEngine({ sensitizationWindowTicks: 50 });
            engine.registerAgent('agent_1', {
                neuroticism: 0.20,
                resilience: 0.80,
                agreeableness: 0.60
            });

            const trauma = engine.incurTrauma('agent_1', {
                traumaType: TRAUMA_TYPES.NEAR_DEATH_SURVIVAL,
                severity: 0.90,
                description: 'Surviving lethal ambush'
            });

            expect(trauma.stage).toBe(TRAUMA_STAGES.ACUTE_SHOCK);

            // Tick 20: transitions to SENSITIZATION_WINDOW
            engine.tick(20);
            const active1 = engine.agentRecords.get('agent_1').activeTraumas[0];
            expect(active1.stage).toBe(TRAUMA_STAGES.SENSITIZATION_WINDOW);

            // Advance 50 more ticks -> past sensitization window to CONSOLIDATION_LOCKING
            engine.tick(50);
            const active2 = engine.agentRecords.get('agent_1').activeTraumas[0];
            expect(active2.stage).toBe(TRAUMA_STAGES.CONSOLIDATION_LOCKING);

            // Advance 30 ticks -> crystallizes into permanent mutation
            engine.tick(30);
            const rec = engine.agentRecords.get('agent_1');
            expect(rec.activeTraumas.length).toBe(0);
            expect(rec.crystallizedTraumas.length).toBe(1);
            expect(rec.crystallizedTraumas[0].stage).toBe(TRAUMA_STAGES.CRYSTALLIZED_MUTATION);
        });
    });

    describe('2. Diachronic Personality Remodeling', () => {
        it('permanently mutates neuroticism, resilience, hyper-vigilance floor, and panic threshold', () => {
            const engine = new TraumaCrystallizationEngine({ sensitizationWindowTicks: 25 });
            engine.registerAgent('veteran_1', {
                neuroticism: 0.15,
                resilience: 0.90,
                agreeableness: 0.50
            });

            engine.incurTrauma('veteran_1', {
                traumaType: TRAUMA_TYPES.NEAR_DEATH_SURVIVAL,
                severity: 0.85
            });

            // Fast forward through stages to crystallization (20 + 25 + 30 = 75 ticks)
            engine.tick(80);

            const state = engine.evaluateAgentState('veteran_1');
            expect(state.isTraumatized).toBe(true);

            // Neuroticism should shift upward significantly (drift formula: +0.40 * 0.85 * (1 - 0.15) ≈ +0.289)
            expect(state.traits.neuroticism).toBeGreaterThan(0.40);

            // Resilience should erode: -0.35 * 0.85 * 0.90 ≈ -0.267
            expect(state.traits.resilience).toBeLessThan(0.70);

            // Chronic hyper-vigilance floor must be elevated from 0.0
            expect(state.effectiveRestingFear).toBeGreaterThan(0.15);

            // Recovery half-life multiplier should be significantly expanded (slower recovery)
            expect(state.effectiveRecoveryMultiplier).toBeGreaterThan(1.8);

            // Panic threshold depression offset
            expect(state.effectivePanicThresholdOffset).toBeGreaterThan(0.10);
        });

        it('specifically erodes agreeableness and induces social paranoia following betrayal trauma', () => {
            const engine = new TraumaCrystallizationEngine({ sensitizationWindowTicks: 10 });
            engine.registerAgent('loyal_knight', {
                agreeableness: 0.80,
                neuroticism: 0.25,
                resilience: 0.75
            });

            engine.incurTrauma('loyal_knight', {
                traumaType: TRAUMA_TYPES.BETRAYAL_ABANDONMENT,
                severity: 0.90,
                description: 'Betrayed and stabbed in back by trusted commander'
            });

            engine.tick(70); // allow crystallization

            const state = engine.evaluateAgentState('loyal_knight');
            // Agreeableness should have dropped substantially
            expect(state.traits.agreeableness).toBeLessThan(0.55);
        });
    });

    describe('3. Phobic Trigger Registry & Conditioned Dread', () => {
        it('conditions phobic triggers and evokes acute dread and repulsive avoidance vectors', () => {
            const engine = new TraumaCrystallizationEngine();
            engine.registerAgent('scout_1');

            engine.incurTrauma('scout_1', {
                traumaType: TRAUMA_TYPES.NEAR_DEATH_SURVIVAL,
                severity: 0.85,
                associatedCues: [
                    { category: PHOBIC_CATEGORIES.DAMAGE_TYPE, cue: 'FIRE' },
                    { category: PHOBIC_CATEGORIES.PREDATOR_TYPE, cue: 'WOLF' }
                ]
            });

            const agentPos = { x: 10.0, y: 0.0, z: 10.0 };

            // Scenario A: Observer senses fire nearby at x=15, z=10
            const fireObservation = {
                sensoryCues: [
                    { category: PHOBIC_CATEGORIES.DAMAGE_TYPE, cue: 'FIRE', intensity: 1.0, position: { x: 15.0, y: 0.0, z: 10.0 } }
                ],
                position: agentPos
            };

            const stateA = engine.evaluateAgentState('scout_1', fireObservation);
            expect(stateA.phobicDread).toBeGreaterThan(0.40);
            expect(stateA.triggeredPhobias.length).toBe(1);
            expect(stateA.triggeredPhobias[0].cue).toBe('FIRE');
            expect(stateA.hasFlashback).toBe(true);

            // Avoidance vector should point directly away from fire: from (15, 10) to (10, 10) -> vector X < 0
            expect(stateA.avoidanceVector).not.toBeNull();
            expect(stateA.avoidanceVector.x).toBeLessThan(0);

            // Scenario B: Observer senses neutral cues (e.g. WATER or DEER)
            const neutralObservation = {
                sensoryCues: [
                    { category: PHOBIC_CATEGORIES.ENVIRONMENT_CUE, cue: 'RAIN' }
                ],
                position: agentPos
            };

            const stateB = engine.evaluateAgentState('scout_1', neutralObservation);
            expect(stateB.phobicDread).toBe(0.0);
            expect(stateB.triggeredPhobias.length).toBe(0);
            expect(stateB.avoidanceVector).toBeNull();
        });
    });

    describe('4. Solace Mitigation: Defusing Trauma Before Locking', () => {
        it('aborts crystallization if agent receives adequate solace during sensitization window', () => {
            const engine = new TraumaCrystallizationEngine({ sensitizationWindowTicks: 40, solaceThreshold: 0.50 });
            engine.registerAgent('civilian_1', { neuroticism: 0.30, resilience: 0.70 });

            engine.incurTrauma('civilian_1', {
                traumaType: TRAUMA_TYPES.MASSACRE_HORROR,
                severity: 0.80
            });

            // Advance into sensitization window
            engine.tick(25);

            // Administer sanctuary solace and peer comfort
            engine.administerSolace('civilian_1', 0.60, 'TEMPLE_SANCTUARY');

            // Advance simulation further
            engine.tick(60);

            const rec = engine.agentRecords.get('civilian_1');
            // Trauma was resolved without locking into permanent mutation!
            expect(rec.crystallizedTraumas.length).toBe(0);
            expect(rec.currentTraits.neuroticism).toBeCloseTo(0.30, 2);
            expect(rec.currentTraits.resilience).toBeCloseTo(0.70, 2);
            expect(rec.quiescentFearFloor).toBe(0.0);
        });
    });

    describe('5. Clinical Extinction & Asymptotic Trait Restoration', () => {
        it('asymptotically restores mutated traits under protracted safe sanctuary conditions', () => {
            const engine = new TraumaCrystallizationEngine({
                sensitizationWindowTicks: 20,
                extinctionRate: 0.02
            });
            engine.registerAgent('patient_1', { neuroticism: 0.20, resilience: 0.80 });

            engine.incurTrauma('patient_1', {
                traumaType: TRAUMA_TYPES.NEAR_DEATH_SURVIVAL,
                severity: 0.90
            });

            // Allow crystallization
            engine.tick(70);

            const peakMutated = engine.evaluateAgentState('patient_1');
            const peakNeuroticism = peakMutated.traits.neuroticism;
            expect(peakNeuroticism).toBeGreaterThan(0.40);
            expect(peakMutated.effectiveRestingFear).toBeGreaterThan(0.20);

            // Now provide 300 ticks of calm sanctuary without trauma
            engine.tick(300);

            const rehabilitated = engine.evaluateAgentState('patient_1');
            // Neuroticism and resting fear should have decayed back towards baseline
            expect(rehabilitated.traits.neuroticism).toBeLessThan(peakNeuroticism);
            expect(rehabilitated.effectiveRestingFear).toBeLessThan(peakMutated.effectiveRestingFear);
        });
    });

    describe('6. Replay Determinism & Snapshot Parity', () => {
        it('restores bit-exact internal state across save snapshots', () => {
            const engineA = new TraumaCrystallizationEngine();
            engineA.registerAgent('hero_a', { neuroticism: 0.25, resilience: 0.75 });

            engineA.incurTrauma('hero_a', {
                traumaType: TRAUMA_TYPES.NEAR_DEATH_SURVIVAL,
                severity: 0.80,
                associatedCues: [{ category: PHOBIC_CATEGORIES.DAMAGE_TYPE, cue: 'ACID' }]
            });
            engineA.tick(35);

            const snapshot = engineA.getState();

            const engineB = new TraumaCrystallizationEngine();
            engineB.setState(snapshot);

            expect(engineB.currentTick).toBe(35);
            const stateA = engineA.evaluateAgentState('hero_a');
            const stateB = engineB.evaluateAgentState('hero_a');

            expect(stateB.traits.neuroticism).toBe(stateA.traits.neuroticism);
            expect(stateB.effectiveRestingFear).toBe(stateA.effectiveRestingFear);
            expect(stateB.effectiveRecoveryMultiplier).toBe(stateA.effectiveRecoveryMultiplier);
        });
    });
});
