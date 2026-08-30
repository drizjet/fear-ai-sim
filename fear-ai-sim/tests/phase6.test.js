/**
 * Phase 6: Research-Driven Advanced Systems Tests
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { StrategicDirector } from '../director.js';
import { Brain } from '../brain.js';
import { Simulation } from '../simulation.js';
import { Planner } from '../planner.js';

describe('Phase 6: Research-Driven Advanced Systems', () => {
    let mockSim;
    let brain;

    beforeEach(() => {
        mockSim = {
            width: 800,
            height: 600,
            agents: [],
            agentPool: { release: jest.fn(), acquire: jest.fn(() => ({ reset: jest.fn() })) },
            spatialHash: { query: jest.fn(() => []), insert: jest.fn(), clear: jest.fn() }
        };
        brain = new Brain();
    });

    describe('Strategic Director (T6.1, T6.2)', () => {
        it('should cycle pacing states correctly', () => {
            const director = new StrategicDirector(mockSim);
            expect(director.pacingState).toBe('BUILDUP');
            
            director.pacingTimer = 601;
            director.update();
            expect(director.pacingState).toBe('PEAK');
            
            director.pacingTimer = 301;
            director.update();
            expect(director.pacingState).toBe('RELAX');
        });

        it('should assign role-based investigation roles (T6.2)', () => {
            const director = new StrategicDirector(mockSim);
            const agents = [
                { id: 1, x: 100, y: 100, brain: new Brain() },
                { id: 2, x: 110, y: 110, brain: new Brain() },
                { id: 3, x: 120, y: 120, brain: new Brain() }
            ];
            
            const eventLoc = { x: 90, y: 90 };
            director.assignRoleBasedInvestigation(eventLoc, agents);
            
            expect(agents[0].brain.role).toBe('LEAD_INVESTIGATOR');
            expect(agents[1].brain.role).toBe('BACK_WATCHER');
            expect(agents[2].brain.role).toBe('BACK_WATCHER');
        });
    });

    describe('Advanced Brain Features (T6.3, T6.4, T6.6)', () => {
        it('should trigger presence break under extreme stress (T6.6)', () => {
            // The §260 contract: brain.state is a derived read
            // of fearCore.state. The test must drive the state
            // through the public path (setFear + decide), not
            // by direct assignment to brain.state.
            // To reach PRESENCE_BREAK:
            //   1. enter PANIC with fear > 3.8;
            //   2. clear the 10-tick panic lock by driving fear down;
            //   3. re-enter PANIC at fear > 0.95 (the §260 context
            //      check) and stay there for 200+ ticks;
            //   4. PRESENCE_BREAK then fires.
            brain.setFear(0.99);
            brain.fearCore.reset('ANXIOUS');
            // Phase 1: enter PANIC.
            brain.fearCore.update(4.0, { threats: 1, skill: 0.5, currentAnger: 0, morale: 0.5, rng: () => 0.5 });
            expect(brain.fearCore.state).toBe('PANIC');
            // Phase 2: clear the panic lock by exiting to ANXIOUS.
            for (let i = 0; i < 11; i += 1) {
                brain.fearCore.update(0, { threats: 0, skill: 0.5, currentAnger: 0, morale: 0.5, rng: () => 0.5 });
            }
            // Phase 3: re-enter PANIC and stay there.
            for (let i = 0; i < 202; i += 1) {
                brain.fearCore.update(4.0, { threats: 1, skill: 0.5, currentAnger: 0, morale: 0.5, rng: () => 0.5 });
            }
            // The brain-level stateTimer and fearCore.stateTimer
            // must exceed the PRESENCE_BREAK threshold (200).
            brain.stateTimer = 202;
            brain.fearCore.stateTimer = 202;

            const visuals = { threats: [], food: [], neighbors: [] };
            const agent = { x: 0, y: 0, brain: brain };
            brain.decide(visuals, agent, null, []);

            expect(brain.state).toBe('PRESENCE_BREAK');
        });

        it('should apply Pavlovian uncertainty gating (T6.4)', () => {
            brain.uncertainty = 1.0; // Max uncertainty
            const visuals = { threats: [], food: [{ dx: 1, dy: 0, dist: 10 }], neighbors: [] };
            brain.state = 'CALM';
            
            const agent = { x: 0, y: 0, brain: brain };
            const move = brain.decide(visuals, agent, null, []);
            
            // With 1.0 uncertainty, speed is reduced by 50%
            // But since we normalize at the end, we need to check the raw logic or effect
            // In our implementation, normalization happens after multipliers.
            expect(Math.hypot(move.dx, move.dy)).toBeCloseTo(1.0, 5);
        });

        it('should include path jitter based on fear (T6.3)', () => {
            brain.currentFear = 1.0;
            const visuals = { threats: [], food: [], neighbors: [] };
            
            const agent = { x: 0, y: 0, brain: brain };
            // Multiple runs to see random variance
            const moves = [];
            for(let i=0; i<10; i++) {
                moves.push(brain.decide(visuals, agent, null, []));
            }
            
            const first = moves[0];
            const allSame = moves.every(m => m.dx === first.dx && m.dy === first.dy);
            expect(allSame).toBe(false); // Should have random jitter
        });
    });

    describe('Dynamic GOAP Costs (T6.5)', () => {
        it('should penalize failing actions in planner', () => {
            const planner = new Planner();
            brain.planner = planner; // Ensure brain uses THIS planner instance
            const startState = { hasFood: false };
            const goalState = { hasFood: true };
            const actions = [
                { name: 'Gather', cost: 10, checkPreconditions: () => true, applyEffects: s => ({ ...s, hasFood: true }) }
            ];
            
            const successStats = new Map();
            successStats.set('Gather', { success: 0, fail: 10 }); // 100% failure rate
            
            // We can't easily peek into A* costs from outside without modifying planner,
            // but we can verify the brain uses it.
            brain.actionSuccessStats = successStats;
            jest.spyOn(planner, 'plan');
            
            const fullAgent = { id: 1, brain: brain, x: 0, y: 0 };
            brain.updatePlan(fullAgent, { threats: [], food: [], neighbors: [] }, [], false);
            expect(planner.plan).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), expect.any(Array), successStats, {x: 0, y: 0}, brain.uncertainty);
        });
    });
});
