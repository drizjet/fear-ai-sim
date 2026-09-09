/**
 * @file refugee-information.test.js
 *
 * Section LX-link: arrivals talk.
 */

import { RefugeeInformationHarness } from '../packages/core/index.js';

describe('Section LX-link: Refugee Information', () => {
    test('1. War flight seeds army rumors with saturating credibility', () => {
        const h = new RefugeeInformationHarness();
        const small = h.processArrival({ survivors: 12, dest: 'mill_town', originId: 'ashenvale', cause: 'WAR' });
        const large = h.processArrival({ survivors: 900, dest: 'mill_town', originId: 'ashenvale', cause: 'WAR' });
        expect(small.rumorSeeds[0].topic).toBe('APPROACHING_ARMY');
        expect(large.rumorSeeds[0].confidence).toBeGreaterThan(small.rumorSeeds[0].confidence);
        expect(large.rumorSeeds[0].confidence - small.rumorSeeds[0].confidence).toBeLessThan(0.4);
        expect(small.dreadSeeds[0].threatLevel).toBe(0.9);
    });

    test('2. Famine flight seeds scarcity, monster flight seeds monsters', () => {
        const h = new RefugeeInformationHarness();
        expect(h.processArrival({ survivors: 30, dest: 'd', cause: 'FAMINE' }).rumorSeeds[0].topic).toBe('RESOURCE_SCARCITY');
        expect(h.processArrival({ survivors: 30, dest: 'd', cause: 'MONSTER' }).dreadSeeds[0].kind).toBe('MONSTER');
    });

    test('3. Unknown causes stay silent, empty arrivals rejected', () => {
        const h = new RefugeeInformationHarness();
        expect(h.processArrival({ survivors: 30, dest: 'd' }).rumorSeeds).toEqual([]);
        expect(() => h.processArrival({ survivors: 0, dest: 'd', cause: 'WAR' })).toThrow(/ARRIVAL_WITHOUT_SURVIVORS/);
        expect(() => h.processBatch('nope')).toThrow(/ARRIVALS_MUST_BE_ARRAY/);
    });

    test('4. Batch merges topics keeping max confidence', () => {
        const h = new RefugeeInformationHarness();
        const merged = h.processBatch([
            { survivors: 10, dest: 'd', originId: 'o1', cause: 'WAR' },
            { survivors: 200, dest: 'd', originId: 'o2', cause: 'WAR' },
            { survivors: 40, dest: 'd', originId: 'o3', cause: 'FAMINE' }
        ]);
        expect(merged.rumorSeeds.length).toBe(2);
        expect(merged.rumorSeeds[0].topic).toBe('APPROACHING_ARMY');
        expect(merged.dreadSeeds.length).toBe(3);
    });

    test('5. Audits stay clean', () => {
        const h = new RefugeeInformationHarness();
        h.processArrival({ survivors: 5, dest: 'd', cause: 'RAID' });
        expect(h.auditImmutability().isClean).toBe(true);
        expect(h.auditImmutability().arrivalsProcessed).toBe(1);
        expect(h.auditImmutability().hostPhysicsMutations).toBe(0);
    });
});
