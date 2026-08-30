import { describe, expect, it } from '@jest/globals';
import { createWorldState } from '../agentactions.js';

const baseAgent = (overrides = {}) => ({
    x: 100,
    y: 100,
    energy: 60,
    brain: {
        state: 'CALM',
        currentFear: 0.2,
        traits: { skill: 0.4, curiosity: 0.4, agreeableness: 0.5 }
    },
    ...overrides
});

const baseVisuals = (overrides = {}) => ({
    threats: [],
    neighbors: [],
    food: [],
    ...overrides
});

describe('createWorldState nearObstacle', () => {
    it('uses visuals.obstacles when present and within radius', () => {
        const agent = baseAgent();
        const state = createWorldState(
            agent,
            baseVisuals({ obstacles: [{ x: 110, y: 100 }] }),
            [],
            false
        );
        expect(state.nearObstacle).toBe(true);
    });

    it('returns false when visuals.obstacles are all out of radius', () => {
        const agent = baseAgent();
        const state = createWorldState(
            agent,
            baseVisuals({ obstacles: [{ x: 1000, y: 1000 }] }),
            [],
            false
        );
        expect(state.nearObstacle).toBe(false);
    });

    it('accepts obstacles expressed with {position:{x,y}}', () => {
        const agent = baseAgent();
        const state = createWorldState(
            agent,
            baseVisuals({ obstacles: [{ position: { x: 130, y: 100 } }] }),
            [],
            false
        );
        expect(state.nearObstacle).toBe(true);
    });

    it('falls back to neighbor heuristic when no obstacles are provided', () => {
        const agent = baseAgent();
        const noObstacles = createWorldState(
            agent,
            baseVisuals({ neighbors: [] }),
            [],
            false
        );
        const withNeighbors = createWorldState(
            agent,
            baseVisuals({ neighbors: [{ id: 'n1' }] }),
            [],
            false
        );
        expect(noObstacles.nearObstacle).toBe(false);
        expect(withNeighbors.nearObstacle).toBe(true);
    });

    it('uses visuals.queryObstacleAt when provided', () => {
        const agent = baseAgent();
        const state = createWorldState(
            agent,
            baseVisuals({
                obstacles: [],
                queryObstacleAt: (x, y, r) => (Math.abs(x - 120) <= r ? { id: 'q' } : null)
            }),
            [],
            false
        );
        expect(state.nearObstacle).toBe(true);
    });
});
