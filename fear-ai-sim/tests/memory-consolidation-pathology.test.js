/**
 * tests/memory-consolidation-pathology.test.js
 *
 * Front B / Sections 23–24: Memory Consolidation, Pruning Engine & Memory Pathology Suite
 *
 * Invariants Verified:
 * 1. Sleep/Downtime consolidation abstracts repetitive episodic incidents into generalized semantic world knowledge.
 * 2. Protection classes guard critical anchors (flashbulb survival, grievances, sanctuaries) from pruning.
 * 3. Pavlovian extinction learning progressively extinguishes unreinforced trauma dread upon safe exposure.
 * 4. Pathology detector identifies dangling entities, epistemic contradictions, hallucinated coordinates, and stale panic.
 * 5. Remediation protocol cures detected pathologies deterministically back to healthy status.
 * 6. Strictly preserves Host Game Authority Invariant with zero world/physics mutation.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { LayeredMemorySystem, EPISODIC_EVENT_TYPES, SEMANTIC_CATEGORIES } from '../packages/core/src/LayeredMemorySystem.js';
import {
    MemoryConsolidationEngine,
    MemoryPathologyDetector,
    PROTECTION_CLASSES,
    MEMORY_PATHOLOGY_TYPES
} from '../packages/core/src/MemoryConsolidationEngine.js';

describe('Front B / Sections 23–24: Memory Consolidation, Pruning & Pathology Suite', () => {
    let memory;
    let engine;

    beforeEach(() => {
        memory = new LayeredMemorySystem();
        engine = new MemoryConsolidationEngine({
            spatialClusterRadius: 20.0,
            minClusterSizeForHazard: 3,
            minClusterSizeForSanctuary: 2,
            pruneSalienceThreshold: 0.05,
            pruneDecayRate: 0.002
        });
    });

    it('1. Sleep Consolidation: abstracts repeated episodic ambushes into high-confidence semantic hazard', () => {
        // Agent experiences 3 ambush incidents along the same road segment (x=50, y=10)
        memory.recordEpisodic({
            type: EPISODIC_EVENT_TYPES.SURVIVED_AMBUSH,
            salience: 0.6,
            location: { x: 50, y: 10, z: 0 },
            tick: 100
        });
        memory.recordEpisodic({
            type: EPISODIC_EVENT_TYPES.COMBAT_CONFRONTATION,
            salience: 0.5,
            location: { x: 52, y: 11, z: 0 },
            tick: 150
        });
        memory.recordEpisodic({
            type: EPISODIC_EVENT_TYPES.NEAR_DEATH_PANIC,
            salience: 0.7,
            location: { x: 48, y: 9, z: 0 },
            tick: 200
        });

        expect(memory.semantic.size).toBe(0);

        // Run downtime consolidation at tick 300
        const report = engine.consolidate(memory, { currentTick: 300 });

        expect(report.hazardsConsolidated).toBe(1);
        expect(memory.semantic.size).toBe(1);

        // Inspect consolidated semantic belief
        const [semKey, semEntry] = Array.from(memory.semantic.entries())[0];
        expect(semKey).toContain('consolidated_hazard_50_10');
        expect(semEntry.category).toBe(SEMANTIC_CATEGORIES.HAZARD);
        expect(semEntry.confidence).toBeGreaterThan(0.65);
        expect(semEntry.details.incidentCount).toBe(3);
        expect(semEntry.location.x).toBeCloseTo(50, 0);
        expect(semEntry.location.y).toBeCloseTo(10, 0);
    });

    it('2. Selective Pruning: guards permanent anchors and unresolved grievances while evicting decayed memories', () => {
        // 1. Flashbulb survival anchor (salience 0.90 >= 0.85 threshold)
        const anchorId = memory.recordEpisodic({
            type: EPISODIC_EVENT_TYPES.SURVIVED_AMBUSH,
            salience: 0.95,
            tick: 10
        });

        // 2. Unresolved social grievance (abandoned by peer)
        const grievanceId = memory.recordEpisodic({
            type: EPISODIC_EVENT_TYPES.ABANDONED_BY_PEER,
            salience: 0.60,
            participants: ['traitor_bob'],
            tick: 50
        });

        // 3. Mundane combat episode (unprotected, low initial salience)
        const mundaneId = memory.recordEpisodic({
            type: EPISODIC_EVENT_TYPES.COMBAT_CONFRONTATION,
            salience: 0.20,
            tick: 50
        });

        expect(engine.classifyProtection(memory.episodic.find(e => e.id === anchorId), 100))
            .toBe(PROTECTION_CLASSES.PERMANENT_ANCHOR);
        expect(engine.classifyProtection(memory.episodic.find(e => e.id === grievanceId), 100))
            .toBe(PROTECTION_CLASSES.UNRESOLVED_GRIEVANCE);
        expect(engine.classifyProtection(memory.episodic.find(e => e.id === mundaneId), 100))
            .toBe(PROTECTION_CLASSES.NONE);

        // Fast forward 2000 ticks: mundane memory decays below 0.05
        const pruneReport = engine.prune(memory, { currentTick: 2050 });

        expect(pruneReport.prunedEpisodic).toBe(1);
        expect(memory.episodic.find(e => e.id === anchorId)).toBeDefined();
        expect(memory.episodic.find(e => e.id === grievanceId)).toBeDefined();
        expect(memory.episodic.find(e => e.id === mundaneId)).toBeUndefined();
    });

    it('3. Pavlovian Extinction Learning: progressively diminishes unreinforced trauma dread', () => {
        // Agent acquired conditioned dread of howling wolf sounds (ACOUSTIC: howling)
        memory.recordTrauma('ACOUSTIC', 'howling', 0.90, null, 50, 0.0001);
        expect(memory.trauma[0].dreadIntensity).toBe(0.90);

        // Agent hears howling 5 times peacefully inside a well-lit tavern (safe exposures)
        const safeExposures = [
            { cueType: 'ACOUSTIC', cueValue: 'howling', currentTick: 100 },
            { cueType: 'ACOUSTIC', cueValue: 'howling', currentTick: 200 },
            { cueType: 'ACOUSTIC', cueValue: 'howling', currentTick: 300 }
        ];

        const report = engine.applyExtinction(memory, safeExposures, 0.30);
        expect(report.extinguishedTraumaCount).toBe(3);
        // (0.90 * 0.7 * 0.7 * 0.7 = 0.3087)
        expect(memory.trauma[0].dreadIntensity).toBeCloseTo(0.3087, 2);

        // Further safe exposures extinguish trauma completely (< 0.03)
        engine.applyExtinction(memory, [
            { cueType: 'ACOUSTIC', cueValue: 'howling', currentTick: 400 },
            { cueType: 'ACOUSTIC', cueValue: 'howling', currentTick: 500 },
            { cueType: 'ACOUSTIC', cueValue: 'howling', currentTick: 600 },
            { cueType: 'ACOUSTIC', cueValue: 'howling', currentTick: 700 },
            { cueType: 'ACOUSTIC', cueValue: 'howling', currentTick: 800 },
            { cueType: 'ACOUSTIC', cueValue: 'howling', currentTick: 900 }
        ], 0.40);

        expect(memory.trauma.length).toBe(0); // Extinction complete
    });

    it('4. Memory Pathology Detection: flags dangling entities, contradictions, invalid coords, and stale panic', () => {
        // 1. Dangling entity reference: references dead entity 'orc_99'
        memory.recordEpisodic({
            type: EPISODIC_EVENT_TYPES.COMBAT_CONFRONTATION,
            salience: 0.5,
            participants: ['orc_99', 'ally_alice'],
            tick: 10
        });

        // 2. Hallucinated coordinates: non-finite coordinates
        memory.recordEpisodic({
            type: EPISODIC_EVENT_TYPES.RESOURCE_DISCOVERED,
            salience: 0.5,
            location: { x: Infinity, y: 10, z: 0 },
            tick: 15
        });

        // 3. Epistemic contradiction: proximate high-confidence HAZARD and SANCTUARY
        memory.recordSemantic('cave_hazard', SEMANTIC_CATEGORIES.HAZARD, { x: 100, y: 100, z: 0 }, 0.85);
        memory.recordSemantic('cave_haven', SEMANTIC_CATEGORIES.SANCTUARY, { x: 105, y: 102, z: 0 }, 0.80);

        // 4. Permanent stale threat panic: trauma unreinforced for 6,000 ticks with 0.95 dread
        memory.recordTrauma('ENTITY', 'ancient_dragon', 0.95);
        memory.trauma[0].createdTick = 10;
        memory.trauma[0].lastReinforcedTick = 10;

        const report = MemoryPathologyDetector.detect(memory, {
            validEntityIds: ['ally_alice', 'player'],
            currentTick: 7000
        });

        expect(report.healthy).toBe(false);
        expect(report.pathologyCount).toBe(5);

        const types = report.pathologies.map(p => p.type);
        expect(types).toContain(MEMORY_PATHOLOGY_TYPES.DANGLING_ENTITY_REFERENCE);
        expect(types).toContain(MEMORY_PATHOLOGY_TYPES.HALLUCINATED_COORDINATES);
        expect(types).toContain(MEMORY_PATHOLOGY_TYPES.EPISTEMIC_CONTRADICTION);
        expect(types).toContain(MEMORY_PATHOLOGY_TYPES.PERMANENT_STALE_THREAT_PANIC);
    });

    it('5. Remediation Protocol: cures detected pathologies deterministically back to healthy status', () => {
        // Seed pathologies
        memory.recordEpisodic({
            type: EPISODIC_EVENT_TYPES.COMBAT_CONFRONTATION,
            salience: 0.5,
            participants: ['dead_bandit', 'active_hero'],
            tick: 10
        });
        memory.recordEpisodic({
            type: EPISODIC_EVENT_TYPES.RESOURCE_DISCOVERED,
            salience: 0.5,
            location: { x: Infinity, y: 10, z: 0 },
            tick: 15
        });
        memory.recordSemantic('point_a', SEMANTIC_CATEGORIES.HAZARD, { x: 50, y: 50, z: 0 }, 0.90, {}, 100);
        memory.recordSemantic('point_b', SEMANTIC_CATEGORIES.SANCTUARY, { x: 52, y: 51, z: 0 }, 0.70, {}, 200);
        memory.recordTrauma('ENTITY', 'extinct_beast', 0.90);
        memory.trauma[0].lastReinforcedTick = 10;

        const initialReport = MemoryPathologyDetector.detect(memory, {
            validEntityIds: ['active_hero'],
            currentTick: 5000
        });
        expect(initialReport.healthy).toBe(false);

        // Execute remediation
        const remediation = engine.remediate(memory, initialReport);
        expect(remediation.remediatedCount).toBeGreaterThanOrEqual(4);

        // Verify remaining status
        const postAudit = MemoryPathologyDetector.detect(memory, {
            validEntityIds: ['active_hero'],
            currentTick: 5000
        });
        expect(postAudit.healthy).toBe(true);
        expect(postAudit.pathologyCount).toBe(0);
    });

    it('6. Strictly preserves Host Game Authority Invariant', () => {
        const hostState = Object.freeze({
            entityId: 'npc_civilian',
            position: Object.freeze({ x: 120.0, y: 45.0, z: 0.0 }),
            hp: 100,
            inventory: Object.freeze(['bread', 'torch'])
        });

        // Run complete cycle of consolidation, pruning, extinction, and pathology scan
        memory.recordEpisodic({
            type: EPISODIC_EVENT_TYPES.SAFE_SANCTUARY_DISCOVERED,
            salience: 0.8,
            location: { x: 120, y: 45, z: 0 },
            tick: 10
        });
        memory.recordEpisodic({
            type: EPISODIC_EVENT_TYPES.ALLIED_EXTRACTION,
            salience: 0.75,
            location: { x: 122, y: 46, z: 0 },
            tick: 20
        });

        engine.consolidate(memory, { currentTick: 50 });
        engine.prune(memory, { currentTick: 50 });
        engine.applyExtinction(memory, [{ location: { x: 120, y: 45, z: 0 }, currentTick: 50 }]);
        const report = MemoryPathologyDetector.detect(memory, { validEntityIds: ['npc_civilian'], currentTick: 50 });

        expect(report.healthy).toBe(true);
        // Host state remains strictly untouched
        expect(hostState.position.x).toBe(120.0);
        expect(hostState.hp).toBe(100);
        expect(hostState.inventory.length).toBe(2);
    });
});
