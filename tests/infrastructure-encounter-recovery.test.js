import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('RESP-INFRASTRUCTURE-ENCOUNTER-RECOVERY-001', () => {
    it('reverses RAID to PASS after infrastructure recovery', () => {
        const society = new SocietyCore();
        society.addInfrastructure('bridge', { condition: 0 });
        society.addRoamingGroup('g', { loot: 10 });
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: .6 }]);
        society.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', group: 'g', routeId: 'road', infrastructure: 'bridge', infrastructureRisk: .5, riskThreshold: 1, lootLoss: 2 }] });
        expect(society.events.at(-1)).toMatchObject({ outcome: 'RAID', lootLoss: 2, loot: 8 });
        society.infrastructure.get('bridge').condition = 1;
        society.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', group: 'g', routeId: 'road', infrastructure: 'bridge', infrastructureRisk: .5, riskThreshold: 1, lootLoss: 2 }] });
        expect(society.events.at(-1)).toMatchObject({ outcome: 'PASS', lootLoss: 0, loot: 8 });
        expect(society.lootBalanceSheet(society.roamingGroups.get('g')).balanced).toBe(true);
    });

    it('preserves causal parents and exact persistence after recovery', () => {
        const society = new SocietyCore();
        society.addInfrastructure('bridge', { condition: .5 });
        society.addRoamingGroup('g', { loot: 3 });
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: .2 }]);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_WEAR', infrastructure: 'bridge', routeId: 'road', rate: .1 }, { kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', group: 'g', routeId: 'road', infrastructure: 'bridge', infrastructureRisk: .5 }] });
        expect(society.events.at(-1).parentId).toBe(society.events.at(-2).id);
        expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize()))).serialize()).toEqual(society.serialize());
    });

    it('mutation control proves zero infrastructure risk removes the degraded-route conflict', () => {
        const society = new SocietyCore();
        society.addInfrastructure('bridge', { condition: 0 });
        society.addRoamingGroup('g', { loot: 3 });
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: .6 }]);
        society.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', group: 'g', routeId: 'road', infrastructure: 'bridge', infrastructureRisk: 0, riskThreshold: 1, lootLoss: 2 }] });
        expect(society.events.at(-1)).toMatchObject({ outcome: 'PASS', lootLoss: 0, loot: 3 });
    });
});
