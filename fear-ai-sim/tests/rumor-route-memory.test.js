/**
 * @file rumor-route-memory.test.js
 *
 * Section XV: RumorMemory and RouteMemory lifecycle plus relevance
 * competition against episodic recall.
 */

import { describe, it, expect } from '@jest/globals';
import { RumorMemory } from '../packages/core/src/RumorMemory.js';
import { RouteMemory } from '../packages/core/src/RouteMemory.js';
import { MemoryRelevanceScorer } from '../packages/core/src/MemoryRelevanceScorer.js';
import { LayeredMemorySystem } from '../packages/core/src/LayeredMemorySystem.js';

const RUMOR = { id: 'r1', topic: 'ROAD_AMBUSH', claim: 'ambush on north road', source: 'elder', origin: 'scout', confidence: 0.9 };

describe('Section XV: RumorMemory lifecycle', () => {
    it('1. First hearing creates belief scaled by source trust', () => {
        const rm = new RumorMemory();
        const hi = rm.hear(RUMOR, 1.0, 10);
        const lo = new RumorMemory().hear(RUMOR, 0.0, 10);
        expect(hi.confidence).toBeCloseTo(0.9, 10);
        expect(lo.confidence).toBeCloseTo(0.45, 10);
        expect(hi.status).toBe('BELIEVED');
    });

    it('2. Rehearing reinforces with saturation cap', () => {
        const rm = new RumorMemory();
        rm.hear(RUMOR, 1.0, 10);
        for (let i = 0; i < 30; i++) rm.hear(RUMOR, 1.0, 11 + i);
        expect(rm.entries.get('r1').confidence).toBeLessThanOrEqual(1.0);
        expect(rm.entries.get('r1').hearCount).toBe(31);
        expect(rm.size).toBe(1);
    });

    it('3. Correction buries belief but remembers being fooled', () => {
        const rm = new RumorMemory();
        rm.hear(RUMOR, 1.0, 10);
        expect(rm.correct('r1', { source: 'captain' })).toBe(true);
        expect(rm.entries.get('r1').status).toBe('CORRECTED');
        expect(rm.recall().length).toBe(0);
        // Rehearing a corrected rumor does not resurrect it.
        rm.hear(RUMOR, 1.0, 20);
        expect(rm.recall().length).toBe(0);
    });

    it('4. Unreinforced rumors decay and are forgotten with audit', () => {
        const rm = new RumorMemory();
        rm.hear({ ...RUMOR, confidence: 0.3 }, 0.5, 1);
        const forgotten = rm.tick(1000);
        expect(forgotten).toContain('r1');
        expect(rm.recall().length).toBe(0);
        expect(rm.forgottenLog.length).toBe(1);
    });

    it('5. Store bounded under rumor flood; corrections survive eviction', () => {
        const rm = new RumorMemory({ maxEntries: 10 });
        rm.hear(RUMOR, 1.0, 1);
        rm.correct('r1', { source: 'captain' });
        for (let i = 0; i < 40; i++) {
            rm.hear({ id: `rx${i}`, topic: 'T', claim: `c${i}`, confidence: 0.2 }, 0.2, 2);
        }
        expect(rm.size).toBeLessThanOrEqual(10);
        expect(rm.entries.has('r1')).toBe(true);
    });

    it('6. State round-trips through getState/setState', () => {
        const rm = new RumorMemory();
        rm.hear(RUMOR, 0.8, 5);
        const snap = rm.getState();
        const rm2 = new RumorMemory();
        rm2.setState(snap);
        expect(rm2.getState()).toEqual(snap);
        expect(rm2.recall().length).toBe(1);
    });
});

describe('Section XV: RouteMemory familiarity', () => {
    it('7. Safe traversals build familiarity and calm danger', () => {
        const routes = new RouteMemory();
        for (let i = 0; i < 5; i++) routes.recordTraversal('north-road', { safe: true, tick: i });
        expect(routes.familiarity('north-road')).toBeGreaterThan(0.3);
        expect(routes.danger('north-road')).toBeLessThan(0.5);
        expect(routes.danger('unknown-road')).toBe(0.5);
    });

    it('8. Incident collapses familiarity and spikes danger', () => {
        const routes = new RouteMemory();
        for (let i = 0; i < 5; i++) routes.recordTraversal('north-road', { safe: true, tick: i });
        const before = routes.familiarity('north-road');
        routes.recordIncident('north-road', 0.9, 10);
        expect(routes.familiarity('north-road')).toBeLessThan(before);
        expect(routes.danger('north-road')).toBeGreaterThan(0.6);
    });

    it('9. Disuse fades faint traces; danger relaxes toward prior', () => {
        const routes = new RouteMemory();
        routes.recordTraversal('old-path', { safe: true, tick: 1 });
        routes.tick(5000);
        expect(routes.familiarity('old-path')).toBeLessThan(0.1);
    });
});

describe('Sections XV-XVI: rumor/route recall competes in relevance ranking', () => {
    function rig() {
        const mem = new LayeredMemorySystem();
        mem.recordEpisodic({ type: 'RESOURCE_DISCOVERED', salience: 0.3, tick: 10 });
        mem.tickCount = 100;
        const rumors = new RumorMemory();
        rumors.hear(RUMOR, 0.9, 95);
        const routes = new RouteMemory();
        routes.recordTraversal('north-road', { safe: true, tick: 90 });
        return { mem, rumors, routes };
    }

    it('10. Ambush rumor outranks distant trivia for ambush context', () => {
        const { mem, rumors, routes } = rig();
        const out = new MemoryRelevanceScorer().rank(mem, { nowTick: 100, goalTags: ['ambush'] }, 5, [rumors, routes]);
        expect(out.evaluated).toBe(3);
        expect(out.ranked[0].type).toBe('RUMOR:ROAD_AMBUSH');
    });

    it('11. Corrected rumors never surface in ranking', () => {
        const { mem, rumors, routes } = rig();
        rumors.correct('r1', { source: 'captain' });
        const out = new MemoryRelevanceScorer().rank(mem, { nowTick: 100, goalTags: ['ambush'] }, 5, [rumors, routes]);
        expect(out.ranked.some((r) => String(r.type).startsWith('RUMOR:'))).toBe(false);
    });

    it('12. Extra stores deterministic and read-only', () => {
        const { mem, rumors, routes } = rig();
        const ctx = { nowTick: 100, goalTags: ['ambush'] };
        const scorer = new MemoryRelevanceScorer();
        expect(scorer.rank(mem, ctx, 5, [rumors, routes])).toEqual(scorer.rank(mem, ctx, 5, [rumors, routes]));
        const before = JSON.stringify([rumors.getState(), routes.getState()]);
        scorer.rank(mem, ctx, 5, [rumors, routes]);
        expect(JSON.stringify([rumors.getState(), routes.getState()])).toBe(before);
    });
});
