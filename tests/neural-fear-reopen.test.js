import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';
import { NeuralFearModel } from '../socialcore.js';
import { SocietyCore } from '../societycore.js';

// RESP-NEURAL-FEAR-REOPEN-001 (re-open executed under RESP-SOURCE-ABSENT-RECONCILIATION-001's
// procedure) — third re-open: the extracted legacy sources `neuralfear.js` (FearNeuralNetwork:
// ReLU hidden layers + sigmoid output, online gradient descent, dropout, patience-based early
// stopping, running feature normalization) and `neuralnet.js` (Matrix/Layer/NeuralNetwork with
// Xavier init) are byte-exact in legacy/ and the V8 integration `NeuralFearModel` runs in
// production: NEURAL_FEAR_PREDICT records read-only inference against the faction's actual
// fear, NEURAL_FEAR_LEARN runs one online step against that same world truth. Two documented
// deviations (repository rules): draws come from the injectable world RNG and initialization is
// LAZY (constructing a world consumes zero draws), and history records carry world time.
// Mutants pinned: initialization eager (constructor draws, shifting every seeded stream);
// inference drawing from the RNG; loss not improved by learning; early stopping never firing;
// model dropped from serialize.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PINS = [
    { file: 'neuralfear.js', blob: 'b521978dcb05a29569bd51a905143f2e61c7e0be', sha256: '9b397180b7aad56f29c0a2c7197d832229b5b9f16f23e1644be6086ed2e4504c' },
    { file: 'neuralnet.js', blob: '3d320bb2f8fd6d23dd16c78bf785804cd418dc41', sha256: '9218cbde832e30093cce32ac29246eab8acb8f15b48fb04249d25b511d924a63' },
];

