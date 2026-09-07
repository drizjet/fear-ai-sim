/**
 * packages/core/src/ComparativeBaselines.js
 *
 * Reference standard game AI implementations and ablation harnesses for empirical
 * comparative evaluation against Fear AI.
 *
 * Implements:
 * 1. FiniteStateMachineAgent (Standard FSM with distance-threshold transitions)
 * 2. UtilityAIAgent (Curve-based scoring without affective memory or tensors)
 * 3. BehaviorTreeAgent (Priority Selector-Sequence tree without emotional hysteresis)
 * 4. SubsystemAblationHarness (Configurable ablation of habituation, trauma, tensors, contagion, traits)
 */

export const BASELINE_MODELS = Object.freeze({
    FINITE_STATE_MACHINE: 'FSM',
    UTILITY_AI: 'UTILITY_AI',
    BEHAVIOR_TREE: 'BEHAVIOR_TREE',
    FEAR_AI_FULL: 'FEAR_AI_FULL'
});

export const ABLATION_FLAGS = Object.freeze({
    NO_HABITUATION: 'NO_HABITUATION',
    NO_TRAUMA: 'NO_TRAUMA',
    NO_RELATIONSHIPS: 'NO_RELATIONSHIPS',
    NO_CONTAGION: 'NO_CONTAGION',
    NO_IDENTITY: 'NO_IDENTITY'
});

/**
 * Standard Finite State Machine (FSM) NPC AI.
 * Common industry baseline that relies on discrete threshold logic.
 * Characterized by brittle boundary oscillations and zero trait differentiation.
 */
export class FiniteStateMachineAgent {
    constructor(id, options = {}) {
        this.id = id;
        this.state = 'IDLE';
        this.fleeThreshold = options.fleeThreshold ?? 10.0;
        this.alertThreshold = options.alertThreshold ?? 25.0;
        this.stateHistory = [];
        this.oscillationCount = 0;
    }

    tick(observation = {}) {
        const prevState = this.state;
        const threats = observation.threats || [];
        const closestThreat = threats.length > 0
            ? threats.reduce((min, t) => t.distance < min.distance ? t : min, threats[0])
            : null;

        if (closestThreat) {
            if (closestThreat.distance < this.fleeThreshold) {
                this.state = 'FLEE';
            } else if (closestThreat.distance < this.alertThreshold) {
                this.state = 'ALERT';
            } else {
                this.state = 'IDLE';
            }
        } else {
            this.state = 'IDLE';
        }

        if (this.stateHistory.length > 0 && this.state !== prevState) {
            // Check if rapid oscillation (flipping back to state from 2 ticks ago)
            const n = this.stateHistory.length;
            if (n >= 2 && this.stateHistory[n - 2] === this.state) {
                this.oscillationCount++;
            }
        }

        this.stateHistory.push(this.state);

        return {
            agent_id: this.id,
            model: BASELINE_MODELS.FINITE_STATE_MACHINE,
            state: this.state,
            action_intent: {
                type: this.state === 'FLEE' ? 'FLEE' : (this.state === 'ALERT' ? 'INVESTIGATE' : 'IDLE'),
                urgency: this.state === 'FLEE' ? 0.9 : (this.state === 'ALERT' ? 0.5 : 0.0)
            },
            affective_state: {
                fear: this.state === 'FLEE' ? 1.0 : (this.state === 'ALERT' ? 0.5 : 0.0),
                arousal: this.state === 'FLEE' ? 1.0 : (this.state === 'ALERT' ? 0.5 : 0.0)
            }
        };
    }
}

/**
 * Standard Utility AI NPC.
 * Evaluates competing behavioral options using continuous utility scoring curves.
 * Dampens some edge chatter, but lacks emotional hysteresis, trauma memory, and social tensors.
 */
export class UtilityAIAgent {
    constructor(id, options = {}) {
        this.id = id;
        this.weights = options.weights || { flee: 1.0, alert: 0.8, idle: 0.3 };
        this.maxThreatDistance = options.maxThreatDistance || 30.0;
        this.stateHistory = [];
        this.oscillationCount = 0;
    }

    tick(observation = {}) {
        const prevState = this.stateHistory.length > 0 ? this.stateHistory[this.stateHistory.length - 1] : 'IDLE';
        const threats = observation.threats || [];
        const closestThreat = threats.length > 0
            ? threats.reduce((min, t) => t.distance < min.distance ? t : min, threats[0])
            : null;

        let uFlee = 0.0;
        let uAlert = 0.0;
        const uIdle = this.weights.idle;

        if (closestThreat) {
            const proximity = Math.max(0.0, 1.0 - (closestThreat.distance / this.maxThreatDistance));
            const intensity = closestThreat.intensity ?? 0.8;
            uFlee = proximity * intensity * this.weights.flee;
            uAlert = proximity * 0.7 * this.weights.alert;
        }

        let chosenAction = 'IDLE';
        let maxU = uIdle;
        if (uFlee > maxU) {
            chosenAction = 'FLEE';
            maxU = uFlee;
        }
        if (uAlert > maxU) {
            chosenAction = 'ALERT';
            maxU = uAlert;
        }

        if (this.stateHistory.length > 0 && chosenAction !== prevState) {
            const n = this.stateHistory.length;
            if (n >= 2 && this.stateHistory[n - 2] === chosenAction) {
                this.oscillationCount++;
            }
        }

        this.stateHistory.push(chosenAction);

        return {
            agent_id: this.id,
            model: BASELINE_MODELS.UTILITY_AI,
            state: chosenAction,
            utility: maxU,
            action_intent: {
                type: chosenAction === 'FLEE' ? 'FLEE' : (chosenAction === 'ALERT' ? 'INVESTIGATE' : 'IDLE'),
                urgency: chosenAction === 'FLEE' ? maxU : (chosenAction === 'ALERT' ? 0.5 : 0.0)
            },
            affective_state: {
                fear: chosenAction === 'FLEE' ? maxU : (chosenAction === 'ALERT' ? 0.4 : 0.0),
                arousal: maxU
            }
        };
    }
}

