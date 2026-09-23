import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

// RESP-NEURAL-FEAR-LOOP-001 — the extracted MLP stops being a read-only observer. A faction with
// a CALIBRATED model may act on its own anticipation: the signed discrepancy between what the
// model expects its situation to produce and what it currently feels (`dread`) moves the faction
// in bounded steps — dread raises fear and narrows the `opportunity` the production RAID
// candidate scores on (so the forecast reaches a real decision), a reassuring forecast calms fear
// and restores the opening. Only a model that has EARNED trust may act (enough observed samples
// and an error inside tolerance), a deadband keeps noise-sized discrepancies inert, and `step` is
// always the movement that actually happened — never a phantom step past a clamp. Mutants pinned:
// calibration gate ignored; minSamples ignored; tolerance ignored; deadband ignored; blend not
// applied; maxStep cap removed; opportunity not moved; sign of the move flipped; clamps dropped.

const TRAINED_TARGET = .5; // a target the sigmoid output can reach in a handful of steps

const world = (values = {}) => {
    const society = new SocietyCore({ seed: 41 });
    society.addFaction('f', { loot: 100, fear: .1, opportunity: .6, ...values });
    return society;
};

const last = (society, type) => society.events.filter(event => event.type === type).at(-1);
const stateOf = (society, id = 'f') => society.factions.get(id).state;

// Train the shared model against one fixed situation until its inference is calibrated.
const train = (society, { steps = 6, target = TRAINED_TARGET, features } = {}) => {
    const vector = features ?? society.fearFeatures(society.factions.get('f'));
    for (let i = 0; i < steps; i += 1) society.tick({ actions: [{ kind: 'NEURAL_FEAR_LEARN', factionId: 'f', features: vector, target, dropout: false }] });
    return vector;
};

const forecast = (society, extra = {}) => {
    society.tick({ actions: [{ kind: 'NEURAL_FEAR_FORECAST', factionId: 'f', ...extra }] });
    return last(society, 'NEURAL_FEAR_FORECAST');
};

