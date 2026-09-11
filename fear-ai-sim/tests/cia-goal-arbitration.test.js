import { describe, it, expect } from '@jest/globals';
import { GoalArbitrationEngine } from '../packages/core/index.js';
import { CharacterIdentityArchitecture } from '../packages/core/index.js';

// NEXT-118: CIA tendency weights into goal arbitration (CCI-28 frontier 2).
// Identity bends WHO is asked to do WHAT: stand-prone characters weight duty
// goals, flee-prone characters weight survival goals. Default-off scoring
// is untouched.
describe('NEXT-118: identity-weighted goal arbitration', () => {
    const GUARD = {
        resilience: 0.95, loyalty: 0.9, neuroticism: 0.1, riskTolerance: 0.7,
        leadership: 0.6, conscientiousness: 0.8, agreeableness: 0.5,
        openness: 0.5, extraversion: 0.5, socialOrientation: 0.5
    };
    const COWARD = { neuroticism: 0.95, resilience: 0.1, riskTolerance: 0.1 };
    const frameFor = (id, traits) => {
        const cia = new CharacterIdentityArchitecture();
        cia.registerCharacter(id, traits);
        return cia.tick(id, {}, { fear: 0.75, perceivedDanger: 0.7, urgency: 0.6 });
    };
    // Priorities tuned so the plain winner is SURVIVE: identity must earn the flip.
    const mk = () => {
        const e = new GoalArbitrationEngine();
        e.registerGoal('g', { type: 'HOLD_POST', priority: 0.5 });
        e.registerGoal('g', { type: 'SURVIVE', priority: 0.7 });
        return e;
    };
    const FEAR = { fear: 0.75 };

    it('1. Default scoring carries no tendency weights', () => {
        const r = mk().arbitrate('g', FEAR);
        expect(r.winningGoal).toBe('SURVIVE');
        expect('tendencyWeight' in r.rankedGoals[0]).toBe(false);
    });

    it('2. Stand-prone identity flips survival to duty', () => {
        const frame = frameFor('guard', GUARD);
        expect(frame.tendencies.stand).toBeGreaterThan(0.5);
        const r = mk().arbitrate('g', FEAR, {
            identityTendencies: frame.tendencies,
            identityWeight: 1
        });
        expect(r.winningGoal).toBe('HOLD_POST');
        expect(r.courageous).toBe(true);
        const hold = r.rankedGoals.find((g) => g.goal === 'HOLD_POST');
        expect(hold.tendencyWeight).toBeGreaterThan(1);
    });

    it('3. Flee-prone identity keeps survival winning', () => {
        const frame = frameFor('cow', COWARD);
        expect(frame.tendencies.flee).toBeGreaterThan(0.5);
        const r = mk().arbitrate('g', FEAR, {
            identityTendencies: frame.tendencies,
            identityWeight: 1
        });
        expect(r.winningGoal).toBe('SURVIVE');
        const survive = r.rankedGoals.find((g) => g.goal === 'SURVIVE');
        expect(survive.tendencyWeight).toBeGreaterThan(1);
    });

    it('4. Weights are bounded: identity bends, never inverts', () => {
        const frame = frameFor('guard', GUARD);
        const r = mk().arbitrate('g', FEAR, {
            identityTendencies: frame.tendencies,
            identityWeight: 1
        });
        for (const g of r.rankedGoals) {
            expect(g.tendencyWeight).toBeGreaterThanOrEqual(0.5);
            expect(g.tendencyWeight).toBeLessThanOrEqual(1.5);
        }
    });

    it('5. Neutral tendencies score exactly as legacy', () => {
        const plain = mk().arbitrate('g', FEAR);
        const neutral = mk().arbitrate('g', FEAR, {
            identityTendencies: { stand: 0.5, flee: 0.5, help: 0.5, investigate: 0.5, rally: 0.5 },
            identityWeight: 1
        });
        expect(neutral.winningGoal).toBe(plain.winningGoal);
        expect(neutral.winningScore).toBe(plain.winningScore);
    });

    it('6. Live AffectiveAgent frame feeds arbitration directly', () => {
        const frame = frameFor('live', GUARD);
        const e = new GoalArbitrationEngine();
        e.registerGoal('live', { type: 'PROTECT_ALLY', priority: 0.5 });
        e.registerGoal('live', { type: 'SURVIVE', priority: 0.7 });
        const r = e.arbitrate('live', FEAR, {
            identityTendencies: frame.tendencies,
            identityWeight: 1
        });
        // Guard help tendency (~0.31) weakens the ally goal; survival wins.
        expect(r.winningGoal).toBe('SURVIVE');
        const ally = r.rankedGoals.find((g) => g.goal === 'PROTECT_ALLY');
        expect(ally.tendencyWeight).toBeLessThan(1);
    });
});
