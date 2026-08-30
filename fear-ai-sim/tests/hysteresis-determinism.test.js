// Determinism regression tests for HysteresisController.
// The audit found that hysteresis.js called Math.random() at the
// FREEZE check and the FREEZE-exit check. With Math.random as the
// default, the controller was non-deterministic whenever the FREEZE
// path was exercised. This test fixes the contract: a seeded rng
// gives reproducible state transitions.

import { describe, expect, it } from '@jest/globals';
import { HysteresisController } from '../hysteresis.js';

// Tiny deterministic LCG for reproducible [0, 1) values.
function makeSeededRng(seed) {
    let state = seed | 0;
    return () => {
        // xorshift32
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        // Map to [0, 1)
        return ((state >>> 0) % 1_000_000) / 1_000_000;
    };
}

describe('HysteresisController determinism', () => {
    it('uses a constructor-provided rng, not Math.random', () => {
        const rng = makeSeededRng(1);
        const controller = new HysteresisController({ rng });
        expect(controller.rng).toBe(rng);
    });

    it('produces identical state sequences for two controllers with different seeds (decision path)', () => {
        // In this scenario the FREEZE branch never fires (rng > 0.05
        // on every call because the seeded rng returns 0.6+ on every
        // step), so the decision path is the only thing that
        // changes. Two controllers with different seeds should walk
        // the same trajectory.
        const inputs = [
            { fear: 0.9, morale: 0.3, skill: 0.5, threats: ['x'] },
            { fear: 0.85, morale: 0.3, skill: 0.5, threats: ['x'] },
            { fear: 0.7, morale: 0.3, skill: 0.5, threats: [] },
            { fear: 0.5, morale: 0.4, skill: 0.5, threats: [] },
            { fear: 0.3, morale: 0.5, skill: 0.5, threats: [] }
        ];
        const a = new HysteresisController({ rng: () => 0.6 });
        const b = new HysteresisController({ rng: () => 0.7 });
        const statesA = [];
        const statesB = [];
        for (const inp of inputs) {
            a.update(inp.fear, { skill: inp.skill, morale: inp.morale, threats: inp.threats });
            b.update(inp.fear, { skill: inp.skill, morale: inp.morale, threats: inp.threats });
            statesA.push(a.currentState);
            statesB.push(b.currentState);
        }
        expect(statesB).toEqual(statesA);
    });

    it('the FREEZE branch is reachable with a low rng value and is visited during the run', () => {
        const rng = () => 0.01; // always < 0.05
        const c = new HysteresisController({ rng });
        // Walk the state machine forward and record every visited
        // state. With a low rng, the FREEZE branch fires from
        // PANIC, so the visited set must include FREEZE.
        const visited = new Set();
        for (let i = 0; i < 60; i++) {
            c.update(0.9, { skill: 0, morale: 0.1, threats: ['x'] });
            visited.add(c.currentState);
        }
        // With rng always < 0.05, the controller enters FREEZE
        // (and then leaves to RECOVER via the same rng).
        expect(visited.has('FREEZE')).toBe(true);
    });

    it('the FREEZE branch is NOT reachable with a high rng value; HIDE is taken instead', () => {
        const rng = () => 0.99; // always > 0.05
        const c = new HysteresisController({ rng });
        // Drive through CALM → ALERT (10) → ANXIOUS (10) → PANIC (10)
        // → HIDE. Need ~50 ticks total to walk through the chain.
        for (let i = 0; i < 60; i++) c.update(0.95, { skill: 0.8, morale: 0.1, threats: ['x'] });
        expect(c.currentState).toBe('HIDE');
    });

    it('a controller with the same rng seed is reproducible across instances', () => {
        const seed = 17;
        const a = new HysteresisController({ rng: makeSeededRng(seed) });
        const b = new HysteresisController({ rng: makeSeededRng(seed) });
        const inputs = [
            { fear: 0.9, morale: 0.1, skill: 0, threats: ['x'] },
            { fear: 0.9, morale: 0.1, skill: 0, threats: ['x'] },
            { fear: 0.7, morale: 0.2, skill: 0, threats: ['x'] },
            { fear: 0.5, morale: 0.3, skill: 0, threats: [] }
        ];
        const statesA = [];
        const statesB = [];
        for (const inp of inputs) {
            a.update(inp.fear, { skill: inp.skill, morale: inp.morale, threats: inp.threats });
            b.update(inp.fear, { skill: inp.skill, morale: inp.morale, threats: inp.threats });
            statesA.push(a.currentState);
            statesB.push(b.currentState);
        }
        expect(statesB).toEqual(statesA);
    });
});
