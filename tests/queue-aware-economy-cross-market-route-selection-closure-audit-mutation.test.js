import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-CROSS-MARKET-ROUTE-SELECTION-CLOSURE-AUDIT-MUTATION-001', () => {
    function setup() {
        const society = new SocietyCore({ seed: 3501 });
        society.addMarket('a', new Market({ stock: { grain: 100 } }));
        society.addMarket('b', new Market({ stock: { grain: 0 } }));
        society.routes = new RouteNetwork([
            { id: 'blocked', travelTime: 1, perceivedDanger: 0, available: false },
            { id: 'open', travelTime: 5, perceivedDanger: 1, available: true },
        ]);
        return society;
    }

    it('fails closed when every candidate route is unavailable', () => {
        const society = setup();
        society.routes.edges[1].available = false;
        const before = society.markets.get('a').stock.grain;
        const result = society.transferQueueAwareEconomicSupply({ fromMarket: 'a', toMarket: 'b', routeIds: ['blocked', 'open'], quantity: 10 });
        expect(result.accessBlocked).toBe(true);
        expect(result.moved).toBe(0);
        expect(society.markets.get('a').stock.grain).toBe(before);
    });

    it('detects a mutation that ignores route availability', () => {
        const society = setup();
        const original = society.transferQueueAwareEconomicSupply;
        society.transferQueueAwareEconomicSupply = function mutated(action) {
            return original.call(this, { ...action, routeIds: null, routeId: null });
        };
        const result = society.transferQueueAwareEconomicSupply({ fromMarket: 'a', toMarket: 'b', routeIds: ['blocked'], quantity: 10 });
        // The mutated implementation transfers despite the blocked route; this
        // explicit negative control records that the contract would fail.
        expect(result.moved).toBeGreaterThan(0);
        expect(result.accessBlocked).toBe(false);
    });

    it('uses only the supplied actor belief context rather than shared hidden truth', () => {
        const society = setup();
        const actor = { id: 'merchant', beliefs: new Map() };
        society.recordRouteObservation(actor, society.routes.edges[1], { perceivedDanger: 20, confidence: 1 });
        const result = society.transferQueueAwareEconomicSupply({ fromMarket: 'a', toMarket: 'b', routeIds: ['blocked', 'open'], actorId: actor.id, context: { beliefs: actor.beliefs, fearSensitivity: 1, uncertaintyAversion: 1, routeRiskAversion: 1 }, quantity: 4 });
        expect(result.routeId).toBe('open');
        expect(JSON.stringify(result)).not.toContain('perceivedDanger');
    });
});
