import { describe, it, expect } from '@jest/globals';
import { SuccessionEngine } from '../packages/core/index.js';

// NEXT-170 (post-25 candidate 10): bravery steadies morale (more after
// violent causes) and agreeableness calms splinter risk, under the same
// opt-in identityWeight gate as NEXT-158 leadership rally. Selection still
// scores legitimacy/competence/popularity/continuity only.
const HEIR = { id: 'heir', legitimacy: 0.7, competence: 0.7, popularity: 0.7, continuity: 0.7 };
const withTraits = (traits) => ({ ...HEIR, traits });
const base = (candidates, extra = {}) => ({
  factionId: 'f1',
  cause: 'NATURAL_DEATH',
  archetype: 'DEFAULT',
  candidates,
  ...extra,
});
const BRAVE = { leadership: 0.5, bravery: 0.95, agreeableness: 0.5 };

describe('NEXT-170: bravery/agreeableness succession aftermath', () => {
  it('1. Legacy exactness: traits present without identityWeight equal plain report', () => {
    const e = new SuccessionEngine();
    const plain = e.resolve(base([HEIR]));
    const withAll = e.resolve(
      base([withTraits({ leadership: 0.95, bravery: 0.95, agreeableness: 0.95 })])
    );
    expect(withAll).toEqual(plain);
    expect(plain.cohesionDelta).toBe(0.02);
    expect(plain.moraleDelta).toBeCloseTo(0, 10);
    expect(plain.splinterRisk).toBe(0.085);
  });

  it('2. Brave successor raises morale; effect larger under ASSASSINATION', () => {
    const e = new SuccessionEngine();
    const legacyNat = e.resolve(base([HEIR]));
    const braveNat = e.resolve(base([withTraits(BRAVE)], { identityWeight: 1 }));
    // Pinned: steel = 1 * (0.95 - 0.5) * (0.1 + 0.05) = 0.0675 (violent 0.05, rally 0).
    expect(braveNat.moraleDelta).toBe(0.0675);
    expect(braveNat.moraleDelta).toBeGreaterThan(legacyNat.moraleDelta);
    // Bravery touches morale only: cohesion and splinter untouched when leadership/agreeableness are 0.5.
    expect(braveNat.cohesionDelta).toBe(legacyNat.cohesionDelta);
    expect(braveNat.splinterRisk).toBe(legacyNat.splinterRisk);

    const legacyAss = e.resolve(base([HEIR], { cause: 'ASSASSINATION' }));
    const braveAss = e.resolve(base([withTraits(BRAVE)], { cause: 'ASSASSINATION', identityWeight: 1 }));
    // Pinned: legacy -0.08, brave 0.0325; steel = 0.45 * (0.1 + 0.15) = 0.1125.
    expect(legacyAss.moraleDelta).toBe(-0.08);
    expect(braveAss.moraleDelta).toBe(0.0325);
    expect(braveAss.moraleDelta - legacyAss.moraleDelta).toBe(0.1125);
    expect(braveAss.moraleDelta - legacyAss.moraleDelta).toBeGreaterThan(
      braveNat.moraleDelta - legacyNat.moraleDelta
    );
  });

  it('3. Agreeable calms splinter, disagreeable raises it', () => {
    const e = new SuccessionEngine();
    const legacy = e.resolve(base([HEIR]));
    const agree = e.resolve(
      base([withTraits({ leadership: 0.5, bravery: 0.5, agreeableness: 0.95 })], { identityWeight: 1 })
    );
    const disagree = e.resolve(
      base([withTraits({ leadership: 0.5, bravery: 0.5, agreeableness: 0.05 })], { identityWeight: 1 })
    );
    // Pinned: concord = +/-0.45 * 0.3 = +/-0.135; splinter shifts by -concord * 0.5 = -/+0.0675.
    expect(agree.splinterRisk).toBe(0.0175);
    expect(disagree.splinterRisk).toBe(0.1525);
    expect(agree.splinterRisk).toBeLessThan(legacy.splinterRisk);
    expect(disagree.splinterRisk).toBeGreaterThan(legacy.splinterRisk);
    // Agreeableness touches splinter only.
    expect(agree.moraleDelta).toBe(legacy.moraleDelta);
    expect(agree.cohesionDelta).toBe(legacy.cohesionDelta);
  });

  it('4. Selection untouched: winner identical with identityWeight 1', () => {
    const e = new SuccessionEngine();
    const field = [
      { id: 'a', legitimacy: 0.8, competence: 0.4, popularity: 0.4, continuity: 0.6, traits: { leadership: 0.05, bravery: 0.05, agreeableness: 0.05 } },
      { id: 'b', legitimacy: 0.5, competence: 0.5, popularity: 0.5, continuity: 0.5, traits: { leadership: 0.99, bravery: 0.99, agreeableness: 0.99 } },
    ];
    const plain = e.resolve(base(field, { archetype: 'AUTOCRATIC_DESPOT' }));
    const weighted = e.resolve(base(field, { archetype: 'AUTOCRATIC_DESPOT', identityWeight: 1 }));
    expect(weighted.successorId).toBe(plain.successorId);
    expect(weighted.successorId).toBe('a');
  });

  it('5. Malformed safety: NaN bravery degrades to neutral; identityWeight 0 ignores traits', () => {
    const e = new SuccessionEngine();
    const legacy = e.resolve(base([HEIR]));
    const nanBrave = e.resolve(
      base([withTraits({ ...BRAVE, bravery: NaN })], { identityWeight: 1 })
    );
    expect(nanBrave).toEqual(legacy);
    // Negative bravery is finite so clamp01 pins it to 0 (equals explicit 0),
    // never NaN/throw; still safe and deterministic.
    const negBrave = e.resolve(
      base([withTraits({ ...BRAVE, bravery: -3 })], { identityWeight: 1 })
    );
    const zeroBrave = e.resolve(
      base([withTraits({ ...BRAVE, bravery: 0 })], { identityWeight: 1 })
    );
    expect(negBrave).toEqual(zeroBrave);
    expect(Number.isFinite(negBrave.moraleDelta)).toBe(true);
    expect(negBrave.moraleDelta).toBe(-0.075);
    // identityWeight 0 ignores every trait.
    const iw0 = e.resolve(
      base([withTraits({ leadership: 0.95, bravery: 0.95, agreeableness: 0.95 })], { identityWeight: 0 })
    );
    expect(iw0).toEqual(legacy);
  });

  it('6. Exact replay: same call twice deep-equals', () => {
    const e = new SuccessionEngine();
    const params = base([withTraits(BRAVE)], { identityWeight: 1 });
    expect(e.resolve(params)).toEqual(e.resolve(params));
  });
});
