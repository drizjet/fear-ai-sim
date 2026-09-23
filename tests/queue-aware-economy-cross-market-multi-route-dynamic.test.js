import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-CROSS-MARKET-MULTI-ROUTE-DYNAMIC-001', () => {
    it('keeps route selection deterministic under traffic and route churn', () => {
        for (const seed of [2881, 2891, 2901]) {
            const society = new SocietyCore({ seed });
            society.addMarket('a', new Market({ stock: { grain: 500 } }));
            society.addMarket('b', new Market({ stock: { grain: 0 } }));
            society.routes = new RouteNetwork([
                { id: 'fast', travelTime: 2, perceivedDanger: 0, available: true, predictabilityWeight: .1 },
                { id: 'safe', travelTime: 5, perceivedDanger: 1, available: true, predictabilityWeight: .1 },
                { id: 'detour', travelTime: 9, perceivedDanger: 0, available: true, predictabilityWeight: .1 },
            ]);
            for (let i = 0; i < 240; i += 1) {
                society.routes.edges[0].available = i % 4 !== 0;
                society.routes.edges[1].available = i % 7 !== 0;
                const result = society.transferQueueAwareEconomicSupply({ fromMarket: 'a', toMarket: 'b', routeIds: ['fast', 'safe', 'detour'], quantity: (i % 5) + 1, context: { fearSensitivity: i % 3 } });
                expect(result.routeIds).toEqual(['fast', 'safe', 'detour']);
                expect(result.moved).toBeGreaterThanOrEqual(0);
                expect(result.accessBlocked).toBe(!['fast', 'safe', 'detour'].some(id => society.routes.edges.find(route => route.id === id).available));
                society.routes.decayTraffic(.02);
            }
            expect(society.markets.get('a').balanceSheet().balanced).toBe(true);
            expect(society.markets.get('b').balanceSheet().balanced).toBe(true);
            expect(society.events).toHaveLength(0);
        }
    });

    it('preserves actor-local beliefs when route candidates are shared', () => {
        const society = new SocietyCore({ seed: 2911 });
        society.addMarket('a', new Market({ stock: { grain: 20 } }));
        society.addMarket('b', new Market({ stock: { grain: 0 } }));
        society.routes = new RouteNetwork([{ id: 'road', travelTime: 2, perceivedDanger: 0, available: true }]);
        const cautious = { id: 'cautious', beliefs: new Map() };
        const confident = { id: 'confident', beliefs: new Map() };
        society.actors.set(cautious.id, cautious);
        society.actors.set(confident.id, confident);
        const first = society.transferQueueAwareEconomicSupply({ fromMarket: 'a', toMarket: 'b', routeId: 'road', actorId: cautious.id, quantity: 3 });
        const second = society.transferQueueAwareEconomicSupply({ fromMarket: 'a', toMarket: 'b', routeId: 'road', actorId: confident.id, quantity: 3 });
        expect(first.actorId).toBe(cautious.id);
        expect(second.actorId).toBe(confident.id);
        expect(cautious.beliefs).not.toBe(confident.beliefs);
    });
});
