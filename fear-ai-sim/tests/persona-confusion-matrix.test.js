import { describe, it, expect } from '@jest/globals';
import { FunctionalPersonaSignatures } from '../packages/core/index.js';
import { CANONICAL_ARCHETYPES } from '../benchmarks/behavioral-evaluation/fabe_v2_benchmark.mjs';

// NEXT-124: NxN persona confusion matrix (CCI-28 frontier 8). Seeded noisy
// twins are retrieved against the population; the diagonal is correct
// recall, off-diagonal cells name the architecture's blind spots.
describe('NEXT-124: persona confusion matrix', () => {
    const fps = new FunctionalPersonaSignatures();
    const nearNeighborPop = () => {
        const pop = [];
        for (const a of CANONICAL_ARCHETYPES) {
            pop.push({ id: a.id, traits: a.traits });
            pop.push({ id: `${a.id}+N`, traits: { ...a.traits, neuroticism: Math.min(1, a.traits.neuroticism + 0.1) } });
            pop.push({ id: `${a.id}+A`, traits: { ...a.traits, agreeableness: Math.min(1, a.traits.agreeableness + 0.1) } });
        }
        return pop;
    };

    it('1. Cartoon archetypes separate perfectly at low noise', () => {
        const m = fps.confusionMatrix(CANONICAL_ARCHETYPES, { twins: 5, noise: 0.05, seed: 777 });
        expect(m.total).toBe(60);
        expect(m.accuracy).toBe(1);
        expect(m.mistakes).toEqual([]);
        expect(m.nearestMistaken).toBe(null);
    });

    it('2. Near-neighbor confusion grows monotonically with noise', () => {
        const pop = nearNeighborPop();
        const low = fps.confusionMatrix(pop, { twins: 3, noise: 0.05, seed: 777 });
        const high = fps.confusionMatrix(pop, { twins: 3, noise: 0.15, seed: 777 });
        expect(low.accuracy).toBeGreaterThan(high.accuracy);
        expect(high.accuracy).toBeLessThan(1);
        expect(high.mistakes.length).toBeGreaterThan(0);
    });

    it('3. Mistakes name the nearest persona with counts', () => {
        const m = fps.confusionMatrix(nearNeighborPop(), { twins: 3, noise: 0.15, seed: 777 });
        expect(m.nearestMistaken.trueId).toBeDefined();
        expect(m.nearestMistaken.mistakenId).toBeDefined();
        expect(m.nearestMistaken.count).toBeGreaterThan(0);
        // Every off-diagonal count is backed by the matrix cells.
        for (const mt of m.mistakes) {
            expect(m.matrix[mt.trueId][mt.mistakenId]).toBe(mt.count);
        }
    });

    it('4. Per-trait confusion identifies the blurred dimensions', () => {
        const m = fps.confusionMatrix(nearNeighborPop(), { twins: 3, noise: 0.15, seed: 777 });
        // Neighbors differ on N and A: confused pairs must show it there.
        expect(m.perTraitConfusion.neuroticism).toBeGreaterThan(0);
        expect(m.perTraitConfusion.agreeableness).toBeGreaterThan(0);
        // Untouched dimensions stay near-identical among confused pairs.
        expect(m.perTraitConfusion.openness).toBeLessThan(m.perTraitConfusion.agreeableness);
    });

    it('5. Correct retrievals vote for strongest discriminating behavior', () => {
        const m = fps.confusionMatrix(CANONICAL_ARCHETYPES, { twins: 5, noise: 0.05, seed: 777 });
        const votes = m.strongestDiscriminators.reduce((s, d) => s + d.votes, 0);
        expect(votes).toBe(m.correct);
        expect(m.strongestDiscriminators[0].function).toBeDefined();
    });

    it('6. Matrix is deterministic on identical inputs', () => {
        const opts = { twins: 3, noise: 0.1, seed: 777 };
        expect(fps.confusionMatrix(nearNeighborPop(), opts))
            .toEqual(fps.confusionMatrix(nearNeighborPop(), opts));
    });
});
