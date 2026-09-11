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
import { LayeredMemorySystem } from '../packages/core/src/LayeredMemorySystem.js';
import { MemoryRelevanceScorer } from '../packages/core/src/MemoryRelevanceScorer.js';
import { RumorMemory } from '../packages/core/src/RumorMemory.js';

const EXPECTED_SUBSYSTEMS = [
    'affect.tick', 'memory.episodic', 'memory.relevance', 'memory.rumor',
    'memory.route', 'social.interaction', 'group.evaluate', 'group.contagion',
    'faction.incident', 'world.tick', 'civ.routeRank', 'belief.observe', 'rumor.spread',
    // NEXT-128 wire-era subsystems (CCI-28 frontier 12).
    'identity.blend', 'identity.decide', 'trauma.feed', 'vault.cycle',
    'arbitration.weighted', 'fps.identify'
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
    it('5. Relevance over 1000-entry store stays within budget', () => {
        const sys = new LayeredMemorySystem({ maxEpisodicEntries: 1000 });
        for (let i = 0; i < 1000; i++) {
            sys.recordEpisodic({ type: 'RESOURCE_DISCOVERED', salience: 0.1 + (i % 10) / 20, participants: [`npc-${i % 50}`], tick: i });
        }
        sys.tickCount = 1000;
        const scorer = new MemoryRelevanceScorer();
        const ctx = { nowTick: 1000, entityIds: ['npc-3'], position: { x: 10, y: 0, z: 0 }, goalTags: ['ambush'] };
        const t0 = performance.now();
        for (let k = 0; k < 10; k++) scorer.rank(sys, ctx, 5);
        const meanMs = (performance.now() - t0) / 10;
        // Generous: 1000-entry rank must complete in under 50 ms (measured ~1 ms).
        expect(meanMs).toBeLessThan(50);
    });

    it('6. Rumor flood respects bound in linear time', () => {
        const rm = new RumorMemory({ maxEntries: 50 });
        const t0 = performance.now();
        for (let i = 0; i < 5000; i++) {
            rm.hear({ id: `q${i}`, topic: 'T', claim: 'c', confidence: 0.9 }, 0.9, i);
        }
        const ms = performance.now() - t0;
        expect(rm.size).toBeLessThanOrEqual(50);
        // Generous: 5000 flood inserts in under 5 s (measured single-digit ms).
        expect(ms).toBeLessThan(5000);
    });
    it('7. Wire-era attachments cost a small multiple of the detached tick', () => {
        // CCXXI interaction-budget form: the price of wiring identity and
        // trauma into the live path must stay a bounded multiple of the
        // plain affect tick, on this machine in this run.
        const report = new SubsystemOverheadHarness(2, 10).measureAll();
        const base = report.rows['affect.tick'].medianUs;
        expect(base).toBeGreaterThan(0);
        for (const key of ['identity.blend', 'trauma.feed']) {
            const med = report.rows[key].medianUs;
            expect(med).toBeLessThan(base * 10);
        }
    });
});
