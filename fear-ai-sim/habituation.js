/**
 * Habituation System
 * Phase 3: Core System Improvements (T3.2)
 * 
 * Reduces fear response to repeated stimuli over time.
 * Maintains novelty and engagement by preventing fear desensitization.
 * 
 * Research-backed: Same stimuli lose effectiveness over repeated exposure.
 */

export class HabituationSystem {
    constructor() {
        // Stimulus exposure tracking: stimulusType -> exposureData
        this.exposureMap = new Map();
        
        // Habituation parameters
        this.config = {
            habituationRate: 0.08,        // 8% reduction per exposure
            maxHabituation: 0.60,          // Max 60% fear reduction
            recoveryRate: 0.02,            // Recovery per minute
            noveltyBoost: 0.15,            // Bonus for new stimulus variants
            stimulusTypes: {
                PREDATOR: { decaySpeed: 1.0, recoverySpeed: 1.0 },
                PHEROMONE: { decaySpeed: 1.5, recoverySpeed: 2.0 },
                SOUND: { decaySpeed: 0.8, recoverySpeed: 1.5 },
                VISUAL: { decaySpeed: 1.2, recoverySpeed: 1.0 },
                MEMORY: { decaySpeed: 0.5, recoverySpeed: 0.5 },
                GROUP_PANIC: { decaySpeed: 2.0, recoverySpeed: 1.0 }
            }
        };
        
        // Track session-wide habituation trends
        this.sessionStats = {
            totalExposures: 0,
            uniqueStimuli: 0,
            habituationEvents: 0,
            recoveryEvents: 0
        };
    }

    /**
     * Get effective fear after applying habituation
     * @param {number} baseFear - Original fear value (0-1)
     * @param {string} stimulusType - Type of stimulus
     * @param {string} stimulusId - Unique identifier for specific stimulus
     * @returns {number} Adjusted fear value
     */
    getEffectiveFear(baseFear, stimulusType, stimulusId = null) {
        const typeConfig = this.config.stimulusTypes[stimulusType] || 
                          this.config.stimulusTypes.VISUAL;
        
        // Create compound key if stimulusId provided
        const key = stimulusId ? `${stimulusType}:${stimulusId}` : stimulusType;
        
        // Get or create exposure data
        let exposure = this.exposureMap.get(key);
        if (!exposure) {
            exposure = {
                count: 0,
                habituationLevel: 0,
                lastExposure: 0,
                firstExposure: Date.now(),
                totalFearReduced: 0
            };
            this.exposureMap.set(key, exposure);
            this.sessionStats.uniqueStimuli++;
        }
        
        // Apply recovery since last exposure
        const timeSinceLast = Date.now() - exposure.lastExposure;
        this.applyRecovery(key, timeSinceLast);
        
        // Calculate habituation
        const adjustedRate = this.config.habituationRate * typeConfig.decaySpeed;
        const potentialHabituation = Math.min(
            this.config.maxHabituation,
            exposure.count * adjustedRate
        );
        
        // Apply novelty boost for first few exposures of similar types
        let noveltyBonus = 0;
        if (exposure.count < 3) {
            noveltyBonus = this.config.noveltyBoost * (3 - exposure.count) / 3;
        }
        
        // Calculate effective habituation
        const effectiveHabituation = Math.max(0, potentialHabituation - noveltyBonus);
        
        // Apply to fear
        const adjustedFear = baseFear * (1 - effectiveHabituation);
        
        // Update exposure data
        exposure.count++;
        exposure.lastExposure = Date.now();
        exposure.habituationLevel = effectiveHabituation;
        exposure.totalFearReduced += baseFear - adjustedFear;
        
        this.sessionStats.totalExposures++;
        if (effectiveHabituation > 0) {
            this.sessionStats.habituationEvents++;
        }
        
        return Math.max(0, adjustedFear);
    }

    /**
     * Apply recovery over time
     * @param {string} key - Stimulus key
     * @param {number} timeDelta - Time since last exposure (ms)
     */
    applyRecovery(key, timeDelta) {
        const exposure = this.exposureMap.get(key);
        if (!exposure || exposure.habituationLevel <= 0) return;
        
        // Convert to minutes
        const minutes = timeDelta / (1000 * 60);
        
        // Get stimulus type for recovery speed
        const typeKey = key.split(':')[0];
        const typeConfig = this.config.stimulusTypes[typeKey] || 
                          this.config.stimulusTypes.VISUAL;
        
        // Calculate recovery amount
        const recoveryAmount = this.config.recoveryRate * typeConfig.recoverySpeed * minutes;
        
        // Apply recovery
        const oldLevel = exposure.habituationLevel;
        exposure.habituationLevel = Math.max(0, exposure.habituationLevel - recoveryAmount);
        
        if (oldLevel > exposure.habituationLevel) {
            this.sessionStats.recoveryEvents++;
        }
    }

