/**
 * @file memory-relevance-pathology.test.js
 *
 * Sections XV-XVII: deterministic relevance ranking over layered memory
 * plus the adversarial pathology battery.
 */

import { describe, it, expect } from '@jest/globals';
import { LayeredMemorySystem } from '../packages/core/src/LayeredMemorySystem.js';
import { MemoryRelevanceScorer, RELEVANCE_WEIGHTS } from '../packages/core/src/MemoryRelevanceScorer.js';
import { MemoryPathologyBattery, MEMORY_PATHOLOGY_PROBES } from '../packages/core/src/MemoryPathologyBattery.js';

function buildSystem() {
    const sys = new LayeredMemorySystem();
    sys.recordEpisodic({
        type: 'SURVIVED_AMBUSH', valence: -0.9, arousal: 0.9, salience: 0.8,
        participants: ['orc-7'], location: { x: 10, y: 0, z: 0 }, tick: 90
    });
    sys.recordEpisodic({
        type: 'RESOURCE_DISCOVERED', valence: 0.5, arousal: 0.2, salience: 0.4,
        participants: ['elf-2'], location: { x: 500, y: 0, z: 0 }, tick: 10
    });
    sys.recordSemantic('glen', 'SANCTUARY', { x: 12, y: 0, z: 0 }, 0.85, {}, 95);
    sys.tickCount = 100;
    return sys;
}

const CTX = {
    nowTick: 100,
    entityIds: ['orc-7'],
    position: { x: 12, y: 0, z: 0 },
    locationRadius: 50,
    goalTags: ['ambush']
};

describe('Section XVI: MemoryRelevanceScorer', () => {
    it('1. Ranks entity/location/goal-matching memory above distant trivia', () => {
        const out = new MemoryRelevanceScorer().rank(buildSystem(), CTX, 5);
        expect(out.evaluated).toBe(3);
        expect(out.ranked[0].type).toBe('SURVIVED_AMBUSH');
        expect(out.ranked[0].score).toBeGreaterThan(out.ranked[out.ranked.length - 1].score);
    });

    it('2. Returns per-factor breakdowns that reconstruct the score', () => {
        const out = new MemoryRelevanceScorer().rank(buildSystem(), CTX, 5);
        for (const r of out.ranked) {
            let recombined = 0;
            for (const [k, w] of Object.entries(RELEVANCE_WEIGHTS)) {
                recombined += w * r.factors[k];
            }
            expect(r.score).toBeCloseTo(recombined, 10);
            expect(r.score).toBeGreaterThanOrEqual(0);
            expect(r.score).toBeLessThanOrEqual(1);
        }
    });

    it('3. Empty context degrades gracefully (recency/importance only)', () => {
        const out = new MemoryRelevanceScorer().rank(buildSystem(), {}, 5);
        expect(out.evaluated).toBe(3);
        expect(out.ranked.length).toBe(3);
        for (const r of out.ranked) {
            expect(r.factors.entityMatch).toBe(0);
            expect(r.factors.goalRelevance).toBe(0);
        }
    });

    it('4. Ranking deterministic across repeated runs with tie-break order', () => {
        const scorer = new MemoryRelevanceScorer();
        const a = scorer.rank(buildSystem(), CTX, 5);
        const b = scorer.rank(buildSystem(), CTX, 5);
        expect(a).toEqual(b);
    });

    it('5. topK bounds respected (1..50) without mutating the memory store', () => {
        const sys = buildSystem();
        const before = JSON.stringify(sys.getState());
        const scorer = new MemoryRelevanceScorer();
        expect(scorer.rank(sys, CTX, 500).ranked.length).toBeLessThanOrEqual(50);
        expect(scorer.rank(sys, CTX, 0).ranked.length).toBeGreaterThanOrEqual(1);
        expect(JSON.stringify(sys.getState())).toBe(before);
    });
});

describe('Section XVII: MemoryPathologyBattery', () => {
    it('6. All eight probes pass against LayeredMemorySystem', () => {
        const report = new MemoryPathologyBattery().runAll();
        expect(report.probeCount).toBe(MEMORY_PATHOLOGY_PROBES.length);
        expect(report.allPass).toBe(true);
        expect(report.passCount).toBe(report.probeCount);
    });

    it('7. Battery deterministic across repeated runs', () => {
        const a = new MemoryPathologyBattery().runAll();
        const b = new MemoryPathologyBattery().runAll();
        expect(a).toEqual(b);
    });

    it('8. Battery touches advisory memory only (no host/world surface)', () => {
        const report = new MemoryPathologyBattery().runAll();
        for (const p of report.probes) {
            expect(p.observed).not.toMatch(/position|transform|inventory|damage/i);
        }
        expect(report.probes.map((p) => p.probe).sort()).toEqual([...MEMORY_PATHOLOGY_PROBES].sort());
    });
});
