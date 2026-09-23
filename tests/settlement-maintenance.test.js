import { describe, expect, it } from '@jest/globals';
import { SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-SETTLEMENT-RESOURCE-MAINTENANCE-001', () => {
    const setup = budget => {
        const society = new SocietyCore();
        society.addSettlement('town', { recoveryBudget: budget });
        society.addInfrastructure('bridge', { condition: 0 });
        society.routes = new RouteNetwork([{ id: 'road', available: false }]);
        return society;
    };

    it('spends recovery budget to restore infrastructure and route access', () => {
        const society = setup(10);
        society.tick({ actions: [{ kind: 'SETTLEMENT_INFRASTRUCTURE_MAINTENANCE', settlement: 'town', infrastructure: 'bridge', routeId: 'road', amount: 10, effect: .05 }] });
        expect(society.infrastructure.get('bridge').condition).toBe(.5);
        expect(society.routes.edges[0].available).toBe(true);
        expect(society.settlements.get('town').recoveryBudget).toBe(0);
        expect(society.events.at(-1).parentId).toBe(society.events[0].id);
    });

    it('spends only available budget and never exceeds condition bounds', () => {
        const society = setup(2);
        society.tick({ actions: [{ kind: 'SETTLEMENT_INFRASTRUCTURE_MAINTENANCE', settlement: 'town', infrastructure: 'bridge', routeId: 'road', amount: 10, effect: 1 }] });
        expect(society.infrastructure.get('bridge').condition).toBe(1);
        expect(society.settlements.get('town').recoveryBudget).toBe(0);
        expect(society.events.at(-1).spent).toBe(2);
    });

    it('persists maintenance state across a fresh runtime', () => {
        const society = setup(4);
        society.tick({ actions: [{ kind: 'SETTLEMENT_INFRASTRUCTURE_MAINTENANCE', settlement: 'town', infrastructure: 'bridge', routeId: 'road', amount: 4 }] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.serialize()).toEqual(society.serialize());
    });

    it('mutation control proves zero budget cannot repair infrastructure', () => {
        const society = setup(0);
        society.tick({ actions: [{ kind: 'SETTLEMENT_INFRASTRUCTURE_MAINTENANCE', settlement: 'town', infrastructure: 'bridge', routeId: 'road', amount: 100 }] });
        expect(society.infrastructure.get('bridge').condition).toBe(0);
        expect(society.routes.edges[0].available).toBe(false);
        expect(society.events.at(-1).spent).toBe(0);
    });
});
