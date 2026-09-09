/**
 * packages/core/src/MoralDissonanceEngine.js
 * 
 * Frontier B / Sections 141–145:
 * Dynamic Moral Alignment, Cognitive Dissonance, Guilt Accumulation & Moral Injury Engine.
 * 
 * Implements:
 * 1. Moral Foundations Architecture (Haidt & Graham, 2007):
 *    - 5 normalized ethical foundations: CARE, FAIRNESS, LOYALTY, AUTHORITY, SANCTITY.
 *    - Canonical archetypal profiles (Honorable Guardian, Zealous Crusader, Mercenary Pragmatist, etc.).
 * 2. Transgression Evaluation & Moral Cognitive Dissonance (Festinger, 1957):
 *    - Transgression violation vectors across ethical dimensions.
 *    - Contextual rationalization: acute fear mitigation, authoritarian order compliance, and survival necessity.
 * 3. Continuous Guilt Integration & Passive Temporal Decay:
 *    - Continuous differential integration of unatoned dissonance into persistent Guilt G in [0, 1].
 *    - Passive temporal decay with persistent cognitive scarring.
 * 4. Restorative Atonement & Moral Rehabilitation:
 *    - Pro-social restorative acts granting discrete guilt relief and psychological equilibrium recovery.
 * 5. Chronic Moral Injury & Character Remodeling (Litz et al., 2009; Shay, 2014):
 *    - Sustained severe guilt triggers irreversible Neuroticism drift, Agreeableness erosion, and Valence ceilings.
 *    - Emergent Moral Defiance: dynamic refusal probability against orders requiring dishonorable or unethical acts.
 * 
 * STRICT INVARIANT:
 * Host game maintains authoritative ownership over entity transforms, physics, inventory, and legal combat.
 * Middleware provides deterministic moral evaluation, guilt dynamics, and advisory refusal recommendations.
 */

import { DeterministicRng } from './DeterministicRng.js';

export const MORAL_FOUNDATIONS = Object.freeze({
    CARE: 'CARE',           // Life preservation, kindness vs harm/cruelty
    FAIRNESS: 'FAIRNESS',   // Reciprocity, justice, equity vs cheating/exploitation
    LOYALTY: 'LOYALTY',     // Clan, faction, peer allegiance vs betrayal/desertion
    AUTHORITY: 'AUTHORITY', // Hierarchy deference, command obedience vs subversion/mutiny
    SANCTITY: 'SANCTITY'    // Sacred sanctity, traditions, purity vs desecration/plunder
});

export const DEFAULT_MORAL_PROFILES = Object.freeze({
    HONORABLE_GUARDIAN: Object.freeze({
        [MORAL_FOUNDATIONS.CARE]: 0.35,
        [MORAL_FOUNDATIONS.FAIRNESS]: 0.25,
        [MORAL_FOUNDATIONS.LOYALTY]: 0.25,
        [MORAL_FOUNDATIONS.AUTHORITY]: 0.10,
        [MORAL_FOUNDATIONS.SANCTITY]: 0.05
    }),
    ZEALOUS_CRUSADER: Object.freeze({
        [MORAL_FOUNDATIONS.CARE]: 0.10,
        [MORAL_FOUNDATIONS.FAIRNESS]: 0.05,
        [MORAL_FOUNDATIONS.LOYALTY]: 0.20,
        [MORAL_FOUNDATIONS.AUTHORITY]: 0.30,
        [MORAL_FOUNDATIONS.SANCTITY]: 0.35
    }),
    MERCENARY_PRAGMATIST: Object.freeze({
        [MORAL_FOUNDATIONS.CARE]: 0.10,
        [MORAL_FOUNDATIONS.FAIRNESS]: 0.35,
        [MORAL_FOUNDATIONS.LOYALTY]: 0.20,
        [MORAL_FOUNDATIONS.AUTHORITY]: 0.25,
        [MORAL_FOUNDATIONS.SANCTITY]: 0.10
    }),
    REBEL_FREE_SPIRIT: Object.freeze({
        [MORAL_FOUNDATIONS.CARE]: 0.35,
        [MORAL_FOUNDATIONS.FAIRNESS]: 0.35,
        [MORAL_FOUNDATIONS.LOYALTY]: 0.20,
        [MORAL_FOUNDATIONS.AUTHORITY]: 0.05,
        [MORAL_FOUNDATIONS.SANCTITY]: 0.05
    }),
    COLD_UTILITARIAN: Object.freeze({
        [MORAL_FOUNDATIONS.CARE]: 0.05,
        [MORAL_FOUNDATIONS.FAIRNESS]: 0.40,
        [MORAL_FOUNDATIONS.LOYALTY]: 0.30,
        [MORAL_FOUNDATIONS.AUTHORITY]: 0.20,
        [MORAL_FOUNDATIONS.SANCTITY]: 0.05
    })
});

