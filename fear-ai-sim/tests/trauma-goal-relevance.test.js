import { describe, it, expect } from '@jest/globals';
import { GoalArbitrationEngine, GOAL_TYPES } from '../packages/core/index.js';

// NEXT-144: trauma-weighted goal relevance (audit candidate 8).
// Opt-in context.traumaLoad in [0,1] lifts SURVIVE / REACH_SAFETY
// relevance (hypervigilance: survival stays salient at low immediate
// fear); duty-goal relevance stays flat. Load 0 is legacy exactly.
describe('NEXT-144: trauma load lifts survival relevance', () => {
    function crossover(load) {
        const arb = new GoalArbitrationEngine();
        arb.registerGoal('g', { type: GOAL_TYPES.HOLD_POST, priority: 0.45 });
        arb.registerGoal('g', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
        for (let f = 0; f <= 1.0001; f += 0.05) {
            const r = arb.arbitrate('g', { fear: f }, { traumaLoad: load });
            if (r.winningGoal !== GOAL_TYPES.HOLD_POST) return Math.round(f * 100) / 100;
        }
        return Infinity;
    }
    const relevanceOf = (load, fear = 0.3) => {
        const arb = new GoalArbitrationEngine();
        arb.registerGoal('g', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
        arb.registerGoal('g', { type: GOAL_TYPES.HOLD_POST, priority: 0.6 });
        const r = arb.arbitrate('g', { fear }, { traumaLoad: load });
        const byGoal = {};
        for (const e of r.rankedGoals) byGoal[e.goal] = e.relevance;
        return byGoal;
    };

    it('1. Load 0 reproduces legacy relevance exactly', () => {
        const arb = new GoalArbitrationEngine();
        arb.registerGoal('g', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
        const plain = arb.arbitrate('g', { fear: 0.3 }, {});
        const loaded = arb.arbitrate('g', { fear: 0.3 }, { traumaLoad: 0 });
        expect(loaded.rankedGoals).toEqual(plain.rankedGoals);
    });

    it('2. Survival relevance rises with load, duty stays flat', () => {
        const lo = relevanceOf(0), hi = relevanceOf(1);
        expect(hi.SURVIVE).toBeGreaterThan(lo.SURVIVE);
        expect(hi.HOLD_POST).toBe(lo.HOLD_POST);
        expect(lo.SURVIVE).toBeCloseTo(0.475, 6);
        expect(hi.SURVIVE).toBeCloseTo(0.6325, 6);
    });

    it('3. Trauma moves the survival crossover earlier', () => {
        expect(crossover(1)).toBeLessThan(crossover(0));
    });

    it('4. Pinned crossover ladder', () => {
        expect([0, 0.5, 1].map(crossover)).toEqual([0.7, 0.65, 0.55]);
    });

    it('5. Invalid loads degrade safely; extremes clamp', () => {
        const arb = new GoalArbitrationEngine();
        arb.registerGoal('g', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
        const plain = arb.arbitrate('g', { fear: 0.3 }, {}).rankedGoals;
        const full = arb.arbitrate('g', { fear: 0.3 }, { traumaLoad: 1 }).rankedGoals;
        for (const bad of [NaN, -2, 'high']) {
            expect(arb.arbitrate('g', { fear: 0.3 }, { traumaLoad: bad }).rankedGoals).toEqual(plain);
        }
        expect(arb.arbitrate('g', { fear: 0.3 }, { traumaLoad: 99 }).rankedGoals).toEqual(full);
    });
    it('6. Sweeps are exactly reproducible', () => {
        expect(crossover(0.5)).toBe(crossover(0.5));
    });
});
