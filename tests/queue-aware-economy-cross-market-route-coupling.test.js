import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-CROSS-MARKET-ROUTE-COUPLING-001', () => {
    function setup() {
        const society = new SocietyCore({ seed: 2811 });
        society.addMarket('source', new Market({ stock: { grain: 20 } }));
        society.addMarket('destination', new Market({ stock: { grain: 0 } }));
        society.routes = new RouteNetwork([{ id: 'road', available: true, perceivedDanger: 9, actualDanger: 12345 }]);
        return society;
    }

    it('blocks transfers through unavailable routes without mutating market stock', () => {
        const society = setup();
        society.routes.edges[0].available = false;
        const result = society.transferQueueAwareEconomicSupply({ fromMarket: 'source', toMarket: 'destination', routeId: 'road', quantity: 8 });
        expect(result).toMatchObject({ moved: 0, accessBlocked: true });
        expect(society.markets.get('source').stock.grain).toBe(20);
        expect(society.markets.get('destination').stock.grain).toBe(0);
    });

    it('records route coupling while excluding hidden route truth', () => {
        const society = setup();
        society.tick({ actions: [{ kind: 'QUEUE_AWARE_CROSS_MARKET_TRANSFER', fromMarket: 'source', toMarket: 'destination', routeId: 'road', actorId: 'merchant', quantity: 6 }] });
        const event = society.events.at(-1);
        expect(event).toMatchObject({ routeId: 'road', actorId: 'merchant', moved: 6, accessBlocked: false });
        expect(JSON.stringify(event)).not.toContain('actualDanger');
        expect(JSON.stringify(event)).not.toContain('12345');
    });

    it('preserves conservation and persistence for route-coupled transfers', () => {
        const society = setup();
        society.transferQueueAwareEconomicSupply({ fromMarket: 'source', toMarket: 'destination', routeId: 'road', quantity: 6 });
        expect(society.markets.get('source').balanceSheet().balanced).toBe(true);
        expect(society.markets.get('destination').balanceSheet().balanced).toBe(true);
        const snapshot = society.serialize();
        expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot))).serialize()).toEqual(snapshot);
    });
});
