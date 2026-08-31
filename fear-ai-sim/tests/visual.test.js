/**
 * Visual Regression Tests (Mocked)
 * Phase 1: Testing Infrastructure (T1.7)
 * 
 * Verifies that the simulation state remains consistent across frames
 * for deterministic scenarios and detects visual regressions.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Simulation } from '../simulation.js';
import { Agent } from '../agent.js';

describe('Visual Regression (Deterministic)', () => {
    let sim;
    let mockCanvas;

    beforeEach(() => {
        const mockParent = { appendChild: jest.fn() };
        mockCanvas = {
            width: 800,
            height: 600,
            parentElement: mockParent,
            getContext: () => ({
                clearRect: jest.fn(),
                beginPath: jest.fn(),
                arc: jest.fn(),
                fill: jest.fn(),
                stroke: jest.fn(),
                fillRect: jest.fn(),
                strokeRect: jest.fn(),
                fillText: jest.fn(),
                save: jest.fn(),
                restore: jest.fn(),
                setLineDash: jest.fn(),
                translate: jest.fn(),
                closePath: jest.fn(),
                measureText: jest.fn(() => ({ width: 0 }))
            })
        };

        // Reset Agent ID for determinism
        Agent.nextId = 0;

        // Mock Math.random for determinism
        let seed = 0.123;
        jest.spyOn(Math, 'random').mockImplementation(() => {
            seed = (seed * 16807) % 2147483647;
            return (seed - 1) / 2147483646;
        });

        // Mock performance.now for determinism (T12.3 depends on it)
        let mockTime = 1000;
        jest.spyOn(performance, 'now').mockImplementation(() => {
            mockTime += 16.66; // 60fps
            return mockTime;
        });

        sim = new Simulation(mockCanvas, {
            spawnRate: 0,
            mutationRate: 5,
            fearInfluence: 50
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should maintain deterministic state for 5 frames', () => {
        const states = [];
        
        for (let i = 0; i < 5; i++) {
            sim.update();
            states.push(sim.getVisualState());
        }

        // Re-initialize with same seed
        Agent.nextId = 0;
        let seed = 0.123;
        jest.spyOn(Math, 'random').mockImplementation(() => {
            seed = (seed * 16807) % 2147483647;
            return (seed - 1) / 2147483646;
        });

        // Reset performance.now for the second run
        let mockTime = 1000;
        jest.spyOn(performance, 'now').mockImplementation(() => {
            mockTime += 16.66;
            return mockTime;
        });

        const newSim = new Simulation(mockCanvas, {
            spawnRate: 0,
            mutationRate: 5,
            fearInfluence: 50
        });

        for (let i = 0; i < 5; i++) {
            newSim.update();
            const newState = newSim.getVisualState();
            
            const isIdentical = Simulation.compareVisualStates(states[i], newState, 0);
            expect(isIdentical).toBe(true);
        }
    });

    it('should detect visual deviation when state is modified', () => {
        sim.update();
        const state1 = sim.getVisualState();
        
        // Manually move an agent significantly
        sim.agents[0].x += 10;
        const state2 = sim.getVisualState();
        
        const isIdentical = Simulation.compareVisualStates(state1, state2, 1);
        expect(isIdentical).toBe(false);
    });

    it('should tolerate minor jitter within threshold', () => {
        sim.update();
        const state1 = sim.getVisualState();
        
        const state2 = JSON.parse(JSON.stringify(state1));
        state2.agents[0].x += 1;
        
        const isIdentical = Simulation.compareVisualStates(state1, state2, 2);
        expect(isIdentical).toBe(true);
    });
});
