import { describe, it, expect } from '@jest/globals';
import {
    BlockadeEngine,
    EconomicFeedbackSystem,
    ScarcityPressureHarness,
    COMMODITY_TYPES,
} from '../packages/core/index.js';

// NEXT-159 (audit candidate 24): economic-warfare-by-morale joint test.
// A blockade throttle enforced by the host (delivered = ordered x allowed
// fraction) starves a food-deficit settlement through the live economy
// into ScarcityPressureHarness morale erosion — denial as an alternative
// to combat, with upkeep pricing the attacker's side. No new machinery:
// the channel is recordTradeTransaction scaled by throttleTable.
const FOOD = COMMODITY_TYPES.FOOD;
const TICKS = 60;

function siege({ blockaded, ticks = TICKS, shipment = 3.0 }) {
    const eng = new BlockadeEngine();
    const econ = new EconomicFeedbackSystem();
    const sc = new ScarcityPressureHarness();
    econ.registerSettlementMarket('producer', { population: 10, production: { food: 50 } });
    econ.registerSettlementMarket('city', { population: 50, production: { food: 0 } });
    const id = blockaded ? eng.declare('attacker', 'city', ['corridor_1'], { commitment: 1.0 }) : null;
    for (let t = 0; t < ticks; t++) {
        const allowed = blockaded ? (eng.throttleTable()['corridor_1'] ?? 1) : 1;
        econ.recordTradeTransaction('producer', 'city', FOOD, shipment * allowed);
        econ.tick(1);
        eng.advanceTick(1);
        if (blockaded) eng.recommit(id, 1.0);
    }
    return { eng, econ, sc, id, pressure: sc.score(econ, 'city') };
}

describe('NEXT-159: economic warfare by morale', () => {
    it('1. Open corridors keep the city stable', () => {
        const { pressure } = siege({ blockaded: false });
        expect(pressure.advisory).toBe('STABLE');
        expect(pressure.unrestMorale).toBe(1);
        expect(pressure.deprivation).toBe(0);
    });

    it('2. A held blockade starves the city into critical morale strain', () => {
        const { pressure, eng, id } = siege({ blockaded: true });
        expect(pressure.advisory).toBe('CRITICAL_MIGRATE_OR_AID');
        expect(pressure.deprivation).toBeGreaterThanOrEqual(0.7);
        expect(pressure.unrestMorale).toBeLessThan(0.2);
        expect(eng.assess(id).advisory).toBe('STRANGLEHOLD');
    });

    it('3. Denial is priced: longer sieges cost the blockader more', () => {
        const early = siege({ blockaded: true, ticks: 10 });
        const late = siege({ blockaded: true, ticks: 60 });
        const costEarly = early.eng.assess(early.id).blockaderCost;
        const costLate = late.eng.assess(late.id).blockaderCost;
        expect(costEarly).toBeGreaterThan(0);
        expect(costLate).toBeGreaterThan(costEarly);
    });

    it('4. Lifting the blockade lets morale climb back', () => {
        const { eng, econ, sc, id, pressure } = siege({ blockaded: true });
        expect(pressure.unrestMorale).toBeLessThan(0.2);
        eng.lift(id);
        for (let t = 0; t < 120; t++) {
            econ.recordTradeTransaction('producer', 'city', FOOD, 3.0);
            econ.tick(1);
        }
        const after = sc.score(econ, 'city');
        expect(after.unrestMorale).toBeGreaterThan(pressure.unrestMorale);
        expect(['STABLE', 'WATCH']).toContain(after.advisory);
    });

    it('5. The joint stays advisory-only', () => {
        const { eng, econ, sc } = siege({ blockaded: true });
        expect(eng.auditImmutability().status).toBe('CLEAN_ADVISORY_ONLY');
        expect(sc.auditImmutability().status).toBe('CLEAN_ADVISORY_ONLY');
        expect(econ.tradeHistory.length).toBe(TICKS);
    });

    it('6. Siege outcomes replay exactly', () => {
        const run = () => {
            const { pressure, eng, id } = siege({ blockaded: true });
            return { ...pressure, cost: eng.assess(id).blockaderCost };
        };
        expect(run()).toEqual(run());
    });
});
