/**
 * @file interaction-mutations.test.js
 *
 * Sections CCXXXI-CCXXXII: lesion sensitivity. Each experiment cuts one
 * interaction feed (black-box, inputs only) and must degrade the joint
 * outcome in the predicted direction. An insensitive benchmark would pass
 * lesioned runs as healthy — these tests prove ours do not.
 */

import { describe, it, expect } from '@jest/globals';
import { InteractionMutationHarness } from '../packages/core/src/InteractionMutationHarness.js';

describe('Sections CCXXXI-CCXXXII: InteractionMutationHarness', () => {
    it('1. Cutting leader calming collapses rally count', () => {
        const h = new InteractionMutationHarness();
        const r = h.lesionLeaderCalming();
        expect(r.baseline).toBeGreaterThan(0);
        expect(r.lesioned).toBeLessThan(r.baseline);
        expect(r.degraded).toBe(true);
    });

    it('2. Cutting the danger feed blinds trade demotion', () => {
        const h = new InteractionMutationHarness();
        const r = h.lesionRouteDanger();
        expect(r.baselineDrop).toBeGreaterThan(0);
        expect(r.lesionedDrop).toBe(0);
        expect(r.degraded).toBe(true);
    });

    it('3. Zeroing recalled dread lowers live fear appraisal', () => {
        const h = new InteractionMutationHarness();
        const r = h.lesionTraumaDread();
        expect(r.baseline).toBeGreaterThan(r.lesioned);
        expect(r.degraded).toBe(true);
    });

    it('4. Full battery detects every lesion deterministically', () => {
        const h = new InteractionMutationHarness();
        const a = h.runAll();
        const b = h.runAll();
        expect(a).toEqual(b);
        expect(a.allDetected).toBe(true);
        expect(a.detected).toBe(a.total);
    });
});
