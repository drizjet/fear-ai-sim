import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

describe('roaming group needs', () => {
  it('selects food-seeking behavior when food is insufficient and persists it', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('orcs', { location: 'frontier', food: 1, foodNeed: 5, loot: 2 });
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_EVALUATION', group: 'orcs', canRaid: false, foodYield: 2 }] });
    const event = society.events.at(-1);
    expect(event).toMatchObject({ type: 'ROAMING_GROUP_EVALUATION', selected: 'SEEK_FOOD', food: 3 });
    const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
    expect(restored.roamingGroups.get('orcs')).toEqual(society.roamingGroups.get('orcs'));
    expect(event.parentId).toBe(society.events.at(-2).id);
  });

  it('changes action when the group has enough food', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('nomads', { food: 10, foodNeed: 2, loot: 0, lootNeed: 4 });
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_EVALUATION', group: 'nomads', canRaid: false, tradeFood: 2 }] });
    expect(society.events.at(-1).selected).toBe('TRADE');
    expect(society.roamingGroups.get('nomads').food).toBe(12);
  });
});
