import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-CROSS-MARKET-ROUTE-SELECTION-FAIRNESS-DYNAMIC-001', () => {
    it('keeps dynamic route choices bounded and actor-local across churn', () => {
        for (const seed of [3201, 3211, 3221]) {
            const society = new SocietyCore({ seed });
            society.addMarket('a', new Market({ stock: { grain: 1500 } }));
            society.addMarket('b', new Market({ stock: { grain: 0 } }));
            society.routes = new RouteNetwork([
                { id: 'north', travelTime: 3, perceivedDanger: 0, available: true, predictabilityWeight: .05 },
                { id: 'south', travelTime: 3, perceivedDanger: 0, available: true, predictabilityWeight: .05 },
                { id: 'east', travelTime: 7, perceivedDanger: 1, available: true, predictabilityWeight: .05 },
            ]);
            const counts = new Map();
            for (let i = 0; i < 400; i += 1) {
                const routes = society.routes.edges;
                routes[0].available = i % 6 !== 0;
                routes[1].available = i % 8 !== 0;
                routes[2].available = i % 13 !== 0;
                const result = society.transferQueueAwareEconomicSupply({
                    fromMarket: 'a', toMarket: 'b', routeIds: ['north', 'south', 'east'],
                    quantity: (i % 4) + 1, actorId: `actor-${i % 5}`,
                    context: { fearSensitivity: (i % 5) / 2 },
                });
                if (result.routeId) counts.set(result.routeId, (counts.get(result.routeId) ?? 0) + 1);
                expect(result.accessBlocked).toBe(!routes.some(route => route.available));
                expect(result.moved).toBeGreaterThanOrEqual(0);
                expect(result.moved).toBeLessThanOrEqual((i % 4) + 1);
                society.routes.decayTraffic(.015);
                if (i % 100 === 99) {
                    const snapshot = society.serialize();
                    expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot))).serialize()).toEqual(snapshot);
                }
            }
            expect(counts.size).toBeGreaterThan(1);
            expect(society.markets.get('a').balanceSheet().balanced).toBe(true);
            expect(society.markets.get('b').balanceSheet().balanced).toBe(true);
        }
    });
});
