import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore } from '../societycore.js';

describe('roaming group loot settlement transfer', () => {
  it('transfers loot into settlement stock exactly once', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('orcs', { loot: 5 });
    society.addMarket('town', new Market({ stock: { loot: 0 } }));
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_LOOT_SETTLEMENT', group: 'orcs', market: 'town', quantity: 3, aid: false }] });
    const group = society.roamingGroups.get('orcs');
    const event = society.events.at(-1);
    expect(event).toMatchObject({ type: 'ROAMING_GROUP_LOOT_SETTLEMENT', quantity: 3, interaction: 'TRADE', loot: 2, marketStock: 3, accepted: true });
    expect(society.lootBalanceSheet(group)).toMatchObject({ initial: 5, current: 2, balanced: true });
    expect(society.markets.get('town').stock.loot).toBe(3);
    expect(event.parentId).toBe(society.events.at(-2).id);
  });

  it('does not create loot when the group is empty and survives save/load', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('nomads', { loot: 0 });
    society.addMarket('town', new Market({ stock: { loot: 2 } }));
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_LOOT_SETTLEMENT', group: 'nomads', market: 'town', quantity: 4, aid: true }] });
    expect(society.events.at(-1)).toMatchObject({ quantity: 0, accepted: false, marketStock: 2 });
    expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize()))).serialize()).toEqual(society.serialize());
  });
});