    /**
     * Reset habituation for a specific stimulus
     * @param {string} stimulusType - Type to reset
     * @param {string} stimulusId - Specific ID (optional)
     */
    resetHabituation(stimulusType, stimulusId = null) {
        if (stimulusId) {
            const key = `${stimulusType}:${stimulusId}`;
            this.exposureMap.delete(key);
        } else {
            // Reset all of this type
            for (const key of this.exposureMap.keys()) {
                if (key.startsWith(stimulusType)) {
                    this.exposureMap.delete(key);
                }
            }
        }
    }

    /**
     * Get habituation info for a stimulus
     * @param {string} stimulusType - Type of stimulus
     * @param {string} stimulusId - Specific ID (optional)
     * @returns {Object} Habituation data
     */
    getHabituationInfo(stimulusType, stimulusId = null) {
        const key = stimulusId ? `${stimulusType}:${stimulusId}` : stimulusType;
        const exposure = this.exposureMap.get(key);
        
        if (!exposure) {
            return {
                isHabituated: false,
                habituationLevel: 0,
                exposures: 0,
                fearReduction: 0
            };
        }
        
        // Apply pending recovery
        const timeSinceLast = Date.now() - exposure.lastExposure;
        this.applyRecovery(key, timeSinceLast);
        
        return {
            isHabituated: exposure.habituationLevel > 0.1,
            habituationLevel: exposure.habituationLevel,
            exposures: exposure.count,
            fearReduction: exposure.totalFearReduced,
            timeSinceLast: timeSinceLast
        };
    }

    /**
     * Get all habituation data for analysis
     */
    getAllHabituationData() {
        const data = {};
        
        for (const [key, exposure] of this.exposureMap) {
            // Apply recovery before reporting
            const timeSinceLast = Date.now() - exposure.lastExposure;
            this.applyRecovery(key, timeSinceLast);
            
            data[key] = {
                habituationLevel: exposure.habituationLevel,
                exposures: exposure.count,
                totalFearReduced: exposure.totalFearReduced,
                firstExposure: exposure.firstExposure,
                lastExposure: exposure.lastExposure
            };
        }
        
        return data;
    }

    /**
     * Get session statistics
     */
    getSessionStats() {
        const habituatedStimuli = Array.from(this.exposureMap.values())
            .filter(e => e.habituationLevel > 0.1).length;
        
        return {
            ...this.sessionStats,
            habituatedStimuli,
            habituationRate: this.sessionStats.totalExposures > 0 ?
                (this.sessionStats.habituationEvents / this.sessionStats.totalExposures) : 0
        };
    }

    /**
     * Calculate habituation decay over session time
     * Used for fear pacing (T3.3)
     * @param {number} sessionProgress - 0 to 1 (start to end)
     * @returns {number} Global habituation multiplier
     */
    getSessionHabituationMultiplier(sessionProgress) {
        // As session progresses, agents become more habituated globally
        // This allows for escalation in stimulus intensity
        const baseHabituation = 0.1; // 10% base
        const maxAdditional = 0.2;   // Up to 20% more
        
        return baseHabituation + (maxAdditional * sessionProgress);
    }

    /**
     * Apply global session habituation to fear value
     * @param {number} fear - Base fear value
     * @param {number} sessionProgress - Session progress (0-1)
     */
    applySessionHabituation(fear, sessionProgress) {
        const multiplier = this.getSessionHabituationMultiplier(sessionProgress);
        return fear * (1 - multiplier);
    }

    /**
     * Reset entire system
     */
    reset() {
        this.exposureMap.clear();
        this.sessionStats = {
            totalExposures: 0,
            uniqueStimuli: 0,
            habituationEvents: 0,
            recoveryEvents: 0
        };
    }

    /**
     * Export habituation data
     */
    export() {
        return {
            config: this.config,
            exposures: this.getAllHabituationData(),
            sessionStats: this.getSessionStats()
        };
    }
}