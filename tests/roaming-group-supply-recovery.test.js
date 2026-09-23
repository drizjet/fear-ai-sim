import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('roaming group supply security recovery', () => {
  it('reverses route avoidance after security recovers', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('g', {});
    society.addFaction('guard', { supplySecurity: 0 });
    society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 1.5 }]);
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_SUPPLY_FEEDBACK', group: 'g', faction: 'guard', routeId: 'road', threshold: 1 }] });
    expect(society.events.at(-1).selected).toBe('AVOID');
    society.factions.get('guard').state.supplySecurity = 1;
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_SUPPLY_FEEDBACK', group: 'g', faction: 'guard', routeId: 'road', threshold: 1, groupSize: 2 }] });
    expect(society.events.at(-1)).toMatchObject({ selected: 'TRAVEL', perceivedDanger: .75, traffic: 2 });
    expect(society.events.at(-1).parentId).toBe(society.events.at(-2).id);
  });

  it('preserves the recovered regime across save/load', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('g', {});
    society.addFaction('guard', { supplySecurity: 1 });
    society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: .5 }]);
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_SUPPLY_FEEDBACK', group: 'g', faction: 'guard', routeId: 'road' }] });
    const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
    expect(restored.serialize()).toEqual(society.serialize());
  });
});
