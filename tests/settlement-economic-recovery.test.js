import { describe, expect, it } from '@jest/globals';
import { Market, RouteNetwork, SocietyCore } from '../societycore.js';

describe('RESP-SETTLEMENT-ADAPTATION-ECONOMIC-RECOVERY-001', () => {
    const setup = () => {
        const society = new SocietyCore();
        society.addSettlement('town', { resources: 0, recoveryBudget: 2 });
        society.addInfrastructure('bridge', { condition: 1 });
        society.addMarket('south', new Market({ prices: { grain: 9 } }));
        society.routes = new RouteNetwork([{ id: 'road', travelTime: 2 }]);
        return society;
    };

    it('turns successful accessible trade into settlement resources', () => {
        const society = setup();
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', settlement: 'town', destination: 'south', good: 'grain', routes: society.routes.edges, infrastructure: 'bridge', routeId: 'road', resourceGain: 3 }] });
        expect(society.settlements.get('town').resources).toBe(3);
        expect(society.events.at(-1)).toMatchObject({ decision: 'TRAVEL', resourceGain: 3, settlementResources: 3 });
    });

    it('does not reward blocked or unprofitable access', () => {
        const society = setup();
        society.routes.edges[0].available = false;
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', settlement: 'town', destination: 'south', good: 'grain', minimumPrice: 10, routes: society.routes.edges, infrastructure: 'bridge', routeId: 'road', resourceGain: 9 }] });
        expect(society.settlements.get('town').resources).toBe(0);
        expect(society.events.at(-1).resourceGain).toBe(0);
    });

    it('persists resources and causal market feedback', () => {
        const society = setup();
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', settlement: 'town', destination: 'south', good: 'grain', routes: society.routes.edges, infrastructure: 'bridge', routeId: 'road' }] });
        const decision = society.events.at(-1);
        expect(decision.parentId).toBe(society.events[0].id);
        expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize()))).serialize()).toEqual(society.serialize());
    });

    it('mutation control confirms blocked access cannot create resources', () => {
        const society = setup();
        society.infrastructure.get('bridge').condition = 0;
        society.routes.edges[0].available = false;
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', settlement: 'town', destination: 'south', good: 'grain', routes: society.routes.edges, infrastructure: 'bridge', routeId: 'road', resourceGain: 100 }] });
        expect(society.settlements.get('town').resources).toBe(0);
    });
});
