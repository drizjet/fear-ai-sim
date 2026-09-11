import { describe, it, expect } from '@jest/globals';
import { GoalArbitrationEngine, GOAL_TYPES } from '../packages/core/index.js';

// NEXT-161 (post-25 audit, red-team pick): no-flap generalization.
// NEXT-156 pinned at most one winner flip across the fear ramp for
// HOLD_POST vs SURVIVE. The strongest-claim attack is that ally/escort
// goals with bond and tendency weights on could oscillate. Sweep the
// full duty-goal set with trauma loads, ally bonds, and hostile identity
// tendencies: the flip bound must hold in all 360 cells.
const DUTIES = [
    GOAL_TYPES.HOLD_POST,
    GOAL_TYPES.PROTECT_ALLY,
    GOAL_TYPES.AID_VICTIM,
    GOAL_TYPES.ESCORT_CARAVAN,
    GOAL_TYPES.REACH_SAFETY,
];
const PRIORITIES = [0.2, 0.45, 0.6, 0.8];
const LOADS = [0, 0.5, 1];
const BONDS = [0, 0.5, 1];

function sweep(duty, dp, load, bond, identityOn) {
    const arb = new GoalArbitrationEngine();
    arb.registerGoal('g', { type: duty, priority: dp });
    arb.registerGoal('g', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
    const ctx = {
        traumaLoad: load,
        allyBond: bond,
        allyBondWeight: bond > 0 ? 1 : 0,
        identityWeight: identityOn ? 1 : 0,
        identityTendencies: identityOn
            ? { flee: 0.9, stand: 0.1, help: 0.1, rally: 0.1 }
            : undefined,
    };
    const seq = [];
    for (let f = 0; f <= 1.0001; f += 0.05) {
        seq.push(arb.arbitrate('g', { fear: f }, ctx).winningGoal);
    }
    const flips = seq.slice(1).filter((w, i) => w !== seq[i]).length;
    const firstS = seq.indexOf(GOAL_TYPES.SURVIVE);
    return { flips, firstS: firstS < 0 ? Infinity : Math.round(firstS * 0.05 * 100) / 100 };
}

describe('NEXT-161: no-flap generalization with weights on', () => {
    it('1. All 360 cells flip at most once', () => {
        let cells = 0;
        for (const duty of DUTIES) {
            for (const dp of PRIORITIES) {
                for (const load of LOADS) {
                    for (const bond of BONDS) {
                        for (const iw of [false, true]) {
                            expect(sweep(duty, dp, load, bond, iw).flips).toBeLessThanOrEqual(1);
                            cells++;
                        }
                    }
                }
            }
        }
        expect(cells).toBe(360);
    });

    it('2. Dose monotonicity holds per cell with weights fixed', () => {
        for (const duty of DUTIES) {
            for (const dp of PRIORITIES) {
                const row = LOADS.map((l) => sweep(duty, dp, l, 0.5, true).firstS);
                for (let i = 1; i < row.length; i++) {
                    expect(row[i]).toBeLessThanOrEqual(row[i - 1]);
                }
            }
        }
    });

    it('3. Full-bond ally goals still yield to survival at the top', () => {
        for (const duty of [GOAL_TYPES.PROTECT_ALLY, GOAL_TYPES.AID_VICTIM]) {
            const r = sweep(duty, 0.2, 1, 1, false);
            expect(r.firstS).toBeLessThan(Infinity);
        }
    });

    it('4. Sweep replays exactly', () => {
        const run = () => sweep(GOAL_TYPES.ESCORT_CARAVAN, 0.45, 0.5, 0.5, true);
        expect(run()).toEqual(run());
    });
});
