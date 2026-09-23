import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-CROSS-MARKET-MULTI-ROUTE-001', () => {
    function setup() {
        const society = new SocietyCore({ seed: 2871 });
        society.addMarket('a', new Market({ stock: { grain: 20 } }));
        society.addMarket('b', new Market({ stock: { grain: 0 } }));
        society.routes = new RouteNetwork([
            { id: 'short-safe', travelTime: 2, perceivedDanger: 0, available: true },
            { id: 'long-risky', travelTime: 5, perceivedDanger: 8, available: true },
        ]);
        return society;
    }

    it('selects an available candidate route for the transfer', () => {
        const society = setup();
        const result = society.transferQueueAwareEconomicSupply({ fromMarket: 'a', toMarket: 'b', routeIds: ['long-risky', 'short-safe'], quantity: 7 });
        expect(result).toMatchObject({ moved: 7, routeId: 'short-safe', accessBlocked: false });
        expect(result.routeIds).toEqual(['long-risky', 'short-safe']);
    });

    it('falls back to another available route when the preferred route closes', () => {
        const society = setup();
        society.routes.edges[0].available = false;
        const result = society.transferQueueAwareEconomicSupply({ fromMarket: 'a', toMarket: 'b', routeIds: ['short-safe', 'long-risky'], quantity: 4 });
        expect(result).toMatchObject({ moved: 4, routeId: 'long-risky', accessBlocked: false });
    });

    it('blocks the transfer when every candidate route is unavailable', () => {
        const society = setup();
        society.routes.edges.forEach(route => { route.available = false; });
        const result = society.transferQueueAwareEconomicSupply({ fromMarket: 'a', toMarket: 'b', routeIds: ['short-safe', 'long-risky'], quantity: 4 });
        expect(result).toMatchObject({ moved: 0, accessBlocked: true });
        expect(society.markets.get('a').stock.grain).toBe(20);
        expect(society.markets.get('b').stock.grain).toBe(0);
    });

    it('persists selected route and market accounting without hidden route fields', () => {
        const society = setup();
        society.tick({ actions: [{ kind: 'QUEUE_AWARE_CROSS_MARKET_TRANSFER', fromMarket: 'a', toMarket: 'b', routeIds: ['long-risky', 'short-safe'], actorId: 'merchant', quantity: 3 }] });
        const event = society.events.at(-1);
        expect(event.routeId).toBe('short-safe');
        expect(JSON.stringify(event)).not.toContain('perceivedDanger');
        const snapshot = society.serialize();
        expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot))).serialize()).toEqual(snapshot);
    });
});
