/**
 * @file lod-director.test.js
 *
 * Sections LXXVI + LXXX-LXXXI: budgeted tiers with hysteresis.
 */

import { LodDirector } from '../packages/core/index.js';

function populated(count = 8) {
    const d = new LodDirector({ lod0Cap: 2, lod1Cap: 4, demoteHysteresisTicks: 2, promoteHysteresisTicks: 1 });
    for (let i = 0; i < count; i++) {
        d.register(`a${i}`, { priority: 0.9 - i * 0.1 });
        d.observe(`a${i}`, { fear: 0.1 + i * 0.05, visible: true });
    }
    return d;
}

describe('Sections LXXVI + LXXX-LXXXI: LOD Director', () => {
    test('1. Caps respected across tiers', () => {
        const d = populated();
        for (let t = 0; t < 12; t++) d.direct();
        const counts = d.tierCounts();
        expect(counts.LOD0).toBeLessThanOrEqual(2);
        expect(counts.LOD1).toBeLessThanOrEqual(4);
        expect(counts.LOD0 + counts.LOD1 + counts.LOD2 + counts.LOD3 + counts.LOD4).toBe(8);
    });

    test('2. Hysteresis blocks single-tick thrash', () => {
        const d = new LodDirector({ lod0Cap: 1, lod1Cap: 1, demoteHysteresisTicks: 5, promoteHysteresisTicks: 1 });
        d.register('vip', { priority: 0.9 });
        d.register('extra', { priority: 0.1 });
        d.observe('vip', { fear: 0.8, visible: true });
        d.observe('extra', { fear: 0, visible: false });
        const first = d.direct();
        // VIP takes the single LOD0 slot; extra sinks with hysteresis delay.
        expect(first.assignments.vip).toBe('LOD0');
        expect(d.tierOf('extra')).toBe('LOD0'); // not yet demoted: hysteresis
        for (let t = 0; t < 6; t++) d.direct();
        expect(d.tierOf('extra')).not.toBe('LOD0');
        expect(d.auditImmutability().demotions).toBeGreaterThan(0);
    });

    test('3. Volatile agents earn fidelity over calm seniors', () => {
        const d = new LodDirector({ lod0Cap: 1, lod1Cap: 4, demoteHysteresisTicks: 1, promoteHysteresisTicks: 1 });
        d.register('calm_vet', { priority: 0.8 });
        d.register('jumpy', { priority: 0.3 });
        for (let t = 0; t < 8; t++) {
            d.observe('calm_vet', { fear: 0.1, visible: true });
            d.observe('jumpy', { fear: t % 2 === 0 ? 0.9 : 0.1, visible: true });
        }
        d.direct();
        expect(d.tierOf('jumpy')).toBe('LOD0');
    });

    test('4. Due lists follow cadence, LOD4 never fires', () => {
        const d = populated(4);
        for (let t = 0; t < 12; t++) d.direct();
        const due = d.dueAgents();
        expect(due.length).toBeGreaterThan(0);
        for (const id of due) expect(d.tierOf(id)).not.toBe('LOD4');
        expect(d.unregister('a0')).toBe(true);
        expect(d.tierOf('a0')).toBe(null);
        expect(() => d.observe('ghost', {})).toThrow(/UNKNOWN_AGENT/);
    });

    test('5. Audits stay clean', () => {
        const d = populated(3);
        d.direct();
        expect(d.auditImmutability().isClean).toBe(true);
        expect(d.auditImmutability().agentsTracked).toBe(3);
        expect(d.auditImmutability().hostPhysicsMutations).toBe(0);
    });
});
