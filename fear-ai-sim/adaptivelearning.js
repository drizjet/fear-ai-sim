/**
 * Adaptive Learning System (T4.7)
 * 
 * Machine learning system that learns and adapts to individual player 
 * patterns over time, providing personalized fear experiences.
 * 
 * Features:
 * - Player response pattern learning
 * - Personalized threat intensity curves
 * - Session-to-session adaptation
 * - Long-term memory of player preferences
 * - Reinforcement learning for scenario optimization
 */

import { PLAYER_TYPES } from './playerclassification.js';

/**
 * Learning configuration constants
 */
export const LEARNING_CONFIG = {
    // Learning rates
    shortTermLR: 0.1,      // Quick adaptation to recent behavior
    longTermLR: 0.01,      // Slow, stable preference learning
    
    // Memory windows
    shortTermWindow: 100,   // Last 100 interactions
    longTermWindow: 1000,  // Last 1000 interactions
    
    // Thresholds
    confidenceThreshold: 0.7,  // Minimum confidence for predictions
    adaptationThreshold: 0.3,    // Minimum change to apply adaptation
    
    // Decay rates
    patternDecay: 0.95,    // Decay for old patterns
    preferenceDecay: 0.99  // Slow decay for preferences
};

/**
 * Manages adaptive learning for individual players
 */
export class AdaptiveLearningEngine {
    constructor(playerId, config = {}) {
        this.playerId = playerId;
        this.config = { ...LEARNING_CONFIG, ...config };
        
        // Initialize learning state
        this.learningState = {
            // Pattern recognition
            fearResponsePatterns: [],
            engagementPatterns: [],
            recoveryPatterns: [],
            
            // Preference learning
            preferredIntensity: 0.5,     // 0-1, learned optimal intensity
            preferredPacing: 0.5,        // 0-1, fast vs slow fear buildup
            preferredChallenge: 0.5,      // 0-1, difficulty preference
            
            // Adaptation tracking
            adaptationHistory: [],
            lastAdaptationTime: 0,
            totalInteractions: 0,
            
            // Performance metrics
            accuracy: 0.5,              // Prediction accuracy
            confidence: 0.5,            // Overall confidence
            stability: 0.5              // How consistent is the player
        };
        
        // Fear response model
        this.fearModel = {
            baselineFear: 0.3,         // Player's natural fear level
            fearSensitivity: 1.0,      // Multiplier for fear stimuli
            recoveryRate: 0.5,         // How fast they recover
            habituationRate: 0.3,      // How fast they habituate
            
            // Feature weights for prediction
            weights: {
                previousFear: 0.3,
                stimulusIntensity: 0.4,
                timeSinceThreat: 0.1,
                recentDeaths: 0.2
            }
        };
        
        // Scenario effectiveness tracking
        this.scenarioMemory = new Map();
        this.maxScenariosInMemory = 50;
    }

    /**
     * Record a player interaction for learning
     * @param {Object} interaction - Player interaction data
     */
    recordInteraction(interaction) {
        const {
            timestamp = Date.now(),
            fearLevel = 0,
            stimulusIntensity = 0.01,
            scenarioType = 'UNKNOWN',
            playerAction,
            outcome,
            engagement = 0.5,
            duration = 0
        } = interaction;
        
        // NaN guard: callers may omit fields; never poison learning state with undefined/NaN
        const safeFear = (typeof fearLevel === 'number' && isFinite(fearLevel)) ? fearLevel : 0;
        const safeStimulus = (typeof stimulusIntensity === 'number' && isFinite(stimulusIntensity) && stimulusIntensity > 0) ? stimulusIntensity : 0.01;
        const safeEngagement = (typeof engagement === 'number' && isFinite(engagement)) ? engagement : 0.5;
        
        this.learningState.totalInteractions++;
        
        // Update fear response patterns
        this.learningState.fearResponsePatterns.push({
            timestamp,
            fearLevel: safeFear,
            stimulusIntensity: safeStimulus,
            responseRatio: safeFear / Math.max(0.01, safeStimulus)
        });
        
        // Keep only recent patterns
        if (this.learningState.fearResponsePatterns.length > this.config.shortTermWindow) {
            this.learningState.fearResponsePatterns.shift();
        }
        
        // Update engagement patterns
        this.learningState.engagementPatterns.push({
            timestamp,
            engagement: safeEngagement,
            duration,
            scenarioType
        });
        
        if (this.learningState.engagementPatterns.length > this.config.shortTermWindow) {
            this.learningState.engagementPatterns.shift();
        }
        
        // Update scenario effectiveness
        this.updateScenarioMemory(scenarioType, outcome, engagement);
        
        // Update fear model weights based on prediction error
        this.updateFearModel(interaction);
        
        // Periodically update long-term preferences
        if (this.learningState.totalInteractions % 10 === 0) {
            this.updatePreferences();
        }
    }

