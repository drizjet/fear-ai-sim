import { describe, it, expect } from '@jest/globals';
import {
    GoalArbitrationEngine,
    GOAL_TYPES,
    LayeredMemorySystem,
    MemoryRelevanceScorer,
    RumorMemory,
} from '../packages/core/index.js';

// Post-25 audit candidate 21: RumorMemory x GoalArbitration relevance.
// Live rumor memories recalled through MemoryRelevanceScorer.rank (via the
// extraStores channel) produce a memoryLoad that moves the arbitration
// crossover earlier, exactly like episodic threat memories did (NEXT-162).
// The survival-relevant load is the top score among SURVIVE-goal-relevant
// rumor candidates (ranker goalRelevance factor === 1), mirroring how
// NEXT-162 filtered ranked memories to THREAT_TYPES.
function rumorLoad(rumorStore, nowTick = 100) {
    const mem = new LayeredMemorySystem();
    const sc = new MemoryRelevanceScorer();
    const { ranked } = sc.rank(mem, { nowTick, goalTags: ['SURVIVE'] }, 5, [rumorStore]);
    const top = ranked.find((r) => r.factors && r.factors.goalRelevance === 1);
    return top ? top.score : 0;
}

function rawTopRumorLoad(rumorStore, nowTick = 100) {
    const mem = new LayeredMemorySystem();
    const sc = new MemoryRelevanceScorer();
    const { ranked } = sc.rank(mem, { nowTick, goalTags: ['SURVIVE'] }, 5, [rumorStore]);
    const top = ranked.find((r) => String(r.type || '').startsWith('RUMOR'));
    return top ? top.score : 0;
}

const ARMY_RUMOR = {
    id: 'r-army',
    topic: 'SURVIVE',
    claim: 'survive army ambush tonight flee north',
    confidence: 0.95,
};

function hotRumorStore() {
    const rm = new RumorMemory();
    rm.hear({ ...ARMY_RUMOR }, 1.0, 95);
    return rm;
}

function crossover(load, trauma = 0) {
    const arb = new GoalArbitrationEngine();
    arb.registerGoal('g', { type: GOAL_TYPES.HOLD_POST, priority: 0.45 });
    arb.registerGoal('g', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
    for (let f = 0; f <= 1.0001; f += 0.05) {
        const r = arb.arbitrate('g', { fear: f }, { traumaLoad: trauma, memoryLoad: load });
        if (r.winningGoal !== GOAL_TYPES.HOLD_POST) return Math.round(f * 100) / 100;
    }
    return Infinity;
}

describe('candidate 21: rumor-memory-conditioned goal arbitration', () => {
    it('1. A hot army rumor yields load above 0.5 and an earlier crossover', () => {
        const rm = hotRumorStore();
        const cands = rm.recallCandidates();
        expect(cands).toHaveLength(1);
        expect(cands[0].type).toBe('RUMOR:SURVIVE');
        const load = rumorLoad(rm);
        expect(load).toBe(0.5832051496363128);
        expect(load).toBeGreaterThan(0.5);
        expect(crossover(load)).toBe(0.6);
        expect(crossover(load)).toBeLessThan(crossover(0));
        expect(crossover(0)).toBe(0.7);
    });

    it('2. Corrected/decayed rumors yield ~0 load; disconfirmation weakens below threshold', () => {
        const corrected = hotRumorStore();
        expect(corrected.correct('r-army', { source: 'command' })).toBe(true);
        expect(corrected.recallCandidates()).toEqual([]);
        expect(rumorLoad(corrected)).toBe(0);
        expect(crossover(rumorLoad(corrected))).toBe(crossover(0));

        const decayed = hotRumorStore();
        decayed.tick(2000);
        expect(decayed.size).toBe(0);
        expect(decayed.recall()).toEqual([]);
        expect(rumorLoad(decayed, 2100)).toBe(0);

        const doubted = hotRumorStore();
        expect(doubted.disconfirm('r-army')).toBe(true);
        const doubtLoad = rumorLoad(doubted);
        expect(doubtLoad).toBe(0.4407051496363128);
        expect(doubtLoad).toBeLessThan(0.5);
    });

    it('3. Unrelated rumor topics yield no survival-filtered shift', () => {
        const rm = new RumorMemory();
        rm.hear(
            { id: 'r-harvest', topic: 'HARVEST', claim: 'harvest festival bread prices rise', confidence: 0.95 },
            1.0,
            95,
        );
        expect(rumorLoad(rm)).toBe(0);
        expect(crossover(rumorLoad(rm))).toBe(crossover(0));
        // Honest raw-score note: the ranker still scores the unrelated rumor
        // via recency + importance (goalRelevance 0), so an UNFILTERED top-
        // rumor load would read 0.4832051496363128 and shift crossover. The
        // survival channel pinned here filters to goal-relevant candidates.
        expect(rawTopRumorLoad(rm)).toBe(0.4832051496363128);
    });

    it('4. Stale rumors fade: load drops and crossover walks back', () => {
        const rm = hotRumorStore();
        const fresh = rumorLoad(rm, 100);
        const stale = rumorLoad(rm, 1000);
        expect(stale).toBe(0.3483587360925182);
        expect(stale).toBeLessThan(fresh);
        expect(crossover(stale)).toBe(0.65);
        expect(crossover(stale)).toBeGreaterThanOrEqual(crossover(fresh));
    });

    it('5. Malformed rumor stores and malformed loads degrade safely', () => {
        const mem = new LayeredMemorySystem();
        const sc = new MemoryRelevanceScorer();
        const ctx = { nowTick: 100, goalTags: ['SURVIVE'] };
        const throwing = { recallCandidates() { throw new Error('boom'); } };
        const nullReturning = { recallCandidates: () => null };
        const junkReturning = { recallCandidates: () => 'junk' };
        const noMethod = {};
        for (const bad of [throwing, nullReturning, junkReturning, noMethod]) {
            const res = sc.rank(mem, ctx, 5, [bad]);
            expect(res.evaluated).toBe(0);
            expect(res.ranked).toEqual([]);
        }
        expect(sc.rank(null, ctx, 5, 'junk').ranked).toEqual([]);

        const arb = new GoalArbitrationEngine();
        arb.registerGoal('g', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
        const plain = arb.arbitrate('g', { fear: 0.3 }, {}).rankedGoals;
        for (const bad of [NaN, -2, 'high']) {
            expect(arb.arbitrate('g', { fear: 0.3 }, { memoryLoad: bad }).rankedGoals).toEqual(plain);
        }
    });

    it('6. Pipeline replays exactly', () => {
        const run = () => crossover(rumorLoad(hotRumorStore()));
        expect(run()).toBe(run());
        expect(run()).toBe(0.6);
    });
});
