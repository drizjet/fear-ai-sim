import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-MARKET-PENDING-DELIVERY-MATERIAL-ACCOUNTING-CLOSURE-AUDIT-001', () => {
    it('closes mixed-good terminal accounting across markets', () => {
        const society = new SocietyCore({ seed: 4701 });
        const origin = society.addMarket('origin', new Market({ stock: { grain: 40, iron: 30 } }));
        const destination = society.addMarket('destination', new Market({ stock: { grain: 0, iron: 0 } }));
        society.routes = new RouteNetwork([
            { id: 'safe', available: true, perceivedDanger: 0 },
            { id: 'danger', available: true, perceivedDanger: 9 },
            { id: 'closed', available: false, perceivedDanger: 0 },
        ]);
        const trips = [
            ['grain-safe', 'grain', 'safe', 5],
            ['iron-danger', 'iron', 'danger', 6],
            ['grain-closed', 'grain', 'closed', 7],
        ];
        for (const [id, good, route, quantity] of trips) origin.createTrip({ id, good, cargoKind: good.toUpperCase(), owner: `owner-${id}`, quantity, destination: 'destination' });
        const before = society.serialize();
        expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(before))).serialize()).toEqual(before);
        for (const action of [
            { kind: 'MARKET_TRIP_SETTLE', market: 'origin', tripId: 'grain-safe', destinationMarket: 'destination', routeId: 'safe', perceivedDanger: 0, routeAvailable: true },
            { kind: 'MARKET_TRIP_SETTLE', market: 'origin', tripId: 'iron-danger', destinationMarket: 'destination', routeId: 'danger', perceivedDanger: 9, routeAvailable: true },
            { kind: 'MARKET_TRIP_SETTLE', market: 'origin', tripId: 'grain-closed', destinationMarket: 'destination', routeId: 'closed', perceivedDanger: 0, routeAvailable: false },
        ]) society.commitEvent(society.executeAction(action));
        const events = society.events.filter(event => event.type === 'MARKET_TRIP_SETTLE');
        expect(events.map(event => event.outcome)).toEqual(['DELIVERED', 'STOLEN', 'BLOCKED']);
        expect(destination.stock).toEqual({ grain: 5, iron: 0 });
        expect(origin.inTransit.size).toBe(0);
        expect(origin.balanceSheet().balanced).toBe(true);
        expect(destination.balanceSheet().balanced).toBe(true);
        const after = society.serialize();
        expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(after))).serialize()).toEqual(after);
    });
});
