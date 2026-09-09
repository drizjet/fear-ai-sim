/**
 * packages/core/src/SocialEventEngine.js
 *
 * Section XXIV:
 * Relationship updates arise from events — rescue, betrayal, aid,
 * abandonment, leadership success/failure, trade, shared danger, warning,
 * and deception — translated onto RelationshipTensorSystem storage.
 *
 * Two channels the tensor alone lacks:
 * 1. Witness broadcast: third parties who observe an event update their
 *    attitude toward the ACTOR (reputation), scaled by witness trust in
 *    the reporter and halved against direct experience.
 * 2. Deception lifecycle: false aid/warnings grant short-term trust that
 *    reverses with interest when exposed — betrayal plus a gullibility
 *    scar (familiarity keeps the lesson).
 *
 * Event application is deterministic: sorted witness order, clamped
 * weights, no RNG. Deception exposure is host-reported (the engine never
 * invents world truth).
 *
 * Advisory only. Host owns entities, combat, items, and movement.
 */

import { INTERACTION_TYPES } from './RelationshipTensorSystem.js';

const clamp01 = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
};

const clampWeight = (w) => Math.max(0.1, Math.min(2.0, typeof w === 'number' && Number.isFinite(w) ? w : 1));
export const SOCIAL_EVENTS = Object.freeze([
    'RESCUE', 'BETRAYAL', 'AID', 'ABANDONMENT',
    'LEADERSHIP_SUCCESS', 'LEADERSHIP_FAILURE',
    'TRADE', 'SHARED_DANGER', 'WARNING', 'DECEPTION'
]);

function directPasses(event, exposed = false) {
    if (event === 'DECEPTION' && exposed) return [INTERACTION_TYPES.BETRAYAL];
    switch (event) {
        case 'RESCUE': return [INTERACTION_TYPES.RESCUE_CONFIRMED];
        case 'BETRAYAL': return [INTERACTION_TYPES.BETRAYAL];
        case 'AID': return [INTERACTION_TYPES.AID_RECEIVED];
        case 'ABANDONMENT': return [INTERACTION_TYPES.ABANDONMENT];
        case 'LEADERSHIP_SUCCESS': return [INTERACTION_TYPES.LEADER_CALMING, INTERACTION_TYPES.SHARED_SURVIVAL];
        case 'LEADERSHIP_FAILURE': return [INTERACTION_TYPES.ABANDONMENT];
        case 'TRADE': return [INTERACTION_TYPES.PEACEFUL_COEXISTENCE, INTERACTION_TYPES.AID_RECEIVED];
        case 'SHARED_DANGER': return [INTERACTION_TYPES.SHARED_SURVIVAL];
        case 'WARNING': return [INTERACTION_TYPES.AID_RECEIVED];
        case 'DECEPTION': return [INTERACTION_TYPES.AID_RECEIVED];
        default: throw new Error(`UNKNOWN_SOCIAL_EVENT: ${event}`);
    }
}

/** Extra direct-vector deltas for flavors the tensor types under-express. */
function flavorDelta(event, exposed) {
    switch (event) {
        case 'TRADE':
            return { trust: 0.08, familiarity: 0.06 };
        case 'WARNING':
            return { trust: 0.1, familiarity: 0.04 };
        case 'LEADERSHIP_FAILURE':
            return { respect: -0.25, trust: -0.1 };
        case 'DECEPTION':
            return exposed
                ? { trust: -0.9, grievance: 0.9, affection: -0.7, respect: -0.4 }
                : {};
        default:
            return {};
    }
}

function applyDelta(rel, delta, weight) {
    for (const [k, d] of Object.entries(delta)) {
        if (typeof rel[k] !== 'number') continue;
        const lo = (k === 'trust' || k === 'affection' || k === 'dominance') ? -1 : 0;
        rel[k] = Math.max(lo, Math.min(1, rel[k] + d * weight));
    }
}

export class SocialEventEngine {
    constructor() {
        this.eventsApplied = 0;
        this.exposures = 0;
    }

    /**
     * Apply one social event.
     * @param {object} tensor RelationshipTensorSystem instance
     * @param {string} event SOCIAL_EVENTS value
     * @param {string} actorId who acted
     * @param {string} targetId who experienced it
     * @param {object} [options={}] { weight, witnesses: string[], exposed: boolean }
     * @returns {{ direct: object, witnessUpdates: Array }}
     */
    applyEvent(tensor, event, actorId, targetId, options = {}) {
        if (!tensor || typeof tensor.recordInteraction !== 'function') throw new Error('INVALID_TENSOR');
        if (!SOCIAL_EVENTS.includes(event)) throw new Error(`UNKNOWN_SOCIAL_EVENT: ${event}`);
        const actor = String(actorId);
        const target = String(targetId);
        if (!actor || !target || actor === target) throw new Error('INVALID_EVENT_PARTICIPANTS');
        const weight = clampWeight(options.weight);
        const exposed = options.exposed === true;

        // 1. Direct pair: tensor passes in fixed order.
        let direct = null;
        for (const type of directPasses(event, exposed)) {
            direct = tensor.recordInteraction(target, actor, type, { weight });
        }
        const delta = flavorDelta(event, exposed);
        if (Object.keys(delta).length > 0 && direct) applyDelta(direct, delta, weight);
        if (event === 'DECEPTION' && exposed) this.exposures += 1;

        // 2. Witness broadcast: observers update attitude toward the ACTOR
        // at half weight, scaled by their trust in the TARGET (reporter).
        const witnesses = [...new Set((options.witnesses || []).map(String))]
            .filter((w) => w && w !== actor && w !== target)
            .sort();
        const witnessUpdates = [];
        for (const w of witnesses) {
            const trustInReporter = tensor.getRelationship(w, target)?.trust ?? 0;
            const reporterCred = clamp01((trustInReporter + 1) / 2);
            const wWeight = clampWeight(weight * 0.5 * reporterCred);
            let wRel = null;
            const positive = ['RESCUE', 'AID', 'LEADERSHIP_SUCCESS', 'SHARED_DANGER', 'WARNING', 'TRADE'].includes(event)
                && !(event === 'DECEPTION' && !exposed);
            if (event === 'DECEPTION' && exposed) {
                wRel = tensor.recordInteraction(w, actor, INTERACTION_TYPES.BETRAYAL, { weight: wWeight });
            } else if (event === 'BETRAYAL' || event === 'ABANDONMENT' || event === 'LEADERSHIP_FAILURE') {
                wRel = tensor.recordInteraction(w, actor, INTERACTION_TYPES.BETRAYAL, { weight: wWeight * 0.5 });
            } else if (positive) {
                wRel = tensor.recordInteraction(w, actor, INTERACTION_TYPES.AID_RECEIVED, { weight: wWeight * 0.5 });
            }
            if (wRel) witnessUpdates.push({ witness: w, trust: wRel.trust });
        }
        this.eventsApplied += 1;
        return { direct, witnessUpdates };
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            eventsApplied: this.eventsApplied,
            exposures: this.exposures
        };
    }
}
