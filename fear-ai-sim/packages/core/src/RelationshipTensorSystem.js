/**
 * RelationshipTensorSystem - Directed multi-dimensional social relationship state.
 *
 * Models directed interpersonal attitudes between agents across 8 continuous dimensions:
 * - trust: [-1.0, 1.0] (negative = suspicion, positive = dependable ally)
 * - fear: [0.0, 1.0] (intimidation / dread of target)
 * - respect: [0.0, 1.0] (perceived competence / authority)
 * - affection: [-1.0, 1.0] (hostility to warmth/comradery)
 * - grievance: [0.0, 1.0] (active resentment / score to settle)
 * - familiarity: [0.0, 1.0] (depth/frequency of shared history)
 * - obligation: [0.0, 1.0] (debt owed for rescue or aid)
 * - dominance: [-1.0, 1.0] (perceived relative power balance)
 *
 * Adheres strictly to the Host Game Authority Invariant:
 * Evaluates social influence, contagion filtering, and pro-social intent gating
 * without asserting host authority over transforms, damage, or game state.
 */

export const INTERACTION_TYPES = Object.freeze({
    SHARED_SURVIVAL: 'SHARED_SURVIVAL',
    LEADER_CALMING: 'LEADER_CALMING',
    ABANDONMENT: 'ABANDONMENT',
    BETRAYAL: 'BETRAYAL',
    ATTACK: 'ATTACK',
    AID_RECEIVED: 'AID_RECEIVED',
    AID_PROVIDED: 'AID_PROVIDED',
    RESCUE_CONFIRMED: 'RESCUE_CONFIRMED',
    PEACEFUL_COEXISTENCE: 'PEACEFUL_COEXISTENCE'
});

export const DEFAULT_RELATIONSHIP_CONFIG = Object.freeze({
    maxRelationshipsPerAgent: 50,
    grievanceDecayRate: 0.0008,   // Gradual forgiveness over peaceful ticks (~1250 ticks to clear 1.0)
    familiarityDecayRate: 0.0001, // Slow fading of familiarity without contact
    obligationDecayRate: 0.0005   // Gradual expiration of moral debt
});

export class RelationshipTensorSystem {
    /**
     * @param {object} [config={}]
     */
    constructor(config = {}) {
        this.config = { ...DEFAULT_RELATIONSHIP_CONFIG, ...config };
        // Map<sourceId, Map<targetId, RelationshipVector>>
        this.relationships = new Map();
        this.tickCount = 0;
    }

    /**
     * Initialize or get directed relationship vector from source to target
     * @param {string} sourceId
     * @param {string} targetId
     * @returns {object}
     */
    getRelationship(sourceId, targetId) {
        if (!sourceId || !targetId || sourceId === targetId) return null;

        let sourceMap = this.relationships.get(sourceId);
        if (!sourceMap) {
            sourceMap = new Map();
            this.relationships.set(sourceId, sourceMap);
        }

        let rel = sourceMap.get(targetId);
        if (!rel) {
            rel = {
                trust: 0.0,
                fear: 0.0,
                respect: 0.5,
                affection: 0.0,
                grievance: 0.0,
                familiarity: 0.0,
                obligation: 0.0,
                dominance: 0.0,
                interactionCount: 0,
                lastInteractionTick: this.tickCount
            };
            sourceMap.set(targetId, rel);

            // Bounded capacity policy per agent
            if (sourceMap.size > this.config.maxRelationshipsPerAgent) {
                this._pruneLeastFamiliar(sourceMap);
            }
        }

        return rel;
    }

    /**
     * Check if an explicit relationship entry exists
     * @param {string} sourceId
     * @param {string} targetId
     * @returns {boolean}
     */
    hasRelationship(sourceId, targetId) {
        const m = this.relationships.get(sourceId);
        return Boolean(m && m.has(targetId));
    }

