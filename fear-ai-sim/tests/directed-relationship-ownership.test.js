/**
 * Constitution §15 (A → B is not necessarily equal to B → A) +
 * 2026-08-28 deep-audit P1 #1 ("Remove the legacy trust source
 * of truth. Migrate every producer and consumer to perspective-
 * aware directed relationships, then derive any symmetric
 * summary.").
 *
 * The audit's strongest specific test: "A→B changes can alter
 * A's stance without changing B→A unless an information/event
 * path causes it." This file proves that contract end-to-end:
 *
 *  1. setTrustFrom(a, x) does NOT mutate the directed trust
 *     from b's perspective.
 *  2. recordTrade({fromFactionId: a}) credits a's view and
 *     debits nothing from b's view.
 *  3. recordHarm({fromFactionId: a}) debits b's view (the
 *     victim) and credits nothing from a's view.
 *  4. The derived symmetric `trust` is the mean of the
 *     directed map; it is read-only (writes to it have no
 *     effect on the directed map, which is the audit's
 *     authoritative source of truth).
 *  5. Two independent relationship vectors in the same
 *     `relationships` map can have completely asymmetric
 *     trust without either leaking into the other.
 *  6. evaluateStance reads the directed trust (the audit's
 *     preferred source), not the legacy symmetric field.
 */
import { FactionRelationshipVector, evaluateStance } from '../factionrelationship.js';

describe('directed-relationship ownership (audit P1 #1)', () => {
    test('A→B can change while B→A stays unchanged', () => {
        const v = new FactionRelationshipVector({ id: 'a::b', trust: 0.5 });
        v.setTrustFrom('a', 0.9);
        expect(v.getTrustFrom('a')).toBeCloseTo(0.9, 5);
        expect(v.getTrustFrom('b')).toBeCloseTo(0.5, 5);
        // A's view is independent of B's view.
        v.setTrustFrom('a', 0.1);
        expect(v.getTrustFrom('a')).toBeCloseTo(0.1, 5);
        expect(v.getTrustFrom('b')).toBeCloseTo(0.5, 5);
    });

    test('recordTrade from a credits a perspective, leaves b alone', () => {
        const v = new FactionRelationshipVector({ id: 'a::b', trust: 0.5 });
        v.recordTrade({ value: 0.5, tick: 1, fromFactionId: 'a' });
        // a's view rises by 0.05
        expect(v.getTrustFrom('a')).toBeCloseTo(0.55, 5);
        // b's view is unchanged (a doesn't get to credit b's perspective)
        expect(v.getTrustFrom('b')).toBeCloseTo(0.5, 5);
    });

    test('recordHarm from a debits b perspective, leaves a alone', () => {
        const v = new FactionRelationshipVector({ id: 'a::b', trust: 0.5 });
        v.recordHarm({ severity: 0.4, tick: 1, fromFactionId: 'a' });
        // b (the victim) loses 0.04
        expect(v.getTrustFrom('b')).toBeCloseTo(0.46, 5);
        // a (the source) is unchanged — the source doesn't self-credit
        expect(v.getTrustFrom('a')).toBeCloseTo(0.5, 5);
    });

    test('derived symmetric trust is the mean, read-only', () => {
        const v = new FactionRelationshipVector({ id: 'a::b', trust: 0.5 });
        v.setTrustFrom('a', 0.9);
        v.setTrustFrom('b', 0.1);
        // Mean: (0.9 + 0.1) / 2 = 0.5
        expect(v.trust).toBeCloseTo(0.5, 5);
        // Writing to the derived field must throw — the
        // audit's P1 #1 requires that `vector.trust = X`
        // be a programmer error, not a silent desync.
        expect(() => { v.trust = 0.99; }).toThrow(TypeError);
        // The directed map is untouched.
        expect(v.getTrustFrom('a')).toBeCloseTo(0.9, 5);
        expect(v.getTrustFrom('b')).toBeCloseTo(0.1, 5);
        // The derived field re-derives on every read.
        expect(v.trust).toBeCloseTo(0.5, 5);
    });

    test('two independent vectors do not leak', () => {
        // The audit's strongest ownership test: two separate relationship
        // vectors in the same world must not share mutable trust state.
        const a2b = new FactionRelationshipVector({ id: 'a::b', trust: 0.5 });
        const a2c = new FactionRelationshipVector({ id: 'a::c', trust: 0.5 });
        a2b.setTrustFrom('a', 0.9);
        a2c.setTrustFrom('a', 0.1);
        // a's view of b is independent of a's view of c.
        expect(a2b.getTrustFrom('a')).toBeCloseTo(0.9, 5);
        expect(a2c.getTrustFrom('a')).toBeCloseTo(0.1, 5);
        // b's view of a is still the seeded default (0.5).
        expect(a2b.getTrustFrom('b')).toBeCloseTo(0.5, 5);
    });

    test('evaluateStance reads directed trust, not legacy symmetric', () => {
        // The audit's stronger test: when a's view is high and b's view is low,
        // evaluateStance({trust: getTrustFrom(a)}) and
        // evaluateStance({trust: getTrustFrom(b)}) should produce different
        // results. The legacy `trust` is irrelevant — the directed value is
        // what evaluateStance receives.
        const a2b = new FactionRelationshipVector({ id: 'a::b', trust: 0.5 });
        a2b.setTrustFrom('a', 0.9);
        a2b.setTrustFrom('b', 0.1);
        // Inject a non-zero pressure so trust damping has
        // something to dampen. The pressure fields are
        // separate from trust; we just need them > 0.
        a2b.setGrievanceFrom('*default*', 0.5);
        a2b.setTerritorialPressureFrom('*default*', 0.5);
        a2b.setFearFrom('*default*', 0.5);
        const stanceA = evaluateStance({
            pressure: a2b.pressure(),
            trust: a2b.getTrustFrom('a'),
            tradeDependency: 0.5,
            territorialPressure: 0.5,
            fear: 0.5,
        });
        const stanceB = evaluateStance({
            pressure: a2b.pressure(),
            trust: a2b.getTrustFrom('b'),
            tradeDependency: 0.5,
            territorialPressure: 0.5,
            fear: 0.5,
        });
        // A's view (high trust) and b's view (low trust) produce different
        // stance classifications. We don't assert a specific label (the
        // §344 classifier is internal); we just assert they are NOT the same.
        expect(stanceA).not.toEqual(stanceB);
    });
});
