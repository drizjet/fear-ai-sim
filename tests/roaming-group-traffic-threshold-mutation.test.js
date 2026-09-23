import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

const outcome = (traffic, threshold) => {
  const society = new SocietyCore();
  society.addRoamingGroup('g', { loot: 5 });
  society.routes = new RouteNetwork([{ id: 'r', traffic, trafficCapacity: 100 }]);
  society.tick({ actions: [{ kind: 'ROAMING_GROUP_TRAFFIC_CONSUMER', group: 'g', routeId: 'r', threshold, loss: 1 }] });
  return society.events.at(-1);
};

describe('traffic-risk semantic mutation controls', () => {
  it('kills traffic and threshold mutants with asymmetric outcomes', () => {
    expect(outcome(20, .5)).toMatchObject({ outcome: 'OPEN', lootLoss: 0 });
    expect(outcome(80, .5)).toMatchObject({ outcome: 'CONGESTED', lootLoss: 1 });
    expect(outcome(80, 2)).toMatchObject({ outcome: 'OPEN', lootLoss: 0 });
  });
});
