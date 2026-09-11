import { describe, it, expect } from '@jest/globals';
import {
    GoalArbitrationEngine,
    GOAL_TYPES,
    LayeredMemorySystem,
    MemoryRelevanceScorer,
} from '../packages/core/index.js';

// NEXT-162 (post-25 candidate 2): memory-conditioned goal arbitration.
// Hot threat memories lift survival-goal relevance through opt-in
// context.memoryLoad, stacking additively with crystallized traumaLoad
// to a cap of 1. The load is computed live: top threat-memory relevance
// from MemoryRelevanceScorer over a LayeredMemorySystem.
const THREAT_TYPES = new Set(['SURVIVED_AMBUSH', 'NEAR_DEATH_PANIC', 'COMBAT_CONFRONTATION']);

function threatLoad(events, nowTick = 100) {
    const mem = new LayeredMemorySystem();
    for (const e of events) mem.recordEpisodic(e);
    const sc = new MemoryRelevanceScorer();
    const { ranked } = sc.rank(mem, { nowTick, goalTags: ['SURVIVE'] }, 5);
    const top = ranked.find((r) => THREAT_TYPES.has(r.type));
    return top ? top.score : 0;
}

const AMBUSH = (tick) => ({
    type: 'SURVIVED_AMBUSH', valence: -0.9, arousal: 0.9,
    intensity: 0.9, salience: 0.9, tick,
});

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

describe('NEXT-162: memory-conditioned goal arbitration', () => {
    it('1. Legacy default ignores memory: load 0 is exactly legacy', () => {
        const arb = new GoalArbitrationEngine();
        arb.registerGoal('g', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
        arb.registerGoal('g', { type: GOAL_TYPES.HOLD_POST, priority: 0.6 });
        const plain = arb.arbitrate('g', { fear: 0.3 }, {}).rankedGoals;
        expect(arb.arbitrate('g', { fear: 0.3 }, { memoryLoad: 0 }).rankedGoals).toEqual(plain);
        expect(crossover(0)).toBe(0.7);
    });

    it('2. A fresh ambush memory moves the crossover earlier', () => {
        const load = threatLoad([AMBUSH(95)]);
        expect(load).toBeGreaterThan(0.5);
        expect(crossover(load)).toBeLessThan(crossover(0));
    });

    it('3. Unrelated memories produce no load and no shift', () => {
        const load = threatLoad([
            { type: 'RESOURCE_DISCOVERED', valence: 0.8, arousal: 0.4, salience: 0.7, tick: 95 },
            { type: 'SAFE_SANCTUARY_DISCOVERED', valence: 0.9, arousal: 0.3, salience: 0.7, tick: 96 },
        ]);
        expect(load).toBe(0);
        expect(crossover(load)).toBe(crossover(0));
    });

    it('4. Stale memories fade: crossover walks back as now advances', () => {
        const fresh = threatLoad([AMBUSH(95)], 100);
        const stale = threatLoad([AMBUSH(95)], 1000);
        expect(stale).toBeLessThan(fresh);
        expect(crossover(stale)).toBeGreaterThanOrEqual(crossover(fresh));
    });

    it('5. Trauma and memory loads stack to the same cap', () => {
        const stacked = crossover(0, 0);
        expect(crossover(0.5, 0.5)).toBe(crossover(1, 0));
        expect(crossover(0.8, 0.8)).toBe(crossover(1, 0));
        expect(stacked).toBe(0.7);
    });

    it('6. Malformed memory loads degrade safely', () => {
        const arb = new GoalArbitrationEngine();
        arb.registerGoal('g', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
        const plain = arb.arbitrate('g', { fear: 0.3 }, {}).rankedGoals;
        const full = arb.arbitrate('g', { fear: 0.3 }, { memoryLoad: 1 }).rankedGoals;
        for (const bad of [NaN, -2, 'high']) {
            expect(arb.arbitrate('g', { fear: 0.3 }, { memoryLoad: bad }).rankedGoals).toEqual(plain);
        }
        expect(arb.arbitrate('g', { fear: 0.3 }, { memoryLoad: 99 }).rankedGoals).toEqual(full);
    });

    it('7. Pipeline replays exactly', () => {
        const run = () => crossover(threatLoad([AMBUSH(95), AMBUSH(80)]));
        expect(run()).toBe(run());
    });
});