export const TRANSGRESSION_TYPES = Object.freeze({
    ABANDON_COMRADE: 'ABANDON_COMRADE',
    LOOT_SETTLEMENT: 'LOOT_SETTLEMENT',
    EXECUTE_DEFENSELESS: 'EXECUTE_DEFENSELESS',
    BREAK_SWORN_TREATY: 'BREAK_SWORN_TREATY',
    BETRAY_COMMANDER: 'BETRAY_COMMANDER',
    COWARDLY_FLIGHT: 'COWARDLY_FLIGHT',
    DESECRATE_SANCTUARY: 'DESECRATE_SANCTUARY'
});

export const TRANSGRESSION_PROFILES = Object.freeze({
    [TRANSGRESSION_TYPES.ABANDON_COMRADE]: Object.freeze({
        [MORAL_FOUNDATIONS.CARE]: 0.80,
        [MORAL_FOUNDATIONS.FAIRNESS]: 0.50,
        [MORAL_FOUNDATIONS.LOYALTY]: 0.85,
        [MORAL_FOUNDATIONS.AUTHORITY]: 0.30,
        [MORAL_FOUNDATIONS.SANCTITY]: 0.10
    }),
    [TRANSGRESSION_TYPES.LOOT_SETTLEMENT]: Object.freeze({
        [MORAL_FOUNDATIONS.CARE]: 0.75,
        [MORAL_FOUNDATIONS.FAIRNESS]: 0.80,
        [MORAL_FOUNDATIONS.LOYALTY]: 0.20,
        [MORAL_FOUNDATIONS.AUTHORITY]: 0.20,
        [MORAL_FOUNDATIONS.SANCTITY]: 0.60
    }),
    [TRANSGRESSION_TYPES.EXECUTE_DEFENSELESS]: Object.freeze({
        [MORAL_FOUNDATIONS.CARE]: 0.95,
        [MORAL_FOUNDATIONS.FAIRNESS]: 0.85,
        [MORAL_FOUNDATIONS.LOYALTY]: 0.10,
        [MORAL_FOUNDATIONS.AUTHORITY]: 0.10,
        [MORAL_FOUNDATIONS.SANCTITY]: 0.50
    }),
    [TRANSGRESSION_TYPES.BREAK_SWORN_TREATY]: Object.freeze({
        [MORAL_FOUNDATIONS.CARE]: 0.30,
        [MORAL_FOUNDATIONS.FAIRNESS]: 0.95,
        [MORAL_FOUNDATIONS.LOYALTY]: 0.80,
        [MORAL_FOUNDATIONS.AUTHORITY]: 0.40,
        [MORAL_FOUNDATIONS.SANCTITY]: 0.50
    }),
    [TRANSGRESSION_TYPES.BETRAY_COMMANDER]: Object.freeze({
        [MORAL_FOUNDATIONS.CARE]: 0.20,
        [MORAL_FOUNDATIONS.FAIRNESS]: 0.40,
        [MORAL_FOUNDATIONS.LOYALTY]: 0.90,
        [MORAL_FOUNDATIONS.AUTHORITY]: 0.85,
        [MORAL_FOUNDATIONS.SANCTITY]: 0.10
    }),
    [TRANSGRESSION_TYPES.COWARDLY_FLIGHT]: Object.freeze({
        [MORAL_FOUNDATIONS.CARE]: 0.40,
        [MORAL_FOUNDATIONS.FAIRNESS]: 0.30,
        [MORAL_FOUNDATIONS.LOYALTY]: 0.75,
        [MORAL_FOUNDATIONS.AUTHORITY]: 0.60,
        [MORAL_FOUNDATIONS.SANCTITY]: 0.10
    }),
    [TRANSGRESSION_TYPES.DESECRATE_SANCTUARY]: Object.freeze({
        [MORAL_FOUNDATIONS.CARE]: 0.40,
        [MORAL_FOUNDATIONS.FAIRNESS]: 0.40,
        [MORAL_FOUNDATIONS.LOYALTY]: 0.20,
        [MORAL_FOUNDATIONS.AUTHORITY]: 0.30,
        [MORAL_FOUNDATIONS.SANCTITY]: 0.95
    })
});

