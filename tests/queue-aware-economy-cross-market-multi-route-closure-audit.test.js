import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-CROSS-MARKET-MULTI-ROUTE-CLOSURE-AUDIT-001', () => {
    function setup(seed = 2999) {
        const society = new SocietyCore({ seed });
        society.addMarket('a', new Market({ stock: { grain: 240 } }));
        society.addMarket('b', new Market({ stock: { grain: 0 } }));
        society.routes = new RouteNetwork([
            { id: 'fast', travelTime: 2, perceivedDanger: 0, available: true },
            { id: 'safe', travelTime: 5, perceivedDanger: 1, available: true },
            { id: 'detour', travelTime: 9, perceivedDanger: 0, available: true },
        ]);
        return society;
    }

    it('audits selection, fallback, blocking, locality, and exact accounting', () => {
        const society = setup();
        const first = society.transferQueueAwareEconomicSupply({ fromMarket: 'a', toMarket: 'b', routeIds: ['detour', 'safe', 'fast'], quantity: 11, actorId: 'merchant-a' });
        expect(first).toMatchObject({ moved: 11, routeId: 'fast', accessBlocked: false });
        society.routes.edges[0].available = false;
        const fallback = society.transferQueueAwareEconomicSupply({ fromMarket: 'a', toMarket: 'b', routeIds: ['fast', 'safe', 'detour'], quantity: 7, actorId: 'merchant-b' });
        expect(fallback).toMatchObject({ moved: 7, routeId: 'safe', accessBlocked: false });
        society.routes.edges.forEach(route => { route.available = false; });
        const blocked = society.transferQueueAwareEconomicSupply({ fromMarket: 'a', toMarket: 'b', routeIds: ['fast', 'safe', 'detour'], quantity: 13, actorId: 'merchant-c' });
        expect(blocked).toMatchObject({ moved: 0, accessBlocked: true });
        expect(society.markets.get('a').balanceSheet().balanced).toBe(true);
        expect(society.markets.get('b').balanceSheet().balanced).toBe(true);
        expect(society.markets.get('a').stock.grain).toBe(222);
        expect(society.markets.get('b').stock.grain).toBe(18);
    });

    it('keeps selected-route provenance actor-local and hidden danger-free', () => {
        const society = setup();
        society.actors.set('one', { id: 'one', beliefs: new Map() });
        society.actors.set('two', { id: 'two', beliefs: new Map() });
        society.tick({ actions: [{ kind: 'QUEUE_AWARE_CROSS_MARKET_TRANSFER', fromMarket: 'a', toMarket: 'b', routeIds: ['safe', 'fast'], actorId: 'one', quantity: 3 }] });
        const event = society.events.at(-1);
        expect(event.actorId).toBe('one');
        expect(event.routeId).toBe('fast');
        expect(JSON.stringify(event)).not.toContain('perceivedDanger');
        expect(society.actors.get('one').beliefs).not.toBe(society.actors.get('two').beliefs);
    });

    it('round-trips multi-route state and rejects invalid route references without mutation', () => {
        const society = setup();
        const before = society.markets.get('a').stock.grain;
        expect(() => society.transferQueueAwareEconomicSupply({ fromMarket: 'a', toMarket: 'b', routeIds: ['missing'], quantity: 4 })).not.toThrow();
        expect(society.markets.get('a').stock.grain).toBe(before);
        society.transferQueueAwareEconomicSupply({ fromMarket: 'a', toMarket: 'b', routeIds: ['fast', 'safe'], quantity: 4 });
        const snapshot = society.serialize();
        expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot))).serialize()).toEqual(snapshot);
    });
});
