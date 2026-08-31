/**
 * 6-State Emotion Model (T3.4)
 * 
 * Expands beyond simple fear to include:
 * - fear: Fight/flight response (0-1)
 * - anger: Aggression level (0-1)
 * - energy: Action capability (0-1)
 * - hunger: Foraging drive (0-1)
 * - thirst: Water seeking (0-1)
 * - boredom: Exploration drive (0-1)
 * 
 * Interactions:
 * - High anger can override fear (berserk mode)
 * - Low energy reduces speed
 * - High boredom + low fear triggers exploration
 */

export class EmotionSystem {
    constructor(config = {}) {
        // Core emotions (0-1 scale)
        this.emotions = {
            fear: config.initialFear || 0,
            anger: config.initialAnger || 0,
            energy: config.initialEnergy || 1.0,
            hunger: config.initialHunger || 0,
            thirst: config.initialThirst || 0,
            boredom: config.initialBoredom || 0
        };

        // Configuration
        this.config = {
            berserkThreshold: config.berserkThreshold || 0.9,  // Anger > 90% triggers berserk
            exhaustionThreshold: config.exhaustionThreshold || 0.2,  // Energy < 20% slows agent
            boredomThreshold: config.boredomThreshold || 0.7,  // Boredom > 70% + low fear = explore
            fearThreshold: config.fearThreshold || 0.3,  // Fear < 30% for exploration
            
            // Decay/growth rates (per frame)
            fearDecay: config.fearDecay || 0.95,
            angerDecay: config.angerDecay || 0.98,
            energyRecovery: config.energyRecovery || 0.001,
            energyDrain: config.energyDrain || 0.0005,
            hungerGrowth: config.hungerGrowth || 0.0003,
            thirstGrowth: config.thirstGrowth || 0.0004,
            boredomGrowth: config.boredomGrowth || 0.0002,
            
            // Interaction multipliers
            panicEnergyDrain: config.panicEnergyDrain || 0.01,
            restEnergyRecovery: config.restEnergyRecovery || 0.005,
            angerFearSuppression: config.angerFearSuppression || 0.5  // Anger reduces fear impact
        };

        // Special states triggered by emotion combinations
        this.specialState = null;
        this.specialStateTimer = 0;
        
        // History for analysis
        this.emotionHistory = [];
        this.maxHistoryLength = 100;
        
        // Dominant emotion tracking
        this.dominantEmotion = 'energy';
        this.emotionVariance = 0;
    }

    /**
     * Update all emotions based on context
     * @param {Object} context - Current situation
     * @param {number} context.threatLevel - Current threat (0-1)
     * @param {boolean} context.isPanicking - Whether agent is in panic
     * @param {boolean} context.isResting - Whether agent is resting
     * @param {boolean} context.hasFood - Whether agent has food
     * @param {boolean} context.hasWater - Whether agent has water
     * @param {boolean} context.isMoving - Whether agent is moving
     * @param {number} context.timeInSameState - Frames in current state
     * @returns {Object} Current emotion state
     */
    update(context = {}) {
        const {
            threatLevel = 0,
            isPanicking = false,
            isResting = false,
            hasFood = false,
            hasWater = false,
            isMoving = false,
            timeInSameState = 0
        } = context;

        // Update fear based on threat
        if (threatLevel > 0) {
            // Anger can suppress fear (fight response)
            const fearResistance = this.emotions.anger * this.config.angerFearSuppression;
            const effectiveThreat = threatLevel * (1 - fearResistance);
            this.emotions.fear = Math.min(1.0, this.emotions.fear + effectiveThreat * 0.1);
        }
        
        // Decay fear over time
        this.emotions.fear *= this.config.fearDecay;

        // Update anger (can be triggered by threats, decay over time)
        if (threatLevel > 0.5 && this.emotions.fear > 0.5) {
            // Fear can turn to anger (fight response activation)
            this.emotions.anger = Math.min(1.0, this.emotions.anger + 0.02);
        }
        this.emotions.anger *= this.config.angerDecay;

        // Update energy
        if (isPanicking) {
            // Panic drains energy fast
            this.emotions.energy = Math.max(0, this.emotions.energy - this.config.panicEnergyDrain);
        } else if (isResting) {
            // Resting recovers energy
            this.emotions.energy = Math.min(1.0, this.emotions.energy + this.config.restEnergyRecovery);
        } else {
            // Normal activity slowly drains energy
            this.emotions.energy = Math.max(0, this.emotions.energy - this.config.energyDrain);
        }

        // Update hunger
        if (!hasFood) {
            this.emotions.hunger = Math.min(1.0, this.emotions.hunger + this.config.hungerGrowth);
        } else {
            // Eating reduces hunger
            this.emotions.hunger = Math.max(0, this.emotions.hunger - 0.1);
        }

        // Update thirst
        if (!hasWater) {
            this.emotions.thirst = Math.min(1.0, this.emotions.thirst + this.config.thirstGrowth);
        } else {
            // Drinking reduces thirst
            this.emotions.thirst = Math.max(0, this.emotions.thirst - 0.15);
        }

        // Update boredom (grows when inactive and not afraid)
        if (!isMoving && this.emotions.fear < 0.3) {
            this.emotions.boredom = Math.min(1.0, this.emotions.boredom + this.config.boredomGrowth);
        } else if (isMoving || this.emotions.fear > 0.5) {
            // Activity or fear reduces boredom
            this.emotions.boredom = Math.max(0, this.emotions.boredom - 0.02);
        }

        // Determine special states based on emotion combinations
        this.updateSpecialState();
        
        // Update dominant emotion
        this.updateDominantEmotion();
        
        // Record history
        this.recordHistory();

        return this.getEmotionState();
    }

