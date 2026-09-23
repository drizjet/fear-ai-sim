import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('migration route topology', () => {
  it('preserves a multi-hop path and evaluates the current legal hop risk', () => {
    const society = new SocietyCore();
    society.addSettlement('a', { population: 6, capacity: 6 });
    society.addSettlement('b', { population: 0, capacity: 6 });
    society.routes = new RouteNetwork([
      { id: 'safe', perceivedDanger: 0, actualDanger: 99 },
      { id: 'dangerous', perceivedDanger: 3, actualDanger: 0 },
    ]);
    society.tick({ actions: [{ kind: 'MIGRATION_BEGIN', id: 'm1', from: 'a', to: 'b', population: 2, routeIds: ['safe', 'dangerous'], perceivedDanger: 0 }] });
    expect(society.migrationJourneys.get('m1').routeIds).toEqual(['safe', 'dangerous']);
    society.tick({ actions: [{ kind: 'MIGRATION_SETTLE', id: 'm1', riskThreshold: 1 }] });
    expect(society.events.at(-1)).toMatchObject({ outcome: 'ARRIVED', routeId: 'safe', perceivedDanger: 0 });
    expect(society.events.at(-1).outcome).not.toBe('STOLEN');
    expect(society.settlements.get('a').population + society.settlements.get('b').population).toBe(6);
  });
});
