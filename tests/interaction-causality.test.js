import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

describe('interaction causal integration', () => {
    it('records InteractionCore evaluation as a TURN child', () => {
        const society = new SocietyCore();
        society.tick({ actions: [{ kind: 'INTERACTION_EVALUATION', actor: { id: 'v', type: 'VAMPIRE' }, target: { id: 'h', type: 'HUMAN' }, context: { curiosity: 1, trust: 1 } }] });
        const turn = society.events[0];
        const event = society.events.find(item => item.type === 'INTERACTION_EVALUATION');
        expect(event.parentId).toBe(turn.id);
        expect(event.actorId).toBe('v');
        expect(event.targetId).toBe('h');
        expect(Array.isArray(event.alternatives)).toBe(true);
    });

    it('records advisory rejection as history without granting mutation authority', () => {
        const society = new SocietyCore();
        society.tick({ actions: [{ kind: 'ADVISORY_VALIDATION', proposal: { action: 'transform' }, actor: { id: 'h', type: 'HUMAN' }, target: { id: 'x', type: 'HUMAN' } }] });
        const event = society.events.find(item => item.type === 'ADVISORY_VALIDATION');
        expect(event.approved).toBe(false);
        expect(event.action).toBeNull();
        expect(event.parentId).toBe(society.events[0].id);
    });
});
