import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('roaming group traffic consumer', () => {
  it('turns high traffic into congestion and explicit loot loss', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('orcs', { loot: 5 });
    society.routes = new RouteNetwork([{ id: 'road', traffic: 90, trafficCapacity: 100, actualDanger: 0 }]);
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_TRAFFIC_CONSUMER', group: 'orcs', routeId: 'road', threshold: .8, loss: 2 }] });
    const event = society.events.at(-1);
    expect(event).toMatchObject({ outcome: 'CONGESTED', congestion: .9, lootLoss: 2, loot: 3 });
    expect(event.lootBalance.balanced).toBe(true);
    expect(event.parentId).toBe(society.events.at(-2).id);
  });

  it('keeps low traffic open regardless of hidden danger and persists', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('nomads', { loot: 5 });
    society.routes = new RouteNetwork([{ id: 'road', traffic: 0, trafficCapacity: 100, actualDanger: 100 }]);
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_TRAFFIC_CONSUMER', group: 'nomads', routeId: 'road' }] });
    expect(society.events.at(-1)).toMatchObject({ outcome: 'OPEN', lootLoss: 0, loot: 5 });
    expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize()))).serialize()).toEqual(society.serialize());
  });
});
