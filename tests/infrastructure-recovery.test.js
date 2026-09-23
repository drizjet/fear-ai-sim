import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('infrastructure recovery', () => {
  it('reverses route avoidance across repeated failure and repair cycles', () => {
    const society = new SocietyCore();
    society.addInfrastructure('bridge', { condition: 1 });
    society.addRoamingGroup('g', {});
    society.addFaction('guard', { supplySecurity: 1 });
    society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
    for (const condition of [0, 1, 0, 1]) {
      society.tick({ actions: [{ kind: 'INFRASTRUCTURE_UPDATE', infrastructure: 'bridge', routeId: 'road', condition }, { kind: 'ROAMING_GROUP_SUPPLY_FEEDBACK', group: 'g', faction: 'guard', routeId: 'road' }] });
    }
    const feedback = society.events.filter(event => event.type === 'ROAMING_GROUP_SUPPLY_FEEDBACK');
    expect(feedback.map(event => event.selected)).toEqual(['AVOID', 'TRAVEL', 'AVOID', 'TRAVEL']);
    expect(feedback.every(event => event.parentId)).toBe(true);
    expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize()))).serialize()).toEqual(society.serialize());
  });
});
