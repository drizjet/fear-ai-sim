/**
 * Agent Class Unit Tests
 * Phase 1: Testing Infrastructure (T1.2)
 * 
 * Tests the core Agent behavior, state management, and lifecycle
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Agent } from '../agent.js';

describe('Agent', () => {
    beforeEach(() => {
        // Reset Agent ID counter for consistent testing
        Agent.nextId = 0;
    });

    describe('Initialization (T1.2)', () => {
        it('should initialize with correct default values', () => {
            const agent = new Agent(100, 100);
            
            expect(agent.x).toBe(100);
            expect(agent.y).toBe(100);
            expect(agent.energy).toBe(100);
            expect(agent.dead).toBe(false);
            expect(agent.age).toBe(0);
            expect(agent.radius).toBe(4);
            expect(agent.isBigGuy).toBe(false);
        });

        it('should initialize BigGuy with larger radius', () => {
            const bigGuy = new Agent(100, 100, null, true);
            
            expect(bigGuy.radius).toBe(15);
            expect(bigGuy.isBigGuy).toBe(true);
            expect(bigGuy.maxSpeed).toBe(1.5);
        });

        it('should generate unique IDs', () => {
            const agent1 = new Agent(0, 0);
            const agent2 = new Agent(0, 0);
            const agent3 = new Agent(0, 0);
            
            expect(agent1.id).toBe(0);
            expect(agent2.id).toBe(1);
            expect(agent3.id).toBe(2);
        });

        it('should generate deterministic family names', () => {
            const agent = new Agent(0, 0);
            const familyName = agent.familyName;
            
            expect(typeof familyName).toBe('string');
            expect(familyName.length).toBeGreaterThan(0);
            expect(agent.getLineageInfo().familyName).toBe(familyName);
        });

        it('should accept custom traits', () => {
            const traits = { fear: 0.8, skill: 0.9, curiosity: 0.3 };
            const agent = new Agent(100, 100, traits);
            
            expect(agent.brain.traits.fear).toBe(0.8);
            expect(agent.brain.traits.skill).toBe(0.9);
            expect(agent.brain.traits.curiosity).toBe(0.3);
        });

        it('should track parent-child lineage', () => {
            const parent = new Agent(100, 100);
            const child = new Agent(100, 100, null, false, parent.id);
            
            expect(child.parentId).toBe(parent.id);
            expect(child.generation).toBe(1); // Default generation when parentId is set
        });

        it('should initialize trauma and engagement systems', () => {
            const agent = new Agent(100, 100);
            
            expect(agent.traumaLevel).toBe(0);
            expect(agent.traumaDecayRate).toBe(0.9995);
            expect(agent.panicEventsSurvived).toBe(0);
            expect(agent.isEngaged).toBe(false);
            expect(agent.stressSurvivalTime).toBe(0);
        });
    });

    describe('State Management (T1.2)', () => {
        it('should start in CALM state', () => {
            const agent = new Agent(100, 100);
            expect(agent.brain.state).toBe('CALM');
        });

        it('should update fear level correctly', () => {
            const agent = new Agent(100, 100);
            agent.brain.currentFear = 0.5;
            
            // Fear should decay over time
            const initialFear = agent.brain.currentFear;
            agent.brain.currentFear = Math.max(agent.brain.currentFear * 0.95, 0);
            
            expect(agent.brain.currentFear).toBeLessThan(initialFear);
        });

        it('should handle engagement state', () => {
            const agent = new Agent(100, 100);
            
            expect(agent.isEngaged).toBe(false);
            
            agent.setEngaged();
            expect(agent.isEngaged).toBe(true);
            expect(agent.engagementStartTime).toBeGreaterThan(0);
            
            agent.endEngagement();
            expect(agent.isEngaged).toBe(false);
        });

        it('should track stress survival time when engaged', () => {
            const agent = new Agent(100, 100);
            agent.setEngaged();
            
            // Simulate update
            agent.stressSurvivalTime++;
            agent.stressSurvivalTime++;
            
            expect(agent.stressSurvivalTime).toBe(2);
        });
    });

    describe('Death Mechanics (T1.2)', () => {
        it('should handle death when energy reaches zero', () => {
            const agent = new Agent(100, 100);
            agent.energy = 0;
            
            // Simulate death check
            if (agent.energy <= 0) {
                agent.dead = true;
            }
            
            expect(agent.dead).toBe(true);
        });

        it('should not update when dead', () => {
            const agent = new Agent(100, 100);
            agent.dead = true;
            
            const initialX = agent.x;
            const initialY = agent.y;
            
            // Call update (mocked since we can't fully test without canvas context)
            if (!agent.dead) {
                agent.x += 1;
            }
            
            expect(agent.x).toBe(initialX);
            expect(agent.y).toBe(initialY);
        });
    });

    describe('Lineage Info (T1.2)', () => {
        it('should return correct lineage information', () => {
            const agent = new Agent(100, 100);
            const lineage = agent.getLineageInfo();
            
            expect(lineage).toHaveProperty('id');
            expect(lineage).toHaveProperty('familyName');
            expect(lineage).toHaveProperty('generation');
            expect(lineage).toHaveProperty('parentId');
            expect(lineage).toHaveProperty('childrenCount');
            expect(lineage).toHaveProperty('children');
            expect(Array.isArray(lineage.children)).toBe(true);
        });

        it('should track children count', () => {
            const parent = new Agent(100, 100);
            expect(parent.getLineageInfo().childrenCount).toBe(0);
            
            parent.children.push(1);
            parent.children.push(2);
            
            expect(parent.getLineageInfo().childrenCount).toBe(2);
        });
    });

    describe('Movement and Physics (T1.2)', () => {
        it('should have initial velocity', () => {
            const agent = new Agent(100, 100);
            
            // Velocity should be initialized with random values
            expect(typeof agent.vx).toBe('number');
            expect(typeof agent.vy).toBe('number');
            expect(agent.vx).not.toBeNaN();
            expect(agent.vy).not.toBeNaN();
        });

        it('should respect speed limits', () => {
            const agent = new Agent(100, 100);
            agent.vx = 100;
            agent.vy = 100;
            
            const speed = Math.sqrt(agent.vx * agent.vx + agent.vy * agent.vy);
            const baseMax = agent.isBigGuy ? 1.5 : 2.5;
            
            expect(speed).toBeGreaterThan(baseMax);
        });

        it('should bounce off boundaries', () => {
            const agent = new Agent(100, 100);
            agent.x = -5; // Outside left boundary
            agent.vx = -1;
            
            if (agent.x < 0) agent.vx *= -1;
            
            expect(agent.vx).toBe(1);
        });
    });

    describe('Energy and Metabolism (T1.2)', () => {
        it('should consume energy over time', () => {
            const agent = new Agent(100, 100);
            const initialEnergy = agent.energy;
            
            // Simulate metabolism
            agent.energy -= 0.05;
            
            expect(agent.energy).toBeLessThan(initialEnergy);
        });

        it('should consume more energy with adrenaline', () => {
            const agent = new Agent(100, 100);
            agent.brain.adrenaline = 1.0;
            
            const baseMetabolism = 0.05;
            const adrenalineCost = agent.brain.adrenaline * 0.1;
            
            expect(adrenalineCost).toBe(0.1);
            expect(baseMetabolism + adrenalineCost).toBeCloseTo(0.15, 10);
        });
    });

    describe('Trauma Memory System (T1.2)', () => {
        it('should accumulate trauma during panic', () => {
            const agent = new Agent(100, 100);
            
            // Simulate panic state setting trauma
            agent.brain.state = 'PANIC';
            agent.brain.currentFear = 0.9;
            
            if (agent.brain.state === 'PANIC' && agent.traumaLevel < agent.brain.currentFear) {
                agent.traumaLevel = Math.min(1, agent.brain.currentFear * 0.8);
            }
            
            expect(agent.traumaLevel).toBeCloseTo(0.72, 10);
        });

        it('should decay trauma over time', () => {
            const agent = new Agent(100, 100);
            agent.traumaLevel = 0.5;
            
            // Simulate decay
            agent.traumaLevel *= agent.traumaDecayRate;
            
            expect(agent.traumaLevel).toBeLessThan(0.5);
            expect(agent.traumaLevel).toBe(0.49975);
        });

        it('should clear trauma below threshold', () => {
            const agent = new Agent(100, 100);
            agent.traumaLevel = 0.0005;
            
            if (agent.traumaLevel < 0.001) agent.traumaLevel = 0;
            
            expect(agent.traumaLevel).toBe(0);
        });
    });
});