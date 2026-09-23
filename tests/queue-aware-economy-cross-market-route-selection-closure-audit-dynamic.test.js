import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-CROSS-MARKET-ROUTE-SELECTION-CLOSURE-AUDIT-DYNAMIC-001', () => {
    it('holds route-selection closure invariants over long mixed-risk horizons', () => {
        for (const seed of [3401, 3411, 3421]) {
            const society = new SocietyCore({ seed });
            society.addMarket('a', new Market({ stock: { grain: 1800 } }));
            society.addMarket('b', new Market({ stock: { grain: 0 } }));
            society.routes = new RouteNetwork([
                { id: 'north', travelTime: 3, perceivedDanger: 0, available: true, predictabilityWeight: .05 },
                { id: 'south', travelTime: 3, perceivedDanger: 1, available: true, predictabilityWeight: .05 },
                { id: 'east', travelTime: 7, perceivedDanger: 2, available: true, predictabilityWeight: .05 },
            ]);
            for (let i = 0; i < 500; i += 1) {
                const routes = society.routes.edges;
                routes[0].available = i % 5 !== 0;
                routes[1].available = i % 7 !== 0;
                routes[2].available = i % 11 !== 0;
                const before = society.markets.get('a').stock.grain;
                const amount = (i % 5) + 1;
                const result = society.transferQueueAwareEconomicSupply({
                    fromMarket: 'a', toMarket: 'b', routeIds: ['north', 'south', 'east'], quantity: amount,
                    actorId: `merchant-${i % 6}`, context: { fearSensitivity: (i % 4) / 2 },
                });
                const available = routes.some(route => route.available);
                expect(result.accessBlocked).toBe(!available);
                expect(result.moved).toBe(available ? Math.min(amount, before) : 0);
                expect(result.routeIds).toEqual(['north', 'south', 'east']);
                expect(society.markets.get('a').stock.grain).toBeGreaterThanOrEqual(0);
                expect(society.markets.get('b').stock.grain).toBeGreaterThanOrEqual(0);
                society.routes.decayTraffic(.02);
                if (i % 125 === 124) {
                    const snapshot = society.serialize();
                    expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot))).serialize()).toEqual(snapshot);
                }
            }
            expect(society.markets.get('a').balanceSheet().balanced).toBe(true);
            expect(society.markets.get('b').balanceSheet().balanced).toBe(true);
        }
    });
});
