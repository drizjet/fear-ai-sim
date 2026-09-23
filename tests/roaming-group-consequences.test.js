import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

describe('roaming group downstream consequences', () => {
  it('turns food shortage into migration pressure and faction grievance', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('refugees', { food: 1, foodNeed: 5 });
    society.addFaction('town', { grievance: 0 });
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_CONSEQUENCE', group: 'refugees', faction: 'town', migrationThreshold: .5 }] });
    const event = society.events.at(-1);
    expect(event).toMatchObject({ type: 'ROAMING_GROUP_CONSEQUENCE', shortage: 4, pressure: .8, consequence: 'MIGRATION_PRESSURE' });
    expect(society.factions.get('town').state.grievance).toBeGreaterThan(0);
    expect(event.parentId).toBe(society.events.at(-2).id);
  });

  it('does not create pressure when food meets need and survives save/load', () => {
    const society = new SocietyCore();
    society.addRoamingGroup('nomads', { food: 5, foodNeed: 5 });
    society.addFaction('town', { grievance: 0 });
    society.tick({ actions: [{ kind: 'ROAMING_GROUP_CONSEQUENCE', group: 'nomads', faction: 'town' }] });
    expect(society.events.at(-1)).toMatchObject({ shortage: 0, consequence: 'HOLD' });
    const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
    expect(restored.serialize()).toEqual(society.serialize());
  });
});
