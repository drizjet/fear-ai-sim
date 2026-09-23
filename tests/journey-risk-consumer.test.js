import { describe, expect, it } from '@jest/globals';
import { Market, RouteNetwork, SocietyCore } from '../societycore.js';

describe('journey risk consumers', () => {
  it('uses perceived route danger, not hidden actual danger, for market settlement', () => {
    const society = new SocietyCore({ seed: 7 });
    society.addMarket('a', new Market({ stock: { grain: 10 } }));
    society.addMarket('b', new Market({ stock: { grain: 0 } }));
    society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 2, actualDanger: 99 }]);
    society.tick({ actions: [{ kind: 'MARKET_TRIP_CREATE', market: 'a', tripId: 't1', good: 'grain', quantity: 3, destination: 'b' }] });
    society.tick({ actions: [{ kind: 'MARKET_TRIP_SETTLE', market: 'a', destinationMarket: 'b', tripId: 't1', routeId: 'road', perceivedDanger: 0, riskThreshold: 1 }] });
    const event = society.events.at(-1);
    expect(event.outcome).toBe('DELIVERED');
    expect(society.markets.get('b').stock.grain).toBe(3);
    expect(society.markets.get('a').balanceSheet().balanced).toBe(true);
    expect(event.parentId).toBe(society.events.at(-2).id);
  });

  it('returns high-risk migration groups without losing population', () => {
    const society = new SocietyCore();
    society.addSettlement('a', { population: 8, capacity: 8 });
    society.addSettlement('b', { population: 0, capacity: 8 });
    society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 4 }]);
    society.tick({ actions: [{ kind: 'MIGRATION_BEGIN', id: 'm1', from: 'a', to: 'b', population: 3, routeId: 'road', perceivedDanger: 4 }] });
    society.tick({ actions: [{ kind: 'MIGRATION_SETTLE', id: 'm1', riskThreshold: 1 }] });
    expect(society.events.at(-1).outcome).toBe('STOLEN');
    expect(society.settlements.get('a').population + society.settlements.get('b').population).toBe(5);
    expect(society.events.at(-1).parentId).toBe(society.events.at(-2).id);
  });
});
