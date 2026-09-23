import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('roaming group traffic risk thresholds', () => {
  it('distinguishes below and above threshold traffic regimes', () => {
    const low = new SocietyCore();
    low.addRoamingGroup('g', { loot: 5 });
    low.routes = new RouteNetwork([{ id: 'r', traffic: 20, trafficCapacity: 100 }]);
    low.tick({ actions: [{ kind: 'ROAMING_GROUP_TRAFFIC_CONSUMER', group: 'g', routeId: 'r', threshold: .5, loss: 1 }] });
    expect(low.events.at(-1)).toMatchObject({ outcome: 'OPEN', congestion: .2, lootLoss: 0 });

    const high = new SocietyCore();
    high.addRoamingGroup('g', { loot: 5 });
    high.routes = new RouteNetwork([{ id: 'r', traffic: 80, trafficCapacity: 100 }]);
    high.tick({ actions: [{ kind: 'ROAMING_GROUP_TRAFFIC_CONSUMER', group: 'g', routeId: 'r', threshold: .5, loss: 1 }] });
    expect(high.events.at(-1)).toMatchObject({ outcome: 'CONGESTED', congestion: .8, lootLoss: 1 });
  });
});
