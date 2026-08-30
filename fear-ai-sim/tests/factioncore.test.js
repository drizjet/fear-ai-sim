import { describe, expect, it } from '@jest/globals';
import { FactionDecisionModel, decayFromHalfLife } from '../factioncore.js';

describe('decayFromHalfLife', () => {
    it('returns 0 for infinite half-life (no decay)', () => {
        expect(decayFromHalfLife(Infinity)).toBe(0);
        expect(decayFromHalfLife(Number.POSITIVE_INFINITY)).toBe(0);
    });
    it('returns 1 for half-life <= 0 (instant collapse)', () => {
        expect(decayFromHalfLife(0)).toBe(1);
        expect(decayFromHalfLife(-1)).toBe(1);
    });
    it('matches the audit-supplied table for common decay rates', () => {
        // The audit listed: 1%/tick → half-life 69, 2% → 34.3, 3% → 22.8,
        // 5% → 13.5, 10% → 6.6. We invert the relationship: given a
        // half-life, what is the per-tick decay rate?
        const cases = [
            [69.0, 0.01],
            [34.3, 0.02],
            [22.8, 0.03],
            [13.5, 0.05],
            [6.6, 0.10]
        ];
        for (const [halfLife, expected] of cases) {
            expect(decayFromHalfLife(halfLife)).toBeCloseTo(expected, 2);
        }
    });
    it('is monotone: longer half-life → smaller decay', () => {
        expect(decayFromHalfLife(2)).toBeGreaterThan(decayFromHalfLife(7));
        expect(decayFromHalfLife(7)).toBeGreaterThan(decayFromHalfLife(20));
        expect(decayFromHalfLife(20)).toBeGreaterThan(decayFromHalfLife(100));
    });
});

describe('FactionDecisionModel.advanceEmotion (fear)', () => {
    it('fear rises toward a high stimulus and lingers after the stimulus drops', () => {
        // Fear is a leaky integrator: previous fear * (1 - decay) + stimulus * decay.
        // When stimulus drops, fear decays toward 0 at the configured rate.
        // With fearHalfLifeTicks = 6.6, the per-tick decay is
        // 1 - 2^(-1/6.6) ≈ 0.09968 (not exactly 0.1, but the 10% row in
        // the audit's table).
        const faction = new FactionDecisionModel({ id: 'f', fearHalfLifeTicks: 6.6 });
        const decay = 1 - Math.pow(2, -1 / 6.6);
        // First tick: stimulus = 0.8, prior fear = 0 → fear = 0.8 * decay.
        faction.advanceEmotion({ perceivedDanger: 0.8 });
        const rising = faction.fear;
        expect(rising).toBeCloseTo(0.8 * decay, 6);
        // Second tick: stimulus still 0.8, fear = rising * (1 - decay) + 0.8 * decay.
        faction.advanceEmotion({ perceivedDanger: 0.8 });
        const peak = faction.fear;
        expect(peak).toBeCloseTo(rising * (1 - decay) + 0.8 * decay, 6);
        expect(peak).toBeGreaterThan(rising);
        // Many ticks: fear should approach 0.8 (the stimulus).
        for (let i = 0; i < 100; i++) faction.advanceEmotion({ perceivedDanger: 0.8 });
        expect(faction.fear).toBeCloseTo(0.8, 2);
    });

    it('fear lingers when the stimulus drops to 0', () => {
        // The audit: "without continuing stimulus, fear intensity should
        // decrease over time." We confirm that fear DOES decrease, but
        // not instantly. With a 6.6-tick half-life, fear should still
        // be non-zero 5 ticks after the stimulus drops.
        const faction = new FactionDecisionModel({ id: 'f', fearHalfLifeTicks: 6.6 });
        // Drive fear up to 0.8 by running 100 ticks at stimulus 0.8.
        for (let i = 0; i < 100; i++) faction.advanceEmotion({ perceivedDanger: 0.8 });
        expect(faction.fear).toBeCloseTo(0.8, 2);
        // Drop the stimulus to 0. After 5 ticks, fear should be around
        // 0.8 * (1/2)^(5/6.6) ≈ 0.8 * 0.59 = 0.47.
        for (let i = 0; i < 5; i++) faction.advanceEmotion({ perceivedDanger: 0 });
        expect(faction.fear).toBeGreaterThan(0.4);
        expect(faction.fear).toBeLessThan(0.6);
        // After another 20 ticks, fear is much smaller but still positive.
        for (let i = 0; i < 20; i++) faction.advanceEmotion({ perceivedDanger: 0 });
        expect(faction.fear).toBeGreaterThan(0.05);
        expect(faction.fear).toBeLessThan(0.2);
    });
});

