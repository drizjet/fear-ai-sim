import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-MARKET-PRICE-SHORTAGE-MERCHANT-CAUSAL-DYNAMIC-001', () => {
    it('preserves directional price and merchant feedback across dynamic regimes', () => {
        for (const seed of [4901, 4911, 4921]) {
            const society = new SocietyCore({ seed });
            society.addMarket('source', new Market({ stock: { grain: 400 } }));
            society.addMarket('scarce', new Market({ prices: { grain: 1 }, stock: { grain: 0 } }));
            society.addMarket('supplied', new Market({ prices: { grain: 1 }, stock: { grain: 80 } }));
            society.routes = new RouteNetwork([{ id: 'road', available: true, travelTime: 2 }]);
            let travelCount = 0;
            for (let i = 0; i < 40; i += 1) {
                const scarceDemand = 10 + (i % 5);
                const suppliedDemand = 2 + (i % 2);
                society.tick({ actions: [
                    { kind: 'MARKET_UPDATE', market: 'scarce', demand: { grain: scarceDemand }, supply: { grain: i % 4 === 0 ? 2 : 0 } },
                    { kind: 'MARKET_UPDATE', market: 'supplied', demand: { grain: suppliedDemand }, supply: { grain: i % 3 === 0 ? 8 : 4 } },
                ] });
                const scarce = society.markets.get('scarce');
                const supplied = society.markets.get('supplied');
                if (scarce.prices.grain >= supplied.prices.grain) {
                    society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', destination: 'scarce', good: 'grain', routes: society.routes.edges, minimumPrice: supplied.prices.grain }] });
                    if (society.events.at(-1).decision === 'TRAVEL') travelCount += 1;
                }
                if (i % 10 === 9) {
                    scarce.receive('grain', 5);
                    supplied.receive('grain', 10);
                    const snapshot = society.serialize();
                    expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot))).serialize()).toEqual(snapshot);
                }
            }
            expect(travelCount).toBeGreaterThan(0);
            expect(society.markets.get('source').balanceSheet().balanced).toBe(true);
            expect(society.markets.get('scarce').balanceSheet().balanced).toBe(true);
            expect(society.markets.get('supplied').balanceSheet().balanced).toBe(true);
        }
    });
});
