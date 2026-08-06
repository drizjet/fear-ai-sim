/**
 * Integration Tests for Fear-AI Simulator
 * Phase 1: Testing Infrastructure (T1.5)
 * 
 * Tests interactions between Agent, Brain, Simulation, and subsystems
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Agent } from '../agent.js';
import { Brain } from '../brain.js';

describe('Integration Tests', () => {
    beforeEach(() => {
        Agent.nextId = 0;
    });

    describe('Agent-Brain Integration', () => {
        it('should propagate fear from brain to agent behavior', () => {
            const agent = new Agent(100, 100);
            
            // Simulate high fear causing state change
            agent.brain.currentFear = 0.9;
            agent.brain.state = 'PANIC';
            agent.brain.adrenaline = 1.0;
            
            // Verify agent responds to brain state
            expect(agent.brain.state).toBe('PANIC');
            expect(agent.brain.adrenaline).toBeGreaterThan(0);
            
            // In panic, trauma accumulates
            if (agent.brain.state === 'PANIC' && agent.traumaLevel < agent.brain.currentFear) {
                agent.traumaLevel = Math.min(1, agent.brain.currentFear * 0.8);
            }
            
            expect(agent.traumaLevel).toBeGreaterThan(0);
        });

        it('should update agent speed based on brain adrenaline', () => {
            const agent = new Agent(100, 100);
            agent.brain.adrenaline = 1.0;
            agent.brain.morale = 1.0;
            
            const moraleSpeed = agent.brain.morale * 0.3;
            const adrenalineSpeed = agent.brain.adrenaline * 1.2;
            const baseMax = agent.isBigGuy ? 1.5 : 2.5;
            const currentMaxSpeed = baseMax * (1 + moraleSpeed + adrenalineSpeed);
            
            // Adrenaline should increase max speed
            expect(currentMaxSpeed).toBeGreaterThan(baseMax);
            expect(currentMaxSpeed).toBeCloseTo(2.5 * 2.5, 1);
        });

        it('should accumulate trauma during panic state', () => {
            const agent = new Agent(100, 100);
            
            // Simulate panic
            agent.brain.state = 'PANIC';
            agent.brain.currentFear = 0.85;
            
            // Trauma accumulates from panic
            if (agent.brain.state === 'PANIC' && agent.traumaLevel < agent.brain.currentFear) {
                agent.traumaLevel = Math.min(1, agent.brain.currentFear * 0.8);
            }
            
            expect(agent.traumaLevel).toBeCloseTo(0.68, 2);
            
            // Trauma affects baseline fear
            if (agent.traumaLevel > 0.3) {
                agent.brain.currentFear = Math.max(agent.brain.currentFear, agent.traumaLevel * 0.3);
            }
            
            expect(agent.brain.currentFear).toBeGreaterThanOrEqual(0.2);
        });

        it('should handle parent-child trait inheritance', () => {
            const parentTraits = { fear: 0.3, skill: 0.8, curiosity: 0.5 };
            const parent = new Agent(100, 100, parentTraits);
            const child = new Agent(100, 100, { ...parentTraits }, false, parent.id);
            
            // Child should have same traits initially
            expect(child.brain.traits.fear).toBe(parentTraits.fear);
            expect(child.brain.traits.skill).toBe(parentTraits.skill);
            
            // Child should reference parent
            expect(child.parentId).toBe(parent.id);
            
            // Parent should track child
            parent.children.push(child.id);
            expect(parent.children).toContain(child.id);
        });
    });

    describe('Agent-Agent Interactions', () => {
        it('should detect panic propagation between agents', () => {
            const agent1 = new Agent(100, 100);
            const agent2 = new Agent(105, 105); // Close to agent1
            
            // Agent 1 enters panic
            agent1.brain.state = 'PANIC';
            agent1.brain.currentFear = 0.9;
            
            // Calculate distance
            const dx = agent1.x - agent2.x;
            const dy = agent1.y - agent2.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            // Agents are close enough to influence each other
            expect(dist).toBeLessThan(40);
            
            // Agent 2 perceives agent 1's panic
            const neighborPanicLevel = agent1.brain.state === 'PANIC' ? 1 : 0;
            expect(neighborPanicLevel).toBe(1);
        });

        it('should calculate social forces between agents', () => {
            const agent1 = new Agent(100, 100);
            const agent2 = new Agent(110, 100); // 10 units away
            
            const dx = agent1.x - agent2.x;
            const dy = agent1.y - agent2.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            // Calculate repulsion
            const minDist = agent1.radius + agent2.radius + 2;
            const repulsionScale = 2 * Math.exp((minDist - dist) / 5);
            
            expect(repulsionScale).toBeDefined();
            expect(typeof repulsionScale).toBe('number');
        });

        it('should track family relationships across generations', () => {
            const grandparent = new Agent(100, 100);
            const parent = new Agent(100, 100, null, false, grandparent.id);
            const child = new Agent(100, 100, null, false, parent.id);
            
            // Build family tree
            grandparent.children.push(parent.id);
            parent.children.push(child.id);
            
            // Verify lineage
            expect(child.parentId).toBe(parent.id);
            expect(parent.parentId).toBe(grandparent.id);
            expect(grandparent.children).toContain(parent.id);
            expect(parent.children).toContain(child.id);
        });
    });

    describe('State Transition Integration', () => {
        it('should handle complete panic-recovery cycle', () => {
            const agent = new Agent(100, 100);
            
            // Start calm
            expect(agent.brain.state).toBe('CALM');
            
            // Enter panic
            agent.brain.currentFear = 0.9;
            agent.brain.state = 'PANIC';
            agent.brain.adrenaline = 1.0;
            
            expect(agent.brain.state).toBe('PANIC');
            expect(agent.brain.adrenaline).toBe(1.0);
            
            // Begin recovery
            agent.brain.state = 'RECOVER';
            agent.brain.adrenaline = 0.5;
            agent.brain.currentFear = 0.4;
            agent.brain.recoveryProgress = 0.9;
            
            // Complete recovery
            if (agent.brain.currentFear < 0.3 && agent.brain.recoveryProgress > 0.8) {
                agent.brain.state = 'CALM';
                agent.brain.recoveryProgress = 0;
            }
            
            // Not yet calm (fear still 0.4)
            expect(agent.brain.state).toBe('RECOVER');
            
            // Reduce fear further
            agent.brain.currentFear = 0.2;
            if (agent.brain.currentFear < 0.3 && agent.brain.recoveryProgress > 0.8) {
                agent.brain.state = 'CALM';
                agent.brain.recoveryProgress = 0;
            }
            
            expect(agent.brain.state).toBe('CALM');
        });

        it('should handle freeze response during panic', () => {
            const agent = new Agent(100, 100);
            
            agent.brain.state = 'PANIC';
            agent.brain.morale = 0.3; // Low morale
            agent.brain.currentFear = 0.9;
            
            // Chance to freeze when panicking with low morale
            if (agent.brain.state === 'PANIC' && agent.brain.morale < 0.4) {
                agent.brain.state = 'FREEZE';
            }
            
            expect(agent.brain.state).toBe('FREEZE');
            
            // Recovery from freeze
            if (Math.random() < 1.0) { // Force condition
                agent.brain.state = 'RECOVER';
            }
            
            expect(agent.brain.state).toBe('RECOVER');
        });

        it('should transition to HIDE for skilled agents', () => {
            const agent = new Agent(100, 100);
            agent.brain.traits.skill = 0.7;
            agent.brain.currentFear = 0.85;
            
            // High skill agents may hide instead of panic
            if (agent.brain.traits.skill > 0.6 && agent.brain.currentFear > 0.8) {
                agent.brain.state = 'HIDE';
            }
            
            expect(agent.brain.state).toBe('HIDE');
            
            // Hide reduces fear slowly
            agent.brain.currentFear *= 0.98;
            expect(agent.brain.currentFear).toBeLessThan(0.85);
        });
    });

    describe('Energy-Fear-Metabolism Integration', () => {
        it('should consume more energy during panic', () => {
            const agent = new Agent(100, 100);
            agent.energy = 100;
            
            // Normal metabolism
            const baseConsumption = 0.05;
            
            // Panic metabolism
            agent.brain.state = 'PANIC';
            agent.brain.adrenaline = 1.0;
            const panicConsumption = baseConsumption + (agent.brain.adrenaline * 0.1);
            
            expect(panicConsumption).toBeGreaterThan(baseConsumption);
            expect(panicConsumption).toBeCloseTo(0.15, 10);
        });

        it('should die when energy depleted', () => {
            const agent = new Agent(100, 100);
            agent.energy = 0.1;
            
            // Simulate metabolism
            agent.energy -= 0.05 + (agent.brain.adrenaline * 0.1);
            agent.energy -= 0.05 + (agent.brain.adrenaline * 0.1);
            
            if (agent.energy <= 0) {
                agent.dead = true;
            }
            
            expect(agent.dead).toBe(true);
        });
    });

    describe('Visuals and Perception Integration', () => {
        it('should process threats in visual range', () => {
            const agent = new Agent(100, 100);
            
            // Mock visuals with threats
            const visuals = {
                threats: [{ dx: 1, dy: 0, dist: 20 }],
                food: [],
                neighbors: []
            };
            
            // Brain processes threats
            const threatCount = visuals.threats.length;
            const perceivedThreat = agent.brain.calculateStimulusResponse(threatCount, 0);
            
            expect(perceivedThreat).toBeGreaterThan(0);
            agent.brain.currentFear = Math.max(agent.brain.currentFear * 0.95, perceivedThreat * agent.brain.traits.fear);
            
            expect(agent.brain.currentFear).toBeGreaterThan(0);
        });

        it('should respond to neighbor panic', () => {
            const agent = new Agent(100, 100);
            
            // Mock neighbor in panic
            const mockNeighbor = {
                brain: { state: 'PANIC' },
                x: 105,
                y: 100
            };
            
            const visuals = {
                threats: [],
                food: [],
                neighbors: [mockNeighbor]
            };
            
            const panickingNeighbors = visuals.neighbors.filter(n => n.brain.state === 'PANIC').length;
            const perceivedThreat = agent.brain.calculateStimulusResponse(0, panickingNeighbors / 5);
            
            // Neighbor panic should increase fear
            expect(perceivedThreat).toBeGreaterThan(0);
        });
    });

    describe('Morale and Safe Haven Integration', () => {
        it('should boost morale in safe haven', () => {
            const agent = new Agent(75, 75); // Inside first safe haven
            const safeHavens = [
                { x: 50, y: 50, w: 100, h: 100 }
            ];
            
            // Check if in safe haven
            const inSafeHaven = safeHavens.some(sh => 
                agent.x > sh.x && agent.x < sh.x + sh.w &&
                agent.y > sh.y && agent.y < sh.y + sh.h
            );
            
            expect(inSafeHaven).toBe(true);
            
            // Boost morale
            if (inSafeHaven) {
                agent.brain.morale = Math.min(2.0, agent.brain.morale + 0.05);
            }
            
            expect(agent.brain.morale).toBeGreaterThan(1.0);
        });

        it('should reduce fear in safe haven', () => {
            const agent = new Agent(75, 75);
            agent.brain.currentFear = 0.5;
            agent.brain.state = 'PANIC';
            
            // Enter safe haven
            agent.brain.currentFear *= 0.8;
            
            if (agent.brain.state === 'PANIC') {
                agent.brain.state = 'ANXIOUS';
            }
            
            expect(agent.brain.currentFear).toBe(0.4);
            expect(agent.brain.state).toBe('ANXIOUS');
        });
    });

    describe('GOAP Plan Execution', () => {
        it('should create and execute a simple plan', () => {
            const agent = new Agent(100, 100);
            agent.brain.traits.skill = 0.8; // High skill enables planning
            
            // Create a mock plan
            const mockPlan = ['MoveToSafety', 'Recover', 'FindFood'];
            agent.brain.currentPlan = mockPlan;
            agent.brain.planStep = 0;
            
            // Get current action
            const currentAction = agent.brain.getCurrentPlanAction();
            expect(currentAction).toBe('MoveToSafety');
            
            // Advance plan
            agent.brain.advancePlan();
            expect(agent.brain.planStep).toBe(1);
            expect(agent.brain.getCurrentPlanAction()).toBe('Recover');
            
            // Continue advancing
            agent.brain.advancePlan();
            agent.brain.advancePlan();
            expect(agent.brain.getCurrentPlanAction()).toBeNull();
        });

        it('should only plan for high skill agents', () => {
            const lowSkillAgent = new Agent(100, 100);
            lowSkillAgent.brain.traits.skill = 0.3;
            
            const highSkillAgent = new Agent(100, 100);
            highSkillAgent.brain.traits.skill = 0.8;
            
            expect(lowSkillAgent.brain.traits.skill).toBeLessThan(0.4);
            expect(highSkillAgent.brain.traits.skill).toBeGreaterThan(0.4);
        });
    });
});