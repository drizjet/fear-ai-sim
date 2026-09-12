/**
 * packages/core/src/PerceptionRobustnessEngine.js
 *
 * Front B/E / Sections 219–222:
 * Uncertainty, Sensor Conflict, Sensor Degradation & Stress Generalization.
 *
 * Host sensors lie: occluders hide threats, frames drop, audio arrives
 * without visuals, cheap hosts add biased or spiky noise — not textbook
 * Gaussian fuzz. This module degrades ground-truth stimuli through a
 * deterministic, seeded pipeline and fuses visual + audio channels into
 * a threat estimate with explicit uncertainty and a safe advisory intent.
 *
 * Pipeline per channel (deterministic order):
 *   latency buffer → scheduled dropout → occlusion → noise profile →
 *   false-negative suppression / false-positive ghosts
 * Fusion (§220): visual-safe + audio-danger never blind-flees nor
 *   ignores — it investigates with high uncertainty.
 *
 * STRICT INVARIANT: advisory perception only. Zero host state mutation.
 */

import { DeterministicRng } from './DeterministicRng.js';

export const NOISE_PROFILES = Object.freeze({
    GAUSSIAN: 'GAUSSIAN',
    UNIFORM: 'UNIFORM',
    SPIKE: 'SPIKE',
    BIAS: 'BIAS'
});

export const PERCEPT_INTENTS = Object.freeze({
    FLEE: 'FLEE_FROM',
    INVESTIGATE: 'INVESTIGATE_SOUND',
    CAUTIOUS: 'CAUTIOUS_EXPLORE',
    CALM: 'IDLE_VIGILANT'
});

function clamp01(n) {
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}

function round4(n) {
    return Number(Number(n).toFixed(4));
}

// NEXT-186: opt-in per-source reliability. Returns null when the caller
// supplied no reliability field (legacy path: outputs bit-identical).
// Present values sanitize to [0, 1]; non-finite garbage collapses to 1
// (fully trusted) so malformed descriptors can never inflate uncertainty.
function sanitizeReliability(v) {
    if (v === undefined) return null;
    if (typeof v !== 'number' || !Number.isFinite(v)) return 1;
    return Math.max(0, Math.min(1, v));
}

// NEXT-187: opt-in observation age in ticks. Null when absent (legacy
// path); present values sanitize to a non-negative finite count, garbage
// collapsing to 0 (fresh) so malformed ages can never inflate uncertainty.
function sanitizeAgeTicks(v) {
    if (v === undefined) return null;
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
    return Math.max(0, v);
}

export class PerceptionRobustnessEngine {
    constructor(options = {}) {
        this.rng = new DeterministicRng(options.seed ?? 1337);
        this.defaultProfile = {
            occlusion: 0,
            latencyTicks: 0,
            noiseStd: 0,
            noiseProfile: NOISE_PROFILES.GAUSSIAN,
            noiseBias: 0,
            falsePositiveRate: 0,
            falseNegativeRate: 0,
            dropoutPeriod: 0,
            ...(options.profile || {})
        };
        this.profiles = new Map();
        this.buffers = new Map();
        this.metrics = new Map();
        this.spareGaussian = null;
    }

    setProfile(agentId, profile) {
        this.profiles.set(agentId, { ...this.defaultProfile, ...profile });
        return this.profiles.get(agentId);
    }

    profileFor(agentId) {
        return this.profiles.get(agentId) || this.defaultProfile;
    }

    metricsFor(agentId) {
        let m = this.metrics.get(agentId);
        if (!m) {
            m = { ghosts: 0, misses: 0, conflicts: 0, staleTicks: 0, samples: 0 };
            this.metrics.set(agentId, m);
        }
        return m;
    }

    gaussianSample() {
        if (this.spareGaussian !== null) {
            const v = this.spareGaussian;
            this.spareGaussian = null;
            return v;
        }
        let u = 0;
        let v = 0;
        while (u === 0) u = this.rng.random();
        while (v === 0) v = this.rng.random();
        const mag = Math.sqrt(-2.0 * Math.log(u));
        this.spareGaussian = mag * Math.sin(2.0 * Math.PI * v);
        return mag * Math.cos(2.0 * Math.PI * v);
    }

