import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-CROSS-MARKET-ROUTE-SELECTION-FAIRNESS-001', () => {
    it('keeps repeated route selection bounded and deterministic under equal costs', () => {
        const build = () => {
            const society = new SocietyCore({ seed: 3101 });
            society.addMarket('a', new Market({ stock: { grain: 500 } }));
            society.addMarket('b', new Market({ stock: { grain: 0 } }));
            society.routes = new RouteNetwork([
                { id: 'alpha', travelTime: 3, perceivedDanger: 0, available: true, predictabilityWeight: 0 },
                { id: 'beta', travelTime: 3, perceivedDanger: 0, available: true, predictabilityWeight: 0 },
            ]);
            return society;
        };
        const first = build();
        const second = build();
        const selected = [];
        for (let i = 0; i < 80; i += 1) {
            const action = { fromMarket: 'a', toMarket: 'b', routeIds: ['alpha', 'beta'], quantity: 1 };
            selected.push(first.transferQueueAwareEconomicSupply(action).routeId);
            expect(second.transferQueueAwareEconomicSupply(action).routeId).toBe(selected.at(-1));
        }
        expect(new Set(selected)).toEqual(new Set(['alpha']));
        expect(first.markets.get('a').balanceSheet().balanced).toBe(true);
        expect(first.markets.get('b').balanceSheet().balanced).toBe(true);
    });

    it('does not leak one actor’s route beliefs into another actor’s selection', () => {
        const society = new SocietyCore({ seed: 3111 });
        society.addMarket('a', new Market({ stock: { grain: 20 } }));
        society.addMarket('b', new Market({ stock: { grain: 0 } }));
        society.routes = new RouteNetwork([
            { id: 'risky', travelTime: 2, perceivedDanger: 0, available: true },
            { id: 'safe', travelTime: 5, perceivedDanger: 0, available: true },
        ]);
        const actor = { id: 'cautious', beliefs: new Map() };
        society.recordRouteObservation(actor, society.routes.edges[0], { perceivedDanger: 20, confidence: 1 });
        const result = society.transferQueueAwareEconomicSupply({ fromMarket: 'a', toMarket: 'b', routeIds: ['risky', 'safe'], actorId: actor.id, context: { beliefs: actor.beliefs, fearSensitivity: 1 } });
        expect(result.routeId).toBe('safe');
        expect(JSON.stringify(result)).not.toContain('perceivedDanger');
    });
});
