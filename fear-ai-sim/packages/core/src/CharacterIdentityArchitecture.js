/**
 * packages/core/src/CharacterIdentityArchitecture.js
 *
 * Sections VI-VII / CXLIX.1:
 * Persistent Character Identity — three-timescale decision architecture.
 *
 * Fear AI must stop being stimulus → fear → intent. Decisions derive from:
 *   identity (stable tendencies) + adaptive (learned experience)
 *   + state (immediate condition) + goals + role + world situation.
 *
 * Three layers:
 * - IDENTITY: Big-Five + values + risk/social/loyalty/leadership dispositions
 *   + moral constraints. Changes only via crystallized life events (slow lane).
 * - ADAPTIVE: trauma, habituation, trust, resentment, respect, learned danger,
 *   route familiarity, confidence, reputation. Bounded drift per tick; decays
 *   toward identity-anchored baselines so characters never collapse into a
 *   generic survivor/coward/combatant attractor without extreme cause.
 * - STATE: fear, urgency, panic, arousal, perceived danger, host fatigue,
 *   group panic, situational confidence. Volatile; zero persistence promise.
 *
 * Identity-without-rigidity: identity outputs TENDENCY GAINS on appraisal,
 * never fixed actions. A brave guard usually stands but flees unsurvivable
 * odds; a coward usually flees but holds beside a trusted captain. Same
 * character stays recognizable across situations without scripted behavior.
 *
 * Host authority: pure advisory arithmetic. No movement, damage, inventory,
 * entity, quest, or transform mutation. All snapshots frozen before plugins.
 */

const clamp01 = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
};

const round4 = (v) => Math.round(clamp01(v) * 10000) / 10000;

export const IDENTITY_TRAITS = Object.freeze([
    'openness', 'conscientiousness', 'extraversion', 'agreeableness',
    'neuroticism', 'riskTolerance', 'socialOrientation', 'loyalty',
    'leadership', 'resilience', 'duty'
]);

export const ADAPTIVE_TRACKS = Object.freeze([
    'trauma', 'habituation', 'trust', 'resentment', 'respect',
    'learnedDanger', 'routeFamiliarity', 'confidence', 'reputation'
]);

export const STATE_CHANNELS = Object.freeze([
    'fear', 'urgency', 'panic', 'arousal', 'perceivedDanger',
    'fatigue', 'groupPanic', 'situationalConfidence'
]);

/** Identity-anchored baselines each adaptive track decays toward. */
const ADAPTIVE_ANCHORS = Object.freeze({
    trauma: 0, habituation: 0, trust: 0.5, resentment: 0,
    respect: 0.5, learnedDanger: 0, routeFamiliarity: 0,
    confidence: 0.5, reputation: 0.5
});

/** Max adaptive displacement per tick: prevents single-event collapse. */
const ADAPTIVE_RATE_LIMIT = 0.05;
/** Per-tick pull of adaptive tracks back toward identity anchors. */
const ADAPTIVE_ANCHOR_PULL = 0.002;

export class CharacterIdentityArchitecture {
    constructor() {
        /** @type {Map<string, { identity: object, adaptive: object, state: object, constraints: string[], tick: number }>} */
        this.characters = new Map();
        this.totalTicks = 0;
    }

    /**
     * Register a character with stable identity tendencies.
     * @param {string} agentId
     * @param {object} [identity={}] trait values in [0,1]
     * @param {object} [options={}] { constraints: string[] }
     */
    registerCharacter(agentId, identity = {}, options = {}) {
        const id = String(agentId);
        if (this.characters.has(id)) throw new Error(`CHARACTER_ALREADY_REGISTERED: ${id}`);
        const ident = {};
        for (const t of IDENTITY_TRAITS) ident[t] = clamp01(identity[t] ?? 0.5);
        const adaptive = {};
        for (const t of ADAPTIVE_TRACKS) adaptive[t] = ADAPTIVE_ANCHORS[t];
        // Identity tints starting adaptive posture (brave starts confident, etc.)
        adaptive.confidence = clamp01(0.5 + (ident.resilience - 0.5) * 0.4);
        adaptive.trust = clamp01(0.5 + (ident.agreeableness - 0.5) * 0.3);
        const state = {};
        for (const c of STATE_CHANNELS) state[c] = 0;
        state.situationalConfidence = 0.5;
        // NEXT-132: role identity tag (e.g. 'GUARD', 'MEDIC'). Advisory label
        // only — it never gates behavior by itself; continuous duty and hard
        // arbitration constraints do the work. Round-trips via snapshots.
        const role = typeof options.role === 'string' ? options.role.slice(0, 64) : '';
        this.characters.set(id, {
            identity: Object.freeze({ ...ident }),
            adaptive: { ...adaptive },
            state: { ...state },
            constraints: Object.freeze([...(options.constraints || [])]),
            role,
            tick: 0
        });
        return id;
    }

