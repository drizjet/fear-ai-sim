import { describe, it, expect } from '@jest/globals';
import {
    CollectiveCourageHarness,
    GoalArbitrationEngine,
    GOAL_TYPES,
} from '../packages/core/index.js';

// NEXT-169 (post-25 candidate 9): per-member fear heterogeneity in
// courage joints. runSequence honors host-reported fearByMember (the
// documented-but-unread input): members seed and ratchet individually,
// squad series track the survivor mean, and the report adds per-member
// finals for member-by-member arbitration.
function dutyFraction(finalFears, dutyPriority = 0.5) {
    const arb = new GoalArbitrationEngine();
    const ids = Object.keys(finalFears);
    let duty = 0;
    for (const id of ids) {
        arb.registerGoal(id, { type: GOAL_TYPES.HOLD_POST, priority: dutyPriority });
        arb.registerGoal(id, { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
        if (arb.arbitrate(id, { fear: finalFears[id] }).winningGoal === GOAL_TYPES.HOLD_POST) duty++;
    }
    return { duty, survivors: ids.length };
}

describe('NEXT-169: heterogeneous squad fear', () => {
    it('1. Uniform input reproduces legacy series exactly', () => {
        const h = new CollectiveCourageHarness();
        const cfg = { members: 8, casualtyOrder: ['member_0', 'member_1'], baseFear: 0.45 };
        const a = h.runSequence(cfg);
        const b = h.runSequence({ ...cfg, fearByMember: {} });
        for (const k of ['moraleSeries', 'fearSeries', 'retreatSeries']) {
            expect(b[k]).toEqual(a[k]);
        }
        expect(b.holdsDuty).toBe(a.holdsDuty);
        expect(Object.values(b.finalFears).every((f) => f === b.finalFear)).toBe(true);
    });

    it('2. Composition beats the mean: same morale, split verdict', () => {
        const h = new CollectiveCourageHarness();
        const het = h.runSequence({
            members: 8, casualtyOrder: ['member_0'], baseFear: 0.45,
            fearByMember: { member_1: 0.95, member_2: 0.9 },
        });
        const uni = h.runSequence({ members: 8, casualtyOrder: ['member_0'], baseFear: het.finalFear });
        expect(het.holdsDuty).toBe(uni.holdsDuty);
        const hetFrac = dutyFraction(het.finalFears);
        const uniFrac = dutyFraction(uni.finalFears);
        expect(hetFrac.duty).toBeLessThan(hetFrac.survivors);
        expect(uniFrac.duty).toBe(uniFrac.survivors);
    });

    it('3. Finals cover survivors only, sorted, after individual ratchets', () => {
        const h = new CollectiveCourageHarness();
        const rep = h.runSequence({
            members: 8, casualtyOrder: ['member_0', 'member_1'], baseFear: 0.45,
            fearByMember: { member_2: 0.1 },
        });
        expect(Object.keys(rep.finalFears)).toEqual(Object.keys(rep.finalFears).sort());
        expect('member_0' in rep.finalFears).toBe(false);
        expect('member_1' in rep.finalFears).toBe(false);
        expect(rep.finalFears.member_2).toBeGreaterThan(0.1);
        expect(rep.finalFears.member_2).toBeLessThan(rep.finalFear);
    });

    it('4. Malformed per-member entries degrade to base fear', () => {
        const h = new CollectiveCourageHarness();
        const cfg = { members: 8, casualtyOrder: ['member_0'], baseFear: 0.45 };
        const plain = h.runSequence(cfg);
        for (const bad of [NaN, 'high', -5, 99, null]) {
            const r = h.runSequence({ ...cfg, fearByMember: { member_1: bad } });
            if (typeof bad === 'number' && Number.isFinite(bad)) {
                continue;
            }
            expect(r.fearSeries).toEqual(plain.fearSeries);
        }
        const clamped = h.runSequence({ ...cfg, fearByMember: { member_1: 99 } });
        expect(clamped.finalFears.member_1).toBeLessThanOrEqual(1);
        const floored = h.runSequence({ ...cfg, fearByMember: { member_1: -5 } });
        expect(floored.finalFears.member_1).toBeGreaterThanOrEqual(0);
    });

    it('5. Leaderless break still breaks under heterogeneity', () => {
        const h = new CollectiveCourageHarness();
        const rep = h.runSequence({
            members: 6,
            casualtyOrder: ['member_0', 'member_1', 'member_2', 'member_3', 'member_4'],
            leaderPresent: false,
            fearByMember: { member_5: 0.05 },
        });
        expect(rep.holdsDuty).toBe(false);
        expect(rep.finalRetreatPressure).toBeGreaterThan(0);
    });

    it('6. Heterogeneous runs replay exactly', () => {
        const run = () => new CollectiveCourageHarness().runSequence({
            members: 8, casualtyOrder: ['member_0'], baseFear: 0.45,
            fearByMember: { member_1: 0.95, member_2: 0.1 },
        });
        const a = run();
        expect({ ...a, finalFears: a.finalFears }).toEqual({ ...run(), finalFears: run().finalFears });
    });
});
