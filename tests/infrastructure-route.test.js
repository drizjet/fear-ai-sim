import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('infrastructure route consequences', () => {
  it('makes a route unavailable when infrastructure fails', () => {
    const society = new SocietyCore();
    society.addInfrastructure('bridge', { type: 'BRIDGE', condition: 1 });
    society.addRoamingGroup('g', {});
    society.addFaction('guard', { supplySecurity: 1 });
    society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
    society.tick({ actions: [{ kind: 'INFRASTRUCTURE_UPDATE', infrastructure: 'bridge', routeId: 'road', condition: 0 }, { kind: 'ROAMING_GROUP_SUPPLY_FEEDBACK', group: 'g', faction: 'guard', routeId: 'road' }] });
    const update = society.events.find(event => event.type === 'INFRASTRUCTURE_UPDATE');
    const feedback = society.events.find(event => event.type === 'ROAMING_GROUP_SUPPLY_FEEDBACK');
    expect(update).toMatchObject({ conditionAfter: 0, available: false });
    expect(feedback).toMatchObject({ selected: 'AVOID', reason: 'INFRASTRUCTURE_UNAVAILABLE' });
    expect(feedback.parentId).toBe(update.id);
  });

  it('restores availability and persists infrastructure state', () => {
    const society = new SocietyCore();
    society.addInfrastructure('bridge', { condition: 0 });
    society.routes = new RouteNetwork([{ id: 'road' }]);
    society.tick({ actions: [{ kind: 'INFRASTRUCTURE_UPDATE', infrastructure: 'bridge', routeId: 'road', condition: 1 }] });
    expect(society.routes.edges[0].available).toBe(true);
    expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize()))).serialize()).toEqual(society.serialize());
  });
});
