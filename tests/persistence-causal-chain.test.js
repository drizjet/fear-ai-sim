import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

describe('persistent faction justice migration chain', () => {
    it('restores state and preserves causal continuity after restart', () => {
        const society = new SocietyCore();
        society.addFaction('town', { legitimacy: .8, grievance: 0 });
        society.tick({ actions: [{ kind: 'JUSTICE_RESOLUTION', faction: 'town', solved: false, injustice: 1 }] });
        society.tick({ actions: [{ kind: 'MIGRATION_EVALUATION', faction: 'town', destination: 'safe', foodSecurity: 1, fear: 0 }] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        const faction = restored.factions.get('town');
        expect(faction.state.legitimacy).toBe(society.factions.get('town').state.legitimacy);
        expect(faction.state.grievance).toBe(society.factions.get('town').state.grievance);
        const migration = restored.events.find(event => event.type === 'MIGRATION_EVALUATION');
        const justice = restored.events.find(event => event.type === 'JUSTICE_RESOLUTION');
        expect(migration.parentId).toBe(restored.events.find(event => event.type === 'TURN' && event.tick === migration.tick).id);
        expect(justice.parentId).toBe(restored.events.find(event => event.type === 'TURN' && event.tick === justice.tick).id);
        const next = restored.commitEvent(restored.allocateEvent({ type: 'AFTER_RESTART' }));
        expect(next.seq).toBe(society.eventSeq + 1);
    });
});
