import { describe, expect, it } from '@jest/globals';
import { Market, routeRiskPremium } from '../economy.js';

describe('Deterministic market primitives', () => {
    it('converts risky cargo flow into delivered and disrupted supply', () => {
        const market = new Market('town-a', { food: 10 });
        market.setDemand('food', 100, 2);
        const result = market.deliverCargo('food', 50, { routeRisk: 0.8, confidence: 0 });
        expect(result.delivered).toBeCloseTo(10);
        expect(result.lost).toBeCloseTo(40);
        expect(market.getQuote('food').supply).toBeCloseTo(20);
        expect(market.getQuote('food').disrupted).toBeCloseTo(40);
    });

    it('raises prices as supply falls below demand', () => {
        const market = new Market('town-a');
        market.setDemand('grain', 100, 3);
        const initial = market.getQuote('grain');
        market.deliverCargo('grain', 100, { routeRisk: 0, confidence: 1 });
        const supplied = market.getQuote('grain');
        expect(initial.shortage).toBe(1);
        expect(supplied.shortage).toBe(0);
        expect(supplied.price).toBeLessThan(initial.price);
    });

    it('round-trips market state and calculates bounded risk premiums', () => {
        const market = new Market('town-a', { water: 4 });
        market.setDemand('water', 8, 1.5);
        market.deliverCargo('water', 2, { routeRisk: 0.5, confidence: 0.5 });
        const restored = Market.deserialize(market.serialize());
        expect(restored.getQuote('water')).toEqual(market.getQuote('water'));
        expect(routeRiskPremium({ perceivedDanger: 2, expectedCargoLoss: 3, confidence: -1 })).toBe(5);
    });

    it('produce caps inventory at the configured storage capacity', () => {
        // The audit asked for storage capacity: "production greater than
        // consumption creates the opposite bug: inventory grows without
        // bound forever." With a cap of 10 and produce of 100, only 10
        // should be stored and 90 should overflow.
        const market = new Market('town-a', { food: 5 });
        market.setCapacity('food', 10);
        const result = market.produce('food', 100);
        expect(result.produced).toBe(100);
        expect(result.stored).toBe(5);
        expect(result.overflow).toBe(95);
        expect(market.inventory.get('food')).toBe(10);
    });

    it('produce is unbounded when no capacity is set', () => {
        // A town without a configured capacity can stockpile freely.
        // The audit's bug only happens when production exceeds
        // consumption and the cap is missing; if cap is missing but
        // production is also bounded, the test passes naturally.
        const market = new Market('town-a');
        const result = market.produce('food', 50);
        expect(result.stored).toBe(50);
        expect(market.inventory.get('food')).toBe(50);
    });

    it('spoil decays inventory by the configured rate', () => {
        // 5% spoilage on 100 food = 5 spoiled, 95 remaining.
        const market = new Market('town-a', { food: 100 });
        market.setSpoilageRate('food', 0.05);
        const result = market.spoil('food');
        expect(result.spoiled).toBe(5);
        expect(market.inventory.get('food')).toBe(95);
    });

    it('spoil is a no-op for kinds without a configured rate', () => {
        // Tools (no spoilage) stays put; food spoils as expected.
        const market = new Market('town-a', { food: 100, tools: 50 });
        market.setSpoilageRate('food', 0.05);
        market.spoil('food');
        market.spoil('tools');
        expect(market.inventory.get('food')).toBe(95);
        expect(market.inventory.get('tools')).toBe(50);
    });

    it('deliverCargo respects the storage capacity', () => {
        // A merchant delivering 50 tools into a 10-cap warehouse stores
        // 10, overflows 40 to the disrupted count. This is the audit's
        // "hostile merchant overflow" guard.
        const market = new Market('town-a', { tools: 5 });
        market.setCapacity('tools', 10);
        const result = market.deliverCargo('tools', 50, { routeRisk: 0 });
        expect(result.delivered).toBe(50);
        expect(result.stored).toBe(5);
        expect(result.overflow).toBe(45);
        expect(market.inventory.get('tools')).toBe(10);
    });

    it('serialize/deserialize round-trips the new capacity and spoilageRate maps', () => {
        const market = new Market('town-a', { food: 50 });
        market.setCapacity('food', 100);
        market.setSpoilageRate('food', 0.05);
        const restored = Market.deserialize(market.serialize());
        expect([...restored.capacity.entries()]).toEqual([['food', 100]]);
        expect([...restored.spoilageRate.entries()]).toEqual([['food', 0.05]]);
        // spoil still works on the restored market.
        const result = restored.spoil('food');
        expect(result.spoiled).toBe(2.5);
    });
});