const FEATURES = new Array(14).fill(.3);
const seeded = (seed = 1) => {
    let state = seed >>> 0;
    return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
};
const trainingSample = [1, .5, .5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const eventsOf = (society, type) => society.events.filter(event => event.type === type);

describe('re-opened Neural fear row: extracted sources + V8 integration', () => {
    it('extracts both legacy sources byte-exact and records their upstream provenance', () => {
        const provenance = fs.readFileSync(path.join(ROOT, 'legacy', 'PROVENANCE.md'), 'utf8');
        const manifest = fs.readFileSync(path.join(ROOT, 'docs', 'SOURCE_ABSENT_RECONCILIATION.md'), 'utf8');
        for (const pin of PINS) {
            const bytes = fs.readFileSync(path.join(ROOT, 'legacy', pin.file));
            expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(pin.sha256);
            expect(provenance).toContain(pin.blob); // provenance cites the upstream blob
            expect(provenance).toContain(pin.sha256);
            // the row left SOURCE_ABSENT through the designed tripwire: both entries are gone
            expect(manifest).not.toContain(`| ${pin.file} |`);
        }
        expect(provenance).toContain('neuralfear.js');
        expect(provenance).toContain('neuralnet.js');
    });

    it('initializes lazily and drops nothing at inference: the constructor is draw-free', () => {
        let calls = 0;
        const model = new NeuralFearModel({ rng: () => { calls += 1; return .5; } });
        expect(calls).toBe(0); // lazy: constructing draws nothing, so seeded world streams are untouched
        expect(model.initialized).toBe(false);
        expect(model.weights).toEqual([]);

        model.predict(FEATURES); // first inference pays the one-time Xavier initialization
        const afterFirst = calls;
        expect(afterFirst).toBe(148); // 8×14 + 4×8 + 1×4 = every weight of the default architecture
        model.predict(FEATURES);
        expect(calls).toBe(afterFirst); // every later inference consumes zero further draws
        expect(model.sampleCount).toBe(0); // and trains nothing
    });

    it('keeps the legacy architecture: ReLU hidden ladder → sigmoid output in [0,1], configurable', () => {
        const model = new NeuralFearModel({ rng: seeded(7) });
        const { prediction } = model.predict(FEATURES);
        expect(prediction).toBeGreaterThan(0);
        expect(prediction).toBeLessThan(1); // sigmoid output, always a fear level
        expect(model.weights.map(layer => layer.length)).toEqual([8, 4, 1]); // default 14 → [8, 4] → 1
        expect(model.weights[0][0]).toHaveLength(14);

        // legacy's [64, 32] remains configurable (the V8 default is compact so saves stay small)
        const legacy = new NeuralFearModel({ hiddenLayers: [64, 32], rng: seeded(7) });
        expect(legacy.predict(FEATURES).prediction).toBeGreaterThan(0);
        expect(legacy.weights.map(layer => layer.length)).toEqual([64, 32, 1]);

        // extreme features saturate the sigmoid instead of escaping the fear range (the closed
        // boundary: sigmoid(±huge) is exactly 1 or exactly 0)
        const extreme = new NeuralFearModel({ rng: seeded(7) }).predict(new Array(14).fill(1e6)).prediction;
        expect(extreme).toBeGreaterThanOrEqual(0);
        expect(extreme).toBeLessThanOrEqual(1);
    });

    it('learns online against world truth: loss falls, running normalization updates, patience counts', () => {
        const model = new NeuralFearModel({ rng: seeded(1) });
        model.predict(trainingSample); // initialize the parameters so they can be diffed
        const initial = model.serialize();
        const first = model.learn(trainingSample, .9, { now: 0, dropout: false });
        for (let step = 1; step < 30; step += 1) model.learn(trainingSample, .9, { now: step, dropout: false });

        expect(model.sampleCount).toBe(30);
        expect(model.history.at(-1)).toMatchObject({ at: 29, sampleCount: 30 }); // world time, not a wall clock
        expect(model.bestLoss).toBeLessThan(first.lossBefore);
        expect(model.learningRate).toBe(.05);

        // online gradient descent REALLY ran — a loss-only assertion is vacuous here, because
        // running normalization alone shifts the loss. So the parameters themselves are diffed:
        // the sample is sparse (11 of its 14 features are 0) and zeroed ReLU units propagate no
        // error, so the counts below are floors, not totals — all a no-update mutant can reach is 0.
        const movedWeights = model.weights.flatMap((layer, l) => layer.flatMap((row, o) => row.map((weight, i) => Math.abs(weight - initial.weights[l][o][i]))));
        const movedBiases = model.biases.flatMap((row, o) => row.map((bias, i) => Math.abs(bias - initial.biases[o][i])));
        expect(movedWeights.filter(delta => delta > 0).length).toBeGreaterThanOrEqual(20);
        expect(movedBiases.filter(delta => delta > 0).length).toBeGreaterThanOrEqual(5);
        expect(Math.max(...movedWeights)).toBeGreaterThan(1e-6);
        expect(Math.max(...movedBiases)).toBeGreaterThan(1e-6);

        // legacy running normalization (Welford): the repeated sample's stats are exact
        expect(model.featureMeans[0]).toBe(1);
        expect(model.featureM2[0]).toBe(0);

        // patience-based early stopping: with a vanishing step the loss plateaus and the counter runs
        const stalled = new NeuralFearModel({ learningRate: 1e-12, patience: 2, rng: seeded(3) });
        let last = null;
        for (let step = 0; step < 6; step += 1) last = stalled.learn(trainingSample, .9, { now: step, dropout: false });
        expect(last.earlyStopped).toBe(true);
        expect(stalled.patienceCounter).toBeGreaterThanOrEqual(2);
    });

    it('round-trips the model across save/load, including the lazily uninitialized case', () => {
        const model = new NeuralFearModel({ rng: seeded(5) });
        for (let step = 0; step < 3; step += 1) model.learn(trainingSample, .4, { now: step, dropout: false });
        const restored = new NeuralFearModel({ rng: seeded(99) }).loadState(JSON.parse(JSON.stringify(model.serialize())));
        expect(restored.serialize()).toEqual(model.serialize());
        expect(restored.predict(trainingSample).prediction).toBe(model.predict(trainingSample).prediction);
        expect(restored.learningRate).toBe(model.learningRate);

        // an unused model stays unused across the round-trip (loadState returns early)
        const untouched = new NeuralFearModel({ rng: seeded(1) }).loadState(new NeuralFearModel({ rng: seeded(1) }).serialize());
        expect(untouched.initialized).toBe(false);
        expect(untouched.weights).toEqual([]);
    });

    it('predicts/learns in production against the faction\'s actual fear, as chained canonical events', () => {
        const society = new SocietyCore({ seed: 3 });
        society.addFaction('watch', { fear: .6, threatPerception: .5 });
        society.tick({ actions: [{ kind: 'NEURAL_FEAR_PREDICT', factionId: 'watch' }] });
        expect(society.neuralFear.sampleCount).toBe(0); // inference alone trains nothing
        society.tick({ actions: [{ kind: 'NEURAL_FEAR_LEARN', factionId: 'watch' }] });
        society.tick({ actions: [{ kind: 'NEURAL_FEAR_LEARN', factionId: 'watch' }] });

        const [prediction] = eventsOf(society, 'NEURAL_FEAR_PREDICTION');
        expect(prediction.type).toBe('NEURAL_FEAR_PREDICTION');
        expect(prediction.factionId).toBe('watch');
        expect(prediction.actual).toBeCloseTo(.6, 10); // the faction's real fear is the target of record
        expect(prediction.error).toBeCloseTo(Math.abs(prediction.prediction - .6), 10);
        expect(prediction.sampleCount).toBe(0); // inference is read-only evidence, not training
        expect(prediction.features).toHaveLength(14); // the faction's canonical vector, recorded

        const learned = eventsOf(society, 'NEURAL_FEAR_LEARNED');
        expect(learned).toHaveLength(2);
        expect(learned[0]).toMatchObject({ factionId: 'watch' });
        expect(learned[0].target).toBeCloseTo(.6, 10);
        expect(learned[0].sampleCount).toBe(1);
        expect(learned[0].worldTime).toBe(2); // the world clock, never a wall clock
        expect(learned[1].sampleCount).toBe(2);

        // the prediction chains off its turn; both integrations are audited
        const turn = society.events.find(event => event.id === prediction.parentId);
        expect(turn.type).toBe('TURN');
        expect(society.causalChain(learned[1].id).lineage.map(event => event.type))
            .toEqual(['TURN', 'NEURAL_FEAR_LEARNED']);
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('guards every malformed integration before any event exists', () => {
        const society = new SocietyCore({ seed: 3 });
        society.addFaction('watch', { fear: .6 });
        const before = society.events.length;

        expect(() => society.tick({ actions: [{ kind: 'NEURAL_FEAR_PREDICT', factionId: 'ghost' }] })).toThrow(/Unknown faction "ghost"/);
        expect(() => society.tick({ actions: [{ kind: 'NEURAL_FEAR_LEARN', factionId: 'ghost' }] })).toThrow(/Unknown faction "ghost"/);
        expect(() => society.tick({ actions: [{ kind: 'NEURAL_FEAR_PREDICT', features: [1, 2, 3] }] })).toThrow(/requires 14 features/);
        expect(() => society.tick({ actions: [{ kind: 'NEURAL_FEAR_LEARN', features: new Array(14).fill(Number.NaN) }] })).toThrow(/finite feature values/);
        // only the turn wrapper is recorded — no integration event exists for a rejected action
        expect(eventsOf(society, 'NEURAL_FEAR_PREDICTION')).toEqual([]);
        expect(eventsOf(society, 'NEURAL_FEAR_LEARNED')).toEqual([]);
        expect(society.events.length).toBe(before + 4); // four committed turn wrappers, nothing else
        expect(society.neuralFear.initialized).toBe(false); // a rejected action never initializes the model
    });

    it('keeps whole worlds deterministic and save/load-identical with the model in the loop', () => {
        const run = (society) => {
            society.addFaction('watch', { fear: .6, threatPerception: .5, grievance: .2 });
            society.tick({ actions: [{ kind: 'NEURAL_FEAR_LEARN', factionId: 'watch' }] });
            society.tick({ actions: [{ kind: 'NEURAL_FEAR_PREDICT', factionId: 'watch' }] });
            return society;
        };
        const control = run(new SocietyCore({ seed: 17 }));
        const interrupted = run(new SocietyCore({ seed: 17 }));
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(interrupted.serialize())));
        expect(restored.neuralFear.serialize()).toEqual(interrupted.neuralFear.serialize());

        restored.tick({ actions: [{ kind: 'NEURAL_FEAR_LEARN', factionId: 'watch' }] });
        control.tick({ actions: [{ kind: 'NEURAL_FEAR_LEARN', factionId: 'watch' }] });
        expect(restored.serialize()).toEqual(control.serialize());
        expect(JSON.stringify(run(new SocietyCore({ seed: 17 })).serialize()))
            .toBe(JSON.stringify(run(new SocietyCore({ seed: 17 })).serialize()));
        expect(restored.auditEventGraph().ok).toBe(true);
    });
});
