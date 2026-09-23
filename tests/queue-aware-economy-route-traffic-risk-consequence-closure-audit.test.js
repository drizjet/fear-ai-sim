import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-ROUTE-TRAFFIC-RISK-CONSEQUENCE-CLOSURE-AUDIT-001', () => {
    it('closes delivered, stolen, and blocked trips exactly once', () => {
        const society = new SocietyCore({ seed: 4101 });
        const origin = society.addMarket('origin', new Market({ stock: { grain: 30 } }));
        const destination = society.addMarket('destination', new Market({ stock: { grain: 0 } }));
        society.routes = new RouteNetwork([
            { id: 'safe', available: true, perceivedDanger: 0 },
            { id: 'danger', available: true, perceivedDanger: 5 },
            { id: 'closed', available: false, perceivedDanger: 0 },
        ]);
        origin.createTrip({ id: 'safe-trip', good: 'grain', quantity: 3, destination: 'destination' });
        origin.createTrip({ id: 'danger-trip', good: 'grain', quantity: 4, destination: 'destination' });
        origin.createTrip({ id: 'closed-trip', good: 'grain', quantity: 5, destination: 'destination' });
        society.tick({ actions: [
            { kind: 'MARKET_TRIP_SETTLE', market: 'origin', tripId: 'safe-trip', destinationMarket: 'destination', routeId: 'safe' },
            { kind: 'MARKET_TRIP_SETTLE', market: 'origin', tripId: 'danger-trip', destinationMarket: 'destination', routeId: 'danger' },
            { kind: 'MARKET_TRIP_SETTLE', market: 'origin', tripId: 'closed-trip', destinationMarket: 'destination', routeId: 'closed' },
        ] });
        expect(destination.stock.grain).toBe(3);
        expect(origin.inTransit.size).toBe(0);
        expect(society.events.slice(-3).map(event => event.outcome)).toEqual(['DELIVERED', 'STOLEN', 'BLOCKED']);
        expect(origin.balanceSheet().balanced).toBe(true);
        expect(destination.balanceSheet().balanced).toBe(true);
        expect(() => society.executeAction({ kind: 'MARKET_TRIP_SETTLE', market: 'origin', tripId: 'safe-trip', destinationMarket: 'destination', routeId: 'safe' })).toThrow();
    });
});
