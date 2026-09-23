import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('canonical supply security shocks', () => {
  it('records a shock before route feedback consumes recovered security', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('g', {});
    society.addFaction('guard', { supplySecurity: 1 });
    society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 1.5 }]);
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_SECURITY_SHOCK', faction: 'guard', supplySecurity: 0, reason: 'bridge-destroyed' }, { kind: 'ROAMING_GROUP_SUPPLY_FEEDBACK', group: 'g', faction: 'guard', routeId: 'road' }] });
    const shock = society.events.find(event => event.type === 'ROAMING_GROUP_SECURITY_SHOCK');
    const feedback = society.events.find(event => event.type === 'ROAMING_GROUP_SUPPLY_FEEDBACK');
    expect(shock).toMatchObject({ supplySecurityBefore: 1, supplySecurityAfter: 0, reason: 'bridge-destroyed' });
    expect(feedback.selected).toBe('AVOID');
    expect(feedback.parentId).toBe(shock.id);
  });

  it('persists the shock and its downstream state', () => {
    const society = new SocietyCore();
    society.addFaction('guard', { supplySecurity: 1 });
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_SECURITY_SHOCK', faction: 'guard', supplySecurity: .25 }] });
    const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
    expect(restored.serialize()).toEqual(society.serialize());
    expect(restored.factions.get('guard').state.supplySecurity).toBe(.25);
  });
});
