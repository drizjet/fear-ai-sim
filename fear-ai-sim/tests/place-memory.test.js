/**
 * @file place-memory.test.js
 *
 * Section XV: PlaceMemory lifecycle plus the full XV taxonomy verdict —
 * every class mapped to its system, so the taxonomy audit is executable
 * rather than prose.
 */

import { describe, it, expect } from '@jest/globals';
import { PlaceMemory } from '../packages/core/src/PlaceMemory.js';
import { MemoryRelevanceScorer } from '../packages/core/src/MemoryRelevanceScorer.js';
import { LayeredMemorySystem } from '../packages/core/src/LayeredMemorySystem.js';

describe('Section XV: PlaceMemory lifecycle', () => {
    it('1. Safe visits build fondness with saturation', () => {
        const pm = new PlaceMemory();
        for (let i = 0; i < 10; i++) pm.recordVisit('mill', { location: { x: 5, y: 0, z: 0 }, tick: i });
        const a = pm.attachment('mill');
        expect(a).toBeGreaterThan(0.3);
        expect(a).toBeLessThanOrEqual(1.0);
        expect(pm.attachment('unknown')).toBe(0);
    });

    it('2. Fear event imprints dread over fondness', () => {
        const pm = new PlaceMemory();
        for (let i = 0; i < 10; i++) pm.recordVisit('mill', { tick: i });
        const before = pm.attachment('mill');
        pm.recordFearEvent('mill', 0.9, { tick: 11 });
        expect(pm.attachment('mill')).toBeLessThan(before);
    });

    it('3. Attachment relaxes without visits; faint traces evicted', () => {
        const pm = new PlaceMemory();
        pm.recordVisit('hut', { tick: 1 });
        const early = pm.attachment('hut');
        pm.tick(5000);
        expect(Math.abs(pm.attachment('hut') || 0)).toBeLessThan(Math.abs(early));
    });

    it('4. Haunted places compete in relevance ranking', () => {
        const mem = new LayeredMemorySystem();
        mem.recordEpisodic({ type: 'RESOURCE_DISCOVERED', salience: 0.2, tick: 10 });
        mem.tickCount = 100;
        const pm = new PlaceMemory();
        pm.recordFearEvent('mill', 1.0, { location: { x: 5, y: 0, z: 0 }, tick: 95 });
        const out = new MemoryRelevanceScorer().rank(
            mem,
            { nowTick: 100, position: { x: 6, y: 0, z: 0 }, goalTags: ['mill'] },
            5,
            [pm]
        );
        expect(out.evaluated).toBe(2);
        expect(out.ranked[0].type).toBe('PLACE_ATTACHMENT');
    });

    it('5. State round-trips and ranking is read-only', () => {
        const pm = new PlaceMemory();
        pm.recordVisit('mill', { tick: 1 });
        const snap = pm.getState();
        const pm2 = new PlaceMemory();
        pm2.setState(snap);
        expect(pm2.getState()).toEqual(snap);
        const mem = new LayeredMemorySystem();
        const scorer = new MemoryRelevanceScorer();
        const before = JSON.stringify(pm.getState());
        scorer.rank(mem, {}, 5, [pm]);
        expect(JSON.stringify(pm.getState())).toBe(before);
    });
});

describe('Section XV: taxonomy coverage verdict (executable)', () => {
    it('6. Every XV class resolves to an implemented store', async () => {
        const core = await import('../packages/core/index.js');
        const mapping = {
            sensory: 'LayeredMemorySystem',
            episodic: 'LayeredMemorySystem',
            threat: 'LayeredMemorySystem',
            trauma: 'LayeredMemorySystem',
            social: 'RelationshipTensorSystem',
            relationship: 'RelationshipTensorSystem',
            place: 'PlaceMemory',
            route: 'RouteMemory',
            rumor: 'RumorMemory',
            faction: 'FactionSystem'
        };
        for (const [, symbol] of Object.entries(mapping)) {
            expect(core[symbol]).toBeDefined();
        }
        expect(typeof core.PlaceMemory).toBe('function');
    });
});