    /**
     * Check and update special emotional states
     */
    updateSpecialState() {
        const prevState = this.specialState;

        // Berserk: High anger overrides fear
        if (this.emotions.anger >= this.config.berserkThreshold) {
            this.specialState = 'BERSERK';
            this.specialStateTimer++;
            // In berserk mode, fear is suppressed
            this.emotions.fear *= 0.5;
        }
        // Exhausted: Very low energy
        else if (this.emotions.energy < this.config.exhaustionThreshold) {
            this.specialState = 'EXHAUSTED';
            this.specialStateTimer++;
        }
        // Exploring: High boredom + low fear
        else if (this.emotions.boredom > this.config.boredomThreshold && 
                 this.emotions.fear < this.config.fearThreshold) {
            this.specialState = 'EXPLORING';
            this.specialStateTimer++;
        }
        // Starving: Critical hunger
        else if (this.emotions.hunger > 0.9) {
            this.specialState = 'STARVING';
            this.specialStateTimer++;
        }
        // Dehydrated: Critical thirst
        else if (this.emotions.thirst > 0.9) {
            this.specialState = 'DEHYDRATED';
            this.specialStateTimer++;
        }
        else {
            this.specialState = null;
            this.specialStateTimer = 0;
        }

        return prevState !== this.specialState;
    }

    /**
     * Get current special state
     * @returns {string|null} Current special state or null
     */
    getSpecialState() {
        return this.specialState;
    }

    /**
     * Check if agent is in a specific special state
     * @param {string} state - State to check
     * @returns {boolean}
     */
    isInSpecialState(state) {
        return this.specialState === state;
    }

    /**
     * Get modifier for agent speed based on emotions
     * @returns {number} Speed multiplier (0-1)
     */
    getSpeedModifier() {
        let modifier = 1.0;

        // Exhaustion slows agent
        if (this.emotions.energy < this.config.exhaustionThreshold) {
            modifier *= 0.5;
        }

        // Hunger and thirst reduce effectiveness
        if (this.emotions.hunger > 0.8) {
            modifier *= 0.8;
        }
        if (this.emotions.thirst > 0.8) {
            modifier *= 0.8;
        }

        // Berserk increases speed but reduces control
        if (this.specialState === 'BERSERK') {
            modifier *= 1.3;
        }

        return modifier;
    }

    /**
     * Get fear override status (for anger suppression)
     * @returns {boolean} True if fear is being overridden
     */
    isFearOverridden() {
        return this.specialState === 'BERSERK';
    }

    /**
     * Get effective fear (accounting for anger suppression)
     * @returns {number} Effective fear level
     */
    getEffectiveFear() {
        if (this.isFearOverridden()) {
            return this.emotions.fear * 0.3;  // Suppressed in berserk mode
        }
        return this.emotions.fear;
    }

    /**
     * Trigger an emotion directly (for external events)
     * @param {string} emotion - Emotion to trigger
     * @param {number} amount - Amount to add
     */
    triggerEmotion(emotion, amount) {
        if (this.emotions.hasOwnProperty(emotion)) {
            this.emotions[emotion] = Math.min(1.0, this.emotions[emotion] + amount);
        }
    }

    /**
     * Reduce an emotion (for satisfying needs)
     * @param {string} emotion - Emotion to reduce
     * @param {number} amount - Amount to reduce
     */
    reduceEmotion(emotion, amount) {
        if (this.emotions.hasOwnProperty(emotion)) {
            this.emotions[emotion] = Math.max(0, this.emotions[emotion] - amount);
        }
    }

