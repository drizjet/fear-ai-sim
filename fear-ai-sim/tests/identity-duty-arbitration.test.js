import { describe, it, expect } from '@jest/globals';
import { CharacterIdentityArchitecture } from '../packages/core/index.js';
import { GoalArbitrationEngine, GOAL_TYPES } from '../packages/core/index.js';

// NEXT-134: duty-arbitration stress interaction (CCI-28 frontier 18).
// No production change was needed: NEXT-132 duty flows into CIA
// stand/help/rally tendencies, and NEXT-118 tendency weights already bend
// arbitration. These tests pin the emergent interaction: under rising fear,
// high-duty characters hold DUTY goals past the point where low-duty twins
// switch to SURVIVAL.
describe('NEXT-134: duty delays the goal crossover under stress', () => {
    // Fear level at which SURVIVE first outranks HOLD_POST (equal priority).
    function crossover(duty, step = 0.05) {
        const cia = new CharacterIdentityArchitecture();
        cia.registerCharacter('x', { duty });
        const arb = new GoalArbitrationEngine();
        arb.registerGoal('x', { type: GOAL_TYPES.HOLD_POST, priority: 0.6 });
        arb.registerGoal('x', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
        for (let f = 0; f <= 1.0001; f += step) {
            const t = cia.tick('x', {}, { fear: f, perceivedDanger: f }).tendencies;
            const r = arb.arbitrate('x', { fear: f }, { identityTendencies: t, identityWeight: 1.0 });
            if (r.winningGoal !== GOAL_TYPES.HOLD_POST) return Math.round(f * 100) / 100;
        }
        return Infinity;
    }

    it('1. Crossover fear rises monotonically with duty', () => {
        const c0 = crossover(0.0), c5 = crossover(0.5), c1 = crossover(1.0);
        expect(c0).toBeLessThan(c5);
        expect(c5).toBeLessThan(c1);
    });

    it('2. Pinned crossover ladder across five duty levels', () => {
        expect([0, 0.25, 0.5, 0.75, 1.0].map((d) => crossover(d))).toEqual([0.65, 0.7, 0.75, 0.8, 0.8]);
    });

    it('3. Without identity weights duty cannot move arbitration (legacy)', () => {
        const run = (duty) => {
            const cia = new CharacterIdentityArchitecture();
            cia.registerCharacter('x', { duty });
            const arb = new GoalArbitrationEngine();
            arb.registerGoal('x', { type: GOAL_TYPES.HOLD_POST, priority: 0.6 });
            arb.registerGoal('x', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
            const t = cia.tick('x', {}, { fear: 0.7, perceivedDanger: 0.7 }).tendencies;
            return arb.arbitrate('x', { fear: 0.7 }, { identityTendencies: t, identityWeight: 0 }).winningGoal;
        };
        expect(run(0.0)).toBe(run(1.0));
    });

    it('4. Duty also delays the PROTECT_ALLY crossover', () => {
        const run = (duty) => {
            const cia = new CharacterIdentityArchitecture();
            cia.registerCharacter('x', { duty });
            const arb = new GoalArbitrationEngine();
            arb.registerGoal('x', { type: GOAL_TYPES.PROTECT_ALLY, priority: 0.6 });
            arb.registerGoal('x', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
            for (let f = 0; f <= 1.0001; f += 0.05) {
                const t = cia.tick('x', {}, { fear: f, perceivedDanger: f }).tendencies;
                const r = arb.arbitrate('x', { fear: f }, { identityTendencies: t, identityWeight: 1.0 });
                if (r.winningGoal !== GOAL_TYPES.PROTECT_ALLY) return Math.round(f * 100) / 100;
            }
            return Infinity;
        };
        expect(run(0.0)).toBeLessThan(run(1.0));
    });

    it('5. Sweeps are exactly reproducible', () => {
        expect(crossover(0.75)).toBe(crossover(0.75));
    });
});
