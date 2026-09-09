/**
 * @file scale-harness.test.js
 *
 * Sections LXXVIII-LXXIX: honest scaling numbers only.
 */

import { ScaleHarness } from '../packages/core/index.js';

describe('Sections LXXVIII-LXXIX: Scale Harness', () => {
    test('1. Per-agent costs measured, never modeled', () => {
        const h = new ScaleHarness();
        const rows = h.measure([1, 10, 100], { warmupTicks: 1, measuredTicks: 2 });
        expect(rows.length).toBe(3);
        for (const r of rows) {
            expect(r.perAgentMicros).toBeGreaterThan(0);
            expect(Number.isFinite(r.perAgentMicros)).toBe(true);
        }
    });

    test('2. Budget fit refuses to certify beyond measured N', () => {
        const h = new ScaleHarness();
        h.measure([1, 10, 100], { warmupTicks: 1, measuredTicks: 2 });
        const fit = h.fitBudget(16.6);
        expect(fit.measuredOnlyUpTo).toBe(100);
        expect(fit.perAgentMs).toBeGreaterThanOrEqual(0);
        if (fit.maxFullAgents.value > 100) {
            expect(fit.maxFullAgents.claim).toBe('EXTRAPOLATED');
        } else {
            expect(fit.maxFullAgents.claim).toBe('MEASURED');
        }
        expect(() => h.fitBudget(-1)).toThrow(/BUDGET_MUST_BE_POSITIVE/);
    });

    test('3. Measurements deterministic in shape across runs', () => {
        const h = new ScaleHarness();
        const a = h.measure([10], { warmupTicks: 1, measuredTicks: 2 });
        const b = h.measure([10], { warmupTicks: 1, measuredTicks: 2 });
        expect(a[0].agents).toBe(b[0].agents);
        expect(a[0].ticks).toBe(b[0].ticks);
        expect(() => h.measure([0])).toThrow(/STEPS_MUST_BE_POSITIVE_INTEGERS/);
        expect(() => new ScaleHarness().fitBudget(16)).toThrow(/MEASURE_FIRST/);
    });

    test('4. Missing deadlines surface as data, not crashes', () => {
        const h = new ScaleHarness();
        const rows = h.measure([10, 50], { warmupTicks: 1, measuredTicks: 2 });
        const fit = h.fitBudget(0.0001);
        expect(fit.recommendation).toBe('DEMOTE_TO_LOD1_AND_ABOVE_UNDER_PRESSURE');
        expect(rows[0].totalMs).toBeGreaterThanOrEqual(0);
        expect(h.auditImmutability().rowsMeasured).toBe(2);
        expect(h.auditImmutability().isClean).toBe(true);
        expect(h.auditImmutability().hostPhysicsMutations).toBe(0);
    });
});
