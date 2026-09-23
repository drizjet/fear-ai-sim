import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

describe('roaming group dependency decay', () => {
  it('decays reliance after support stops and changes the selected mobility action', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('refugees', { food: 5, foodNeed: 5, supportReceived: 5, settlementReliance: 1 });
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_DEPENDENCY_EVALUATION', group: 'refugees', relianceThreshold: .5 }] });
    expect(society.events.at(-1).selected).toBe('RETURN_TO_SETTLEMENT');
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_DEPENDENCY_DECAY', group: 'refugees', decay: .6 }] });
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_DEPENDENCY_EVALUATION', group: 'refugees', relianceThreshold: .5 }] });
    expect(society.events.at(-1).selected).toBe('ROAM');
    expect(society.events.find(event => event.type === 'ROAMING_GROUP_DEPENDENCY_DECAY')).toMatchObject({ reliance: .4 });
  });

  it('preserves reliance decay across save/load', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('nomads', { settlementReliance: .8, supportReceived: 2 });
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_DEPENDENCY_DECAY', group: 'nomads', decay: .2 }] });
    const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
    expect(restored.serialize()).toEqual(society.serialize());
    expect(society.events.at(-1).parentId).toBe(society.events.at(-2).id);
  });
});
