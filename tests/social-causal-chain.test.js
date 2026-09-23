import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

describe('faction to justice to migration causal chain', () => {
    it('records faction evaluation as a TURN child and mutates faction state', () => {
        const society = new SocietyCore();
        const faction = society.addFaction('border-watch', { supplySecurity: .2, opportunity: 0, legitimacy: .5 });
        society.tick({ actions: [{ kind: 'FACTION_EVALUATION', faction: 'border-watch', targetId: 'town', context: { security: 1 } }] });
        const turn = society.events[0];
        const event = society.events.find(item => item.type === 'FACTION_EVALUATION');
        expect(event.parentId).toBe(turn.id);
        expect(event.selected).toBe('PATROL');
        expect(faction.state.supplySecurity).toBeCloseTo(.3);
        expect(faction.history).toHaveLength(1);
    });

    it('justice loss reduces legitimacy and increases migration pressure', () => {
        const society = new SocietyCore();
        society.addFaction('town', { legitimacy: .8, grievance: 0 });
        society.tick({ actions: [{ kind: 'JUSTICE_RESOLUTION', faction: 'town', solved: false, injustice: 1 }] });
        const before = society.factions.get('town').state.legitimacy;
        society.tick({ actions: [{ kind: 'MIGRATION_EVALUATION', faction: 'town', destination: 'safe-town', fear: 0, foodSecurity: 1 }] });
        const migration = society.events.find(item => item.type === 'MIGRATION_EVALUATION');
        expect(before).toBeLessThan(.8);
        expect(migration.pressure).toBeGreaterThan(0);
        expect(migration.migrates).toBe(false);
    });

    it('successful justice lowers grievance and migration pressure relative to injustice', () => {
        const society = new SocietyCore();
        society.addFaction('fair', { legitimacy: .5, grievance: .5 });
        society.tick({ actions: [{ kind: 'JUSTICE_RESOLUTION', faction: 'fair', solved: true, injustice: 0 }] });
        society.tick({ actions: [{ kind: 'MIGRATION_EVALUATION', faction: 'fair', fear: 0, foodSecurity: 1 }] });
        const faction = society.factions.get('fair');
        const migration = society.events.find(item => item.type === 'MIGRATION_EVALUATION');
        expect(faction.state.grievance).toBeLessThan(.5);
        expect(migration.pressure).toBeLessThan(.1);
    });
});
