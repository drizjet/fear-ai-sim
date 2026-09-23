import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-MARKET-PRICE-SHORTAGE-MERCHANT-CAUSAL-LONG-HORIZON-001', () => {
    function run(seed, scarceStock) {
        const society = new SocietyCore({ seed });
        society.addMarket('city', new Market({ prices: { grain: 1 }, stock: { grain: scarceStock } }));
        society.routes = new RouteNetwork([{ id: 'road', available: true, travelTime: 2 }]);
        let opportunities = 0;
        let travel = 0;
        for (let tick = 0; tick < 100; tick += 1) {
            society.tick({ actions: [{ kind: 'MARKET_UPDATE', market: 'city', demand: { grain: 10 }, supply: { grain: scarceStock > 0 ? 8 : 0 } }] });
            const price = society.markets.get('city').prices.grain;
            if (price >= 1) {
                opportunities += 1;
                society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', destination: 'city', good: 'grain', routes: society.routes.edges, minimumPrice: 1 }] });
                if (society.events.at(-1).decision === 'TRAVEL') travel += 1;
            }
            society.markets.get('city').receive('grain', scarceStock > 0 ? 2 : 0);
            if (tick % 25 === 24) {
                const snapshot = society.serialize();
                expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot))).serialize()).toEqual(snapshot);
            }
        }
        return { society, opportunities, travel };
    }

    it('produces non-vacuous merchant exposure and different counterfactual outcomes', () => {
        const scarce = run(5101, 0);
        const supplied = run(5101, 40);
        expect(scarce.opportunities).toBeGreaterThan(0);
        expect(supplied.opportunities).toBeGreaterThan(0);
        expect(scarce.travel).toBeGreaterThanOrEqual(supplied.travel);
        expect(scarce.society.markets.get('city').prices.grain).toBeGreaterThan(supplied.society.markets.get('city').prices.grain);
        expect(scarce.society.markets.get('city').balanceSheet().balanced).toBe(true);
        expect(supplied.society.markets.get('city').balanceSheet().balanced).toBe(true);
    });
});
