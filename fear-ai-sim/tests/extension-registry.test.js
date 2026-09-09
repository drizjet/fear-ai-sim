/**
 * @file extension-registry.test.js
 *
 * Front D / Sections 201–203: Third-Party Extension Architecture.
 */

import { ExtensionRegistry } from '../packages/core/index.js';

describe('Front D / Sections 201–203: Extension Registry', () => {
    test('1. Deterministic extensions contribute clamped advisory modifiers', () => {
        const r = new ExtensionRegistry();
        r.registerExtension({ name: 'omen', version: '1.0.0', deterministic: true, onObserve: () => 0.2 });
        const out = r.evaluateAll({ fear: 0.7 }, {});
        expect(out.modifiers.omen).toBeCloseTo(0.2, 4);
        expect(out.totalModifier).toBeCloseTo(0.2, 4);
        expect(out.perExtension[0].status).toBe('OK');
    });

    test('2. Out-of-range modifiers clamp to contract bounds', () => {
        const r = new ExtensionRegistry();
        r.registerExtension({ name: 'wild', deterministic: true, onObserve: () => 99 });
        r.registerExtension({ name: 'void', deterministic: true, onObserve: () => 'garbage' });
        const out = r.evaluateAll({}, {});
        expect(out.modifiers.wild).toBe(0.5);
        expect(out.modifiers.void).toBe(0);
    });

    test('3. Throwing extensions fail isolated without crashing the tick', () => {
        const r = new ExtensionRegistry();
        r.registerExtension({ name: 'good', deterministic: true, onObserve: () => 0.1 });
        r.registerExtension({ name: 'bad', deterministic: false, onObserve: () => { throw new Error('BOOM'); } });
        const out = r.evaluateAll({}, {});
        expect(out.modifiers.bad).toBe(0);
        expect(out.modifiers.good).toBeCloseTo(0.1, 4);
        expect(out.perExtension.find((e) => e.name === 'bad').status).toBe('FAILED');
        expect(r.getHealth().find((h) => h.name === 'bad').failures).toBe(1);
    });

    test('4. Extensions cannot mutate snapshots or bypass host authority', () => {
        const r = new ExtensionRegistry();
        let leaked = null;
        r.registerExtension({
            name: 'sneaky', deterministic: true, onObserve: (snap) => { leaked = snap; try { snap.fear = 999; } catch { /* frozen */ } return 0; }
        });
        r.evaluateAll({ fear: 0.4 }, {});
        expect(leaked.fear).toBe(0.4);
        const audit = r.auditImmutability();
        expect(audit.isClean).toBe(true);
        expect(audit.hostPhysicsMutations).toBe(0);
    });

    test('5. Determinism verification separates pure from impure plugins', () => {
        const r = new ExtensionRegistry();
        let n = 0;
        r.registerExtension({ name: 'pure', deterministic: true, onObserve: (s) => s.fear * 0.1 });
        r.registerExtension({ name: 'impure', deterministic: true, onObserve: () => ++n });
        const res = r.verifyDeterminism({ fear: 0.5 }, {});
        expect(res.find((x) => x.name === 'pure').deterministic).toBe(true);
        expect(res.find((x) => x.name === 'impure').deterministic).toBe(false);
        expect(() => r.registerExtension({ name: 'pure', onObserve: () => 0 })).toThrow();
    });
});
