import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('RESP-INFRASTRUCTURE-DANGER-ENCOUNTER-001', () => {
    const setup = condition => {
        const society = new SocietyCore();
        society.addInfrastructure('bridge', { condition });
        society.addRoamingGroup('g', { loot: 5 });
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: .6, actualDanger: 999 }]);
        return society;
    };

    it('turns degraded infrastructure into an explicit raid and loot loss', () => {
        const society = setup(0);
        society.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', group: 'g', routeId: 'road', infrastructure: 'bridge', infrastructureRisk: .5, riskThreshold: 1, lootLoss: 2 }] });
        const event = society.events.at(-1);
        expect(event).toMatchObject({ outcome: 'RAID', perceivedDanger: 1.1, infrastructureDanger: .5, lootLoss: 2, loot: 3 });
        expect(event.lootBalance.balanced).toBe(true);
        expect(event).not.toHaveProperty('actualDanger');
    });

    it('repaired infrastructure produces safe passage without loot loss', () => {
        const society = setup(1);
        society.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', group: 'g', routeId: 'road', infrastructure: 'bridge', infrastructureRisk: .5, riskThreshold: 1, lootLoss: 2 }] });
        expect(society.events.at(-1)).toMatchObject({ outcome: 'PASS', lootLoss: 0, loot: 5 });
    });

    it('parents encounter consequences to the latest infrastructure event and persists them', () => {
        const society = setup(0);
        society.tick({ actions: [{ kind: 'INFRASTRUCTURE_WEAR', infrastructure: 'bridge', routeId: 'road', rate: 1 }, { kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', group: 'g', routeId: 'road', infrastructure: 'bridge', infrastructureRisk: .5, riskThreshold: 1 }] });
        const wear = society.events.find(event => event.type === 'INFRASTRUCTURE_WEAR');
        expect(society.events.at(-1).parentId).toBe(wear.id);
        expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize()))).serialize()).toEqual(society.serialize());
    });

    it('mutation control shows removing infrastructure risk prevents the raid', () => {
        const society = setup(0);
        society.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', group: 'g', routeId: 'road', infrastructure: 'bridge', infrastructureRisk: 0, riskThreshold: 1 }] });
        expect(society.events.at(-1)).toMatchObject({ outcome: 'PASS', lootLoss: 0 });
    });
});
