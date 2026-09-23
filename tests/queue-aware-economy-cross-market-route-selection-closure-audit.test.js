import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-CROSS-MARKET-ROUTE-SELECTION-CLOSURE-AUDIT-001', () => {
    function setup() {
        const society = new SocietyCore({ seed: 3301 });
        society.addMarket('a', new Market({ stock: { grain: 300 } }));
        society.addMarket('b', new Market({ stock: { grain: 0 } }));
        society.routes = new RouteNetwork([
            { id: 'fast', travelTime: 2, perceivedDanger: 0, available: true },
            { id: 'safe', travelTime: 5, perceivedDanger: 1, available: true },
            { id: 'detour', travelTime: 9, perceivedDanger: 0, available: true },
        ]);
        return society;
    }

    it('rejects blocked and invalid access without mutating markets', () => {
        const society = setup();
        const before = society.markets.get('a').stock.grain;
        society.routes.edges.forEach(route => { route.available = false; });
        expect(society.transferQueueAwareEconomicSupply({ fromMarket: 'a', toMarket: 'b', routeIds: ['fast', 'safe'], quantity: 10 }).moved).toBe(0);
        expect(society.markets.get('a').stock.grain).toBe(before);
        expect(society.transferQueueAwareEconomicSupply({ fromMarket: 'a', toMarket: 'b', routeIds: ['missing'], quantity: 10 }).moved).toBe(0);
        expect(society.markets.get('a').stock.grain).toBe(before);
    });

    it('preserves route locality, hidden-risk isolation, persistence, and conservation', () => {
        const society = setup();
        const actor = { id: 'merchant', beliefs: new Map() };
        society.actors.set(actor.id, actor);
        society.tick({ actions: [{ kind: 'QUEUE_AWARE_CROSS_MARKET_TRANSFER', fromMarket: 'a', toMarket: 'b', routeIds: ['safe', 'fast'], actorId: actor.id, quantity: 12 }] });
        const event = society.events.at(-1);
        expect(event.routeId).toBe('fast');
        expect(event.actorId).toBe(actor.id);
        expect(JSON.stringify(event)).not.toContain('perceivedDanger');
        expect(society.markets.get('a').balanceSheet().balanced).toBe(true);
        expect(society.markets.get('b').balanceSheet().balanced).toBe(true);
        const snapshot = society.serialize();
        expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot))).serialize()).toEqual(snapshot);
    });

    it('keeps deterministic choice stable for equal-cost candidates', () => {
        const society = setup();
        society.routes.edges[1].perceivedDanger = 0;
        const selected = Array.from({ length: 20 }, () => society.transferQueueAwareEconomicSupply({ fromMarket: 'a', toMarket: 'b', routeIds: ['fast', 'safe'], quantity: 1 }).routeId);
        expect(new Set(selected)).toEqual(new Set(['fast']));
    });
});
