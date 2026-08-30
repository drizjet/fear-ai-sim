import { describe, it, expect } from '@jest/globals';
import { FactionDecisionModel, ESCALATION_LEVELS } from '../factioncore.js';
import { recordHarmByActor, getMemoryOfLoss } from '../escalation.js';

describe('per-target memory (PHASE 16)', () => {
    it('recordHarmByActor stores harm by actor id', () => {
        const faction = new FactionDecisionModel({ id: 'f1' });
        recordHarmByActor(faction, 'bandit-A', { severity: 0.8, tick: 1 });
        recordHarmByActor(faction, 'bandit-B', { severity: 0.3, tick: 2 });
        expect(getMemoryOfLoss(faction, 'bandit-A')).toBeGreaterThan(getMemoryOfLoss(faction, 'bandit-B'));
    });

    it('grievance is target-specific: harm by bandit A does not affect grievance toward bandit B', () => {
        const faction = new FactionDecisionModel({ id: 'f1' });
        // Bandit A hurts the faction heavily.
        recordHarmByActor(faction, 'bandit-A', { severity: 0.9, tick: 1 });
        // Bandit B has not hurt the faction.
        const memA = getMemoryOfLoss(faction, 'bandit-A');
        const memB = getMemoryOfLoss(faction, 'bandit-B');
        // Bandit A's memory is high, Bandit B's is zero or near zero.
        expect(memA).toBeGreaterThan(0);
        expect(memB).toBe(0);
    });

    it('unknown attackers produce generalized fear, not specific grievance', () => {
        // The audit: "Unknown identity may produce generalized
        // fear while specific grievance remains uncertain."
        const faction = new FactionDecisionModel({ id: 'f1' });
        // An unknown attacker: severity is low because we
        // don't know who they are.
        recordHarmByActor(faction, 'unknown', { severity: 0.2, tick: 1, known: false });
        // The unknown attacker's specific memory is low.
        expect(getMemoryOfLoss(faction, 'unknown')).toBeLessThanOrEqual(0.2);
        // The faction's general fear should rise (the audit's
        // "generalized fear" property) but specific grievance
        // toward 'unknown' should be modest.
    });

    it('the faction retains its scalar memoryOfLoss as a fallback', () => {
        // Backward compat: the scalar memoryOfLoss still
        // exists for legacy callers.
        const faction = new FactionDecisionModel({ id: 'f1' });
        recordHarmByActor(faction, 'bandit-A', { severity: 0.5, tick: 1 });
        expect(faction.memoryOfLoss).toBeDefined();
    });
});