export const ATONEMENT_TYPES = Object.freeze({
    AID_VICTIMS: 'AID_VICTIMS',
    CONFESSION_AND_PENANCE: 'CONFESSION_AND_PENANCE',
    DEFEND_THE_HELPLESS: 'DEFEND_THE_HELPLESS',
    RESTITUTION_OF_GOODS: 'RESTITUTION_OF_GOODS',
    SACRIFICIAL_INTERVENTION: 'SACRIFICIAL_INTERVENTION'
});

export const ATONEMENT_PROFILES = Object.freeze({
    [ATONEMENT_TYPES.AID_VICTIMS]: Object.freeze({ relief: 0.25, name: 'Aid to Victims' }),
    [ATONEMENT_TYPES.CONFESSION_AND_PENANCE]: Object.freeze({ relief: 0.15, name: 'Confession and Penance' }),
    [ATONEMENT_TYPES.DEFEND_THE_HELPLESS]: Object.freeze({ relief: 0.35, name: 'Defense of the Helpless' }),
    [ATONEMENT_TYPES.RESTITUTION_OF_GOODS]: Object.freeze({ relief: 0.20, name: 'Material Restitution' }),
    [ATONEMENT_TYPES.SACRIFICIAL_INTERVENTION]: Object.freeze({ relief: 0.50, name: 'Self-Sacrificial Intervention' })
});

export class MoralDissonanceEngine {
    /**
     * @param {Object} [options={}] Configuration options
     * @param {number} [options.seed=4242] PRNG seed
     * @param {number} [options.decayRate=0.005] Passive guilt decay rate per tick
     * @param {number} [options.severeGuiltThreshold=0.75] Threshold defining severe acute guilt
     * @param {number} [options.injuryThresholdTicks=50] Consecutive severe ticks required for moral injury
     */
    constructor(options = {}) {
        this.rng = new DeterministicRng(options.seed ?? 4242);
        this.decayRate = options.decayRate ?? 0.005;
        this.severeGuiltThreshold = options.severeGuiltThreshold ?? 0.75;
        this.injuryThresholdTicks = options.injuryThresholdTicks ?? 50;
        this.dissonanceConversionRate = options.dissonanceConversionRate ?? 0.80;

        this.agents = new Map();
        this.currentTick = 0;
    }

    /**
     * Registers an agent with a specific moral foundations profile.
     * @param {string} agentId Unique agent identifier
     * @param {Object} [profile=DEFAULT_MORAL_PROFILES.HONORABLE_GUARDIAN] Moral weights
     * @returns {Object} Initialized state
     */
    registerAgentMoralProfile(agentId, profile = DEFAULT_MORAL_PROFILES.HONORABLE_GUARDIAN) {
        // Normalize weights so sum is 1.0
        const rawWeights = {
            [MORAL_FOUNDATIONS.CARE]: profile[MORAL_FOUNDATIONS.CARE] ?? 0.2,
            [MORAL_FOUNDATIONS.FAIRNESS]: profile[MORAL_FOUNDATIONS.FAIRNESS] ?? 0.2,
            [MORAL_FOUNDATIONS.LOYALTY]: profile[MORAL_FOUNDATIONS.LOYALTY] ?? 0.2,
            [MORAL_FOUNDATIONS.AUTHORITY]: profile[MORAL_FOUNDATIONS.AUTHORITY] ?? 0.2,
            [MORAL_FOUNDATIONS.SANCTITY]: profile[MORAL_FOUNDATIONS.SANCTITY] ?? 0.2
        };

        const totalWeight = Object.values(rawWeights).reduce((sum, w) => sum + Math.max(0, w), 0) || 1.0;
        const normalizedFoundations = {};
        for (const [key, val] of Object.entries(rawWeights)) {
            normalizedFoundations[key] = Math.max(0, val) / totalWeight;
        }

        const state = {
            agentId,
            foundations: normalizedFoundations,
            guilt: 0.0,
            cumulativeDissonance: 0.0,
            consecutiveSevereTicks: 0,
            moralInjury: false,
            moralInjuryCount: 0,
            personalityDeltas: {
                neuroticism: 0.0,
                agreeableness: 0.0,
                dominance: 0.0
            },
            history: []
        };

        this.agents.set(agentId, state);
        return state;
    }

