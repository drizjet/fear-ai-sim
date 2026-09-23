import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore } from '../societycore.js';

describe('roaming group settlement interaction', () => {
  it('trades or receives aid through the canonical market path', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('refugees', { food: 0, foodNeed: 5 });
    society.addMarket('town', new Market({ stock: { grain: 10 } }));
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_SETTLEMENT_INTERACTION', group: 'refugees', market: 'town', good: 'grain', foodRequested: 4, aid: true }] });
    const event = society.events.at(-1);
    expect(event).toMatchObject({ interaction: 'AID', quantity: 4, accepted: true, food: 4, marketStock: 6 });
    expect(event.parentId).toBe(society.events.at(-2).id);
    expect(society.markets.get('town').balanceSheet().balanced).toBe(true);
  });

  it('rejects unavailable settlement food without creating group resources', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('nomads', { food: 1, foodNeed: 5 });
    society.addMarket('town', new Market({ stock: { grain: 0 } }));
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_SETTLEMENT_INTERACTION', group: 'nomads', market: 'town', foodRequested: 4 }] });
    expect(society.events.at(-1)).toMatchObject({ quantity: 0, accepted: false, food: 1 });
    const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
    expect(restored.roamingGroups.get('nomads')).toEqual(society.roamingGroups.get('nomads'));
  });
});
