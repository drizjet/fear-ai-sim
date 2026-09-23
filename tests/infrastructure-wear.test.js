import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('RESP-INFRASTRUCTURE-WEAR-001', () => {
    const setup = () => {
        const society = new SocietyCore();
        society.addSettlement('town', { recoveryBudget: 10 });
        society.addInfrastructure('bridge', { condition: 1 });
        society.routes = new RouteNetwork([{ id: 'road', traffic: 100, trafficCapacity: 100 }]);
        return society;
    };

    it('converts route traffic into bounded infrastructure wear', () => {
        const society = setup();
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_WEAR', infrastructure: 'bridge', routeId: 'road', rate: .01 }] });
        expect(society.infrastructure.get('bridge').condition).toBe(0);
        expect(society.routes.edges[0].available).toBe(false);
        expect(society.events.at(-1)).toMatchObject({ type: 'INFRASTRUCTURE_WEAR', traffic: 100, wear: 1, conditionAfter: 0 });
    });

    it('maintenance reverses traffic wear and restores access', () => {
        const society = setup();
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_WEAR', infrastructure: 'bridge', routeId: 'road', rate: .005 }] });
        society.tick({ actions: [{ kind: 'SETTLEMENT_INFRASTRUCTURE_MAINTENANCE', settlement: 'town', infrastructure: 'bridge', routeId: 'road', amount: 10, effect: .05 }] });
        expect(society.infrastructure.get('bridge').condition).toBe(1);
        expect(society.routes.edges[0].available).toBe(true);
        expect(society.events.at(-1).parentId).toBe(society.events.at(-2).id);
    });

    it('persists wear and recovery through fresh deserialize', () => {
        const society = setup();
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_WEAR', infrastructure: 'bridge', routeId: 'road', rate: .002 }] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.serialize()).toEqual(society.serialize());
    });

    it('mutation control shows zero traffic causes no wear', () => {
        const society = setup();
        society.routes.edges[0].traffic = 0;
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_WEAR', infrastructure: 'bridge', routeId: 'road', rate: 1 }] });
        expect(society.infrastructure.get('bridge').condition).toBe(1);
        expect(society.events.at(-1).wear).toBe(0);
    });
});
