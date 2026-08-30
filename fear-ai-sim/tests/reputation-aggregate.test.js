import { describe, it, expect } from '@jest/globals';
import { recordHarmByActor, getMemoryOfLoss } from '../escalation.js';
import { FactionDecisionModel } from '../factioncore.js';

// World-Completion Directive §30 "REPUTATION. Separate
// reputation from relationship. Reputation is what a broader
// network thinks an actor tends to do. Possible dimensions:
// reliability; honesty; violence; trade fairness; bravery;
// generosity; cruelty; lawfulness; military strength. ... A
// merchant wants reliability. A raider may value strength. A
// government may care about lawfulness."

// The simplest honest aggregation: a target's reputation
// toward a faction is the mean of all `memoryByActor` values
// for that target across the network's observers. A bandit
// that attacked 3 towns has reputation 0.8 in each; the
// mean across the 3 observers is 0.8. A bandit that
// attacked 0 towns has reputation 0.

function computeReputation(targetId, observers) {
    if (!Array.isArray(observers) || observers.length === 0) return 0;
    const values = observers
        .map(obs => getMemoryOfLoss(obs, targetId))
        .filter(v => Number.isFinite(v));
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

describe('reputation aggregation (directive §30)', () => {
    it('a target with no observers has reputation 0', () => {
        expect(computeReputation('bandit-A', [])).toBe(0);
    });

    it('a target with one observer has reputation equal to that observers memory', () => {
        const faction = new FactionDecisionModel({ id: 'f1' });
        recordHarmByActor(faction, 'bandit-A', { severity: 0.6 });
        expect(computeReputation('bandit-A', [faction])).toBeCloseTo(0.6, 5);
    });

    it('a target with multiple observers has reputation equal to the mean memory', () => {
        const f1 = new FactionDecisionModel({ id: 'f1' });
        const f2 = new FactionDecisionModel({ id: 'f2' });
        const f3 = new FactionDecisionModel({ id: 'f3' });
        recordHarmByActor(f1, 'bandit-A', { severity: 0.4 });
        recordHarmByActor(f2, 'bandit-A', { severity: 0.8 });
        recordHarmByActor(f3, 'bandit-A', { severity: 0.2 });
        // Mean = (0.4 + 0.8 + 0.2) / 3 = 0.4666...
        const rep = computeReputation('bandit-A', [f1, f2, f3]);
        expect(rep).toBeCloseTo(0.4666, 3);
    });

    it('observers with no memory of the target do not bias the reputation', () => {
        // An observer that has never been attacked by
        // bandit-A has memoryByActor['bandit-A'] = 0.
        // The mean is still correct.
        const f1 = new FactionDecisionModel({ id: 'f1' });
        const f2 = new FactionDecisionModel({ id: 'f2' });
        recordHarmByActor(f1, 'bandit-A', { severity: 0.6 });
        // f2 has no entry for bandit-A.
        const rep = computeReputation('bandit-A', [f1, f2]);
        expect(rep).toBeCloseTo(0.3, 5);
    });

    it('reputation is bounded [0, 1]', () => {
        // The recordHarmByActor function clamps to [0, 1],
        // so the mean is also bounded.
        const f1 = new FactionDecisionModel({ id: 'f1' });
        recordHarmByActor(f1, 'bandit-A', { severity: 5.0 });
        const rep = computeReputation('bandit-A', [f1]);
        expect(rep).toBeGreaterThanOrEqual(0);
        expect(rep).toBeLessThanOrEqual(1);
    });

    it('two different targets have independent reputations', () => {
        // bandit-A and bandit-B are different actors.
        // The reputation of bandit-A must not include
        // bandit-B's memory and vice versa.
        const f1 = new FactionDecisionModel({ id: 'f1' });
        recordHarmByActor(f1, 'bandit-A', { severity: 0.8 });
        recordHarmByActor(f1, 'bandit-B', { severity: 0.2 });
        const repA = computeReputation('bandit-A', [f1]);
        const repB = computeReputation('bandit-B', [f1]);
        expect(repA).toBeCloseTo(0.8, 5);
        expect(repB).toBeCloseTo(0.2, 5);
    });
});
