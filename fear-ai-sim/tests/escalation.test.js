import { describe, expect, it } from '@jest/globals';
import { executeRetaliation, planRetaliation, relocateBandit } from '../escalation.js';

describe('escalation execution', () => {
    it('relocates pressured bandits only to valid alternate roads', () => {
        const bandit = { id: 'b', roadId: 'r1', alternateRoadId: 'r2' };
        expect(relocateBandit(bandit, [{ id: 'r2' }], { pressure: 0.8 }).relocated).toBe(true);
        expect(bandit.roadId).toBe('r2');
    });

    it('planning retaliation does not mutate state', () => {
        const faction = { id: 'f', lastDecision: 'RAID', escalation: 6, resources: 2 };
        const target = { id: 't' };
        const plan = planRetaliation(faction, target, { tick: 2 });
        expect(plan.ok).toBe(true);
        expect(typeof plan.action.actionId).toBe('string');
        // No mutation should have happened.
        expect(faction.resources).toBe(2);
        expect(target.threatened).toBeFalsy();
    });

    it('planning retaliation refuses without a RAID decision', () => {
        const faction = { id: 'f', lastDecision: 'HOLD', escalation: 1, resources: 2 };
        const target = { id: 't' };
        const plan = planRetaliation(faction, target);
        expect(plan.ok).toBe(false);
        expect(plan.reason).toBe('NOT_RAID_DECISION');
    });

    it('planning retaliation refuses with no resources', () => {
        const faction = { id: 'f', lastDecision: 'RAID', escalation: 6, resources: 0 };
        const target = { id: 't' };
        const plan = planRetaliation(faction, target);
        expect(plan.ok).toBe(false);
        expect(plan.reason).toBe('INSUFFICIENT_RESOURCES');
    });

    it('executing the same plan twice consumes resources only once', () => {
        const faction = { id: 'f', lastDecision: 'RAID', escalation: 6, resources: 2 };
        const target = { id: 't' };
        const plan = planRetaliation(faction, target, { tick: 1 });
        const first = executeRetaliation(faction, target, plan);
        expect(first.ok).toBe(true);
        expect(faction.resources).toBe(1);
        const second = executeRetaliation(faction, target, plan);
        expect(second.ok).toBe(false);
        expect(second.reason).toBe('ALREADY_EXECUTED');
        // Resources did not drop again.
        expect(faction.resources).toBe(1);
    });

    it('retaliation spend floors at zero for fractional resources', () => {
        // Pre-audit item 1: executeRetaliation spent resources-1
        // unclamped, so a faction at 0.6 (fractional via
        // restitution/trade paths) landed at -0.4 and broke the
        // ALWAYS resources bound. The long-horizon detector caught it
        // once, then trajectory drift hid it again — this unit test
        // pins the floor directly so the gate cannot decay silently.
        const faction = { id: 'f', lastDecision: 'RAID', escalation: 6, resources: 0.6 };
        const target = { id: 't' };
        const plan = planRetaliation(faction, target, { tick: 1 });
        const result = executeRetaliation(faction, target, plan);
        expect(result.ok).toBe(true);
        expect(faction.resources).toBe(0);
    });

    it('rejects executeRetaliation without a plan', () => {
        const faction = { id: 'f', lastDecision: 'RAID', escalation: 6, resources: 2 };
        const target = { id: 't' };
        const result = executeRetaliation(faction, target);
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('NO_PLAN');
    });
});
