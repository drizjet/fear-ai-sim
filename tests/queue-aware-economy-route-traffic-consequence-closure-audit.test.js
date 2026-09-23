import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-ROUTE-TRAFFIC-CONSEQUENCE-CLOSURE-AUDIT-001', () => {
    function setup() {
        const society = new SocietyCore({ seed: 3801 });
        society.addMarket('a', new Market({ stock: { grain: 200 } }));
        society.addMarket('b', new Market({ stock: { grain: 0 } }));
        society.routes = new RouteNetwork([{ id: 'road', travelTime: 2, perceivedDanger: 0, available: true, traffic: 0, trafficCapacity: 25 }]);
        return society;
    }

    it('audits traffic accumulation, capacity bounds, decay, and conservation', () => {
        const society = setup();
        for (let i = 0; i < 20; i += 1) society.transferQueueAwareEconomicSupply({ fromMarket: 'a', toMarket: 'b', routeId: 'road', quantity: 3 });
        const route = society.routes.edges[0];
        expect(route.traffic).toBe(25);
        expect(route.traffic).toBeLessThanOrEqual(route.trafficCapacity);
        expect(society.markets.get('a').balanceSheet().balanced).toBe(true);
        expect(society.markets.get('b').balanceSheet().balanced).toBe(true);
        society.routes.decayTraffic(.5);
        expect(route.traffic).toBe(12.5);
    });

    it('keeps blocked transfers from creating exposure or causal material changes', () => {
        const society = setup();
        const route = society.routes.edges[0];
        route.available = false;
        const before = society.markets.get('a').stock.grain;
        const result = society.transferQueueAwareEconomicSupply({ fromMarket: 'a', toMarket: 'b', routeId: route.id, quantity: 8 });
        expect(result).toMatchObject({ moved: 0, accessBlocked: true });
        expect(route.traffic).toBe(0);
        expect(society.markets.get('a').stock.grain).toBe(before);
    });

    it('preserves traffic and route decisions through event persistence', () => {
        const society = setup();
        society.tick({ actions: [{ kind: 'QUEUE_AWARE_CROSS_MARKET_TRANSFER', fromMarket: 'a', toMarket: 'b', routeId: 'road', quantity: 5, actorId: 'merchant' }] });
        expect(society.events.at(-1)).toMatchObject({ type: 'QUEUE_AWARE_CROSS_MARKET_TRANSFER', routeId: 'road', moved: 5 });
        const snapshot = society.serialize();
        expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot))).serialize()).toEqual(snapshot);
    });
});
