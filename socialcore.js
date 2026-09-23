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
export class ReputationBook { constructor() { this.values = new Map(); } update(subject, value, weight = 1) { const old = this.values.get(subject) || { value: .5, weight: 0 }; const w = Math.max(0, Number.isFinite(weight) ? weight : 1); old.value = (old.value * old.weight + clamp(value) * w) / Math.max(1, old.weight + w); old.weight += w; this.values.set(subject, old); return old.value; } get(subject, fallback = .5) { return this.values.get(subject)?.value ?? fallback; } }