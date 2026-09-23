import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('market to route feedback', () => {
    it('records destination price in a route decision history event', () => {
        const society = new SocietyCore();
        society.addMarket('south', new Market({ prices: { grain: 9 } }));
        society.routes = new RouteNetwork([{ id: 'road-a', travelTime: 2 }, { id: 'road-b', travelTime: 5 }]);
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', actorId: 'merchant', destination: 'south', good: 'grain' }] });
        const event = society.events.find(item => item.type === 'TRADE_ROUTE_DECISION');
        expect(event.parentId).toBe(society.events[0].id);
        expect(event.destinationPrice).toBe(9);
        expect(event.selectedRoute).toBe('road-a');
        expect(event.decision).toBe('TRAVEL');
    });

    it('different destination prices produce different decision evidence', () => {
        const choose = price => {
            const society = new SocietyCore();
            society.addMarket('south', new Market({ prices: { grain: price } }));
            society.routes = new RouteNetwork([{ id: 'road-a', travelTime: 2 }, { id: 'road-b', travelTime: 5 }]);
            society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', destination: 'south', good: 'grain' }] });
            return society.events.find(item => item.type === 'TRADE_ROUTE_DECISION');
        };
        expect(choose(2).destinationPrice).not.toBe(choose(10).destinationPrice);
        expect(choose(2).decision).toBe('TRAVEL');
        const low = (() => { const society = new SocietyCore(); society.addMarket('south', new Market({ prices: { grain: 2 } })); society.routes = new RouteNetwork([{ id: 'road-a', travelTime: 2 }]); society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', destination: 'south', good: 'grain', minimumPrice: 5 }] }); return society.events.find(item => item.type === 'TRADE_ROUTE_DECISION'); })();
        expect(low.decision).toBe('WAIT');
        expect(low.selectedRoute).toBeNull();
    });
});
