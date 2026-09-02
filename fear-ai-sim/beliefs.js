/**
 * Evidence and belief primitives.
 *
 * These records intentionally keep observed facts, confidence, source trust,
 * and public rumor separate. They are deterministic when callers provide a
 * tick and distortion value.
 */

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export const INFORMATION_LAYERS = Object.freeze({
    GROUND_TRUTH: 'GROUND_TRUTH',
    AGENT_BELIEF: 'AGENT_BELIEF',
    FACTION_INTELLIGENCE: 'FACTION_INTELLIGENCE',
    PUBLIC_RUMOR: 'PUBLIC_RUMOR'
});

export class Evidence {
    constructor({ subject, claim, value, sourceId = null, sourceTrust = 0.5, confidence = 0.5, tick = 0 } = {}) {
        this.subject = subject;
        this.claim = claim;
        this.value = value;
        this.sourceId = sourceId;
        this.sourceTrust = clamp(sourceTrust);
        this.confidence = clamp(confidence);
        this.tick = Number.isFinite(tick) ? tick : 0;
    }

    weight() {
        return this.sourceTrust * this.confidence;
    }

    toJSON() {
        return { subject: this.subject, claim: this.claim, value: this.value, sourceId: this.sourceId, sourceTrust: this.sourceTrust, confidence: this.confidence, tick: this.tick };
    }
}

export class BeliefStore {
    constructor({ decay = 0.01 } = {}) {
        this.decay = clamp(decay, 0, 1);
        this.beliefs = new Map();
        this.evidence = [];
    }

    observe(evidenceLike) {
        const evidence = evidenceLike instanceof Evidence ? evidenceLike : new Evidence(evidenceLike);
        // Deep copy evidence to prevent external mutation of stored evidence
        const evidenceCopy = new Evidence({ ...evidence });
        const key = `${evidenceCopy.subject}:${evidenceCopy.claim}`;
        const prior = this.beliefs.get(key);
        const weight = evidenceCopy.weight();
        const priorWeight = prior?.weight || 0;
        const totalWeight = priorWeight + weight;
        const value = !prior || totalWeight === 0
            ? evidenceCopy.value
            : this.combine(prior.value, evidenceCopy.value, weight / totalWeight);
        const confidence = clamp(totalWeight / (1 + totalWeight));
        const belief = { layer: INFORMATION_LAYERS.AGENT_BELIEF, subject: evidenceCopy.subject, claim: evidenceCopy.claim, value, confidence, weight: totalWeight, lastTick: evidenceCopy.tick };
        this.beliefs.set(key, { ...belief });
        this.evidence.push(evidenceCopy);
        return JSON.parse(JSON.stringify(belief));
    }

    combine(a, b, ratio) {
        if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * ratio;
        return ratio >= 0.5 ? b : a;
    }

    get(subject, claim) {
        const belief = this.beliefs.get(`${subject}:${claim}`);
        if (!belief) return null;
        // Deep copy to prevent aliasing: returned belief must not share refs with store
        return JSON.parse(JSON.stringify(belief));
    }

    decayAll() {
        for (const [key, belief] of this.beliefs) {
            belief.confidence = clamp(belief.confidence * (1 - this.decay));
            belief.weight *= (1 - this.decay);
            this.beliefs.set(key, belief);
        }
    }

    createRumor(subject, claim, sourceId, { tick = 0, distortion = 0, audience = 'PUBLIC' } = {}) {
        const belief = this.get(subject, claim);
        if (!belief) return null;
        const value = typeof belief.value === 'number'
            ? clamp(belief.value + distortion)
            : belief.value;
        return { layer: INFORMATION_LAYERS.PUBLIC_RUMOR, subject, claim, value, confidence: clamp(belief.confidence * (1 - Math.abs(distortion))), sourceId, audience, tick };
    }

    serialize() {
        return { decay: this.decay, beliefs: [...this.beliefs.values()], evidence: this.evidence.map(item => item.toJSON()) };
    }

    deserialize(data = {}) {
        this.decay = clamp(data.decay ?? this.decay, 0, 1);
        this.beliefs = new Map();
        for (const belief of Array.isArray(data.beliefs) ? data.beliefs : []) {
            if (!belief || belief.subject === undefined || belief.claim === undefined) continue;
            this.beliefs.set(`${belief.subject}:${belief.claim}`, { ...belief, layer: INFORMATION_LAYERS.AGENT_BELIEF });
        }
        this.evidence = (Array.isArray(data.evidence) ? data.evidence : []).map(item => new Evidence(item));
        return this;
    }
}
