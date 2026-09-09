/**
 * @file goal-arbitration.test.js
 *
 * Front B / Sections 212–214, 216:
 * Semantic NPC Goals, Conflicting-Goal Arbitration & Courage Model.
 */

import { GoalArbitrationEngine, GOAL_TYPES, ROLE_CONSTRAINTS } from '../packages/core/index.js';

describe('Front B / Sections 212–214, 216: Semantic Goal Arbitration', () => {
    test('1. High fear with no duty defaults to survival flight', () => {
        const e = new GoalArbitrationEngine();
        const r = e.arbitrate('civilian_01', { fear: 0.85 });
        expect(r.winningGoal).toBe(GOAL_TYPES.SURVIVE);
        expect(r.winningIntent).toBe('FLEE_FROM');
        expect(r.courageous).toBe(false);
    });

    test('2. Strong hold-post duty overrides flight and marks courage', () => {
        const e = new GoalArbitrationEngine();
        e.registerGoal('guard_01', { type: GOAL_TYPES.SURVIVE, priority: 0.55 });
        e.registerGoal('guard_01', { type: GOAL_TYPES.HOLD_POST, priority: 0.8 });
        const r = e.arbitrate('guard_01', { fear: 0.75 });
        expect(r.winningGoal).toBe(GOAL_TYPES.HOLD_POST);
        expect(r.winningIntent).toBe('IDLE_VIGILANT');
        expect(r.courageous).toBe(true);
        expect(r.fearOverridden).toBe(true);
        expect(r.calmCompliance).toBe(false);
    });

    test('3. Calm compliance is not mislabeled as courage', () => {
        const e = new GoalArbitrationEngine();
        e.registerGoal('guard_02', { type: GOAL_TYPES.HOLD_POST, priority: 0.8 });
        const r = e.arbitrate('guard_02', { fear: 0.1 });
        expect(r.winningGoal).toBe(GOAL_TYPES.HOLD_POST);
        expect(r.courageous).toBe(false);
        expect(r.calmCompliance).toBe(true);
    });

    test('4. NEVER_ABANDON_POST vetoes flight intents', () => {
        const e = new GoalArbitrationEngine();
        e.registerGoal('guard_03', { type: GOAL_TYPES.SURVIVE, priority: 0.9 });
        e.setRoleConstraints('guard_03', [ROLE_CONSTRAINTS.NEVER_ABANDON_POST]);
        const r = e.arbitrate('guard_03', { fear: 0.9 });
        expect(r.winningIntent).not.toBe('FLEE_FROM');
        expect(r.vetoedIntents.length).toBeGreaterThan(0);
        expect(r.vetoedIntents[0].vetoReason).toBe('NEVER_ABANDON_POST');
    });

    test('5. Loyalty priority decides fear-vs-protect tradeoffs', () => {
        const loyal = new GoalArbitrationEngine();
        loyal.registerGoal('medic_hi', { type: GOAL_TYPES.SURVIVE, priority: 0.55 });
        loyal.registerGoal('medic_hi', { type: GOAL_TYPES.PROTECT_ALLY, priority: 0.85 });
        const win = loyal.arbitrate('medic_hi', { fear: 0.7 });
        expect(win.winningGoal).toBe(GOAL_TYPES.PROTECT_ALLY);
        expect(win.courageous).toBe(true);

        const selfish = new GoalArbitrationEngine();
        selfish.registerGoal('medic_lo', { type: GOAL_TYPES.SURVIVE, priority: 0.55 });
        selfish.registerGoal('medic_lo', { type: GOAL_TYPES.PROTECT_ALLY, priority: 0.2 });
        const lose = selfish.arbitrate('medic_lo', { fear: 0.7 });
        expect(lose.winningGoal).toBe(GOAL_TYPES.SURVIVE);
        expect(lose.courageous).toBe(false);
    });

    test('6. Goal ranking is deterministic under ties', () => {
        const e = new GoalArbitrationEngine();
        e.registerGoal('a', { type: GOAL_TYPES.ESCORT_CARAVAN, priority: 0.6 });
        e.registerGoal('a', { type: GOAL_TYPES.PROTECT_ALLY, priority: 0.6 });
        const r1 = e.arbitrate('a', { fear: 0.5 });
        const r2 = e.arbitrate('a', { fear: 0.5 });
        expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
        expect(r1.rankedGoals[0].score).toBeGreaterThanOrEqual(r1.rankedGoals[1].score);
        expect(() => e.registerGoal('a', { type: 'BOGUS_GOAL' })).toThrow();
    });

    test('7. Authority invariant holds with zero host mutation', () => {
        const e = new GoalArbitrationEngine();
        e.registerGoal('guard_04', { type: GOAL_TYPES.HOLD_POST, priority: 0.9 });
        const r = e.arbitrate('guard_04', { fear: 0.95 });
        expect(r.winningIntent).toBe('IDLE_VIGILANT');
        const audit = e.auditImmutability();
        expect(audit.isClean).toBe(true);
        expect(audit.status).toBe('CLEAN_ADVISORY_ONLY');
        expect(audit.hostPhysicsMutations).toBe(0);
        expect(audit.hostTransformMutations).toBe(0);
    });
});