    /**
     * Update fear model based on prediction error
     */
    updateFearModel(interaction) {
        const { fearLevel, predictedFear } = interaction;
        
        if (predictedFear === undefined) return;
        
        // Calculate prediction error
        const error = fearLevel - predictedFear;
        
        // Update weights with gradient descent
        const lr = this.config.shortTermLR;
        
        // Simple weight updates based on error
        this.fearModel.weights.previousFear += lr * error * 0.1;
        this.fearModel.weights.stimulusIntensity += lr * error * 0.2;
        this.fearModel.weights.timeSinceThreat += lr * error * 0.05;
        this.fearModel.weights.recentDeaths += lr * error * 0.1;
        
        // Normalize weights
        const totalWeight = Object.values(this.fearModel.weights)
            .reduce((sum, w) => sum + w, 0);
        
        for (const key in this.fearModel.weights) {
            this.fearModel.weights[key] /= totalWeight;
        }
        
        // Update accuracy tracking
        const accuracy = 1 - Math.abs(error);
        this.learningState.accuracy = 
            this.learningState.accuracy * 0.9 + accuracy * 0.1;
    }

    /**
     * Update scenario effectiveness memory
     */
    updateScenarioMemory(scenarioType, outcome, engagement) {
        const existing = this.scenarioMemory.get(scenarioType);
        
        if (existing) {
            // Update with new data using exponential moving average
            existing.effectiveness = 
                existing.effectiveness * 0.8 + engagement * 0.2;
            existing.count++;
            existing.lastUsed = Date.now();
        } else {
            // Add new scenario type
            this.scenarioMemory.set(scenarioType, {
                effectiveness: engagement,
                count: 1,
                lastUsed: Date.now()
            });
        }
        
        // Remove old scenarios if too many
        if (this.scenarioMemory.size > this.maxScenariosInMemory) {
            const oldest = [...this.scenarioMemory.entries()]
                .sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
            this.scenarioMemory.delete(oldest[0]);
        }
    }

    /**
     * Update long-term preferences based on learned patterns
     */
    updatePreferences() {
        // Calculate average response patterns
        if (this.learningState.fearResponsePatterns.length === 0) return;
        
        const avgResponse = this.learningState.fearResponsePatterns.reduce((sum, p) => 
            sum + p.responseRatio, 0) / this.learningState.fearResponsePatterns.length;
        
        // Update preferred intensity based on response
        // High response ratio = lower preferred intensity (they're sensitive)
        const targetIntensity = Math.max(0.2, Math.min(0.9, 
            0.7 - (avgResponse - 1.0) * 0.3));
        
        // Apply long-term learning rate
        const lr = this.config.longTermLR;
        this.learningState.preferredIntensity += 
            lr * (targetIntensity - this.learningState.preferredIntensity);
        
        // Update preferred pacing based on engagement patterns
        if (this.learningState.engagementPatterns.length > 0) {
            const avgEngagement = this.learningState.engagementPatterns.reduce((sum, p) =>
                sum + p.engagement, 0) / this.learningState.engagementPatterns.length;
            
            // High engagement = faster pacing preferred
            const targetPacing = avgEngagement;
            this.learningState.preferredPacing += 
                lr * (targetPacing - this.learningState.preferredPacing);
        }
        
        // Calculate stability (consistency of patterns)
        if (this.learningState.fearResponsePatterns.length > 1) {
            const variance = this.calculateVariance(
                this.learningState.fearResponsePatterns.map(p => p.responseRatio)
            );
            this.learningState.stability = 1 - Math.min(1, variance);
        }
        
        // Update confidence based on data amount and stability
        const dataConfidence = Math.min(1, this.learningState.totalInteractions / 100);
        this.learningState.confidence = 
            (dataConfidence + this.learningState.stability) / 2;
    }

