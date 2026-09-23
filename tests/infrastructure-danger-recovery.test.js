import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('RESP-INFRASTRUCTURE-DANGER-RECOVERY-001', () => {
    it('reverses route risk after repair without saturating the decision', () => {
        const society = new SocietyCore();
        society.addInfrastructure('bridge', { condition: 1 });
        society.addRoamingGroup('g', { loot: 5 });
        society.addFaction('guard', { supplySecurity: 0 });
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: .6, traffic: 0 }]);
        society.infrastructure.get('bridge').condition = 0;
        society.tick({ actions: [{ kind: 'ROAMING_GROUP_SUPPLY_FEEDBACK', group: 'g', faction: 'guard', routeId: 'road', infrastructure: 'bridge', infrastructureRisk: .5, threshold: 1 }] });
        expect(society.events.at(-1)).toMatchObject({ selected: 'AVOID', perceivedDanger: 1.1 });
        society.infrastructure.get('bridge').condition = 1;
        society.tick({ actions: [{ kind: 'ROAMING_GROUP_SUPPLY_FEEDBACK', group: 'g', faction: 'guard', routeId: 'road', infrastructure: 'bridge', infrastructureRisk: .5, threshold: 1 }] });
        expect(society.events.at(-1)).toMatchObject({ selected: 'TRAVEL', perceivedDanger: .6 });
    });

    it('propagates recovered route access into a safe downstream encounter', () => {
        const society = new SocietyCore();
        society.addInfrastructure('bridge', { condition: 1 });
        society.addRoamingGroup('g', { loot: 4 });
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: .2 }]);
        society.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_RISK', group: 'g', routeId: 'road', infrastructure: 'bridge', threshold: 1 }] });
        expect(society.events.at(-1).outcome).toBe('SAFE_PASSAGE');
        expect(society.roamingGroups.get('g').loot).toBe(4);
    });

    it('persists recovery state and causal events', () => {
        const society = new SocietyCore();
        society.addInfrastructure('bridge', { condition: .5 });
        society.addRoamingGroup('g', {});
        society.addFaction('guard', { supplySecurity: 0 });
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: .2 }]);
        society.tick({ actions: [{ kind: 'ROAMING_GROUP_SUPPLY_FEEDBACK', group: 'g', faction: 'guard', routeId: 'road', infrastructure: 'bridge' }] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.serialize()).toEqual(society.serialize());
    });

    it('mutation control shows removing infrastructure risk changes the regime', () => {
        const society = new SocietyCore();
        society.addInfrastructure('bridge', { condition: 0 });
        society.addRoamingGroup('g', {});
        society.addFaction('guard', { supplySecurity: 0 });
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: .6 }]);
        society.tick({ actions: [{ kind: 'ROAMING_GROUP_SUPPLY_FEEDBACK', group: 'g', faction: 'guard', routeId: 'road', infrastructure: 'bridge', infrastructureRisk: 0, threshold: 1 }] });
        expect(society.events.at(-1).selected).toBe('TRAVEL');
    });
});