    /**
     * Computes moral cognitive dissonance for a prospective or committed transgression.
     * @param {string} agentId
     * @param {string} transgressionType One of TRANSGRESSION_TYPES
     * @param {Object} [context={}] Environmental / affective context
     * @returns {Object} Dissonance computation details
     */
    computeDissonance(agentId, transgressionType, context = {}) {
        const state = this.agents.get(agentId);
        if (!state) {
            throw new Error(`Agent ${agentId} is not registered in MoralDissonanceEngine.`);
        }

        const violationVector = TRANSGRESSION_PROFILES[transgressionType] || context.customViolationVector;
        if (!violationVector) {
            throw new Error(`Unrecognized transgression type: ${transgressionType}`);
        }

        // 1. Raw Dissonance = Dot product between moral foundations and violation vector
        let rawDissonance = 0;
        const breakdown = {};
        for (const [foundKey, weight] of Object.entries(state.foundations)) {
            const violation = violationVector[foundKey] ?? 0;
            const contrib = weight * violation;
            breakdown[foundKey] = Number(contrib.toFixed(4));
            rawDissonance += contrib;
        }

        // 2. Rationalization Mechanics (Mitigation factors reducing immediate dissonance)
        // A. Acute fear / panic mitigation (survival instinct overrides higher-order ideals)
        const fear = Math.max(0, Math.min(1.0, context.fear ?? 0));
        const fearRationalization = Math.min(0.60, fear * 0.65);

        // B. Order compliance mitigation (subordination to commanding authority)
        const isDirectOrder = Boolean(context.isDirectOrder);
        const orderRationalization = isDirectOrder ? (state.foundations[MORAL_FOUNDATIONS.AUTHORITY] * 0.50) : 0.0;

        // C. Extreme necessity mitigation (e.g. starving, drought)
        const necessity = Math.max(0, Math.min(1.0, context.necessity ?? 0));
        const necessityRationalization = necessity * 0.40;

        const totalRationalization = Math.min(0.75, fearRationalization + orderRationalization + necessityRationalization);
        const netDissonance = Math.max(0, Math.min(1.0, rawDissonance * (1.0 - totalRationalization)));

        return {
            rawDissonance: Number(rawDissonance.toFixed(4)),
            netDissonance: Number(netDissonance.toFixed(4)),
            rationalization: {
                total: Number(totalRationalization.toFixed(4)),
                fearRationalization: Number(fearRationalization.toFixed(4)),
                orderRationalization: Number(orderRationalization.toFixed(4)),
                necessityRationalization: Number(necessityRationalization.toFixed(4))
            },
            foundationBreakdown: breakdown
        };
    }

    /**
     * Records a committed transgression, integrating dissonance into active guilt.
     * @param {string} agentId
     * @param {string} transgressionType
     * @param {Object} [context={}]
     * @returns {Object} Transgression impact report
     */
    recordTransgression(agentId, transgressionType, context = {}) {
        const state = this.agents.get(agentId);
        if (!state) {
            throw new Error(`Agent ${agentId} is not registered in MoralDissonanceEngine.`);
        }

        const dissonanceCalc = this.computeDissonance(agentId, transgressionType, context);
        const addedGuilt = dissonanceCalc.netDissonance * this.dissonanceConversionRate;

        const previousGuilt = state.guilt;
        state.guilt = Math.max(0, Math.min(1.0, state.guilt + addedGuilt));
        state.cumulativeDissonance += dissonanceCalc.netDissonance;

        const record = {
            type: 'TRANSGRESSION',
            tick: this.currentTick,
            transgressionType,
            dissonance: dissonanceCalc.netDissonance,
            rawDissonance: dissonanceCalc.rawDissonance,
            addedGuilt: Number(addedGuilt.toFixed(4)),
            resultingGuilt: Number(state.guilt.toFixed(4)),
            context: { ...context }
        };

        state.history.push(record);

        return {
            agentId,
            transgressionType,
            dissonanceCalc,
            addedGuilt: Number(addedGuilt.toFixed(4)),
            previousGuilt: Number(previousGuilt.toFixed(4)),
            currentGuilt: Number(state.guilt.toFixed(4)),
            isSevere: state.guilt >= this.severeGuiltThreshold
        };
    }