    /**
     * Calculate variance of an array
     */
    calculateVariance(values) {
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        return squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length;
    }

    /**
     * Predict player's fear response to a stimulus
     * @param {Object} context - Current context (stimulus, time, etc.)
     * @returns {Object} Prediction with confidence
     */
    predictFearResponse(context) {
        const {
            previousFear = 0.3,
            stimulusIntensity = 0.5,
            timeSinceThreat = 10,
            recentDeaths = 0
        } = context;
        
        // Calculate weighted prediction
        let predictedFear = 0;
        predictedFear += this.fearModel.weights.previousFear * previousFear;
        predictedFear += this.fearModel.weights.stimulusIntensity * stimulusIntensity * this.fearModel.fearSensitivity;
        predictedFear += this.fearModel.weights.timeSinceThreat * Math.exp(-timeSinceThreat / 30);
        predictedFear += this.fearModel.weights.recentDeaths * Math.min(1, recentDeaths / 3);
        
        // Add baseline fear
        predictedFear = this.fearModel.baselineFear + 
            (predictedFear * (1 - this.fearModel.baselineFear));
        
        // Cap at 1.0
        predictedFear = Math.min(1, predictedFear);
        
        return {
            predictedFear,
            confidence: this.learningState.confidence,
            accuracy: this.learningState.accuracy
        };
    }

    /**
     * Get personalized scenario recommendations
     * @returns {Object} Recommended scenario parameters
     */
    getScenarioRecommendations() {
        const pref = this.learningState;
        
        // Adjust based on confidence
        const confidenceMultiplier = Math.max(0.5, pref.confidence);
        
        return {
            intensity: pref.preferredIntensity * confidenceMultiplier,
            pacing: pref.preferredPacing,
            challenge: pref.preferredChallenge,
            
            // Scenario type based on effectiveness memory
            recommendedTypes: this.getEffectiveScenarioTypes(3),
            
            // Adaptation strength
            adaptationStrength: pref.confidence,
            
            // Safety bounds
            minIntensity: Math.max(0.2, pref.preferredIntensity - 0.2),
            maxIntensity: Math.min(1.0, pref.preferredIntensity + 0.2)
        };
    }

    /**
     * Get most effective scenario types
     */
    getEffectiveScenarioTypes(count = 3) {
        const scenarios = [...this.scenarioMemory.entries()]
            .sort((a, b) => b[1].effectiveness - a[1].effectiveness)
            .slice(0, count)
            .map(([type, data]) => ({
                type,
                effectiveness: data.effectiveness,
                usageCount: data.count
            }));
        
        return scenarios;
    }

    /**
     * Adapt current scenario based on real-time feedback
     * @param {Object} feedback - Real-time player feedback
     * @returns {Object} Adaptation recommendations
     */
    adaptInRealTime(feedback) {
        const { currentFear, targetFear, timeInScenario } = feedback;
        
        const recommendations = {
            adjustIntensity: 0,
            adjustPacing: 0,
            addSafeZone: false,
            addThreat: false,
            emergencyActions: []
        };
        
        const fearError = currentFear - targetFear;
        
        // If fear is too high
        if (fearError > 0.3) {
            recommendations.adjustIntensity = -0.2;
            recommendations.addSafeZone = true;
            
            if (fearError > 0.5) {
                recommendations.emergencyActions.push('reduce_all_threats');
                recommendations.emergencyActions.push('add_recovery_zone');
            }
        }
        
        // If fear is too low
        if (fearError < -0.3) {
            recommendations.adjustIntensity = 0.15;
            recommendations.addThreat = true;
        }
        
        // If player has been in scenario too long without engagement
        if (timeInScenario > 120 && Math.abs(fearError) < 0.1) {
            recommendations.adjustPacing = 0.2; // Speed up
        }
        
        return recommendations;
    }

