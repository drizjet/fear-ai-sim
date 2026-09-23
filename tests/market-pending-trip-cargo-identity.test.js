import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-MARKET-PENDING-DELIVERY-CARGO-IDENTITY-001', () => {
    it('preserves cargo identity and owner through delivery', () => {
        const society = new SocietyCore({ seed: 4401 });
        const origin = society.addMarket('origin', new Market({ stock: { grain: 20 } }));
        society.addMarket('destination', new Market({ stock: { grain: 0 } }));
        society.routes = new RouteNetwork([{ id: 'road', available: true, perceivedDanger: 0 }]);
        origin.createTrip({ id: 'trip', good: 'grain', cargoKind: 'FOOD_GRAIN', owner: 'merchant', quantity: 5, destination: 'destination' });
        society.worldStep({ routes: society.routes.edges });
        const event = society.events.find(candidate => candidate.type === 'MARKET_TRIP_SETTLE');
        expect(event).toMatchObject({ cargoKind: 'FOOD_GRAIN', owner: 'merchant', outcome: 'DELIVERED' });
        expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize()))).serialize()).toEqual(society.serialize());
    });

    it('preserves cargo identity while assigning theft ownership', () => {
        const society = new SocietyCore({ seed: 4411 });
        const origin = society.addMarket('origin', new Market({ stock: { grain: 20 } }));
        society.addMarket('destination', new Market({ stock: { grain: 0 } }));
        society.routes = new RouteNetwork([{ id: 'danger', available: true, perceivedDanger: 9 }]);
        origin.createTrip({ id: 'trip', good: 'grain', cargoKind: 'FOOD_GRAIN', owner: 'merchant', quantity: 5, destination: 'destination' });
        society.worldStep({ routes: society.routes.edges });
        expect(society.events.find(candidate => candidate.type === 'MARKET_TRIP_SETTLE')).toMatchObject({ cargoKind: 'FOOD_GRAIN', owner: 'thief', outcome: 'STOLEN' });
    });
});
