import { describe, it, expect } from '@jest/globals';
import { explainStance } from '../factionrelationship.js';

describe('explainStance includes perTargetMemory factor (Constitution §182 / §344)', () => {
    it('the perTargetMemory factor appears in the top factors when it is significant', () => {
        // The audit: "The §344 contract: 'select actor/faction/state.
        // Ask: WHY? Show: top decision factors.' The per-target
        // memory should be one of those factors when it's
        // significant." Before this slice, explainStance did
        // not include perTargetMemory. After: it does.
        const result = explainStance({
            pressure: 0.1,
            trust: 0.5,
            perTargetMemory: 0.8 // high specific memory
        });
        const factorNames = result.topFactors.map(f => f.name);
        expect(factorNames).toContain('perTargetMemory');
    });

    it('high perTargetMemory with low pressure tips the decision to ESCALATE', () => {
        // The audit: "A faction harmed by Bandit A should not
        // automatically attach equal grievance to every
        // bandit or every faction." A high perTargetMemory
        // signal (the faction remembers a specific actor) can
        // escalate the stance even when scalar pressure is low.
        const result = explainStance({
            pressure: 0.1, // low scalar pressure
            trust: 0.5,
            perTargetMemory: 0.9 // very high specific memory
        });
        expect(result.decision).toBe('ESCALATE');
    });

    it('low perTargetMemory with low pressure holds peace', () => {
        // The complement: no specific memory, no reason to
        // escalate. The decision should be HOLD_PEACE.
        const result = explainStance({
            pressure: 0.1,
            trust: 0.5,
            perTargetMemory: 0 // no specific memory
        });
        expect(result.decision).toBe('HOLD_PEACE');
    });
});