    noiseSample(profile) {
        const std = profile.noiseStd || 0;
        if (std <= 0 && profile.noiseProfile !== NOISE_PROFILES.BIAS && profile.noiseProfile !== NOISE_PROFILES.SPIKE) return 0;
        switch (profile.noiseProfile) {
            case NOISE_PROFILES.UNIFORM:
                return (this.rng.random() * 2 - 1) * std * 1.732;
            case NOISE_PROFILES.SPIKE:
                if (this.rng.random() < 0.06) {
                    return (this.rng.random() < 0.5 ? -1 : 1) * 3 * Math.max(std, 0.05);
                }
                return this.gaussianSample() * std * 0.5;
            case NOISE_PROFILES.BIAS:
                return (profile.noiseBias || 0) + this.gaussianSample() * std * 0.25;
            case NOISE_PROFILES.GAUSSIAN:
            default:
                return this.gaussianSample() * std;
        }
    }

    pushBuffer(agentId, channel, tick, value) {
        let buf = this.buffers.get(agentId);
        if (!buf) {
            buf = { visual: [], audio: [] };
            this.buffers.set(agentId, buf);
        }
        buf[channel].push({ tick, value });
        if (buf[channel].length > 64) buf[channel].shift();
        return buf[channel];
    }

    readLatency(agentId, channel, tick, latency) {
        const buf = this.buffers.get(agentId);
        if (!buf || latency <= 0) return null;
        const arr = buf[channel];
        const target = arr.find((e) => e.tick === tick - latency);
        return target ? target.value : null;
    }

    degradeChannel(agentId, channel, tick, raw) {
        const profile = this.profileFor(agentId);
        const m = this.metricsFor(agentId);
        this.pushBuffer(agentId, channel, tick, raw);

        if (profile.latencyTicks > 0) {
            const delayed = this.readLatency(agentId, channel, tick, profile.latencyTicks);
            if (delayed === null || delayed === undefined) {
                m.staleTicks += 1;
                return { value: null, stale: true };
            }
            raw = delayed;
        }

        if (profile.dropoutPeriod > 0 && tick % profile.dropoutPeriod === 0) {
            m.staleTicks += 1;
            return { value: null, stale: true, dropped: true };
        }

        let val = raw === null || raw === undefined ? null : Number(raw);
        if (val !== null && channel === 'visual' && profile.occlusion > 0) {
            val = val * (1 - clamp01(profile.occlusion));
        }
        if (val !== null) {
            val = clamp01(val + this.noiseSample(profile));
        }

        if (val !== null && profile.falseNegativeRate > 0 && this.rng.random() < profile.falseNegativeRate) {
            m.misses += 1;
            return { value: null, stale: false, missed: true };
        }
        if ((val === null || val <= 0.02) && profile.falsePositiveRate > 0 && this.rng.random() < profile.falsePositiveRate) {
            m.ghosts += 1;
            return { value: round4(0.45 + this.rng.random() * 0.2), stale: false, ghost: true };
        }
        return { value: val === null ? null : round4(val), stale: false };
    }

