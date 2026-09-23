import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

describe('roaming group grievance recovery', () => {
  it('reduces grievance after aid and records the recovery cause', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('refugees', { food: 0, foodNeed: 5 });
    society.addFaction('town', { grievance: 0 });
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_CONSEQUENCE', group: 'refugees', faction: 'town' }] });
    const before = society.factions.get('town').state.grievance;
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_LEGITIMACY_RECOVERY', group: 'refugees', faction: 'town', aid: 4 }] });
    const event = society.events.at(-1);
    expect(event).toMatchObject({ type: 'ROAMING_GROUP_LEGITIMACY_RECOVERY', aid: 4 });
    expect(society.factions.get('town').state.grievance).toBeLessThan(before);
    expect(event.parentId).toBe(society.events.at(-2).id);
  });

  it('supports justice recovery and exact save/load continuation', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('nomads', { food: 0, foodNeed: 5 });
    society.addFaction('town', { grievance: .8 });
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_LEGITIMACY_RECOVERY', group: 'nomads', faction: 'town', justiceResolved: true, justiceRecovery: .3 }] });
    expect(society.factions.get('town').state.grievance).toBeCloseTo(.5);
    const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
    expect(restored.serialize()).toEqual(society.serialize());
  });
});
