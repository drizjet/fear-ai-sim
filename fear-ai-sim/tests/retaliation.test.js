/**
 * @file retaliation.test.js
 *
 * Sections XLII-XLIV: proportion, memory, exhaustion, ceasefire dynamics.
 */

import { RetaliationModel } from '../packages/core/index.js';

describe('Sections XLII-XLIV: Retaliation', () => {
    test('1. Insults warn, massacres strike back', () => {
        const m = new RetaliationModel();
        expect(m.provoke('a', 'b', 'INSULT').intent).toBe('WARN');
        const m2 = new RetaliationModel();
        expect(m2.provoke('a', 'b', 'MASSACRE').intent).toBe('STRIKE_BACK');
    });

    test('2. Repeated blows compound with diminishing returns, never exceed scale', () => {
        const m = new RetaliationModel();
        let last = null;
        for (let i = 0; i < 10; i++) last = m.provoke('a', 'b', 'RAID');
        expect(last.level).toBeLessThanOrEqual(1);
        expect(last.level).toBeGreaterThan(0.5);
        expect(() => m.provoke('a', 'b', 'EYEBROW_RAISE')).toThrow(/UNKNOWN_PROVOCATION/);
    });

    test('3. Settling answers part of the account', () => {
        const m = new RetaliationModel();
        m.provoke('a', 'b', 'RAID');
        const before = m.recommend('a', 'b').level;
        m.settle('a', 'b', 0.5);
        expect(m.recommend('a', 'b').level).toBeLessThan(before);
        expect(m.settle('x', 'y')).toBe(0);
    });

    test('4. Exhaustion brakes war into ceasefire preference', () => {
        const m = new RetaliationModel();
        m.provoke('a', 'b', 'MASSACRE');
        m.provoke('a', 'b', 'RAID');
        expect(m.recommend('a', 'b').intent).toBe('STRIKE_BACK');
        m.advanceTick(60, true);
        const rec = m.recommend('a', 'b');
        expect(rec.exhaustion).toBeGreaterThan(0.5);
        expect(rec.intent).toBe('CEASEFIRE');
        // Peace recovers slowly.
        m.advanceTick(200, false);
        expect(m.recommend('a', 'b').exhaustion).toBeLessThan(rec.exhaustion);
    });

    test('5. Old grievances fade without refresh', () => {
        const m = new RetaliationModel({ memoryHalfLifeTicks: 100 });
        m.provoke('a', 'b', 'PROVOCATION');
        const hot = m.recommend('a', 'b').level;
        m.advanceTick(1000, false);
        expect(m.recommend('a', 'b').level).toBeLessThan(hot * 0.1);
        expect(m.auditImmutability().isClean).toBe(true);
        expect(m.auditImmutability().hostPhysicsMutations).toBe(0);
    });
});
