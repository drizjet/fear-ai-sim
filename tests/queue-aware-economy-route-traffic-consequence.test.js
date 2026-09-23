import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-ROUTE-TRAFFIC-CONSEQUENCE-001', () => {
    it('records selected-route traffic as a downstream risk carrier', () => {
        const society = new SocietyCore({ seed: 3601 });
        society.addMarket('a', new Market({ stock: { grain: 30 } }));
        society.addMarket('b', new Market({ stock: { grain: 0 } }));
        society.routes = new RouteNetwork([{ id: 'road', travelTime: 2, perceivedDanger: 0, available: true, traffic: 0 }]);
        const result = society.transferQueueAwareEconomicSupply({ fromMarket: 'a', toMarket: 'b', routeId: 'road', quantity: 7, actorId: 'merchant' });
        expect(result.moved).toBe(7);
        expect(society.routes.edges[0].traffic).toBeGreaterThan(0);
        expect(society.routes.edges[0].traffic).toBe(7);
        expect(society.markets.get('a').balanceSheet().balanced).toBe(true);
        expect(society.markets.get('b').balanceSheet().balanced).toBe(true);
    });

    it('does not increase exposure when access is blocked', () => {
        const society = new SocietyCore({ seed: 3611 });
        society.addMarket('a', new Market({ stock: { grain: 30 } }));
        society.addMarket('b', new Market({ stock: { grain: 0 } }));
        society.routes = new RouteNetwork([{ id: 'road', travelTime: 2, perceivedDanger: 0, available: false, traffic: 4 }]);
        const result = society.transferQueueAwareEconomicSupply({ fromMarket: 'a', toMarket: 'b', routeId: 'road', quantity: 7 });
        expect(result.moved).toBe(0);
        expect(society.routes.edges[0].traffic).toBe(4);
    });
});
