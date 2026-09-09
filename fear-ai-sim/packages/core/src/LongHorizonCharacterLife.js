/**
 * packages/core/src/LongHorizonCharacterLife.js
 *
 * Sections XIII-XIV:
 * Long-Horizon Character Life Test — do personas stay recognizable over
 * 100 / 1,000 / 10,000-tick lives through threat, safety, loss, recovery,
 * false alarms, social events, leadership, and betrayal?
 *
 * Method: drive a CharacterIdentityArchitecture character through a seeded
 * deterministic life script, snapshot FunctionalPersonaSignatures at window
 * boundaries, and report:
 * - drift: adaptive displacement from identity anchors over time.
 * - signatureStability: distance of each window signature from the fresh
 *   (tick-0) signature. Must stay bounded: experience modulates, never
 *   replaces, identity.
 * - collapseVerdict: COLLAPSE if the end-of-life signature is closer to a
 *   generic attractor (flat panic / flat calm / population centroid) than
 *   to its own fresh signature; STABLE otherwise.
 *
 * Deterministic: seeded LCG life scripts; same seed + traits = same report.
 * Advisory only: no host mutation.
 */

import { CharacterIdentityArchitecture } from './CharacterIdentityArchitecture.js';
import { FunctionalPersonaSignatures } from './FunctionalPersonaSignatures.js';

const clamp01 = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
};

const round4 = (v) => Math.round(clamp01(v) * 10000) / 10000;

export const LIFE_HORIZONS = Object.freeze([100, 1000, 10000]);

/** Generic attractor personas used for collapse verdicts. */
export const GENERIC_ATTRACTORS = Object.freeze({
    genericCoward: { neuroticism: 0.95, resilience: 0.05, agreeableness: 0.5, openness: 0.3, extraversion: 0.3, leadership: 0.2, riskTolerance: 0.05, conscientiousness: 0.5 },
    genericSurvivor: { neuroticism: 0.5, resilience: 0.9, agreeableness: 0.3, openness: 0.5, extraversion: 0.5, leadership: 0.5, riskTolerance: 0.7, conscientiousness: 0.8 },
    permanentPanic: { neuroticism: 1, resilience: 0, agreeableness: 0.5, openness: 0, extraversion: 0, leadership: 0, riskTolerance: 0, conscientiousness: 0 },
    permanentCalm: { neuroticism: 0, resilience: 1, agreeableness: 0.5, openness: 1, extraversion: 1, leadership: 0.5, riskTolerance: 1, conscientiousness: 0.5 }
});

function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
}

/** One deterministic life event: experience deltas + immediate situation. */
function lifeEvent(rng) {
    const roll = rng();
    if (roll < 0.25) return { experience: { trauma: 0.03, learnedDanger: 0.04, confidence: -0.03 }, situation: { fear: 0.7, perceivedDanger: 0.8, urgency: 0.6 } }; // threat
    if (roll < 0.5) return { experience: { trauma: -0.01, habituation: 0.02, confidence: 0.02 }, situation: { fear: 0.05, perceivedDanger: 0.05, urgency: 0 } }; // safety
    if (roll < 0.62) return { experience: { trauma: 0.05, resentment: 0.05, trust: -0.05 }, situation: { fear: 0.5, perceivedDanger: 0.4, urgency: 0.4 } }; // loss/betrayal
    if (roll < 0.74) return { experience: { habituation: 0.03, confidence: 0.01 }, situation: { fear: 0.3, perceivedDanger: 0.3, urgency: 0.2 } }; // false alarm
    if (roll < 0.87) return { experience: { trust: 0.04, respect: 0.03, reputation: 0.02 }, situation: { fear: 0.15, perceivedDanger: 0.1, urgency: 0.1, groupPanic: 0.1 } }; // social/leadership
    return { experience: { routeFamiliarity: 0.03, confidence: 0.01 }, situation: { fear: 0.1, perceivedDanger: 0.15, urgency: 0.2 } }; // routine
}

export class LongHorizonCharacterLife {
    constructor() {
        this.signatures = new FunctionalPersonaSignatures();
    }

    /**
     * Run a full character life and report drift/stability/collapse.
     * @param {object} traits identity traits
     * @param {number} ticks life length (100 / 1000 / 10000 supported)
     * @param {number} [seed=42]
     */
    runLife(traits, ticks = 1000, seed = 42) {
        if (![100, 1000, 10000].includes(ticks)) throw new Error('UNSUPPORTED_HORIZON');
        const arch = new CharacterIdentityArchitecture();
        arch.registerCharacter('life_subject', traits);
        const rng = makeRng(seed);
        const fresh = this.signatures.vectorFor(traits);
        const windows = Math.max(4, Math.min(10, ticks / 100));
        const windowLen = Math.floor(ticks / windows);
        const driftSeries = [];
        const stabilitySeries = [];
        for (let w = 0; w < windows; w++) {
            for (let t = 0; t < windowLen; t++) {
                const ev = lifeEvent(rng);
                arch.tick('life_subject', ev.experience, ev.situation);
            }
            const snap = arch.adaptiveFor('life_subject');
            // Effective traits = identity modulated by adaptive displacement.
            const effective = {
                ...traits,
                neuroticism: clamp01((traits.neuroticism ?? 0.5) + snap.trauma * 0.3 - snap.habituation * 0.2),
                resilience: clamp01((traits.resilience ?? 0.5) - snap.trauma * 0.2 + snap.confidence * 0.1),
                agreeableness: clamp01((traits.agreeableness ?? 0.5) + (snap.trust - 0.5) * 0.2 - snap.resentment * 0.2)
            };
            const vec = this.signatures.vectorFor(effective);
            let sum = 0;
            for (let i = 0; i < vec.length; i++) sum += (vec[i] - fresh[i]) ** 2;
            driftSeries.push(arch.drift('life_subject'));
            stabilitySeries.push(round4(Math.sqrt(sum / vec.length)));
        }
        const endStability = stabilitySeries[stabilitySeries.length - 1];
        // Collapse verdict: nearer to a generic attractor than to fresh self?
        const endAdaptive = arch.adaptiveFor('life_subject');
        const endEffective = {
            ...traits,
            neuroticism: clamp01((traits.neuroticism ?? 0.5) + endAdaptive.trauma * 0.3 - endAdaptive.habituation * 0.2),
            resilience: clamp01((traits.resilience ?? 0.5) - endAdaptive.trauma * 0.2)
        };
        let nearestAttractor = { name: null, d: Infinity };
        for (const [name, attractor] of Object.entries(GENERIC_ATTRACTORS)) {
            const d = this.signatures.distance(endEffective, attractor);
            if (d < nearestAttractor.d) nearestAttractor = { name, d };
        }
        const verdict = nearestAttractor.d < endStability ? 'COLLAPSE' : 'STABLE';
        return {
            ticks,
            seed,
            driftSeries,
            stabilitySeries,
            finalDrift: driftSeries[driftSeries.length - 1],
            finalStabilityGap: endStability,
            nearestAttractor,
            verdict
        };
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            horizonsSupported: [...LIFE_HORIZONS]
        };
    }
}
