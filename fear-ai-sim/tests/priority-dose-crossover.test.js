import { describe, it, expect } from '@jest/globals';
import { GoalArbitrationEngine, GOAL_TYPES } from '../packages/core/index.js';

// NEXT-156 (audit candidate 21): wider priority and trauma-dose crossover
// sweeps. NEXT-144 pinned one ladder row (duty 0.45 vs survival 0.6 across
// fear). This maps the 2-D surface: HOLD_POST priority x traumaLoad dose,
// asking where SURVIVE takes over, whether the flip ever oscillates, and
// whether either goal can still dominate its corner.
const SURVIVAL_PRIORITY = 0.6;
const DUTIES = [0.2, 0.3, 0.4, 0.45, 0.5, 0.55, 0.7];
const LOADS = [0, 0.5, 1];

function sweep(dutyP, load) {
    const arb = new GoalArbitrationEngine();
    arb.registerGoal('g', { type: GOAL_TYPES.HOLD_POST, priority: dutyP });
    arb.registerGoal('g', { type: GOAL_TYPES.SURVIVE, priority: SURVIVAL_PRIORITY });
    const seq = [];
    for (let f = 0; f <= 1.0001; f += 0.05) {
        seq.push(arb.arbitrate('g', { fear: f }, { traumaLoad: load }).winningGoal);
    }
    const flips = seq.slice(1).filter((w, i) => w !== seq[i]).length;
    const firstS = seq.indexOf(GOAL_TYPES.SURVIVE);
    return { seq, flips, firstS: firstS < 0 ? Infinity : Math.round(firstS * 0.05 * 100) / 100 };
}

describe('NEXT-156: priority x trauma-dose crossover sweeps', () => {
    it('1. No cell flaps: at most one winner flip across the fear ramp', () => {
        for (const d of DUTIES) {
            for (const l of LOADS) {
                expect(sweep(d, l).flips).toBeLessThanOrEqual(1);
            }
        }
    });

    it('2. Crossover never moves later as the trauma dose rises', () => {
        for (const d of DUTIES) {
            const row = LOADS.map((l) => sweep(d, l).firstS);
            for (let i = 1; i < row.length; i++) {
                expect(row[i]).toBeLessThanOrEqual(row[i - 1]);
            }
        }
    });

    it('3. Crossover never moves earlier as duty priority rises', () => {
        for (const l of LOADS) {
            const col = DUTIES.map((d) => sweep(d, l).firstS);
            for (let i = 1; i < col.length; i++) {
                expect(col[i]).toBeGreaterThanOrEqual(col[i - 1]);
            }
        }
    });

    it('4. Pinned crossover ladder', () => {
        const rows = [0.3, 0.4, 0.45, 0.5].map((d) => LOADS.map((l) => sweep(d, l).firstS));
        expect(rows).toEqual([
            [0.35, 0.25, 0.05],
            [0.6, 0.5, 0.4],
            [0.7, 0.65, 0.55],
            [0.8, 0.75, 0.7],
        ]);
    });

    it('5. Corners hold: strong duty never yields, dosed survival can own the ramp', () => {
        for (const l of LOADS) {
            const r = sweep(0.7, l);
            expect(r.firstS).toBe(Infinity);
            expect(r.seq[20]).toBe(GOAL_TYPES.HOLD_POST);
        }
        const owned = sweep(0.2, 1);
        expect(owned.firstS).toBe(0);
        expect(owned.seq[0]).toBe(GOAL_TYPES.SURVIVE);
    });

    it('6. Full surface sweep replays exactly', () => {
        const run = () => DUTIES.map((d) => LOADS.map((l) => sweep(d, l).firstS));
        expect(run()).toEqual(run());
    });
});
