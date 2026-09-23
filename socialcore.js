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
// Re-opened `FearCore live transitions` / `Brain scale cleanup` rows (fourth re-open through the
// procedure in docs/SOURCE_ABSENT_RECONCILIATION.md): the legacy `fearcore.js` band contract is
// ported verbatim — 11 bands (4 core raw-fear driven + 7 context-driven extended), the documented
// enter/exit thresholds (ALERT .8, ANXIOUS 1.4, PANIC 3.8; exits .55/.8/1.2), panicLockTicks 10
// behind a PRESENCE_BREAK bypass, the extended rules (AGGRESSIVE anger override, HIDE under
// threat, FREEZE behind low morale, VAULTING/CRAWLING obstacle states, RECOVER with accumulated
// progress), the force-fallback for leaving an extended band, the snap-to-CALM guard, and the
// bounded decisionTrace. `fearScale` is brain.js's §332 adapter verbatim (normalized 0..1 →
// FearCore's 0..3.8 raw scale, so the enter thresholds land at 0.21/0.37/1.0).
// V8 additions, both documented: `serialize`/`loadState` (world save/load) and a context `rng`
// that production always injects (legacy defaulted to the wall clock's Math.random).
const finite = (value, fallback) => (Number.isFinite(value) ? value : fallback); // legacy fearcore.js helper
export const FEAR_BANDS = Object.freeze(['CALM', 'ALERT', 'ANXIOUS', 'PANIC', 'PRESENCE_BREAK', 'RECOVER', 'AGGRESSIVE', 'HIDE', 'FREEZE', 'VAULTING', 'CRAWLING']);
export const CORE_BANDS = Object.freeze(['CALM', 'ALERT', 'ANXIOUS', 'PANIC']);
export const EXTENDED_BANDS = Object.freeze(['PRESENCE_BREAK', 'RECOVER', 'AGGRESSIVE', 'HIDE', 'FREEZE', 'VAULTING', 'CRAWLING']);
export const DEFAULT_FEARCORE_CONFIG = Object.freeze({
    enter: Object.freeze({ ALERT: 0.8, ANXIOUS: 1.4, PANIC: 3.8 }),
    exit: Object.freeze({ CALM: 0.55, ALERT: 0.8, ANXIOUS: 1.2 }),
    panicLockTicks: 10,
    extended: Object.freeze({
        PRESENCE_BREAK: { enterFear: 0.95, enterStateTimer: 200, exitFear: 0.5 },
        RECOVER: { exitFear: 0.2, exitRecovery: 0.8 },
        AGGRESSIVE: { enterAnger: 0.6, exitAnger: 0.4 },
        HIDE: { enterSkill: 0.6, enterMinThreats: 1, exitThreats: 0, exitPanicFear: 0.85 },
        FREEZE: { enterMorale: 0.4, exitProbability: 0.02 },
        VAULTING: { enterSkill: 0.5, exitObstacleCleared: true },
        CRAWLING: { enterObstaclePresent: true, exitObstacleCleared: true },
    }),
});
// brain.js §332: the brain's fear is normalized 0..1, FearCore's raw scale is 0..3.8 (PANIC at
// 3.8). The mapping is linear — 0.21/0.37/1.0 of normalized fear reach ALERT/ANXIOUS/PANIC.
export const FEARCORE_RAW_SCALE = 3.8;
export const fearScale = brainFear => (Number.isFinite(brainFear) ? Math.max(0, Math.min(1, brainFear)) * FEARCORE_RAW_SCALE : 0);
export class FearCore {
    constructor(config = {}) {
        const userExtended = config.extended || {};
        this.config = {
            enter: { ...DEFAULT_FEARCORE_CONFIG.enter, ...(config.enter || {}) },
            exit: { ...DEFAULT_FEARCORE_CONFIG.exit, ...(config.exit || {}) },
            panicLockTicks: Math.max(0, Math.floor(finite(config.panicLockTicks, DEFAULT_FEARCORE_CONFIG.panicLockTicks))),
            extended: {},
        };
        for (const band of EXTENDED_BANDS) this.config.extended[band] = { ...DEFAULT_FEARCORE_CONFIG.extended[band], ...(userExtended[band] || {}) };
        this.state = 'CALM';
        this.tick = 0;
        this.panicLockedUntil = null;
        this.recoveryProgress = 0;
        this.stateTimer = 0;
        this.decisionTrace = [];
        this.maxTraceLength = Math.max(1, Math.floor(finite(config.maxTraceLength, 100)));
    }
    reset(state = 'CALM') {
        if (!FEAR_BANDS.includes(state)) throw new RangeError(`Unknown fear band: ${state}`);
        this.state = state;
        this.tick = 0;
        this.panicLockedUntil = state === 'PANIC' ? this.config.panicLockTicks : null;
        this.recoveryProgress = 0;
        this.stateTimer = 0;
        this.decisionTrace = [];
        return this.state;
    }
    // The sole state-mutation entry point (legacy contract §260).
    update(rawFear, context = {}) {
        const fear = Math.max(0, finite(rawFear, 0));
        const previous = this.state;
        this.tick += 1;
        this.stateTimer += 1;
        // Phase 0: PRESENCE_BREAK bypasses the panic lock (it is the highest-priority band).
        if (this.state === 'PANIC' && fear >= this.config.extended.PRESENCE_BREAK.enterFear && this.stateTimer >= this.config.extended.PRESENCE_BREAK.enterStateTimer) {
            this.state = 'PRESENCE_BREAK';
            return this._result(previous, fear, { from: previous, to: 'PRESENCE_BREAK', reason: 'EXTREME_FEAR_LOCK', threshold: this.config.extended.PRESENCE_BREAK.enterFear });
        }
        // Phase 1: an active panic lock suppresses every other transition.
        if (this.state === 'PANIC' && this.tick < this.panicLockedUntil) {
            return this._result(previous, fear, { from: previous, to: previous, reason: 'PANIC_LOCK', threshold: this.config.exit.ANXIOUS });
        }
        // Phase 2: context-driven extended bands take precedence over the core ladder.
        const extended = this._evaluateExtendedBands(fear, context);
        if (extended) {
            this.state = extended.to;
            if (extended.to === 'PANIC') this.panicLockedUntil = this.tick + this.config.panicLockTicks;
            return this._result(previous, fear, extended);
        }
        // Phase 2.5: an extended band with no transition keeps holding (§260 stay rule).
        if (EXTENDED_BANDS.includes(this.state)) return this._result(previous, fear, { from: previous, to: previous, reason: 'EXTENDED_BAND_STAY', threshold: null });
        // Phase 3: the core ladder — asymmetric enter/exit thresholds (the hysteresis of §23).
        let reason = 'NO_TRANSITION';
        let threshold = null;
        if (this.state === 'CALM' && fear >= this.config.enter.ALERT) {
            threshold = this.config.enter.ALERT; reason = 'ENTER_ALERT'; this.state = 'ALERT';
        } else if (this.state === 'ALERT') {
            if (fear >= this.config.enter.ANXIOUS) { threshold = this.config.enter.ANXIOUS; reason = 'ENTER_ANXIOUS'; this.state = 'ANXIOUS'; }
            else if (fear < this.config.exit.CALM) { threshold = this.config.exit.CALM; reason = 'EXIT_TO_CALM'; this.state = 'CALM'; }
        } else if (this.state === 'ANXIOUS') {
            if (fear >= this.config.enter.PANIC) { threshold = this.config.enter.PANIC; reason = 'ENTER_PANIC'; this.state = 'PANIC'; this.panicLockedUntil = this.tick + this.config.panicLockTicks; }
            else if (fear < this.config.exit.ALERT) { threshold = this.config.exit.ALERT; reason = 'EXIT_TO_ALERT'; this.state = 'ALERT'; }
        } else if (this.state === 'PANIC' && fear < this.config.exit.ANXIOUS) {
            threshold = this.config.exit.ANXIOUS; reason = 'EXIT_TO_ANXIOUS'; this.state = 'ANXIOUS'; this.panicLockedUntil = null;
        } else if (this.state === 'RECOVER') {
            this.recoveryProgress = Math.min(1, this.recoveryProgress + 0.1);
            if (fear < this.config.extended.RECOVER.exitFear && this.recoveryProgress >= this.config.extended.RECOVER.exitRecovery) {
                reason = 'RECOVER_COMPLETE'; threshold = this.config.extended.RECOVER.exitFear; this.state = 'CALM'; this.recoveryProgress = 0;
            } else {
                return this._result(previous, fear, { from: previous, to: previous, reason: 'RECOVER_PROGRESS', threshold: this.config.extended.RECOVER.exitFear, recoveryProgress: this.recoveryProgress });
            }
        }
        // Sanity guard: a state outside the vocabulary snaps back to CALM.
        if (!FEAR_BANDS.includes(this.state)) { this.state = 'CALM'; reason = 'SNAP_TO_CALM'; }
        return this._result(previous, fear, { from: previous, to: this.state, reason, threshold });
    }
    _evaluateExtendedBands(fear, context) {
        // `rng` stays a context input (legacy contract); production always injects the world RNG.
        const { currentAnger = 0, morale = 1, threats = 0, skill = 0, obstacleAhead = false, obstaclePresent = false, rng = Math.random } = context;
        const ext = this.config.extended;
        if (this.state !== 'AGGRESSIVE' && currentAnger > ext.AGGRESSIVE.enterAnger) return { from: this.state, to: 'AGGRESSIVE', reason: 'ANGER_OVERRIDE', threshold: ext.AGGRESSIVE.enterAnger };
        if (this.state === 'AGGRESSIVE' && currentAnger < ext.AGGRESSIVE.exitAnger) {
            if (fear >= this.config.enter.PANIC) return { from: 'AGGRESSIVE', to: 'PANIC', reason: 'EXIT_AGGRESSIVE_TO_PANIC', threshold: this.config.enter.PANIC };
            if (fear >= this.config.enter.ANXIOUS) return { from: 'AGGRESSIVE', to: 'ANXIOUS', reason: 'EXIT_AGGRESSIVE_TO_ANXIOUS', threshold: this.config.enter.ANXIOUS };
            if (fear >= this.config.enter.ALERT) return { from: 'AGGRESSIVE', to: 'ALERT', reason: 'EXIT_AGGRESSIVE_TO_ALERT', threshold: this.config.enter.ALERT };
            return { from: 'AGGRESSIVE', to: 'CALM', reason: 'EXIT_AGGRESSIVE_TO_CALM', threshold: this.config.exit.CALM };
        }
        if (this.state === 'PANIC' && fear >= ext.PRESENCE_BREAK.enterFear && this.stateTimer >= ext.PRESENCE_BREAK.enterStateTimer) return { from: 'PANIC', to: 'PRESENCE_BREAK', reason: 'EXTREME_FEAR_LOCK', threshold: ext.PRESENCE_BREAK.enterFear };
        if (this.state === 'PRESENCE_BREAK' && fear < ext.PRESENCE_BREAK.exitFear) return { from: 'PRESENCE_BREAK', to: 'RECOVER', reason: 'EXIT_PRESENCE_BREAK', threshold: ext.PRESENCE_BREAK.exitFear };
        if (this.state === 'PANIC' && skill > ext.HIDE.enterSkill && threats >= ext.HIDE.enterMinThreats && rng() < 0.3) return { from: 'PANIC', to: 'HIDE', reason: 'HIDE_UNDER_THREAT', threshold: ext.HIDE.enterSkill };
        if (this.state === 'HIDE') {
            if (threats === 0) return { from: 'HIDE', to: 'RECOVER', reason: 'EXIT_HIDE_NO_THREATS', threshold: 0 };
            if (fear > ext.HIDE.exitPanicFear) return { from: 'HIDE', to: 'PANIC', reason: 'EXIT_HIDE_PANIC_ESCAPE', threshold: ext.HIDE.exitPanicFear };
        }
        if (this.state === 'PANIC' && morale < ext.FREEZE.enterMorale && rng() < ext.FREEZE.exitProbability * 10) return { from: 'PANIC', to: 'FREEZE', reason: 'FREEZE_UNDER_PANIC', threshold: ext.FREEZE.enterMorale };
        if (this.state === 'FREEZE' && rng() < ext.FREEZE.exitProbability) return { from: 'FREEZE', to: 'RECOVER', reason: 'EXIT_FREEZE', threshold: 0 };
        if (obstacleAhead && skill > ext.VAULTING.enterSkill && this.state !== 'VAULTING') return { from: this.state, to: 'VAULTING', reason: 'OBSTACLE_VAULT', threshold: ext.VAULTING.enterSkill };
        if (this.state === 'VAULTING' && !obstacleAhead) {
            if (fear >= this.config.enter.PANIC) return { from: 'VAULTING', to: 'PANIC', reason: 'EXIT_VAULTING_PANIC', threshold: this.config.enter.PANIC };
            return { from: 'VAULTING', to: 'ALERT', reason: 'EXIT_VAULTING', threshold: 0 };
        }
        if (this.state === 'HIDE' && obstaclePresent && this.state !== 'CRAWLING') return { from: 'HIDE', to: 'CRAWLING', reason: 'CRAWL_UNDER_OBSTACLE', threshold: 0 };
        // Legacy verbatim: the `state === 'HIDE'` disjunct here is unreachable (the branch already
        // requires CRAWLING) — preserved so the port stays faithful to the extracted source.
        if (this.state === 'CRAWLING' && (!obstaclePresent || this.state === 'HIDE')) return { from: 'CRAWLING', to: 'HIDE', reason: 'EXIT_CRAWLING', threshold: 0 };
        return null;
    }
    _result(previous, fear, metadata = {}) {
        const result = {
            state: this.state,
            previousState: previous,
            changed: previous !== this.state,
            fear,
            tick: this.tick,
            panicLocked: this.state === 'PANIC' && this.tick < this.panicLockedUntil,
            panicLockedUntil: this.panicLockedUntil,
            from: metadata.from !== undefined ? metadata.from : previous,
            to: metadata.to !== undefined ? metadata.to : this.state,
            reason: metadata.reason || 'NO_TRANSITION',
            threshold: metadata.threshold ?? null,
            recoveryProgress: metadata.recoveryProgress ?? null,
        };
        this.decisionTrace.push({ ...result });
        if (this.decisionTrace.length > this.maxTraceLength) this.decisionTrace.shift();
        return result;
    }
    getDecisionTrace() { return this.decisionTrace.map(entry => ({ ...entry })); }
    serialize() {
        return { state: this.state, tick: this.tick, panicLockedUntil: this.panicLockedUntil, recoveryProgress: this.recoveryProgress, stateTimer: this.stateTimer, trace: this.decisionTrace.map(entry => ({ ...entry })) };
    }
    loadState(state = {}) {
        if (state.state && FEAR_BANDS.includes(state.state)) this.state = state.state;
        this.tick = Math.max(0, Math.floor(finite(state.tick, 0)));
        this.panicLockedUntil = Number.isFinite(state.panicLockedUntil) ? state.panicLockedUntil : null;
        this.recoveryProgress = clamp(finite(state.recoveryProgress, 0));
        this.stateTimer = Math.max(0, Math.floor(finite(state.stateTimer, 0)));
        this.decisionTrace = (state.trace ?? []).map(entry => ({ ...entry })).slice(-this.maxTraceLength);
        return this;
    }
}
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
    constructor({ rng = null, inputSize = 14, hiddenLayers = [8, 4], outputSize = 1, learningRate = .05, dropoutRate = .2, patience = 10, maxHistory = 50, calibrationAlpha = .3 } = {}) {
        const source = randomSource();
        this.rng = typeof rng === 'function' ? rng : () => source.next();
        this.inputSize = Math.max(1, Math.floor(Number.isFinite(inputSize) ? inputSize : 14));
        this.hiddenLayers = (Array.isArray(hiddenLayers) && hiddenLayers.length ? hiddenLayers : [8, 4]).map(size => Math.max(1, Math.floor(Number(size) || 1)));
        this.outputSize = Math.max(1, Math.floor(Number.isFinite(outputSize) ? outputSize : 1));
        this.learningRate = Number.isFinite(learningRate) && learningRate > 0 ? learningRate : .05;
        this.dropoutRate = Math.max(0, Math.min(.9, Number.isFinite(dropoutRate) ? dropoutRate : .2));
        this.patience = Math.max(1, Math.floor(Number.isFinite(patience) ? patience : 10));
        this.maxHistory = Math.max(1, Math.floor(Number.isFinite(maxHistory) ? maxHistory : 50));
        this.calibrationAlpha = Math.min(1, Math.max(1e-6, Number.isFinite(calibrationAlpha) && calibrationAlpha > 0 ? calibrationAlpha : .3));
        this.initialized = false;
        this.weights = [];
        this.biases = [];
        this.featureMeans = null;
        this.featureM2 = null;
        this.sampleCount = 0;
        this.bestLoss = Infinity;
        this.patienceCounter = 0;
        this.history = [];
        // RESP-NEURAL-FEAR-LOOP-001: how well inference predicts the world it was trained on —
        // an EWMA of the post-update no-dropout absolute error at each learn step. Additive to
        // the legacy model (no legacy value changes); consumers gate on it so only a model that
        // has actually earned trust may influence a world.
        this.calibrationError = null;
        this.calibrationSamples = 0;
    }
    recordCalibration(error) {
        if (!Number.isFinite(error)) return this.calibrationError;
        const value = Math.max(0, error);
        this.calibrationError = this.calibrationError == null ? value : this.calibrationError * (1 - this.calibrationAlpha) + value * this.calibrationAlpha;
        this.calibrationSamples += 1;
        return this.calibrationError;
    }
    // Whether this model's inference has earned the right to act on a world. `calibrated` needs
    // both enough observed samples and an error inside tolerance; an untrained model is never
    // calibrated (a null error fails closed).
    calibration({ minSamples = 5, tolerance = .15 } = {}) {
        const samples = this.calibrationSamples;
        const error = this.calibrationError;
        return { samples, error, minSamples, tolerance, calibrated: samples >= minSamples && error != null && error <= tolerance };
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
        // RESP-NEURAL-FEAR-LOOP-001: the calibration reading is the SETTLED model's error on this
        // sample (no dropout, post-update) — what inference would actually have predicted.
        this.recordCalibration(Math.abs(this.forward(this.normalize(features), { dropout: false }).prediction - goal));
        this.history.push({ at: now, loss: lossBefore, sampleCount: n });
        if (this.history.length > this.maxHistory) this.history.shift();
        if (lossBefore < this.bestLoss - 1e-9) { this.bestLoss = lossBefore; this.patienceCounter = 0; }
        else this.patienceCounter += 1;
        return { prediction, lossBefore, lossAfter, sampleCount: n, calibrationError: this.calibrationError, calibrationSamples: this.calibrationSamples, earlyStopped: this.patienceCounter >= this.patience, worldTime: now };
    }
    serialize() {
        return {
            initialized: this.initialized, inputSize: this.inputSize, hiddenLayers: [...this.hiddenLayers], outputSize: this.outputSize,
            learningRate: this.learningRate, dropoutRate: this.dropoutRate, sampleCount: this.sampleCount,
            weights: this.weights.map(layer => layer.map(row => [...row])), biases: this.biases.map(row => [...row]),
            featureMeans: this.featureMeans ? [...this.featureMeans] : null, featureM2: this.featureM2 ? [...this.featureM2] : null,
            bestLoss: Number.isFinite(this.bestLoss) ? this.bestLoss : null, patienceCounter: this.patienceCounter, history: this.history.map(entry => ({ ...entry })),
            calibrationError: this.calibrationError, calibrationSamples: this.calibrationSamples,
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
        this.calibrationError = Number.isFinite(state.calibrationError) ? state.calibrationError : null;
        this.calibrationSamples = Math.max(0, Math.floor(Number(state.calibrationSamples) || 0));
        this.initialized = true;
        return this;
    }
}// Re-opened `Simulation/agents/combat` row (RESP-SIMULATION-AGENTS-COMBAT-REOPEN-001): the legacy
// agent runtime lived in `agent.js` (the actor: lineage, engagement window, trauma memory) and
// `learningagent.js` (the world's survival book: escapes/deaths, strategy effectiveness, learned
// danger zones, family knowledge, predator adaptation). Both are extracted byte-exact into
// `legacy/` as evidence; the mechanisms that survive the V8 design live here.
//
// Documented deviations from the legacy modules:
//  * no wall clock — engagement windows, trauma decay and strike rounds run on the world ticks the
//    caller supplies (repository rule: production never reads the wall clock);
//  * every random draw comes from an injected RNG (legacy drew from the global random source, and
//    the repository's no-global-random rule is enforced by a source scan over the production
//    modules — so this file must not spell that call, not even in a comment);
//  * per-actor SPATIAL state (position, velocity, social/obstacle forces, cohesion, `simulation.js`'s
//    renderer) is deleted by design: the society world's geography is the abstract route/settlement
//    graph, so there is no per-actor movement to port, and the legacy steering maths that ride on it
//    (`getEscapeDirection`, the wall-clock zigzag timer, `applySocialForces`, `getThermalSignature`)
//    left with it;
//  * the legacy book was a module-level singleton (`AgentLearning`, no serialization); V8 keeps one
//    book per world inside `SocietyCore`, so it round-trips save/load;
//  * the legacy book pushed an unbounded timestamped context per escape; V8 keeps counts, the
//    survival-time EMA and the strategy records instead of an unbounded log;
//  * legacy ids were dense integers while V8 actor ids are caller-owned strings — a non-numeric id
//    is folded to an index by a deterministic character-code fold before the legacy modulo
//    arithmetic (numeric ids run the derivation verbatim).
// Legacy semantics ported verbatim (thresholds and constants included): the family-name derivation
// (`prefixes[id % 10]` + `suffixes[(id * 7) % 10]`), the `generation` rule (`parentId ? 0 : 1`), the
// trauma model (`min(1, fear * 0.8)` accumulation, `0.9995` decay, `< 0.001` floor, `> 0.3` trauma
// floor at `* 0.3`, `panicEventsSurvived`), the `danger > 2` gate on 50-unit cells, the six named
// strategies with their `.5` success-rate prior, their four context bonuses (+.3 at three allies,
// +.2 with a known hiding spot, +.15 at two allies, +.25 unpredictability against a predator with
// > 5 kills) and the `.1` exploration jitter, the "a choice counts as a use" rule, the `.05`
// survival-time EMA, the escape-rate adaptation windows (>.7 → ×1.5, <.3 → ×0.8, otherwise
// unchanged) and the 50/100 caps on hiding spots and family knowledge.
export const ACTOR_FAMILY_PREFIXES = Object.freeze(['Fear', 'Brave', 'Swift', 'Wise', 'Bold', 'Keen', 'Iron', 'Silent', 'Shadow', 'Bright']);
export const ACTOR_FAMILY_SUFFIXES = Object.freeze(['heart', 'mind', 'walker', 'seeker', 'guard', 'born', 'dweller', 'weaver', 'hunter', 'spirit']);
export const COMBAT_STRATEGIES = Object.freeze(['fleeStraight', 'fleeZigzag', 'hide', 'groupDefense', 'splitRun', 'freezeThenFlee']);
export const TRAUMA_DECAY_RATE = 0.9995;
export const TRAUMA_FLOOR_THRESHOLD = 0.3;
export const TRAUMA_FLOOR_SHARE = 0.3;
export const DANGER_ZONE_SIZE = 50;
export const DANGER_ZONE_THRESHOLD = 2;
export const STRATEGY_PRIOR = 0.5;
export const STRATEGY_JITTER = 0.1;
export const SURVIVAL_EMA_ALPHA = 0.05;
export const ESCAPE_RATE_HIGH = 0.7;
export const ESCAPE_RATE_LOW = 0.3;
export const ADAPTATION_FAST = 1.5;
export const ADAPTATION_SLOW = 0.8;
export const MAX_HIDING_SPOTS = 50;
export const MAX_FAMILY_KNOWLEDGE = 100;
// The felt-fear level at which the ported band contract enters PANIC (its 3.8 raw threshold on the
// §332 0..1 scale). agent.js gates trauma on `this.brain.state === 'PANIC'`; that state machine is
// the re-opened FearCore contract, so the gate is its PANIC entry, not a new threshold.
export const ACTOR_PANIC_FEAR = 1;
// agent.js `generateFamilyName()`: a deterministic function of the actor id — no draw, no state.
// Legacy ids were dense integers (`Agent.nextId++`); V8 actor ids are caller-owned strings, so a
// non-numeric id is folded to an index by a deterministic character-code fold before the SAME
// modulo arithmetic runs — numeric ids keep the legacy derivation verbatim, and distinct ids keep
// distinct families instead of every string collapsing to index 0.
export const actorFamilyIndex = id => {
    const numeric = Number(id);
    if (Number.isFinite(numeric)) return Math.abs(Math.trunc(numeric));
    let fold = 0;
    for (const character of String(id)) fold = (fold * 31 + character.codePointAt(0)) % 1000003;
    return fold;
};
export const actorFamilyName = id => {
    const key = actorFamilyIndex(id);
    return `${ACTOR_FAMILY_PREFIXES[key % ACTOR_FAMILY_PREFIXES.length]}${ACTOR_FAMILY_SUFFIXES[(key * 7) % ACTOR_FAMILY_SUFFIXES.length]}`;
};
// learningagent.js `recordDeath()`: the learned danger grid (`Math.floor(x / 50)_Math.floor(y / 50)`).
export const dangerZoneKey = (x, y) => `${Math.floor(finite(x, 0) / DANGER_ZONE_SIZE)}_${Math.floor(finite(y, 0) / DANGER_ZONE_SIZE)}`;
// One society-world actor (legacy `Agent`, minus everything spatial). Ids are owned by the caller.
export class CombatActor {
    constructor({ id, factionId = null, maxHp = 100, parentId = null, location = null } = {}) {
        this.id = id;
        this.factionId = factionId;
        this.parentId = parentId;
        this.generation = parentId ? 0 : 1; // agent.js verbatim ("Set during evolution")
        this.familyName = actorFamilyName(id);
        this.children = [];
        this.maxHp = Math.max(0, finite(maxHp, 100));
        this.hp = this.maxHp;
        this.alive = true;
        this.isEngaged = false;
        this.engagementStartTick = null;
        this.stressSurvivalTicks = 0;
        this.panicSourceId = null;
        this.traumaLevel = 0;
        this.panicEventsSurvived = 0;
        // The actor's own felt fear (legacy `brain.currentFear` / `emotions.fear`): the world owns
        // faction fear, the actor owns the fear it fights under, and the trauma floor below binds on
        // THIS value — which is why it is state, not a parameter.
        this.fear = 0;
        this.kills = 0;
        this.location = location ? { x: finite(location.x, 0), y: finite(location.y, 0) } : null;
        this.deployedTick = null;
    }
    // agent.js `getLineageInfo()` — the same fields, with the children list copied out.
    getLineageInfo() { return { id: this.id, familyName: this.familyName, generation: this.generation, parentId: this.parentId, childrenCount: this.children.length, children: [...this.children] }; }
    // agent.js `setEngaged()`: idempotent, and the stress ticker restarts only on a real engagement.
    engage({ sourceId = null, tick = 0 } = {}) {
        if (this.isEngaged || !this.alive) return false;
        this.isEngaged = true;
        this.engagementStartTick = finite(tick, 0);
        this.stressSurvivalTicks = 0;
        this.panicSourceId = sourceId;
        return true;
    }
    endEngagement() { this.isEngaged = false; return this; }
    // agent.js `update()`: `if (this.isEngaged && !this.dead) this.stressSurvivalTime++`.
    surviveEngagedTick() { if (this.isEngaged && this.alive) this.stressSurvivalTicks += 1; return this.stressSurvivalTicks; }
    feelFear(level) { this.fear = clamp(finite(level, 0)); return this.fear; }
    // agent.js `update()`: trauma accumulates only while PANICKING and only while it exceeds what is
    // already held — `traumaLevel = Math.min(1, currentFear * 0.8)`; the panic counter increments per
    // panicking update, exactly as the legacy ticker does. A non-panicking update leaves trauma to
    // the decay branch (the caller runs one or the other, as the legacy update does).
    absorbPanic(fear) {
        this.feelFear(fear);
        if (!this.alive || this.fear < ACTOR_PANIC_FEAR) return this.traumaLevel;
        this.panicEventsSurvived += 1;
        if (this.traumaLevel < this.fear) this.traumaLevel = Math.min(1, this.fear * 0.8);
        return this.traumaLevel;
    }
    // agent.js `update()`: `this.traumaLevel *= this.traumaDecayRate` (0.9995), floored to 0 below 0.001.
    decayTrauma(ticks = 1) {
        for (let i = 0; i < Math.max(0, Math.floor(finite(ticks, 1))); i += 1) {
            if (this.traumaLevel <= 0) break;
            this.traumaLevel *= TRAUMA_DECAY_RATE;
            if (this.traumaLevel < 0.001) this.traumaLevel = 0;
        }
        return this.traumaLevel;
    }
    // agent.js `update()`: traumatised actors startle more easily — `setFear(max(fear, traumaLevel * 0.3))`
    // above 0.3 trauma. Returns the fear floor the actor applies, or null when it applies none.
    traumaFloor() { return this.traumaLevel > TRAUMA_FLOOR_THRESHOLD ? Math.max(0, this.traumaLevel * TRAUMA_FLOOR_SHARE) : null; }
    // The floor BINDS exactly when felt fear has fallen below it — the legacy reason it exists (a
    // traumatised actor stays jumpy after the moment has passed). Returns the lifted felt fear.
    applyTraumaFloor() {
        const floor = this.traumaFloor();
        if (floor != null && floor > this.fear) this.fear = floor;
        return this.fear;
    }
    // V8-designed wound model (the legacy sources carry no damage formula): damage is the margin an
    // attack wins by, never negative, and death is a one-way transition that ends the engagement.
    applyDamage(amount) {
        const hpBefore = this.hp;
        if (!this.alive) return { hpBefore, hpAfter: this.hp, damage: 0, killed: false };
        this.hp = Math.max(0, hpBefore - Math.max(0, finite(amount, 0)));
        const killed = this.hp === 0;
        if (killed) { this.alive = false; this.isEngaged = false; }
        return { hpBefore, hpAfter: this.hp, damage: hpBefore - this.hp, killed };
    }
    serialize() {
        return { id: this.id, factionId: this.factionId, parentId: this.parentId, generation: this.generation, children: [...this.children], hp: this.hp, maxHp: this.maxHp, alive: this.alive, isEngaged: this.isEngaged, engagementStartTick: this.engagementStartTick, stressSurvivalTicks: this.stressSurvivalTicks, panicSourceId: this.panicSourceId, traumaLevel: this.traumaLevel, panicEventsSurvived: this.panicEventsSurvived, fear: this.fear, kills: this.kills, location: this.location ? { ...this.location } : null, deployedTick: this.deployedTick };
    }
    static load(state = {}) {
        const actor = new CombatActor({ id: state.id, factionId: state.factionId ?? null, maxHp: state.maxHp, parentId: state.parentId ?? null, location: state.location ?? null });
        actor.generation = Math.floor(finite(state.generation, actor.generation));
        actor.children = [...(state.children ?? [])];
        actor.hp = Math.max(0, finite(state.hp, actor.maxHp));
        actor.alive = state.alive ?? actor.hp > 0;
        actor.isEngaged = Boolean(state.isEngaged);
        actor.engagementStartTick = state.engagementStartTick ?? null;
        actor.stressSurvivalTicks = Math.max(0, Math.floor(finite(state.stressSurvivalTicks, 0)));
        actor.panicSourceId = state.panicSourceId ?? null;
        actor.traumaLevel = clamp(finite(state.traumaLevel, 0));
        actor.panicEventsSurvived = Math.max(0, Math.floor(finite(state.panicEventsSurvived, 0)));
        actor.fear = clamp(finite(state.fear, 0));
        actor.kills = Math.max(0, Math.floor(finite(state.kills, 0)));
        actor.deployedTick = state.deployedTick ?? null;
        return actor;
    }
}
// The society world's actor population and survival book (legacy `Agent` registry + `AgentLearning`).
export class CombatCore {
    constructor({ rng = null } = {}) {
        // `rng` is a DRAW function (`() => world.random()`), never the RNG source object.
        this.rng = rng;
        this.actors = new Map();
        this.strategyStats = Object.fromEntries(COMBAT_STRATEGIES.map(id => [id, { uses: 0, successes: 0 }]));
        this.totalEscapes = 0;
        this.totalDeaths = 0;
        this.averageSurvivalTime = 0;
        this.successfulStrategies = new Map();
        this.predatorPatterns = new Map();
        this.hidingSpots = [];
        this.dangerZones = new Map();
        this.tribalKnowledge = new Map();
    }
    draw() { return this.rng ? finite(this.rng(), 0.5) : 0.5; }
    // agent.js `Agent` construction: a deployed actor joins the population; a spawned actor (one
    // naming a parent) is appended to that parent's `children` — lineage is world state, not a name.
    deploy({ id, factionId = null, maxHp = 100, parentId = null, location = null, tick = 0 } = {}) {
        if (!id) throw new Error('CombatCore.deploy requires an actor id');
        if (this.actors.has(id)) throw new Error(`Duplicate combat actor "${id}"`);
        let parent = null;
        if (parentId != null) {
            parent = this.actors.get(parentId);
            if (!parent) throw new Error(`Unknown parent actor "${parentId}"`);
        }
        const actor = new CombatActor({ id, factionId, maxHp, parentId, location });
        actor.deployedTick = finite(tick, 0);
        this.actors.set(id, actor);
        if (parent) parent.children.push(id);
        return actor;
    }
    actor(id) { return this.actors.get(id) ?? null; }
    unitsOf(factionId) { return [...this.actors.values()].filter(actor => actor.factionId === factionId); }
    livingUnits() { return [...this.actors.values()].filter(actor => actor.alive); }
    // learningagent.js `recordEscape()`: the `.05` survival-time EMA, the strategy's success count
    // and (for a successful hide) the learned hiding spot, capped at 50.
    recordEscape({ strategy = 'fleeStraight', survivalTime = 0, location = null } = {}) {
        this.totalEscapes += 1;
        const time = Math.max(0, finite(survivalTime, 0));
        this.averageSurvivalTime = (1 - SURVIVAL_EMA_ALPHA) * this.averageSurvivalTime + SURVIVAL_EMA_ALPHA * time;
        if (!this.successfulStrategies.has(strategy)) this.successfulStrategies.set(strategy, { count: 0, totalSurvivalTime: 0 });
        const record = this.successfulStrategies.get(strategy);
        record.count += 1;
        record.totalSurvivalTime += time;
        if (this.strategyStats[strategy]) this.strategyStats[strategy].successes += 1;
        let hidingSpotsRecorded = false;
        if (strategy === 'hide' && location) {
            this.hidingSpots.push({ x: finite(location.x, 0), y: finite(location.y, 0), successCount: 1 });
            if (this.hidingSpots.length > MAX_HIDING_SPOTS) this.hidingSpots.shift();
            hidingSpotsRecorded = true;
        }
        return { strategy, count: record.count, averageSurvivalTime: this.averageSurvivalTime, hidingSpotsRecorded };
    }
    // learningagent.js `recordDeath()`: the death marks its cell dangerous and counts as a USE of
    // the strategy that failed (escapes count successes — the legacy symmetry).
    recordDeath({ strategy = 'fleeStraight', location = null, predatorId = null } = {}) {
        this.totalDeaths += 1;
        const dangerCount = location ? this.recordDanger(location) : null;
        if (this.strategyStats[strategy]) this.strategyStats[strategy].uses += 1;
        if (predatorId != null) {
            if (!this.predatorPatterns.has(predatorId)) this.predatorPatterns.set(predatorId, { killCount: 0, escapes: 0 });
            this.predatorPatterns.get(predatorId).killCount += 1;
        }
        return { strategy, dangerCount, dangerous: dangerCount != null && dangerCount > DANGER_ZONE_THRESHOLD };
    }
    recordDanger(location) {
        const key = dangerZoneKey(location.x, location.y);
        const count = (this.dangerZones.get(key) ?? 0) + 1;
        this.dangerZones.set(key, count);
        return count;
    }
    dangerCount(x, y) { return this.dangerZones.get(dangerZoneKey(x, y)) ?? 0; }
    // learningagent.js `isDangerousZone()` verbatim: `danger > 2`.
    isDangerousZone(x, y) { return this.dangerCount(x, y) > DANGER_ZONE_THRESHOLD; }
    // The same gate as a danger term for callers that consume danger numerically (migration): the
    // legacy gate is boolean, so a learned danger zone contributes the maximum learned danger.
    learnedDanger(location) { return location && this.isDangerousZone(location.x, location.y) ? 1 : 0; }
    predatorKills(predatorId) { return this.predatorPatterns.get(predatorId)?.killCount ?? 0; }
    // learningagent.js `getHidingSpot()`: `successCount / (dist + 1)` under a max distance.
    getHidingSpot({ x = 0, y = 0, maxDistance = 200 } = {}) {
        let bestSpot = null;
        let bestScore = -Infinity;
        for (const spot of this.hidingSpots) {
            const dx = spot.x - finite(x, 0);
            const dy = spot.y - finite(y, 0);
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > maxDistance) continue;
            const score = spot.successCount / (dist + 1);
            if (score > bestScore) { bestScore = score; bestSpot = spot; }
        }
        return bestSpot ? { ...bestSpot } : null;
    }
    // learningagent.js `getBestStrategy()`: success rate behind a `.5` prior for unused strategies,
    // the four context bonuses, a `.1` exploration jitter, and the legacy side effect that a CHOICE
    // counts as a use of the chosen strategy.
    bestStrategy({ allies = 0, predatorKills = 0, hidingSpotKnown = null } = {}) {
        const known = hidingSpotKnown ?? this.hidingSpots.length > 0;
        let best = 'fleeStraight';
        let bestScore = -Infinity;
        for (const strategy of COMBAT_STRATEGIES) {
            const stats = this.strategyStats[strategy];
            const successRate = stats.uses > 0 ? stats.successes / stats.uses : STRATEGY_PRIOR;
            let contextBonus = 0;
            if (strategy === 'groupDefense' && allies >= 3) contextBonus += 0.3;
            if (strategy === 'hide' && known) contextBonus += 0.2;
            if (strategy === 'splitRun' && allies >= 2) contextBonus += 0.15;
            if (predatorKills > 5 && (strategy === 'fleeZigzag' || strategy === 'freezeThenFlee')) contextBonus += 0.25;
            const score = successRate + contextBonus + this.draw() * STRATEGY_JITTER;
            if (score > bestScore) { bestScore = score; best = strategy; }
        }
        this.strategyStats[best].uses += 1; // legacy: "Record that we're trying this strategy"
        return best;
    }
    // learningagent.js `shareTribalKnowledge()`: knowledge lands in the FAMILY bucket, once per ally
    // (the legacy duplication is preserved), capped at 100 entries per family.
    shareKnowledge({ fromActorId = null, familyName = null, allies = [], knowledge = {} } = {}) {
        const family = familyName ?? (fromActorId == null ? null : this.actors.get(fromActorId)?.familyName) ?? null;
        if (!family) return 0;
        let shared = 0;
        for (const ally of allies) {
            if (ally == null || ally === fromActorId) continue;
            // The legacy bucket is created lazily, once per RECIPIENT: a share with nobody nearby
            // leaves no empty bucket behind.
            if (!this.tribalKnowledge.has(family)) this.tribalKnowledge.set(family, []);
            const bucket = this.tribalKnowledge.get(family);
            bucket.push({ ...knowledge, fromAgent: fromActorId });
            shared += 1;
            if (bucket.length > MAX_FAMILY_KNOWLEDGE) bucket.shift();
        }
        return shared;
    }
    knowledgeOf(familyName) { return (this.tribalKnowledge.get(familyName) ?? []).map(entry => ({ ...entry })); }
    // learningagent.js `adaptPredatorAI()`: `totalEscapes / max(1, totalEscapes + totalDeaths)` — an
    // untouched book reads 0, the legacy quirk that reports predators as winning before any outcome.
    escapeRate() { return this.totalEscapes / Math.max(1, this.totalEscapes + this.totalDeaths); }
    // > .7 → ×1.5, < .3 → ×0.8; inside the window the multiplier is unchanged (1).
    adaptationMultiplier() {
        const rate = this.escapeRate();
        if (rate > ESCAPE_RATE_HIGH) return ADAPTATION_FAST;
        if (rate < ESCAPE_RATE_LOW) return ADAPTATION_SLOW;
        return 1;
    }
    reset() {
        this.actors.clear();
        this.totalEscapes = 0;
        this.totalDeaths = 0;
        this.averageSurvivalTime = 0;
        this.successfulStrategies.clear();
        this.predatorPatterns.clear();
        this.hidingSpots = [];
        this.dangerZones.clear();
        this.tribalKnowledge.clear();
        for (const strategy of COMBAT_STRATEGIES) this.strategyStats[strategy] = { uses: 0, successes: 0 };
        return this;
    }
    serialize() {
        return {
            actors: [...this.actors.entries()].map(([id, actor]) => [id, actor.serialize()]),
            strategyStats: Object.fromEntries(COMBAT_STRATEGIES.map(id => [id, { ...this.strategyStats[id] }])),
            totalEscapes: this.totalEscapes, totalDeaths: this.totalDeaths, averageSurvivalTime: this.averageSurvivalTime,
            successfulStrategies: [...this.successfulStrategies.entries()].map(([id, record]) => [id, { ...record }]),
            predatorPatterns: [...this.predatorPatterns.entries()].map(([id, record]) => [id, { ...record }]),
            hidingSpots: this.hidingSpots.map(spot => ({ ...spot })),
            dangerZones: [...this.dangerZones.entries()].map(([key, count]) => [key, count]),
            tribalKnowledge: [...this.tribalKnowledge.entries()].map(([family, entries]) => [family, entries.map(entry => ({ ...entry }))]),
        };
    }
    loadState(state = {}) {
        this.actors = new Map((state.actors ?? []).map(([id, actor]) => [id, CombatActor.load(actor)]));
        for (const strategy of COMBAT_STRATEGIES) {
            const stats = state.strategyStats?.[strategy];
            this.strategyStats[strategy] = { uses: Math.max(0, Math.floor(finite(stats?.uses, 0))), successes: Math.max(0, Math.floor(finite(stats?.successes, 0))) };
        }
        this.totalEscapes = Math.max(0, Math.floor(finite(state.totalEscapes, 0)));
        this.totalDeaths = Math.max(0, Math.floor(finite(state.totalDeaths, 0)));
        this.averageSurvivalTime = Math.max(0, finite(state.averageSurvivalTime, 0));
        this.successfulStrategies = new Map((state.successfulStrategies ?? []).map(([id, record]) => [id, { count: Math.max(0, Math.floor(finite(record?.count, 0))), totalSurvivalTime: Math.max(0, finite(record?.totalSurvivalTime, 0)) }]));
        this.predatorPatterns = new Map((state.predatorPatterns ?? []).map(([id, record]) => [id, { killCount: Math.max(0, Math.floor(finite(record?.killCount, 0))), escapes: Math.max(0, Math.floor(finite(record?.escapes, 0))) }]));
        this.hidingSpots = (state.hidingSpots ?? []).map(spot => ({ x: finite(spot.x, 0), y: finite(spot.y, 0), successCount: Math.max(0, finite(spot.successCount, 0)) }));
        this.dangerZones = new Map((state.dangerZones ?? []).map(([key, count]) => [key, Math.max(0, Math.floor(finite(count, 0)))]));
        this.tribalKnowledge = new Map((state.tribalKnowledge ?? []).map(([family, entries]) => [family, entries.map(entry => ({ ...entry }))]));
        return this;
    }
}