    /**
     * Record an interaction event between source and target
     * @param {string} sourceId - Experiencing agent
     * @param {string} targetId - Interacting peer
     * @param {string} interactionType - INTERACTION_TYPES
     * @param {object} [context={}]
     * @returns {object} updated relationship
     */
    recordInteraction(sourceId, targetId, interactionType, context = {}) {
        const rel = this.getRelationship(sourceId, targetId);
        if (!rel) return null;

        rel.interactionCount++;
        rel.lastInteractionTick = this.tickCount;
        const weight = Math.max(0.1, Math.min(2.0, Number(context.weight) || 1.0));

        switch (interactionType) {
            case INTERACTION_TYPES.SHARED_SURVIVAL:
                rel.trust = Math.min(1.0, rel.trust + 0.15 * weight);
                rel.affection = Math.min(1.0, rel.affection + 0.10 * weight);
                rel.familiarity = Math.min(1.0, rel.familiarity + 0.12 * weight);
                rel.fear = Math.max(0.0, rel.fear - 0.10 * weight);
                rel.grievance = Math.max(0.0, rel.grievance - 0.05 * weight);
                break;

            case INTERACTION_TYPES.LEADER_CALMING:
                rel.respect = Math.min(1.0, rel.respect + 0.20 * weight);
                rel.trust = Math.min(1.0, rel.trust + 0.15 * weight);
                rel.fear = Math.max(0.0, rel.fear - 0.15 * weight);
                rel.familiarity = Math.min(1.0, rel.familiarity + 0.08 * weight);
                rel.dominance = Math.max(-1.0, rel.dominance - 0.15 * weight); // Target recognized as superior/dominant
                break;

            case INTERACTION_TYPES.ABANDONMENT:
                rel.trust = Math.max(-1.0, rel.trust - 0.50 * weight);
                rel.grievance = Math.min(1.0, rel.grievance + 0.60 * weight);
                rel.affection = Math.max(-1.0, rel.affection - 0.40 * weight);
                rel.fear = Math.min(1.0, rel.fear + 0.10 * weight);
                break;

            case INTERACTION_TYPES.BETRAYAL:
                rel.trust = Math.max(-1.0, rel.trust - 0.85 * weight);
                rel.grievance = Math.min(1.0, rel.grievance + 0.85 * weight);
                rel.affection = Math.max(-1.0, rel.affection - 0.70 * weight);
                rel.respect = Math.max(0.0, rel.respect - 0.40 * weight);
                break;

            case INTERACTION_TYPES.ATTACK:
                rel.trust = Math.max(-1.0, rel.trust - 0.80 * weight);
                rel.grievance = Math.min(1.0, rel.grievance + 0.80 * weight);
                rel.fear = Math.min(1.0, rel.fear + 0.50 * weight);
                rel.affection = Math.max(-1.0, rel.affection - 0.60 * weight);
                break;

            case INTERACTION_TYPES.AID_RECEIVED:
                rel.trust = Math.min(1.0, rel.trust + 0.35 * weight);
                rel.affection = Math.min(1.0, rel.affection + 0.25 * weight);
                rel.obligation = Math.min(1.0, rel.obligation + 0.30 * weight);
                rel.grievance = Math.max(0.0, rel.grievance - 0.15 * weight);
                rel.familiarity = Math.min(1.0, rel.familiarity + 0.10 * weight);
                break;

            case INTERACTION_TYPES.AID_PROVIDED:
                rel.trust = Math.min(1.0, rel.trust + 0.20 * weight);
                rel.affection = Math.min(1.0, rel.affection + 0.20 * weight);
                rel.obligation = Math.max(0.0, rel.obligation - 0.25 * weight); // Repaying prior debt
                rel.grievance = Math.max(0.0, rel.grievance - 0.15 * weight);
                rel.familiarity = Math.min(1.0, rel.familiarity + 0.10 * weight);
                break;

            case INTERACTION_TYPES.RESCUE_CONFIRMED:
                rel.trust = Math.min(1.0, rel.trust + 0.60 * weight);
                rel.affection = Math.min(1.0, rel.affection + 0.40 * weight);
                rel.obligation = Math.min(1.0, rel.obligation + 0.50 * weight);
                rel.respect = Math.min(1.0, rel.respect + 0.30 * weight);
                rel.grievance = Math.max(0.0, rel.grievance - 0.30 * weight);
                rel.familiarity = Math.min(1.0, rel.familiarity + 0.20 * weight);
                break;

            case INTERACTION_TYPES.PEACEFUL_COEXISTENCE:
                rel.familiarity = Math.min(1.0, rel.familiarity + 0.02 * weight);
                break;

            default:
                break;
        }

        return rel;
    }

    /**
     * Compute effective contagion susceptibility from peer to source
     * High familiarity and trust enhance transmission; high grievance suppresses it.
     * @param {string} sourceId - Receiving agent
     * @param {string} peerId - Emitting peer
     * @param {number} [baseContagion=0.5]
     * @returns {number} modulated contagion gain
     */
    getContagionSusceptibility(sourceId, peerId, baseContagion = 0.5) {
        const base = Math.max(0.0, Math.min(1.0, Number(baseContagion) || 0.5));
        const rel = this.getRelationship(sourceId, peerId);
        if (!rel) return base;

        // Familiarity increases empathy/attunement [0.5..1.0]
        const famMult = 0.5 + 0.5 * rel.familiarity;
        // Grievance causes skepticism/detachment [0.2..1.0]
        const grievMult = Math.max(0.2, 1.0 - 0.8 * rel.grievance);
        // Trust enhances credibility [0.5..1.0]
        const trustMult = 0.75 + 0.25 * Math.max(0, rel.trust);

        return Math.max(0.0, Math.min(1.0, base * famMult * grievMult * trustMult));
    }

    /**
     * Compute leader reassurance efficiency from leader to follower
     * Calming requires respect and baseline trust; blocked by grievance.
     * @param {string} followerId
     * @param {string} leaderId
     * @param {number} [baseEfficiency=0.5]
     * @returns {number} modulated reassurance gain
     */
    getLeaderReassuranceEfficiency(followerId, leaderId, baseEfficiency = 0.5) {
        const base = Math.max(0.0, Math.min(1.0, Number(baseEfficiency) || 0.5));
        const rel = this.getRelationship(followerId, leaderId);
        if (!rel) return base * 0.5;

        // Severe resentment completely blocks leader calming
        if (rel.grievance > 0.4 || rel.trust < -0.3) {
            return 0.0;
        }

        // Respect and trust multiply calming power
        const respectMult = 0.4 + 0.6 * rel.respect;
        const trustMult = 0.5 + 0.5 * Math.max(0, rel.trust);

        return Math.max(0.0, Math.min(1.0, base * respectMult * trustMult));
    }

