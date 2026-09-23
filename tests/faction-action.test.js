import { describe, expect, it } from '@jest/globals';
import { FactionRuntime } from '../societycore.js';

describe('faction action integration', () => {
    it('selects a viable action from faction state', () => {
        const faction = new FactionRuntime('wolves', { opportunity: 1, resourceNeed: 1, legitimacy: 0, supplySecurity: .2 });
        const result = faction.evaluateAction({ id: 'town' }, { canRaid: true });
        expect(result.selected).toBeTruthy();
        expect(result.candidates.map(candidate => candidate.action)).toEqual(expect.arrayContaining(['HOLD', 'RAID', 'PATROL']));
    });

    it('cannot select RAID when capability is absent', () => {
        const faction = new FactionRuntime('wolves', { opportunity: 1, resourceNeed: 1 });
        const result = faction.evaluateAction({ id: 'town' }, { canRaid: false });
        const raid = result.candidates.find(candidate => candidate.action === 'RAID');
        expect(raid.valid).toBe(false);
        expect(raid.blockers).toContain('canRaid');
        expect(result.selected).not.toBe('RAID');
    });
});