    /**
     * Get learning statistics
     */
    getStats() {
        return {
            playerId: this.playerId,
            totalInteractions: this.learningState.totalInteractions,
            accuracy: this.learningState.accuracy,
            confidence: this.learningState.confidence,
            stability: this.learningState.stability,
            preferredIntensity: this.learningState.preferredIntensity,
            preferredPacing: this.learningState.preferredPacing,
            scenariosLearned: this.scenarioMemory.size,
            fearModel: {
                baselineFear: this.fearModel.baselineFear,
                sensitivity: this.fearModel.fearSensitivity,
                recoveryRate: this.fearModel.recoveryRate
            }
        };
    }

    /**
     * Serialize learning state
     */
    serialize() {
        return {
            playerId: this.playerId,
            config: this.config,
            learningState: this.learningState,
            fearModel: this.fearModel,
            scenarioMemory: Array.from(this.scenarioMemory.entries())
        };
    }

    /**
     * Deserialize learning state
     */
    deserialize(data) {
        this.playerId = data.playerId;
        this.config = { ...LEARNING_CONFIG, ...data.config };
        this.learningState = data.learningState;
        this.fearModel = data.fearModel;
        this.scenarioMemory = new Map(data.scenarioMemory);
    }

    /**
     * Reset learning state
     */
    reset() {
        this.learningState = {
            fearResponsePatterns: [],
            engagementPatterns: [],
            recoveryPatterns: [],
            preferredIntensity: 0.5,
            preferredPacing: 0.5,
            preferredChallenge: 0.5,
            adaptationHistory: [],
            lastAdaptationTime: 0,
            totalInteractions: 0,
            accuracy: 0.5,
            confidence: 0.5,
            stability: 0.5
        };
        
        this.scenarioMemory.clear();
        
        this.fearModel = {
            baselineFear: 0.3,
            fearSensitivity: 1.0,
            recoveryRate: 0.5,
            habituationRate: 0.3,
            weights: {
                previousFear: 0.3,
                stimulusIntensity: 0.4,
                timeSinceThreat: 0.1,
                recentDeaths: 0.2
            }
        };
    }
}

/**
 * Manages adaptive learning for multiple players
 */
export class AdaptiveLearningManager {
    constructor() {
        this.engines = new Map();
        this.globalPatterns = {
            typeEffectiveness: new Map(),
            commonPreferences: {
                intensity: 0.5,
                pacing: 0.5,
                challenge: 0.5
            }
        };
    }

    /**
     * Get or create learning engine for player
     */
    getEngine(playerId) {
        if (!this.engines.has(playerId)) {
            this.engines.set(playerId, new AdaptiveLearningEngine(playerId));
        }
        return this.engines.get(playerId);
    }

    /**
     * Record interaction for a player
     */
    recordInteraction(playerId, interaction) {
        const engine = this.getEngine(playerId);
        engine.recordInteraction(interaction);
        
        // Update global patterns
        this.updateGlobalPatterns(playerId, interaction);
    }

    /**
     * Update global learning patterns
     */
    updateGlobalPatterns(playerId, interaction) {
        const { scenarioType, engagement, outcome } = interaction;
        
        // Update type effectiveness globally
        const existing = this.globalPatterns.typeEffectiveness.get(scenarioType);
        if (existing) {
            existing.totalEngagement += engagement;
            existing.count++;
            existing.avgEngagement = existing.totalEngagement / existing.count;
        } else {
            this.globalPatterns.typeEffectiveness.set(scenarioType, {
                totalEngagement: engagement,
                count: 1,
                avgEngagement: engagement
            });
        }
    }

    /**
     * Get global recommendations for new player
     */
    getGlobalRecommendations() {
        const types = [...this.globalPatterns.typeEffectiveness.entries()]
            .sort((a, b) => b[1].avgEngagement - a[1].avgEngagement)
            .slice(0, 3)
            .map(([type, data]) => type);
        
        return {
            recommendedScenarioTypes: types,
            defaultIntensity: this.globalPatterns.commonPreferences.intensity,
            defaultPacing: this.globalPatterns.commonPreferences.pacing
        };
    }

    /**
     * Get all player stats
     */
    getAllStats() {
        const stats = {};
        for (const [playerId, engine] of this.engines) {
            stats[playerId] = engine.getStats();
        }
        return stats;
    }

