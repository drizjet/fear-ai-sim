import { describe, expect, it } from '@jest/globals';
import { InteractionEngine } from '../interactions.js';

describe('validated character interactions', () => {
    it('rejects impossible actions without mutation', () => {
        const engine = new InteractionEngine();
        const actor = { id: 'a', factionId: 'f', canFight: false, resources: 0 };
        const target = { id: 'b', factionId: 'g', resources: 3 };
        expect(engine.execute('Kill', actor, target, {}, 1).ok).toBe(false);
        expect(target.dead).toBeUndefined();
    });

    it('executes validated consequences and prevents cooldown replay', () => {
        const engine = new InteractionEngine();
        const actor = { id: 'a', factionId: 'f', canFight: true, resources: 1 };
        const target = { id: 'b', factionId: 'g', resources: 3 };
        expect(engine.execute('Rob', actor, target, {}, 1).ok).toBe(true);
        expect(target.resources).toBe(2);
        expect(engine.execute('Rob', actor, target, {}, 1).errors).toContain('COOLDOWN');
    });

    it('Report action pushes to world.reports (Constitution §87 witness chain)', () => {
        // The audit: the closed-world's REPORT_FILED event
        // relies on the Report action pushing to world.reports.
        // The Report action requires either witnesses.has(actor.id)
        // or actor.canReport. A guard who witnesses a bandit
        // attack should be able to file a report.
        const engine = new InteractionEngine();
        const guard = { id: 'guard-1', factionId: 'town', canReport: true };
        const bandit = { id: 'bandit-1', factionId: 'raiders' };
        const world = {};
        const result = engine.execute('Report', guard, bandit, world, 5);
        expect(result.ok).toBe(true);
        expect(world.reports).toBeDefined();
        expect(world.reports.length).toBe(1);
        expect(world.reports[0].actorId).toBe('guard-1');
        expect(world.reports[0].targetId).toBe('bandit-1');
        expect(world.reports[0].tick).toBe(5);
    });

    it('Report action rejects when actor has no witness capability', () => {
        const engine = new InteractionEngine();
        const actor = { id: 'a', factionId: 'f' }; // No canReport, no witness
        const target = { id: 'b', factionId: 'g' };
        const result = engine.execute('Report', actor, target, {}, 1);
        expect(result.ok).toBe(false);
        expect(result.errors).toContain('NO_WITNESS');
    });

    it('cooldown blocks same action across different targets', () => {
        // The audit's §326 idempotency concern: a faction
        // should not be able to spam the same action every
        // tick even with different targets. The cooldown is
        // per-actor, not per-(actor, target).
        const engine = new InteractionEngine({ cooldown: 3 });
        const actor = { id: 'a', factionId: 'f', canFight: true, resources: 5 };
        const target1 = { id: 'b', factionId: 'g', resources: 3 };
        const target2 = { id: 'c', factionId: 'h', resources: 3 };
        // First attack on target1 at tick 1: OK.
        expect(engine.execute('Rob', actor, target1, {}, 1).ok).toBe(true);
        // Second attack on target2 at tick 2: cooldown not elapsed.
        const result = engine.execute('Rob', actor, target2, {}, 2);
        expect(result.ok).toBe(false);
        expect(result.errors).toContain('COOLDOWN');
        // Third attack on target2 at tick 4: cooldown elapsed.
        expect(engine.execute('Rob', actor, target2, {}, 4).ok).toBe(true);
    });
});
