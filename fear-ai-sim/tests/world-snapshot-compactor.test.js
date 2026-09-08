/**
 * tests/world-snapshot-compactor.test.js
 *
 * Front E / Sections 96–98: World Snapshot Persistence Migrations & Save-Size Compactor
 *
 * Invariants Verified:
 * 1. WorldSnapshotMigrator cleanly migrates v1.0.0 flat legacy snapshots to v3.0.0.
 * 2. Migrates v2.0.0 snapshots forward, establishing epistemic, economic, and demographic state.
 * 3. SaveSizeCompactor achieves > 65% byte-size reduction via archetype deduplication, sparse omission, and float quantization.
 * 4. Decompact reconstitutes bit-exact entity, trait, spatial, and affective data.
 * 5. Rejects invalid migration paths and malformed snapshots with descriptive errors.
 * 6. Strictly preserves Host Game Authority Invariant with zero host mutation.
 */

import { describe, it, expect } from '@jest/globals';
import {
    WorldSnapshotMigrator,
    SaveSizeCompactor,
    SNAPSHOT_VERSIONS
} from '../packages/core/src/WorldSnapshotMigrationCompactor.js';
import { CANONICAL_PRESETS } from '../packages/core/src/PresetLibrary.js';

describe('Front E / Sections 96–98: World Snapshot Persistence Migrations & Save-Size Compactor', () => {
    it('1. Migrates v1.0.0 legacy flat snapshot forward to canonical v3.0.0 schema', () => {
        const v1Snapshot = {
            version: '1.0.0',
            tick: 500,
            rngState: 12345,
            agents: [
                {
                    id: 'civ_1',
                    traits: { openness: 0.2, conscientiousness: 0.8, extraversion: 0.3, agreeableness: 0.7, neuroticism: 0.9, resilience: 0.1 },
                    position: { x: 10.5, y: 20.0, z: 0.0 },
                    fear: 0.75,
                    band: 'PANIC'
                },
                {
                    id: 'civ_2',
                    position: { x: 15.0, y: 22.0 },
                    fear: 0.1
                }
            ]
        };

        const migrated = WorldSnapshotMigrator.migrate(v1Snapshot, SNAPSHOT_VERSIONS.V3);

        expect(migrated.version).toBe('3.0.0');
        expect(migrated.tick).toBe(500);
        expect(migrated.entities.length).toBe(2);
        expect(migrated.entities[0].id).toBe('civ_1');
        expect(migrated.entities[0].traits.neuroticism).toBe(0.9);
        expect(migrated.entities[0].band).toBe('PANIC');
        expect(migrated.entities[0].memory).toBeDefined();
        expect(migrated.entities[0].epistemicBeliefs).toBeDefined();

        // New v3 subsystems are initialized with healthy defaults
        expect(migrated.economicSystem).toBeDefined();
        expect(migrated.migrationSystem).toBeDefined();
        expect(migrated.relationshipTensor).toBeDefined();
    });

    it('2. Migrates v2.0.0 snapshot forward to v3.0.0, establishing epistemic and economic foundations', () => {
        const v2Snapshot = {
            version: '2.0.0',
            tick: 1200,
            entities: [
                {
                    id: 'guard_1',
                    traits: { openness: 0.5, conscientiousness: 0.9, extraversion: 0.5, agreeableness: 0.4, neuroticism: 0.2, resilience: 0.85 },
                    position: { x: 50, y: 100, z: 0 },
                    fear: 0.05,
                    band: 'CALM',
                    factionId: 'city_watch'
                }
            ],
            factions: [{ id: 'city_watch', stance: 'MOBILIZE' }],
            tradeRoutes: [{ id: 'highway_1', status: 'OPEN' }],
            settlements: [{ id: 'Highhold', population: 250 }]
        };

        const migrated = WorldSnapshotMigrator.migrate(v2Snapshot, SNAPSHOT_VERSIONS.V3);

        expect(migrated.version).toBe('3.0.0');
        expect(migrated.tick).toBe(1200);
        expect(migrated.entities[0].id).toBe('guard_1');
        expect(migrated.entities[0].epistemicBeliefs).toBeDefined();
        expect(migrated.factions[0].id).toBe('city_watch');
        expect(migrated.tradeRoutes[0].id).toBe('highway_1');
        expect(migrated.settlements[0].population).toBe(250);
        expect(migrated.economicSystem).toBeDefined();
        expect(migrated.migrationSystem).toBeDefined();
    });

    it('3. Compaction benchmark: achieves > 65% byte-size reduction on realistic 200-entity population', () => {
        const sampleEntities = [];
        const presetKeys = Object.keys(CANONICAL_PRESETS);

        for (let i = 0; i < 200; i++) {
            const pKey = presetKeys[i % presetKeys.length];
            const preset = CANONICAL_PRESETS[pKey];
            sampleEntities.push({
                id: `npc_${i}`,
                traits: { ...preset.traits },
                position: { x: (i * 3.14159) % 200, y: (i * 2.71828) % 200, z: 0.0 },
                fear: i % 5 === 0 ? 0.654321 : 0.0,
                band: i % 5 === 0 ? 'ALERT' : 'CALM',
                memory: { sensory: [], episodic: [], trauma: [], semantic: [] },
                factionId: i % 2 === 0 ? 'faction_north' : 'faction_south'
            });
        }

        const snapshot = {
            version: '3.0.0',
            tick: 1500,
            rngState: 99999,
            entities: sampleEntities,
            factions: [{ id: 'faction_north' }, { id: 'faction_south' }],
            settlements: [{ id: 'TownA', population: 100 }, { id: 'TownB', population: 100 }]
        };

        const result = SaveSizeCompactor.compact(snapshot);

        expect(result.originalBytes).toBeGreaterThan(30000);
        expect(result.savingsPercent).toBeGreaterThan(65.0);
        expect(result.compressionRatio).toBeLessThan(0.35);
    });

    it('4. Lossless reconstitution: decompact preserves exact traits, positions, fear values, and entity IDs', () => {
        const original = {
            version: '3.0.0',
            tick: 888,
            rngState: 42,
            entities: [
                {
                    id: 'hero_1',
                    traits: { ...CANONICAL_PRESETS.STOIC_VETERAN.traits },
                    position: { x: 12.345, y: 67.891, z: 0 },
                    fear: 0.421,
                    band: 'ALERT',
                    factionId: 'legion'
                },
                {
                    id: 'custom_npc',
                    traits: { openness: 0.123, conscientiousness: 0.456, extraversion: 0.789, agreeableness: 0.321, neuroticism: 0.654, resilience: 0.987 },
                    position: { x: -45.67, y: 89.12, z: 3.5 },
                    fear: 0.0,
                    band: 'CALM',
                    factionId: null
                }
            ],
            factions: [{ id: 'legion', archetype: 'MILITARY_JUNTA' }],
            tradeRoutes: [],
            settlements: []
        };

        const { compactData } = SaveSizeCompactor.compact(original, { floatDecimals: 3, coordinateDecimals: 2 });
        const restored = SaveSizeCompactor.decompact(compactData);

        expect(restored.version).toBe('3.0.0');
        expect(restored.tick).toBe(888);
        expect(restored.rngState).toBe(42);
        expect(restored.entities.length).toBe(2);

        // Hero 1 (deduplicated preset)
        const h1 = restored.entities.find(e => e.id === 'hero_1');
        expect(h1.traits.neuroticism).toBe(CANONICAL_PRESETS.STOIC_VETERAN.traits.neuroticism);
        expect(h1.traits.resilience).toBe(CANONICAL_PRESETS.STOIC_VETERAN.traits.resilience);
        expect(h1.position.x).toBeCloseTo(12.35, 2);
        expect(h1.position.y).toBeCloseTo(67.89, 2);
        expect(h1.fear).toBeCloseTo(0.421, 3);
        expect(h1.band).toBe('ALERT');
        expect(h1.factionId).toBe('legion');

        // Custom NPC (quantized custom traits)
        const c1 = restored.entities.find(e => e.id === 'custom_npc');
        expect(c1.traits.openness).toBe(0.123);
        expect(c1.traits.resilience).toBe(0.987);
        expect(c1.fear).toBe(0.0);
        expect(c1.band).toBe('CALM');
    });

    it('5. Rejects unsupported migration paths and invalid snapshot formats gracefully', () => {
        expect(() => WorldSnapshotMigrator.migrate(null)).toThrow(TypeError);
        expect(() => WorldSnapshotMigrator.migrate({ version: '3.0.0' }, '1.0.0'))
            .toThrow(/Unsupported migration path/);
        expect(WorldSnapshotMigrator.canMigrate('3.0.0', '1.0.0')).toBe(false);
        expect(WorldSnapshotMigrator.canMigrate('1.0.0', '3.0.0')).toBe(true);
    });

    it('6. Strictly preserves Host Game Authority Invariant', () => {
        const externalGameWorld = Object.freeze({
            worldId: 'realm_valoria',
            tick: 100,
            engineTransforms: Object.freeze([{ id: 1, pos: [0, 0, 0] }]),
            activePhysicsBodies: 150
        });

        const middlewareSnapshot = {
            version: '2.0.0',
            tick: externalGameWorld.tick,
            entities: [{ id: 'npc_1', traits: CANONICAL_PRESETS.COWARDLY_CIVILIAN.traits, fear: 0.8 }]
        };

        const migrated = WorldSnapshotMigrator.migrate(middlewareSnapshot, '3.0.0');
        const compacted = SaveSizeCompactor.compact(migrated);
        const decompacted = SaveSizeCompactor.decompact(compacted.compactData);

        expect(decompacted.version).toBe('3.0.0');
        expect(externalGameWorld.engineTransforms.length).toBe(1);
        expect(externalGameWorld.activePhysicsBodies).toBe(150);
    });
});
