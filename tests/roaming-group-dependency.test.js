import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore } from '../societycore.js';

describe('roaming group settlement dependency', () => {
  it('turns repeated aid into a return-to-settlement decision', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('refugees', { food: 0, foodNeed: 4 });
    society.addMarket('town', new Market({ stock: { grain: 10 } }));
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_SETTLEMENT_INTERACTION', group: 'refugees', market: 'town', foodRequested: 4, aid: true }] });
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_DEPENDENCY_EVALUATION', group: 'refugees', relianceThreshold: .5 }] });
    expect(society.events.at(-1)).toMatchObject({ selected: 'RETURN_TO_SETTLEMENT', supportReceived: 4 });
    const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
    expect(restored.roamingGroups.get('refugees')).toEqual(society.roamingGroups.get('refugees'));
  });

  it('keeps unsupported groups roaming or seeking resources', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('nomads', { food: 1, foodNeed: 5 });
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_DEPENDENCY_EVALUATION', group: 'nomads' }] });
    expect(society.events.at(-1).selected).toBe('SEEK_RESOURCES');
  });
});
