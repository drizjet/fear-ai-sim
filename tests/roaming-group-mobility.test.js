import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('roaming group mobility route', () => {
  it('routes a low-dependency group and records traffic causally', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('nomads', { settlementReliance: 0, food: 5, foodNeed: 5 });
    society.routes = new RouteNetwork([{ id: 'short', travelTime: 2, perceivedDanger: 1 }, { id: 'long', travelTime: 8, perceivedDanger: 0 }]);
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_MOBILITY_ROUTE', group: 'nomads', groupSize: 3 }] });
    const event = society.events.at(-1);
    expect(event).toMatchObject({ decision: 'ROAM', selectedRoute: 'short', traffic: 3 });
    expect(event.parentId).toBe(society.events.at(-2).id);
  });

  it('does not route a highly dependent group and persists the result', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('refugees', { settlementReliance: 1 });
    society.routes = new RouteNetwork([{ id: 'road', travelTime: 1, perceivedDanger: 0, actualDanger: 99 }]);
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_MOBILITY_ROUTE', group: 'refugees' }] });
    expect(society.events.at(-1)).toMatchObject({ decision: 'RETURN_TO_SETTLEMENT', selectedRoute: null });
    const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
    expect(restored.serialize()).toEqual(society.serialize());
  });
});
