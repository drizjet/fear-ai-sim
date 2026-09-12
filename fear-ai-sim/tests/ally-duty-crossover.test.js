import { describe, it, expect } from '@jest/globals';
import { GoalArbitrationEngine, GOAL_TYPES } from '../packages/core/index.js';

// Post-25 audit candidate 12: ally/escort duty crossover sweeps.
// Extends the NEXT-156 HOLD_POST-only sweeps to the ally-directed duties:
// PROTECT_ALLY / AID_VICTIM scale with allyBondWeight, while ESCORT_CARAVAN
// scales with the identity rally tendency instead (bond-blind).
const SURVIVAL_PRIORITY = 0.6;
const ALLY_DUTIES = [GOAL_TYPES.PROTECT_ALLY, GOAL_TYPES.AID_VICTIM, GOAL_TYPES.ESCORT_CARAVAN];
const DUTY_PRIORITIES = [0.2, 0.45, 0.6, 0.8];
const LOADS = [0, 0.5, 1];
const BONDS = [0, 0.5, 1];

function sweep(duty, dutyPriority, load, bond) {
    const arb = new GoalArbitrationEngine();
    arb.registerGoal('g', { type: duty, priority: dutyPriority });
    arb.registerGoal('g', { type: GOAL_TYPES.SURVIVE, priority: SURVIVAL_PRIORITY });
    const ctx = { traumaLoad: load, allyBond: bond, allyBondWeight: 1 };
    const seq = [];
    for (let f = 0; f <= 1.0001; f += 0.05) {
        seq.push(arb.arbitrate('g', { fear: f }, ctx).winningGoal);
    }
    const flips = seq.slice(1).filter((w, i) => w !== seq[i]).length;
    const firstS = seq.indexOf(GOAL_TYPES.SURVIVE);
    return { seq, flips, firstS: firstS < 0 ? Infinity : Math.round(firstS * 0.05 * 100) / 100 };
}

describe('ally/escort duty crossover sweeps', () => {
    it('1. No-flap: each duty flips at most once across the fear ramp', () => {
        let cells = 0;
        for (const duty of ALLY_DUTIES) {
            for (const dp of DUTY_PRIORITIES) {
                for (const load of LOADS) {
                    for (const bond of BONDS) {
                        expect(sweep(duty, dp, load, bond).flips).toBeLessThanOrEqual(1);
                        cells++;
                    }
                }
            }
        }
        expect(cells).toBe(108);
    });

    it('2. Bond monotonicity: ally crossovers never move earlier as bond rises', () => {
        for (const duty of [GOAL_TYPES.PROTECT_ALLY, GOAL_TYPES.AID_VICTIM]) {
            for (const dp of DUTY_PRIORITIES) {
                for (const load of LOADS) {
                    const row = BONDS.map((b) => sweep(duty, dp, load, b).firstS);
                    for (let i = 1; i < row.length; i++) {
                        expect(row[i]).toBeGreaterThanOrEqual(row[i - 1]);
                    }
                }
            }
        }
    });

    it('2b. ESCORT_CARAVAN is bond-blind: bond does not move its crossover', () => {
        for (const dp of DUTY_PRIORITIES) {
            for (const load of LOADS) {
                const row = BONDS.map((b) => sweep(GOAL_TYPES.ESCORT_CARAVAN, dp, load, b).firstS);
                expect(row[1]).toBe(row[0]);
                expect(row[2]).toBe(row[0]);
            }
        }
    });

    it('3. Pinned PROTECT_ALLY ladder at duty 0.45, bond 0.5', () => {
        const ladder = LOADS.map((l) => sweep(GOAL_TYPES.PROTECT_ALLY, 0.45, l, 0.5).firstS);
        expect(ladder).toEqual([0.7, 0.65, 0.55]);
    });

    it('4. Full-bond low-duty ally still yields to survival at high fear', () => {
        for (const duty of [GOAL_TYPES.PROTECT_ALLY, GOAL_TYPES.AID_VICTIM]) {
            const r = sweep(duty, 0.2, 1, 1);
            expect(r.firstS).toBeLessThan(Infinity);
            expect(r.firstS).toBe(0.05);
        }
    });

    it('5. Full sweep grid replays exactly', () => {
        const run = () =>
            ALLY_DUTIES.map((d) => DUTY_PRIORITIES.map((dp) => LOADS.map((l) => BONDS.map((b) => sweep(d, dp, l, b).firstS))));
        expect(run()).toEqual(run());
    });
});
