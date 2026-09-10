/**
 * @file intent-stabilizer.test.js
 *
 * Front B / Sections 294–296: Stability, Responsiveness & Chatter.
 */

import { IntentStabilizer } from '../packages/core/index.js';

describe('Front B / Sections 294–296: Intent Stabilizer', () => {
    test('1. First intent latches without oscillation', () => {
        const s = new IntentStabilizer();
        const r = s.update('a', 0, { type: 'FLEE_FROM', urgency: 0.6 });
        expect(r.intent.type).toBe('FLEE_FROM');
        expect(r.switched).toBe(true);
        expect(r.reason).toBe('FIRST_INTENT');
    });

    test('2. Cooldown holds against marginal rivals', () => {
        const s = new IntentStabilizer({ cooldownTicks: 5, hysteresisMargin: 0.15 });
        s.update('a', 0, { type: 'FLEE_FROM', urgency: 0.6 });
        const held = s.update('a', 1, { type: 'SEEK_COVER', urgency: 0.62 });
        expect(held.held).toBe(true);
        expect(held.intent.type).toBe('FLEE_FROM');
        expect(held.reason).toBe('COOLDOWN_HOLD');
        const confirmed = s.update('a', 2, { type: 'FLEE_FROM', urgency: 0.7 });
        expect(confirmed.reason).toBe('CONFIRMED');
    });

    test('3. Lethal urgency overrides the hold', () => {
        const s = new IntentStabilizer({ cooldownTicks: 5, hysteresisMargin: 0.15 });
        s.update('a', 0, { type: 'SEEK_COVER', urgency: 0.5 });
        const danger = s.update('a', 1, { type: 'FLEE_FROM', urgency: 0.99 });
        expect(danger.switched).toBe(true);
        expect(danger.reason).toBe('OVERRIDE_DANGER');
    });

    test('4. Cooldown expiry allows clean handoff with chatter counted', () => {
        const s = new IntentStabilizer({ cooldownTicks: 2, hysteresisMargin: 0.15 });
        s.update('a', 0, { type: 'FLEE_FROM', urgency: 0.6 });
        const hand = s.update('a', 5, { type: 'SEEK_COVER', urgency: 0.61 });
        expect(hand.switched).toBe(true);
        expect(hand.reason).toBe('COOLDOWN_EXPIRED');
        expect(s.chatter('a', 5).flips).toBe(1);
    });

    test('5. Chatter metric stays bounded and audits stay clean', () => {
        const s = new IntentStabilizer({ cooldownTicks: 0, hysteresisMargin: 0 });
        for (let t = 0; t < 10; t++) s.update('a', t, { type: t % 2 ? 'A' : 'B', urgency: 0.5 });
        const c = s.chatter('a', 10);
        expect(c.flips).toBe(9);
        expect(c.rate).toBeCloseTo(9 / 64, 4);
        expect(s.chatter('ghost', 10).flips).toBe(0);
        const audit = s.auditImmutability();
        expect(audit.isClean).toBe(true);
        expect(audit.hostPhysicsMutations).toBe(0);
        expect(() => s.update('a', 11, {})).toThrow();
    });
});

describe('NEXT-47: above-threshold A urgency-slope utility', () => {
    test('WARN slope flips stabilizer overrides on a narrow held-urgency band', async () => {
        const { runWarnSlopeUtility, warnUrgency } = await import('../benchmarks/behavioral-evaluation/a_warn_urgency_utility.mjs');
        expect(runWarnSlopeUtility()).toEqual(runWarnSlopeUtility());
        const r = runWarnSlopeUtility();
        // Slope geometry: gate 0.65, width 0.0525 below the 0.15 margin.
        expect(warnUrgency(0.66)).toBeCloseTo(0.749, 4);
        expect(warnUrgency(1.0)).toBe(0.8);
        // Verdict: narrow but live — high-A warners interrupt flight where
        // just-above-gate warners cannot.
        expect(r.rungs).toBe(81);
        expect(r.diffs).toBe(11);
        expect(r.tipLo).toBe(0.6);
        expect(r.tipHi).toBe(0.65);
    });
});
