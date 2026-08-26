/**
 * LearningAgent Regression Tests
 *
 * Locks the critical maxSpeed guard (the live class the sim actually
 * instantiates — see simulation.js:143). The earlier dee0f6c fix patched
 * Agent.update(), but the running sim drives LearningAgent.update(), which
 * read emotions.maxSpeed (never initialized) -> NaN -> agents vanish.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { LearningAgent } from '../learningagent.js';

describe('LearningAgent maxSpeed guard', () => {
    beforeEach(() => {
        LearningAgent.nextId = 0;
    });

    it('initializes baseMaxSpeed and maxSpeed (no NaN)', () => {
        const a = new LearningAgent(0, 0);
        expect(Number.isFinite(a.baseMaxSpeed)).toBe(true);
        expect(a.baseMaxSpeed).toBe(3);
        expect(a.maxSpeed).toBe(a.baseMaxSpeed);
    });

    it('BigGuy gets the larger base speed', () => {
        const a = new LearningAgent(0, 0, null, true);
        expect(a.baseMaxSpeed).toBe(1.5);
    });

    it('update() with ANTI_FLEE countermeasures must not produce NaN (emotions.maxSpeed undefined)', () => {
        const a = new LearningAgent(0, 0);
        // Reproduce boot path: emotions.maxSpeed is never set on the live class
        expect(a.emotions.maxSpeed).toBeUndefined();
        // Minimal visuals stub: update() reads threats/food/neighbors as arrays
        const visuals = new Proxy({}, { get: () => [] });
        const counterMeasures = { ANTI_FLEE: 0.5 };
        a.update(1000, 1000, visuals, null, [], [], 0, 0, null, null, null, null, null, null, null, counterMeasures, null);
        expect(Number.isFinite(a.maxSpeed)).toBe(true);
        // 3 * (1 - 0.5*0.4) = 3 * 0.8 = 2.4
        expect(a.maxSpeed).toBeCloseTo(2.4, 5);
    });

    it('update() without countermeasures keeps a finite maxSpeed', () => {
        const a = new LearningAgent(0, 0);
        const visuals = new Proxy({}, { get: () => [] });
        a.update(1000, 1000, visuals, null, [], [], 0, 0, null, null, null, null, null, null, null, null, null);
        expect(Number.isFinite(a.maxSpeed)).toBe(true);
        expect(a.maxSpeed).toBe(3);
    });
});
