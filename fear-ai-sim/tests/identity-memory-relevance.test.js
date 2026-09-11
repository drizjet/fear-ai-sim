import { describe, it, expect } from '@jest/globals';
import { MemoryRelevanceScorer } from '../packages/core/index.js';

// NEXT-142: identity-modulated memory relevance (audit candidate 6).
// Opt-in ctx.identity ({ neuroticism }) tints the emotional-salience
// factor: neurotic agents relive hot memories, calm agents file them
// away. Absent or neutral identity reproduces legacy scores exactly.
describe('NEXT-142: identity tints memory relevance', () => {
    const scorer = new MemoryRelevanceScorer();
    const hot = { id: 'hot-old', tick: -400, arousal: 1.0, valence: -1.0, salience: 0.6, participants: [], details: {} };
    const cold = { id: 'cold-new', tick: 0, arousal: 0.1, valence: 0.2, salience: 0.6, participants: [], details: {} };
    const store = { episodic: [hot, cold], semantic: [] };
    const ctx = (n) => {
        const c = { nowTick: 0 };
        if (n !== undefined) c.identity = { neuroticism: n };
        return c;
    };
    const top = (n) => scorer.rank(store, ctx(n), 2).ranked.map((r) => r.id);

    it('1. Absent or neutral identity reproduces legacy scores exactly', () => {
        const legacy = scorer.scoreEpisodic(hot, ctx(undefined));
        expect(scorer.scoreEpisodic(hot, ctx(0.5))).toEqual(legacy);
    });

    it('2. Neurotic agents score hot memories higher, calm agents lower', () => {
        const base = scorer.scoreEpisodic(hot, ctx(undefined)).score;
        expect(scorer.scoreEpisodic(hot, ctx(1)).score).toBeGreaterThan(base);
        expect(scorer.scoreEpisodic(hot, ctx(0)).score).toBeLessThan(base);
    });

    it('3. Identity flips recall order: trauma first vs recent first', () => {
        expect(top(undefined)).toEqual(['cold-new', 'hot-old']);
        expect(top(0)).toEqual(['cold-new', 'hot-old']);
        expect(top(1)).toEqual(['hot-old', 'cold-new']);
    });

    it('4. Low-salience memories barely move under identity', () => {
        const a = scorer.scoreEpisodic(cold, ctx(undefined)).score;
        expect(scorer.scoreEpisodic(cold, ctx(1)).score).toBeCloseTo(a, 2);
        expect(scorer.scoreEpisodic(cold, ctx(0)).score).toBeCloseTo(a, 2);
    });

    it('5. Missing or NaN identity degrades to legacy; extremes clamp', () => {
        const legacy = scorer.scoreEpisodic(hot, ctx(undefined));
        for (const bad of [{}, { neuroticism: NaN }, { neuroticism: 'high' }]) {
            expect(scorer.scoreEpisodic(hot, { nowTick: 0, identity: bad })).toEqual(legacy);
        }
        expect(scorer.scoreEpisodic(hot, { nowTick: 0, identity: { neuroticism: 99 } }))
            .toEqual(scorer.scoreEpisodic(hot, ctx(1)));
        expect(scorer.scoreEpisodic(hot, { nowTick: 0, identity: { neuroticism: -3 } }))
            .toEqual(scorer.scoreEpisodic(hot, ctx(0)));
    });

    it('6. Rankings are exactly reproducible', () => {
        expect(scorer.rank(store, ctx(1), 2)).toEqual(scorer.rank(store, ctx(1), 2));
    });
});