    /**
     * Get current emotion state
     * @returns {Object} All emotion values and metadata
     */
    getEmotionState() {
        return {
            emotions: { ...this.emotions },
            specialState: this.specialState,
            specialStateTimer: this.specialStateTimer,
            dominantEmotion: this.dominantEmotion,
            emotionVariance: this.emotionVariance,
            speedModifier: this.getSpeedModifier(),
            fearOverridden: this.isFearOverridden(),
            effectiveFear: this.getEffectiveFear()
        };
    }

    /**
     * Get a specific emotion value
     * @param {string} emotion - Emotion name
     * @returns {number} Emotion value
     */
    getEmotion(emotion) {
        return this.emotions[emotion] || 0;
    }

    /**
     * Set a specific emotion value
     * @param {string} emotion - Emotion name
     * @param {number} value - New value (0-1)
     */
    setEmotion(emotion, value) {
        if (this.emotions.hasOwnProperty(emotion)) {
            this.emotions[emotion] = Math.max(0, Math.min(1.0, value));
        }
    }

    /**
     * Update dominant emotion tracking
     */
    updateDominantEmotion() {
        let maxValue = -1;
        let dominant = 'energy';

        for (const [name, value] of Object.entries(this.emotions)) {
            if (value > maxValue) {
                maxValue = value;
                dominant = name;
            }
        }

        this.dominantEmotion = dominant;

        // Calculate variance (how spread out emotions are)
        const values = Object.values(this.emotions);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        this.emotionVariance = Math.sqrt(variance);
    }

    /**
     * Record emotion history
     */
    recordHistory() {
        this.emotionHistory.push({
            timestamp: Date.now(),
            emotions: { ...this.emotions },
            specialState: this.specialState,
            dominant: this.dominantEmotion
        });

        if (this.emotionHistory.length > this.maxHistoryLength) {
            this.emotionHistory.shift();
        }
    }

    /**
     * Get emotion history
     * @returns {Array} History of emotional states
     */
    getHistory() {
        return this.emotionHistory;
    }

    /**
     * Get average emotion over time
     * @param {string} emotion - Emotion to average
     * @param {number} frames - Number of recent frames
     * @returns {number} Average value
     */
    getAverageEmotion(emotion, frames = 60) {
        const recent = this.emotionHistory.slice(-frames);
        if (recent.length === 0) return this.emotions[emotion] || 0;
        
        const sum = recent.reduce((acc, entry) => acc + (entry.emotions[emotion] || 0), 0);
        return sum / recent.length;
    }

    /**
     * Get emotional trend (increasing/decreasing/stable)
     * @param {string} emotion - Emotion to analyze
     * @param {number} window - Time window in frames
     * @returns {string} 'increasing', 'decreasing', or 'stable'
     */
    getEmotionTrend(emotion, window = 30) {
        const history = this.emotionHistory;
        if (history.length < window) return 'stable';

        const recent = history.slice(-window);
        const firstHalf = recent.slice(0, Math.floor(window / 2));
        const secondHalf = recent.slice(Math.floor(window / 2));

        const firstAvg = firstHalf.reduce((sum, e) => sum + e.emotions[emotion], 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, e) => sum + e.emotions[emotion], 0) / secondHalf.length;

        const diff = secondAvg - firstAvg;
        const threshold = 0.05;

        if (diff > threshold) return 'increasing';
        if (diff < -threshold) return 'decreasing';
        return 'stable';
    }

    /**
     * Reset all emotions to default
     */
    reset() {
        this.emotions = {
            fear: 0,
            anger: 0,
            energy: 1.0,
            hunger: 0,
            thirst: 0,
            boredom: 0
        };
        this.specialState = null;
        this.specialStateTimer = 0;
        this.dominantEmotion = 'energy';
        this.emotionVariance = 0;
        this.emotionHistory = [];
    }

    /**
     * Serialize emotion system state
     * @returns {Object} Serialized state
     */
    serialize() {
        return {
            emotions: { ...this.emotions },
            specialState: this.specialState,
            specialStateTimer: this.specialStateTimer,
            dominantEmotion: this.dominantEmotion,
            config: { ...this.config }
        };
    }

    /**
     * Deserialize emotion system state
     * @param {Object} data - Serialized state
     */
    deserialize(data) {
        if (data.emotions) {
            this.emotions = { ...data.emotions };
        }
        if (data.specialState !== undefined) {
            this.specialState = data.specialState;
        }
        if (data.specialStateTimer !== undefined) {
            this.specialStateTimer = data.specialStateTimer;
        }
        if (data.dominantEmotion) {
            this.dominantEmotion = data.dominantEmotion;
        }
    }
}

export default EmotionSystem;
