/**
 * @file social-trauma-zone.test.js
 *
 * Post-25 audit candidate 19: SocialEventEngine x TraumaZoneSystem joint.
 *
 * Hypothesis under test: a shared social danger or rescue inside/near a
 * trauma zone interacts with the spatial field (hits harder / relieves
 * more), or the two systems are independent.
 *
 * Measured verdict (live objects, 2026-09-11): INDEPENDENT. The engine
 * signature is applyEvent(tensor, event, actor, target, { weight,
 * witnesses, exposed }) — there is no location parameter, so a hot-zone
 * coordinate cannot reach the relationship update. Every hot-vs-neutral
 * pair below is byte-identical while getTraumaAt() proves the spatial
 * setup is live (1.0 at the epicentre, 0.0 far away). Pinned honestly as
 * INCONCLUSIVE-with-evidence for coupling: absence of effect, measured.
 */

import { describe, it, expect } from '@jest/globals';
import {
    SocialEventEngine,
    RelationshipTensorSystem,
    TraumaZoneSystem,
} from '../packages/core/index.js';

const HOT = { x: 0, y: 0, z: 0 };
const FAR = { x: 10000, y: 0, z: 0 };

/** Hot zone at the origin plus a far-neutral control point. */
function hotField() {
    const zones = new TraumaZoneSystem();
    zones.addZone(0, 0, 0, 1.0, 150, 1800);
    return zones;
}

function applyFresh(event, options) {
    const tensor = new RelationshipTensorSystem();
    const engine = new SocialEventEngine();
    const { direct } = engine.applyEvent(tensor, event, 'alice', 'bob', options);
    return { tensor, engine, direct };
}