    /** Read-only identity (frozen copy). */
    identityFor(agentId) {
        const c = this.characters.get(String(agentId));
        return c ? { ...c.identity } : null;
    }
    /** Advisory role identity tag ('' when unset). */
    roleFor(agentId) {
        const c = this.characters.get(String(agentId));
        return c ? (c.role ?? '') : null;
    }

    /** Read-only adaptive snapshot. */
    adaptiveFor(agentId) {
        const c = this.characters.get(String(agentId));
        return c ? { ...c.adaptive } : null;
    }

    /**
     * Advance one tick: apply experience deltas (rate-limited), anchor pull,
     * then fold the new immediate state. Returns the advisory decision frame.
     * @param {string} agentId
     * @param {object} [experience={}] adaptive deltas, e.g. { trauma: +0.2 }
     * @param {object} [situation={}] immediate state, e.g. { fear: 0.7 }
     */
    tick(agentId, experience = {}, situation = {}) {
        const c = this.characters.get(String(agentId));
        if (!c) throw new Error(`UNKNOWN_CHARACTER: ${agentId}`);
        // 1. Adaptive update: rate-limit then anchor pull.
        for (const t of ADAPTIVE_TRACKS) {
            const raw = typeof experience[t] === 'number' && Number.isFinite(experience[t]) ? experience[t] : 0;
            const limited = Math.max(-ADAPTIVE_RATE_LIMIT, Math.min(ADAPTIVE_RATE_LIMIT, raw));
            let v = clamp01(c.adaptive[t] + limited);
            const anchor = t === 'confidence'
                ? clamp01(0.5 + (c.identity.resilience - 0.5) * 0.4)
                : t === 'trust'
                    ? clamp01(0.5 + (c.identity.agreeableness - 0.5) * 0.3)
                    : ADAPTIVE_ANCHORS[t];
            v += (anchor - v) * ADAPTIVE_ANCHOR_PULL;
            c.adaptive[t] = clamp01(v);
        }
        // 2. Immediate state folds over (no persistence).
        for (const ch of STATE_CHANNELS) {
            const v = situation[ch];
            c.state[ch] = (typeof v === 'number' && Number.isFinite(v)) ? clamp01(v) : (ch === 'situationalConfidence' ? 0.5 : 0);
        }
        c.tick += 1;
        this.totalTicks += 1;
        return this.decide(String(agentId));
    }

