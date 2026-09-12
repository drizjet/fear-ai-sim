import { describe, it, expect } from '@jest/globals';
import { GoalArbitrationEngine, GOAL_TYPES } from '../packages/core/index.js';

// Post-25 audit candidate 14: why-not answers pinned over live goal arbitration.
// The explainer below is a small LOCAL test helper (not production code): it
// reconstructs score arithmetic from rankedGoals entries and answers "why not
// the loser" with the cited numbers plus a real counterfactual flip.

function round4(n) {
    return Number(Number(n).toFixed(4));
}

function setupDuel() {
    const e = new GoalArbitrationEngine();
    e.registerGoal('duelist', { type: GOAL_TYPES.HOLD_POST, priority: 0.45 });
    e.registerGoal('duelist', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
    return e;
}

// Local why-not helper: cites live rankedGoals entries only. Degrades to a
// generic answer (never throws) when the arbitration output is malformed.
function explainWhyNot(result, loserGoal) {
    const generic = (reason) => ({
        winner: null,
        loser: loserGoal,
        flipped: false,
        flippedScore: null,
        answer: `No arbitration ranking available; cannot say why ${loserGoal} lost (${reason}).`,
    });
    if (!result || !Array.isArray(result.rankedGoals) || result.rankedGoals.length === 0) {
        return generic('missing rankedGoals');
    }
    const winner = result.rankedGoals[0];
    const loser = result.rankedGoals.find((entry) => entry.goal === loserGoal);
    if (!loser || loser.goal === winner.goal) {
        return generic(loser ? 'goal already won' : 'loser not ranked');
    }
    const winnerProduct = round4(winner.priority * winner.relevance);
    const loserProduct = round4(loser.priority * loser.relevance);
    const flippedScore = round4(1.0 * loser.relevance);
    const flipped = flippedScore > winner.score;
    const answer =
        `${winner.goal} won over ${loser.goal} because ` +
        `${winner.priority} x ${winner.relevance} = ${winner.score} beats ` +
        `${loser.priority} x ${loser.relevance} = ${loser.score}.` +
        (flipped
            ? ` Raising ${loser.goal} priority to 1.0 would score ${flippedScore} and flip the winner.`
            : ` Even at priority 1.0, ${loser.goal} would score ${flippedScore} and still lose.`);
    return { winner: winner.goal, loser: loser.goal, winnerScore: winner.score, loserScore: loser.score, winnerProduct, loserProduct, flipped, flippedScore, answer };
}

// Recompute the ranking with the loser's priority raised to 1.0, reusing the
// live relevance values. Returns the resorted entries (real flip, not prose).
function recomputeWithMaxPriority(result, loserGoal) {
    const rescored = result.rankedGoals.map((entry) =>
        entry.goal === loserGoal
            ? { ...entry, priority: 1.0, score: round4(1.0 * entry.relevance) }
            : { ...entry }
    );
    rescored.sort((a, b) => b.score - a.score || (a.goal < b.goal ? -1 : 1));
    return rescored;
}

describe('Post-25 candidate 14: why-not answers over goal arbitration', () => {
    it('1. SURVIVE win at fear 0.8 is explained by live score arithmetic', () => {
        const e = setupDuel();
        const r = e.arbitrate('duelist', { fear: 0.8 });
        expect(r.winningGoal).toBe(GOAL_TYPES.SURVIVE);
        expect(r.winningScore).toBe(0.51);

        const survive = r.rankedGoals.find((g) => g.goal === GOAL_TYPES.SURVIVE);
        const hold = r.rankedGoals.find((g) => g.goal === GOAL_TYPES.HOLD_POST);
        // Pin the live entries: SURVIVE 0.6 x 0.85 = 0.51; HOLD_POST 0.45 x 1 = 0.45.
        expect(survive).toMatchObject({ priority: 0.6, relevance: 0.85, score: 0.51 });
        expect(hold).toMatchObject({ priority: 0.45, relevance: 1, score: 0.45 });
        // Reconstruct priority x relevance from the cited entries.
        expect(round4(survive.priority * survive.relevance)).toBe(survive.score);
        expect(round4(hold.priority * hold.relevance)).toBe(hold.score);

        const why = explainWhyNot(r, GOAL_TYPES.HOLD_POST);
        expect(why.winner).toBe(GOAL_TYPES.SURVIVE);
        expect(why.winnerProduct).toBe(survive.score);
        expect(why.loserProduct).toBe(hold.score);
        expect(why.answer).toContain('0.6 x 0.85 = 0.51');
        expect(why.answer).toContain('0.45 x 1 = 0.45');
    });

    it('2. HOLD_POST win at fear 0.1 cites survival relevance collapse', () => {
        const e = setupDuel();
        const r = e.arbitrate('duelist', { fear: 0.1 });
        expect(r.winningGoal).toBe(GOAL_TYPES.HOLD_POST);
        expect(r.winningScore).toBe(0.45);

        const survive = r.rankedGoals.find((g) => g.goal === GOAL_TYPES.SURVIVE);
        const hold = r.rankedGoals.find((g) => g.goal === GOAL_TYPES.HOLD_POST);
        // Pin the collapse: survival relevance falls to 0.325, score to 0.195.
        expect(survive).toMatchObject({ priority: 0.6, relevance: 0.325, score: 0.195 });
        expect(hold).toMatchObject({ priority: 0.45, relevance: 1, score: 0.45 });
        expect(round4(survive.priority * survive.relevance)).toBe(survive.score);

        const why = explainWhyNot(r, GOAL_TYPES.SURVIVE);
        expect(why.winner).toBe(GOAL_TYPES.HOLD_POST);
        expect(why.answer).toContain('0.6 x 0.325 = 0.195');
        expect(why.answer).toContain('0.45 x 1 = 0.45');
    });

    it('3. Counterfactual: maxing the loser priority flips the winner', () => {
        const e = setupDuel();
        const r = e.arbitrate('duelist', { fear: 0.8 });
        expect(r.winningGoal).toBe(GOAL_TYPES.SURVIVE);

        const rescored = recomputeWithMaxPriority(r, GOAL_TYPES.HOLD_POST);
        // HOLD_POST at 1.0 x relevance 1 = 1.0 beats SURVIVE at 0.51.
        expect(rescored[0].goal).toBe(GOAL_TYPES.HOLD_POST);
        expect(rescored[0].score).toBe(1);
        expect(rescored[0].score).toBeGreaterThan(rescored[1].score);

        const why = explainWhyNot(r, GOAL_TYPES.HOLD_POST);
        expect(why.flipped).toBe(true);
        expect(why.flippedScore).toBe(1);
        expect(why.answer).toMatch(/flip the winner/);
    });

    it('4. Malformed arbitration output degrades to a generic answer', () => {
        expect(() => explainWhyNot(null, GOAL_TYPES.SURVIVE)).not.toThrow();
        expect(() => explainWhyNot({}, GOAL_TYPES.SURVIVE)).not.toThrow();
        expect(() => explainWhyNot({ rankedGoals: null }, GOAL_TYPES.SURVIVE)).not.toThrow();
        expect(() => explainWhyNot({ rankedGoals: [] }, GOAL_TYPES.SURVIVE)).not.toThrow();

        for (const bad of [null, {}, { rankedGoals: null }, { rankedGoals: [] }]) {
            const why = explainWhyNot(bad, GOAL_TYPES.SURVIVE);
            expect(why.winner).toBeNull();
            expect(why.flipped).toBe(false);
            expect(why.answer).toMatch(/No arbitration ranking available/);
            expect(why.answer).toContain(GOAL_TYPES.SURVIVE);
        }
        // Unknown loser goal also degrades without throwing.
        const e = setupDuel();
        const r = e.arbitrate('duelist', { fear: 0.8 });
        const unknown = explainWhyNot(r, 'BOGUS_GOAL');
        expect(unknown.winner).toBeNull();
        expect(unknown.answer).toMatch(/No arbitration ranking available/);
    });

    it('5. Arbitration replay is exact', () => {
        const e = setupDuel();
        const r1 = e.arbitrate('duelist', { fear: 0.8 });
        const r2 = e.arbitrate('duelist', { fear: 0.8 });
        expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
        const why1 = explainWhyNot(r1, GOAL_TYPES.HOLD_POST);
        const why2 = explainWhyNot(r2, GOAL_TYPES.HOLD_POST);
        expect(why1).toEqual(why2);
    });
});
