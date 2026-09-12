import { describe, it, expect } from '@jest/globals';
import {
    BlockadeEngine,
    EconomicFeedbackSystem,
    ScarcityPressureHarness,
    COMMODITY_TYPES,
} from '../packages/core/index.js';

// NEXT-168 (post-25 candidate 8): automatic corridor-to-market coupling.
// EconomicFeedbackSystem.deliverShipments applies a blockade throttle
// table to scheduled shipments, replacing the host-enforced manual
// scaling from NEXT-159. Corridors absent from the table deliver in
// full; malformed fractions degrade to full delivery, never to zero.
const FOOD = COMMODITY_TYPES.FOOD;
const SHIP = { sourceId: 'P', destId: 'C', commodity: FOOD, amount: 3.0, corridorId: 'corridor_1' };

function markets() {
    const econ = new EconomicFeedbackSystem();
    econ.registerSettlementMarket('P', { population: 10, production: { food: 50 } });
    econ.registerSettlementMarket('C', { population: 50, production: { food: 0 } });
    return econ;
}

describe('NEXT-168: automatic corridor-to-market coupling', () => {
    it('1. Empty table delivers in full', () => {
        const econ = markets();
        const { deliveries } = econ.deliverShipments([SHIP], {});
        expect(deliveries).toEqual([{ corridorId: 'corridor_1', ordered: 3, allowed: 1, delivered: true }]);
        expect(econ.getMarketSummary('C').foodStockpile).toBeGreaterThan(100);
    });
    it('2. Throttle fractions scale deliveries exactly', () => {
        for (const allowed of [0.5, 0.05, 0]) {
            const econ = markets();
            const before = econ.getMarketSummary('C').foodStockpile;
            const { deliveries } = econ.deliverShipments([SHIP], { corridor_1: allowed });
            const after = econ.getMarketSummary('C').foodStockpile;
            expect(deliveries[0].allowed).toBe(allowed);
            // Summary rounds stockpiles to 1 decimal; tolerate the display step.
            expect(Math.abs((after - before) - 3.0 * allowed)).toBeLessThan(0.06);
        }
    });

    it('3. Malformed tables and shipments degrade safely', () => {
        const econ = markets();
        expect(econ.deliverShipments([SHIP], { corridor_1: 'closed' }).deliveries[0].allowed).toBe(1);
        expect(econ.deliverShipments([SHIP], { corridor_1: 99 }).deliveries[0].allowed).toBe(1);
        expect(econ.deliverShipments([SHIP], { corridor_1: -2 }).deliveries[0].allowed).toBe(0);
        expect(econ.deliverShipments([], { corridor_1: 0 }).deliveries).toEqual([]);
        expect(econ.deliverShipments('nope', null).deliveries).toEqual([]);
    });

    it('4. Live blockade starves the city through the bridge alone', () => {
        const run = (blockaded) => {
            const eng = new BlockadeEngine();
            const econ = markets();
            const sc = new ScarcityPressureHarness();
            const id = blockaded ? eng.declare('X', 'C', ['corridor_1'], { commitment: 1.0 }) : null;
            for (let t = 0; t < 60; t++) {
                econ.deliverShipments([SHIP], eng.throttleTable());
                econ.tick(1);
                eng.advanceTick(1);
                if (blockaded) eng.recommit(id, 1.0);
            }
            return sc.score(econ, 'C');
        };
        const open = run(false);
        expect(open.advisory).toBe('STABLE');
        const shut = run(true);
        expect(shut.advisory).toBe('CRITICAL_MIGRATE_OR_AID');
        expect(shut.unrestMorale).toBeLessThan(0.2);
    });

    it('5. Bridge runs replay exactly', () => {
        const run = () => {
            const econ = markets();
            return econ.deliverShipments([SHIP, { ...SHIP, amount: 1.5 }], { corridor_1: 0.5 }).deliveries;
        };
        expect(run()).toEqual(run());
    });
});
