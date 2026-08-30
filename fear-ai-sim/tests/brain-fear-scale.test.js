// Constitution §260 (SINGLE OWNER RULE) / §332 (SCALE CONSISTENCY)
// / §540 (EVERY NEW VARIABLE MUST JUSTIFY).
//
// The §332 contract: "Do not mix 0..1 fear with 0..5 thresholds
// without adapter."
//
// The §260 contract: when ownership is unified, the scale
// adapter is the documented integration point.
//
// Pre-fix bug: brain.currentFear is clamped 0..1 by setFear() /
// the constructor, but fearCore's PANIC enter threshold is
// 3.8 (raw-fear scale). As a result, the brain can never
// trigger PANIC through the public decide() path. The
// production brain can sit in ALERT forever, even at maximum
// fear with predators present.
//
// The fix: add an explicit scale adapter in _fearContext that
// multiplies the brain's 0..1 fear to the FearCore's 0..3.8
// scale. The adapter is a documented, single function so the
// scale mapping is auditable.

import { Brain } from '../brain.js';

describe('brain-fear scale adapter (Constitution §260 / §332)', () => {
    it('brain.currentFear does not become NaN across 50 decide() ticks', () => {
        // The skill=0 forces the standard reactive branch,
        // avoiding the behavior-tree dependency on globalMemory.
        const brain = new Brain({ skill: 0, neuroticism: 0.5, fear: 0.5, resilience: 0.5 });
        for (let i = 0; i < 50; i += 1) {
            brain.setFear(1.0);
            brain.decide(
                { threats: [{ dx: 1, dy: 0, dist: 1 }], food: [], neighbors: [] },
                { x: 0, y: 0, energy: 100 },
                null, [], 0, 0, [], null, null, null
            );
            expect(Number.isFinite(brain.currentFear)).toBe(true);
        }
    });

    it('brain can reach PANIC through the public decide() path (after scale adapter)', () => {
        // Pre-fix: brain.currentFear max is 1.0, fearCore PANIC
        // threshold is 3.8, so the brain can never reach PANIC
        // through the public path. Post-fix: the scale adapter
        // multiplies the brain's 0..1 fear into the 0..3.8
        // range, so sustained max-fear + threats should drive
        // the brain into PANIC.
        //
        // We use traits.skill = 0 (low) so the brain takes the
        // else branch (standard reactive state machine) and not
        // the behavior-tree branch (which has its own
        // dependencies on globalMemory).
        const brain = new Brain({ skill: 0, neuroticism: 0.5, fear: 0.5, resilience: 0.5 });
        let reachedPanic = false;
        for (let i = 0; i < 50; i += 1) {
            brain.setFear(1.0);
            brain.decide(
                { threats: [{ dx: 1, dy: 0, dist: 1 }], food: [], neighbors: [] },
                { x: 0, y: 0, energy: 100 },
                null, [], 0, 0, [], null, null, null
            );
            if (brain.fearCore.state === 'PANIC') { reachedPanic = true; break; }
        }
        expect(reachedPanic).toBe(true);
    });

    it('the scale adapter is a documented function (auditable mapping)', () => {
        // The §332 contract: "Do not mix 0..1 fear with 0..5
        // thresholds without adapter." The adapter must be
        // visible — not an inline multiplier in _fearContext.
        const brain = new Brain({});
        // _fearScale is the documented adapter. It must be
        // callable and produce a value in the fearCore
        // range (0..3.8).
        expect(typeof brain._fearScale).toBe('function');
        expect(brain._fearScale(0)).toBe(0);
        expect(brain._fearScale(1)).toBeGreaterThanOrEqual(3.5);
        expect(brain._fearScale(1)).toBeLessThanOrEqual(3.9);
        expect(brain._fearScale(0.5)).toBeGreaterThan(0);
        expect(brain._fearScale(0.5)).toBeLessThan(3.8);
    });
});
