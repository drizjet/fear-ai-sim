/**
 * @file lod-identity-restoration.test.js
 *
 * Section LXXVII: memories survive abstraction. An agent with layered,
 * rumor, route, and place memory is sealed (demote), its live stores keep
 * evolving without it, and on restore (promote) rehydrated stores recall
 * exactly what was sealed — not what happened while abstracted.
 */

import { describe, it, expect } from '@jest/globals';
import { IdentityVault } from '../packages/core/src/IdentityVault.js';
import { LayeredMemorySystem } from '../packages/core/src/LayeredMemorySystem.js';
import { RumorMemory } from '../packages/core/src/RumorMemory.js';
import { RouteMemory } from '../packages/core/src/RouteMemory.js';
import { PlaceMemory } from '../packages/core/src/PlaceMemory.js';
import { MemoryRelevanceScorer } from '../packages/core/src/MemoryRelevanceScorer.js';

function buildStores() {
    const layered = new LayeredMemorySystem();
    layered.recordEpisodic({ type: 'SURVIVED_AMBUSH', valence: -0.9, arousal: 0.9, salience: 0.85, participants: ['orc-7'], tick: 90 });
    layered.recordSemantic('glen', 'SANCTUARY', { x: 12, y: 0, z: 0 }, 0.85, {}, 95);
    layered.tickCount = 100;
    const rumors = new RumorMemory();
    rumors.hear({ id: 'r1', topic: 'ROAD_AMBUSH', claim: 'ambush north', confidence: 0.9 }, 0.9, 95);
    const routes = new RouteMemory();
    routes.recordTraversal('north-road', { safe: true, tick: 90 });
    const places = new PlaceMemory();
    places.recordVisit('mill', { location: { x: 5, y: 0, z: 0 }, tick: 80 });
    return { layered, rumors, routes, places };
}

function snapshotAll(s) {
    return {
        layered: s.layered.getState(),
        rumors: s.rumors.getState(),
        routes: s.routes.getState(),
        places: s.places.getState()
    };
}

function rehydrate(snap) {
    const layered = new LayeredMemorySystem();
    layered.setState(snap.layered);
    const rumors = new RumorMemory();
    rumors.setState(snap.rumors);
    const routes = new RouteMemory();
    routes.setState(snap.routes);
    const places = new PlaceMemory();
    places.setState(snap.places);
    return { layered, rumors, routes, places };
}

describe('Section LXXVII: LOD identity restoration with memory', () => {
    it('1. Sealed memory restores exactly after live stores evolve', () => {
        const live = buildStores();
        const vault = new IdentityVault();
        vault.seal('scout', {
            identity: { neuroticism: 0.6, resilience: 0.4 },
            adaptive: { trust: 0.7 },
            tick: 100,
            memory: snapshotAll(live)
        });

        // Life goes on without the abstracted agent: live stores mutate.
        live.layered.recordEpisodic({ type: 'RESOURCE_DISCOVERED', salience: 0.3, tick: 150 });
        live.rumors.hear({ id: 'r2', topic: 'T', claim: 'new', confidence: 0.5 }, 0.5, 150);
        live.routes.recordIncident('north-road', 0.9, 150);
        live.places.recordFearEvent('mill', 1.0, { tick: 150 });

        const restored = vault.restore('scout');
        expect(restored.fidelity.memoryExact).toBe(true);
        const back = rehydrate(restored.memory);

        // Sealed recall, not live recall: the ambush episodic survives, the
        // post-seal trivia never entered the vault.
        expect(back.layered.retrieveEpisodic({ participantId: 'orc-7' }).length).toBe(1);
        expect(back.layered.retrieveEpisodic({ minSalience: 0 }).some((e) => e.type === 'RESOURCE_DISCOVERED')).toBe(false);
        expect(back.rumors.recall().map((r) => r.id)).toEqual(['r1']);
        expect(back.routes.danger('north-road')).toBeLessThan(0.5);
        expect(back.places.attachment('mill')).toBeGreaterThan(0);
    });

    it('2. Live mutation never corrupts the sealed copy (double isolation)', () => {
        const live = buildStores();
        const vault = new IdentityVault();
        const preSeal = JSON.stringify(snapshotAll(live));
        vault.seal('scout', { identity: { n: 0.5 }, tick: 100, memory: snapshotAll(live) });
        live.rumors.correct('r1', { source: 'captain' });
        live.places.recordFearEvent('mill', 1.0, { tick: 101 });
        const restored = vault.restore('scout');
        expect(JSON.stringify(restored.memory.rumors)).toBe(JSON.stringify(JSON.parse(preSeal).rumors));
        expect(restored.memory.places.places[0].attachment).toBeGreaterThan(0);
    });

    it('3. Restored agent recalls through the relevance scorer', () => {
        const live = buildStores();
        const vault = new IdentityVault();
        vault.seal('scout', { identity: { n: 0.5 }, tick: 100, memory: snapshotAll(live) });
        const back = rehydrate(vault.restore('scout').memory);
        const out = new MemoryRelevanceScorer().rank(
            back.layered,
            { nowTick: 100, entityIds: ['orc-7'], goalTags: ['ambush'] },
            5,
            [back.rumors, back.routes, back.places]
        );
        const types = out.ranked.map((r) => r.type);
        expect(types).toContain('SURVIVED_AMBUSH');
        expect(types).toContain('RUMOR:ROAD_AMBUSH');
    });

    it('4. Seal without memory stays valid (backwards compatible)', () => {
        const vault = new IdentityVault();
        const receipt = vault.seal('minimal', { identity: { n: 0.5 } });
        expect(receipt.memorySealed).toBe(false);
        const restored = vault.restore('minimal');
        expect(restored.memory).toBeNull();
        expect(restored.fidelity.memoryExact).toBe(false);
    });
});
