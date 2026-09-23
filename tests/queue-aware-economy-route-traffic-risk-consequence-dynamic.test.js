import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-ROUTE-TRAFFIC-RISK-CONSEQUENCE-DYNAMIC-001', () => {
    it('keeps long-horizon trip outcomes terminal and conserved under route churn', () => {
        for (const seed of [4001, 4011, 4021]) {
            const society = new SocietyCore({ seed });
            const origin = society.addMarket('origin', new Market({ stock: { grain: 700 } }));
            const destination = society.addMarket('destination', new Market({ stock: { grain: 0 } }));
            society.routes = new RouteNetwork([
                { id: 'safe', available: true, perceivedDanger: 0, traffic: 0, trafficCapacity: 50 },
                { id: 'dangerous', available: true, perceivedDanger: 2, traffic: 0, trafficCapacity: 50 },
            ]);
            for (let i = 0; i < 120; i += 1) {
                const route = society.routes.edges[i % 2];
                route.available = i % 9 !== 0;
                const tripId = `trip-${seed}-${i}`;
                const trip = origin.createTrip({ id: tripId, good: 'grain', quantity: 2, destination: 'destination' });
                if (!trip) break;
                society.tick({ actions: [{ kind: 'MARKET_TRIP_SETTLE', market: 'origin', tripId, destinationMarket: 'destination', routeId: route.id, riskThreshold: 1 }] });
                const event = society.events.at(-1);
                expect(['DELIVERED', 'STOLEN', 'BLOCKED']).toContain(event.outcome);
                expect(origin.inTransit.has(tripId)).toBe(false);
                if (i % 30 === 29) {
                    const snapshot = society.serialize();
                    expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot))).serialize()).toEqual(snapshot);
                }
            }
            expect(origin.inTransit.size).toBe(0);
            expect(origin.stock.grain).toBeGreaterThanOrEqual(0);
            expect(destination.stock.grain).toBeGreaterThanOrEqual(0);
            expect(origin.balanceSheet().balanced).toBe(true);
            expect(destination.balanceSheet().balanced).toBe(true);
        }
    });
});