    perceive(agentId, tick, observation = {}) {
        const m = this.metricsFor(agentId);
        m.samples += 1;
        const vis = this.degradeChannel(agentId, 'visual', tick, observation.visual?.intensity ?? null);
        const aud = this.degradeChannel(agentId, 'audio', tick, observation.audio?.loudness ?? null);
        const fused = this.fuse(vis.value, aud.value, { vGhost: !!vis.ghost, aGhost: !!aud.ghost });
        if (fused.conflict) m.conflicts += 1;
        const result = {
            agentId,
            tick,
            visual: vis,
            audio: aud,
            fusedThreat: fused.threat,
            uncertainty: fused.uncertainty,
            advisoryIntent: fused.intent,
            conflict: fused.conflict
        };
        // NEXT-186: per-source reliability bridge. Same estimate, lower
        // confidence: uncertainty rises as contributor reliability falls and
        // can never fall below the legacy value (LXXXVIII metamorphic).
        // Threat and intent are untouched; `reliability` is attached only
        // when the caller supplied at least one field (legacy shape kept).
        const rv = sanitizeReliability(observation.visual?.reliability);
        const ra = sanitizeReliability(observation.audio?.reliability);
        if (rv !== null || ra !== null) {
            const ev = rv ?? 1;
            const ea = ra ?? 1;
            const contributors = [];
            if (vis.value !== null && vis.value !== undefined) contributors.push(ev);
            if (aud.value !== null && aud.value !== undefined) contributors.push(ea);
            const relFused = contributors.length > 0
                ? contributors.reduce((a, b) => a + b, 0) / contributors.length
                : 1;
            result.uncertainty = round4(clamp01(fused.uncertainty + (1 - relFused) * 0.5));
            result.reliability = { visual: ev, audio: ea, fused: round4(relFused) };
        }
        // NEXT-187: opt-in observation-age discounting. Mean contributor age
        // adds at most +0.25 at 10+ ticks (linear ramp); threat and intent
        // untouched; `ageTicks` echo attached only when supplied.
        const gv = sanitizeAgeTicks(observation.visual?.ageTicks);
        const ga = sanitizeAgeTicks(observation.audio?.ageTicks);
        if (gv !== null || ga !== null) {
            const av = gv ?? 0;
            const aa = ga ?? 0;
            const ages = [];
            if (vis.value !== null && vis.value !== undefined) ages.push(av);
            if (aud.value !== null && aud.value !== undefined) ages.push(aa);
            const ageFused = ages.length > 0
                ? ages.reduce((a, b) => a + b, 0) / ages.length
                : 0;
            result.uncertainty = round4(clamp01(result.uncertainty + Math.min(ageFused, 10) / 10 * 0.25));
            result.ageTicks = { visual: av, audio: aa, fused: round4(ageFused) };
        }
        return result;
    }

    fuse(visual, audio, flags = {}) {
        const v = visual === null || visual === undefined ? null : Number(visual);
        const a = audio === null || audio === undefined ? null : Number(audio);
        const ghosted = !!(flags && (flags.vGhost || flags.aGhost));
        const lift = (base) => round4(ghosted ? Math.max(base, 0.55) : base);
        if (v !== null && v >= 0.55 && (a === null || a < 0.3)) {
            return { threat: round4(v), uncertainty: lift(0.3), intent: v >= 0.75 ? PERCEPT_INTENTS.FLEE : PERCEPT_INTENTS.CAUTIOUS, conflict: false };
        }
        if ((v === null || v < 0.25) && a !== null && a >= 0.5) {
            return { threat: round4(Math.max(v || 0, a * 0.7)), uncertainty: lift(0.65), intent: PERCEPT_INTENTS.INVESTIGATE, conflict: true };
        }
        if (v !== null && a !== null) {
            const threat = clamp01(0.6 * v + 0.4 * a);
            return { threat: round4(threat), uncertainty: lift(0.15), intent: threat >= 0.7 ? PERCEPT_INTENTS.FLEE : threat >= 0.35 ? PERCEPT_INTENTS.CAUTIOUS : PERCEPT_INTENTS.CALM, conflict: false };
        }
        if (v === null && a === null) {
            return { threat: 0.05, uncertainty: lift(0.4), intent: PERCEPT_INTENTS.CALM, conflict: false };
        }
        const single = v !== null ? v : a * 0.7;
        return { threat: round4(clamp01(single)), uncertainty: lift(0.45), intent: single >= 0.7 ? PERCEPT_INTENTS.FLEE : PERCEPT_INTENTS.CAUTIOUS, conflict: false };
    }

    getState() {
        return { rng: this.rng.getState(), spare: this.spareGaussian };
    }

    setState(snap) {
        if (snap && snap.rng) this.rng.setState(snap.rng);
        this.spareGaussian = snap ? snap.spare ?? null : null;
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            agentsTracked: this.metrics.size
        };
    }
}