    /**
     * Serialize all learning data
     */
    serialize() {
        const engines = {};
        for (const [playerId, engine] of this.engines) {
            engines[playerId] = engine.serialize();
        }
        
        return {
            engines,
            globalPatterns: {
                typeEffectiveness: Array.from(this.globalPatterns.typeEffectiveness.entries()),
                commonPreferences: this.globalPatterns.commonPreferences
            }
        };
    }

    /**
     * Deserialize all learning data
     */
    deserialize(data) {
        this.engines.clear();
        
        for (const [playerId, engineData] of Object.entries(data.engines)) {
            const engine = new AdaptiveLearningEngine(playerId);
            engine.deserialize(engineData);
            this.engines.set(playerId, engine);
        }
        
        this.globalPatterns = {
            typeEffectiveness: new Map(data.globalPatterns.typeEffectiveness),
            commonPreferences: data.globalPatterns.commonPreferences
        };
    }

    /**
     * Reset all learning data
     */
    reset() {
        this.engines.clear();
        this.globalPatterns = {
            typeEffectiveness: new Map(),
            commonPreferences: {
                intensity: 0.5,
                pacing: 0.5,
                challenge: 0.5
            }
        };
    }
}

/**
 * Reinforcement learning for scenario optimization
 */
export class ScenarioOptimizer {
    constructor() {
        this.qValues = new Map();  // Q-learning table
        this.learningRate = 0.1;
        this.discountFactor = 0.9;
        this.explorationRate = 0.2;
        
        // State: { fearLevel, playerType, scenarioPhase }
        // Action: { intensityAdjustment, threatAddition, pacingChange }
    }

    /**
     * Get Q-value for state-action pair
     */
    getQValue(state, action) {
        const key = this.getStateActionKey(state, action);
        return this.qValues.get(key) || 0;
    }

    /**
     * Update Q-value based on reward
     */
    updateQValue(state, action, reward, nextState) {
        const key = this.getStateActionKey(state, action);
        const currentQ = this.getQValue(state, action);
        
        // Get max Q-value for next state
        const nextActions = this.getPossibleActions(nextState);
        const maxNextQ = Math.max(...nextActions.map(a => this.getQValue(nextState, a)));
        
        // Q-learning update
        const newQ = currentQ + this.learningRate * 
            (reward + this.discountFactor * maxNextQ - currentQ);
        
        this.qValues.set(key, newQ);
    }

    /**
     * Choose action using epsilon-greedy
     */
    chooseAction(state) {
        const actions = this.getPossibleActions(state);
        
        // Exploration
        if (Math.random() < this.explorationRate) {
            return actions[Math.floor(Math.random() * actions.length)];
        }
        
        // Exploitation
        let bestAction = actions[0];
        let bestQ = this.getQValue(state, bestAction);
        
        for (const action of actions) {
            const q = this.getQValue(state, action);
            if (q > bestQ) {
                bestQ = q;
                bestAction = action;
            }
        }
        
        return bestAction;
    }

    /**
     * Get possible actions for a state
     */
    getPossibleActions(state) {
        return [
            { intensityAdjustment: -0.2, threatAddition: false, pacingChange: 0 },
            { intensityAdjustment: -0.1, threatAddition: false, pacingChange: 0 },
            { intensityAdjustment: 0, threatAddition: false, pacingChange: 0 },
            { intensityAdjustment: 0.1, threatAddition: true, pacingChange: 0.1 },
            { intensityAdjustment: 0.2, threatAddition: true, pacingChange: 0.2 }
        ];
    }

    /**
     * Generate state-action key
     */
    getStateActionKey(state, action) {
        const stateStr = `${state.fearLevel.toFixed(1)}_${state.playerType}_${state.scenarioPhase}`;
        const actionStr = `${action.intensityAdjustment}_${action.threatAddition}_${action.pacingChange}`;
        return `${stateStr}::${actionStr}`;
    }

    /**
     * Learn from episode outcome
     */
    learn(state, action, reward, nextState) {
        this.updateQValue(state, action, reward, nextState);
    }

    /**
     * Decay exploration rate
     */
    decayExploration() {
        this.explorationRate = Math.max(0.05, this.explorationRate * 0.995);
    }

    /**
     * Get optimizer stats
     */
    getStats() {
        return {
            qValuesCount: this.qValues.size,
            learningRate: this.learningRate,
            explorationRate: this.explorationRate
        };
    }
}

export default AdaptiveLearningManager;