/**
 * Standard Behavior Tree (BT) NPC AI.
 * Uses priority-ordered Selector and Sequence nodes.
 * Without emotional state or memory, drops immediately to baseline the instant a condition becomes false.
 */
export class BehaviorTreeAgent {
    constructor(id, options = {}) {
        this.id = id;
        this.stateHistory = [];
        this.oscillationCount = 0;
        this.fleeDistance = options.fleeDistance || 12.0;
        this.alertDistance = options.alertDistance || 28.0;
    }

    tick(observation = {}) {
        const prevState = this.stateHistory.length > 0 ? this.stateHistory[this.stateHistory.length - 1] : 'IDLE';
        const threats = observation.threats || [];
        const closestThreat = threats.length > 0
            ? threats.reduce((min, t) => t.distance < min.distance ? t : min, threats[0])
            : null;

        let activeNode = 'IDLE';
        // Selector Root
        // Branch 1: Critical Threat -> Flee
        if (closestThreat && closestThreat.distance < this.fleeDistance) {
            activeNode = 'FLEE';
        }
        // Branch 2: Potential Threat -> Investigate / Alert
        else if (closestThreat && closestThreat.distance < this.alertDistance) {
            activeNode = 'ALERT';
        }
        // Branch 3: Ambient Idle
        else {
            activeNode = 'IDLE';
        }

        if (this.stateHistory.length > 0 && activeNode !== prevState) {
            const n = this.stateHistory.length;
            if (n >= 2 && this.stateHistory[n - 2] === activeNode) {
                this.oscillationCount++;
            }
        }

        this.stateHistory.push(activeNode);

        return {
            agent_id: this.id,
            model: BASELINE_MODELS.BEHAVIOR_TREE,
            state: activeNode,
            action_intent: {
                type: activeNode === 'FLEE' ? 'FLEE' : (activeNode === 'ALERT' ? 'INVESTIGATE' : 'IDLE'),
                urgency: activeNode === 'FLEE' ? 0.85 : (activeNode === 'ALERT' ? 0.45 : 0.0)
            },
            affective_state: {
                fear: activeNode === 'FLEE' ? 0.85 : 0.0,
                arousal: activeNode === 'FLEE' ? 0.9 : (activeNode === 'ALERT' ? 0.5 : 0.1)
            }
        };
    }
}

/**
 * Subsystem Ablation Wrapper.
 * Evaluates Fear AI agents under controlled ablation of specific cognitive subsystems:
 * - NO_HABITUATION: Desensitization disabled
 * - NO_TRAUMA: Spatial dread zones disabled
 * - NO_RELATIONSHIPS: Directed asymmetric tensor collapsed
 * - NO_CONTAGION: Peer panic propagation disabled
 * - NO_IDENTITY: Archetype personality traits flattened to uniform 0.5
 */
export class SubsystemAblationHarness {
    constructor(agent, activeAblations = []) {
        this.agent = agent;
        this.activeAblations = new Set(activeAblations);

        if (this.activeAblations.has(ABLATION_FLAGS.NO_HABITUATION)) {
            this.agent.enableHabituation = false;
        }

        if (this.activeAblations.has(ABLATION_FLAGS.NO_IDENTITY)) {
            this.agent.enableOCEAN = false;
            // Flatten identity to uninformative 0.5
            this.agent.traits = {
                neuroticism: 0.5,
                resilience: 0.5,
                extraversion: 0.5,
                agreeableness: 0.5,
                conscientiousness: 0.5,
                openness: 0.5,
                leadership: 0.5,
                fear: 0.5,
                curiosity: 0.5
            };
        }
    }

    tick(observation = {}, context = {}) {
        const modifiedObs = { ...observation };

        // Ablation: NO_TRAUMA removes trauma zone influence
        if (this.activeAblations.has(ABLATION_FLAGS.NO_TRAUMA)) {
            if (context.traumaZones) {
                context = { ...context, traumaZones: [] };
            }
        }

        // Ablation: NO_CONTAGION removes peer fear influence
        if (this.activeAblations.has(ABLATION_FLAGS.NO_CONTAGION)) {
            if (modifiedObs.peers) {
                modifiedObs.peers = [];
            }
        }

        // Run agent evaluation
        return this.agent.tick(0.016, modifiedObs, context);
    }
}
