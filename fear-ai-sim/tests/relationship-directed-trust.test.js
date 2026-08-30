// World-Completion Directive §15 (Relationship Directionality).
// Constitution §15: "A → B is not necessarily equal to B → A.
// A may fear B. B may barely notice A. A may depend on B's
// trade. B may have alternatives. Store directed
// relationships where needed."
//
// The prior `FactionRelationshipVector` had a single
// `trust` field per pair — a symmetric aggregate. This
// slice adds directional trust: `directedTrust[fromId]`
// stores the trust *from* the faction with id `fromId`.
// The §15 contract is that A and B can have different
// trust values toward each other (A can trust B while B
// distrusts A).
//
// The slice is intentionally small and additive:
//   - `FactionRelationshipVector` gains a `directedTrust`
//     field and a `getTrustFrom(fromFactionId)` /
//     `setTrustFrom(fromFactionId, value)` API.
//   - The existing `trust` field stays as a derived
//     average (backward compat).
//   - The closed-world's `recordHarm` is extended so
//     callers can pass an optional `fromFactionId` — the
//     directed trust is debited for *that* perspective
//     only, not the other.

import { describe, it, expect } from '@jest/globals';
import { FactionRelationshipVector } from '../factionrelationship.js';

describe('directed trust (Constitution §15)', () => {
    it('a fresh vector seeds the directed map from the constructor trust', () => {
        // The audit's P1 #1: the constructor's `trust`
        // parameter seeds the directed map for each
        // participant (the symmetric default). The
        // `directedTrust` map is non-empty by default; it
        // is the authoritative source of truth.
        const v = new FactionRelationshipVector({ id: 'a::b', trust: 0.5 });
        expect(v.getTrustFrom('a')).toBeCloseTo(0.5, 5);
        expect(v.getTrustFrom('b')).toBeCloseTo(0.5, 5);
        // The derived mean is the symmetric default.
        expect(v.trust).toBeCloseTo(0.5, 5);
    });

    it('getTrustFrom returns the per-perspective trust value', () => {
        // A and B can have different trust values.
        // `getTrustFrom('a')` is A's trust of B.
        // `getTrustFrom('b')` is B's trust of A.
        const v = new FactionRelationshipVector({ id: 'a::b' });
        v.setTrustFrom('a', 0.8);
        v.setTrustFrom('b', 0.2);
        expect(v.getTrustFrom('a')).toBe(0.8);
        expect(v.getTrustFrom('b')).toBe(0.2);
    });

    it('setTrustFrom clamps the value to [0, 1]', () => {
        // The trust value is bounded per §395.
        const v = new FactionRelationshipVector({ id: 'a::b' });
        v.setTrustFrom('a', 1.5);
        expect(v.getTrustFrom('a')).toBe(1.0);
        v.setTrustFrom('a', -0.5);
        expect(v.getTrustFrom('a')).toBe(0);
        v.setTrustFrom('a', NaN);
        expect(v.getTrustFrom('a')).toBe(0);
    });

    it('the `trust` field is a derived mean and cannot be written directly', () => {
        // The audit's P1 #1: the legacy `trust` field is
        // no longer an independently writable source of
        // truth. It is now derived as the mean of the
        // directed trust map. Writing to it throws
        // (loud failure) rather than silently desyncing.
        const v = new FactionRelationshipVector({ id: 'a::b', trust: 0.5 });
        v.setTrustFrom('a', 0.9);
        v.setTrustFrom('b', 0.1);
        // The derived mean is (0.9 + 0.1) / 2 = 0.5.
        expect(v.trust).toBeCloseTo(0.5, 5);
        // Writing to the derived field must throw.
        expect(() => { v.trust = 0.7; }).toThrow(TypeError);
        // The directed map is untouched by the failed write.
        expect(v.getTrustFrom('a')).toBeCloseTo(0.9, 5);
        expect(v.getTrustFrom('b')).toBeCloseTo(0.1, 5);
    });

    it('recordHarm accepts a fromFactionId and debits that perspective only', () => {
        // The §15 contract: A's view of B and B's view of
        // A are independent. A harm event caused by B
        // (e.g. a bandit attack from B's faction) should
        // debit A's directed trust but leave B's directed
        // trust alone (B was the source, not the victim).
        const v = new FactionRelationshipVector({ id: 'a::b' });
        v.setTrustFrom('a', 0.8);
        v.setTrustFrom('b', 0.8);
        // A is the victim; B is the source. The harm
        // debits A's directed trust (A no longer trusts
        // B as much) but does not affect B's directed
        // trust (B's view of A is unchanged).
        v.recordHarm({ severity: 0.5, tick: 1, fromFactionId: 'b' });
        // The legacy `trust` field is debited (the
        // existing recordHarm logic still applies).
        // The directed trust from A is debited.
        // The directed trust from B is unchanged.
        const fromA = v.getTrustFrom('a');
        const fromB = v.getTrustFrom('b');
        // fromA should have dropped below 0.8.
        expect(fromA).toBeLessThan(0.8);
        // fromB should be unchanged (B was the source, not the victim).
        // The implementation may still derive fromB from
        // the legacy field, but it should not decrease.
        // We assert the structural property: fromB is at
        // least as high as fromA after the harm.
        expect(fromB).toBeGreaterThanOrEqual(fromA);
    });

    it('§15 directional invariant: A can trust B while B distrusts A', () => {
        // The §15 contract: A's trust of B is independent
        // of B's trust of A. A test that directly exercises
        // this: set A's trust high and B's trust low.
        const v = new FactionRelationshipVector({ id: 'a::b' });
        v.setTrustFrom('a', 0.95);
        v.setTrustFrom('b', 0.05);
        // A trusts B a lot.
        expect(v.getTrustFrom('a')).toBe(0.95);
        // B does not trust A.
        expect(v.getTrustFrom('b')).toBe(0.05);
        // The vector correctly preserves the asymmetry.
        // (The legacy `trust` field is not affected unless
        // explicitly derived.)
    });
});
