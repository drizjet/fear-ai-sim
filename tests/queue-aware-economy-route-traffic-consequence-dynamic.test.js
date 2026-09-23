import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-ROUTE-TRAFFIC-CONSEQUENCE-DYNAMIC-001', () => {
    it('keeps route exposure bounded and persistent under long transfer churn', () => {
        for (const seed of [3701, 3711, 3721]) {
            const society = new SocietyCore({ seed });
            society.addMarket('a', new Market({ stock: { grain: 1200 } }));
            society.addMarket('b', new Market({ stock: { grain: 0 } }));
            society.routes = new RouteNetwork([
                { id: 'north', travelTime: 2, perceivedDanger: 0, available: true, trafficCapacity: 75 },
                { id: 'south', travelTime: 5, perceivedDanger: 1, available: true, trafficCapacity: 75 },
                { id: 'east', travelTime: 8, perceivedDanger: 2, available: true, trafficCapacity: 75 },
            ]);
            for (let i = 0; i < 300; i += 1) {
                const routes = society.routes.edges;
                routes[0].available = i % 6 !== 0;
                routes[1].available = i % 9 !== 0;
                routes[2].available = i % 13 !== 0;
                const before = society.markets.get('a').stock.grain;
                const quantity = (i % 3) + 1;
                const result = society.transferQueueAwareEconomicSupply({ fromMarket: 'a', toMarket: 'b', routeIds: ['north', 'south', 'east'], quantity, actorId: `merchant-${i % 4}`, context: { fearSensitivity: (i % 5) / 2 } });
                expect(result.moved).toBeLessThanOrEqual(Math.min(quantity, before));
                expect(routes.every(route => route.traffic >= 0 && route.traffic <= route.trafficCapacity)).toBe(true);
                if (i % 50 === 49) {
                    const snapshot = society.serialize();
                    expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot))).serialize()).toEqual(snapshot);
                }
                society.routes.decayTraffic(.03);
            }
            expect(society.markets.get('a').balanceSheet().balanced).toBe(true);
            expect(society.markets.get('b').balanceSheet().balanced).toBe(true);
            expect(society.routes.edges.some(route => route.traffic > 0)).toBe(true);
        }
    });
});