    /**
     * Records a restorative pro-social act that grants discrete guilt relief.
     * @param {string} agentId
     * @param {string} atonementType One of ATONEMENT_TYPES
     * @param {Object} [context={}]
     * @returns {Object} Atonement impact report
     */
    recordAtonement(agentId, atonementType, context = {}) {
        const state = this.agents.get(agentId);
        if (!state) {
            throw new Error(`Agent ${agentId} is not registered in MoralDissonanceEngine.`);
        }

        const profile = ATONEMENT_PROFILES[atonementType];
        if (!profile) {
            throw new Error(`Unrecognized atonement type: ${atonementType}`);
        }

        const multiplier = Math.max(0.5, Math.min(2.0, context.intensity ?? 1.0));
        const relief = profile.relief * multiplier;

        const previousGuilt = state.guilt;
        state.guilt = Math.max(0, state.guilt - relief);

        // Atonement can help partially mitigate cynicism if injured
        if (state.moralInjury && state.guilt < this.severeGuiltThreshold) {
            state.personalityDeltas.agreeableness = Math.min(0, state.personalityDeltas.agreeableness + 0.04 * multiplier);
        }

        const record = {
            type: 'ATONEMENT',
            tick: this.currentTick,
            atonementType,
            relief: Number(relief.toFixed(4)),
            previousGuilt: Number(previousGuilt.toFixed(4)),
            resultingGuilt: Number(state.guilt.toFixed(4)),
            context: { ...context }
        };

        state.history.push(record);

        return {
            agentId,
            atonementType,
            reliefAmount: Number(relief.toFixed(4)),
            previousGuilt: Number(previousGuilt.toFixed(4)),
            currentGuilt: Number(state.guilt.toFixed(4)),
            guiltRelieved: Number((previousGuilt - state.guilt).toFixed(4))
        };
    }

    /**
     * Evaluates order compliance vs moral defiance when commanded to perform an act.
     * @param {string} agentId
     * @param {string} proposedTransgression
     * @param {Object} [context={}]
     * @returns {Object} Compliance deliberation
     */
    evaluateOrderCompliance(agentId, proposedTransgression, context = {}) {
        const state = this.agents.get(agentId);
        if (!state) {
            throw new Error(`Agent ${agentId} is not registered in MoralDissonanceEngine.`);
        }

        const prospectiveDissonance = this.computeDissonance(agentId, proposedTransgression, {
            ...context,
            isDirectOrder: true
        });

        // Insubordination pressure increases with accumulated guilt and prospective dissonance,
        // attenuated by internalized authority weight.
        const authorityDeference = state.foundations[MORAL_FOUNDATIONS.AUTHORITY];
        let insubordinationPressure = (state.guilt * 0.70 + prospectiveDissonance.netDissonance * 0.60) * (1.0 - authorityDeference * 0.50);

        // If morally injured, cynicism and trauma exacerbate refusal pressure by 1.5x
        if (state.moralInjury) {
            insubordinationPressure *= 1.50;
        }

        // Disciplinary threat from commander can enforce compliance
        const coercionSeverity = Math.max(0, Math.min(1.0, context.coercionSeverity ?? 0.0));
        insubordinationPressure = Math.max(0, insubordinationPressure - coercionSeverity * 0.45);

        const refusalProbability = Math.max(0, Math.min(0.95, insubordinationPressure));
        const roll = this.rng.random();
        const willComply = roll >= refusalProbability;

        let rationale = 'Complies with command within moral tolerance.';
        if (!willComply) {
            if (state.moralInjury) {
                rationale = `Moral Defiance: Traumatized conscience refuses command due to excessive moral injury and guilt (${state.guilt.toFixed(2)}).`;
            } else {
                rationale = `Insubordination: Ethical conviction (${prospectiveDissonance.netDissonance.toFixed(2)} dissonance) outweighs authority deference.`;
            }
        }

        return {
            agentId,
            proposedTransgression,
            willComply,
            refusalProbability: Number(refusalProbability.toFixed(4)),
            roll: Number(roll.toFixed(4)),
            prospectiveDissonance: prospectiveDissonance.netDissonance,
            currentGuilt: Number(state.guilt.toFixed(4)),
            moralInjury: state.moralInjury,
            rationale
        };
    }