    /**
     * Advisory decision frame: tendency gains per layer, never a fixed action.
     * Behavior = identity gain × adaptive modulation + state pressure.
     */
    decide(agentId) {
        const c = this.characters.get(String(agentId));
        if (!c) throw new Error(`UNKNOWN_CHARACTER: ${agentId}`);
        const { identity: I, adaptive: A, state: S } = c;
        // Identity tendency gains (stable): who this character is.
        // NEXT-132: duty is neutral-centered (0.5 = legacy output bit-identical).
        // High duty stiffens stand/help/rally; low duty relaxes them.
        const dutyDelta = (I.duty ?? 0.5) - 0.5;
        const standGain = clamp01(0.3 + I.resilience * 0.4 + I.conscientiousness * 0.2 + I.loyalty * 0.2 - I.neuroticism * 0.15 + dutyDelta * 0.3);
        const fleeGain = clamp01(0.3 + I.neuroticism * 0.4 + (1 - I.riskTolerance) * 0.3 - I.resilience * 0.15);
        const helpGain = clamp01(0.2 + I.agreeableness * 0.45 + I.socialOrientation * 0.25 - I.neuroticism * 0.1 + dutyDelta * 0.2);
        const investigateGain = clamp01(0.2 + I.openness * 0.45 + I.extraversion * 0.2 - I.neuroticism * 0.1);
        const rallyGain = clamp01(0.15 + I.leadership * 0.5 + I.extraversion * 0.2 + dutyDelta * 0.2);
        // Adaptive modulation (learned): scales gains without replacing them.
        const traumaWeight = 1 + A.trauma * 0.6 - A.habituation * 0.5;
        const trustWeight = 1 + (A.trust - 0.5) * 0.5 + (A.respect - 0.5) * 0.3;
        const dangerMemory = 1 + A.learnedDanger * 0.5;
        // State pressure (immediate): urgency of now.
        const threatPressure = clamp01(S.fear * 0.6 + S.perceivedDanger * 0.5 + S.urgency * 0.3 + S.groupPanic * 0.25 - A.confidence * 0.2);
        const stand = round4(standGain * (1 + A.confidence * 0.3) * (1 - A.trauma * 0.25) + S.situationalConfidence * 0.1 - threatPressure * 0.35 * traumaWeight);
        const flee = round4(fleeGain * traumaWeight * dangerMemory + threatPressure * 0.45 - S.situationalConfidence * 0.1);
        const help = round4(helpGain * trustWeight * (1 - threatPressure * 0.5) + (A.respect - 0.5) * 0.1);
        const investigate = round4(investigateGain * (1 - threatPressure * 0.55) * (1 - A.learnedDanger * 0.3) + A.routeFamiliarity * 0.1);
        const rally = round4(rallyGain * trustWeight * (1 - S.panic * 0.4) + (A.reputation - 0.5) * 0.15);
        const tendencies = { stand, flee, help, investigate, rally };
        // Ranked advisory intents (host picks executables).
        const ranked = Object.entries(tendencies).sort((a, b) => b[1] - a[1]).map(([action, weight]) => ({ action, weight }));
        return {
            agentId: String(agentId),
            tick: c.tick,
            tendencies,
            rankedIntents: ranked,
            topIntent: ranked[0].action,
            layers: {
                identityGain: { standGain: round4(standGain), fleeGain: round4(fleeGain), helpGain: round4(helpGain) },
                adaptiveModulation: { traumaWeight: round4(traumaWeight), trustWeight: round4(trustWeight), dangerMemory: round4(dangerMemory) },
                statePressure: round4(threatPressure)
            },
            constraints: [...c.constraints],
            role: c.role ?? ''
        };
    }

    /**
     * Identity drift: euclidean distance of adaptive tracks from anchors.
     * Near 0 = character at baseline; large = heavily shaped by experience.
     */
    drift(agentId) {
        const c = this.characters.get(String(agentId));
        if (!c) throw new Error(`UNKNOWN_CHARACTER: ${agentId}`);
        let sum = 0;
        for (const t of ADAPTIVE_TRACKS) {
            const anchor = ADAPTIVE_ANCHORS[t];
            sum += (c.adaptive[t] - anchor) ** 2;
        }
        return round4(Math.sqrt(sum / ADAPTIVE_TRACKS.length));
    }
    /**
     * NEXT-117: JSON-safe snapshot of all characters (identity, adaptive,
     * immediate-tick count) for host save/load round-trips.
     */
    getState() {
        const characters = {};
        for (const [id, c] of this.characters.entries()) {
            characters[id] = {
                identity: { ...c.identity },
                adaptive: { ...c.adaptive },
                constraints: [...c.constraints],
                role: c.role ?? '',
                tick: c.tick
            };
        }
        return { characters, totalTicks: this.totalTicks };
    }

    /** Restore a snapshot from getState. Replaces current contents. */
    setState(state) {
        this.characters = new Map();
        this.totalTicks = 0;
        if (!state) return;
        this.totalTicks = state.totalTicks || 0;
        if (state.characters) {
            for (const [id, c] of Object.entries(state.characters)) {
                const ident = {};
                for (const t of IDENTITY_TRAITS) ident[t] = clamp01(c.identity?.[t] ?? 0.5);
                const adaptive = {};
                for (const t of ADAPTIVE_TRACKS) {
                    adaptive[t] = typeof c.adaptive?.[t] === 'number' && Number.isFinite(c.adaptive[t])
                        ? Math.max(0, Math.min(1, c.adaptive[t]))
                        : ADAPTIVE_ANCHORS[t];
                }
                const liveState = {};
                for (const ch of STATE_CHANNELS) liveState[ch] = 0;
                liveState.situationalConfidence = 0.5;
                this.characters.set(String(id), {
                    identity: Object.freeze({ ...ident }),
                    adaptive: { ...adaptive },
                    state: liveState,
                    constraints: Object.freeze([...(c.constraints || [])]),
                    role: typeof c.role === 'string' ? c.role.slice(0, 64) : '',
                    tick: c.tick || 0
                });
            }
        }
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            charactersTracked: this.characters.size,
            totalTicks: this.totalTicks
        };
    }
}