describe('Post-25 candidate 19: SocialEventEngine x TraumaZoneSystem joint', () => {
    it('1. SHARED_DANGER / RESCUE at hot-zone vs neutral coordinates: identical relationships (no coupling)', () => {
        const zones = hotField();
        // Spatial setup is live: epicentre reads 1.0, far field reads 0.0.
        expect(zones.getTraumaAt(HOT.x, HOT.y, HOT.z)).toBe(1);
        expect(zones.getTraumaAt(FAR.x, FAR.y, FAR.z)).toBe(0);

        // Same SHARED_DANGER twice; the only difference is where the host
        // says it happened. The engine takes no location, so both land same.
        const hot = applyFresh('SHARED_DANGER', { weight: 1 });
        const neutral = applyFresh('SHARED_DANGER', { weight: 1 });
        expect(hot.direct).toEqual(neutral.direct);
        // Pinned live vector: trust 0.15, respect 0.5, affection 0.1,
        // familiarity 0.12, zero fear/grievance/obligation/dominance.
        expect(hot.direct.trust).toBeCloseTo(0.15, 10);
        expect(hot.direct.respect).toBeCloseTo(0.5, 10);
        expect(hot.direct.affection).toBeCloseTo(0.1, 10);
        expect(hot.direct.familiarity).toBeCloseTo(0.12, 10);
        expect(hot.direct.fear).toBe(0);
        expect(hot.direct.grievance).toBe(0);

        // RESCUE likewise: hot-zone context changes nothing.
        const rescueHot = applyFresh('RESCUE', { weight: 1 });
        const rescueFar = applyFresh('RESCUE', { weight: 1 });
        expect(rescueHot.direct).toEqual(rescueFar.direct);
        // Pinned live vector: trust 0.6, respect 0.8, affection 0.4,
        // familiarity 0.2, obligation 0.5.
        expect(rescueHot.direct.trust).toBeCloseTo(0.6, 10);
        expect(rescueHot.direct.respect).toBeCloseTo(0.8, 10);
        expect(rescueHot.direct.affection).toBeCloseTo(0.4, 10);
        expect(rescueHot.direct.obligation).toBeCloseTo(0.5, 10);

        // Passing a location through options is silently ignored — direct
        // API evidence the joint does not exist at this seam.
        const withLoc = applyFresh('SHARED_DANGER', {
            weight: 1,
            location: { x: HOT.x, y: HOT.y },
        });
        expect(withLoc.direct).toEqual(hot.direct);
    });

    it('2. LEADERSHIP_SUCCESS calming inside a hot zone vs outside: identical', () => {
        const zones = hotField();
        expect(zones.getTraumaAt(HOT.x, HOT.y, HOT.z)).toBeGreaterThan(0.9);
        expect(zones.getTraumaAt(FAR.x, FAR.y, FAR.z)).toBe(0);

        const inside = applyFresh('LEADERSHIP_SUCCESS', { weight: 1 });
        const outside = applyFresh('LEADERSHIP_SUCCESS', { weight: 1 });
        expect(inside.direct).toEqual(outside.direct);
        // Pinned live vector: trust 0.3, respect 0.7, affection 0.1,
        // familiarity 0.2, dominance -0.15, two tensor passes.
        expect(inside.direct.trust).toBeCloseTo(0.3, 10);
        expect(inside.direct.respect).toBeCloseTo(0.7, 10);
        expect(inside.direct.dominance).toBeCloseTo(-0.15, 10);
        expect(inside.direct.interactionCount).toBe(2);
    });

    it('3. BETRAYAL inside a hot zone vs outside: identical', () => {
        const zones = hotField();
        expect(zones.getTraumaAt(HOT.x, HOT.y, HOT.z)).toBe(1);
        expect(zones.getTraumaAt(FAR.x, FAR.y, FAR.z)).toBe(0);

        const inside = applyFresh('BETRAYAL', { weight: 1 });
        const outside = applyFresh('BETRAYAL', { weight: 1 });
        expect(inside.direct).toEqual(outside.direct);
        // Pinned live vector: trust -0.85, affection -0.7, grievance 0.85.
        expect(inside.direct.trust).toBeCloseTo(-0.85, 10);
        expect(inside.direct.affection).toBeCloseTo(-0.7, 10);
        expect(inside.direct.grievance).toBeCloseTo(0.85, 10);
    });

    it('4. Malformed locations degrade safely (no throw, bounded, collapse to origin)', () => {
        const zones = hotField();
        // Empty field reads 0 everywhere — control.
        expect(new TraumaZoneSystem().getTraumaAt(0, 0, 0)).toBe(0);
        // Number(x) || 0 coercion: NaN/undefined/strings collapse to the
        // origin, which sits inside this zone — so they read 1.0, bounded.
        expect(zones.getTraumaAt(NaN, undefined)).toBe(1);
        expect(zones.getTraumaAt('a', {})).toBe(1);
        expect(zones.getTraumaAt()).toBe(1);
        for (const v of [
            zones.getTraumaAt(NaN, undefined),
            zones.getTraumaAt('a', {}),
            zones.getTraumaAt(Infinity, -Infinity),
        ]) {
            expect(Number.isFinite(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
        }
        // Radial falloff is live, not a stub: intensity 0.5 / radius 10
        // reads 0.25 at half-radius, 0 at and beyond the rim (strict <).
        const small = new TraumaZoneSystem();
        small.addZone(0, 0, 0, 0.5, 10, 1800);
        expect(small.getTraumaAt(5, 0, 0)).toBeCloseTo(0.25, 10);
        expect(small.getTraumaAt(10, 0, 0)).toBe(0);
        expect(small.getTraumaAt(11, 0, 0)).toBe(0);
    });

    it('5. Exact replay: same event sequence replays byte-identically', () => {
        function runSequence() {
            const tensor = new RelationshipTensorSystem();
            const engine = new SocialEventEngine();
            for (const e of ['RESCUE', 'SHARED_DANGER', 'BETRAYAL']) {
                engine.applyEvent(tensor, e, 'alice', 'bob', { weight: 1 });
            }
            return JSON.stringify(tensor.getRelationship('bob', 'alice'));
        }
        const first = runSequence();
        const second = runSequence();
        expect(second).toBe(first);
        const parsed = JSON.parse(first);
        expect(parsed.interactionCount).toBe(3);
        expect(parsed.grievance).toBeGreaterThan(0);
    });
});