describe('RESP-NEURAL-FEAR-LOOP-001: a calibrated model acts on the world it predicts', () => {
    it('refuses to act before it has earned calibration — and records why', () => {
        const society = world();
        const event = forecast(society);

        expect(event).toMatchObject({ applied: false, reason: 'UNCALIBRATED', calibrated: false, calibrationSamples: 0 });
        expect(event.calibrationError).toBeNull();
        expect(event.step).toBe(0);
        expect(stateOf(society).fear).toBe(.1);
        expect(stateOf(society).opportunity).toBe(.6);
    });

    it('earns calibration from learning against the world, and gates on samples and tolerance', () => {
        const society = world();
        train(society);
        const learned = last(society, 'NEURAL_FEAR_LEARNED');
        expect(learned.calibrationSamples).toBe(6);
        expect(learned.calibrationError).toBeLessThanOrEqual(.15);

        // the gate is live: a demanding caller gets a refusal instead of an effect
        expect(forecast(society, { minSamples: 100 })).toMatchObject({ reason: 'UNCALIBRATED', calibrationSamples: 6, minSamples: 100 });
        expect(forecast(society, { tolerance: 1e-9 })).toMatchObject({ reason: 'UNCALIBRATED' });
        expect(forecast(society)).toMatchObject({ applied: true, reason: 'APPLIED', calibrated: true });
    });

    it('turns dread into bounded fear and a narrower opening, moving exactly as far as allowed', () => {
        const society = world({ fear: .1, opportunity: .6 });
        train(society);
        const event = forecast(society);

        // the model expects ≈.5 fear from this situation; the faction feels .1
        expect(event.prediction).toBeCloseTo(.5, 3);
        expect(event.dread).toBeCloseTo(.4, 3);
        expect(event.step).toBeCloseTo(.1, 10); // blend .5 × .4 = .2, capped by maxStep .1
        expect(event.fearBefore).toBe(.1);
        expect(event.fearAfter).toBeCloseTo(.2, 10);
        expect(event.opportunityBefore).toBe(.6);
        expect(event.opportunityAfter).toBeCloseTo(.5, 10);
        expect(stateOf(society).fear).toBeCloseTo(.2, 10);
        expect(stateOf(society).opportunity).toBeCloseTo(.5, 10);
    });

    it('turns a reassuring forecast into calm and a restored opening', () => {
        const society = world({ fear: .8, opportunity: .05 });
        train(society);
        const event = forecast(society);

        expect(event.dread).toBeLessThan(0);
        expect(event.step).toBeCloseTo(-.1, 10);
        expect(event.fearAfter).toBeCloseTo(.7, 10);
        expect(event.opportunityAfter).toBeCloseTo(.15, 10);
    });

    it('honours the blend below the cap and never moves further than the situation asks', () => {
        const society = world({ fear: .1, opportunity: .6 });
        train(society);
        const event = forecast(society, { blend: .25, maxStep: 1 });

        expect(event.step).toBeCloseTo(.4 * .25, 3); // blend × dread, under the cap
        expect(event.fearAfter).toBeCloseTo(.1 + .1, 3);
    });

    it('leaves a discrepancy inside the deadband completely alone', () => {
        const society = world({ fear: .5, opportunity: .05 });
        train(society); // the model predicts ≈.5 for this very situation
        const event = forecast(society);

        expect(Math.abs(event.dread)).toBeLessThan(.02);
        expect(event).toMatchObject({ applied: false, reason: 'WITHIN_DEADBAND', step: 0 });
        expect(stateOf(society).fear).toBe(.5);
        expect(stateOf(society).opportunity).toBe(.05);
    });

    it('reaches a production decision: the RAID candidate scores lower after a dread forecast', () => {
        const society = world({ fear: .1, opportunity: .6 });
        train(society);
        const context = { resourceNeed: .1, legitimacy: .1, security: .9 }; // PATROL wins, so RAID is an alternative
        const score = () => {
            society.tick({ actions: [{ kind: 'FACTION_EVALUATION', faction: 'f', targetId: 'nobody', context }] });
            return last(society, 'FACTION_EVALUATION');
        };

        const before = score();
        expect(before.selected).toBe('PATROL');
        expect(before.alternatives.find(candidate => candidate.action === 'RAID').score).toBeCloseTo(.35, 10); // (.6 + .1) / 2

        forecast(society);

        const after = score();
        expect(after.alternatives.find(candidate => candidate.action === 'RAID').score).toBeCloseTo(.30, 10); // (.5 + .1) / 2 — the forecast moved the opening
    });

    it('keeps the opening inside its bounds even when the step would leave them', () => {
        // An opening already at the floor cannot be narrowed further, and one at the ceiling
        // cannot be restored further — the step is real, the bound simply holds. (The FEAR bound
        // is defensive-only: a sigmoid prediction strictly inside (0,1) can never be overshot.)
        const floored = world({ fear: .1, opportunity: 0 });
        train(floored);
        const narrowed = forecast(floored);
        expect(narrowed.step).toBeCloseTo(.1, 10);
        expect(narrowed.fearAfter).toBeCloseTo(.2, 10);
        expect(narrowed.opportunityAfter).toBe(0);

        const ceilinged = world({ fear: .8, opportunity: 1 });
        train(ceilinged);
        const restored = forecast(ceilinged);
        expect(restored.step).toBeCloseTo(-.1, 10);
        expect(restored.fearAfter).toBeCloseTo(.7, 10);
        expect(restored.opportunityAfter).toBe(1);
    });

    it('round-trips calibration through save/load and continues identically', () => {
        const society = world();
        train(society);

        const restored = SocietyCore.deserialize(society.serialize());
        expect(restored.neuralFear.calibrationSamples).toBe(society.neuralFear.calibrationSamples);
        expect(restored.neuralFear.calibrationError).toBeCloseTo(society.neuralFear.calibrationError, 12);

        const live = forecast(society);
        const resumed = forecast(restored);
        expect(resumed.prediction).toBeCloseTo(live.prediction, 12);
        expect(resumed.step).toBeCloseTo(live.step, 12);
        expect(stateOf(restored).fear).toBeCloseTo(stateOf(society).fear, 12);
        expect(stateOf(restored).opportunity).toBeCloseTo(stateOf(society).opportunity, 12);
    });

    it('is deterministic: identical worlds forecast identically', () => {
        const run = () => {
            const society = world();
            train(society);
            const event = forecast(society);
            return [event.prediction, event.dread, event.step, event.fearAfter, event.opportunityAfter, event.reason].join('|');
        };
        expect(run()).toBe(run());
    });
});
