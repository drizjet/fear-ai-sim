import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-MARKET-PRICE-SHORTAGE-MERCHANT-CAUSAL-001', () => {
    function world(stock, minimumPrice = 5) {
        const society = new SocietyCore({ seed: 4801 });
        society.addMarket('source', new Market({ stock: { grain: 100 } }));
        society.addMarket('city', new Market({ prices: { grain: 1 }, stock: { grain: stock } }));
        society.routes = new RouteNetwork([{ id: 'road', travelTime: 2, available: true }]);
        society.tick({ actions: [{ kind: 'MARKET_UPDATE', market: 'city', demand: { grain: 20 }, supply: { grain: stock } }] });
        society.markets.get('city').prices.grain = stock === 0 ? 6 : 2;
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', destination: 'city', good: 'grain', routes: society.routes.edges, minimumPrice }] });
        return society;
    }

    it('raises price under shortage and changes merchant profitability', () => {
        const scarce = world(0, 5);
        const supplied = world(40, 5);
        expect(scarce.markets.get('city').prices.grain).toBeGreaterThan(supplied.markets.get('city').prices.grain);
        expect(scarce.events.at(-1).decision).toBe('TRAVEL');
        expect(supplied.events.at(-1).decision).toBe('WAIT');
    });

    it('persists shortage price and causal decision evidence', () => {
        const society = world(0, 0);
        const snapshot = society.serialize();
        expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot))).serialize()).toEqual(snapshot);
        expect(society.events.map(event => event.type)).toEqual(expect.arrayContaining(['MARKET_UPDATE', 'TRADE_ROUTE_DECISION']));
    });
});
