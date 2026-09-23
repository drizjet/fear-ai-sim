import { describe, expect, it } from '@jest/globals';
import { Market, RouteNetwork, SocietyCore } from '../societycore.js';

describe('RESP-SETTLEMENT-RESOURCE-CAP-001', () => {
    const setup = resourceCapacity => {
        const society = new SocietyCore();
        society.addSettlement('town', { resources: 4, resourceCapacity, recoveryBudget: 0 });
        society.addMarket('south', new Market({ prices: { grain: 9 } }));
        society.routes = new RouteNetwork([{ id: 'road', travelTime: 2 }]);
        return society;
    };

    it('caps successful market resource gains and records overflow', () => {
        const society = setup(5);
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', settlement: 'town', destination: 'south', good: 'grain', routes: society.routes.edges, routeId: 'road', resourceGain: 4 }] });
        expect(society.settlements.get('town')).toMatchObject({ resources: 5, resourceCapacity: 5, resourceOverflow: 3 });
        expect(society.events.at(-1)).toMatchObject({ requestedResourceGain: 4, resourceGain: 1, resourceOverflow: 3 });
    });

    it('does not let blocked access bypass the cap or create resources', () => {
        const society = setup(5);
        society.routes.edges[0].available = false;
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', settlement: 'town', destination: 'south', good: 'grain', routes: society.routes.edges, routeId: 'road', resourceGain: 100 }] });
        expect(society.settlements.get('town')).toMatchObject({ resources: 4, resourceOverflow: 0 });
    });

    it('persists capacity and overflow through a fresh deserialize', () => {
        const society = setup(5);
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', settlement: 'town', destination: 'south', good: 'grain', routes: society.routes.edges, routeId: 'road', resourceGain: 4 }] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.serialize()).toEqual(society.serialize());
    });

    it('mutation control with zero capacity records all gains as overflow', () => {
        const society = setup(0);
        society.settlements.get('town').resources = 0;
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', settlement: 'town', destination: 'south', good: 'grain', routes: society.routes.edges, routeId: 'road', resourceGain: 7 }] });
        expect(society.settlements.get('town')).toMatchObject({ resources: 0, resourceOverflow: 7 });
    });
});
