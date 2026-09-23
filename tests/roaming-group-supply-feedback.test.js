import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('roaming group supply feedback', () => {
  it('reduces perceived route danger and permits travel as security improves', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('nomads', {});
    society.addFaction('guard', { supplySecurity: 1 });
    society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 1.5 }]);
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_SUPPLY_FEEDBACK', group: 'nomads', faction: 'guard', routeId: 'road', threshold: 1, groupSize: 2 }] });
    const event = society.events.at(-1);
    expect(event).toMatchObject({ selected: 'TRAVEL', perceivedDanger: .75, traffic: 2 });
    expect(event.parentId).toBe(society.events.at(-2).id);
  });

  it('decays route traffic after travel and preserves bounded capacity', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('nomads', {});
    society.routes = new RouteNetwork([{ id: 'road', traffic: 99, trafficCapacity: 100, perceivedDanger: 0 }]);
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_SUPPLY_FEEDBACK', group: 'nomads', faction: society.addFaction('guard', { supplySecurity: 1 }).id, routeId: 'road', groupSize: 10 }] });
    expect(society.routes.edges[0].traffic).toBe(100);
    society.tick({ actions: [{ kind: 'ROUTE_TRAFFIC_DECAY', rate: .25 }] });
    expect(society.routes.edges[0].traffic).toBe(75);
  });

  it('avoids a dangerous route under weak security and persists state', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('refugees', {});
    society.addFaction('guard', { supplySecurity: 0 });
    society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 2 }]);
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_SUPPLY_FEEDBACK', group: 'refugees', faction: 'guard', routeId: 'road', threshold: 1 }] });
    expect(society.events.at(-1)).toMatchObject({ selected: 'AVOID', traffic: 0 });
    expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize()))).serialize()).toEqual(society.serialize());
  });
});
