import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-CROSS-MARKET-ROUTE-COUPLING-CLOSURE-AUDIT-001', () => {
    it('audits blocked and permitted paths without leakage or phantom stock', () => {
        const society = new SocietyCore({ seed: 2851 });
        society.addMarket('a', new Market({ stock: { grain: 18 } }));
        society.addMarket('b', new Market({ stock: { grain: 2 } }));
        society.routes = new RouteNetwork([{ id: 'road', available: true, actualDanger: 88888 }]);
        society.routes.edges[0].available = false;
        society.tick({ actions: [{ kind: 'QUEUE_AWARE_CROSS_MARKET_TRANSFER', fromMarket: 'a', toMarket: 'b', routeId: 'road', quantity: 5 }] });
        expect(society.events.at(-1)).toMatchObject({ moved: 0, accessBlocked: true, routeId: 'road' });
        expect(society.markets.get('a').stock.grain).toBe(18);
        society.routes.edges[0].available = true;
        society.tick({ actions: [{ kind: 'QUEUE_AWARE_CROSS_MARKET_TRANSFER', fromMarket: 'a', toMarket: 'b', routeId: 'road', quantity: 5 }] });
        const event = society.events.at(-1);
        expect(event).toMatchObject({ moved: 5, accessBlocked: false });
        expect(JSON.stringify(event)).not.toContain('88888');
        expect(society.markets.get('a').balanceSheet().balanced).toBe(true);
        expect(society.markets.get('b').balanceSheet().balanced).toBe(true);
    });

    it('audits mutation resistance and exact persistence after route churn', () => {
        const society = new SocietyCore({ seed: 2861 });
        society.addMarket('a', new Market({ stock: { grain: 50 } }));
        society.addMarket('b', new Market({ stock: { grain: 0 } }));
        society.routes = new RouteNetwork([{ id: 'r', available: true }]);
        for (let i = 0; i < 40; i += 1) {
            society.routes.edges[0].available = i % 3 !== 0;
            society.tick({ actions: [{ kind: 'QUEUE_AWARE_CROSS_MARKET_TRANSFER', fromMarket: 'a', toMarket: 'b', routeId: 'r', quantity: 1 }] });
        }
        expect(society.markets.get('a').balanceSheet().balanced).toBe(true);
        expect(society.markets.get('b').balanceSheet().balanced).toBe(true);
        const snapshot = society.serialize();
        expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot))).serialize()).toEqual(snapshot);
        society.markets.get('a').stock.grain -= 1;
        expect(society.markets.get('a').balanceSheet().balanced).toBe(false);
    });
});
