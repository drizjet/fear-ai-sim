import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('RESP-INFRASTRUCTURE-DANGER-FEEDBACK-001', () => {
    const setup = condition => {
        const society = new SocietyCore();
        society.addInfrastructure('bridge', { condition });
        society.addRoamingGroup('g', { loot: 5 });
        society.addFaction('guard', { supplySecurity: 0 });
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: .6, actualDanger: 999 }]);
        return society;
    };

    it('degraded infrastructure increases legal perceived danger and causes avoidance', () => {
        const society = setup(0);
        society.tick({ actions: [{ kind: 'ROAMING_GROUP_SUPPLY_FEEDBACK', group: 'g', faction: 'guard', routeId: 'road', threshold: 1, infrastructure: 'bridge', infrastructureRisk: .5 }] });
        expect(society.events.at(-1)).toMatchObject({ selected: 'AVOID', perceivedDanger: 1.1 });
        expect(society.events.at(-1)).not.toHaveProperty('actualDanger');
    });

    it('repaired infrastructure reduces danger and permits travel', () => {
        const society = setup(1);
        society.tick({ actions: [{ kind: 'ROAMING_GROUP_SUPPLY_FEEDBACK', group: 'g', faction: 'guard', routeId: 'road', threshold: 1, infrastructureRisk: .5 }] });
        expect(society.events.at(-1)).toMatchObject({ selected: 'TRAVEL', perceivedDanger: .6 });
    });

    it('persists condition and feedback behavior across save/load', () => {
        const society = setup(.5);
        society.tick({ actions: [{ kind: 'ROAMING_GROUP_SUPPLY_FEEDBACK', group: 'g', faction: 'guard', routeId: 'road', infrastructureRisk: .5 }] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.serialize()).toEqual(society.serialize());
    });

    it('mutation control proves removing infrastructure degradation changes the regime', () => {
        const society = setup(0);
        society.tick({ actions: [{ kind: 'ROAMING_GROUP_SUPPLY_FEEDBACK', group: 'g', faction: 'guard', routeId: 'road', threshold: 1, infrastructureRisk: 0 }] });
        expect(society.events.at(-1).selected).toBe('TRAVEL');
    });
});
