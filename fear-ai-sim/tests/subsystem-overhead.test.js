/**
 * @file subsystem-overhead.test.js
 *
 * Sections LXXIX + CCXXI: per-subsystem advisory-path costs are measured
 * (never modeled) and stay within regression budgets. Timing medians are
 * machine-dependent — tests assert structure, budget headroom, and the
 * all-measured contract, not exact microseconds.
 */

import { describe, it, expect } from '@jest/globals';
import { SubsystemOverheadHarness, OVERHEAD_BUDGETS_US } from '../packages/core/src/SubsystemOverheadHarness.js';

const EXPECTED_SUBSYSTEMS = [
    'affect.tick', 'memory.episodic', 'memory.relevance', 'memory.rumor',
    'memory.route', 'social.interaction', 'group.evaluate', 'group.contagion',
    'faction.incident', 'world.tick', 'civ.routeRank', 'belief.observe', 'rumor.spread'
];

describe('Sections LXXIX/CCXXI: SubsystemOverheadHarness', () => {
    it('1. Measures every contracted subsystem with a budget', () => {
        const report = new SubsystemOverheadHarness(2, 10).measureAll();
        expect(report.subsystems).toBe(EXPECTED_SUBSYSTEMS.length);
        for (const key of EXPECTED_SUBSYSTEMS) {
            expect(report.rows[key]).toBeDefined();
            expect(report.rows[key].budgetUs).toBe(OVERHEAD_BUDGETS_US[key]);
            expect(report.rows[key].samples).toBe(10);
        }
    });

    it('2. All medians within regression budgets with real headroom', () => {
        const report = new SubsystemOverheadHarness(5, 30).measureAll();
        expect(report.allWithinBudget).toBe(true);
        expect(report.overBudget).toEqual([]);
        for (const [key, row] of Object.entries(report.rows)) {
            expect(Number.isFinite(row.medianUs)).toBe(true);
            expect(row.medianUs).toBeGreaterThanOrEqual(0);
            // Headroom: median must be under HALF the ceiling, else the
            // budget is decoration rather than protection.
            expect(row.medianUs).toBeLessThan(row.budgetUs / 2);
        }
    });

    it('3. Report structure deterministic across runs', () => {
        const a = new SubsystemOverheadHarness(1, 5).measureAll();
        const b = new SubsystemOverheadHarness(1, 5).measureAll();
        expect(Object.keys(a.rows).sort()).toEqual(Object.keys(b.rows).sort());
        expect(a.subsystems).toBe(b.subsystems);
    });

    it('4. Budgets cover the chunk-era stores (no unmeasured newcomer)', () => {
        // Every core memory/advisory store introduced in recent chunks must
        // appear in the measured set: relevance, rumor, route.
        for (const key of ['memory.relevance', 'memory.rumor', 'memory.route']) {
            expect(OVERHEAD_BUDGETS_US[key]).toBeDefined();
        }
    });
});
