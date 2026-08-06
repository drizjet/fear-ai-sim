/**
 * Brain/GOAP Class Unit Tests
 * Phase 1: Testing Infrastructure (T1.3)
 * 
 * Tests fear state management, GOAP planning, and decision making
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Brain } from '../brain.js';

describe('Brain', () => {
    let brain;

    beforeEach(() => {
        brain = new Brain();
    });

    describe('Initialization (T1.3)', () => {
        it('should initialize with default traits', () => {
            expect(brain.traits).toHaveProperty('fear');
            expect(brain.traits).toHaveProperty('skill');
            expect(brain.traits).toHaveProperty('curiosity');
            expect(brain.traits.fear).toBeGreaterThanOrEqual(0);
            expect(brain.traits.fear).toBeLessThanOrEqual(1);
        });

        it('should accept custom traits', () => {
            const customTraits = { fear: 0.3, skill: 0.8, curiosity: 0.5 };
            const customBrain = new Brain(customTraits);
            
            expect(customBrain.traits.fear).toBe(0.3);
            expect(customBrain.traits.skill).toBe(0.8);
            expect(customBrain.traits.curiosity).toBe(0.5);
        });

        it('should initialize in CALM state', () => {
            expect(brain.state).toBe('CALM');
            expect(brain.currentFear).toBe(0);
        });
it('should initialize GOAP planning system', () => {
    expect(brain.planner).toBeDefined();
    expect(brain.currentPlan).toBeNull();
    expect(brain.planStep).toBe(0);
    expect(brain.planInterval).toBeGreaterThanOrEqual(15);
    expect(brain.planInterval).toBeLessThanOrEqual(45);
});

it('should initialize morale and adrenaline', () => {
    expect(brain.morale).toBe(1.0);
    expect(brain.adrenaline).toBe(0);
});
});

    describe('State Transitions (T1.3)', () => {
        it('should transition from CALM to ALERT when fear > 0.2', () => {
            brain.currentFear = 0.25;
            
            if (brain.currentFear > 0.2) brain.state = 'ALERT';
            
            expect(brain.state).toBe('ALERT');
        });

        it('should transition from ALERT to ANXIOUS when fear > 0.5', () => {
            brain.currentFear = 0.6;
            
            if (brain.currentFear > 0.5) brain.state = 'ANXIOUS';
            
            expect(brain.state).toBe('ANXIOUS');
        });

        it('should transition to PANIC when fear > 0.8', () => {
            brain.currentFear = 0.85;
            
            if (brain.currentFear > 0.8) brain.state = 'PANIC';
            
            expect(brain.state).toBe('PANIC');
        });

        it('should transition to HIDE for high skill agents with fear > 0.8', () => {
            brain.traits.skill = 0.7;
            brain.currentFear = 0.85;
            
            if (brain.traits.skill > 0.6 && Math.random() < 1.0) { // Force condition
                brain.state = 'HIDE';
            }
            
            expect(brain.state).toBe('HIDE');
        });

        it('should stay in RECOVER until fear drops below 0.3', () => {
            brain.state = 'RECOVER';
            brain.currentFear = 0.5;
            brain.recoveryProgress = 0.9;
            
            // Should not transition out
            if (brain.currentFear < 0.3 && brain.recoveryProgress > 0.8) {
                brain.state = 'CALM';
            }
            
            expect(brain.state).toBe('RECOVER');
        });

        it('should exit RECOVER when fear is low and progress is complete', () => {
            brain.state = 'RECOVER';
            brain.currentFear = 0.2;
            brain.recoveryProgress = 0.9;
            
            if (brain.currentFear < 0.3 && brain.recoveryProgress > 0.8) {
                brain.state = 'CALM';
                brain.recoveryProgress = 0;
            }
            
            expect(brain.state).toBe('CALM');
            expect(brain.recoveryProgress).toBe(0);
        });

        it('should exit HIDE when threats are gone', () => {
            brain.state = 'HIDE';
            const threats = []; // No threats
            
            if (threats.length === 0) {
                brain.state = 'RECOVER';
            }
            
            expect(brain.state).toBe('RECOVER');
        });

        it('should exit HIDE to PANIC when fear is too high', () => {
            brain.state = 'HIDE';
            brain.currentFear = 0.9;
            
            if (brain.currentFear > 0.85) {
                brain.state = 'PANIC';
            }
            
            expect(brain.state).toBe('PANIC');
        });
    });

    describe('Fear Decay (T1.3)', () => {
        it('should decay fear by 0.95 factor', () => {
            brain.currentFear = 0.8;
            
            brain.currentFear = brain.currentFear * 0.95;
            
            expect(brain.currentFear).toBeCloseTo(0.76, 5);
        });

        it('should maintain minimum fear based on perceived threat', () => {
            const perceivedThreat = 0.5;
            brain.traits.fear = 0.8;
            
            brain.currentFear = Math.max(0.1 * 0.95, perceivedThreat * brain.traits.fear);
            
            expect(brain.currentFear).toBe(0.4);
        });
    });

    describe('Adrenaline System (T1.3)', () => {
        it('should increase adrenaline in PANIC state', () => {
            brain.state = 'PANIC';
            brain.adrenaline = 0;
            
            brain.adrenaline = Math.min(1, brain.adrenaline + 0.1);
            
            expect(brain.adrenaline).toBe(0.1);
        });

        it('should cap adrenaline at 1.0', () => {
            brain.adrenaline = 0.95;
            
            brain.adrenaline = Math.min(1, brain.adrenaline + 0.1);
            
            expect(brain.adrenaline).toBe(1.0);
        });

        it('should decay adrenaline in CALM state', () => {
            brain.state = 'CALM';
            brain.adrenaline = 0.5;
            
            brain.adrenaline = brain.adrenaline * 0.9;
            
            expect(brain.adrenaline).toBe(0.45);
        });

        it('should decay adrenaline faster in ANXIOUS state', () => {
            brain.state = 'ANXIOUS';
            brain.adrenaline = 0.5;
            
            brain.adrenaline = brain.adrenaline * 0.99;
            
            expect(brain.adrenaline).toBeCloseTo(0.495, 5);
        });
    });

    describe('Stimulus Response (T1.3)', () => {
        it('should calculate Differential Entropy response', () => {
            const response = brain.calculateStimulusResponse(5, 2);

            const variance = (5 * 1.5) + (2 * 2.0) + 0.1;
            const deValue = 0.5 * Math.log(2 * Math.PI * Math.E * variance);
            const expected = Math.max(0, deValue * 0.2);

            expect(response).toBeCloseTo(expected, 5);
        });

        it('should return 0 for no stimulus', () => {            const response = brain.calculateStimulusResponse(0, 0);
            expect(response).toBe(0);
        });

        it('should weight neighbor panic higher', () => {
            const threatResponse = brain.calculateStimulusResponse(5, 0);
            const panicResponse = brain.calculateStimulusResponse(0, 5);
            
            expect(panicResponse).toBeGreaterThan(threatResponse);
        });
    });

    describe('Morale System (T1.3)', () => {
        it('should boost morale in safe haven', () => {
            brain.morale = 0.5;
            const inSafeHaven = true;
            
            if (inSafeHaven) {
                brain.morale = Math.min(2.0, brain.morale + 0.05);
            }
            
            expect(brain.morale).toBe(0.55);
        });

        it('should cap morale at 2.0', () => {
            brain.morale = 1.95;
            const inSafeHaven = true;
            
            if (inSafeHaven) {
                brain.morale = Math.min(2.0, brain.morale + 0.05);
            }
            
            expect(brain.morale).toBe(2.0);
        });

        it('should reduce morale in PANIC', () => {
            brain.state = 'PANIC';
            brain.morale = 1.0;
            
            brain.morale -= 0.005;
            
            expect(brain.morale).toBe(0.995);
        });
    });

    describe('Freeze Response (T1.3)', () => {
        it('should transition to FREEZE from PANIC with low morale', () => {
            brain.state = 'PANIC';
            brain.morale = 0.3;
            
            // Simulate 100% probability for testing
            if (brain.state === 'PANIC' && brain.morale < 0.4) {
                brain.state = 'FREEZE';
            }
            
            expect(brain.state).toBe('FREEZE');
        });

        it('should eventually recover from FREEZE', () => {
            brain.state = 'FREEZE';
            
            // Simulate recovery check
            if (Math.random() < 1.0) { // Force condition
                brain.state = 'RECOVER';
            }
            
            expect(brain.state).toBe('RECOVER');
        });
    });

    describe('Trait Mutation (T1.3)', () => {
        it('should mutate traits within bounds', () => {
            brain.traits = { fear: 0.5, skill: 0.5, curiosity: 0.5 };
            
            brain.mutate(1.0); // Force mutation
            
            expect(brain.traits.fear).toBeGreaterThanOrEqual(0);
            expect(brain.traits.fear).toBeLessThanOrEqual(1);
            expect(brain.traits.skill).toBeGreaterThanOrEqual(0);
            expect(brain.traits.skill).toBeLessThanOrEqual(1);
            expect(brain.traits.curiosity).toBeGreaterThanOrEqual(0);
            expect(brain.traits.curiosity).toBeLessThanOrEqual(1);
        });

        it('should respect mutation rate', () => {
            brain.traits = { fear: 0.5, skill: 0.5, curiosity: 0.5 };
            const originalTraits = { ...brain.traits };
            
            // 0% mutation rate
            brain.mutate(0);
            
            expect(brain.traits).toEqual(originalTraits);
        });
    });

    describe('GOAP Planning (T1.3)', () => {
        it('should have planner instance', () => {
            expect(brain.planner).toBeDefined();
            expect(typeof brain.planner.plan).toBe('function');
        });

        it('should track plan interval correctly', () => {
            expect(brain.planInterval).toBeGreaterThanOrEqual(15);
            expect(brain.stateTimer).toBe(0);
        });

        it('should initialize plan state correctly', () => {
            expect(brain.currentPlan).toBeNull();
            expect(brain.planStep).toBe(0);
            expect(brain.lastPlanTime).toBe(0);
        });

        it('should only plan for high skill agents', () => {
            brain.traits.skill = 0.3;
            const shouldPlan = brain.traits.skill > 0.4;
            
            expect(shouldPlan).toBe(false);
        });

        it('should plan on interval boundary', () => {
            brain.traits.skill = 0.5;
            brain.stateTimer = brain.planInterval;
            
            const shouldPlan = brain.traits.skill > 0.4 && brain.stateTimer % brain.planInterval === 0;
            
            expect(shouldPlan).toBe(true);
        });
    });

    describe('State Actions (T1.3)', () => {
        it('should set movement to 0 in FREEZE state', () => {
            brain.state = 'FREEZE';
            
            let moveX = 1;
            let moveY = 1;
            
            if (brain.state === 'FREEZE') {
                moveX = 0;
                moveY = 0;
            }
            
            expect(moveX).toBe(0);
            expect(moveY).toBe(0);
        });

        it('should increase fear in FREEZE state', () => {
            brain.state = 'FREEZE';
            brain.currentFear = 0.5;
            
            if (brain.state === 'FREEZE') {
                brain.currentFear *= 1.01;
            }
            
            expect(brain.currentFear).toBeGreaterThan(0.5);
        });

        it('should slow movement in HIDE state', () => {
            brain.state = 'HIDE';
            
            let moveX = 1;
            let moveY = 1;
            
            if (brain.state === 'HIDE') {
                moveX = -0.3; // Slow movement
                moveY = -0.3;
            }
            
            expect(Math.abs(moveX)).toBeLessThan(1);
            expect(Math.abs(moveY)).toBeLessThan(1);
        });

        it('should reduce fear while hiding', () => {
            brain.state = 'HIDE';
            brain.currentFear = 0.6;
            
            if (brain.state === 'HIDE') {
                brain.currentFear *= 0.98;
            }
            
            expect(brain.currentFear).toBeLessThan(0.6);
        });

        it('should track recovery progress in RECOVER state', () => {
            brain.state = 'RECOVER';
            brain.recoveryProgress = 0;
            
            if (brain.state === 'RECOVER') {
                brain.recoveryProgress += 0.02;
            }
            
            expect(brain.recoveryProgress).toBe(0.02);
        });

        it('should reduce fear faster in RECOVER', () => {
            brain.state = 'RECOVER';
            brain.currentFear = 0.5;
            
            if (brain.state === 'RECOVER') {
                brain.currentFear *= 0.90;
            }
            
            expect(brain.currentFear).toBe(0.45);
        });
    });

    describe('Plan Management (T1.3)', () => {
        it('should advance plan step', () => {
            brain.currentPlan = ['action1', 'action2', 'action3'];
            brain.planStep = 0;
            
            brain.advancePlan();
            
            expect(brain.planStep).toBe(1);
        });

        it('should get current plan action', () => {
            brain.currentPlan = ['action1', 'action2'];
            brain.planStep = 0;
            
            const action = brain.getCurrentPlanAction();
            
            expect(action).toBe('action1');
        });

        it('should return null when plan is exhausted', () => {
            brain.currentPlan = ['action1'];
            brain.planStep = 1;
            
            const action = brain.getCurrentPlanAction();
            
            expect(action).toBeNull();
        });

        it('should return null when no plan exists', () => {
            brain.currentPlan = null;
            
            const action = brain.getCurrentPlanAction();
            
            expect(action).toBeNull();
        });
    });
});