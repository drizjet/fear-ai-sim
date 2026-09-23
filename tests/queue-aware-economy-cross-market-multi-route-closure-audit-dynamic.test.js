import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-CROSS-MARKET-MULTI-ROUTE-CLOSURE-AUDIT-DYNAMIC-001', () => {
    it('maintains closure invariants across long route churn horizons', () => {
        for (const seed of [3001, 3011, 3021]) {
            const society = new SocietyCore({ seed });
            society.addMarket('a', new Market({ stock: { grain: 2000 } }));
            society.addMarket('b', new Market({ stock: { grain: 0 } }));
            society.routes = new RouteNetwork([
                { id: 'fast', travelTime: 2, perceivedDanger: 0, available: true, predictabilityWeight: .1 },
                { id: 'safe', travelTime: 5, perceivedDanger: 1, available: true, predictabilityWeight: .1 },
                { id: 'detour', travelTime: 9, perceivedDanger: 0, available: true, predictabilityWeight: .1 },
            ]);
            for (let i = 0; i < 600; i += 1) {
                const routes = society.routes.edges;
                routes[0].available = i % 5 !== 0;
                routes[1].available = i % 7 !== 0;
                routes[2].available = i % 11 !== 0;
                const before = society.markets.get('a').stock.grain;
                const result = society.transferQueueAwareEconomicSupply({
                    fromMarket: 'a', toMarket: 'b', routeIds: ['fast', 'safe', 'detour'],
                    quantity: (i % 6) + 1, actorId: `merchant-${i % 4}`,
                    context: { fearSensitivity: (i % 4) / 2 },
                });
                const anyAvailable = routes.some(route => route.available);
                expect(result.accessBlocked).toBe(!anyAvailable);
                expect(result.moved).toBe(anyAvailable ? Math.min((i % 6) + 1, before) : 0);
                expect(society.markets.get('a').stock.grain).toBeGreaterThanOrEqual(0);
                expect(society.markets.get('b').stock.grain).toBeGreaterThanOrEqual(0);
                society.routes.decayTraffic(.01);
                if (i % 100 === 99) {
                    const snapshot = society.serialize();
                    expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot))).serialize()).toEqual(snapshot);
                }
            }
            expect(society.markets.get('a').balanceSheet().balanced).toBe(true);
            expect(society.markets.get('b').balanceSheet().balanced).toBe(true);
        }
    });
});
