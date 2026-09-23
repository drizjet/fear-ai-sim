import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-ROUTE-TRAFFIC-RISK-CONSEQUENCE-001', () => {
    it('uses route risk for a cargo trip and records the terminal consequence', () => {
        const society = new SocietyCore({ seed: 3901 });
        const origin = society.addMarket('origin', new Market({ stock: { grain: 20 } }));
        society.addMarket('destination', new Market({ stock: { grain: 0 } }));
        society.routes = new RouteNetwork([{ id: 'road', available: true, perceivedDanger: 2, traffic: 12 }]);
        origin.createTrip({ id: 'trip-1', good: 'grain', quantity: 5, destination: 'destination' });
        society.tick({ actions: [{ kind: 'MARKET_TRIP_SETTLE', market: 'origin', tripId: 'trip-1', destinationMarket: 'destination', routeId: 'road', riskThreshold: 1 }] });
        expect(society.events.at(-1)).toMatchObject({ type: 'MARKET_TRIP_SETTLE', outcome: 'STOLEN', routeId: 'road' });
        expect(society.markets.get('destination').stock.grain).toBe(0);
        expect(origin.balanceSheet().balanced).toBe(true);
    });

    it('does not let traffic create risk when the route is unavailable', () => {
        const society = new SocietyCore({ seed: 3911 });
        const origin = society.addMarket('origin', new Market({ stock: { grain: 20 } }));
        society.addMarket('destination', new Market({ stock: { grain: 0 } }));
        society.routes = new RouteNetwork([{ id: 'road', available: false, perceivedDanger: 9, traffic: 20 }]);
        origin.createTrip({ id: 'trip-2', good: 'grain', quantity: 5, destination: 'destination' });
        society.tick({ actions: [{ kind: 'MARKET_TRIP_SETTLE', market: 'origin', tripId: 'trip-2', destinationMarket: 'destination', routeId: 'road' }] });
        expect(society.events.at(-1).outcome).toBe('BLOCKED');
        expect(society.markets.get('destination').stock.grain).toBe(0);
    });
});
