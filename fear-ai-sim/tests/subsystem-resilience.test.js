/**
 * @file subsystem-resilience.test.js
 *
 * Front E / Sections 138–139, 197, 199:
 * Modular Subsystem Isolation & Graceful Degradation Harness.
 */

import { SubsystemResilienceHarness, MODULE_STATUS } from '../packages/core/index.js';

function buildHarness(coreFear = 0.72) {
    const h = new SubsystemResilienceHarness({ coreEvaluate: () => coreFear, coreVersion: '3.0.0' });
    h.registerModule('memory', () => 0.05, { version: '3.0.0', fallback: 0 });
    h.registerModule('relationships', () => -0.02, { version: '3.0.0', fallback: 0 });
    h.registerModule('economy', () => 0.08, { version: '3.0.0', fallback: 0 });
    h.registerModule('world', () => 0.03, { version: '3.0.0', fallback: 0 });
    return h;
}

describe('Front E / Sections 138–139, 197, 199: Subsystem Resilience Harness', () => {
    test('1. Healthy tick resolves all modules OK with advisory intent', () => {
        const h = buildHarness(0.72);
        const r = h.tick({ tick: 0 });
        expect(r.coreAlive).toBe(true);
        expect(r.degraded).toBe(false);
        expect(r.failedModules).toEqual([]);
        expect(r.perModule.every((m) => m.status === MODULE_STATUS.OK)).toBe(true);
        expect(r.advisoryIntent.type).toBe('FLEE_FROM');
        expect(r.advisoryIntent.adjustedFear).toBeCloseTo(0.86, 4);
    });

    test('2. Memory failure is isolated; core and peers continue', () => {
        const h = buildHarness(0.5);
        h.injectFailure('memory', new Error('MEMORY_STORE_CORRUPT'));
        const r = h.tick({ tick: 1 });
        expect(r.coreAlive).toBe(true);
        expect(r.failedModules).toEqual(['memory']);
        const mem = r.perModule.find((m) => m.name === 'memory');
        expect(mem.status).toBe(MODULE_STATUS.FAILED);
        expect(mem.fallbackUsed).toBe(true);
        expect(r.contributions.memory).toBe(0);
        expect(r.advisoryIntent).toBeDefined();
        expect(r.advisoryIntent.type).toBe('CAUTIOUS_EXPLORE');
    });

    test('3. Economy and world failures never crash core affect', () => {
        const h = buildHarness(0.3);
        h.injectFailure('economy', new Error('PRICE_ORACLE_DOWN'));
        h.injectFailure('world', new Error('HISTORY_LEDGER_CORRUPT'));
        const r = h.tick({ tick: 2 });
        expect(r.coreAlive).toBe(true);
        expect(r.failedModules.sort()).toEqual(['economy', 'world']);
        expect(r.advisoryIntent.type).toBe('IDLE_VIGILANT');
        const audit = h.auditImmutability();
        expect(audit.totalFailures).toBe(2);
    });

    test('4. Feature flags disable modules cleanly without failure counts', () => {
        const h = buildHarness(0.4);
        h.setEnabled('world', false);
        const r = h.tick({ tick: 3 });
        expect(r.coreAlive).toBe(true);
        expect(r.skippedModules).toEqual(['world']);
        expect(r.failedModules).toEqual([]);
        const w = r.perModule.find((m) => m.name === 'world');
        expect(w.status).toBe(MODULE_STATUS.SKIPPED);
        expect(h.auditImmutability().totalFailures).toBe(0);
        expect(() => h.setEnabled('core', false)).toThrow();
    });

    test('5. Core failure surfaces distinctly and yields no masked intent', () => {
        const h = new SubsystemResilienceHarness({
            coreEvaluate: () => { throw new Error('CORE_AFFECT_FAULT'); },
            coreVersion: '3.0.0'
        });
        h.registerModule('memory', () => 0.05, { fallback: 0 });
        const r = h.tick({ tick: 0 });
        expect(r.coreAlive).toBe(false);
        expect(r.coreError).toContain('CORE_AFFECT_FAULT');
        expect(r.advisoryIntent).toBeNull();
        expect(r.perModule.find((m) => m.name === 'core').status).toBe(MODULE_STATUS.CORE_FAILURE);
    });

    test('6. Identical failures produce bit-identical deterministic reports', () => {
        const run = () => {
            const h = buildHarness(0.6);
            h.injectFailure('economy', new Error('X'));
            return h.tick({ tick: 7 });
        };
        const a = run();
        const b = run();
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        const order = a.perModule.map((m) => m.name);
        expect(order).toEqual(['core', 'memory', 'relationships', 'economy', 'world']);
    });

    test('7. Version negotiation and authority invariant hold', () => {
        const h = buildHarness();
        const n = h.negotiate({ memory: '9.9.9', economy: '3.0.0' });
        expect(n.compatible.map((m) => m.name)).toContain('economy');
        expect(n.incompatible.map((m) => m.name)).toContain('memory');
        const audit = h.auditImmutability();
        expect(audit.isClean).toBe(true);
        expect(audit.status).toBe('CLEAN_ADVISORY_ONLY');
        expect(audit.hostPhysicsMutations).toBe(0);
        expect(audit.hostTransformMutations).toBe(0);
        expect(audit.modulesRegistered).toBe(5);
    });
});
