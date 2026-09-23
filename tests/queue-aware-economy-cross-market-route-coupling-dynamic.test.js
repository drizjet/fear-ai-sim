import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-CROSS-MARKET-ROUTE-COUPLING-DYNAMIC-001', () => {
    it('keeps route-gated transfers bounded and conserved as access changes', () => {
        for (const seed of [2821, 2831, 2841]) {
            const society = new SocietyCore({ seed });
            society.addMarket('a', new Market({ stock: { grain: 600 } }));
            society.addMarket('b', new Market({ stock: { grain: 0 } }));
            society.routes = new RouteNetwork([{ id: 'road', available: true }]);
            for (let i = 0; i < 300; i += 1) {
                society.routes.edges[0].available = i % 5 !== 0;
                society.tick({ actions: [{ kind: 'QUEUE_AWARE_CROSS_MARKET_TRANSFER', fromMarket: 'a', toMarket: 'b', routeId: 'road', quantity: (i % 11) + 1 }] });
                if (i % 19 === 0) society.markets.get('a').receive('grain', 4);
            }
            expect(society.events).toHaveLength(600);
            expect(society.events.every((event, i) => i === 0 || event.seq === society.events[i - 1].seq + 1)).toBe(true);
            expect(society.markets.get('a').balanceSheet().balanced).toBe(true);
            expect(society.markets.get('b').balanceSheet().balanced).toBe(true);
            expect(society.markets.get('a').stock.grain).toBeGreaterThanOrEqual(0);
            expect(society.markets.get('b').stock.grain).toBeGreaterThanOrEqual(0);
            const snapshot = society.serialize();
            expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot))).serialize()).toEqual(snapshot);
        }
    });
});
