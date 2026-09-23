import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('roaming group loot conservation', () => {
  it('accounts conflict loss as explicit destruction', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('orcs', { loot: 5 });
    society.routes = new RouteNetwork([{ id: 'road', traffic: 100, perceivedDanger: 0 }]);
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_RISK', group: 'orcs', routeId: 'road', trafficWeight: .02, threshold: 1, loss: 2 }] });
    const group = society.roamingGroups.get('orcs');
    expect(society.lootBalanceSheet(group)).toMatchObject({ initial: 5, destroyed: 2, current: 3, expected: 3, balanced: true });
    expect(society.events.at(-1).lootBalance.balanced).toBe(true);
  });

  it('keeps loot balance stable across save/load and safe passage', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('nomads', { loot: 5 });
    society.routes = new RouteNetwork([{ id: 'road', traffic: 0, perceivedDanger: 0 }]);
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_RISK', group: 'nomads', routeId: 'road' }] });
    const group = society.roamingGroups.get('nomads');
    expect(society.lootBalanceSheet(group).balanced).toBe(true);
    expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize()))).serialize()).toEqual(society.serialize());
  });
});
