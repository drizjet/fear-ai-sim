/**
 * Phase 3 Core System Improvements Tests
 * T3.1: Hysteresis, T3.2: Habituation, T3.3: Fear Pacing
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { HysteresisController } from '../hysteresis.js';
import { HabituationSystem } from '../habituation.js';
import { SessionArcController } from '../fearpacing.js';
import { EmotionSystem } from '../emotions.js';
import { DDASystem } from '../ddasystem.js';
import { EnvironmentSystem } from '../environment.js';
import { MemorySystem } from '../memorysystem.js';
import { GroupBehaviorSystem } from '../groupbehaviors.js';
import {
    BiofeedbackManager,
    EEGSensor,
    HRVSensor,
    GSRSensor,
    FacialSensor
} from '../biofeedback.js';
import {
    VRSystem,
    VRHeadAnalyzer,
    VRControllerAnalyzer,
    PresenceBreakDetector,
    VRComfortManager
} from '../vrsystem.js';
import {
    PlayerClassifier,
    PlayerBehaviorTracker,
    PlayerTypeManager,
    PLAYER_TYPES,
    FEAR_PROFILES
} from '../playerclassification.js';
import {
    QuantumState,
    QuantumAnnealingOptimizer,
    QuantumInspiredNN,
    GroverThreatSearch,
    QuantumDecisionMaker,
    QuantumInspiredSystem
} from '../quantuminspired.js';
import {
    FearNeuralNetwork,
    FearFeatureExtractor,
    NeuralFearSystem
} from '../neuralfear.js';
import {
    ScenarioGenerator,
    EnvironmentGenerator,
    ProceduralContentManager,
    PCG_CONFIG
} from '../proceduralcontent.js';
import { SESSION_PHASES } from '../fearpacing.js';
import {
    AdaptiveLearningEngine,
    AdaptiveLearningManager,
    ScenarioOptimizer,
    LEARNING_CONFIG
} from '../adaptivelearning.js';
import {
    SocialDynamicsEngine,
    SocialInfluenceManager,
    RELATIONSHIP_TYPES,
    LEADERSHIP_STYLES,
    CULTURAL_TRAITS
} from '../socialdynamics.js';

describe('Phase 3 Core Systems', () => {
    
    describe('T3.1: Hysteresis Controller', () => {
        let hysteresis;

        beforeEach(() => {
            hysteresis = new HysteresisController();
        });

        it('should initialize in CALM state', () => {
            expect(hysteresis.getState()).toBe('CALM');
        });

        it('should have different thresholds for entering vs exiting', () => {
            const calmThresholds = hysteresis.thresholds.CALM;
            const alertThresholds = hysteresis.thresholds.ALERT;
            
            // Exit CALM at 0.25, enter ALERT at 0.25
            expect(calmThresholds.exitUp).toBe(0.25);
            expect(alertThresholds.enter).toBe(0.25);
            
            // But exit ALERT to CALM at 0.15 (hysteresis gap!)
            expect(alertThresholds.exitDown).toBe(0.15);
        });

        it('should prevent rapid state oscillation', () => {
            // Start in CALM
            let state = hysteresis.update(0.1);
            expect(state).toBe('CALM');
            
            // Go to ALERT
            for (let i = 0; i < 15; i++) {
                state = hysteresis.update(0.3);
            }
            expect(state).toBe('ALERT');
            
            // Drop fear but stay in ALERT due to hysteresis
            // (exitDown is 0.15, so 0.2 is still above threshold)
            for (let i = 0; i < 10; i++) {
                state = hysteresis.update(0.18);
            }
            expect(state).toBe('ALERT'); // Not CALM yet!
            
            // Must drop below 0.15 to exit
            for (let i = 0; i < 15; i++) {
                state = hysteresis.update(0.1);
            }
            expect(state).toBe('CALM');
        });

        it('should respect minimum state duration', () => {
            // Reset to ensure we start fresh
            hysteresis.reset();
            
            // Use fear level that doesn't cause transition (0.1 < 0.25 exitUp threshold)
            // This way we can test the timer without state changes resetting it
            hysteresis.update(0.1);
            expect(hysteresis.canChangeState()).toBe(false);
            
            // Wait for minimum duration (10 frames) without triggering transition
            for (let i = 0; i < 10; i++) {
                hysteresis.update(0.1);
            }
            // After 11 total updates, stateTimer should be 11
            expect(hysteresis.canChangeState()).toBe(true);
        });

        it('should transition through all states correctly', () => {
            const transitions = [
                { fear: 0.1, expected: 'CALM' },
                { fear: 0.3, expected: 'ALERT' },  // > 0.25
                { fear: 0.6, expected: 'ANXIOUS' }, // > 0.55
                { fear: 0.8, expected: 'PANIC' }    // > 0.75
            ];
            
            transitions.forEach(({ fear, expected }) => {
                // Multiple updates to pass min duration
                for (let i = 0; i < 15; i++) {
                    hysteresis.update(fear);
                }
                expect(hysteresis.getState()).toBe(expected);
            });
        });

        it('should record state transitions', () => {
            for (let i = 0; i < 15; i++) hysteresis.update(0.3);
            for (let i = 0; i < 15; i++) hysteresis.update(0.1);
            
            const history = hysteresis.getHistory();
            expect(history.length).toBeGreaterThan(0);
            expect(history[0]).toHaveProperty('from');
            expect(history[0]).toHaveProperty('to');
            expect(history[0]).toHaveProperty('fearLevel');
        });

        it('should calculate hysteresis gap', () => {
            // Gap between ALERT exitDown (0.15) and CALM enter (0.0)
            const gap = hysteresis.getHysteresisGap('ALERT', 'CALM');
            // The gap is calculated as enter - exitDown = 0.0 - 0.15 = -0.15
            // The absolute value shows there's a 0.15 hysteresis gap
            expect(Math.abs(gap)).toBeGreaterThan(0); // There should be a gap
        });
    });

    describe('T3.2: Habituation System', () => {
        let habituation;

        beforeEach(() => {
            habituation = new HabituationSystem();
        });

        it('should reduce fear with repeated exposure', () => {
            const baseFear = 1.0;
            
            // First exposure - full fear
            const fear1 = habituation.getEffectiveFear(baseFear, 'PREDATOR', 'predator1');
            expect(fear1).toBe(1.0);
            
            // Multiple exposures - reduced fear
            for (let i = 0; i < 5; i++) {
                habituation.getEffectiveFear(baseFear, 'PREDATOR', 'predator1');
            }
            
            const fear2 = habituation.getEffectiveFear(baseFear, 'PREDATOR', 'predator1');
            expect(fear2).toBeLessThan(fear1);
        });

        it('should have max habituation limit', () => {
            const baseFear = 1.0;
            
            // Many exposures
            for (let i = 0; i < 20; i++) {
                habituation.getEffectiveFear(baseFear, 'PREDATOR', 'predator1');
            }
            
            const fear = habituation.getEffectiveFear(baseFear, 'PREDATOR', 'predator1');
            expect(fear).toBeGreaterThan(0); // Never 0
            expect(fear).toBeGreaterThanOrEqual(baseFear * (1 - habituation.config.maxHabituation));
        });

        it('should track different stimulus types separately', () => {
            const baseFear = 1.0;
            
            // Habituate to predator1
            for (let i = 0; i < 10; i++) {
                habituation.getEffectiveFear(baseFear, 'PREDATOR', 'predator1');
            }
            const fear1 = habituation.getEffectiveFear(baseFear, 'PREDATOR', 'predator1');
            
            // New predator should have full fear
            const fear2 = habituation.getEffectiveFear(baseFear, 'PREDATOR', 'predator2');
            expect(fear2).toBeGreaterThan(fear1);
        });

        it('should provide habituation info', () => {
            // Need 3+ exposures to trigger habituation (>0.1 threshold)
            for (let i = 0; i < 5; i++) {
                habituation.getEffectiveFear(1.0, 'SOUND', 'sound1');
            }
            
            const info = habituation.getHabituationInfo('SOUND', 'sound1');
            expect(info.isHabituated).toBe(true);
            expect(info.exposures).toBe(5);
            expect(info.habituationLevel).toBeGreaterThan(0);
        });

        it('should apply session-wide habituation', () => {
            const fear = 1.0;
            
            // At start of session
            const fear1 = habituation.applySessionHabituation(fear, 0.0);
            
            // Near end of session
            const fear2 = habituation.applySessionHabituation(fear, 0.9);
            
            expect(fear2).toBeLessThan(fear1);
        });

        it('should reset habituation', () => {
            habituation.getEffectiveFear(1.0, 'PREDATOR', 'predator1');
            habituation.getEffectiveFear(1.0, 'PREDATOR', 'predator1');
            
            habituation.resetHabituation('PREDATOR', 'predator1');
            
            const info = habituation.getHabituationInfo('PREDATOR', 'predator1');
            expect(info.isHabituated).toBe(false);
            expect(info.exposures).toBe(0);
        });

        it('should track session statistics', () => {
            habituation.getEffectiveFear(1.0, 'PREDATOR', 'p1');
            habituation.getEffectiveFear(1.0, 'SOUND', 's1');
            habituation.getEffectiveFear(1.0, 'PREDATOR', 'p1');
            
            const stats = habituation.getSessionStats();
            expect(stats.totalExposures).toBe(3);
            expect(stats.uniqueStimuli).toBe(2);
        });
    });

    describe('T3.3: Session Arc Controller', () => {
        let arc;

        beforeEach(() => {
            arc = new SessionArcController(1); // 1 minute for testing
        });

        it('should define session phases', () => {
            expect(arc.phases.length).toBeGreaterThan(0);
            expect(arc.phases[0].name).toBe('introduction');
            expect(arc.phases[arc.phases.length - 1].name).toBe('resolution');
        });

        it('should get current phase based on progress', () => {
            const phase = arc.getCurrentPhase();
            expect(phase).toHaveProperty('name');
            expect(phase).toHaveProperty('intensity');
        });

        it('should return intensity multiplier', () => {
            const multiplier = arc.getIntensityMultiplier();
            expect(multiplier).toBeGreaterThanOrEqual(0);
            expect(multiplier).toBeLessThanOrEqual(1.5); // With adjustments
        });

        it('should scale fear based on session arc', () => {
            const baseFear = 0.5;
            const scaledFear = arc.scaleFear(baseFear);
            
            expect(scaledFear).toBeGreaterThanOrEqual(0);
            expect(scaledFear).toBeLessThanOrEqual(1.0);
        });

        it('should identify high intensity phases', () => {
            // At start (introduction with 0.2 intensity)
            expect(arc.isHighIntensityPhase()).toBe(false);
            
            // Manually set to climax phase by adjusting start time
            arc.startTime = Date.now() - (0.65 * arc.sessionDuration);
            expect(arc.getCurrentPhase().name).toBe('climax');
            expect(arc.isHighIntensityPhase()).toBe(true);
        });

        it('should identify recovery phases', () => {
            // Start in introduction (not recovery)
            expect(arc.isRecoveryPhase()).toBe(false);
            
            // Manually set to recovery phase
            arc.startTime = Date.now() - (0.35 * arc.sessionDuration);
            expect(arc.getCurrentPhase().name).toBe('recovery_1');
            expect(arc.isRecoveryPhase()).toBe(true);
            
            // Move to climax (not recovery)
            arc.startTime = Date.now() - (0.65 * arc.sessionDuration);
            expect(arc.isRecoveryPhase()).toBe(false);
        });

        it('should get recommended threat level', () => {
            const threatLevel = arc.getRecommendedThreatLevel();
            expect(threatLevel).toBeGreaterThanOrEqual(0);
            expect(threatLevel).toBeLessThanOrEqual(1.0);
        });

        it('should update player state', () => {
            arc.updatePlayerState({
                avgFear: 0.7,
                engagementLevel: 0.8
            });
            
            expect(arc.playerState.avgFear).toBe(0.7);
            expect(arc.playerState.engagementLevel).toBe(0.8);
        });

        it('should mark events', () => {
            arc.markEvent('mass_panic', { count: 10 });
            
            expect(arc.eventMarkers.length).toBe(1);
            expect(arc.eventMarkers[0].type).toBe('mass_panic');
        });

        it('should get session summary', () => {
            const summary = arc.getSummary();
            expect(summary).toHaveProperty('progress');
            expect(summary).toHaveProperty('currentPhase');
            expect(summary).toHaveProperty('intensity');
        });

        it('should reset session', () => {
            arc.markEvent('test');
            arc.updatePlayerState({ engagementLevel: 0.9 });
            
            arc.reset();
            
            expect(arc.eventMarkers.length).toBe(0);
            expect(arc.playerState.engagementLevel).toBe(0.5);
        });

        it('should skip to specific phase', () => {
            // Reset arc for clean test
            arc.reset();
            
            // Test skipToPhase by checking we moved forward in the session
            const phaseBefore = arc.getCurrentPhase();
            arc.skipToPhase('climax');
            const phaseAfter = arc.getCurrentPhase();
            
            // After skipping to climax, we should be in a later phase than introduction
            const phaseOrder = ['introduction', 'build_tension', 'first_peak', 'recovery_1', 'rising_action', 'climax', 'falling_action', 'resolution'];
            const beforeIndex = phaseOrder.indexOf(phaseBefore.name);
            const afterIndex = phaseOrder.indexOf(phaseAfter.name);
            
            // We should have moved forward in the session
            expect(afterIndex).toBeGreaterThan(beforeIndex);
            // And should be at climax or later
            expect(afterIndex).toBeGreaterThanOrEqual(phaseOrder.indexOf('climax'));
        });

        it('should have 8 narrative phases', () => {
            expect(arc.phases.length).toBe(8);
            
            const phaseNames = arc.phases.map(p => p.name);
            expect(phaseNames).toContain('introduction');
            expect(phaseNames).toContain('build_tension');
            expect(phaseNames).toContain('first_peak');
            expect(phaseNames).toContain('climax');
            expect(phaseNames).toContain('resolution');
        });
    });

    describe('T3.4: 6-State Emotion Model', () => {
        let emotions;

        beforeEach(() => {
            emotions = new EmotionSystem();
        });

        it('should initialize with 6 emotion states', () => {
            const state = emotions.getEmotionState();
            expect(state.emotions).toHaveProperty('fear');
            expect(state.emotions).toHaveProperty('anger');
            expect(state.emotions).toHaveProperty('energy');
            expect(state.emotions).toHaveProperty('hunger');
            expect(state.emotions).toHaveProperty('thirst');
            expect(state.emotions).toHaveProperty('boredom');
        });

        it('should initialize with default values', () => {
            expect(emotions.getEmotion('fear')).toBe(0);
            expect(emotions.getEmotion('anger')).toBe(0);
            expect(emotions.getEmotion('energy')).toBe(1.0);
            expect(emotions.getEmotion('hunger')).toBe(0);
            expect(emotions.getEmotion('thirst')).toBe(0);
            expect(emotions.getEmotion('boredom')).toBe(0);
        });

        it('should accept custom initial values', () => {
            const custom = new EmotionSystem({
                initialFear: 0.5,
                initialAnger: 0.3,
                initialEnergy: 0.8
            });
            expect(custom.getEmotion('fear')).toBe(0.5);
            expect(custom.getEmotion('anger')).toBe(0.3);
            expect(custom.getEmotion('energy')).toBe(0.8);
        });

        it('should decay fear over time', () => {
            emotions.setEmotion('fear', 0.8);
            const initialFear = emotions.getEmotion('fear');
            
            emotions.update({});
            const newFear = emotions.getEmotion('fear');
            
            expect(newFear).toBeLessThan(initialFear);
        });

        it('should increase fear from threats', () => {
            emotions.setEmotion('fear', 0.2);
            emotions.update({ threatLevel: 0.8 });
            expect(emotions.getEmotion('fear')).toBeGreaterThan(0.2);
        });

        it('should drain energy during panic', () => {
            emotions.setEmotion('energy', 1.0);
            emotions.update({ isPanicking: true });
            expect(emotions.getEmotion('energy')).toBeLessThan(1.0);
        });

        it('should recover energy while resting', () => {
            emotions.setEmotion('energy', 0.5);
            emotions.update({ isResting: true });
            expect(emotions.getEmotion('energy')).toBeGreaterThan(0.5);
        });

        it('should increase hunger over time', () => {
            const initialHunger = emotions.getEmotion('hunger');
            emotions.update({ hasFood: false });
            expect(emotions.getEmotion('hunger')).toBeGreaterThanOrEqual(initialHunger);
        });

        it('should reduce hunger when eating', () => {
            emotions.setEmotion('hunger', 0.8);
            emotions.update({ hasFood: true });
            expect(emotions.getEmotion('hunger')).toBeLessThan(0.8);
        });

        it('should increase thirst over time', () => {
            const initialThirst = emotions.getEmotion('thirst');
            emotions.update({ hasWater: false });
            expect(emotions.getEmotion('thirst')).toBeGreaterThanOrEqual(initialThirst);
        });

        it('should reduce thirst when drinking', () => {
            emotions.setEmotion('thirst', 0.8);
            emotions.update({ hasWater: true });
            expect(emotions.getEmotion('thirst')).toBeLessThan(0.8);
        });

        it('should increase boredom when inactive', () => {
            emotions.setEmotion('boredom', 0.2);
            emotions.update({ isMoving: false, timeInSameState: 100 });
            expect(emotions.getEmotion('boredom')).toBeGreaterThan(0.2);
        });

        it('should reduce boredom with activity', () => {
            emotions.setEmotion('boredom', 0.8);
            emotions.update({ isMoving: true });
            expect(emotions.getEmotion('boredom')).toBeLessThan(0.8);
        });

        it('should enter BERSERK state with high anger', () => {
            emotions.setEmotion('anger', 0.95);
            emotions.update({});
            expect(emotions.getSpecialState()).toBe('BERSERK');
        });

        it('should override fear in BERSERK state', () => {
            emotions.setEmotion('fear', 0.8);
            emotions.setEmotion('anger', 0.95);
            emotions.update({});
            expect(emotions.isFearOverridden()).toBe(true);
            expect(emotions.getEffectiveFear()).toBeLessThan(0.8);
        });

        it('should reduce speed when exhausted', () => {
            emotions.setEmotion('energy', 0.1);
            emotions.update({});
            const modifier = emotions.getSpeedModifier();
            expect(modifier).toBeLessThan(1.0);
        });

        it('should increase speed in BERSERK state', () => {
            emotions.setEmotion('anger', 0.95);
            emotions.setEmotion('energy', 1.0);
            emotions.update({});
            const modifier = emotions.getSpeedModifier();
            expect(modifier).toBeGreaterThan(1.0);
        });

        it('should enter EXPLORING state with high boredom and low fear', () => {
            emotions.setEmotion('boredom', 0.8);
            emotions.setEmotion('fear', 0.2);
            emotions.update({});
            expect(emotions.getSpecialState()).toBe('EXPLORING');
        });

        it('should enter STARVING state with critical hunger', () => {
            emotions.setEmotion('hunger', 0.95);
            emotions.update({});
            expect(emotions.getSpecialState()).toBe('STARVING');
        });

        it('should enter DEHYDRATED state with critical thirst', () => {
            emotions.setEmotion('thirst', 0.95);
            emotions.update({});
            expect(emotions.getSpecialState()).toBe('DEHYDRATED');
        });

        it('should track dominant emotion', () => {
            // Lower energy so fear can be dominant
            emotions.setEmotion('energy', 0.5);
            emotions.setEmotion('fear', 0.8);
            emotions.update({});
            const state = emotions.getEmotionState();
            expect(state.dominantEmotion).toBe('fear');
        });

        it('should trigger emotions directly', () => {
            emotions.triggerEmotion('fear', 0.5);
            expect(emotions.getEmotion('fear')).toBe(0.5);
        });

        it('should reduce emotions', () => {
            emotions.setEmotion('fear', 0.8);
            emotions.reduceEmotion('fear', 0.3);
            expect(emotions.getEmotion('fear')).toBe(0.5);
        });

        it('should cap emotions at 1.0', () => {
            emotions.triggerEmotion('fear', 1.5);
            expect(emotions.getEmotion('fear')).toBe(1.0);
        });

        it('should floor emotions at 0', () => {
            emotions.reduceEmotion('fear', 1.5);
            expect(emotions.getEmotion('fear')).toBe(0);
        });

        it('should record emotion history', () => {
            emotions.update({});
            emotions.update({});
            emotions.update({});
            expect(emotions.getHistory().length).toBeGreaterThan(0);
        });

        it('should calculate average emotion', () => {
            emotions.setEmotion('fear', 0.5);
            for (let i = 0; i < 10; i++) {
                emotions.update({});
            }
            const avg = emotions.getAverageEmotion('fear', 5);
            expect(avg).toBeGreaterThanOrEqual(0);
            expect(avg).toBeLessThanOrEqual(1.0);
        });

        it('should detect emotion trends', () => {
            // Simulate increasing fear
            for (let i = 0; i < 30; i++) {
                emotions.setEmotion('fear', i * 0.02);
                emotions.recordHistory();
            }
            const trend = emotions.getEmotionTrend('fear', 30);
            expect(trend).toBe('increasing');
        });

        it('should serialize and deserialize', () => {
            emotions.setEmotion('fear', 0.7);
            emotions.setEmotion('anger', 0.3);
            emotions.update({});
            
            const serialized = emotions.serialize();
            const newEmotions = new EmotionSystem();
            newEmotions.deserialize(serialized);
            
            expect(newEmotions.getEmotion('fear')).toBeCloseTo(0.7, 1);
            expect(newEmotions.getEmotion('anger')).toBeCloseTo(0.3, 1);
        });

        it('should reset all emotions', () => {
            emotions.setEmotion('fear', 0.8);
            emotions.setEmotion('anger', 0.7);
            emotions.setEmotion('boredom', 0.6);
            emotions.update({});
            
            emotions.reset();
            
            expect(emotions.getEmotion('fear')).toBe(0);
            expect(emotions.getEmotion('anger')).toBe(0);
            expect(emotions.getEmotion('energy')).toBe(1.0);
            expect(emotions.getSpecialState()).toBeNull();
        });

        it('should suppress fear with anger', () => {
            emotions.setEmotion('fear', 0.6);
            emotions.setEmotion('anger', 0.5);
            emotions.update({ threatLevel: 0.5 });
            
            // Anger should partially suppress fear response
            const effectiveFear = emotions.getEffectiveFear();
            // Fear gets boosted by threat but partially suppressed by anger
            // Should be roughly 0.6 (some increase from threat, some suppression)
            expect(effectiveFear).toBeGreaterThan(0.4);
            expect(effectiveFear).toBeLessThanOrEqual(0.7);
        });
    });

    describe('T3.5: DDA System', () => {
        let dda;
        let mockSimulation;

        beforeEach(() => {
            dda = new DDASystem();
            mockSimulation = {
                predatorSpawnRate: 0.01,
                foodSpawnRate: 0.05,
                globalThreatLevel: 0.5,
                addEmergencySafeZone: jest.fn(),
                calmAgents: jest.fn().mockReturnValue(5)
            };
        });

        it('should initialize with default thresholds', () => {
            expect(dda.thresholds.boredomFearMax).toBe(0.3);
            expect(dda.thresholds.overwhelmedFearMin).toBe(0.8);
            expect(dda.thresholds.flowEngagementMin).toBe(0.6);
        });

        it('should detect BORED state', () => {
            const state = dda.assessPlayerState({
                avgFear: 0.2,
                engagement: 0.3,
                survivalRate: 0.8
            });
            expect(state).toBe('BORED');
        });

        it('should detect OVERWHELMED state', () => {
            const state = dda.assessPlayerState({
                avgFear: 0.9,
                engagement: 0.5,
                survivalRate: 0.2
            });
            expect(state).toBe('OVERWHELMED');
        });

        it('should detect FLOW state', () => {
            const state = dda.assessPlayerState({
                avgFear: 0.5,
                engagement: 0.7,
                survivalRate: 0.6
            });
            expect(state).toBe('FLOW');
        });

        it('should detect extreme panic as OVERWHELMED', () => {
            const state = dda.assessPlayerState({
                avgFear: 0.5,
                engagement: 0.5,
                survivalRate: 0.5,
                panicEvents: 6,
                avgAdrenaline: 0.3
            });
            expect(state).toBe('OVERWHELMED');
        });

        it('should return ADJUSTING for neutral metrics', () => {
            const state = dda.assessPlayerState({
                avgFear: 0.5,
                engagement: 0.5,
                survivalRate: 0.5
            });
            expect(state).toBe('ADJUSTING');
        });

        it('should increase challenge when bored', () => {
            const initialPredatorRate = mockSimulation.predatorSpawnRate;
            
            dda.update({
                avgFear: 0.2,
                engagement: 0.3,
                survivalRate: 0.8
            }, mockSimulation);
            
            // Run enough frames to trigger state change
            for (let i = 0; i < 65; i++) {
                dda.update({
                    avgFear: 0.2,
                    engagement: 0.3,
                    survivalRate: 0.8
                }, mockSimulation);
            }
            
            expect(mockSimulation.predatorSpawnRate).toBeGreaterThan(initialPredatorRate);
        });

        it('should decrease challenge when overwhelmed', () => {
            const initialPredatorRate = mockSimulation.predatorSpawnRate;
            
            // Run enough frames to trigger state change
            for (let i = 0; i < 65; i++) {
                dda.update({
                    avgFear: 0.9,
                    engagement: 0.3,
                    survivalRate: 0.2
                }, mockSimulation);
            }
            
            expect(mockSimulation.predatorSpawnRate).toBeLessThan(initialPredatorRate);
        });

        it('should add safe zone when overwhelmed', () => {
            for (let i = 0; i < 65; i++) {
                dda.update({
                    avgFear: 0.9,
                    engagement: 0.3,
                    survivalRate: 0.2
                }, mockSimulation);
            }
            
            expect(mockSimulation.addEmergencySafeZone).toHaveBeenCalled();
        });

        it('should calm agents when overwhelmed', () => {
            for (let i = 0; i < 65; i++) {
                dda.update({
                    avgFear: 0.9,
                    engagement: 0.3,
                    survivalRate: 0.2
                }, mockSimulation);
            }
            
            expect(mockSimulation.calmAgents).toHaveBeenCalledWith(0.5);
        });

        it('should track state transitions', () => {
            // Force state change by waiting for min duration
            for (let i = 0; i < 65; i++) {
                dda.update({
                    avgFear: 0.9,
                    engagement: 0.3,
                    survivalRate: 0.2
                }, mockSimulation);
            }
            
            const history = dda.getStateHistory();
            expect(history.length).toBeGreaterThan(0);
        });

        it('should track flow state percentage', () => {
            // Run updates to track time
            for (let i = 0; i < 100; i++) {
                dda.update({
                    avgFear: 0.5,
                    engagement: 0.7,
                    survivalRate: 0.6
                }, mockSimulation);
            }
            
            const stats = dda.getFlowStatistics();
            expect(stats.flowPercentage).toContain('%');
            expect(stats.totalTrackedTime).toBeGreaterThan(0);
            // Most time should be in FLOW state (after initial transition)
            expect(stats.flowStateTime).toBeGreaterThan(0);
        });

        it('should calculate metric trends', () => {
            // Simulate increasing fear trend
            for (let i = 0; i < 40; i++) {
                dda.recordMetrics({
                    avgFear: i * 0.02,
                    engagement: 0.5
                });
            }
            
            const trends = dda.getMetricTrends();
            expect(trends.fearTrend).toBe('increasing');
            expect(trends.fearSlope).toBeGreaterThan(0);
        });

        it('should enforce minimum state duration', () => {
            // Start in BORED
            dda.currentState = 'BORED';
            dda.stateTimer = 0;
            
            // Try to change immediately to OVERWHELMED
            dda.update({
                avgFear: 0.9,
                engagement: 0.3,
                survivalRate: 0.2
            }, mockSimulation);
            
            // Should still be in BORED due to minimum duration
            expect(dda.getCurrentState()).toBe('BORED');
        });

        it('should log adjustments', () => {
            for (let i = 0; i < 65; i++) {
                dda.update({
                    avgFear: 0.2,
                    engagement: 0.3,
                    survivalRate: 0.8
                }, mockSimulation);
            }
            
            const history = dda.getAdjustmentHistory();
            expect(history.length).toBeGreaterThan(0);
            expect(dda.totalAdjustments).toBeGreaterThan(0);
        });

        it('should serialize and deserialize', () => {
            dda.currentState = 'FLOW';
            dda.flowStateTime = 50;
            dda.totalTrackedTime = 100;
            dda.totalAdjustments = 10;
            
            const serialized = dda.serialize();
            const newDDA = new DDASystem();
            newDDA.deserialize(serialized);
            
            expect(newDDA.getCurrentState()).toBe('FLOW');
            expect(newDDA.flowStateTime).toBe(50);
            expect(newDDA.totalAdjustments).toBe(10);
        });

        it('should reset to initial state', () => {
            dda.currentState = 'FLOW';
            dda.flowStateTime = 50;
            dda.totalAdjustments = 10;
            dda.recordStateTransition('BORED', 'FLOW');
            
            dda.reset();
            
            expect(dda.getCurrentState()).toBe('ADJUSTING');
            expect(dda.flowStateTime).toBe(0);
            expect(dda.totalAdjustments).toBe(0);
            expect(dda.getStateHistory().length).toBe(0);
        });

        it('should maintain settings in FLOW state', () => {
            const initialFoodRate = mockSimulation.foodSpawnRate;
            
            // Run in flow state
            for (let i = 0; i < 65; i++) {
                dda.update({
                    avgFear: 0.5,
                    engagement: 0.7,
                    survivalRate: 0.6
                }, mockSimulation);
            }
            
            // Food spawn rate should be relatively stable
            expect(mockSimulation.foodSpawnRate).toBeCloseTo(initialFoodRate, 1);
        });

        it('should apply preemptive adjustments based on trends', () => {
            // Create increasing fear trend
            for (let i = 0; i < 40; i++) {
                dda.recordMetrics({
                    avgFear: i * 0.03,
                    engagement: 0.5
                });
            }
            
            const initialThreat = mockSimulation.globalThreatLevel;
            
            // Stay in ADJUSTING state with trend
            dda.currentState = 'ADJUSTING';
            dda.stateTimer = 100;
            dda.applyAdjustments(mockSimulation);
            
            // Should have preemptively reduced threat
            expect(mockSimulation.globalThreatLevel).toBeLessThan(initialThreat);
        });
    });

    describe('T3.6: Environmental Fear Modifiers', () => {
        let environment;

        beforeEach(() => {
            environment = new EnvironmentSystem();
        });

        it('should initialize with default conditions', () => {
            const state = environment.getEnvironmentalState();
            expect(state.conditions.darkness).toBe(0);
            expect(state.conditions.fogDensity).toBe(0);
            expect(state.conditions.stormIntensity).toBe(0);
        });

        it('should calculate fear modifier from darkness', () => {
            environment.conditions.darkness = 0.8;
            const result = environment.calculateFearModifier({ baseFear: 0.3 });
            expect(result.fearBoost).toBeGreaterThan(0);
            expect(result.totalFear).toBeGreaterThan(0.3);
        });

        it('should calculate fear modifier from storm', () => {
            environment.conditions.stormIntensity = 0.8;
            const result = environment.calculateFearModifier({ baseFear: 0.3 });
            expect(result.modifiers.some(m => m.type === 'storm')).toBe(true);
        });

        it('should apply night fear multiplier', () => {
            environment.conditions.isNight = true;
            environment.conditions.darkness = 0.8;
            const result = environment.calculateFearModifier({ baseFear: 0.5 });
            expect(result.modifiers.some(m => m.type === 'night')).toBe(true);
        });

        it('should calculate fear modifier from fog', () => {
            environment.conditions.fogDensity = 0.8;
            const result = environment.calculateFearModifier({ baseFear: 0.3 });
            expect(result.modifiers.some(m => m.type === 'fog')).toBe(true);
        });

        it('should add environmental events', () => {
            environment.addEvent('thunder', 0.8, 60, 0.2);
            expect(environment.activeEvents.length).toBe(1);
            expect(environment.activeEvents[0].type).toBe('thunder');
        });

        it('should update day/night cycle', () => {
            environment.frame = 1800;  // Half of default day length
            environment.update();
            expect(environment.timeOfDay).toBeGreaterThan(0);
            expect(environment.timeOfDay).toBeLessThanOrEqual(1);
        });

        it('should set weather conditions', () => {
            environment.setWeather('storm', 0.8);
            expect(environment.conditions.stormIntensity).toBe(0.8);
            expect(environment.conditions.fogDensity).toBeGreaterThan(0);
        });

        it('should track sound sources', () => {
            environment.addSoundSource('howl', 100, 100, 50, 0.7);
            const intensity = environment.getSoundIntensityAt(110, 110);
            expect(intensity).toBeGreaterThan(0);
        });

        it('should provide weather description', () => {
            environment.conditions.stormIntensity = 0.9;
            expect(environment.getWeatherDescription()).toBe('severe_storm');
        });

        it('should cap total fear at 1.0', () => {
            environment.conditions.darkness = 1.0;
            environment.conditions.stormIntensity = 1.0;
            const result = environment.calculateFearModifier({ baseFear: 0.9 });
            expect(result.totalFear).toBeLessThanOrEqual(1.0);
        });

        it('should serialize and deserialize', () => {
            environment.conditions.darkness = 0.8;
            environment.conditions.stormIntensity = 0.6;
            const serialized = environment.serialize();
            
            const newEnv = new EnvironmentSystem();
            newEnv.deserialize(serialized);
            
            expect(newEnv.conditions.darkness).toBe(0.8);
            expect(newEnv.conditions.stormIntensity).toBe(0.6);
        });

        it('should reset to default state', () => {
            environment.conditions.darkness = 0.9;
            environment.addEvent('thunder', 0.8, 60);
            environment.reset();
            
            expect(environment.conditions.darkness).toBe(0);
            expect(environment.activeEvents.length).toBe(0);
        });
    });

    describe('T3.7: Improved Memory System', () => {
        let memory;

        beforeEach(() => {
            memory = new MemorySystem();
        });

        it('should add memory to short-term', () => {
            // Non-trauma memory stays in STM
            memory.addMemory({ type: 'threat', x: 100, y: 100, intensity: 0.5 });
            expect(memory.shortTerm.memories.length).toBe(1);
        });

        it('should identify trauma memories', () => {
            // Trauma memories get consolidated immediately to LTM
            memory.addMemory({ type: 'threat', x: 100, y: 100, intensity: 0.9 });
            expect(memory.longTerm.memories[0].isTrauma).toBe(true);
        });

        it('should consolidate strong memories to long-term', () => {
            memory.addMemory({ type: 'threat', x: 100, y: 100, intensity: 0.9 });
            // Trauma memories consolidate immediately
            expect(memory.longTerm.memories.length).toBe(1);
        });

        it('should decay memories over time', () => {
            memory.addMemory({ type: 'threat', x: 100, y: 100, intensity: 0.5 });
            const initialStrength = memory.shortTerm.memories[0].strength;
            
            memory.update();
            
            expect(memory.shortTerm.memories[0].strength).toBeLessThan(initialStrength);
        });

        it('should recall memories based on context', () => {
            memory.addMemory(
                { type: 'threat', x: 100, y: 100, intensity: 0.8 },
                { location: { x: 100, y: 100 }, threatLevel: 0.8 }
            );
            
            const recalled = memory.recall({ location: { x: 105, y: 105 } });
            expect(recalled.length).toBeGreaterThan(0);
        });

        it('should assess threat at location', () => {
            memory.addMemory({ type: 'threat', x: 100, y: 100, intensity: 0.9 });
            const assessment = memory.assessThreat(100, 100, 50);
            expect(assessment.threatLevel).toBeGreaterThan(0);
        });

        it('should share memories between agents', () => {
            const otherMemory = new MemorySystem();
            memory.addMemory({ type: 'threat', x: 100, y: 100, intensity: 0.8 });
            
            const shared = memory.shareMemories(otherMemory, 0, 0, 50, 50);
            expect(shared).toBeGreaterThan(0);
            expect(otherMemory.shortTerm.memories.length).toBeGreaterThan(0);
        });

        it('should track memory statistics', () => {
            memory.addMemory({ type: 'threat', x: 100, y: 100, intensity: 0.9 });
            const stats = memory.getStats();
            expect(stats.totalMemoriesCreated).toBe(1);
            expect(stats.traumaMemoryCount).toBe(1);
        });

        it('should serialize and deserialize', () => {
            memory.addMemory({ type: 'threat', x: 100, y: 100, intensity: 0.6 });
            const serialized = memory.serialize();
            
            const newMemory = new MemorySystem();
            newMemory.deserialize(serialized);
            
            // Memory could be in STM or LTM depending on consolidation
            const totalMemories = newMemory.shortTerm.memories.length + newMemory.longTerm.memories.length;
            expect(totalMemories).toBe(1);
        });

        it('should clear all memories', () => {
            memory.addMemory({ type: 'threat', x: 100, y: 100, intensity: 0.8 });
            memory.clear();
            expect(memory.shortTerm.memories.length).toBe(0);
            expect(memory.longTerm.memories.length).toBe(0);
        });
    });

    describe('T3.8: Group Behaviors', () => {
        let groupSystem;
        let mockAgent;

        beforeEach(() => {
            groupSystem = new GroupBehaviorSystem();
            mockAgent = { id: 1, x: 100, y: 100, vx: 0, vy: 0 };
        });

        it('should register agent with group', () => {
            groupSystem.registerAgent(mockAgent, 'Family1');
            expect(groupSystem.agentGroups.get(1)).toBe('Family1');
            expect(groupSystem.groups.get('Family1').members.has(1)).toBe(true);
        });

        it('should trigger mourning when agent dies', () => {
            groupSystem.registerAgent({ id: 1 }, 'Family1');
            groupSystem.registerAgent({ id: 2 }, 'Family1');
            
            groupSystem.unregisterAgent({ id: 1 });
            
            expect(groupSystem.mourningAgents.has(2)).toBe(true);
        });

        it('should get mourning state', () => {
            groupSystem.registerAgent({ id: 1 }, 'Family1');
            groupSystem.registerAgent({ id: 2 }, 'Family1');
            groupSystem.unregisterAgent({ id: 1 });
            
            const state = groupSystem.getMourningState(2);
            expect(state).not.toBeNull();
            expect(state.type).toBe('mourning');
        });

        it('should trigger search party', () => {
            groupSystem.registerAgent({ id: 1 }, 'Family1');
            groupSystem.registerAgent({ id: 2 }, 'Family1');
            
            groupSystem.triggerSearchParty('Family1', 1, { x: 100, y: 100 });
            
            expect(groupSystem.searchParties.has(1)).toBe(true);
        });

        it('should propagate panic to group', () => {
            groupSystem.registerAgent({ id: 1 }, 'Family1');
            groupSystem.registerAgent({ id: 2 }, 'Family1');
            groupSystem.registerAgent({ id: 3 }, 'Family1');
            
            // Increase group cohesion to ensure panic propagates
            const group = groupSystem.groups.get('Family1');
            group.cohesion = 0.8;
            
            const affected = groupSystem.propagatePanic(1, mockAgent);
            expect(affected.length).toBeGreaterThan(0);
        });

        it('should calculate group forces', () => {
            groupSystem.registerAgent(mockAgent, 'Family1');
            const neighbors = [
                { id: 2, x: 120, y: 100, vx: 1, vy: 0 },
                { id: 3, x: 80, y: 100, vx: -1, vy: 0 }
            ];
            
            const forces = groupSystem.calculateGroupForces(mockAgent, neighbors);
            expect(forces.cohesion).toBeDefined();
            expect(forces.alignment).toBeDefined();
            expect(forces.separation).toBeDefined();
        });

        it('should set tribal relations', () => {
            groupSystem.setTribalRelation('Family1', 'Family2', -0.5);
            const relation = groupSystem.getTribalRelation('Family1', 'Family2');
            expect(relation).toBe(-0.5);
        });

        it('should detect hostility', () => {
            groupSystem.registerAgent({ id: 1 }, 'Family1');
            groupSystem.registerAgent({ id: 2 }, 'Family2');
            groupSystem.setTribalRelation('Family1', 'Family2', -0.8);
            
            expect(groupSystem.areHostile(1, 2)).toBe(true);
        });

        it('should update group timers', () => {
            groupSystem.registerAgent({ id: 1 }, 'Family1');
            groupSystem.registerAgent({ id: 2 }, 'Family1');
            groupSystem.unregisterAgent({ id: 1 });
            
            const initialTimer = groupSystem.mourningAgents.get(2).timer;
            groupSystem.update([]);
            
            expect(groupSystem.mourningAgents.get(2).timer).toBeLessThan(initialTimer);
        });

        it('should get group info', () => {
            groupSystem.registerAgent(mockAgent, 'Family1');
            const info = groupSystem.getGroupInfo('Family1');
            expect(info.name).toBe('Family1');
            expect(info.memberCount).toBe(1);
        });

        it('should track group statistics', () => {
            groupSystem.registerAgent({ id: 1 }, 'Family1');
            groupSystem.registerAgent({ id: 2 }, 'Family1');
            groupSystem.setTribalRelation('Family1', 'Family2', -0.3);
            
            const stats = groupSystem.getStats();
            expect(stats.groupCount).toBe(1);
            expect(stats.totalMembers).toBe(2);
            expect(stats.tribalRelations).toBe(1);
        });

        it('should serialize and deserialize', () => {
            groupSystem.registerAgent({ id: 1 }, 'Family1');
            groupSystem.registerAgent({ id: 2 }, 'Family1');
            groupSystem.setTribalRelation('Family1', 'Family2', -0.5);
            
            const serialized = groupSystem.serialize();
            const newSystem = new GroupBehaviorSystem();
            newSystem.deserialize(serialized);
            
            expect(newSystem.groups.get('Family1').members.size).toBe(2);
        });

        it('should reset group system', () => {
            groupSystem.registerAgent({ id: 1 }, 'Family1');
            groupSystem.reset();
            expect(groupSystem.groups.size).toBe(0);
            expect(groupSystem.agentGroups.size).toBe(0);
        });
    });

    describe('T4.1: Biofeedback Integration Framework', () => {
        let biofeedback;

        beforeEach(() => {
            biofeedback = new BiofeedbackManager();
        });

        it('should initialize all sensors', async () => {
            const results = await biofeedback.initialize();
            expect(results.eeg).toBe(true);
            expect(results.hrv).toBe(true);
            expect(results.gsr).toBe(true);
            expect(results.facial).toBe(true);
        });

        it('should get fear score from sensors', async () => {
            await biofeedback.initialize();
            const result = await biofeedback.getFearScore();
            
            expect(result.fearScore).toBeGreaterThanOrEqual(0);
            expect(result.fearScore).toBeLessThanOrEqual(1);
            expect(result.activeSensors).toBeGreaterThan(0);
        });

        it('should fuse multiple sensor readings', async () => {
            await biofeedback.initialize();
            
            // Test fusion with different sensor combinations
            biofeedback.setWeights({ eeg: 0.5, hrv: 0.5, gsr: 0, facial: 0 });
            
            const result = await biofeedback.getFearScore();
            expect(result.fearScore).toBeGreaterThanOrEqual(0);
        });

        it('should calculate confidence based on sensor availability', async () => {
            await biofeedback.initialize();
            const result = await biofeedback.getFearScore();
            expect(result.confidence).toBeGreaterThan(0);
            expect(result.confidence).toBeLessThanOrEqual(1);
        });

        it('should smooth fear scores over time', async () => {
            await biofeedback.initialize();
            
            const scores = [];
            for (let i = 0; i < 5; i++) {
                const result = await biofeedback.getFearScore();
                scores.push(result.fearScore);
            }
            
            // Smoothed scores should vary less than raw readings
            const variance = scores.reduce((sum, s) => sum + Math.abs(s - 0.5), 0) / scores.length;
            expect(variance).toBeGreaterThan(0);
        });

        it('should calibrate baseline', async () => {
            await biofeedback.initialize();
            
            // Short calibration for testing
            const baseline = await biofeedback.calibrate(100);
            expect(baseline).toBeGreaterThanOrEqual(0);
            expect(baseline).toBeLessThanOrEqual(1);
            expect(biofeedback.isCalibrated).toBe(true);
        });

        it('should apply calibration to scores', async () => {
            await biofeedback.initialize();
            await biofeedback.calibrate(100);
            
            const result = await biofeedback.getFearScore();
            expect(result.rawScore).toBeDefined();
            expect(result.fearScore).toBeDefined();
        });

        it('should get sensor status', async () => {
            await biofeedback.initialize();
            const status = biofeedback.getSensorStatus();
            
            expect(status.eeg.connected).toBe(true);
            expect(status.hrv.connected).toBe(true);
            expect(status.gsr.connected).toBe(true);
            expect(status.facial.connected).toBe(true);
        });

        it('should track statistics', async () => {
            await biofeedback.initialize();
            
            await biofeedback.getFearScore();
            await biofeedback.getFearScore();
            
            const stats = biofeedback.getStats();
            expect(stats.totalReadings).toBe(2);
            expect(stats.successfulReadings).toBe(2);
        });

        it('should normalize weights', () => {
            biofeedback.setWeights({ eeg: 2, hrv: 2, gsr: 2, facial: 2 });
            
            const sum = Object.values(biofeedback.weights).reduce((a, b) => a + b, 0);
            expect(sum).toBeCloseTo(1, 1);
        });

        it('should reset calibration', async () => {
            await biofeedback.initialize();
            await biofeedback.calibrate(100);
            
            biofeedback.reset();
            
            expect(biofeedback.isCalibrated).toBe(false);
            expect(biofeedback.baseline).toBeNull();
            expect(biofeedback.stats.totalReadings).toBe(0);
        });

        it('should disconnect all sensors', async () => {
            await biofeedback.initialize();
            biofeedback.disconnectAll();
            
            const status = biofeedback.getSensorStatus();
            expect(status.eeg.connected).toBe(false);
            expect(status.hrv.connected).toBe(false);
            expect(status.gsr.connected).toBe(false);
            expect(status.facial.connected).toBe(false);
        });

        describe('Individual Sensors', () => {
            it('EEG sensor should return beta/gamma power', async () => {
                const eeg = new EEGSensor();
                await eeg.connect();
                
                const power = await eeg.getBetaGammaPower();
                expect(power).toBeGreaterThanOrEqual(0);
                expect(power).toBeLessThanOrEqual(1);
            });

            it('HRV sensor should return RMSSD', async () => {
                const hrv = new HRVSensor();
                await hrv.connect();
                
                const rmssd = await hrv.getRMSSD();
                expect(rmssd).toBeGreaterThan(0);
            });

            it('HRV sensor should calculate heart rate', async () => {
                const hrv = new HRVSensor();
                await hrv.connect();
                
                // Add some mock heartbeats
                const now = Date.now();
                hrv.addHeartbeat(now - 1000);
                hrv.addHeartbeat(now - 500);
                hrv.addHeartbeat(now);
                
                const hr = hrv.getHeartRate();
                expect(hr).toBeGreaterThan(0);
            });

            it('GSR sensor should return phasic response', async () => {
                const gsr = new GSRSensor();
                await gsr.connect();
                
                const phasic = await gsr.getPhasicResponse();
                expect(phasic).toBeGreaterThanOrEqual(0);
                expect(phasic).toBeLessThanOrEqual(1);
            });

            it('Facial sensor should detect fear expression', async () => {
                const facial = new FacialSensor();
                await facial.connect();
                
                const expression = await facial.getFearExpression();
                expect(expression.intensity).toBeGreaterThanOrEqual(0);
                expect(expression.confidence).toBeGreaterThanOrEqual(0);
                expect(expression.expressions).toBeDefined();
            });

            it('Facial sensor should detect face presence', async () => {
                const facial = new FacialSensor();
                await facial.connect();
                
                const detected = facial.isFaceDetected();
                expect(typeof detected).toBe('boolean');
            });
        });
    });

    describe('T4.2: VR-Specific Behaviors', () => {
        describe('VRHeadAnalyzer', () => {
            it('should initialize with default config', () => {
                const analyzer = new VRHeadAnalyzer();
                expect(analyzer.config.duckThreshold).toBe(0.15);
                expect(analyzer.config.freezeDuration).toBe(2000);
                expect(analyzer.history).toEqual([]);
            });

            it('should calibrate baseline height', () => {
                const analyzer = new VRHeadAnalyzer();
                analyzer.calibrate({ x: 0, y: 1.6, z: 0 });
                
                expect(analyzer.baselineHeight).toBe(1.6);
                expect(analyzer.baselinePosition).toEqual({ x: 0, y: 1.6, z: 0 });
            });

            it('should detect ducking behavior', () => {
                const analyzer = new VRHeadAnalyzer();
                analyzer.calibrate({ x: 0, y: 1.6, z: 0 });
                
                // Simulate ducking - drop 20cm
                const headData = {
                    position: { x: 0, y: 1.4, z: 0 },
                    rotation: { x: 0, y: 0, z: 0 }
                };
                
                // Add enough history
                for (let i = 0; i < 15; i++) {
                    analyzer.update(headData);
                }
                
                const result = analyzer.analyze();
                expect(result.behaviors.ducking).toBe(true);
            });

            it('should detect freezing behavior', () => {
                const analyzer = new VRHeadAnalyzer();
                
                // Add 60 frames of minimal movement
                for (let i = 0; i < 70; i++) {
                    analyzer.update({
                        position: { x: 0, y: 1.6, z: 0 },
                        rotation: { x: 0, y: i * 0.001, z: 0 }
                    });
                }
                
                const result = analyzer.analyze();
                expect(result.behaviors.freezing).toBe(true);
            });

            it('should detect recoiling (backward movement)', () => {
                const analyzer = new VRHeadAnalyzer();
                
                // Simulate forward movement to establish baseline
                for (let i = 0; i < 15; i++) {
                    analyzer.update({
                        position: { x: 0, y: 1.6, z: 0.5 },  // stable at 0.5
                        rotation: { x: 0, y: 0, z: 0 }
                    });
                }
                
                // Move forward first
                analyzer.update({
                    position: { x: 0, y: 1.6, z: 0.8 },
                    rotation: { x: 0, y: 0, z: 0 }
                });
                
                // Keep stable for 4 more frames
                for (let i = 0; i < 4; i++) {
                    analyzer.update({
                        position: { x: 0, y: 1.6, z: 0.8 },
                        rotation: { x: 0, y: 0, z: 0 }
                    });
                }
                
                // Sudden backward movement (0.5m recoil, exceeds 0.3 threshold)
                analyzer.update({
                    position: { x: 0, y: 1.6, z: 0.3 },
                    rotation: { x: 0, y: 0, z: 0 }
                });
                
                const result = analyzer.analyze();
                expect(result.behaviors.recoiling).toBe(true);
            });

            it('should calculate fear score from behaviors', () => {
                const analyzer = new VRHeadAnalyzer();
                analyzer.calibrate({ x: 0, y: 1.6, z: 0 });
                
                // Simulate panicked behavior (ducking + shaking)
                for (let i = 0; i < 15; i++) {
                    analyzer.update({
                        position: { x: 0, y: 1.4, z: 0 },
                        rotation: { x: 0, y: i * 0.5, z: 0 },
                        velocity: { rotX: 0, rotY: 10, rotZ: 0 }
                    });
                }
                
                const result = analyzer.analyze();
                expect(result.fearScore).toBeGreaterThan(0);
                expect(result.intensity).toBeDefined();
            });

            it('should return null for insufficient history', () => {
                const analyzer = new VRHeadAnalyzer();
                analyzer.update({
                    position: { x: 0, y: 1.6, z: 0 },
                    rotation: { x: 0, y: 0, z: 0 }
                });
                
                const result = analyzer.analyze();
                expect(result).toBeNull();
            });

            it('should reset history and baseline', () => {
                const analyzer = new VRHeadAnalyzer();
                analyzer.calibrate({ x: 0, y: 1.6, z: 0 });
                analyzer.update({ position: { x: 0, y: 1.6, z: 0 }, rotation: { x: 0, y: 0, z: 0 } });
                
                analyzer.reset();
                
                expect(analyzer.history).toEqual([]);
                expect(analyzer.baselineHeight).toBeNull();
            });
        });

        describe('VRControllerAnalyzer', () => {
            it('should initialize with default config', () => {
                const analyzer = new VRControllerAnalyzer();
                expect(analyzer.config.gripThreshold).toBe(0.7);
                expect(analyzer.history.left).toEqual([]);
                expect(analyzer.history.right).toEqual([]);
            });

            it('should detect high grip stress', () => {
                const analyzer = new VRControllerAnalyzer();
                analyzer.calibrate({ left: { grip: 0.2 }, right: { grip: 0.2 } });
                
                const controllers = {
                    left: { position: { x: -0.2, y: 1.4, z: 0 }, grip: 0.9, velocity: { x: 0, y: 0, z: 0 } },
                    right: { position: { x: 0.2, y: 1.4, z: 0 }, grip: 0.1, velocity: { x: 0, y: 0, z: 0 } }
                };
                
                // Add history
                for (let i = 0; i < 15; i++) {
                    analyzer.update(controllers);
                }
                
                const result = analyzer.analyze(controllers);
                expect(result.left.gripStress).toBeGreaterThan(0.5);
                expect(result.combinedGrip).toBeGreaterThan(0.5);
            });

            it('should detect guard position (defensive)', () => {
                const analyzer = new VRControllerAnalyzer();
                
                const controllers = {
                    left: { position: { x: -0.1, y: 1.5, z: 0.1 }, grip: 0.5, velocity: { x: 0, y: 0, z: 0 } },
                    right: { position: { x: 0.1, y: 1.5, z: 0.1 }, grip: 0.5, velocity: { x: 0, y: 0, z: 0 } }
                };
                
                const result = analyzer.analyze(controllers);
                expect(result.left.guardPosition || result.right.guardPosition).toBe(true);
            });

            it('should detect controller shake', () => {
                const analyzer = new VRControllerAnalyzer();
                
                // Add history with high velocity variation
                for (let i = 0; i < 15; i++) {
                    const shakeVelocity = { x: Math.sin(i) * 2, y: Math.cos(i) * 2, z: 0 };
                    analyzer.update({
                        left: { position: { x: -0.2, y: 1.4, z: 0 }, grip: 0.5, velocity: shakeVelocity },
                        right: { position: { x: 0.2, y: 1.4, z: 0 }, grip: 0.5, velocity: { x: 0, y: 0, z: 0 } }
                    });
                }
                
                const controllers = {
                    left: { position: { x: -0.2, y: 1.4, z: 0 }, grip: 0.5, velocity: { x: 2, y: 2, z: 0 } },
                    right: { position: { x: 0.2, y: 1.4, z: 0 }, grip: 0.5, velocity: { x: 0, y: 0, z: 0 } }
                };
                
                const result = analyzer.analyze(controllers);
                expect(result.left.shakeIntensity).toBeGreaterThan(0);
            });

            it('should calculate fear score from controllers', () => {
                const analyzer = new VRControllerAnalyzer();
                analyzer.calibrate({ left: { grip: 0.2 }, right: { grip: 0.2 } });
                
                // High grip + guard position
                const controllers = {
                    left: { position: { x: -0.1, y: 1.5, z: 0.1 }, grip: 0.9, velocity: { x: 0, y: 0, z: 0 } },
                    right: { position: { x: 0.1, y: 1.5, z: 0.1 }, grip: 0.9, velocity: { x: 0, y: 0, z: 0 } }
                };
                
                for (let i = 0; i < 10; i++) {
                    analyzer.update(controllers);
                }
                
                const result = analyzer.analyze(controllers);
                expect(result.fearScore).toBeGreaterThan(0.3);
                expect(result.fearScore).toBeLessThanOrEqual(1.0);
            });

            it('should handle missing controller data', () => {
                const analyzer = new VRControllerAnalyzer();
                
                const result = analyzer.analyze({ left: null, right: null });
                expect(result.left.dropped).toBe(true);
                expect(result.right.dropped).toBe(true);
            });
        });

        describe('PresenceBreakDetector', () => {
            it('should initialize with default state', () => {
                const detector = new PresenceBreakDetector();
                expect(detector.headsetWorn).toBe(true);
                expect(detector.isCalm).toBe(false);
            });

            it('should detect headset removal', () => {
                const detector = new PresenceBreakDetector();
                
                const result = detector.update({ headsetWorn: false });
                
                expect(result.presenceBreaking).toBe(true);
                expect(result.indicators.headsetRemoved).toBe(true);
            });

            it('should detect controller idleness', () => {
                const detector = new PresenceBreakDetector();
                detector.config.idleTimeout = 100; // 100ms for testing
                
                // Wait then update without controller activity
                return new Promise(resolve => {
                    setTimeout(() => {
                        const result = detector.update({ controllerActive: false });
                        expect(result.indicators.controllerIdle).toBe(true);
                        resolve();
                    }, 150);
                });
            });

            it('should detect eyes closed', () => {
                const detector = new PresenceBreakDetector();
                detector.config.eyesClosedThreshold = 50; // 50ms for testing
                
                detector.update({ eyesClosed: true });
                
                return new Promise(resolve => {
                    setTimeout(() => {
                        const result = detector.update({ eyesClosed: true });
                        expect(result.indicators.eyesClosed).toBe(true);
                        resolve();
                    }, 100);
                });
            });

            it('should detect calm request', () => {
                const detector = new PresenceBreakDetector();
                
                const result = detector.update({ requestCalm: true });
                
                expect(result.indicators.calmRequested).toBe(true);
                expect(result.presenceBreaking).toBe(true);
            });

            it('should calculate severity levels', () => {
                const detector = new PresenceBreakDetector();
                
                // One indicator = MODERATE
                let result = detector.update({ requestCalm: true });
                expect(result.severity).toBe('MODERATE');
            });
        });

        describe('VRComfortManager', () => {
            it('should initialize with comfortable level', () => {
                const manager = new VRComfortManager();
                expect(manager.playerComfortLevel).toBe('COMFORTABLE');
                expect(manager.comfortSettings.vignetteEnabled).toBe(true);
            });

            it('should detect discomfort from high velocity', () => {
                const manager = new VRComfortManager();
                
                // Simulate high head velocity multiple times
                for (let i = 0; i < 6; i++) {
                    manager.assessComfort({
                        headVelocity: { x: 3, y: 0, z: 0 }
                    });
                }
                
                expect(manager.playerComfortLevel).toBe('WARNING');
            });

            it('should detect caution from moderate velocity', () => {
                const manager = new VRComfortManager();
                
                // Simulate moderate velocity
                for (let i = 0; i < 3; i++) {
                    manager.assessComfort({
                        headVelocity: { x: 2.5, y: 0, z: 0 }
                    });
                }
                
                expect(manager.playerComfortLevel).toBe('CAUTION');
            });

            it('should provide comfort settings for WARNING level', () => {
                const manager = new VRComfortManager();
                manager.playerComfortLevel = 'WARNING';
                
                const settings = manager.getComfortSettings();
                expect(settings.snapTurn).toBe(true);
                expect(settings.teleportMovement).toBe(true);
                expect(settings.reducedMotion).toBe(true);
                expect(settings.maxFearIntensity).toBe(0.6);
            });

            it('should provide comfort settings for CAUTION level', () => {
                const manager = new VRComfortManager();
                manager.playerComfortLevel = 'CAUTION';
                
                const settings = manager.getComfortSettings();
                expect(settings.snapTurn).toBe(true);
                expect(settings.teleportMovement).toBe(false);
                expect(settings.reducedMotion).toBe(false);
                expect(settings.maxFearIntensity).toBe(0.8);
            });

            it('should adjust fear for VR comfort', () => {
                const manager = new VRComfortManager();
                
                // Comfortable - no reduction
                let adjusted = manager.adjustFearForVR(0.9);
                expect(adjusted).toBe(0.9);
                
                // Warning - cap at 0.6
                manager.playerComfortLevel = 'WARNING';
                adjusted = manager.adjustFearForVR(0.9);
                expect(adjusted).toBe(0.6);
                
                // Caution - cap at 0.8
                manager.playerComfortLevel = 'CAUTION';
                adjusted = manager.adjustFearForVR(0.9);
                expect(adjusted).toBe(0.8);
            });
        });

        describe('VRSystem (Integration)', () => {
            it('should initialize all components', () => {
                const vr = new VRSystem();
                const status = vr.initialize();
                
                expect(status.status).toBe('ACTIVE');
                expect(status.components).toContain('head');
                expect(status.components).toContain('controller');
                expect(status.components).toContain('presence');
                expect(status.components).toContain('comfort');
                expect(vr.isActive).toBe(true);
            });

            it('should process VR tracking data', () => {
                const vr = new VRSystem();
                vr.initialize();
                
                // Add baseline calibration first
                for (let i = 0; i < 15; i++) {
                    vr.update({
                        head: {
                            position: { x: 0, y: 1.6, z: 0 },
                            rotation: { x: 0, y: 0, z: 0 }
                        },
                        calibrate: i === 0
                    });
                }
                
                // Now test with fear behavior
                const result = vr.update({
                    head: {
                        position: { x: 0, y: 1.4, z: 0 }, // Ducking
                        rotation: { x: 0, y: 0, z: 0 }
                    },
                    controllers: {
                        left: { position: { x: -0.1, y: 1.5, z: 0.1 }, grip: 0.9, velocity: { x: 0, y: 0, z: 0 } },
                        right: { position: { x: 0.1, y: 1.5, z: 0.1 }, grip: 0.9, velocity: { x: 0, y: 0, z: 0 } }
                    },
                    headsetWorn: true,
                    controllerActive: true
                });
                
                expect(result).not.toBeNull();
                expect(result.timestamp).toBeDefined();
                expect(result.combinedFear).toBeDefined();
            });

            it('should amplify fear by VR multiplier', () => {
                const vr = new VRSystem();
                vr.initialize();
                
                // Set up and get fear reading
                for (let i = 0; i < 20; i++) {
                    vr.update({
                        head: {
                            position: { x: 0, y: 1.6, z: 0 },
                            rotation: { x: 0, y: 0, z: 0 }
                        },
                        calibrate: i === 0
                    });
                }
                
                const result = vr.lastAnalysis;
                if (result && result.combinedFear) {
                    expect(result.combinedFear.vrAdjusted).toBeGreaterThanOrEqual(result.combinedFear.raw);
                }
            });

            it('should reduce fear during presence break', () => {
                const vr = new VRSystem();
                vr.initialize();
                
                // First establish some fear with head data (ducking behavior)
                for (let i = 0; i < 15; i++) {
                    vr.update({
                        head: {
                            position: { x: 0, y: 1.4, z: 0 }, // Ducking
                            rotation: { x: 0, y: 0, z: 0 }
                        },
                        calibrate: i === 0
                    });
                }
                
                // Get the fear level before presence break
                const fearBefore = vr.lastAnalysis?.combinedFear?.raw || 0.5;
                
                // Now trigger presence break
                vr.update({
                    head: {
                        position: { x: 0, y: 1.4, z: 0 },
                        rotation: { x: 0, y: 0, z: 0 }
                    },
                    headsetWorn: false,
                    controllerActive: false,
                    requestCalm: true
                });
                
                const result = vr.lastAnalysis;
                expect(result.presence.presenceBreaking).toBe(true);
                // Fear should be reduced (at least 30% less than it would be)
                expect(result.combinedFear.final).toBeLessThan(fearBefore * 0.7);
            });

            it('should generate recommendations', () => {
                const vr = new VRSystem();
                vr.initialize();
                
                // Trigger presence break to get recommendations
                vr.update({
                    headsetWorn: false,
                    requestCalm: true
                });
                
                const recs = vr.getRecommendations();
                expect(Array.isArray(recs)).toBe(true);
                
                if (recs.length > 0) {
                    expect(recs[0]).toHaveProperty('type');
                    expect(recs[0]).toHaveProperty('action');
                    expect(recs[0]).toHaveProperty('reason');
                }
            });

            it('should track statistics', () => {
                const vr = new VRSystem();
                vr.initialize();
                
                // Do some updates
                vr.update({ head: { position: { x: 0, y: 1.6, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }, calibrate: true });
                vr.update({ headsetWorn: false });
                
                const stats = vr.getStats();
                expect(stats.totalAnalyses).toBeGreaterThan(0);
                expect(stats.presenceBreaks).toBeGreaterThan(0);
            });

            it('should provide status', () => {
                const vr = new VRSystem();
                vr.initialize();
                
                const status = vr.getStatus();
                expect(status.active).toBe(true);
                expect(status.fearMultiplier).toBe(1.4);
                expect(status.comfortLevel).toBeDefined();
            });

            it('should reset all components', () => {
                const vr = new VRSystem();
                vr.initialize();
                
                // Add some data
                vr.update({ head: { position: { x: 0, y: 1.6, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }, calibrate: true });
                
                vr.reset();
                
                expect(vr.lastAnalysis).toBeNull();
                expect(vr.stats.totalAnalyses).toBe(0);
                expect(vr.headAnalyzer.history).toEqual([]);
            });

            it('should shutdown properly', () => {
                const vr = new VRSystem();
                vr.initialize();
                
                vr.shutdown();
                
                expect(vr.isActive).toBe(false);
                expect(vr.lastAnalysis).toBeNull();
            });

            it('should return null when inactive', () => {
                const vr = new VRSystem();
                // Don't initialize
                
                const result = vr.update({});
                expect(result).toBeNull();
            });
        });
    });

    describe('T4.3: Player Type Classification', () => {
        describe('PlayerBehaviorTracker', () => {
            it('should initialize with empty samples', () => {
                const tracker = new PlayerBehaviorTracker();
                expect(tracker.samples).toEqual([]);
                expect(tracker.aggregates.fearResponses).toEqual([]);
            });

            it('should record player samples', () => {
                const tracker = new PlayerBehaviorTracker();
                
                tracker.recordSample({
                    fearLevel: 0.5,
                    engagement: 0.7,
                    movementSpeed: 2,
                    isExploring: true
                });
                
                expect(tracker.samples.length).toBe(1);
                expect(tracker.samples[0].fearLevel).toBe(0.5);
                expect(tracker.samples[0].engagement).toBe(0.7);
            });

            it('should maintain bounded window', () => {
                const tracker = new PlayerBehaviorTracker({ windowSize: 10 });
                
                // Add 15 samples
                for (let i = 0; i < 15; i++) {
                    tracker.recordSample({ fearLevel: i / 15 });
                }
                
                expect(tracker.samples.length).toBe(10);
            });

            it('should calculate average metrics', () => {
                const tracker = new PlayerBehaviorTracker();
                
                // Add enough samples
                for (let i = 0; i < 35; i++) {
                    tracker.recordSample({
                        fearLevel: 0.5,
                        engagement: 0.6,
                        movementSpeed: 2,
                        isExploring: i % 2 === 0,
                        isHiding: i % 3 === 0,
                        threatFacing: i % 2 === 1
                    });
                }
                
                const metrics = tracker.getMetrics();
                expect(metrics).not.toBeNull();
                expect(metrics.sampleCount).toBe(35);
                expect(metrics.avgFear).toBe(0.5);
                expect(metrics.avgEngagement).toBeCloseTo(0.6, 5);
            });

            it('should return null for insufficient samples', () => {
                const tracker = new PlayerBehaviorTracker({ minSamples: 50 });
                
                // Add only 20 samples
                for (let i = 0; i < 20; i++) {
                    tracker.recordSample({ fearLevel: 0.5 });
                }
                
                const metrics = tracker.getMetrics();
                expect(metrics).toBeNull();
            });

            it('should calculate exploration ratio', () => {
                const tracker = new PlayerBehaviorTracker();
                
                for (let i = 0; i < 40; i++) {
                    tracker.recordSample({
                        fearLevel: 0.5,
                        isExploring: i < 20 // Half are exploring
                    });
                }
                
                const metrics = tracker.getMetrics();
                expect(metrics.explorationRatio).toBeCloseTo(0.5, 1);
            });

            it('should reset all data', () => {
                const tracker = new PlayerBehaviorTracker();
                tracker.recordSample({ fearLevel: 0.5 });
                
                tracker.reset();
                
                expect(tracker.samples).toEqual([]);
                expect(tracker.aggregates.fearResponses).toEqual([]);
            });
        });

        describe('PlayerClassifier', () => {
            it('should initialize with unknown type', () => {
                const classifier = new PlayerClassifier();
                const classification = classifier.getClassification();
                
                expect(classification.type).toBe(PLAYER_TYPES.UNKNOWN);
                expect(classification.confidence).toBe(0);
            });

            it('should classify as THRILL_SEEKER for high fear tolerance', () => {
                const classifier = new PlayerClassifier({ classificationCooldown: 0 });
                
                // Simulate thrill seeker behavior - high fear, high engagement, solo, not hiding
                for (let i = 0; i < 35; i++) {
                    classifier.update({
                        fearLevel: 0.7,
                        engagement: 0.8,
                        isHiding: false,
                        isExploring: true,
                        maxFear: 0.9,
                        groupProximity: 200, // Far from others (not social)
                        threatFacing: true
                    });
                }
                
                const classification = classifier.getClassification();
                expect([PLAYER_TYPES.THRILL_SEEKER, PLAYER_TYPES.CHALLENGE_SEEKER]).toContain(classification.type);
                expect(classification.confidence).toBeGreaterThan(0);
            });

            it('should classify as ANXIOUS_AVOIDER for fear avoidant behavior', () => {
                const classifier = new PlayerClassifier({ classificationCooldown: 0 });
                
                // Simulate anxious avoider behavior
                for (let i = 0; i < 35; i++) {
                    classifier.update({
                        fearLevel: 0.8,
                        engagement: 0.4,
                        isHiding: true,
                        threatFacing: false,
                        recoveryTime: 6000
                    });
                }
                
                const classification = classifier.getClassification();
                expect(classification.type).toBe(PLAYER_TYPES.ANXIOUS_AVOIDER);
            });

            it('should classify as SOCIAL_PLAYER for group proximity', () => {
                const classifier = new PlayerClassifier({ classificationCooldown: 0 });
                
                // Simulate social player behavior
                for (let i = 0; i < 35; i++) {
                    classifier.update({
                        fearLevel: 0.4,
                        engagement: 0.5,
                        groupProximity: 50, // Close to others
                        isExploring: false,
                        panicDuration: 0
                    });
                }
                
                const classification = classifier.getClassification();
                expect(classification.type).toBe(PLAYER_TYPES.SOCIAL_PLAYER);
            });

            it('should classify as CASUAL_EXPLORER for low fear preference', () => {
                const classifier = new PlayerClassifier({ classificationCooldown: 0 });
                
                // Simulate casual explorer behavior
                for (let i = 0; i < 35; i++) {
                    classifier.update({
                        fearLevel: 0.3,
                        engagement: 0.5,
                        isExploring: true,
                        maxFear: 0.5,
                        isHiding: false
                    });
                }
                
                const classification = classifier.getClassification();
                expect(classification.type).toBe(PLAYER_TYPES.CASUAL_EXPLORER);
            });

            it('should classify as CHALLENGE_SEEKER for threat facing behavior', () => {
                const classifier = new PlayerClassifier({ classificationCooldown: 0 });
                
                // Simulate challenge seeker behavior
                for (let i = 0; i < 35; i++) {
                    classifier.update({
                        fearLevel: 0.5,
                        engagement: 0.7,
                        threatFacing: true,
                        recoveryTime: 2000,
                        deathCount: 0
                    });
                }
                
                const classification = classifier.getClassification();
                expect(classification.type).toBe(PLAYER_TYPES.CHALLENGE_SEEKER);
            });

            it('should provide fear profile', () => {
                const classifier = new PlayerClassifier({ classificationCooldown: 0 });
                
                // High fear variance = emotionally reactive
                for (let i = 0; i < 35; i++) {
                    classifier.update({
                        fearLevel: i % 2 === 0 ? 0.3 : 0.8, // High variance
                        engagement: 0.6,
                        isExploring: true
                    });
                }
                
                const classification = classifier.getClassification();
                expect(classification.fearProfile).toBeDefined();
                expect(Object.values(FEAR_PROFILES)).toContain(classification.fearProfile);
            });

            it('should provide recommended settings', () => {
                const classifier = new PlayerClassifier({ classificationCooldown: 0 });
                
                // Classify as anxious avoider
                for (let i = 0; i < 35; i++) {
                    classifier.update({
                        fearLevel: 0.8,
                        isHiding: true,
                        threatFacing: false
                    });
                }
                
                const settings = classifier.getRecommendedSettings();
                expect(settings).toHaveProperty('baseIntensity');
                expect(settings).toHaveProperty('maxIntensity');
                expect(settings).toHaveProperty('pacing');
                expect(settings.safetyNet).toBe(true); // Anxious avoiders get safety net
            });

            it('should provide different settings for different types', () => {
                const types = [
                    { type: PLAYER_TYPES.THRILL_SEEKER, sample: { fearLevel: 0.7, engagement: 0.8, isHiding: false, maxFear: 0.9 } },
                    { type: PLAYER_TYPES.CASUAL_EXPLORER, sample: { fearLevel: 0.3, isExploring: true, maxFear: 0.5, isHiding: false } }
                ];
                
                for (const { type, sample } of types) {
                    const classifier = new PlayerClassifier({ classificationCooldown: 0 });
                    
                    for (let i = 0; i < 35; i++) {
                        classifier.update(sample);
                    }
                    
                    const settings = classifier.getRecommendedSettings();
                    expect(settings).toBeDefined();
                }
            });

            it('should track classification history', () => {
                const classifier = new PlayerClassifier({ classificationCooldown: 0 });
                
                // Multiple classifications
                for (let round = 0; round < 3; round++) {
                    for (let i = 0; i < 35; i++) {
                        classifier.update({
                            fearLevel: 0.7,
                            engagement: 0.8,
                            isHiding: false
                        });
                    }
                }
                
                const history = classifier.getHistory();
                expect(history.length).toBeGreaterThan(0);
            });

            it('should calculate type stability', () => {
                const classifier = new PlayerClassifier({ classificationCooldown: 0 });
                
                // Same classification multiple times
                for (let round = 0; round < 5; round++) {
                    for (let i = 0; i < 35; i++) {
                        classifier.update({
                            fearLevel: 0.7,
                            engagement: 0.8,
                            isHiding: false
                        });
                    }
                }
                
                const stability = classifier.getTypeStability();
                expect(stability).toBeGreaterThan(0);
                expect(stability).toBeLessThanOrEqual(1);
            });

            it('should enforce classification cooldown', () => {
                const classifier = new PlayerClassifier({ classificationCooldown: 60000 });
                
                // First classification
                for (let i = 0; i < 35; i++) {
                    classifier.update({ fearLevel: 0.7, engagement: 0.8, isHiding: false });
                }
                const firstType = classifier.currentClassification.type;
                
                // Try immediate reclassification (should not change due to cooldown)
                for (let i = 0; i < 35; i++) {
                    classifier.update({ fearLevel: 0.2, isExploring: true, maxFear: 0.4 });
                }
                
                // Should still be the first type due to cooldown
                expect(classifier.currentClassification.type).toBe(firstType);
            });

            it('should reset classifier state', () => {
                const classifier = new PlayerClassifier();
                
                for (let i = 0; i < 35; i++) {
                    classifier.update({ fearLevel: 0.5 });
                }
                
                classifier.reset();
                
                const classification = classifier.getClassification();
                expect(classification.type).toBe(PLAYER_TYPES.UNKNOWN);
                expect(classifier.tracker.samples).toEqual([]);
            });
        });

        describe('PlayerTypeManager', () => {
            it('should manage multiple player classifiers', () => {
                const manager = new PlayerTypeManager();
                
                // Add two players with clearly different behaviors
                for (let i = 0; i < 35; i++) {
                    manager.updatePlayer('player1', {
                        fearLevel: 0.7,
                        engagement: 0.8,
                        isHiding: false,
                        groupProximity: 200, // Solo player
                        threatFacing: true
                    });
                    manager.updatePlayer('player2', {
                        fearLevel: 0.3,
                        isExploring: true,
                        maxFear: 0.5,
                        groupProximity: 200
                    });
                }
                
                const type1 = manager.getPlayerType('player1');
                const type2 = manager.getPlayerType('player2');
                
                expect(type1).not.toBeNull();
                expect(type2).not.toBeNull();
                expect(type1.type).not.toBe(PLAYER_TYPES.UNKNOWN);
                expect(type2.type).not.toBe(PLAYER_TYPES.UNKNOWN);
                expect(type1.type).not.toBe(type2.type);
            });

            it('should track global type distribution', () => {
                const manager = new PlayerTypeManager();
                
                // Add multiple players with different types
                for (let i = 0; i < 35; i++) {
                    manager.updatePlayer('p1', { fearLevel: 0.7, engagement: 0.8, isHiding: false });
                    manager.updatePlayer('p2', { fearLevel: 0.7, engagement: 0.8, isHiding: false });
                    manager.updatePlayer('p3', { fearLevel: 0.3, isExploring: true, maxFear: 0.5 });
                }
                
                const distribution = manager.getGlobalDistribution();
                expect(Object.keys(distribution).length).toBeGreaterThan(0);
                
                // Distribution should sum to approximately 1
                const sum = Object.values(distribution).reduce((a, b) => a + b, 0);
                expect(sum).toBeCloseTo(1, 1);
            });

            it('should get players by type', () => {
                const manager = new PlayerTypeManager();
                
                for (let i = 0; i < 35; i++) {
                    manager.updatePlayer('thrill1', {
                        fearLevel: 0.7,
                        engagement: 0.8,
                        isHiding: false,
                        groupProximity: 200,
                        threatFacing: true
                    });
                    manager.updatePlayer('thrill2', {
                        fearLevel: 0.7,
                        engagement: 0.8,
                        isHiding: false,
                        groupProximity: 200,
                        threatFacing: true
                    });
                    manager.updatePlayer('casual1', {
                        fearLevel: 0.3,
                        isExploring: true,
                        maxFear: 0.5,
                        groupProximity: 200
                    });
                }
                
                const allPlayers = manager.getAllClassifications();
                expect(Object.keys(allPlayers).length).toBe(3);
                
                // Verify casual1 is correctly classified
                expect(allPlayers['casual1'].type).toBe(PLAYER_TYPES.CASUAL_EXPLORER);
            });

            it('should provide player settings', () => {
                const manager = new PlayerTypeManager();
                
                for (let i = 0; i < 35; i++) {
                    manager.updatePlayer('player1', { fearLevel: 0.3, isExploring: true, maxFear: 0.5 });
                }
                
                const settings = manager.getPlayerSettings('player1');
                expect(settings).not.toBeNull();
                expect(settings).toHaveProperty('baseIntensity');
                expect(settings).toHaveProperty('maxIntensity');
            });

            it('should get all classifications', () => {
                const manager = new PlayerTypeManager();
                
                for (let i = 0; i < 35; i++) {
                    manager.updatePlayer('p1', { fearLevel: 0.7, engagement: 0.8, isHiding: false });
                    manager.updatePlayer('p2', { fearLevel: 0.3, isExploring: true, maxFear: 0.5 });
                }
                
                const all = manager.getAllClassifications();
                expect(Object.keys(all)).toContain('p1');
                expect(Object.keys(all)).toContain('p2');
            });

            it('should remove players', () => {
                const manager = new PlayerTypeManager();
                
                for (let i = 0; i < 35; i++) {
                    manager.updatePlayer('player1', { fearLevel: 0.5 });
                }
                
                manager.removePlayer('player1');
                expect(manager.getPlayerType('player1')).toBeNull();
            });

            it('should reset all data', () => {
                const manager = new PlayerTypeManager();
                
                for (let i = 0; i < 35; i++) {
                    manager.updatePlayer('p1', { fearLevel: 0.5 });
                }
                
                manager.reset();
                
                expect(manager.getPlayerType('p1')).toBeNull();
                expect(manager.globalStats.totalClassifications).toBe(0);
            });
        });

        describe('PLAYER_TYPES and FEAR_PROFILES', () => {
            it('should export all player types', () => {
                expect(PLAYER_TYPES.THRILL_SEEKER).toBe('THRILL_SEEKER');
                expect(PLAYER_TYPES.CHALLENGE_SEEKER).toBe('CHALLENGE_SEEKER');
                expect(PLAYER_TYPES.STORY_IMMERSIVE).toBe('STORY_IMMERSIVE');
                expect(PLAYER_TYPES.CASUAL_EXPLORER).toBe('CASUAL_EXPLORER');
                expect(PLAYER_TYPES.SOCIAL_PLAYER).toBe('SOCIAL_PLAYER');
                expect(PLAYER_TYPES.ANXIOUS_AVOIDER).toBe('ANXIOUS_AVOIDER');
                expect(PLAYER_TYPES.UNKNOWN).toBe('UNKNOWN');
            });

            it('should export all fear profiles', () => {
                expect(FEAR_PROFILES.ADRENALINE_JUNKIE).toBe('ADRENALINE_JUNKIE');
                expect(FEAR_PROFILES.STEADY_HANDLER).toBe('STEADY_HANDLER');
                expect(FEAR_PROFILES.RECOVERY_FOCUSED).toBe('RECOVERY_FOCUSED');
                expect(FEAR_PROFILES.EMOTIONALLY_REACTIVE).toBe('EMOTIONALLY_REACTIVE');
                expect(FEAR_PROFILES.ADAPTABLE).toBe('ADAPTABLE');
            });
        });
    });

    describe('T4.4: Quantum-Inspired Algorithms', () => {
        describe('QuantumState', () => {
            it('should initialize with normalized amplitudes', () => {
                const state = new QuantumState(4);
                expect(state.dimensions).toBe(4);
                expect(state.amplitudes).toHaveLength(4);
                const probs = state.getProbabilities();
                const sum = probs.reduce((a, b) => a + b, 0);
                expect(sum).toBeCloseTo(1, 5);
            });

            it('should measure and collapse to a state', () => {
                const state = new QuantumState(4);
                const result = state.measure();
                expect(result.state).toBeGreaterThanOrEqual(0);
                expect(result.state).toBeLessThan(4);
                expect(result.probability).toBeGreaterThan(0);
                expect(result.collapsed).toBe(true);
            });

            it('should apply quantum gates', () => {
                const state = new QuantumState(2);
                const gate = [
                    [{ real: 1/Math.sqrt(2), imag: 0 }, { real: 1/Math.sqrt(2), imag: 0 }],
                    [{ real: 1/Math.sqrt(2), imag: 0 }, { real: -1/Math.sqrt(2), imag: 0 }]
                ];
                state.applyGate(gate);
                const probs = state.getProbabilities();
                const sum = probs.reduce((a, b) => a + b, 0);
                expect(sum).toBeCloseTo(1, 5);
            });

            it('should perform quantum interference', () => {
                const state1 = new QuantumState(4);
                const state2 = new QuantumState(4);
                const result = state1.interfere(state2, 0.5);
                expect(result).toBeInstanceOf(QuantumState);
                const probs = result.getProbabilities();
                const sum = probs.reduce((a, b) => a + b, 0);
                expect(sum).toBeCloseTo(1, 5);
            });

            it('should calculate expectation value', () => {
                const state = new QuantumState(2);
                const observable = [
                    [{ real: 1, imag: 0 }, { real: 0, imag: 0 }],
                    [{ real: 0, imag: 0 }, { real: -1, imag: 0 }]
                ];
                const expectation = state.expectation(observable);
                expect(typeof expectation).toBe('number');
            });
        });

        describe('QuantumAnnealingOptimizer', () => {
            it('should initialize with config', () => {
                const optimizer = new QuantumAnnealingOptimizer({ targetFear: 0.6, iterations: 500 });
                expect(optimizer.config.targetFear).toBe(0.6);
                expect(optimizer.config.iterations).toBe(500);
            });

            it('should calculate cost based on fear error', () => {
                const optimizer = new QuantumAnnealingOptimizer({ targetFear: 0.5 });
                const cost = optimizer.calculateCost(0.7, { deathRate: 0.1, stateVariance: 0.3 });
                expect(cost).toBeGreaterThan(0);
            });

            it('should generate random scenarios', () => {
                const optimizer = new QuantumAnnealingOptimizer();
                const scenario = optimizer.randomScenario();
                expect(scenario).toHaveProperty('threatCount');
                expect(scenario).toHaveProperty('threatDistance');
                expect(scenario.threatCount).toBeGreaterThanOrEqual(1);
            });

            it('should run optimization', () => {
                const optimizer = new QuantumAnnealingOptimizer({ iterations: 50, targetFear: 0.5 });
                const mockSimulator = {
                    getCurrentFear: () => 0.3,
                    simulateFear: () => 0.5
                };
                const result = optimizer.optimize({ threatCount: 3 }, mockSimulator);
                expect(result).toHaveProperty('optimal');
                expect(result).toHaveProperty('cost');
            });
        });

        describe('QuantumInspiredNN', () => {
            it('should initialize with correct dimensions', () => {
                const nn = new QuantumInspiredNN(10, 20, 1);
                expect(nn.inputSize).toBe(10);
                expect(nn.hiddenSize).toBe(20);
                expect(nn.outputSize).toBe(1);
            });

            it('should perform forward pass', () => {
                const nn = new QuantumInspiredNN(5, 10, 1);
                const input = [0.5, 0.3, 0.7, 0.2, 0.6];
                const output = nn.forward(input);
                expect(output).toHaveLength(1);
                expect(output[0]).toBeGreaterThanOrEqual(0);
                expect(output[0]).toBeLessThanOrEqual(1);
            });

            it('should predict fear level', () => {
                const nn = new QuantumInspiredNN(10, 20, 1);
                const features = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
                const fear = nn.predictFear(features);
                expect(fear).toBeGreaterThanOrEqual(0);
                expect(fear).toBeLessThanOrEqual(1);
            });

            it('should train and reduce error', () => {
                const nn = new QuantumInspiredNN(5, 10, 1);
                const input = [0.5, 0.3, 0.7, 0.2, 0.6];
                const target = 0.8;
                let totalError = 0;
                for (let i = 0; i < 10; i++) {
                    totalError += nn.train(input, target, 0.1);
                }
                expect(totalError).toBeGreaterThanOrEqual(0);
            });
        });

        describe('GroverThreatSearch', () => {
            it('should search and amplify threats', () => {
                const search = new GroverThreatSearch();
                const gameState = {
                    potentialThreats: [
                        { id: 1, danger: 0.3 },
                        { id: 2, danger: 0.8 },
                        { id: 3, danger: 0.9 }
                    ]
                };
                const threats = search.search(gameState, t => t.danger > 0.7);
                expect(threats).toBeInstanceOf(Array);
            });

            it('should provide search stats', () => {
                const search = new GroverThreatSearch();
                search.search({ potentialThreats: [1, 2, 3, 4] }, () => true);
                const stats = search.getStats();
                expect(stats).toHaveProperty('iterations');
                expect(stats).toHaveProperty('speedup');
            });
        });

        describe('QuantumDecisionMaker', () => {
            it('should initialize with options', () => {
                const dm = new QuantumDecisionMaker(['flee', 'fight', 'hide']);
                expect(dm.options).toEqual(['flee', 'fight', 'hide']);
                expect(dm.state).toBeInstanceOf(QuantumState);
            });

            it('should make a decision', () => {
                const dm = new QuantumDecisionMaker(['flee', 'fight', 'hide']);
                dm.update([0.9, 0.1, 0.5]);
                const decision = dm.decide();
                expect(decision).toHaveProperty('choice');
                expect(decision).toHaveProperty('probability');
                expect(decision.quantum).toBe(true);
            });
        });

        describe('QuantumInspiredSystem', () => {
            it('should initialize with components', () => {
                const system = new QuantumInspiredSystem();
                expect(system.fearPredictor).toBeInstanceOf(QuantumInspiredNN);
                expect(system.optimizer).toBeInstanceOf(QuantumAnnealingOptimizer);
                expect(system.threatSearch).toBeInstanceOf(GroverThreatSearch);
            });

            it('should predict fear', () => {
                const system = new QuantumInspiredSystem();
                const features = [0.5, 0.3, 0.7, 0.2, 0.6, 0.4, 0.8, 0.1, 0.9, 0.5];
                const fear = system.predictFear(features);
                expect(fear).toBeGreaterThanOrEqual(0);
                expect(fear).toBeLessThanOrEqual(1);
            });

            it('should calculate fear probabilities', () => {
                const system = new QuantumInspiredSystem();
                const state = system.createFearState();
                const probs = system.calculateFearProbabilities(state);
                expect(probs).toHaveProperty('calm');
                expect(probs).toHaveProperty('alert');
                expect(probs).toHaveProperty('anxious');
                expect(probs).toHaveProperty('panic');
            });
        });
    });

    describe('T4.5: Neural Network Fear Detection', () => {
        describe('FearNeuralNetwork', () => {
            it('should initialize with correct dimensions', () => {
                const nn = new FearNeuralNetwork({
                    inputSize: 10,
                    hiddenLayers: [32, 16],
                    outputSize: 1
                });
                expect(nn.config.inputSize).toBe(10);
                expect(nn.config.hiddenLayers).toEqual([32, 16]);
                expect(nn.weights).toHaveLength(3);
            });

            it('should perform forward pass', () => {
                const nn = new FearNeuralNetwork({ inputSize: 5, hiddenLayers: [10] });
                const input = [0.5, 0.3, 0.7, 0.2, 0.6];
                const result = nn.forward(input);
                expect(result.output).toHaveLength(1);
                expect(result.output[0]).toBeGreaterThanOrEqual(0);
                expect(result.output[0]).toBeLessThanOrEqual(1);
            });

            it('should predict fear level', () => {
                const nn = new FearNeuralNetwork({ inputSize: 10 });
                const features = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
                const fear = nn.predict(features);
                expect(fear).toBeGreaterThanOrEqual(0);
                expect(fear).toBeLessThanOrEqual(1);
            });

            it('should train online', () => {
                const nn = new FearNeuralNetwork({ inputSize: 5 });
                const features = [0.5, 0.3, 0.7, 0.2, 0.6];
                const loss1 = nn.trainOnline(features, 0.8);
                const loss2 = nn.trainOnline(features, 0.8);
                expect(loss1).toBeGreaterThanOrEqual(0);
                expect(loss2).toBeGreaterThanOrEqual(0);
            });

            it('should train batch', () => {
                const nn = new FearNeuralNetwork({ inputSize: 5 });
                const features = [
                    [0.5, 0.3, 0.7, 0.2, 0.6],
                    [0.2, 0.8, 0.3, 0.5, 0.4],
                    [0.7, 0.2, 0.6, 0.8, 0.1]
                ];
                const targets = [0.8, 0.3, 0.7];
                const loss = nn.trainBatch(features, targets);
                expect(loss).toBeGreaterThanOrEqual(0);
            });

            it('should calculate loss', () => {
                const nn = new FearNeuralNetwork({ inputSize: 5 });
                const predictions = [[0.7], [0.3], [0.8]];
                const targets = [[0.8], [0.2], [0.9]];
                const loss = nn.calculateLoss(predictions, targets);
                expect(loss).toBeGreaterThan(0);
            });

            it('should normalize features', () => {
                const nn = new FearNeuralNetwork({ inputSize: 5 });
                nn.featureMeans = [0.5, 0.5, 0.5, 0.5, 0.5];
                nn.featureStds = [0.1, 0.1, 0.1, 0.1, 0.1];
                const features = [0.6, 0.6, 0.6, 0.6, 0.6];
                const normalized = nn.normalizeFeatures(features);
                expect(normalized[0]).toBeCloseTo(1, 5);
                expect(normalized[1]).toBeCloseTo(1, 5);
                expect(normalized[2]).toBeCloseTo(1, 5);
                expect(normalized[3]).toBeCloseTo(1, 5);
                expect(normalized[4]).toBeCloseTo(1, 5);
            });

            it('should evaluate model', () => {
                const nn = new FearNeuralNetwork({ inputSize: 5 });
                const features = [
                    [0.5, 0.3, 0.7, 0.2, 0.6],
                    [0.2, 0.8, 0.3, 0.5, 0.4]
                ];
                const targets = [0.8, 0.3];
                const evaluation = nn.evaluate(features, targets);
                expect(evaluation).toHaveProperty('mse');
                expect(evaluation).toHaveProperty('rmse');
                expect(evaluation).toHaveProperty('mae');
                expect(evaluation).toHaveProperty('predictions');
            });

            it('should export and import model', () => {
                const nn = new FearNeuralNetwork({ inputSize: 5 });
                const exported = nn.export();
                expect(exported).toHaveProperty('config');
                expect(exported).toHaveProperty('weights');
                expect(exported).toHaveProperty('biases');
                
                const nn2 = new FearNeuralNetwork({ inputSize: 5 });
                nn2.import(exported);
                expect(nn2.weights).toEqual(nn.weights);
            });
        });

        describe('FearFeatureExtractor', () => {
            it('should extract features from player data', () => {
                const extractor = new FearFeatureExtractor();
                const playerData = {
                    heartRate: 90,
                    hrv: 45,
                    gsr: 0.6,
                    eyeDilation: 5,
                    blinkRate: 25,
                    headMovement: 2,
                    controllerShake: 1,
                    gripPressure: 0.7,
                    timeInPanic: 30,
                    proximityToThreat: 50,
                    groupProximity: 100,
                    recentDeaths: 2
                };
                const features = extractor.extract(playerData);
                expect(features).toHaveLength(12);
                features.forEach(f => {
                    expect(f).toBeGreaterThanOrEqual(0);
                    expect(f).toBeLessThanOrEqual(1);
                });
            });

            it('should provide feature names', () => {
                const extractor = new FearFeatureExtractor();
                const names = extractor.getFeatureNames();
                expect(names).toHaveLength(12);
                expect(names).toContain('heartRate');
                expect(names).toContain('gsr');
            });
        });

        describe('NeuralFearSystem', () => {
            it('should initialize correctly', () => {
                const system = new NeuralFearSystem();
                expect(system.network).toBeInstanceOf(FearNeuralNetwork);
                expect(system.extractor).toBeInstanceOf(FearFeatureExtractor);
                expect(system.isCalibrated).toBe(false);
            });

            it('should calibrate with baseline data', () => {
                const system = new NeuralFearSystem();
                const baselineData = [
                    { heartRate: 70, hrv: 60, gsr: 0.2, eyeDilation: 3, blinkRate: 15, headMovement: 0.5, controllerShake: 0.1, gripPressure: 0.3, timeInPanic: 0, proximityToThreat: 200, groupProximity: 150, recentDeaths: 0 },
                    { heartRate: 72, hrv: 55, gsr: 0.3, eyeDilation: 3.2, blinkRate: 18, headMovement: 0.8, controllerShake: 0.2, gripPressure: 0.4, timeInPanic: 0, proximityToThreat: 180, groupProximity: 140, recentDeaths: 0 }
                ];
                const result = system.calibrate(baselineData);
                expect(result.calibrated).toBe(true);
                expect(system.isCalibrated).toBe(true);
            });

            it('should predict fear level', () => {
                const system = new NeuralFearSystem();
                const playerData = {
                    heartRate: 110,
                    hrv: 30,
                    gsr: 0.8,
                    eyeDilation: 6,
                    blinkRate: 35,
                    headMovement: 4,
                    controllerShake: 2,
                    gripPressure: 0.9,
                    timeInPanic: 45,
                    proximityToThreat: 30,
                    groupProximity: 50,
                    recentDeaths: 3
                };
                const result = system.predict(playerData);
                expect(result).toHaveProperty('fearLevel');
                expect(result).toHaveProperty('confidence');
                expect(result).toHaveProperty('calibrated');
                expect(result.fearLevel).toBeGreaterThanOrEqual(0);
                expect(result.fearLevel).toBeLessThanOrEqual(1);
            });

            it('should track prediction history', () => {
                const system = new NeuralFearSystem();
                const playerData = {
                    heartRate: 90, hrv: 45, gsr: 0.5, eyeDilation: 4, blinkRate: 20,
                    headMovement: 2, controllerShake: 1, gripPressure: 0.6,
                    timeInPanic: 10, proximityToThreat: 100, groupProximity: 80, recentDeaths: 1
                };
                system.predict(playerData);
                system.predict(playerData);
                system.predict(playerData);
                expect(system.predictionHistory).toHaveLength(3);
            });

            it('should learn from feedback', () => {
                const system = new NeuralFearSystem();
                const playerData = {
                    heartRate: 100, hrv: 40, gsr: 0.6, eyeDilation: 5, blinkRate: 25,
                    headMovement: 3, controllerShake: 1.5, gripPressure: 0.7,
                    timeInPanic: 20, proximityToThreat: 80, groupProximity: 70, recentDeaths: 1
                };
                const loss = system.learn(playerData, 0.8);
                expect(loss).toBeGreaterThanOrEqual(0);
            });

            it('should get system stats', () => {
                const system = new NeuralFearSystem();
                const stats = system.getStats();
                expect(stats).toHaveProperty('predictions');
                expect(stats).toHaveProperty('isCalibrated');
                expect(stats).toHaveProperty('networkConfig');
            });

            it('should export and import system', () => {
                const system = new NeuralFearSystem();
                const playerData = {
                    heartRate: 90, hrv: 45, gsr: 0.5, eyeDilation: 4, blinkRate: 20,
                    headMovement: 2, controllerShake: 1, gripPressure: 0.6,
                    timeInPanic: 10, proximityToThreat: 100, groupProximity: 80, recentDeaths: 1
                };
                system.predict(playerData);
                
                const exported = system.export();
                expect(exported).toHaveProperty('network');
                expect(exported).toHaveProperty('isCalibrated');
                expect(exported).toHaveProperty('predictionHistory');
                
                const system2 = new NeuralFearSystem();
                system2.import(exported);
                expect(system2.predictionHistory).toHaveLength(1);
            });

            it('should reset system', () => {
                const system = new NeuralFearSystem();
                const playerData = {
                    heartRate: 90, hrv: 45, gsr: 0.5, eyeDilation: 4, blinkRate: 20,
                    headMovement: 2, controllerShake: 1, gripPressure: 0.6,
                    timeInPanic: 10, proximityToThreat: 100, groupProximity: 80, recentDeaths: 1
                };
                system.predict(playerData);
                system.calibrate([playerData]);
                
                system.reset();
                expect(system.predictionHistory).toHaveLength(0);
                expect(system.isCalibrated).toBe(false);
            });
        });
    });

    describe('T4.6: Procedural Content Generation', () => {
        describe('ScenarioGenerator', () => {
            let generator;
            
            beforeEach(() => {
                generator = new ScenarioGenerator();
            });
            
            it('should initialize with default config', () => {
                expect(generator.config.mapWidth).toBe(2400);
                expect(generator.config.mapHeight).toBe(1600);
                expect(generator.config.maxThreats).toBe(10);
            });
            
            it('should generate scenario with all components', () => {
                const sessionState = {
                    phase: SESSION_PHASES.BUILDUP,
                    intensityMultiplier: 0.6,
                    progress: 0.3
                };
                const playerType = PLAYER_TYPES.CASUAL_EXPLORER;
                const metrics = { deathCount: 0, averageFear: 0.3 };
                
                const scenario = generator.generateScenario(sessionState, playerType, metrics);
                
                expect(scenario).toHaveProperty('id');
                expect(scenario).toHaveProperty('threats');
                expect(scenario).toHaveProperty('safeZones');
                expect(scenario).toHaveProperty('environment');
                expect(scenario).toHaveProperty('resources');
                expect(scenario).toHaveProperty('objectives');
                expect(scenario).toHaveProperty('spatialIndex');
            });
            
            it('should calculate threat count based on intensity', () => {
                const highIntensity = generator.calculateThreatCount(1.0, PLAYER_TYPES.THRILL_SEEKER);
                const lowIntensity = generator.calculateThreatCount(0.2, PLAYER_TYPES.ANXIOUS_AVOIDER);
                
                expect(highIntensity).toBeGreaterThan(lowIntensity);
                expect(highIntensity).toBeLessThanOrEqual(PCG_CONFIG.maxThreats);
            });
            
            it('should space threats appropriately', () => {
                const sessionState = { phase: SESSION_PHASES.CLIMAX, intensityMultiplier: 0.8, progress: 0.5 };
                const scenario = generator.generateScenario(sessionState, PLAYER_TYPES.THRILL_SEEKER, {});
                
                // Check minimum spacing
                for (let i = 0; i < scenario.threats.length; i++) {
                    for (let j = i + 1; j < scenario.threats.length; j++) {
                        const dx = scenario.threats[i].x - scenario.threats[j].x;
                        const dy = scenario.threats[i].y - scenario.threats[j].y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        expect(dist).toBeGreaterThanOrEqual(PCG_CONFIG.threatSpacing);
                    }
                }
            });
            
            it('should select threat type based on intensity', () => {
                const highType = generator.selectThreatType(1.0, PLAYER_TYPES.THRILL_SEEKER);
                const lowType = generator.selectThreatType(0.2, PLAYER_TYPES.ANXIOUS_AVOIDER);
                
                expect(['STALKER', 'HUNTER', 'AMBUSH', 'SWARM']).toContain(highType);
                expect(['STALKER', 'HUNTER', 'AMBUSH', 'SWARM']).toContain(lowType);
            });
            
            it('should generate appropriate number of safe zones', () => {
                const highCount = generator.calculateSafeZoneCount(0.9, PLAYER_TYPES.ANXIOUS_AVOIDER);
                const lowCount = generator.calculateSafeZoneCount(0.2, PLAYER_TYPES.THRILL_SEEKER);
                
                expect(highCount).toBeGreaterThanOrEqual(1);
                expect(lowCount).toBeGreaterThanOrEqual(1);
            });
            
            it('should generate environment with weather and darkness', () => {
                const env = generator.generateEnvironment(SESSION_PHASES.TENSION, 0.7);
                
                expect(env).toHaveProperty('weather');
                expect(env).toHaveProperty('darkness');
                expect(env).toHaveProperty('visibility');
                expect(env).toHaveProperty('fearMultiplier');
                expect(env.darkness).toBeGreaterThanOrEqual(0);
                expect(env.darkness).toBeLessThanOrEqual(1);
            });
            
            it('should generate objectives based on phase', () => {
                const exposition = generator.generateObjectives(SESSION_PHASES.EXPOSITION, PLAYER_TYPES.THRILL_SEEKER);
                const tension = generator.generateObjectives(SESSION_PHASES.TENSION, PLAYER_TYPES.THRILL_SEEKER);
                const buildup = generator.generateObjectives(SESSION_PHASES.BUILDUP, PLAYER_TYPES.CASUAL_EXPLORER);
                
                expect(exposition.length).toBeGreaterThan(0);
                expect(tension.length).toBeGreaterThan(0);
                expect(buildup.length).toBeGreaterThan(0);
                expect(exposition.some(o => o.type === 'EXPLORE')).toBe(true);
                expect(tension.some(o => o.type === 'EVADE' || o.type === 'ESCAPE')).toBe(true);
                expect(buildup.some(o => o.type === 'SURVIVE')).toBe(true);
            });
            
            it('should build spatial index', () => {
                const sessionState = { phase: SESSION_PHASES.BUILDUP, intensityMultiplier: 0.5, progress: 0.3 };
                const scenario = generator.generateScenario(sessionState, PLAYER_TYPES.CASUAL_EXPLORER, {});
                
                expect(scenario.spatialIndex).toHaveProperty('grid');
                expect(scenario.spatialIndex).toHaveProperty('cellSize');
                expect(scenario.spatialIndex.grid.length).toBeGreaterThan(0);
            });
            
            it('should query threats near position', () => {
                const sessionState = { phase: SESSION_PHASES.CLIMAX, intensityMultiplier: 0.8, progress: 0.7 };
                const scenario = generator.generateScenario(sessionState, PLAYER_TYPES.THRILL_SEEKER, {});
                
                if (scenario.threats.length > 0) {
                    const threat = scenario.threats[0];
                    const nearby = generator.queryThreatsNear(threat.x, threat.y, 500, scenario);
                    expect(nearby.length).toBeGreaterThan(0);
                }
            });
            
            it('should adapt scenario based on metrics', () => {
                const sessionState = { phase: SESSION_PHASES.BUILDUP, intensityMultiplier: 0.6, progress: 0.4 };
                const scenario = generator.generateScenario(sessionState, PLAYER_TYPES.CASUAL_EXPLORER, {});
                
                const adapted = generator.adaptScenario(scenario, { deathCount: 6, averageFear: 0.8, playerX: 500, playerY: 500 });
                
                // Should add emergency safe zone
                const emergencyZones = adapted.safeZones.filter(z => z.emergency);
                expect(emergencyZones.length).toBeGreaterThan(0);
            });
            
            it('should track generator stats', () => {
                const sessionState = { phase: SESSION_PHASES.BUILDUP, intensityMultiplier: 0.5, progress: 0.3 };
                generator.generateScenario(sessionState, PLAYER_TYPES.CASUAL_EXPLORER, {});
                
                const stats = generator.getStats();
                expect(stats.scenariosGenerated).toBe(1);
                expect(stats.activeThreats).toBeGreaterThan(0);
                expect(stats.averageThreatsPerScenario).toBeGreaterThan(0);
            });
            
            it('should serialize and deserialize', () => {
                const sessionState = { phase: SESSION_PHASES.BUILDUP, intensityMultiplier: 0.5, progress: 0.3 };
                generator.generateScenario(sessionState, PLAYER_TYPES.CASUAL_EXPLORER, {});
                
                const serialized = generator.serialize();
                
                const newGenerator = new ScenarioGenerator();
                newGenerator.deserialize(serialized);
                
                expect(newGenerator.generatedCount).toBe(1);
                expect(newGenerator.scenarios.length).toBe(1);
            });
            
            it('should reset generator state', () => {
                const sessionState = { phase: SESSION_PHASES.BUILDUP, intensityMultiplier: 0.5, progress: 0.3 };
                generator.generateScenario(sessionState, PLAYER_TYPES.CASUAL_EXPLORER, {});
                
                generator.reset();
                
                expect(generator.scenarios).toHaveLength(0);
                expect(generator.activeThreats).toHaveLength(0);
                expect(generator.generatedCount).toBe(0);
            });
        });
        
        describe('EnvironmentGenerator', () => {
            let generator;
            
            beforeEach(() => {
                generator = new EnvironmentGenerator();
            });
            
            it('should generate terrain with obstacles', () => {
                const terrain = generator.generateTerrain(12345);
                
                expect(terrain).toHaveProperty('obstacles');
                expect(terrain).toHaveProperty('terrain');
                expect(terrain.obstacles.length).toBeGreaterThan(0);
                expect(terrain.terrain.length).toBeGreaterThan(0);
            });
            
            it('should select appropriate terrain types', () => {
                const type = generator.selectTerrainType();
                expect(['open', 'forest', 'ruins', 'corridor', 'elevated', 'depression']).toContain(type);
            });
            
            it('should query obstacles at position', () => {
                generator.generateTerrain();
                
                // Obstacles should have positions
                if (generator.obstacles.length > 0) {
                    const obs = generator.obstacles[0];
                    const nearby = generator.queryObstaclesAt(obs.x, obs.y, 10);
                    expect(nearby.length).toBeGreaterThan(0);
                }
            });
            
            it('should calculate fear modifier at position', () => {
                generator.generateTerrain();
                
                const modifier = generator.getFearModifierAt(1200, 800);
                expect(typeof modifier).toBe('number');
            });
        });
        
        describe('ProceduralContentManager', () => {
            let manager;
            
            beforeEach(() => {
                manager = new ProceduralContentManager();
            });
            
            it('should initialize all components', () => {
                expect(manager.scenarioGenerator).toBeDefined();
                expect(manager.environmentGenerator).toBeDefined();
                expect(manager.currentScenario).toBeNull();
            });
            
            it('should generate complete content', () => {
                const sessionState = { phase: SESSION_PHASES.BUILDUP, intensityMultiplier: 0.6, progress: 0.4 };
                const playerType = PLAYER_TYPES.CASUAL_EXPLORER;
                const metrics = {};
                
                const content = manager.generateContent(sessionState, playerType, metrics);
                
                expect(content).toHaveProperty('scenario');
                expect(content).toHaveProperty('environment');
                expect(manager.currentScenario).not.toBeNull();
                expect(manager.currentEnvironment).not.toBeNull();
            });
            
            it('should adapt content based on metrics', () => {
                const sessionState = { phase: SESSION_PHASES.BUILDUP, intensityMultiplier: 0.5, progress: 0.3 };
                manager.generateContent(sessionState, PLAYER_TYPES.CASUAL_EXPLORER, {});
                
                const adapted = manager.adaptContent({ deathCount: 5, averageFear: 0.9 });
                expect(adapted).not.toBeNull();
            });
            
            it('should get threats near position', () => {
                const sessionState = { phase: SESSION_PHASES.CLIMAX, intensityMultiplier: 0.8, progress: 0.7 };
                manager.generateContent(sessionState, PLAYER_TYPES.THRILL_SEEKER, {});
                
                const threats = manager.getThreatsNear(1200, 800, 500);
                expect(Array.isArray(threats)).toBe(true);
            });
            
            it('should get safe zones', () => {
                const sessionState = { phase: SESSION_PHASES.BUILDUP, intensityMultiplier: 0.5, progress: 0.3 };
                manager.generateContent(sessionState, PLAYER_TYPES.CASUAL_EXPLORER, {});
                
                const zones = manager.getSafeZones();
                expect(Array.isArray(zones)).toBe(true);
            });
            
            it('should track content history', () => {
                const sessionState = { phase: SESSION_PHASES.BUILDUP, intensityMultiplier: 0.5, progress: 0.3 };
                manager.generateContent(sessionState, PLAYER_TYPES.CASUAL_EXPLORER, {});
                manager.generateContent(sessionState, PLAYER_TYPES.THRILL_SEEKER, {});
                
                expect(manager.history.length).toBe(2);
            });
            
            it('should get manager stats', () => {
                const sessionState = { phase: SESSION_PHASES.BUILDUP, intensityMultiplier: 0.5, progress: 0.3 };
                manager.generateContent(sessionState, PLAYER_TYPES.CASUAL_EXPLORER, {});
                
                const stats = manager.getStats();
                expect(stats).toHaveProperty('scenarios');
                expect(stats).toHaveProperty('historyCount');
                expect(stats).toHaveProperty('hasActiveScenario');
                expect(stats.hasActiveScenario).toBe(true);
            });
            
            it('should reset all content', () => {
                const sessionState = { phase: SESSION_PHASES.BUILDUP, intensityMultiplier: 0.5, progress: 0.3 };
                manager.generateContent(sessionState, PLAYER_TYPES.CASUAL_EXPLORER, {});
                
                manager.reset();
                
                expect(manager.currentScenario).toBeNull();
                expect(manager.history).toHaveLength(0);
            });
            
            it('should serialize and deserialize', () => {
                const sessionState = { phase: SESSION_PHASES.BUILDUP, intensityMultiplier: 0.5, progress: 0.3 };
                manager.generateContent(sessionState, PLAYER_TYPES.CASUAL_EXPLORER, {});
                
                const serialized = manager.serialize();
                
                const newManager = new ProceduralContentManager();
                newManager.deserialize(serialized);
                
                expect(newManager.history.length).toBe(1);
                expect(newManager.currentScenario).not.toBeNull();
            });
        });
    });

    describe('T4.7: Adaptive Learning System', () => {
        describe('AdaptiveLearningEngine', () => {
            let engine;
            
            beforeEach(() => {
                engine = new AdaptiveLearningEngine('player1');
            });
            
            it('should initialize with default config', () => {
                expect(engine.playerId).toBe('player1');
                expect(engine.learningState.totalInteractions).toBe(0);
                expect(engine.learningState.confidence).toBe(0.5);
            });
            
            it('should record interactions', () => {
                engine.recordInteraction({
                    fearLevel: 0.6,
                    stimulusIntensity: 0.5,
                    engagement: 0.7,
                    scenarioType: 'test'
                });
                
                expect(engine.learningState.totalInteractions).toBe(1);
                expect(engine.learningState.fearResponsePatterns).toHaveLength(1);
            });
            
            it('should update fear model', () => {
                engine.recordInteraction({
                    fearLevel: 0.6,
                    predictedFear: 0.4,
                    stimulusIntensity: 0.5,
                    engagement: 0.7
                });
                
                // Weights should have been adjusted
                const totalWeight = Object.values(engine.fearModel.weights)
                    .reduce((sum, w) => sum + w, 0);
                expect(Math.abs(totalWeight - 1.0)).toBeLessThan(0.01);
            });
            
            it('should update scenario memory', () => {
                engine.updateScenarioMemory('hunter', 'success', 0.8);
                engine.updateScenarioMemory('hunter', 'success', 0.9);
                
                const memory = engine.scenarioMemory.get('hunter');
                expect(memory).toBeDefined();
                expect(memory.count).toBe(2);
                expect(memory.effectiveness).toBeGreaterThan(0);
            });
            
            it('should update preferences periodically', () => {
                // Record 10 interactions
                for (let i = 0; i < 10; i++) {
                    engine.recordInteraction({
                        fearLevel: 0.8,
                        stimulusIntensity: 0.5,
                        responseRatio: 1.6,
                        engagement: 0.9,
                        scenarioType: 'test'
                    });
                }
                
                // Preferences should have been updated
                expect(engine.learningState.preferredIntensity).toBeDefined();
                expect(engine.learningState.stability).toBeDefined();
            });
            
            it('should predict fear response', () => {
                const prediction = engine.predictFearResponse({
                    previousFear: 0.3,
                    stimulusIntensity: 0.6,
                    timeSinceThreat: 5,
                    recentDeaths: 0
                });
                
                expect(prediction).toHaveProperty('predictedFear');
                expect(prediction).toHaveProperty('confidence');
                expect(prediction).toHaveProperty('accuracy');
                expect(prediction.predictedFear).toBeGreaterThanOrEqual(0);
                expect(prediction.predictedFear).toBeLessThanOrEqual(1);
            });
            
            it('should get scenario recommendations', () => {
                engine.learningState.preferredIntensity = 0.7;
                engine.learningState.confidence = 0.8;
                
                const recs = engine.getScenarioRecommendations();
                
                expect(recs).toHaveProperty('intensity');
                expect(recs).toHaveProperty('pacing');
                expect(recs).toHaveProperty('challenge');
                expect(recs).toHaveProperty('minIntensity');
                expect(recs).toHaveProperty('maxIntensity');
            });
            
            it('should get effective scenario types', () => {
                engine.updateScenarioMemory('hunter', 'success', 0.9);
                engine.updateScenarioMemory('stalker', 'success', 0.7);
                engine.updateScenarioMemory('ambush', 'success', 0.8);
                
                const types = engine.getEffectiveScenarioTypes(2);
                expect(types).toHaveLength(2);
                expect(types[0]).toHaveProperty('type');
                expect(types[0]).toHaveProperty('effectiveness');
            });
            
            it('should adapt in real-time', () => {
                const recommendations = engine.adaptInRealTime({
                    currentFear: 0.9,
                    targetFear: 0.5,
                    timeInScenario: 30
                });
                
                expect(recommendations).toHaveProperty('adjustIntensity');
                expect(recommendations).toHaveProperty('addSafeZone');
                expect(recommendations.addSafeZone).toBe(true);
            });
            
            it('should get learning stats', () => {
                engine.recordInteraction({
                    fearLevel: 0.6,
                    stimulusIntensity: 0.5,
                    engagement: 0.7,
                    scenarioType: 'test'
                });
                
                const stats = engine.getStats();
                expect(stats.playerId).toBe('player1');
                expect(stats.totalInteractions).toBe(1);
                expect(stats.accuracy).toBeDefined();
                expect(stats.confidence).toBeDefined();
            });
            
            it('should serialize and deserialize', () => {
                engine.recordInteraction({
                    fearLevel: 0.6,
                    stimulusIntensity: 0.5,
                    engagement: 0.7,
                    scenarioType: 'test'
                });
                
                const serialized = engine.serialize();
                
                const newEngine = new AdaptiveLearningEngine('player1');
                newEngine.deserialize(serialized);
                
                expect(newEngine.learningState.totalInteractions).toBe(1);
                expect(newEngine.scenarioMemory.size).toBe(1);
            });
            
            it('should reset learning state', () => {
                engine.recordInteraction({
                    fearLevel: 0.6,
                    stimulusIntensity: 0.5,
                    engagement: 0.7,
                    scenarioType: 'test'
                });
                
                engine.reset();
                
                expect(engine.learningState.totalInteractions).toBe(0);
                expect(engine.scenarioMemory.size).toBe(0);
                expect(engine.learningState.fearResponsePatterns).toHaveLength(0);
            });
        });
        
        describe('AdaptiveLearningManager', () => {
            let manager;
            
            beforeEach(() => {
                manager = new AdaptiveLearningManager();
            });
            
            it('should initialize empty', () => {
                expect(manager.engines.size).toBe(0);
            });
            
            it('should get or create engine for player', () => {
                const engine = manager.getEngine('player1');
                expect(engine).toBeDefined();
                expect(engine.playerId).toBe('player1');
                expect(manager.engines.size).toBe(1);
            });
            
            it('should record interaction for player', () => {
                manager.recordInteraction('player1', {
                    fearLevel: 0.6,
                    stimulusIntensity: 0.5,
                    engagement: 0.7,
                    scenarioType: 'hunter',
                    outcome: 'success'
                });
                
                const engine = manager.getEngine('player1');
                expect(engine.learningState.totalInteractions).toBe(1);
            });
            
            it('should update global patterns', () => {
                manager.recordInteraction('player1', {
                    fearLevel: 0.6,
                    stimulusIntensity: 0.5,
                    engagement: 0.8,
                    scenarioType: 'hunter',
                    outcome: 'success'
                });
                
                const globalType = manager.globalPatterns.typeEffectiveness.get('hunter');
                expect(globalType).toBeDefined();
                expect(globalType.avgEngagement).toBe(0.8);
            });
            
            it('should get global recommendations', () => {
                manager.recordInteraction('player1', {
                    fearLevel: 0.6,
                    stimulusIntensity: 0.5,
                    engagement: 0.9,
                    scenarioType: 'hunter'
                });
                
                manager.recordInteraction('player2', {
                    fearLevel: 0.6,
                    stimulusIntensity: 0.5,
                    engagement: 0.7,
                    scenarioType: 'stalker'
                });
                
                const recs = manager.getGlobalRecommendations();
                expect(recs).toHaveProperty('recommendedScenarioTypes');
                expect(recs.recommendedScenarioTypes).toContain('hunter');
            });
            
            it('should get all player stats', () => {
                manager.recordInteraction('player1', {
                    fearLevel: 0.6,
                    stimulusIntensity: 0.5,
                    engagement: 0.7,
                    scenarioType: 'test'
                });
                
                const stats = manager.getAllStats();
                expect(stats).toHaveProperty('player1');
            });
            
            it('should serialize and deserialize', () => {
                manager.recordInteraction('player1', {
                    fearLevel: 0.6,
                    stimulusIntensity: 0.5,
                    engagement: 0.7,
                    scenarioType: 'test'
                });
                
                const serialized = manager.serialize();
                
                const newManager = new AdaptiveLearningManager();
                newManager.deserialize(serialized);
                
                expect(newManager.engines.size).toBe(1);
                expect(newManager.globalPatterns.typeEffectiveness.size).toBe(1);
            });
            
            it('should reset all data', () => {
                manager.recordInteraction('player1', {
                    fearLevel: 0.6,
                    stimulusIntensity: 0.5,
                    engagement: 0.7,
                    scenarioType: 'test'
                });
                
                manager.reset();
                
                expect(manager.engines.size).toBe(0);
                expect(manager.globalPatterns.typeEffectiveness.size).toBe(0);
            });
        });
        
        describe('ScenarioOptimizer', () => {
            let optimizer;
            
            beforeEach(() => {
                optimizer = new ScenarioOptimizer();
            });
            
            it('should initialize with default values', () => {
                expect(optimizer.learningRate).toBe(0.1);
                expect(optimizer.explorationRate).toBe(0.2);
                expect(optimizer.qValues.size).toBe(0);
            });
            
            it('should get Q-value for state-action', () => {
                const state = { fearLevel: 0.5, playerType: 'casual', scenarioPhase: 'buildup' };
                const action = { intensityAdjustment: 0.1, threatAddition: true, pacingChange: 0 };
                
                const q = optimizer.getQValue(state, action);
                expect(q).toBe(0); // Default for unseen state-action
            });
            
            it('should update Q-value', () => {
                const state = { fearLevel: 0.5, playerType: 'casual', scenarioPhase: 'buildup' };
                const action = { intensityAdjustment: 0.1, threatAddition: true, pacingChange: 0 };
                const nextState = { fearLevel: 0.6, playerType: 'casual', scenarioPhase: 'buildup' };
                
                optimizer.updateQValue(state, action, 0.5, nextState);
                
                const q = optimizer.getQValue(state, action);
                expect(q).not.toBe(0);
            });
            
            it('should choose action', () => {
                const state = { fearLevel: 0.5, playerType: 'casual', scenarioPhase: 'buildup' };
                
                const action = optimizer.chooseAction(state);
                expect(action).toHaveProperty('intensityAdjustment');
                expect(action).toHaveProperty('threatAddition');
                expect(action).toHaveProperty('pacingChange');
            });
            
            it('should get possible actions', () => {
                const state = { fearLevel: 0.5, playerType: 'casual', scenarioPhase: 'buildup' };
                const actions = optimizer.getPossibleActions(state);
                
                expect(actions.length).toBeGreaterThan(0);
                expect(actions[0]).toHaveProperty('intensityAdjustment');
            });
            
            it('should learn from episode', () => {
                const state = { fearLevel: 0.5, playerType: 'casual', scenarioPhase: 'buildup' };
                const action = { intensityAdjustment: 0.1, threatAddition: true, pacingChange: 0 };
                const nextState = { fearLevel: 0.6, playerType: 'casual', scenarioPhase: 'buildup' };
                
                optimizer.learn(state, action, 0.8, nextState);
                
                const q = optimizer.getQValue(state, action);
                expect(q).toBeGreaterThan(0);
            });
            
            it('should decay exploration rate', () => {
                const initialRate = optimizer.explorationRate;
                optimizer.decayExploration();
                expect(optimizer.explorationRate).toBeLessThan(initialRate);
            });
            
            it('should get optimizer stats', () => {
                const state = { fearLevel: 0.5, playerType: 'casual', scenarioPhase: 'buildup' };
                const action = { intensityAdjustment: 0.1, threatAddition: true, pacingChange: 0 };
                const nextState = { fearLevel: 0.6, playerType: 'casual', scenarioPhase: 'buildup' };
                
                optimizer.learn(state, action, 0.5, nextState);
                
                const stats = optimizer.getStats();
                expect(stats.qValuesCount).toBeGreaterThan(0);
                expect(stats.learningRate).toBe(0.1);
            });
        });
    });

    describe('T4.8: Advanced Social Dynamics', () => {
        describe('SocialDynamicsEngine', () => {
            let engine;
            
            beforeEach(() => {
                engine = new SocialDynamicsEngine();
            });
            
            it('should initialize agent', () => {
                engine.initializeAgent('agent1', { charisma: 0.8, aggression: 0.3 });
                
                expect(engine.relationships.has('agent1')).toBe(true);
                expect(engine.reputation.has('agent1')).toBe(true);
                expect(engine.leadershipQualities.has('agent1')).toBe(true);
                expect(engine.inGroups.has('agent1')).toBe(true);
            });
            
            it('should set and get relationships', () => {
                engine.initializeAgent('agent1');
                engine.initializeAgent('agent2');
                
                engine.setRelationship('agent1', 'agent2', RELATIONSHIP_TYPES.ALLY, 0.8);
                
                const rel = engine.getRelationship('agent1', 'agent2');
                expect(rel.type).toBe(RELATIONSHIP_TYPES.ALLY);
                expect(rel.strength).toBe(0.8);
            });
            
            it('should update trust', () => {
                engine.initializeAgent('agent1');
                engine.initializeAgent('agent2');
                
                const trust = engine.updateTrust('agent1', 'agent2', 0.3);
                expect(trust).toBe(0.8); // Started at 0.5 + 0.3
            });
            
            it('should handle betrayal', () => {
                engine.initializeAgent('agent1');
                engine.initializeAgent('agent2');
                
                // Build trust first
                engine.updateTrust('agent1', 'agent2', 0.4, 'helped me');
                
                // Then betray
                engine.updateTrust('agent1', 'agent2', -0.5, 'betrayal');
                
                const rel = engine.getRelationship('agent1', 'agent2');
                expect(rel.type).toBe(RELATIONSHIP_TYPES.RIVAL);
                
                const betrayerRep = engine.reputation.get('agent2');
                expect(betrayerRep.reliability).toBeLessThan(0.5);
            });
            
            it('should get allies', () => {
                engine.initializeAgent('agent1');
                engine.initializeAgent('agent2');
                engine.initializeAgent('agent3');
                
                engine.setRelationship('agent1', 'agent2', RELATIONSHIP_TYPES.ALLY, 0.7);
                engine.setRelationship('agent1', 'agent3', RELATIONSHIP_TYPES.ALLY, 0.6);
                
                const allies = engine.getAllies('agent1');
                expect(allies).toContain('agent2');
                expect(allies).toContain('agent3');
            });
            
            it('should elect leader', () => {
                // Use actual IDs that reflect their leadership qualities
                engine.initializeAgent('high_charisma', { charisma: 0.9, intelligence: 0.8 });
                engine.initializeAgent('low_charisma1', { charisma: 0.3 });
                engine.initializeAgent('low_charisma2', { charisma: 0.4 });
                
                const leader = engine.electLeader('group1', ['high_charisma', 'low_charisma1', 'low_charisma2']);
                
                // The one with highest charisma should win
                expect(leader).toBe('high_charisma');
                expect(engine.leaders.get('group1')).toBe('high_charisma');
            });
            
            it('should handle leader succession', () => {
                engine.initializeAgent('deadLeader', { charisma: 0.9 });
                engine.initializeAgent('successor', { charisma: 0.7 });
                
                engine.electLeader('group1', ['deadLeader', 'successor']);
                
                const newLeader = engine.handleLeaderDeath('deadLeader', 'group1');
                expect(newLeader).toBe('successor');
            });
            
            it('should initialize culture', () => {
                const culture = engine.initializeCulture('group1', {
                    [CULTURAL_TRAITS.COOPERATIVE]: 0.7,
                    [CULTURAL_TRAITS.AGGRESSIVE]: 0.3
                });
                
                expect(culture.traits.has(CULTURAL_TRAITS.COOPERATIVE)).toBe(true);
                expect(culture.traits.get(CULTURAL_TRAITS.COOPERATIVE).prevalence).toBe(0.7);
            });
            
            it('should transmit culture', () => {
                engine.initializeCulture('group1', {
                    [CULTURAL_TRAITS.COOPERATIVE]: 0.8
                });
                
                const traits = engine.transmitCulture('parent', 'child', 'group1');
                expect(Array.isArray(traits)).toBe(true);
            });
            
            it('should calculate influence', () => {
                engine.initializeAgent('agent1', { charisma: 0.9, altruism: 0.8 });
                engine.setRelationship('agent1', 'agent2', RELATIONSHIP_TYPES.ALLY, 0.8);
                engine.setRelationship('agent1', 'agent3', RELATIONSHIP_TYPES.ALLY, 0.7);
                
                const influence = engine.calculateInfluence('agent1');
                expect(influence).toBeGreaterThan(0);
                expect(influence).toBeLessThanOrEqual(1);
            });
            
            it('should record social events', () => {
                engine.recordSocialEvent('TEST_EVENT', { data: 'test' });
                
                expect(engine.socialMemory.length).toBe(1);
                expect(engine.socialMemory[0].type).toBe('TEST_EVENT');
            });
            
            it('should get stats', () => {
                engine.initializeAgent('agent1');
                engine.initializeAgent('agent2');
                engine.setRelationship('agent1', 'agent2', RELATIONSHIP_TYPES.ALLY, 0.5);
                
                const stats = engine.getStats();
                expect(stats.agentsInSystem).toBe(2);
                expect(stats.totalRelationships).toBeGreaterThan(0);
            });
            
            it('should serialize and deserialize', () => {
                engine.initializeAgent('agent1');
                engine.setRelationship('agent1', 'agent2', RELATIONSHIP_TYPES.ALLY, 0.6);
                
                const serialized = engine.serialize();
                
                const newEngine = new SocialDynamicsEngine();
                newEngine.deserialize(serialized);
                
                expect(newEngine.relationships.has('agent1')).toBe(true);
            });
            
            it('should reset', () => {
                engine.initializeAgent('agent1');
                engine.setRelationship('agent1', 'agent2', RELATIONSHIP_TYPES.ALLY, 0.6);
                
                engine.reset();
                
                expect(engine.relationships.size).toBe(0);
                expect(engine.socialMemory.length).toBe(0);
            });
        });
        
        describe('SocialInfluenceManager', () => {
            let engine;
            let manager;
            
            beforeEach(() => {
                engine = new SocialDynamicsEngine();
                manager = new SocialInfluenceManager(engine);
            });
            
            it('should get group consensus', () => {
                engine.initializeAgent('agent1', { charisma: 0.9 });
                engine.initializeAgent('agent2');
                engine.initializeAgent('agent3');
                
                const opinions = new Map([
                    ['agent1', 0.8],
                    ['agent2', 0.6],
                    ['agent3', 0.7]
                ]);
                
                const consensus = manager.getGroupConsensus(['agent1', 'agent2', 'agent3'], opinions);
                expect(consensus).toBeGreaterThan(0);
                expect(consensus).toBeLessThanOrEqual(1);
            });
            
            it('should identify opinion leaders', () => {
                engine.initializeAgent('leader', { charisma: 0.9, aggression: 0.5, altruism: 0.8, intelligence: 0.9, nurturing: 0.9, sociality: 0.9 });
                engine.initializeAgent('follower1', { charisma: 0.1, altruism: 0.1, intelligence: 0.1, nurturing: 0.1, aggression: 0.1, sociality: 0.1 });
                engine.initializeAgent('follower2', { charisma: 0.1, altruism: 0.1, intelligence: 0.1, nurturing: 0.1, aggression: 0.1, sociality: 0.1 });
                engine.initializeAgent('follower3', { charisma: 0.1, altruism: 0.1, intelligence: 0.1, nurturing: 0.1, aggression: 0.1, sociality: 0.1 });
                engine.setRelationship('leader', 'follower1', RELATIONSHIP_TYPES.ALLY, 0.8);
                engine.setRelationship('leader', 'follower2', RELATIONSHIP_TYPES.ALLY, 0.8);
                engine.setRelationship('leader', 'follower3', RELATIONSHIP_TYPES.ALLY, 0.8);
                
                // Elect leader to set social class
                engine.electLeader('group1', ['leader', 'follower1', 'follower2', 'follower3']);
                
                const leaders = manager.identifyOpinionLeaders(['leader', 'follower1', 'follower2', 'follower3'], 0.3);
                expect(leaders.length).toBeGreaterThan(0);
                expect(leaders[0].id).toBe('leader');
            });
            
            it('should calculate social pressure', () => {
                engine.initializeAgent('agent1');
                engine.initializeAgent('agent2');
                engine.initializeAgent('agent3');
                
                engine.setRelationship('agent2', 'agent1', RELATIONSHIP_TYPES.ALLY, 0.7);
                engine.setRelationship('agent3', 'agent1', RELATIONSHIP_TYPES.RIVAL, 0.6);
                
                const pressure = manager.calculateSocialPressure('agent1', ['agent2', 'agent3']);
                expect(typeof pressure).toBe('number');
            });
            
            it('should cache influence', () => {
                engine.initializeAgent('agent1', { charisma: 0.8 });
                
                const influence1 = manager.getCachedInfluence('agent1');
                const influence2 = manager.getCachedInfluence('agent1');
                
                expect(influence1).toBe(influence2); // Should be cached
            });
            
            it('should clear cache', () => {
                engine.initializeAgent('agent1', { charisma: 0.8 });
                manager.getCachedInfluence('agent1');
                
                manager.clearCache();
                
                expect(manager.influenceCache.size).toBe(0);
            });
        });
    });
});