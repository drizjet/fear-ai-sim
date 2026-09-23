import { describe, expect, it } from '@jest/globals';
import { AdvisoryGate } from '../advisorygate.js';
import { InteractionCore } from '../interactioncore.js';

describe('InteractionCore and AdvisoryGate', () => {
    const vampire = { id: 'v', type: 'VAMPIRE' };
    const human = { id: 'h', type: 'HUMAN' };

    it('offers transform only when actor and target types allow it', () => {
        const core = new InteractionCore({ random: () => 0 });
        const result = core.decide(vampire, human, {
            targetAlive: true, convertible: true, knowsTransformation: true,
            hasResource: true, recruitmentNeed: 1, targetValue: 1,
            witnessRisk: 0, hunger: 0, targetFear: 0, curiosity: 1, trust: 1
        });
        expect(result.candidates.some(candidate => candidate.action === 'transform')).toBe(true);
        expect(result.selected).toBeTruthy();
    });

    it('hard-blocks transformation when prerequisites are missing', () => {
        const core = new InteractionCore();
        const result = core.validate('transform', vampire, human, { targetAlive: false });
        expect(result.valid).toBe(false);
        expect(result.blockers).toContain('targetAlive');
    });

    it('rejects unavailable actions without granting advisory authority', () => {
        const gate = new AdvisoryGate();
        const result = gate.validate({ action: 'transform' }, { id: 'human', type: 'HUMAN' }, human, {});
        expect(result.approved).toBe(false);
        expect(result.action).toBeNull();
        expect(result.source).toBe('ADVISORY_VALIDATOR');
    });
});
