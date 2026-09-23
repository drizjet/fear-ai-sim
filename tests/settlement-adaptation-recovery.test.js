import { describe, expect, it } from '@jest/globals';
import { Market, RouteNetwork, SocietyCore } from '../societycore.js';

describe('RESP-SETTLEMENT-ADAPTATION-RECOVERY-001', () => {
    it('reverses repeated route failure through funded settlement adaptation', () => {
        const society = new SocietyCore();
        society.addSettlement('town', { recoveryBudget: 20 });
        society.addInfrastructure('bridge', { condition: 1 });
        society.addMarket('town-market', new Market({ prices: { grain: 2 }, stock: { grain: 10 } }));
        society.addRoamingGroup('g', {});
        society.addFaction('guard', { supplySecurity: 1 });
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);

        society.tick({ actions: [
            { kind: 'INFRASTRUCTURE_UPDATE', infrastructure: 'bridge', routeId: 'road', condition: 0 },
            { kind: 'ROAMING_GROUP_SUPPLY_FEEDBACK', group: 'g', faction: 'guard', routeId: 'road' },
        ] });
        expect(society.events.at(-1).selected).toBe('AVOID');

        society.tick({ actions: [{ kind: 'SETTLEMENT_ADAPTATION', settlement: 'town', infrastructure: 'bridge', market: 'town-market', routeId: 'road', investment: 10 }] });
        expect(society.infrastructure.get('bridge').condition).toBe(.5);
        expect(society.routes.edges[0].available).toBe(true);

        society.tick({ actions: [{ kind: 'ROAMING_GROUP_SUPPLY_FEEDBACK', group: 'g', faction: 'guard', routeId: 'road' }] });
        expect(society.events.at(-1).selected).toBe('TRAVEL');

        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_UPDATE', infrastructure: 'bridge', routeId: 'road', condition: 0 }] });
        society.tick({ actions: [{ kind: 'SETTLEMENT_ADAPTATION', settlement: 'town', infrastructure: 'bridge', market: 'town-market', routeId: 'road', investment: 10 }] });
        expect(society.infrastructure.get('bridge').condition).toBe(0.5);
        expect(society.routes.edges[0].available).toBe(true);
        expect(society.settlements.get('town').recoveryBudget).toBe(0);
    });

    it('keeps recovery bounded and exactly persistent across a fresh runtime', () => {
        const society = new SocietyCore();
        society.addSettlement('town', { recoveryBudget: 8 });
        society.addInfrastructure('bridge', { condition: 0 });
        society.addMarket('m', new Market({ prices: { grain: 8 }, stock: { grain: 0 } }));
        society.routes = new RouteNetwork([{ id: 'road', available: false }]);
        society.tick({ actions: [{ kind: 'SETTLEMENT_ADAPTATION', settlement: 'town', infrastructure: 'bridge', market: 'm', routeId: 'road', investment: 4 }] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.serialize()).toEqual(society.serialize());
        expect(restored.infrastructure.get('bridge').condition).toBe(.2);
        expect(restored.settlements.get('town').adaptation).toBe(.2);
        expect(restored.routes.edges[0].available).toBe(true);
    });

    it('mutation control shows no recovery without budgeted investment', () => {
        const society = new SocietyCore();
        society.addSettlement('town', { recoveryBudget: 0 });
        society.addInfrastructure('bridge', { condition: 0 });
        society.addMarket('m', new Market({ prices: { grain: 8 }, stock: { grain: 0 } }));
        society.routes = new RouteNetwork([{ id: 'road', available: false }]);
        society.tick({ actions: [{ kind: 'SETTLEMENT_ADAPTATION', settlement: 'town', infrastructure: 'bridge', market: 'm', routeId: 'road', investment: 10 }] });
        expect(society.infrastructure.get('bridge').condition).toBe(0);
        expect(society.routes.edges[0].available).toBe(false);
        expect(society.events.at(-1).investment).toBe(0);
    });
});
