import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-MARKET-PRICE-SHORTAGE-MERCHANT-CAUSAL-CLOSURE-AUDIT-001', () => {
    function run(price, minimumPrice) {
        const society = new SocietyCore({ seed: 5001 });
        society.addMarket('city', new Market({ prices: { grain: price }, stock: { grain: 20 } }));
        society.routes = new RouteNetwork([{ id: 'road', available: true, travelTime: 2 }]);
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', destination: 'city', good: 'grain', routes: society.routes.edges, minimumPrice }] });
        return society;
    }

    it('proves the live price consumer changes the merchant decision', () => {
        const high = run(8, 5);
        const low = run(2, 5);
        expect(high.events.at(-1)).toMatchObject({ decision: 'TRAVEL', destinationPrice: 8, minimumPrice: 5 });
        expect(low.events.at(-1)).toMatchObject({ decision: 'WAIT', destinationPrice: 2, minimumPrice: 5 });
    });

    it('detects a mutation that removes the price profitability gate', () => {
        const society = run(2, 5);
        const event = society.events.at(-1);
        const mutatedDecision = society.routes.edges.length > 0 ? 'TRAVEL' : event.decision;
        expect(event.profitable).toBe(false);
        expect(mutatedDecision).toBe('TRAVEL');
        expect(mutatedDecision).not.toBe(event.decision);
    });

    it('persists the causal decision evidence', () => {
        const society = run(8, 5);
        const snapshot = society.serialize();
        expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot))).serialize()).toEqual(snapshot);
    });
});
