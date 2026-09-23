import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('roaming group traffic risk recovery', () => {
  it('recovers from congestion after route traffic decays', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('orcs', { loot: 5 });
    society.routes = new RouteNetwork([{ id: 'road', traffic: 100, trafficCapacity: 100 }]);
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_TRAFFIC_CONSUMER', group: 'orcs', routeId: 'road', loss: 1 }] });
    expect(society.events.at(-1).outcome).toBe('CONGESTED');
    society.tick({ actions: [{ kind: 'ROUTE_TRAFFIC_DECAY', rate: 1 }] });
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_TRAFFIC_CONSUMER', group: 'orcs', routeId: 'road', loss: 1 }] });
    expect(society.events.at(-1)).toMatchObject({ outcome: 'OPEN', lootLoss: 0, loot: 4 });
    expect(society.lootBalanceSheet(society.roamingGroups.get('orcs')).balanced).toBe(true);
  });

  it('persists recovered traffic and group state', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('nomads', { loot: 2 });
    society.routes = new RouteNetwork([{ id: 'road', traffic: 10, trafficCapacity: 100 }]);
    society.tick({ actions: [{ kind: 'ROUTE_TRAFFIC_DECAY', rate: .5 }] });
    const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
    expect(restored.serialize()).toEqual(society.serialize());
    expect(society.events.at(-1).parentId).toBe(society.events.at(-2).id);
  });
});
