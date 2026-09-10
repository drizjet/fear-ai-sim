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

    test('NOW-31. Non-finite basis counts the whole ledger instead of staling it', () => {
        const eng = new TradeDependencyEngine();
        // Omitted basis (the Infinity default).
        const def = eng.dependencyOf(LEDGER, 'mill_town', 'granary');
        expect(def.ratio).toBeCloseTo(100 / 120, 4);
        expect(def.critical).toBe(true);
        // Explicit Infinity matches the default.
        expect(eng.dependencyOf(LEDGER, 'mill_town', 'granary', Infinity).ratio)
            .toBeCloseTo(100 / 120, 4);
        // NaN basis is a caller bug; unbounded beats silent zero.
        expect(eng.dependencyOf(LEDGER, 'mill_town', 'granary', NaN).ratio)
            .toBeCloseTo(100 / 120, 4);
        // Advise inherits the semantics (restraint flows without a tick).
        const adv = eng.advise(LEDGER, 'mill_town', 'granary', 1.0);
        expect(adv.restraint).toBeCloseTo((100 / 120) * 0.7, 4);
    });
    test('5. Audits stay clean', () => {
        const eng = new TradeDependencyEngine();
        expect(eng.auditImmutability().isClean).toBe(true);
        expect(eng.auditImmutability().hostPhysicsMutations).toBe(0);
    });
});

describe('NEXT-37: clock-bridging contract', () => {
    test('6. Foreign basis wins when numeric, reader clock otherwise', async () => {
        const { resolveLedgerNowTick } = await import('../packages/core/index.js');
        expect(resolveLedgerNowTick(500, 800)).toBe(500);
        expect(resolveLedgerNowTick(0, 800)).toBe(0);
        expect(resolveLedgerNowTick(undefined, 800)).toBe(800);
        expect(resolveLedgerNowTick(null, 800)).toBe(800);
        expect(resolveLedgerNowTick('500', 800)).toBe(800);
        // Explicit non-finite basis keeps whole-ledger meaning downstream.
        expect(resolveLedgerNowTick(Infinity, 800)).toBe(Infinity);
    });

    test('7. Coalition bridge honors the shared helper end to end', async () => {
        const { CoalitionDiplomacyEngine } = await import('../packages/core/index.js');
        const rows = [];
        for (let i = 0; i < 9; i++) {
            rows.push({ sourceId: 'faction_A', destId: 'faction_B', commodity: 'food', amount: 10, tick: 500 + i });
        }
        const old = new CoalitionDiplomacyEngine({ seed: 1 });
        old.tick(800);
        // Unbridged: rows (500-508) are stale against the old clock.
        expect(old._restraintFromLedger('faction_B', 'faction_A', { tradeLedger: rows })).toBe(0);
        // Bridged through the shared contract: full restraint restored.
        expect(old._restraintFromLedger('faction_B', 'faction_A', { tradeLedger: rows, currentTick: 500 }))
            .toBeCloseTo(0.7, 10);
    });
});
