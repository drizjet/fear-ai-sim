/**
 * @file social-trauma-zone.test.js
 *
 * Post-25 audit candidate 19: SocialEventEngine x TraumaZoneSystem joint.
 *
 * HISTORY: probed INCONCLUSIVE (applyEvent took no location, so hot-zone
 * coordinates could not reach relationship updates). R3 built the wire:
 * opt-in options.location {x, y, z?} plus options.traumaZones lets
 * danger-flavored events (SHARED_DANGER, RESCUE, WARNING, BETRAYAL,
 * ABANDONMENT, LEADERSHIP_FAILURE) weigh up to 1.5x inside dread-soaked
 * ground; calm-positive events stay unscaled by design. Tests 1-5 keep
 * their original absence pins (no location+zones supplied); tests 6-8 pin
 * the built behavior. Original wording survives in git history and ledger
 * milestone 179.
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
    it('1. KEPT: without location+zones, hot-vs-neutral context changes nothing (legacy path)', () => {
        const zones = hotField();
        // Spatial setup is live: epicentre reads 1.0, far field reads 0.0.
        expect(zones.getTraumaAt(HOT.x, HOT.y, HOT.z)).toBe(1);
        expect(zones.getTraumaAt(FAR.x, FAR.y, FAR.z)).toBe(0);

        // Same SHARED_DANGER twice with no location supplied: both land the
        // same (legacy path; R3 needs location AND zones together).
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

        // A bare location without a zone system is still ignored — the R3
        // wire needs both halves of the joint.
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

    it('6. BUILT (R3): danger events amplify on hot ground, calm events do not', () => {
        const zones = hotField();
        const at = (loc) => ({ weight: 1, location: { x: loc.x, y: loc.y, z: loc.z }, traumaZones: zones });
        // SHARED_DANGER hot vs cold diverges; hot equals an explicit 1.5x
        // weight run (zoneFear 1.0 -> multiplier 1.5).
        const hot = applyFresh('SHARED_DANGER', at(HOT));
        const cold = applyFresh('SHARED_DANGER', at(FAR));
        expect(hot.direct.trust).toBeGreaterThan(cold.direct.trust);
        expect(cold.direct.trust).toBeCloseTo(0.15, 10);
        const heavy = applyFresh('SHARED_DANGER', { weight: 1.5 });
        expect(hot.direct).toEqual(heavy.direct);
        // BETRAYAL wounds deeper on hot ground.
        const betHot = applyFresh('BETRAYAL', at(HOT));
        const betCold = applyFresh('BETRAYAL', at(FAR));
        expect(betHot.direct.trust).toBeLessThan(betCold.direct.trust);
        expect(betHot.direct.grievance).toBeGreaterThan(betCold.direct.grievance);
        // Calm-positive events stay unscaled by design.
        for (const event of ['TRADE', 'AID', 'LEADERSHIP_SUCCESS', 'DECEPTION']) {
            const h = applyFresh(event, at(HOT));
            const c = applyFresh(event, at(FAR));
            expect(h.direct).toEqual(c.direct);
        }
    });

    it('7. R3 needs both halves: lone location, lone zones, or garbage stay legacy', () => {
        const zones = hotField();
        const engine = new SocialEventEngine();
        const tensor = new RelationshipTensorSystem();
        const legacy = engine.applyEvent(tensor, 'SHARED_DANGER', 'alice', 'bob', { weight: 1 });
        expect(legacy.zoneFear).toBe(null);
        // Location without zones: ignored, echo null.
        const locOnly = engine.applyEvent(new RelationshipTensorSystem(), 'SHARED_DANGER', 'alice', 'bob',
            { weight: 1, location: { x: HOT.x, y: HOT.y } });
        expect(locOnly.zoneFear).toBe(null);
        // Zones without location: ignored, echo null.
        const zonesOnly = engine.applyEvent(new RelationshipTensorSystem(), 'SHARED_DANGER', 'alice', 'bob',
            { weight: 1, traumaZones: zones });
        expect(zonesOnly.zoneFear).toBe(null);
        // Garbage halves: no throw, legacy-identical direct vectors.
        for (const opts of [
            { weight: 1, location: { x: NaN, y: 0 }, traumaZones: zones },
            { weight: 1, location: { x: 0, y: 0 }, traumaZones: {} },
            { weight: 1, location: null, traumaZones: zones },
        ]) {
            const t = new RelationshipTensorSystem();
            const r = engine.applyEvent(t, 'SHARED_DANGER', 'alice', 'bob', opts);
            expect(r.direct).toEqual(legacy.direct);
            expect(r.zoneFear).toBe(null);
        }
        // Located echo carries the live field reading.
        const full = engine.applyEvent(new RelationshipTensorSystem(), 'SHARED_DANGER', 'alice', 'bob',
            { weight: 1, location: { x: HOT.x, y: HOT.y }, traumaZones: zones });
        expect(full.zoneFear).toBe(1);
        const far = engine.applyEvent(new RelationshipTensorSystem(), 'SHARED_DANGER', 'alice', 'bob',
            { weight: 1, location: { x: FAR.x, y: FAR.y }, traumaZones: zones });
        expect(far.zoneFear).toBe(0);
    });

    it('8. Witness broadcast amplifies on hot ground; located replay is exact', () => {
        const zones = hotField();
        const at = (loc) => ({
            weight: 1, witnesses: ['carol'],
            location: { x: loc.x, y: loc.y, z: loc.z }, traumaZones: zones
        });
        const run = (loc) => {
            const tensor = new RelationshipTensorSystem();
            const engine = new SocialEventEngine();
            const out = engine.applyEvent(tensor, 'SHARED_DANGER', 'alice', 'bob', at(loc));
            return { out, rel: tensor.getRelationship('carol', 'alice') };
        };
        const hot = run(HOT);
        const cold = run(FAR);
        expect(hot.out.witnessUpdates).toHaveLength(1);
        expect(hot.rel.trust).toBeGreaterThan(cold.rel.trust);
        const again = run(HOT);
        expect(JSON.stringify(again)).toBe(JSON.stringify(hot));
    });
});
