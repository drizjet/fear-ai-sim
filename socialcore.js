import { randomSource } from './randomcore.js';
const clamp = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
export class Personality {
    constructor(values = {}, { rng } = {}) {
        // Trait defaults draw from the injectable, serializable RNG (seeded deterministic by default).
        this.rng = randomSource(rng);
        this.random = () => this.rng.next();
        this.openness = clamp(values.openness ?? this.random());
        this.conscientiousness = clamp(values.conscientiousness ?? this.random());
        this.extraversion = clamp(values.extraversion ?? this.random());
        this.agreeableness = clamp(values.agreeableness ?? this.random());
        this.neuroticism = clamp(values.neuroticism ?? this.random());
        this.riskTolerance = clamp(values.riskTolerance ?? 1 - this.neuroticism);
        this.uncertaintyAversion = clamp(values.uncertaintyAversion ?? this.neuroticism);
        this.impulsiveness = clamp(values.impulsiveness ?? 1 - this.conscientiousness);
    }
    fearSensitivity() { return .5 + this.neuroticism; }
    decisionBandWidth() { return this.impulsiveness * .15; }
}
export class Morale { constructor(value = 1) { this.value = Math.max(.2, Math.min(2, Number.isFinite(value) ? value : 1)); } update({ fear = 0, victories = 0, losses = 0, safe = false } = {}) { this.value += safe ? .05 : .01; this.value += victories * .01 - losses * .002 - clamp(fear) * .01; this.value = Math.max(.2, Math.min(2, this.value)); return this.value; } canFreeze() { return this.value < .4; } }
export class BeliefEvidence {
    constructor(data = {}, { now } = {}) {
        Object.assign(this, { claim: data.claim || '', subject: data.subject ?? null, valueEstimate: data.valueEstimate ?? null, source: data.source || 'unknown', sourceTrust: clamp(data.sourceTrust ?? .5), directObservation: Boolean(data.directObservation), confidence: clamp(data.confidence ?? .5), timestamp: Number.isFinite(data.timestamp) ? data.timestamp : (now ? now() : 0), emotionalIntensity: clamp(data.emotionalIntensity ?? 0), latency: Number.isFinite(data.latency) ? data.latency : 0, deliveredAt: Number.isFinite(data.deliveredAt) ? data.deliveredAt : (Number.isFinite(data.timestamp) ? data.timestamp : (now ? now() : 0)) });
    }
}
export class AgentBelief {
    constructor(claim, estimate = null, confidence = 0, { now, maxEvidence = 128 } = {}) { this.claim = claim; this.estimate = estimate; this.confidence = clamp(confidence); this.lastUpdated = now ? now() : 0; this.maxEvidence = Math.max(1, Math.floor(Number.isFinite(maxEvidence) ? maxEvidence : 128)); this.evidence = []; }
    addEvidence(input) { const evidence = input instanceof BeliefEvidence ? input : new BeliefEvidence(input); this.evidence.push(evidence); if (this.evidence.length > this.maxEvidence) this.evidence.splice(0, this.evidence.length - this.maxEvidence); const weight = evidence.confidence * evidence.sourceTrust * (evidence.directObservation ? 1.25 : 1); this.confidence = clamp((this.confidence + weight) / 2); if (evidence.valueEstimate !== null) this.estimate = evidence.valueEstimate; this.lastUpdated = evidence.timestamp; return this; }
    // Belief aging is owned by SocietyCore (decayRouteBeliefs/decayRumorBeliefs, world clock).
}
// Weighted blend against standing. A subject nobody has judged yet is anchored at neutral .5 by
// the weight its first judgment does not itself carry, so weak evidence moves standing gently
// TOWARD the judgment — a favorable rumor can no longer push standing below neutral. Every
// previously pinned case is bit-identical: a full-weight first judgment still lands exactly on
// its value (anchor 0), and once any weight has accumulated the blend is the plain weighted
// average. Only the 0 < weight < 1 opening judgment changes (RESP-RUMOR-REPUTATION-EVIDENCE-001).
const blendReputation = (old, value, weight) => {
    const w = Math.max(0, Number.isFinite(weight) ? weight : 1);
    const claimed = clamp(value);
    if (old.weight <= 0) {
        const anchor = Math.max(0, 1 - w);
        old.value = (0.5 * anchor + claimed * w) / Math.max(1e-9, anchor + w);
    } else {
        old.value = (old.value * old.weight + claimed * w) / Math.max(1e-9, old.weight + w);
    }
    old.weight += w;
    return old.value;
};
export class ReputationBook {
    constructor() { this.values = new Map(); this.privateValues = new Map(); }
    // PUBLIC channel: world-shared standing per subject (weighted blend, 0..1).
    update(subject, value, weight = 1) { const old = this.values.get(subject) || { value: .5, weight: 0 }; const result = blendReputation(old, value, weight); this.values.set(subject, old); return result; }
    get(subject, fallback = .5) { return this.values.get(subject)?.value ?? fallback; }
    // RESP-REPUTATION-PUBLIC-PRIVATE-001 PRIVATE channel: one observer's local opinion of a
    // target, isolated per observer — never visible through the public read (and vice versa).
    updatePrivate(observerId, targetId, value, weight = 1) {
        if (!observerId || !targetId) throw new Error('A private reputation entry requires an observer and a target');
        let channel = this.privateValues.get(observerId);
        if (!channel) { channel = new Map(); this.privateValues.set(observerId, channel); }
        const old = channel.get(targetId) || { value: .5, weight: 0 };
        const result = blendReputation(old, value, weight);
        channel.set(targetId, old);
        return result;
    }
    getPrivate(observerId, targetId, fallback = .5) { return this.privateValues.get(observerId)?.get(targetId)?.value ?? fallback; }
}
// Re-opened `Hysteresis` row (RESP-SOURCE-ABSENT-RECONCILIATION-001 re-open procedure, legacy
// source extracted byte-exact to legacy/hysteresis.js): a per-actor fear state machine
// (CALM → ALERT → ANXIOUS → PANIC → HIDE/RECOVER/FREEZE) where ENTERING and EXITING a state
// use DIFFERENT thresholds — that gap is what prevents oscillation — plus a minimum-duration
// gate so a state cannot flip on every reading. Two deviations from legacy, both forced by
// repository rules: the legacy wall-clock timestamp becomes the caller-provided world time
// (RESP-TIME-OWNERSHIP-001),
// and `minStateDuration` becomes configurable (legacy hardcodes 10 per frame; V8 fear events
// are story beats, so SocietyCore passes 2). The FREEZE roll keeps legacy's injected-rng
// determinism contract.
export class HysteresisBook {
    constructor({ rng = Math.random, minStateDuration = 10 } = {}) {
        this.actors = new Map(); // actorId → { state, stateTimer, transitionHistory }
        this.rng = rng;
        this.minStateDuration = Math.max(1, Number.isFinite(minStateDuration) ? Math.floor(minStateDuration) : 10);
        this.maxHistoryLength = 50;
        // Faithful copy of the legacy thresholds: exitUp — leave upward when fear exceeds it;
        // exitDown — leave downward when fear drops below it; enter — documents the gap of the
        // state above (exitUp of one rung equals enter of the next — the asymmetry is exitUp vs
        // exitDown inside each rung, so ALERT holds between .15 and .55).
        this.thresholds = {
            CALM: { enter: 0.0, exitUp: 0.25, exitDown: -1.0 },
            ALERT: { enter: 0.25, exitUp: 0.55, exitDown: 0.15 },
            ANXIOUS: { enter: 0.55, exitUp: 0.75, exitDown: 0.45 },
            PANIC: { enter: 0.75, exitUp: 0.85, exitDown: 0.65 },
            HIDE: { enter: 0.85, exitUp: 0.90, exitDown: 0.60 },
            RECOVER: { enter: 0.0, exitUp: 0.30, exitDown: 0.20 },
            FREEZE: { enter: 0.80, exitUp: 0.95, exitDown: 0.50 },
        };
    }
    controller(actorId) {
        if (!this.actors.has(actorId)) this.actors.set(actorId, { state: 'CALM', stateTimer: 0, transitionHistory: [] });
        return this.actors.get(actorId);
    }
    getState(actorId) { return this.controller(actorId).state; }
    getStateDuration(actorId) { return this.controller(actorId).stateTimer; }
    getHistory(actorId) { return [...this.controller(actorId).transitionHistory]; }
    canChangeState(actorId) { return this.controller(actorId).stateTimer >= this.minStateDuration; }
    // Faithful port of legacy `update()`: wall clock replaced by the caller-provided world
    // time, per-actor history instead of one shared log. Returns the transition (or none).
    update(actorId, fearLevel, context = {}, now = 0) {
        const { skill = 0.5, morale = 1.0, threats = [] } = context;
        const actor = this.controller(actorId);
        actor.stateTimer += 1;
        // Enforce minimum state duration to prevent rapid oscillation (legacy gate).
        if (actor.stateTimer < this.minStateDuration) {
            return { actorId, state: actor.state, transitioned: false, from: actor.state, to: actor.state, fearLevel, stateTimer: actor.stateTimer };
        }
        const oldState = actor.state;
        let newState = actor.state;
        const currentThresholds = this.thresholds[actor.state];
        switch (actor.state) {
            case 'CALM':
                if (fearLevel > currentThresholds.exitUp) newState = 'ALERT';
                break;
            case 'ALERT':
                if (fearLevel > currentThresholds.exitUp) newState = 'ANXIOUS';
                else if (fearLevel < currentThresholds.exitDown) newState = 'CALM';
                break;
            case 'ANXIOUS':
                if (fearLevel > currentThresholds.exitUp) newState = 'PANIC';
                else if (fearLevel < currentThresholds.exitDown) newState = 'ALERT';
                break;
            case 'PANIC':
                if (morale < 0.4 && fearLevel > 0.8 && this.rng() < 0.05) newState = 'FREEZE';
                else if (fearLevel > currentThresholds.exitUp && skill > 0.6) newState = 'HIDE';
                else if (fearLevel < currentThresholds.exitDown) newState = 'ANXIOUS';
                break;
            case 'HIDE':
                if (fearLevel > currentThresholds.exitUp) newState = 'PANIC';
                else if (fearLevel < currentThresholds.exitDown || threats.length === 0) newState = 'RECOVER';
                break;
            case 'RECOVER':
                if (fearLevel > currentThresholds.exitUp) newState = 'ANXIOUS';
                else if (fearLevel < currentThresholds.exitDown) newState = 'CALM';
                break;
            case 'FREEZE':
                if (fearLevel < currentThresholds.exitDown || this.rng() < 0.02) newState = 'RECOVER';
                break;
        }
        if (newState !== actor.state) {
            this.record(actor, actor.state, newState, fearLevel, 'automatic', now); // legacy records BEFORE the reset
            actor.state = newState;
            actor.stateTimer = 0;
            return { actorId, state: newState, transitioned: true, from: oldState, to: newState, fearLevel, stateTimer: 0 };
        }
        return { actorId, state: actor.state, transitioned: false, from: oldState, to: oldState, fearLevel, stateTimer: actor.stateTimer };
    }
    record(actor, from, to, fearLevel, reason, now) {
        actor.transitionHistory.push({ timestamp: now, from, to, fearLevel, reason, stateTimer: actor.stateTimer });
        if (actor.transitionHistory.length > this.maxHistoryLength) actor.transitionHistory.shift();
    }
    // Legacy `getHysteresisGap`: how far fear must overshoot/undershoot for the ladder to move.
    getHysteresisGap(fromState, toState) {
        const fromThresholds = this.thresholds[fromState];
        const states = ['CALM', 'ALERT', 'ANXIOUS', 'PANIC', 'HIDE'];
        const fromIndex = states.indexOf(fromState);
        const toIndex = states.indexOf(toState);
        if (toIndex > fromIndex) return fromThresholds.exitUp - this.thresholds[toState].enter;
        if (toIndex < fromIndex) return this.thresholds[toState].enter - fromThresholds.exitDown;
        return 0;
    }
}
// Re-opened `Habituation` row (RESP-SOURCE-ABSENT-RECONCILIATION-001 re-open procedure, legacy
// source extracted byte-exact to legacy/habituation.js): repeated exposures to the same
// stimulus attenuate the fear response — novelty protects the first exposures, recovery runs
// over WORLD time (callers pass `now`; no wall-clock, per RESP-TIME-OWNERSHIP-001).
export class HabituationBook {
    constructor(config = {}) {
        this.exposures = new Map(); // key → { count, habituationLevel, lastExposure, firstExposure, totalFearReduced }
        this.config = {
            habituationRate: config.habituationRate ?? 0.08, // 8% reduction per exposure
            maxHabituation: config.maxHabituation ?? 0.60, // max 60% fear reduction
            recoveryRate: config.recoveryRate ?? 0.02, // recovery per world-time unit
            noveltyBoost: config.noveltyBoost ?? 0.15, // bonus for the first exposures
            stimulusTypes: config.stimulusTypes ?? {
                PREDATOR: { decaySpeed: 1.0, recoverySpeed: 1.0 },
                PHEROMONE: { decaySpeed: 1.5, recoverySpeed: 2.0 },
                SOUND: { decaySpeed: 0.8, recoverySpeed: 1.5 },
                VISUAL: { decaySpeed: 1.2, recoverySpeed: 1.0 },
                MEMORY: { decaySpeed: 0.5, recoverySpeed: 0.5 },
                GROUP_PANIC: { decaySpeed: 2.0, recoverySpeed: 1.0 },
            },
        };
    }
    key(stimulusType, actorId, stimulusId = null) { return stimulusId == null ? `${stimulusType}:${actorId ?? 'world'}` : `${stimulusType}:${actorId ?? 'world'}:${stimulusId}`; }
    typeConfig(stimulusType) { return this.config.stimulusTypes[stimulusType] ?? this.config.stimulusTypes.VISUAL; }
    // Legacy semantics preserved: pending recovery first, then potential = min(cap, count *
    // rate * decaySpeed) minus the novelty bonus for the first three exposures; the exposure
    // count increments after the level is computed (the first exposure never reduces fear).
    attenuate(baseFear, { stimulusType = 'VISUAL', actorId = null, stimulusId = null, now = 0 } = {}) {
        const time = Number.isFinite(now) ? now : 0;
        const typeConfig = this.typeConfig(stimulusType);
        const key = this.key(stimulusType, actorId, stimulusId);
        let exposure = this.exposures.get(key);
        if (!exposure) {
            exposure = { count: 0, habituationLevel: 0, lastExposure: time, firstExposure: time, totalFearReduced: 0 };
            this.exposures.set(key, exposure);
        } else {
            const timeSince = Math.max(0, time - exposure.lastExposure);
            exposure.habituationLevel = Math.max(0, exposure.habituationLevel - this.config.recoveryRate * typeConfig.recoverySpeed * timeSince);
        }
        const base = Number.isFinite(baseFear) ? Math.max(0, baseFear) : 0;
        const potential = Math.min(this.config.maxHabituation, exposure.count * this.config.habituationRate * typeConfig.decaySpeed);
        const novelty = exposure.count < 3 ? this.config.noveltyBoost * (3 - exposure.count) / 3 : 0;
        const habituationLevel = Math.max(0, potential - novelty);
        const adjusted = Math.max(0, base * (1 - habituationLevel));
        exposure.habituationLevel = habituationLevel;
        exposure.count += 1;
        exposure.lastExposure = time;
        exposure.totalFearReduced += base - adjusted;
        return { key, base, adjusted, fearReduced: base - adjusted, habituationLevel, exposureCount: exposure.count };
    }
    // Read with pending recovery applied (legacy getHabituationInfo behavior).
    read(stimulusType, actorId = null, stimulusId = null, now = 0) {
        const exposure = this.exposures.get(this.key(stimulusType, actorId, stimulusId));
        if (!exposure) return { exposureCount: 0, habituationLevel: 0, totalFearReduced: 0 };
        const typeConfig = this.typeConfig(stimulusType);
        const timeSince = Math.max(0, (Number.isFinite(now) ? now : 0) - exposure.lastExposure);
        const habituationLevel = Math.max(0, exposure.habituationLevel - this.config.recoveryRate * typeConfig.recoverySpeed * timeSince);
        return { exposureCount: exposure.count, habituationLevel, totalFearReduced: exposure.totalFearReduced };
    }
}
const sigmoid = value => 1 / (1 + Math.exp(-value));
// Re-opened `Neural fear` row (re-open procedure from docs/SOURCE_ABSENT_RECONCILIATION.md):
// the legacy sources are extracted byte-exact (legacy/neuralfear.js, legacy/neuralnet.js —
// blob + sha256 pinned in legacy/PROVENANCE.md) and the V8 integration keeps their semantics:
// a feedforward MLP (Xavier/Glorot init, ReLU hidden layers, sigmoid output, online gradient
// descent, dropout, early stopping, running feature normalization) predicting a fear level
// from faction features. Three deviations, all forced by repository rules and documented:
//   - weight/statistic draws come from the injectable serializable RNG (legacy used
//     Math.random), and initialization is LAZY — constructing a world consumes ZERO draws, so
//     every existing seeded RNG stream is untouched until the model is first used;
//   - training-history records carry the caller's world time (no wall clock,
//     RESP-TIME-OWNERSHIP-001);
//   - the default architecture is compact (14 faction-state features → [8, 4] → 1) so a
//     serialized model stays small; legacy's [64, 32] remains configurable.
export class NeuralFearModel {
    constructor({ rng = null, inputSize = 14, hiddenLayers = [8, 4], outputSize = 1, learningRate = .05, dropoutRate = .2, patience = 10, maxHistory = 50 } = {}) {
        const source = randomSource();
        this.rng = typeof rng === 'function' ? rng : () => source.next();
        this.inputSize = Math.max(1, Math.floor(Number.isFinite(inputSize) ? inputSize : 14));
        this.hiddenLayers = (Array.isArray(hiddenLayers) && hiddenLayers.length ? hiddenLayers : [8, 4]).map(size => Math.max(1, Math.floor(Number(size) || 1)));
        this.outputSize = Math.max(1, Math.floor(Number.isFinite(outputSize) ? outputSize : 1));
        this.learningRate = Number.isFinite(learningRate) && learningRate > 0 ? learningRate : .05;
        this.dropoutRate = Math.max(0, Math.min(.9, Number.isFinite(dropoutRate) ? dropoutRate : .2));
        this.patience = Math.max(1, Math.floor(Number.isFinite(patience) ? patience : 10));
        this.maxHistory = Math.max(1, Math.floor(Number.isFinite(maxHistory) ? maxHistory : 50));
        this.initialized = false;
        this.weights = [];
        this.biases = [];
        this.featureMeans = null;
        this.featureM2 = null;
        this.sampleCount = 0;
        this.bestLoss = Infinity;
        this.patienceCounter = 0;
        this.history = [];
    }
    draw() { return Number(this.rng()); }
    // Lazy Xavier/Glorot initialization — the only place weight draws happen.
    ensureInitialized() {
        if (this.initialized) return;
        const sizes = [this.inputSize, ...this.hiddenLayers, this.outputSize];
        for (let layer = 0; layer < sizes.length - 1; layer += 1) {
            const fanIn = sizes[layer];
            const fanOut = sizes[layer + 1];
            const scale = Math.sqrt(2 / (fanIn + fanOut));
            const layerWeights = [];
            for (let out = 0; out < fanOut; out += 1) {
                const row = [];
                for (let input = 0; input < fanIn; input += 1) row.push((this.draw() * 2 - 1) * scale);
                layerWeights.push(row);
            }
            this.weights.push(layerWeights);
            this.biases.push(new Array(fanOut).fill(0));
        }
        this.featureMeans = new Array(this.inputSize).fill(0);
        this.featureM2 = new Array(this.inputSize).fill(0);
        this.initialized = true;
    }
    // Running feature normalization (legacy behavior), world-time free and deterministic.
    normalize(features = []) {
        const means = this.featureMeans ?? new Array(this.inputSize).fill(0);
        const m2 = this.featureM2 ?? new Array(this.inputSize).fill(0);
        const n = this.sampleCount;
        return means.map((mean, index) => {
            const std = n > 1 ? Math.sqrt(Math.max(1e-12, m2[index] / n)) : 1;
            const value = Number.isFinite(features[index]) ? features[index] : 0;
            return (value - mean) / (std === 0 ? 1 : std);
        });
    }
    forward(normalized, { dropout = false } = {}) {
        const activations = [normalized];
        const masks = [];
        let current = normalized;
        for (let layer = 0; layer < this.weights.length; layer += 1) {
            const layerWeights = this.weights[layer];
            const layerBiases = this.biases[layer];
            const isOutput = layer === this.weights.length - 1;
            const out = layerWeights.map((row, index) => {
                let sum = layerBiases[index];
                for (let input = 0; input < row.length; input += 1) sum += row[input] * current[input];
                return isOutput ? sigmoid(sum) : Math.max(0, sum); // sigmoid output, ReLU hidden
            });
            if (dropout && !isOutput) {
                // Plain legacy dropout: one RNG draw per hidden unit, masked to zero or kept.
                const mask = out.map(() => (this.draw() < this.dropoutRate ? 0 : 1));
                for (let index = 0; index < out.length; index += 1) out[index] *= mask[index];
                masks.push(mask);
            } else masks.push(null);
            activations.push(out);
            current = out;
        }
        return { activations, masks, prediction: activations[activations.length - 1][0] };
    }
    // Inference — trains nothing and drops nothing out. The first call pays the one-time lazy
    // initialization (the only draw site); every later call consumes zero further draws.
    predict(features = []) {
        this.ensureInitialized();
        const normalized = this.normalize(features);
        const { prediction } = this.forward(normalized, { dropout: false });
        return { prediction, normalized, sampleCount: this.sampleCount, initialized: true };
    }
    // One online gradient-descent step (legacy online learning) with dropout, early-stopping
    // bookkeeping, and running normalization updates on the returned record.
    learn(features = [], target = 0, { now = 0, dropout = true } = {}) {
        this.ensureInitialized();
        const normalized = this.normalize(features);
        const goal = clamp(Number.isFinite(target) ? target : 0);
        const pass = this.forward(normalized, { dropout });
        const { activations, masks } = pass;
        const prediction = pass.prediction;
        const lossBefore = (prediction - goal) ** 2;
        // Backpropagation: sigmoid derivative at the output, then ReLU (+dropout mask) per
        // hidden layer, updating every weight and bias against its own input activation.
        let delta = [2 * (prediction - goal) * prediction * (1 - prediction)];
        for (let layer = this.weights.length - 1; layer >= 0; layer -= 1) {
            const layerWeights = this.weights[layer];
            const layerBiases = this.biases[layer];
            const previous = activations[layer];
            for (let out = 0; out < layerWeights.length; out += 1) {
                for (let input = 0; input < layerWeights[out].length; input += 1) {
                    layerWeights[out][input] -= this.learningRate * delta[out] * previous[input];
                }
                layerBiases[out] -= this.learningRate * delta[out];
            }
            if (layer > 0) {
                const hidden = activations[layer];
                const mask = masks[layer - 1] ?? hidden.map(() => 1);
                delta = hidden.map((activation, unit) => {
                    let sum = 0;
                    for (let out = 0; out < layerWeights.length; out += 1) sum += layerWeights[out][unit] * delta[out];
                    return sum * (activation > 0 ? 1 : 0) * mask[unit];
                });
            }
        }
        return this.finishLearn({ features, goal, prediction, lossBefore, now });
    }
    finishLearn({ features, goal, prediction, lossBefore, now }) {
        const n = this.sampleCount + 1;
        for (let index = 0; index < this.inputSize; index += 1) {
            const value = Number.isFinite(features[index]) ? features[index] : 0;
            const deltaValue = value - this.featureMeans[index];
            this.featureMeans[index] += deltaValue / n;
            this.featureM2[index] += deltaValue * (value - this.featureMeans[index]);
        }
        this.sampleCount = n;
        const lossAfter = (this.forward(this.normalize(features), { dropout: false }).prediction - goal) ** 2;
        this.history.push({ at: now, loss: lossBefore, sampleCount: n });
        if (this.history.length > this.maxHistory) this.history.shift();
        if (lossBefore < this.bestLoss - 1e-9) { this.bestLoss = lossBefore; this.patienceCounter = 0; }
        else this.patienceCounter += 1;
        return { prediction, lossBefore, lossAfter, sampleCount: n, earlyStopped: this.patienceCounter >= this.patience, worldTime: now };
    }
    serialize() {
        return {
            initialized: this.initialized, inputSize: this.inputSize, hiddenLayers: [...this.hiddenLayers], outputSize: this.outputSize,
            learningRate: this.learningRate, dropoutRate: this.dropoutRate, sampleCount: this.sampleCount,
            weights: this.weights.map(layer => layer.map(row => [...row])), biases: this.biases.map(row => [...row]),
            featureMeans: this.featureMeans ? [...this.featureMeans] : null, featureM2: this.featureM2 ? [...this.featureM2] : null,
            bestLoss: Number.isFinite(this.bestLoss) ? this.bestLoss : null, patienceCounter: this.patienceCounter, history: this.history.map(entry => ({ ...entry })),
        };
    }
    loadState(state = {}) {
        if (!state?.initialized) return this; // an unused model stays lazily uninitialized
        this.inputSize = Math.max(1, Math.floor(Number(state.inputSize) || this.inputSize));
        this.hiddenLayers = (state.hiddenLayers ?? this.hiddenLayers).map(size => Math.max(1, Math.floor(Number(size) || 1)));
        this.outputSize = Math.max(1, Math.floor(Number(state.outputSize) || this.outputSize));
        if (Number.isFinite(state.learningRate) && state.learningRate > 0) this.learningRate = state.learningRate;
        if (Number.isFinite(state.dropoutRate)) this.dropoutRate = Math.max(0, Math.min(.9, state.dropoutRate));
        this.weights = (state.weights ?? []).map(layer => layer.map(row => row.map(Number)));
        this.biases = (state.biases ?? []).map(row => row.map(Number));
        this.featureMeans = (state.featureMeans ?? new Array(this.inputSize).fill(0)).map(Number);
        this.featureM2 = (state.featureM2 ?? new Array(this.inputSize).fill(0)).map(Number);
        this.sampleCount = Math.max(0, Math.floor(Number(state.sampleCount) || 0));
        this.bestLoss = Number.isFinite(state.bestLoss) ? state.bestLoss : Infinity;
        this.patienceCounter = Math.max(0, Math.floor(Number(state.patienceCounter) || 0));
        this.history = (state.history ?? []).map(entry => ({ ...entry }));
        this.initialized = true;
        return this;
    }
}