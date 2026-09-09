/**
 * packages/core/src/SuccessionEngine.js
 *
 * Section XXXVII (+ XXXVIII splinter-risk signal):
 * Leadership succession — the leader disappears (host-reported death,
 * capture, disgrace, or departure) and the faction selects a successor
 * from host-provided candidates. Outputs cohesion, morale, and policy
 * deltas plus a splinter-risk advisory; the host creates or destroys
 * any entities.
 *
 * Selection is deterministic and inspectable: each candidate scores on
 * legitimacy (bloodline/appointment/mandate), competence, popularity,
 * and continuity with the fallen leader's policy. Governance archetype
 * biases the weights (autocracies prize legitimacy, juntas competence,
 * consensuses popularity) without inventing new government code — the
 * archetype arrives as a plain string.
 *
 * Advisory only. No entity, inventory, or transform mutation.
 */

const clamp01 = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
};

const round4 = (v) => Math.round(clamp01(v) * 10000) / 10000;

/** Signed 4-decimal rounding for deltas (round4 clamps to [0,1]). */
const round4s = (v) => (typeof v !== 'number' || !Number.isFinite(v) ? 0 : Math.round(v * 10000) / 10000);

export const SUCCESSION_CAUSES = Object.freeze([
    'DEATH_IN_BATTLE', 'ASSASSINATION', 'NATURAL_DEATH', 'CAPTURE', 'DISGRACE', 'DEPARTURE'
]);

/** Per-archetype scoring weights: [legitimacy, competence, popularity, continuity]. */
export const SUCCESSION_WEIGHTS = Object.freeze({
    AUTOCRATIC_DESPOT: [0.5, 0.15, 0.1, 0.25],
    MERCHANT_OLIGARCHY: [0.2, 0.4, 0.2, 0.2],
    MILITARY_JUNTA: [0.2, 0.5, 0.1, 0.2],
    TRIBAL_CONSENSUS: [0.15, 0.2, 0.5, 0.15],
    ECCLESIASTICAL_DEVOUT: [0.45, 0.15, 0.15, 0.25],
    DEFAULT: [0.3, 0.3, 0.25, 0.15]
});

export class SuccessionEngine {
    constructor() {
        this.successions = 0;
    }

    /**
     * Resolve a succession.
     * @param {object} params { factionId, cause, archetype,
     *   candidates: [{ id, legitimacy, competence, popularity, continuity }],
     *   cohesion, morale }
     * @returns succession report
     */
    resolve(params = {}) {
        const factionId = String(params.factionId || 'faction_0');
        if (!SUCCESSION_CAUSES.includes(params.cause)) throw new Error(`UNKNOWN_SUCCESSION_CAUSE: ${params.cause}`);
        const candidates = Array.isArray(params.candidates) ? params.candidates : [];
        if (candidates.length === 0) {
            // No heir: interregnum. Cohesion craters, splinter risk spikes.
            this.successions += 1;
            return {
                factionId,
                successorId: null,
                runnerUpId: null,
                margin: 0,
                cohesionDelta: -0.4,
                moraleDelta: -0.3,
                policyShift: 0,
                splinterRisk: 0.85,
                interregnum: true
            };
        }
        const weights = SUCCESSION_WEIGHTS[params.archetype] || SUCCESSION_WEIGHTS.DEFAULT;
        const scored = candidates.map((c) => {
            if (!c || !c.id) throw new Error('CANDIDATE_MISSING_ID');
            const score = round4(
                clamp01(c.legitimacy ?? 0) * weights[0] +
                clamp01(c.competence ?? 0) * weights[1] +
                clamp01(c.popularity ?? 0) * weights[2] +
                clamp01(c.continuity ?? 0) * weights[3]
            );
            return { id: String(c.id), score };
        }).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
        const winner = scored[0];
        const runner = scored[1] || { id: null, score: 0 };
        const margin = round4(winner.score - runner.score);
        // Violent causes wound cohesion; contested outcomes wound it more.
        const violent = (params.cause === 'ASSASSINATION' || params.cause === 'DEATH_IN_BATTLE') ? 0.15 : 0.05;
        const contestPenalty = margin < 0.1 ? 0.2 : margin < 0.25 ? 0.08 : 0;
        const cohesionDelta = round4s(-(violent + contestPenalty) + winner.score * 0.1);
        const moraleDelta = round4s(-violent * 0.8 + (winner.score - 0.5) * 0.2);
        // Policy shift: low-continuity winners break with the past.
        const winnerRaw = candidates.find((c) => String(c.id) === winner.id);
        const policyShift = round4(1 - clamp01(winnerRaw.continuity ?? 0.5));
        const splinterRisk = round4(clamp01(0.15 + contestPenalty * 1.5 + policyShift * 0.25 - winner.score * 0.2));
        this.successions += 1;
        return {
            factionId,
            successorId: winner.id,
            runnerUpId: runner.id,
            margin,
            cohesionDelta,
            moraleDelta,
            policyShift,
            splinterRisk,
            interregnum: false
        };
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            successions: this.successions
        };
    }
}
