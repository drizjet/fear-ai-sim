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
const blendReputation = (old, value, weight) => { const w = Math.max(0, Number.isFinite(weight) ? weight : 1); old.value = (old.value * old.weight + clamp(value) * w) / Math.max(1, old.weight + w); old.weight += w; return old.value; };
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