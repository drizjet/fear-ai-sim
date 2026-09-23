import { describe, expect, it } from '@jest/globals';
import { Market, RouteNetwork, SocietyCore } from '../societycore.js';

describe('RESP-SETTLEMENT-ADAPTATION-MARKET-FEEDBACK-001', () => {
    const setup = () => {
        const society = new SocietyCore();
        society.addSettlement('town', { recoveryBudget: 10 });
        society.addInfrastructure('bridge', { condition: 0 });
        society.addMarket('south', new Market({ prices: { grain: 9 } }));
        society.routes = new RouteNetwork([{ id: 'road', travelTime: 2, available: false }]);
        return society;
    };

    it('blocks market travel while access infrastructure is failed', () => {
        const society = setup();
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', destination: 'south', good: 'grain', routes: society.routes.edges, infrastructure: 'bridge', routeId: 'road' }] });
        expect(society.events.at(-1)).toMatchObject({ decision: 'WAIT', accessBlocked: true, selectedRoute: null });
    });

    it('restores market travel after causal adaptation repair', () => {
        const society = setup();
        society.tick({ actions: [{ kind: 'SETTLEMENT_ADAPTATION', settlement: 'town', infrastructure: 'bridge', market: 'south', routeId: 'road', investment: 10 }] });
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', destination: 'south', good: 'grain', routes: society.routes.edges, infrastructure: 'bridge', routeId: 'road' }] });
        const adaptation = society.events.find(event => event.type === 'SETTLEMENT_ADAPTATION');
        const decision = society.events.at(-1);
        expect(decision).toMatchObject({ decision: 'TRAVEL', accessBlocked: false, selectedRoute: 'road' });
        expect(decision.parentId).toBe(adaptation.id);
    });

    it('persists access state and preserves hidden-truth neutrality', () => {
        const society = setup();
        society.routes.edges[0].actualDanger = 999;
        society.tick({ actions: [{ kind: 'SETTLEMENT_ADAPTATION', settlement: 'town', infrastructure: 'bridge', market: 'south', routeId: 'road', investment: 10 }] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.serialize()).toEqual(society.serialize());
        restored.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', destination: 'south', good: 'grain', routes: restored.routes.edges, infrastructure: 'bridge', routeId: 'road' }] });
        expect(restored.events.at(-1).decision).toBe('TRAVEL');
    });

    it('mutation control shows failed access still blocks travel', () => {
        const society = setup();
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', destination: 'south', good: 'grain', routes: society.routes.edges, infrastructure: 'bridge', routeId: 'road' }] });
        expect(society.events.at(-1).selectedRoute).toBeNull();
        expect(society.events.at(-1).accessBlocked).toBe(true);
    });
});