describe('FactionDecisionModel.advanceEmotion (grievance)', () => {
    it('grievance accumulates flows additively and decays toward 0', () => {
        // Stock-flow split: the audit complained that the old formula
        // re-charged grievance every tick. The new shape adds the full
        // flow this tick, then decays the running total.
        // Coefficients after the calibration fix:
        //   supplyShortage coefficient: 0.05 (was 0.4 — too high,
        //     saturated grievance from chronic shortage alone)
        //   confirmedLoss coefficient: 0.4 (was 0.2 — acute attacks
        //     were underweighted)
        // With supplyShortage=1: flow = 1 * 0.05 = 0.05.
        // decay = 1 - 2^(-1/22.8) ≈ 0.0301.
        // First tick: grievance = 0 * (1 - 0.0301) + 0.05 = 0.05.
        const faction = new FactionDecisionModel({ id: 'f', griefHalfLifeTicks: 22.8 });
        faction.advanceEmotion({ supplyShortage: 1.0 });
        const after1 = faction.grievance;
        expect(after1).toBeCloseTo(0.05, 2);
        // Second tick: flow = 0 again. grievance = 0.05 * (1 - 0.0301) = 0.0485.
        faction.advanceEmotion({ supplyShortage: 0 });
        expect(faction.grievance).toBeCloseTo(0.0485, 2);
        expect(faction.grievance).toBeLessThan(after1);
    });

    it('a single attack contributes its full flow once, not the historical sum', () => {
        // The audit: "without continuing stimulus, fear intensity should
        // decrease over time." A single attack must NOT push grievance
        // to saturation. The first tick adds the attack's full flow
        // (confirmedLoss * 0.4), then subsequent ticks decay it.
        const faction = new FactionDecisionModel({ id: 'f', griefHalfLifeTicks: 22.8 });
        faction.advanceEmotion({ confirmedLoss: 0.5 });
        // flow = 0.5 * 0.4 = 0.20. grievance = 0.20.
        expect(faction.grievance).toBeCloseTo(0.2, 2);
        // Without further attacks, grievance must decay.
        for (let i = 0; i < 10; i++) faction.advanceEmotion({ confirmedLoss: 0 });
        expect(faction.grievance).toBeLessThan(0.15);
        // After 100 ticks, grievance should be effectively zero.
        for (let i = 0; i < 90; i++) faction.advanceEmotion({ confirmedLoss: 0 });
        expect(faction.grievance).toBeLessThan(0.01);
    });

    it('grievance saturates at the equilibrium for a constant stimulus, not the historical sum', () => {
        // The audit's quantitative finding: with hardcoded shortage 0.1
        // and the old 0.4 coefficient, grievance reached 1.0 in ~17
        // ticks and stayed there. With the new 0.05 coefficient and
        // 22.8-tick half-life, the equilibrium is:
        //   grievance_eq = (0.1 * 0.05) / 0.0301 ≈ 0.166
        // — a meaningful value, not clamped to 1.0.
        const faction = new FactionDecisionModel({ id: 'f', griefHalfLifeTicks: 22.8 });
        for (let i = 0; i < 200; i++) faction.advanceEmotion({ supplyShortage: 0.1 });
        const expected = (0.1 * 0.05) / (1 - Math.pow(0.5, 1 / 22.8));
        expect(faction.grievance).toBeCloseTo(expected, 2);
        // And it must NOT saturate: with the audit's chronic-shortage
        // value, the equilibrium is well below 1.0.
        expect(faction.grievance).toBeLessThan(0.5);
    });
});

describe('FactionDecisionModel.advanceEmotion (memoryOfLoss)', () => {
    it('memoryOfLoss decays with the configured rate', () => {
        const faction = new FactionDecisionModel({ id: 'f' });
        faction.advanceEmotion({ newMemoryLoss: 0.5, memoryDecayPerTick: 0.05 });
        expect(faction.memoryOfLoss).toBeCloseTo(0.5, 4);
        faction.advanceEmotion({ memoryDecayPerTick: 0.05 });
        expect(faction.memoryOfLoss).toBeCloseTo(0.475, 4);
        faction.advanceEmotion({ memoryDecayPerTick: 0.05 });
        expect(faction.memoryOfLoss).toBeCloseTo(0.45125, 4);
    });
});

describe('FactionDecisionModel constructor half-lives', () => {
    it('accepts custom fearHalfLifeTicks and griefHalfLifeTicks', () => {
        const f = new FactionDecisionModel({
            id: 'f', fearHalfLifeTicks: 1, griefHalfLifeTicks: 1
        });
        expect(f.fearHalfLifeTicks).toBe(1);
        expect(f.griefHalfLifeTicks).toBe(1);
    });
    it('defaults to the audit-supplied half-lives (6.6 fear, 22.8 grievance)', () => {
        const f = new FactionDecisionModel({ id: 'f' });
        expect(f.fearHalfLifeTicks).toBe(6.6);
        expect(f.griefHalfLifeTicks).toBe(22.8);
    });
});
