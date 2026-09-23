import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-CONSERVATION-001', () => {
    it('records queue-aware consumption in the market conservation ledger', () => {
        const society = new SocietyCore();
        society.addSettlement('town', { population: 20 });
        society.addMarket('south', new Market({ prices: { grain: 2 }, stock: { grain: 30 } }));
        society.applyQueueAwareSettlementEconomy({ settlement: 'town', market: 'south', foodNeed: 7 });
        const market = society.markets.get('south');
        const balance = market.balanceSheet();
        expect(balance.goods.grain.consumption).toBe(7);
        expect(balance.goods.grain.actual).toBe(23);
        expect(balance.goods.grain.expected).toBe(23);
        expect(balance.balanced).toBe(true);
    });

    it('keeps repeated shortage consumption nonnegative and exactly reconciled', () => {
        const society = new SocietyCore({ seed: 2201 });
        society.addSettlement('town', { population: 10, resources: 5 });
        society.addMarket('south', new Market({ prices: { grain: 1 }, stock: { grain: 11 } }));
        for (let i = 0; i < 100; i++) society.applyQueueAwareSettlementEconomy({ settlement: 'town', market: 'south', foodNeed: 3 });
        const market = society.markets.get('south');
        expect(market.stock.grain).toBeGreaterThanOrEqual(0);
        expect(market.balanceSheet().balanced).toBe(true);
        expect(market.balanceSheet().goods.grain.actual).toBe(market.stock.grain);
    });

    it('preserves conservation and economic history through JSON persistence', () => {
        const society = new SocietyCore();
        society.addSettlement('town', { population: 10 });
        society.addMarket('south', new Market({ prices: { grain: 1 }, stock: { grain: 20 } }));
        society.applyQueueAwareSettlementEconomy({ settlement: 'town', market: 'south', foodNeed: 6 });
        const snapshot = society.serialize();
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot)));
        expect(restored.markets.get('south').balanceSheet()).toEqual(society.markets.get('south').balanceSheet());
        expect(restored.serialize()).toEqual(snapshot);
    });

    it('mutation control detects an unrecorded queue-aware withdrawal', () => {
        const society = new SocietyCore();
        society.addSettlement('town', { population: 10 });
        society.addMarket('south', new Market({ prices: { grain: 1 }, stock: { grain: 20 } }));
        const market = society.markets.get('south');
        society.applyQueueAwareSettlementEconomy({ settlement: 'town', market: 'south', foodNeed: 6 });
        market.stock.grain -= 1;
        expect(market.balanceSheet().balanced).toBe(false);
    });
});
