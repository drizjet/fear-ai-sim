import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore } from '../societycore.js';

describe('RESP-MARKET-CONSERVATION-001: exact stock-and-flow accounting', () => {
    it('records unmet demand truthfully instead of silently discarding it', () => {
        const market = new Market({ prices: { grain: 1 }, stock: { grain: 10 } });
        market.update({ demand: { grain: 20 }, supply: { grain: 0 } });
        expect(market.stock.grain).toBe(0);
        const g = market.balanceSheet().goods.grain;
        expect(g.consumption).toBe(10);
        expect(g.unmet).toBe(10);
        expect(g.balanced).toBe(true);
        expect(market.balanceSheet().balanced).toBe(true);
    });

    it('reconciles mixed production, consumption, and trade flows exactly', () => {
        const market = new Market({ prices: { grain: 2 }, stock: { grain: 10 } });
        market.update({ demand: { grain: 8 }, supply: { grain: 5 } }); // stock 10 -> 7
        market.trade('grain', 3);                                       // stock 7 -> 4
        market.update({ demand: { grain: 4 }, supply: { grain: 0 } });  // stock 4 -> 0
        const g = market.balanceSheet().goods.grain;
        expect(g.production).toBe(5);
        expect(g.consumption).toBe(12); // 8 + 4
        expect(g.tradeOut).toBe(3);
        expect(g.expected).toBe(0);
        expect(g.actual).toBe(0);
        expect(market.balanceSheet().balanced).toBe(true);
    });

    it('never creates material from nowhere via negative demand', () => {
        const market = new Market({ prices: { grain: 1 }, stock: { grain: 5 } });
        market.update({ demand: { grain: -3 }, supply: { grain: 0 } });
        expect(market.stock.grain).toBe(5); // creation-from-nowhere mutant would make this 8
        const g = market.balanceSheet().goods.grain;
        expect(g.consumption).toBe(0);
        expect(g.balanced).toBe(true);
    });

    it('never lets stock go negative and records destruction beyond stock as discard', () => {
        const market = new Market({ prices: { grain: 1 }, stock: { grain: 5 } });
        market.update({ demand: { grain: 0 }, supply: { grain: -50 } });
        expect(market.stock.grain).toBe(0);
        const g = market.balanceSheet().goods.grain;
        expect(g.destroyed).toBe(5);
        expect(g.discard).toBe(45);
        expect(g.actual).toBe(0);
        expect(g.balanced).toBe(true);
    });

    it('keeps flows() trade-only for compatibility while balanceSheet covers all flows', () => {
        const market = new Market({ prices: { grain: 2 }, stock: { grain: 10 } });
        market.update({ demand: { grain: 4 }, supply: { grain: 6 } }); // stock 10 -> 12
        market.trade('grain', 2);                                      // stock 12 -> 10
        const { net } = market.flows();
        expect(net.grain).toBe(2);
        const g = market.balanceSheet().goods.grain;
        expect(g.production).toBe(6);
        expect(g.consumption).toBe(4);
        expect(g.actual).toBe(10);
        expect(g.balanced).toBe(true);
    });

    it('rejects oversold trades without disturbing conservation', () => {
        const market = new Market({ prices: { grain: 2 }, stock: { grain: 3 } });
        expect(market.trade('grain', 100)).toBe(null);
        const g = market.balanceSheet().goods.grain;
        expect(g.tradeOut).toBe(0);
        expect(g.actual).toBe(3);
        expect(market.balanceSheet().balanced).toBe(true);
    });

    it('rejects a duplicate trip id even when stock is also insufficient', () => {
        const market = new Market({ prices: { grain: 1 }, stock: { grain: 5 } });
        market.createTrip({ id: 't1', good: 'grain', quantity: 4, destination: 'south' }); // stock 1 left
        // stock (1) < quantity (4): the stock-first mutant returns null here and hides the duplicate id.
        expect(() => market.createTrip({ id: 't1', good: 'grain', quantity: 4, destination: 'south' })).toThrow(/Duplicate trip id/);
        expect(market.stock.grain).toBe(1); // no mutation on the rejected call
    });

    it('reconciles exactly after save/load restore through SocietyCore', () => {
        const society = new SocietyCore();
        society.addMarket('m', new Market({ prices: { grain: 2 }, stock: { grain: 10 } }));
        const market = society.markets.get('m');
        market.update({ demand: { grain: 4 }, supply: { grain: 6 } });
        market.trade('grain', 2);
        const clone = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        const restored = clone.markets.get('m');
        expect(restored.stock.grain).toBe(10);
        expect(restored.balanceSheet().balanced).toBe(true);
        expect(restored.balanceSheet().goods.grain).toEqual(market.balanceSheet().goods.grain);
    });
});
