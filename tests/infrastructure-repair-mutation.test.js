import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('infrastructure repair mutation holdout', () => {
  it('requires the repair producer before travel can resume', () => {
    const society = new SocietyCore();
    society.addInfrastructure('bridge', { condition: 1 });
    society.addRoamingGroup('g', {});
    society.addFaction('guard', { supplySecurity: 1 });
    society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
    society.tick({ actions: [{ kind: 'INFRASTRUCTURE_UPDATE', infrastructure: 'bridge', routeId: 'road', condition: 0 }] });
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_SUPPLY_FEEDBACK', group: 'g', faction: 'guard', routeId: 'road' }] });
    expect(society.events.at(-1).selected).toBe('AVOID');
    society.tick({ actions: [{ kind: 'INFRASTRUCTURE_REPAIR', infrastructure: 'bridge', routeId: 'road', condition: 1 }, { kind: 'ROAMING_GROUP_SUPPLY_FEEDBACK', group: 'g', faction: 'guard', routeId: 'road' }] });
    const repair = society.events.find(event => event.type === 'INFRASTRUCTURE_REPAIR');
    const feedback = society.events.at(-1);
    expect(repair).toMatchObject({ conditionBefore: 0, conditionAfter: 1, available: true });
    expect(feedback).toMatchObject({ selected: 'TRAVEL' });
    expect(feedback.parentId).toBe(repair.id);
  });
});
