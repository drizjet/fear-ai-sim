import { describe, expect, it } from '@jest/globals';
import { SocietyCore, RouteNetwork } from '../societycore.js';

describe('roaming group route encounters', () => {
  it('uses perceived danger and records a causal route encounter', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('orcs', { location: 'road', loot: 2 });
    society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 8, actualDanger: 0 }]);
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', group: 'orcs', routeId: 'road', perceivedDanger: 3, riskThreshold: 2, lootYield: 4 }] });
    expect(society.events.at(-1)).toMatchObject({ type: 'ROAMING_GROUP_ROUTE_ENCOUNTER', outcome: 'RAID', perceivedDanger: 3, loot: 6 });
    expect(society.events.at(-1).parentId).toBe(society.events.at(-2).id);
  });

  it('preserves encounter state through save/load and does not read actual danger', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('nomads', { loot: 1 });
    society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0, actualDanger: 99 }]);
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_ROUTE_ENCOUNTER', group: 'nomads', routeId: 'road', riskThreshold: 1 }] });
    const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
    expect(restored.roamingGroups.get('nomads')).toEqual(society.roamingGroups.get('nomads'));
    expect(restored.events.at(-1).outcome).toBe('PASS');
  });
});
