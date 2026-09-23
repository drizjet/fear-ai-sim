import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('RESP-INFRASTRUCTURE-WEAR-RECOVERY-COUPLING-001', () => {
    it('traffic decay reduces future wear pressure', () => {
        const society = new SocietyCore();
        society.addInfrastructure('bridge', { condition: 1 });
        society.routes = new RouteNetwork([{ id: 'road', traffic: 100, trafficCapacity: 100 }]);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_WEAR', infrastructure: 'bridge', routeId: 'road', rate: .002 }] });
        const firstWear = society.events.at(-1).wear;
        society.tick({ actions: [{ kind: 'ROUTE_TRAFFIC_DECAY', rate: .5 }, { kind: 'INFRASTRUCTURE_WEAR', infrastructure: 'bridge', routeId: 'road', rate: .002 }] });
        const secondWear = society.events.at(-1).wear;
        expect(secondWear).toBeLessThan(firstWear);
        expect(society.events.at(-1).parentId).toBe(society.events.at(-2).id);
    });

    it('maintenance sustains a route after a traffic shock', () => {
        const society = new SocietyCore();
        society.addSettlement('town', { recoveryBudget: 10 });
        society.addInfrastructure('bridge', { condition: 1 });
        society.routes = new RouteNetwork([{ id: 'road', traffic: 100, trafficCapacity: 100 }]);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_WEAR', infrastructure: 'bridge', routeId: 'road', rate: .005 }] });
        society.tick({ actions: [{ kind: 'SETTLEMENT_INFRASTRUCTURE_MAINTENANCE', settlement: 'town', infrastructure: 'bridge', routeId: 'road', amount: 10, effect: .05 }] });
        expect(society.infrastructure.get('bridge').condition).toBe(1);
        expect(society.routes.edges[0].available).toBe(true);
    });

    it('keeps coupling state persistent and bounded', () => {
        const society = new SocietyCore();
        society.addSettlement('town', { recoveryBudget: 4 });
        society.addInfrastructure('bridge', { condition: .5 });
        society.routes = new RouteNetwork([{ id: 'road', traffic: 50, trafficCapacity: 100 }]);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_WEAR', infrastructure: 'bridge', routeId: 'road', rate: .001 }] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.serialize()).toEqual(society.serialize());
        expect(restored.infrastructure.get('bridge').condition).toBeGreaterThanOrEqual(0);
        expect(restored.infrastructure.get('bridge').condition).toBeLessThanOrEqual(1);
    });

    it('mutation control proves zero traffic cannot trigger wear', () => {
        const society = new SocietyCore();
        society.addInfrastructure('bridge', { condition: .7 });
        society.routes = new RouteNetwork([{ id: 'road', traffic: 0 }]);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_WEAR', infrastructure: 'bridge', routeId: 'road', rate: 1 }] });
        expect(society.events.at(-1).wear).toBe(0);
        expect(society.infrastructure.get('bridge').condition).toBe(.7);
    });
});