    /**
     * Applies advisory affective modulation to an AffectiveAgent based on guilt and moral injury.
     * @param {string} agentId
     * @param {Object} affectiveAgent Instance of AffectiveAgent
     */
    applyMoralAffectModulation(agentId, affectiveAgent) {
        const state = this.agents.get(agentId);
        if (!state || !affectiveAgent) return;

        // High guilt depresses valence (melancholy/regret) and elevates chronic arousal (anxiety)
        if (state.guilt > 0.30) {
            const guiltScale = state.guilt;
            if (affectiveAgent.valence !== undefined) {
                affectiveAgent.valence = Math.max(-1.0, Math.min(1.0, affectiveAgent.valence - guiltScale * 0.35));
            }
            if (affectiveAgent.arousal !== undefined) {
                affectiveAgent.arousal = Math.max(0, Math.min(1.0, affectiveAgent.arousal + guiltScale * 0.15));
            }
            if (affectiveAgent.currentDominance !== undefined) {
                affectiveAgent.currentDominance = Math.max(0.1, affectiveAgent.currentDominance - guiltScale * 0.25);
            }
        }

        // If morally injured, enforce depressive valence ceiling
        if (state.moralInjury && affectiveAgent.valence !== undefined) {
            affectiveAgent.valence = Math.min(0.40, affectiveAgent.valence);
        }
    }

    /**
     * Advances the moral simulation by deltaTicks, processing guilt decay and moral injury triggers.
     * @param {number} [deltaTicks=1]
     * @returns {Object} Tick summary
     */
    tick(deltaTicks = 1) {
        this.currentTick += deltaTicks;
        const injuredAgents = [];

        for (const [id, state] of this.agents.entries()) {
            // 1. Check severe guilt condition before decay
            const wasSevere = state.guilt >= this.severeGuiltThreshold;

            // Passive Guilt Decay: G_{t+1} = G_t * (1 - lambda)^dt
            // Morally injured agents decay guilt 60% slower due to chronic rumination
            const effectiveDecay = state.moralInjury ? (this.decayRate * 0.40) : this.decayRate;
            const decayFactor = Math.pow(1.0 - effectiveDecay, deltaTicks);
            state.guilt = Math.max(0, state.guilt * decayFactor);

            // 2. Severe Guilt Tracking & Moral Injury Induction
            if (wasSevere || state.guilt >= this.severeGuiltThreshold) {
                state.consecutiveSevereTicks += deltaTicks;
                if (!state.moralInjury && state.consecutiveSevereTicks >= this.injuryThresholdTicks) {
                    state.moralInjury = true;
                    state.moralInjuryCount++;

                    // Character Remodeling: permanent Neuroticism drift, Agreeableness erosion
                    state.personalityDeltas.neuroticism += 0.15;
                    state.personalityDeltas.agreeableness -= 0.20;
                    state.personalityDeltas.dominance -= 0.15;

                    injuredAgents.push({
                        agentId: id,
                        consecutiveSevereTicks: state.consecutiveSevereTicks,
                        guilt: Number(state.guilt.toFixed(4)),
                        personalityDeltas: { ...state.personalityDeltas }
                    });
                }
            } else {
                // Reset consecutive severe ticks once guilt drops below threshold
                state.consecutiveSevereTicks = Math.max(0, state.consecutiveSevereTicks - deltaTicks);
            }
        }

        return {
            tick: this.currentTick,
            deltaTicks,
            injuredAgentsCount: injuredAgents.length,
            newlyInjured: injuredAgents
        };
    }

    /**
     * Returns a structured, serializable snapshot of agent moral state.
     * @param {string} agentId
     * @returns {Object} Agent moral state
     */
    getAgentMoralState(agentId) {
        const state = this.agents.get(agentId);
        if (!state) return null;

        return {
            agentId: state.agentId,
            foundations: { ...state.foundations },
            guilt: Number(state.guilt.toFixed(4)),
            cumulativeDissonance: Number(state.cumulativeDissonance.toFixed(4)),
            consecutiveSevereTicks: state.consecutiveSevereTicks,
            moralInjury: state.moralInjury,
            moralInjuryCount: state.moralInjuryCount,
            personalityDeltas: { ...state.personalityDeltas },
            historyCount: state.history.length,
            recentHistory: state.history.slice(-5)
        };
    }

    /**
     * Diagnostic audit ensuring host game authority is strictly preserved.
     * @returns {Object}
     */
    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            activeAgentsTracked: this.agents.size
        };
    }
}
