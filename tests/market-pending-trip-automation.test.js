import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-MARKET-PENDING-DELIVERY-AUTOMATION-001', () => {
    it('automatically settles pending trips on the next world step', () => {
        const society = new SocietyCore({ seed: 4201 });
        const origin = society.addMarket('origin', new Market({ stock: { grain: 10 } }));
        const destination = society.addMarket('destination', new Market({ stock: { grain: 0 } }));
        society.routes = new RouteNetwork([{ id: 'road', available: true, perceivedDanger: 0 }]);
        origin.createTrip({ id: 'trip-1', good: 'grain', quantity: 4, destination: 'destination' });
        society.worldStep({ routes: society.routes.edges });
        expect(origin.inTransit.size).toBe(0);
        expect(destination.stock.grain).toBe(4);
        expect(society.events.some(event => event.type === 'MARKET_TRIP_SETTLE' && event.outcome === 'DELIVERED')).toBe(true);
        const settledEvents = society.events.filter(event => event.tripId === 'trip-1');
        society.worldStep({ routes: society.routes.edges });
        expect(society.events.filter(event => event.tripId === 'trip-1')).toHaveLength(settledEvents.length);
    });

    it('preserves blocked trips as explicit terminal outcomes without delivery', () => {
        const society = new SocietyCore({ seed: 4211 });
        const origin = society.addMarket('origin', new Market({ stock: { grain: 10 } }));
        const destination = society.addMarket('destination', new Market({ stock: { grain: 0 } }));
        society.routes = new RouteNetwork([{ id: 'road', available: false, perceivedDanger: 0 }]);
        origin.createTrip({ id: 'trip-2', good: 'grain', quantity: 4, destination: 'destination' });
        society.worldStep({ routes: society.routes.edges });
        expect(destination.stock.grain).toBe(0);
        expect(society.events.find(event => event.type === 'MARKET_TRIP_SETTLE')).toMatchObject({ outcome: 'BLOCKED' });
    });

    it('round-trips pending-trip state before progression', () => {
        const society = new SocietyCore({ seed: 4221 });
        const origin = society.addMarket('origin', new Market({ stock: { grain: 10 } }));
        society.addMarket('destination', new Market({ stock: { grain: 0 } }));
        origin.createTrip({ id: 'trip-3', good: 'grain', quantity: 3, destination: 'destination' });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.serialize()).toEqual(society.serialize());
    });
});
