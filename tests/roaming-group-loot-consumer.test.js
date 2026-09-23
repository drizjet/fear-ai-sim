import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore } from '../societycore.js';

describe('roaming group loot downstream consumer', () => {
  it('consumes transferred loot and improves faction supply security', () => {
    const society = new SocietyCore();
    society.addMarket('town', new Market({ stock: { loot: 5 } }));
    society.addFaction('guard', { supplySecurity: .2 });
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_LOOT_CONSUMER', market: 'town', faction: 'guard', good: 'loot', quantity: 3, consumer: 'guard' }] });
    const event = society.events.at(-1);
    expect(event).toMatchObject({ consumed: 3, accepted: true });
    expect(society.factions.get('guard').state.supplySecurity).toBeCloseTo(.23);
    expect(society.markets.get('town').stock.loot).toBe(2);
    expect(society.markets.get('town').balanceSheet().balanced).toBe(true);
    expect(event.parentId).toBe(society.events.at(-2).id);
  });

  it('does not consume unavailable loot and persists the decision', () => {
    const society = new SocietyCore();
    society.addMarket('town', new Market({ stock: { loot: 0 } }));
    society.addFaction('guard', { supplySecurity: .2 });
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_LOOT_CONSUMER', market: 'town', faction: 'guard', quantity: 2 }] });
    expect(society.events.at(-1)).toMatchObject({ consumed: 0, accepted: false, supplySecurity: .2 });
    expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize()))).serialize()).toEqual(society.serialize());
  });
});
