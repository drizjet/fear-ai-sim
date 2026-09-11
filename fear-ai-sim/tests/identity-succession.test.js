import { describe, it, expect } from '@jest/globals';
import { SuccessionEngine } from '../packages/core/index.js';

// NEXT-158 (audit candidate 23): identity-conditioned succession effects.
// Selection still scores legitimacy/competence/popularity/continuity, but
// the winner's leadership trait conditions the aftermath via opt-in
// identityWeight (default 0 is legacy): high-leadership successors rally
// cohesion and morale and calm splinter risk, low-leadership ones deepen
// the wound.
const HEIR = { id: 'heir', legitimacy: 0.7, competence: 0.7, popularity: 0.7, continuity: 0.7 };
const withLead = (lead) => ({ ...HEIR, traits: { leadership: lead } });
const base = (candidates, extra = {}) => ({
    factionId: 'f1',
    cause: 'NATURAL_DEATH',
    archetype: 'DEFAULT',
    candidates,
    ...extra,
});

describe('NEXT-158: identity-conditioned succession', () => {
    it('1. Legacy default ignores identity fields exactly', () => {
        const e = new SuccessionEngine();
        const plain = e.resolve(base([HEIR]));
        const withTraits = e.resolve(base([withLead(0.95)]));
        const explicitZero = e.resolve(base([withLead(0.95)], { identityWeight: 0 }));
        expect(withTraits).toEqual(plain);
        expect(explicitZero).toEqual(plain);
    });

    it('2. Identity never changes who wins', () => {
        const e = new SuccessionEngine();
        const field = [
            { id: 'a', legitimacy: 0.8, competence: 0.4, popularity: 0.4, continuity: 0.6, traits: { leadership: 0.05 } },
            { id: 'b', legitimacy: 0.5, competence: 0.5, popularity: 0.5, continuity: 0.5, traits: { leadership: 0.99 } },
        ];
        const plain = e.resolve(base(field, { archetype: 'AUTOCRATIC_DESPOT' }));
        const weighted = e.resolve(base(field, { archetype: 'AUTOCRATIC_DESPOT', identityWeight: 1 }));
        expect(weighted.successorId).toBe(plain.successorId);
    });

    it('3. High-leadership successors rally, low-leadership ones deepen', () => {
        const e = new SuccessionEngine();
        const legacy = e.resolve(base([HEIR]));
        const hi = e.resolve(base([withLead(0.95)], { identityWeight: 1 }));
        const lo = e.resolve(base([withLead(0.05)], { identityWeight: 1 }));
        expect(hi.cohesionDelta).toBeGreaterThan(legacy.cohesionDelta);
        expect(hi.moraleDelta).toBeGreaterThan(legacy.moraleDelta);
        expect(hi.splinterRisk).toBeLessThan(legacy.splinterRisk);
        expect(lo.cohesionDelta).toBeLessThan(legacy.cohesionDelta);
        expect(lo.moraleDelta).toBeLessThan(legacy.moraleDelta);
        expect(lo.splinterRisk).toBeGreaterThan(legacy.splinterRisk);
    });

    it('4. Pinned rally arithmetic', () => {
        const e = new SuccessionEngine();
        const hi = e.resolve(base([withLead(0.95)], { identityWeight: 1 }));
        expect(hi.cohesionDelta).toBeCloseTo(0.02 + 0.45 * 0.3, 4);
        expect(hi.moraleDelta).toBeCloseTo(0 + 0.45 * 0.15, 4);
    });

    it('5. Malformed weights and traits degrade safely', () => {
        const e = new SuccessionEngine();
        const legacy = e.resolve(base([HEIR]));
        for (const bad of [NaN, 'high', -2]) {
            expect(e.resolve(base([withLead(0.95)], { identityWeight: bad }))).toEqual(legacy);
        }
        const clamped = e.resolve(base([withLead(0.95)], { identityWeight: 99 }));
        expect(clamped).toEqual(e.resolve(base([withLead(0.95)], { identityWeight: 1 })));
        const badLead = e.resolve(base([withLead(NaN)], { identityWeight: 1 }));
        expect(badLead).toEqual(legacy);
        const overLead = e.resolve(base([withLead(9)], { identityWeight: 1 }));
        expect(overLead).toEqual(e.resolve(base([withLead(1)], { identityWeight: 1 })));
    });

    it('6. Interregnum ignores identity weight', () => {
        const e = new SuccessionEngine();
        const rep = e.resolve({ cause: 'ASSASSINATION', candidates: [], identityWeight: 1 });
        expect(rep.interregnum).toBe(true);
        expect(rep.splinterRisk).toBeGreaterThan(0.7);
    });
});
