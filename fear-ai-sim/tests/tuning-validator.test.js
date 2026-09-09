/**
 * @file tuning-validator.test.js
 *
 * Front B / Sections 227–230: Boundaries, Config Validation & Zero-Config.
 */

import { TuningValidator } from '../packages/core/index.js';

describe('Front B / Sections 227–230: Tuning Validator', () => {
    test('1. Valid tuning passes with zero errors', () => {
        const r = TuningValidator.validate({ neuroticism: 0.7, resilience: 0.4, bravery: 0.5 });
        expect(r.valid).toBe(true);
        expect(r.errors).toEqual([]);
        expect(TuningValidator.assertValid({ neuroticism: 0 })).toBe(true);
        expect(TuningValidator.assertValid({ neuroticism: 1 })).toBe(true);
    });

    test('2. Out-of-range and non-finite values fail with actionable errors', () => {
        const r = TuningValidator.validate({ neuroticism: 1.5, resilience: NaN, bravery: 'high' });
        expect(r.valid).toBe(false);
        expect(r.errors.length).toBeGreaterThanOrEqual(3);
        expect(() => TuningValidator.assertValid({ neuroticism: -0.2 })).toThrow(/neuroticism/);
    });

    test('3. Pathological combos flagged before simulation', () => {
        const lock = TuningValidator.validate({ neuroticism: 0.95, resilience: 0.02 });
        expect(lock.valid).toBe(false);
        expect(lock.errors.join(' ')).toContain('INSTANT_PANIC_LOCK');
        const immune = TuningValidator.validate({ neuroticism: 0.02, resilience: 0.5, bravery: 0.97 });
        expect(immune.valid).toBe(false);
        expect(immune.errors.join(' ')).toContain('PERMANENT_IMMUNITY');
    });

    test('4. Sanitize clamps extremes and fills defaults', () => {
        const s = TuningValidator.sanitize({ neuroticism: 2.5, resilience: NaN });
        expect(s.neuroticism).toBe(1);
        expect(s.resilience).toBe(0.5);
        expect(s.bravery).toBe(0.5);
        expect(s.habituationRate).toBe(0.02);
    });

    test('5. Zero-config quickstart yields one working NPC', () => {
        const q = TuningValidator.quickstart();
        expect(q.agentId).toBe('npc_first_steps');
        expect(TuningValidator.validate(q.traits).valid).toBe(true);
        expect(q.goal).toBe('CAUTIOUS_EXPLORE');
        const d = TuningValidator.defaults();
        expect(Object.keys(d).length).toBeGreaterThanOrEqual(6);
    });
});
