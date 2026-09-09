/**
 * @file encounter-consequences.test.js
 *
 * Section LXIII: outcomes feed the world back.
 */

import { EncounterConsequenceEngine } from '../packages/core/index.js';

describe('Section LXIII: Encounter Consequences', () => {
    test('1. Ambush raises danger, seeds rumors, bumps escorts', () => {
        const eng = new EncounterConsequenceEngine();
        const out = eng.process({ category: 'HIGHWAY_AMBUSH', resolution: 'COMBAT_ENGAGEMENT', corridorId: 'north_road' });
        expect(out.corridorHazards).toEqual([{ corridorId: 'north_road', danger: 0.5 }]);
        expect(out.rumorSeeds[0].topic).toBe('ROAD_AMBUSH');
        expect(out.escortAdvisories).toEqual([{ corridorId: 'north_road', tierBump: 2 }]);
        expect(out.dreadSeeds[0].kind).toBe('ROAD');
    });

    test('2. Peaceful trade seeds opportunity, never dread', () => {
        const eng = new EncounterConsequenceEngine();
        const out = eng.process({ category: 'PEACEFUL_CONVERGENCE', resolution: 'PEACEFUL_TRADE', corridorId: 'silk_road' });
        expect(out.corridorHazards).toEqual([]);
        expect(out.dreadSeeds).toEqual([]);
        expect(out.rumorSeeds[0].topic).toBe('TRADE_OPPORTUNITY');
        expect(out.escortAdvisories).toEqual([]);
    });

    test('3. Batch merges corridor danger by max, never averages', () => {
        const eng = new EncounterConsequenceEngine();
        const merged = eng.processBatch([
            { category: 'HIGHWAY_AMBUSH', resolution: 'COMBAT_ENGAGEMENT', corridorId: 'north_road' },
            { category: 'HIGHWAY_AMBUSH', resolution: 'EXTORTION_PAID', corridorId: 'north_road' },
            { category: 'PEACEFUL_CONVERGENCE', resolution: 'PEACEFUL_TRADE', corridorId: 'silk_road' }
        ]);
        expect(merged.corridorHazards).toEqual([{ corridorId: 'north_road', danger: 0.5 }]);
        expect(merged.rumorSeeds.length).toBe(3);
        expect(() => eng.processBatch('nope')).toThrow(/ENCOUNTERS_MUST_BE_ARRAY/);
    });

    test('4. Unknown resolutions fail loudly', () => {
        const eng = new EncounterConsequenceEngine();
        expect(() => eng.process({ resolution: 'TELEPORT_HOME' })).toThrow(/UNKNOWN_RESOLUTION/);
        expect(() => eng.process({})).toThrow(/UNKNOWN_RESOLUTION/);
    });

    test('5. Audits stay clean', () => {
        const eng = new EncounterConsequenceEngine();
        eng.process({ resolution: 'MUTUAL_AVOIDANCE', corridorId: 'c' });
        expect(eng.auditImmutability().isClean).toBe(true);
        expect(eng.auditImmutability().encountersProcessed).toBe(1);
        expect(eng.auditImmutability().hostPhysicsMutations).toBe(0);
    });
});
