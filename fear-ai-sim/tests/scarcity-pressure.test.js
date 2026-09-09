/**
 * @file scarcity-pressure.test.js
 *
 * Section XLIX (missing link): deprivation moves bodies and tempers.
 */

import { ScarcityPressureHarness } from '../packages/core/index.js';
import { EconomicFeedbackSystem } from '../packages/core/index.js';

function starvingEconomy() {
    const econ = new EconomicFeedbackSystem();
    econ.registerSettlementMarket('hungry_hold', {
        population: 60,
        production: { food: 0.5 },
        initialStockpiles: { food: 5 }
    });
    econ.registerSettlementMarket('rich_hold', { population: 40 });
    for (let t = 0; t < 30; t++) econ.tick(1);
    return econ;
}

describe('Section XLIX-link: Scarcity Pressure', () => {
    test('1. Famine scores deprivation with migration push', () => {
        const harness = new ScarcityPressureHarness();
        const rep = harness.score(starvingEconomy(), 'hungry_hold');
        expect(rep.deprivation).toBeGreaterThan(0.3);
        expect(rep.migrationPush).toBeGreaterThan(0.3);
        expect(rep.famineTicks).toBeGreaterThan(0);
        expect(['STRAINED', 'CRITICAL_MIGRATE_OR_AID']).toContain(rep.advisory);
    });

    test('2. Fed settlements stay stable with high morale', () => {
        const harness = new ScarcityPressureHarness();
        const rep = harness.score(starvingEconomy(), 'rich_hold');
        expect(rep.advisory).toBe('STABLE');
        expect(rep.unrestMorale).toBeGreaterThan(0.8);
        expect(rep.migrationPush).toBeLessThan(0.2);
    });

    test('3. scoreAll ranks worst-first across settlements', () => {
        const harness = new ScarcityPressureHarness();
        const ranked = harness.scoreAll(starvingEconomy());
        expect(ranked[0].settlementId).toBe('hungry_hold');
        expect(ranked[ranked.length - 1].settlementId).toBe('rich_hold');
    });

    test('4. Bad readers and unknown settlements fail loudly', () => {
        const harness = new ScarcityPressureHarness();
        expect(() => harness.score(null, 'x')).toThrow(/INVALID_ECONOMY_READER/);
        expect(() => harness.score(starvingEconomy(), 'ghost')).toThrow(/UNKNOWN_SETTLEMENT/);
        expect(() => harness.scoreAll({})).toThrow(/INVALID_ECONOMY_READER/);
    });

    test('5. Audits stay clean', () => {
        const harness = new ScarcityPressureHarness();
        expect(harness.auditImmutability().isClean).toBe(true);
        expect(harness.auditImmutability().hostPhysicsMutations).toBe(0);
    });
});
