import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent, getWorldEvents } from '../closed-world.js';

// R7 (V8 audit F3): the closed-world reducer must never hand
// witnesses the exact ground truth. Each observer's OBSERVATION
// carries ±0.1 encounter-stream noise around actualDanger.

describe('R7 — reducer observation carries noise, not exact truth', () => {
    it('attack witnesses observe values around 0.8, never all exactly 0.8', () => {
        const world = createClosedWorldScenario();
        const merchant = world.merchants[0];
        merchant.selectedRoute = 'road-a';
        merchant.perceptionAccuracy = 1;
        // Successive ticks draw successive encounter-stream values,
        // so repeated witnesses must vary while staying in the
        // ±0.1 band around the road-a truth of 0.8.
        const seen = [];
        for (let tick = 1; tick <= 6; tick++) {
            // The reducer re-selects routes every tick; re-pin the
            // witness so it keeps observing road-a.
            merchant.selectedRoute = 'road-a';
            appendWorldEvent(world, { type: 'BANDIT_ATTACK', roadId: 'road-a', tick, banditId: 'b1' });
            tickClosedWorld(world, { tick });
            for (const e of getWorldEvents(world, { types: ['OBSERVATION'] })) {
                if (e.roadId === 'road-a' && e.tick === tick && typeof e.observedDanger === 'number') seen.push(e.observedDanger);
            }
        }
        expect(seen.length).toBe(6);
        for (const v of seen) {
            expect(v).toBeGreaterThanOrEqual(0.7);
            expect(v).toBeLessThanOrEqual(0.9);
        }
        // The exact copy (every witness holding actualDanger 0.8) is
        // the F3 failure mode: noise must move at least one witness.
        expect(seen.some(v => v !== 0.8)).toBe(true);
    });
});
