import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-MARKET-PENDING-DELIVERY-CARGO-IDENTITY-CLOSURE-AUDIT-001', () => {
    it('audits identity, custody, terminality, persistence, and conservation', () => {
        const society = new SocietyCore({ seed: 4501 });
        const origin = society.addMarket('origin', new Market({ stock: { grain: 50 } }));
        const destination = society.addMarket('destination', new Market({ stock: { grain: 0 } }));
        society.routes = new RouteNetwork([
            { id: 'safe', available: true, perceivedDanger: 0 },
            { id: 'danger', available: true, perceivedDanger: 9 },
            { id: 'closed', available: false, perceivedDanger: 0 },
        ]);
        origin.createTrip({ id: 'safe-trip', good: 'grain', cargoKind: 'FOOD', owner: 'merchant-a', quantity: 5, destination: 'destination' });
        origin.createTrip({ id: 'danger-trip', good: 'grain', cargoKind: 'FOOD', owner: 'merchant-b', quantity: 6, destination: 'destination' });
        origin.createTrip({ id: 'closed-trip', good: 'grain', cargoKind: 'FOOD', owner: 'merchant-c', quantity: 7, destination: 'destination' });
        const pendingSnapshot = society.serialize();
        expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(pendingSnapshot))).serialize()).toEqual(pendingSnapshot);
        society.commitEvent(society.executeAction({ kind: 'MARKET_TRIP_SETTLE', market: 'origin', tripId: 'safe-trip', destinationMarket: 'destination', routeId: 'safe', perceivedDanger: 0, routeAvailable: true }));
        society.commitEvent(society.executeAction({ kind: 'MARKET_TRIP_SETTLE', market: 'origin', tripId: 'danger-trip', destinationMarket: 'destination', routeId: 'danger', perceivedDanger: 9, routeAvailable: true }));
        society.commitEvent(society.executeAction({ kind: 'MARKET_TRIP_SETTLE', market: 'origin', tripId: 'closed-trip', destinationMarket: 'destination', routeId: 'closed', perceivedDanger: 0, routeAvailable: false }));
        const events = society.events.filter(event => event.type === 'MARKET_TRIP_SETTLE');
        expect(events).toHaveLength(3);
        expect(events.map(event => event.outcome)).toEqual(['DELIVERED', 'STOLEN', 'BLOCKED']);
        expect(events.every(event => event.cargoKind === 'FOOD')).toBe(true);
        expect(events.map(event => event.owner)).toEqual(['merchant-a', 'thief', 'merchant-c']);
        expect(destination.stock.grain).toBe(5);
        expect(origin.inTransit.size).toBe(0);
        expect(origin.balanceSheet().balanced).toBe(true);
        expect(destination.balanceSheet().balanced).toBe(true);
        const finalSnapshot = society.serialize();
        expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(finalSnapshot))).serialize()).toEqual(finalSnapshot);
    });
});
