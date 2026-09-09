/**
 * packages/core/src/SocialBehaviorEffects.js
 *
 * Section XXV:
 * Relationships alter behavior — pure advisory mapping from a directed
 * relationship vector (as stored by RelationshipTensorSystem) plus
 * situational pressure to willingness scores for eight social decisions:
 * helping, warning, contagion susceptibility, leadership following,
 * retreating together, trade, recruitment, and desertion.
 *
 * Design rules:
 * - Asymmetry preserved: willingness is computed per direction; A→B never
 *   implies B→A. Callers pass the directed vector they mean.
 * - Fear and loyalty can coexist: high fear of a leader plus high respect
 *   yields obedience-with-dread, not indifference.
 * - Grievance vetoes prosocial acts gradually, never as a hidden cliff:
 *   all outputs are continuous in [0,1].
 * - Situational pressure (0 = calm, 1 = lethal) suppresses costly prosocial
 *   acts but amplifies follow-the-trusted-leader and retreat-together.
 *
 * Pure functions. No state, no host mutation, deterministic.
 */

const clamp01 = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
};

const round4 = (v) => Math.round(clamp01(v) * 10000) / 10000;

/** Normalize a possibly [-1,1] dimension into [0,1] affinity. */
const affinity = (v) => clamp01((clamp01(typeof v === 'number' && Number.isFinite(v) ? v : 0) + 1) / 2);

export const SOCIAL_DECISIONS = Object.freeze([
    'help', 'warn', 'followLeader', 'retreatTogether',
    'trade', 'recruit', 'shareInfo', 'desert'
]);

/**
 * Score eight social decisions from a directed relationship vector.
 * @param {object} rel { trust[-1,1], fear[0,1], respect[0,1], affection[-1,1],
 *   grievance[0,1], familiarity[0,1], obligation[0,1], dominance[-1,1] }
 * @param {object} [context={}] { pressure[0,1], isLeader: boolean, leaderCompetence[0,1] }
 * @returns {object} decision -> willingness in [0,1]
 */
export function scoreSocialDecisions(rel = {}, context = {}) {
    const trust = clamp01(((typeof rel.trust === 'number' && Number.isFinite(rel.trust)) ? rel.trust : 0) + 1) / 2;
    const fear = clamp01(rel.fear ?? 0);
    const respect = clamp01(rel.respect ?? 0.5);
    const affect = affinity(rel.affection ?? 0);
    const grievance = clamp01(rel.grievance ?? 0);
    const familiarity = clamp01(rel.familiarity ?? 0);
    const obligation = clamp01(rel.obligation ?? 0);
    const dominance = clamp01(((typeof rel.dominance === 'number' && Number.isFinite(rel.dominance)) ? rel.dominance : 0) + 1) / 2;
    const pressure = clamp01(context.pressure ?? 0);
    const isLeader = context.isLeader === true;
    const competence = clamp01(context.leaderCompetence ?? respect);

    const prosocialBase = (trust * 0.45 + affect * 0.3 + obligation * 0.15 + familiarity * 0.1);
    const grievanceBrake = 1 - grievance * 0.8;
    const pressureTax = 1 - pressure * 0.55;

    const help = round4(prosocialBase * grievanceBrake * pressureTax + obligation * 0.15 * (1 - pressure * 0.3));
    const warn = round4(clamp01(prosocialBase * 1.1 + familiarity * 0.1) * grievanceBrake * (1 - pressure * 0.25));
    // Following rises with respect/competence AND with pressure when the
    // target is trusted; fear of the leader adds obedience-with-dread.
    const followLeader = round4(isLeader
        ? clamp01((respect * 0.4 + competence * 0.3 + trust * 0.3) * (1 + pressure * 0.25) * grievanceBrake + fear * 0.15 * (1 - grievance))
        : clamp01((respect * 0.5 + trust * 0.3 + familiarity * 0.2) * grievanceBrake));
    const retreatTogether = round4(clamp01((trust * 0.4 + affect * 0.3 + familiarity * 0.2 + (isLeader ? respect * 0.2 : 0)) * (0.5 + pressure * 0.5)) * grievanceBrake);
    const trade = round4(prosocialBase * grievanceBrake * (1 - pressure * 0.4) * (0.6 + familiarity * 0.4));
    const recruit = round4(clamp01(respect * 0.45 + affect * 0.3 + trust * 0.25) * grievanceBrake * (1 - pressure * 0.35));
    const shareInfo = round4(clamp01(trust * 0.5 + familiarity * 0.3 + obligation * 0.2) * grievanceBrake * (1 - pressure * 0.2));
    // Desertion: grievance + fear push out, trust/affect/obligation hold back.
    // Dominance asymmetry (target dominant) restrains desertion via dread.
    const desert = round4(clamp01(grievance * 0.5 + fear * 0.3 + pressure * 0.2 - trust * 0.35 - affect * 0.2 - obligation * 0.15) * (1 - dominance * 0.3));

    return { help, warn, followLeader, retreatTogether, trade, recruit, shareInfo, desert };
}

/**
 * Contagion gate: how much of a peer's panic one agent absorbs, filtered
 * through the directed relationship. Strangers barely transmit; trusted
 * and familiar peers transmit strongly; feared targets transmit alarm
 * (not calm) — handled by callers via the returned components.
 * @returns {{ susceptibility, alarmGain }} in [0,1]
 */
export function contagionGate(rel = {}) {
    const trust = clamp01(((typeof rel.trust === 'number' && Number.isFinite(rel.trust)) ? rel.trust : 0) + 1) / 2;
    const familiarity = clamp01(rel.familiarity ?? 0);
    const affect = affinity(rel.affection ?? 0);
    const fear = clamp01(rel.fear ?? 0);
    const grievance = clamp01(rel.grievance ?? 0);
    const susceptibility = round4(clamp01(trust * 0.5 + familiarity * 0.3 + affect * 0.2) * (1 - grievance * 0.6));
    const alarmGain = round4(clamp01(fear * 0.7 + (1 - trust) * 0.2));
    return { susceptibility, alarmGain };
}

export class SocialBehaviorEffects {
    score(rel, context) {
        return scoreSocialDecisions(rel, context);
    }

    gate(rel) {
        return contagionGate(rel);
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            decisionsTracked: SOCIAL_DECISIONS.length
        };
    }
}
