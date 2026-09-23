import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-MARKET-PENDING-DELIVERY-AUTOMATION-CLOSURE-AUDIT-001', () => {
    it('audits automatic delivery, blocked terminality, persistence, and conservation', () => {
        const society = new SocietyCore({ seed: 4301 });
        const origin = society.addMarket('origin', new Market({ stock: { grain: 40 } }));
        const destination = society.addMarket('destination', new Market({ stock: { grain: 0 } }));
        society.routes = new RouteNetwork([{ id: 'road', available: true, perceivedDanger: 0 }]);
        origin.createTrip({ id: 'deliver', good: 'grain', quantity: 5, destination: 'destination' });
        society.worldStep({ routes: society.routes.edges });
        expect(destination.stock.grain).toBe(5);
        expect(origin.inTransit.size).toBe(0);
        const eventCount = society.events.filter(event => event.tripId === 'deliver').length;
        society.worldStep({ routes: society.routes.edges });
        expect(society.events.filter(event => event.tripId === 'deliver')).toHaveLength(eventCount);
        expect(origin.balanceSheet().balanced).toBe(true);
        expect(destination.balanceSheet().balanced).toBe(true);
        const blocked = new SocietyCore({ seed: 4302 });
        const blockedOrigin = blocked.addMarket('origin', new Market({ stock: { grain: 10 } }));
        blocked.addMarket('destination', new Market({ stock: { grain: 0 } }));
        blocked.routes = new RouteNetwork([]);
        blockedOrigin.createTrip({ id: 'blocked', good: 'grain', quantity: 3, destination: 'destination' });
        blocked.worldStep({ routes: blocked.routes.edges });
        expect(blocked.events.some(event => event.tripId === 'blocked' && event.outcome === 'BLOCKED')).toBe(true);
        expect(blockedOrigin.inTransit.size).toBe(0);
    });
});
