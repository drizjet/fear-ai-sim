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

/**
 * Post-25 audit candidate 23: cognitive LOD identity-restoration soak.
 *
 * Hypothesis: agents vaulted to the lowest LOD (LOD4 dormant) and restored
 * to full simulation keep personality, important memories, relationships,
 * and personal history. Uses live LodDirector + IdentityVault +
 * LodVaultCycle objects end to end (no mocked vault). Pinned 2026-09-11:
 * 12 citizens x full vault->LOD4->restore cycle restore bit-identical;
 * 144 repeated seal/restore pairs introduce zero drift; mid-threat and
 * mid-trauma snapshots restore without exceptions; malformed requests
 * degrade to loud protocol errors / safe skips; replay is byte-identical.
 * Measured boundaries pinned explicitly: bond cap 12 (droppedEdges
 * counted), non-finite traits coerce to 0.5, non-contracted top-level
 * snapshot fields do not ride the vault.
 */
describe('Candidate 23: cognitive LOD identity-restoration soak', () => {
    const SOAK_N = 12;
    const SOAK_CYCLES = 12;
    const cloneJson = (v) => JSON.parse(JSON.stringify(v));
    const edgeScore = (e) => Math.abs(e.trust || 0) + (e.familiarity || 0);
    const sortedBonds = (rels) =>
        [...rels].sort((a, b) => edgeScore(b) - edgeScore(a)).map((e) => ({ ...e }));

    function buildCitizen(i, n) {
        const traitNames = ['neuroticism', 'resilience', 'openness', 'loyalty', 'riskTolerance', 'discipline'];
        const identity = {};
        for (let k = 0; k < traitNames.length; k++) {
            identity[traitNames[k]] = ((i * 37 + k * 53 + 11) % 97) / 100;
        }
        const edgeCount = 4 + (i % 5); // 4..8 edges: under the 12-edge vault cap
        const relationships = [];
        for (let k = 0; k < edgeCount; k++) {
            relationships.push({
                targetId: `citizen-${(i + k + 1) % n}`,
                trust: 0.9 - 0.08 * k - 0.01 * i,
                familiarity: 0.75 - 0.05 * k - 0.005 * i
            });
        }
        const midThreat = i === 3 || i === 7;
        return {
            identity,
            adaptive: {
                trust: 0.2 + 0.05 * i,
                courage: 0.8 - 0.04 * i,
                caution: 0.1 + 0.06 * i,
                fear: midThreat ? 1.0 : 0.05 * i
            },
            relationships,
            memory: {
                episodic: [
                    { type: `OATH_SWORN_${i}`, tick: 80 + i, salience: 0.9 },
                    { type: `MARKET_DAY_${i}`, tick: 85 + i, salience: 0.3 }
                ],
                semantic: { home: `hall-${i}`, trade: `craft-${i % 4}` },
                // Personal history ledger rides inside the memory blob.
                ledger: [
                    { event: 'REGISTERED', tick: 10 + i },
                    { event: 'PROMOTED_LOD0', tick: 20 + i },
                    { event: midThreat ? 'THREAT_SIGHTED' : 'QUIET_WATCH', tick: 90 + i }
                ]
            },
            trauma: midThreat
                ? { activeThreat: true, fear: 1.0, phobias: [`warg-${i}`], sinceTick: 90 + i }
                : { activeThreat: false, fear: 0.05 * i, phobias: [] },
            tick: 100
        };
    }

    function buildTown(n = SOAK_N) {
        const live = {};
        for (let i = 0; i < n; i++) live[`citizen-${i}`] = buildCitizen(i, n);
        return live;
    }

    async function cycleRig(live) {
        const { LodDirector } = await import('../packages/core/src/LodDirector.js');
        const { LodVaultCycle } = await import('../packages/core/src/LodVaultCycle.js');
        const director = new LodDirector({ demoteHysteresisTicks: 1, promoteHysteresisTicks: 1 });
        const vault = new IdentityVault();
        const consumed = {};
        const cycle = new LodVaultCycle({
            director,
            vault,
            snapshotProvider: (id) => cloneJson(live[id]),
            restoreConsumer: (id, restored) => { consumed[id] = restored; }
        });
        return { director, vault, consumed, cycle };
    }

    function demoteAll(rig, ids) {
        for (const id of ids) {
            rig.director.register(id, { priority: 0 });
            rig.director.observe(id, { fear: 0, visible: false });
        }
        let out;
        for (let s = 0; s < 3; s++) out = rig.cycle.step({ lod0Cap: 0, lod1Cap: 0 });
        return out;
    }

    function promoteAll(rig, ids) {
        for (const id of ids) rig.director.observe(id, { fear: 0.9, visible: true, priority: 1 });
        let out;
        for (let s = 0; s < 3; s++) out = rig.cycle.step({ lod0Cap: 64, lod1Cap: 256 });
        return out;
    }

    it('1. Population vaulted to LOD4 restores traits, memories, relationships, history identical', async () => {
        const live = buildTown();
        const pristine = cloneJson(live);
        const ids = Object.keys(live);
        const rig = await cycleRig(live);
        const demoted = demoteAll(rig, ids);
        // Pinned: every citizen reaches the lowest tier and seals.
        for (const id of ids) expect(demoted.assignments[id]).toBe('LOD4');
        expect(rig.vault.sealedCount()).toBe(SOAK_N);
        expect(rig.cycle.stats().sealed).toBe(SOAK_N);
        // Life goes on without the abstracted town: live state mutates hard.
        for (const id of ids) {
            live[id].adaptive.trust = -999;
            live[id].memory.episodic.push({ type: 'POST_SEAL_RUMOR', tick: 200, salience: 0.1 });
            live[id].memory.ledger.push({ event: 'SEALED_YEARS', tick: 200 });
            live[id].trauma.fear = -1;
        }
        promoteAll(rig, ids);
        expect(rig.cycle.stats().restored).toBe(SOAK_N);
        expect(rig.cycle.stats().skipped).toBe(0);
        expect(rig.vault.sealedCount()).toBe(0);
        expect(Object.keys(rig.consumed).length).toBe(SOAK_N);
        // Pinned: sealed recall, not live recall — deep equal on every field.
        for (const id of ids) {
            const back = rig.consumed[id];
            expect(back.identity).toEqual(pristine[id].identity);
            expect(back.adaptive).toEqual(pristine[id].adaptive);
            expect(back.bonds).toEqual(sortedBonds(pristine[id].relationships));
            expect(back.memory).toEqual(pristine[id].memory);
            expect(back.trauma).toEqual(pristine[id].trauma);
            expect(back.memory.ledger.length).toBe(3);
            expect(back.memory.episodic.some((e) => e.type === 'POST_SEAL_RUMOR')).toBe(false);
            expect(back.fidelity.identityExact).toBe(true);
            expect(back.fidelity.memoryExact).toBe(true);
        }
    });

    it('2. Soak: 12 repeated vault/restore cycles introduce zero drift', () => {
        const vault = new IdentityVault();
        const live = buildTown();
        const pristine = cloneJson(live);
        let pairs = 0;
        for (let c = 0; c < SOAK_CYCLES; c++) {
            for (const id of Object.keys(live)) {
                vault.seal(id, cloneJson(pristine[id]));
                const back = vault.restore(id);
                expect(back.identity).toEqual(pristine[id].identity);
                expect(back.adaptive).toEqual(pristine[id].adaptive);
                expect(back.bonds).toEqual(sortedBonds(pristine[id].relationships));
                expect(back.memory).toEqual(pristine[id].memory);
                expect(back.trauma).toEqual(pristine[id].trauma);
                expect(back.fidelity.identityExact).toBe(true);
                pairs += 1;
            }
        }
        // Pinned: 12 citizens x 12 cycles = 144 seal/restore pairs, zero drift.
        expect(pairs).toBe(SOAK_N * SOAK_CYCLES);
        expect(vault.sealedCount()).toBe(0);
        expect(() => vault.restore('citizen-0')).toThrow(/NOT_SEALED/);
    });

    it('3. Adversarial: vault mid-threat and mid-trauma restores without corruption', async () => {
        // Direct seal of a peaked mid-threat snapshot never throws.
        const vault = new IdentityVault();
        const threat = buildCitizen(3, SOAK_N);
        threat.memory.episodic = Array.from({ length: 20 }, (_, k) => ({
            type: `THREAT_FRAME_${k}`, tick: 90 + k, salience: 0.95
        }));
        const receipt = vault.seal('threat', cloneJson(threat));
        expect(receipt.traumaSealed).toBe(true);
        expect(receipt.memorySealed).toBe(true);
        // A concurrent double-seal is rejected loudly and leaves the record intact.
        expect(() => vault.seal('threat', cloneJson(threat))).toThrow(/ALREADY_SEALED/);
        const back = vault.restore('threat');
        expect(back.identity).toEqual(threat.identity);
        expect(back.trauma).toEqual(threat.trauma);
        expect(back.memory.episodic.length).toBe(20);
        expect(back.adaptive.fear).toBe(1.0);
        // Full cycle path: high-fear invisible agent still demotes, drifts bounded, restores.
        const live = buildTown();
        live.sentry = {
            identity: { vigilance: 0.95, resilience: 0.7 },
            adaptive: { trust: 0.4, fear: 1.0 },
            relationships: [{ targetId: 'citizen-0', trust: 0.8, familiarity: 0.6 }],
            memory: { episodic: [{ type: 'THREAT_SIGHTED', tick: 99, salience: 1.0 }] },
            trauma: { activeThreat: true, fear: 1.0, phobias: ['warg'], sinceTick: 99 },
            tick: 100
        };
        const rig = await cycleRig(live);
        rig.director.register('sentry', { priority: 0 });
        rig.director.observe('sentry', { fear: 1.0, visible: false });
        let out;
        for (let s = 0; s < 3; s++) out = rig.cycle.step({ lod0Cap: 0, lod1Cap: 0 });
        expect(out.assignments.sentry).toBe('LOD4');
        expect(rig.vault.isSealed('sentry')).toBe(true);
        rig.vault.applyAbstractDrift('sentry', { trust: 40 }, 5); // +0.2 expected
        rig.director.observe('sentry', { fear: 0.9, visible: true, priority: 1 });
        for (let s = 0; s < 3; s++) out = rig.cycle.step({ lod0Cap: 64, lod1Cap: 256 });
        expect(rig.vault.isSealed('sentry')).toBe(false);
        expect(rig.consumed.sentry.identity).toEqual(live.sentry.identity);
        expect(rig.consumed.sentry.trauma).toEqual(live.sentry.trauma);
        expect(rig.consumed.sentry.adaptive.trust).toBeCloseTo(live.sentry.adaptive.trust + 0.2, 9);
        expect(rig.consumed.sentry.abstractTicks).toBe(5);
    });

    it('4. Malformed vault requests degrade safely', async () => {
        const vault = new IdentityVault();
        expect(() => vault.seal('no-identity', { adaptive: {}, tick: 1 })).toThrow(/SEAL_NEEDS_IDENTITY/);
        expect(() => vault.seal('', { identity: { a: 0.5 } })).toThrow(/INVALID_AGENT_ID/);
        expect(() => vault.restore('ghost')).toThrow(/NOT_SEALED/);
        expect(() => vault.applyAbstractDrift('ghost', { trust: 1 })).toThrow(/NOT_SEALED/);
        expect(vault.sealedCount()).toBe(0);
        expect(vault.auditImmutability().isClean).toBe(true);
        // Cycle level: bad snapshots skip the seal without throwing.
        const skipping = async (snapshot) => {
            const { LodDirector } = await import('../packages/core/src/LodDirector.js');
            const { LodVaultCycle } = await import('../packages/core/src/LodVaultCycle.js');
            const director = new LodDirector({ demoteHysteresisTicks: 1, promoteHysteresisTicks: 1 });
            const inner = new IdentityVault();
            const cycle = new LodVaultCycle({ director, vault: inner, snapshotProvider: snapshot });
            director.register('doomed', { priority: 0 });
            director.observe('doomed', { fear: 0, visible: false });
            const outs = [];
            for (let s = 0; s < 3; s++) outs.push(cycle.step({ lod0Cap: 0, lod1Cap: 0 }));
            return { out: outs[outs.length - 1], inner, stats: cycle.stats(), skippedAll: outs.flatMap((o) => o.skipped) };
        };
        for (const bad of [() => null, () => { throw new Error('HOST_DOWN'); }, () => ({ tick: 5 })]) {
            const r = await skipping(bad);
            expect(r.out.assignments.doomed).toBe('LOD4');
            expect(r.inner.isSealed('doomed')).toBe(false);
            expect(r.stats.skipped).toBe(1);
            expect(r.stats.sealed).toBe(0);
            expect(r.skippedAll.length).toBe(1);
            expect(r.skippedAll[0].reason).toBe('NO_SNAPSHOT');
        }
        // A throwing restore consumer is contained: step does not throw.
        const { LodDirector } = await import('../packages/core/src/LodDirector.js');
        const { LodVaultCycle } = await import('../packages/core/src/LodVaultCycle.js');
        const director = new LodDirector({ demoteHysteresisTicks: 1, promoteHysteresisTicks: 1 });
        const inner = new IdentityVault();
        const cycle = new LodVaultCycle({
            director,
            vault: inner,
            snapshotProvider: () => cloneJson(buildCitizen(0, SOAK_N)),
            restoreConsumer: () => { throw new Error('CONSUMER_DOWN'); }
        });
        director.register('fragile', { priority: 0 });
        director.observe('fragile', { fear: 0, visible: false });
        for (let s = 0; s < 3; s++) cycle.step({ lod0Cap: 0, lod1Cap: 0 });
        expect(inner.isSealed('fragile')).toBe(true);
        director.observe('fragile', { fear: 0.9, visible: true, priority: 1 });
        const promotedSteps = [];
        expect(() => {
            for (let s = 0; s < 3; s++) promotedSteps.push(cycle.step({ lod0Cap: 64, lod1Cap: 256 }));
        }).not.toThrow();
        expect(promotedSteps.flatMap((o) => o.skipped).some((r) => r.reason === 'RESTORE_FAILED')).toBe(true);
    });

    it('5. Exact replay: identical vault/restore runs are byte-identical', async () => {
        const runTown = async () => {
            const live = buildTown();
            const rig = await cycleRig(live);
            const ids = Object.keys(live);
            const demoted = demoteAll(rig, ids);
            for (const id of ids) {
                live[id].adaptive.trust = -999;
                live[id].memory.episodic.push({ type: 'POST_SEAL_RUMOR', tick: 200, salience: 0.1 });
            }
            const promoted = promoteAll(rig, ids);
            return JSON.stringify({
                demoted: demoted.assignments,
                promoted: promoted.assignments,
                stats: rig.cycle.stats(),
                consumed: rig.consumed
            });
        };
        const a = await runTown();
        const b = await runTown();
        expect(a).toBe(b);
        // Direct vault replay is byte-identical too.
        const replayOnce = () => {
            const v = new IdentityVault();
            const snap = buildCitizen(5, SOAK_N);
            v.seal('replay', cloneJson(snap));
            return JSON.stringify(v.restore('replay'));
        };
        expect(replayOnce()).toBe(replayOnce());
    });

    it('6. Capacity boundaries pinned: bond cap 12, non-finite traits coerce, contracted fields only', () => {
        const vault = new IdentityVault();
        // Measured: 20 ranked edges keep the top 12 by |trust|+familiarity.
        const many = Array.from({ length: 20 }, (_, i) => ({
            targetId: `pal-${i}`,
            trust: 0.95 - 0.04 * i,
            familiarity: 0.9 - 0.02 * i
        }));
        const receipt = vault.seal('popular', { identity: { a: 0.5 }, relationships: many });
        expect(receipt.bondsKept).toBe(12);
        expect(receipt.droppedEdges).toBe(8);
        const back = vault.restore('popular');
        expect(back.bonds.length).toBe(12);
        expect(back.bonds.map((b) => b.targetId)).toEqual(
            Array.from({ length: 12 }, (_, i) => `pal-${i}`)
        );
        expect(back.droppedEdges).toBe(8);
        // Measured: non-finite / non-numeric traits coerce to 0.5, finite survive.
        vault.seal('weird', { identity: { a: NaN, b: Infinity, c: 'brave', d: 0.7 } });
        expect(vault.restore('weird').identity).toEqual({ a: 0.5, b: 0.5, c: 0.5, d: 0.7 });
        // Measured: ad-hoc top-level snapshot fields do not ride the vault;
        // personal history must live in the contracted memory/adaptive fields.
        vault.seal('extra', { identity: { a: 0.5 }, history: ['was-lod0'], inventory: ['sword'] });
        const bare = vault.restore('extra');
        expect('history' in bare).toBe(false);
        expect('inventory' in bare).toBe(false);
    });
});
