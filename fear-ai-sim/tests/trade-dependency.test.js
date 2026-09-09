/**
 * @file trade-dependency.test.js
 *
 * Section LII: dependence restrains conflict.
 */

import { TradeDependencyEngine } from '../packages/core/index.js';

const LEDGER = [
    { sourceId: 'granary', destId: 'mill_town', commodity: 'food', amount: 70, tick: 10 },
    { sourceId: 'granary', destId: 'mill_town', commodity: 'food', amount: 30, tick: 20 },
    { sourceId: 'forest', destId: 'mill_town', commodity: 'timber', amount: 20, tick: 15 },
    { sourceId: 'granary', destId: 'far_hold', commodity: 'food', amount: 10, tick: 12 }
];

describe('Section LII: Trade Dependency', () => {
    test('1. Dependency ratios follow the ledger', () => {
        const eng = new TradeDependencyEngine();
        const dep = eng.dependencyOf(LEDGER, 'mill_town', 'granary', 100);
        expect(dep.ratio).toBeCloseTo(100 / 120, 3);
        expect(dep.critical).toBe(true);
        const thin = eng.dependencyOf(LEDGER, 'mill_town', 'forest', 100);
        expect(thin.critical).toBe(false);
        expect(() => eng.dependencyOf('nope', 'a', 'b')).toThrow(/LEDGER_MUST_BE_ARRAY/);
    });

    test('2. Dependence dampens retaliation levels', () => {
        const eng = new TradeDependencyEngine();
        expect(eng.dampen(0.8, 0)).toBeCloseTo(0.8, 4);
        expect(eng.dampen(0.8, 1)).toBeCloseTo(0.24, 4);
        expect(eng.dampen(0.8, 0.5)).toBeLessThan(0.8);
    });

    test('3. Advisories escalate with dependence bands', () => {
        const eng = new TradeDependencyEngine();
        expect(eng.advise(LEDGER, 'mill_town', 'granary', 0.8, 100).advisory).toBe('AVOID_CONFLICT');
        expect(eng.advise(LEDGER, 'mill_town', 'forest', 0.8, 100).advisory).not.toBe('AVOID_CONFLICT');
        expect(eng.advise([], 'ghost', 'granary', 0.8).advisory).toBe('NO_RESTRAINT');
    });

    test('4. Stale ledger rows fall outside the window', () => {
        const eng = new TradeDependencyEngine({ windowTicks: 200 });
        const dep = eng.dependencyOf(LEDGER, 'mill_town', 'granary', 1000);
        expect(dep.totalImports).toBe(0);
        expect(dep.ratio).toBe(0);
    });

    test('5. Audits stay clean', () => {
        const eng = new TradeDependencyEngine();
        expect(eng.auditImmutability().isClean).toBe(true);
        expect(eng.auditImmutability().hostPhysicsMutations).toBe(0);
    });
});
