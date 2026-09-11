import { describe, it, expect } from '@jest/globals';
import { CollectiveCourageHarness, GoalArbitrationEngine, GOAL_TYPES } from '../packages/core/index.js';

// NEXT-157 (audit candidate 22): duty-conditioned collective courage at
// squad level. CollectiveCourageHarness judges holdsDuty from morale vs
// retreat pressure; GoalArbitrationEngine judges duty vs flight per member
// from fear and goal priorities. Neither sees the other's input (the
// harness never reads duty goals; the arbiter never reads leadership), so
// this joint test maps where the two verdicts agree and where the duty
// priority alone flips the squad outcome.
function joint({ baseFear = 0.45, casualties = 1, leaderPresent = true, dutyPriority = 0.5 }) {
    const h = new CollectiveCourageHarness();
    const order = ['member_0', 'member_1', 'member_2'].slice(0, casualties);
    const rep = h.runSequence({ members: 8, casualtyOrder: order, leaderPresent, baseFear });
    const arb = new GoalArbitrationEngine();
    let duty = 0;
    for (let m = 0; m < rep.survivors; m++) {
        const id = 'sq' + m;
        arb.registerGoal(id, { type: GOAL_TYPES.HOLD_POST, priority: dutyPriority });
        arb.registerGoal(id, { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
        if (arb.arbitrate(id, { fear: rep.finalFear }).winningGoal === GOAL_TYPES.HOLD_POST) duty++;
    }
    return { holdsDuty: rep.holdsDuty, finalFear: rep.finalFear, duty, survivors: rep.survivors };
}

describe('NEXT-157: duty-conditioned collective courage', () => {
    it('1. Led squads at moderate loss agree: morale holds and duty is unanimous', () => {
        for (const baseFear of [0.45, 0.7]) {
            const r = joint({ baseFear, casualties: 1, leaderPresent: true, dutyPriority: 0.5 });
            expect(r.holdsDuty).toBe(true);
            expect(r.duty).toBe(r.survivors);
        }
    });

    it('2. Duty priority alone flips the squad while morale is unchanged', () => {
        const low = joint({ casualties: 1, leaderPresent: true, dutyPriority: 0.2 });
        const mid = joint({ casualties: 1, leaderPresent: true, dutyPriority: 0.5 });
        expect(low.holdsDuty).toBe(true);
        expect(mid.holdsDuty).toBe(true);
        expect(low.duty).toBe(0);
        expect(mid.duty).toBe(mid.survivors);
    });

    it('3. High-fear divergence is restored by raising the duty priority', () => {
        const diverged = joint({ baseFear: 0.85, casualties: 1, leaderPresent: true, dutyPriority: 0.5 });
        expect(diverged.holdsDuty).toBe(true);
        expect(diverged.duty).toBe(0);
        const restored = joint({ baseFear: 0.85, casualties: 1, leaderPresent: true, dutyPriority: 0.8 });
        expect(restored.duty).toBe(restored.survivors);
    });

    it('4. Arbitration is leadership-blind: arms differ in morale, not in goals', () => {
        const led = joint({ casualties: 1, leaderPresent: true, dutyPriority: 0.5 });
        const unled = joint({ casualties: 1, leaderPresent: false, dutyPriority: 0.5 });
        expect(led.holdsDuty).toBe(true);
        expect(unled.holdsDuty).toBe(false);
        expect(led.duty).toBe(led.survivors);
        expect(unled.duty).toBe(unled.survivors);
    });

    it('5. Broken squads agree too: heavy loss breaks both verdicts', () => {
        const r = joint({ baseFear: 0.7, casualties: 3, leaderPresent: true, dutyPriority: 0.5 });
        expect(r.holdsDuty).toBe(false);
        expect(r.duty).toBe(0);
    });

    it('6. Joint verdicts replay exactly', () => {
        const run = () => joint({ baseFear: 0.7, casualties: 2, leaderPresent: true, dutyPriority: 0.5 });
        expect(run()).toEqual(run());
    });
});
