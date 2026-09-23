import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('roaming group route risk consequences', () => {
  it('turns traffic plus perceived danger into a conflict and loot loss', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('orcs', { loot: 5 });
    society.routes = new RouteNetwork([{ id: 'road', traffic: 50, perceivedDanger: 0, actualDanger: 99 }]);
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_RISK', group: 'orcs', routeId: 'road', trafficWeight: .05, threshold: 1, loss: 2 }] });
    const event = society.events.at(-1);
    expect(event).toMatchObject({ outcome: 'CONFLICT', risk: 2.5, loot: 3 });
    expect(event.parentId).toBe(society.events.at(-2).id);
  });

  it('passes safely when the legal risk signal is low, regardless of hidden danger', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('nomads', { loot: 5 });
    society.routes = new RouteNetwork([{ id: 'road', traffic: 0, perceivedDanger: 0, actualDanger: 100 }]);
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_RISK', group: 'nomads', routeId: 'road', threshold: 1 }] });
    expect(society.events.at(-1)).toMatchObject({ outcome: 'SAFE_PASSAGE', loot: 5 });
    expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize()))).serialize()).toEqual(society.serialize());
  });
});