    /**
     * Compute pro-social helping/warning willingness towards target
     * High trust, affection, and obligation increase willingness;
     * High grievance and fear decrease willingness.
     * @param {string} sourceId
     * @param {string} targetId
     * @param {number} [baseAgreeableness=0.5]
     * @returns {number} willingness in [0.0, 1.0]
     */
    getProSocialWillingness(sourceId, targetId, baseAgreeableness = 0.5) {
        const base = Math.max(0.0, Math.min(1.0, Number(baseAgreeableness) || 0.5));
        const rel = this.getRelationship(sourceId, targetId);
        if (!rel) return base;

        // Hard refusal boundary: acute grudge blocks altruism
        if (rel.grievance > 0.5) {
            return 0.0;
        }

        const trustBonus = 0.3 * Math.max(-1.0, Math.min(1.0, rel.trust));
        const affectionBonus = 0.25 * Math.max(-1.0, Math.min(1.0, rel.affection));
        const obligationBonus = 0.25 * rel.obligation;
        const fearPenalty = 0.20 * rel.fear;
        const grievancePenalty = 0.50 * rel.grievance;

        const willingness = base + trustBonus + affectionBonus + obligationBonus - fearPenalty - grievancePenalty;
        return Math.max(0.0, Math.min(1.0, willingness));
    }

    /**
     * Advance relationship system decay (forgiveness, obligation expiration)
     * @param {number} [deltaTicks=1]
     */
    tick(deltaTicks = 1) {
        if (deltaTicks <= 0) return;
        this.tickCount += deltaTicks;

        for (const sourceMap of this.relationships.values()) {
            for (const rel of sourceMap.values()) {
                // 1. Grievance decays over time (forgiveness)
                if (rel.grievance > 0) {
                    rel.grievance = Math.max(0.0, rel.grievance - this.config.grievanceDecayRate * deltaTicks);
                }
                // 2. Obligation decays slowly
                if (rel.obligation > 0) {
                    rel.obligation = Math.max(0.0, rel.obligation - this.config.obligationDecayRate * deltaTicks);
                }
                // 3. Familiarity slowly decays without recent interaction (> 2000 ticks)
                if (this.tickCount - rel.lastInteractionTick > 2000 && rel.familiarity > 0) {
                    rel.familiarity = Math.max(0.0, rel.familiarity - this.config.familiarityDecayRate * deltaTicks);
                }
            }
        }
    }

    /**
     * Completely remove an agent and all directed edges to/from them upon despawn
     * @param {string} agentId
     */
    purgeAgent(agentId) {
        if (!agentId) return;
        // 1. Remove outbound relationships
        this.relationships.delete(agentId);
        // 2. Remove inbound relationships
        for (const sourceMap of this.relationships.values()) {
            sourceMap.delete(agentId);
        }
    }

    /**
     * Prune least familiar relationship to respect memory bounds
     * @private
     */
    _pruneLeastFamiliar(sourceMap) {
        let lowestKey = null;
        let lowestScore = Infinity;

        for (const [targetId, rel] of sourceMap.entries()) {
            // Keep active grievances and high obligations protected from pruning
            if (rel.grievance > 0.4 || rel.obligation > 0.4) continue;

            const score = rel.familiarity + Math.abs(rel.trust) * 0.5;
            if (score < lowestScore) {
                lowestScore = score;
                lowestKey = targetId;
            }
        }

        if (lowestKey) {
            sourceMap.delete(lowestKey);
        }
    }

    /**
     * Clear all relationship states
     */
    clear() {
        this.relationships.clear();
    }

    /**
     * Serialize complete state for snapshot persistence
     * @returns {object}
     */
    getState() {
        const serialized = [];
        for (const [sourceId, targetMap] of this.relationships.entries()) {
            const targets = [];
            for (const [targetId, rel] of targetMap.entries()) {
                targets.push({
                    targetId,
                    ...rel
                });
            }
            serialized.push({
                sourceId,
                targets
            });
        }

        return {
            tickCount: this.tickCount,
            relationships: serialized
        };
    }

    /**
     * Restore relationship state from snapshot
     * @param {object} snapshot
     */
    setState(snapshot) {
        if (!snapshot) return;
        this.tickCount = Number(snapshot.tickCount) || 0;
        this.relationships.clear();

        if (Array.isArray(snapshot.relationships)) {
            for (const item of snapshot.relationships) {
                if (!item || !item.sourceId || !Array.isArray(item.targets)) continue;
                const sourceMap = new Map();
                for (const t of item.targets) {
                    if (!t || !t.targetId) continue;
                    const { targetId, ...relData } = t;
                    sourceMap.set(targetId, { ...relData });
                }
                this.relationships.set(item.sourceId, sourceMap);
            }
        }
    }
}

export default RelationshipTensorSystem;
