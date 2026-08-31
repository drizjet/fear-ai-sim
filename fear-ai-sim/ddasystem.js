/**
 * Dynamic Difficulty Adjustment (DDA) System (T3.5)
 * 
 * Automatically adjusts simulation difficulty based on player engagement metrics.
 * Maintains flow state by balancing challenge and capability.
 * 
 * Player States:
 * - BORED: Low fear, low engagement → Increase challenge
 * - OVERWHELMED: High fear, low survival → Decrease challenge
 * - FLOW: Optimal fear, high engagement → Maintain current
 * - ADJUSTING: Transitional state
 */

export class DDASystem {
    constructor(config = {}) {
        // Thresholds for player state detection
        this.thresholds = {
            boredomFearMax: config.boredomFearMax || 0.3,
            boredomEngagementMax: config.boredomEngagementMax || 0.4,
            overwhelmedFearMin: config.overwhelmedFearMin || 0.8,
            overwhelmedSurvivalMax: config.overwhelmedSurvivalMax || 0.3,
            flowFearMin: config.flowFearMin || 0.4,
            flowFearMax: config.flowFearMax || 0.7,
            flowEngagementMin: config.flowEngagementMin || 0.6
        };

        // Adjustment parameters
        this.adjustments = {
            boredSpawnMultiplier: config.boredSpawnMultiplier || 1.5,
            boredPredatorMultiplier: config.boredPredatorMultiplier || 1.3,
            boredThreatIncrease: config.boredThreatIncrease || 0.2,
            
            overwhelmedSpawnMultiplier: config.overwhelmedSpawnMultiplier || 0.5,
            overwhelmedCalmBoost: config.overwhelmedCalmBoost || 0.3,
            overwhelmedSafeZoneRadius: config.overwhelmedSafeZoneRadius || 100,
            
            adjustmentSmoothing: config.adjustmentSmoothing || 0.3  // 0-1, higher = smoother changes
        };

        // State tracking
        this.currentState = 'ADJUSTING';
        this.stateHistory = [];
        this.maxHistoryLength = 30;
        this.stateTimer = 0;
        this.minStateDuration = 60;  // Frames before state change

        // Metrics history for trend analysis
        this.metricsHistory = [];
        this.metricsHistoryLength = 120;  // 2 seconds at 60fps

        // Adjustment tracking
        this.totalAdjustments = 0;
        this.adjustmentLog = [];
        this.maxLogLength = 50;

        // Flow state statistics
        this.flowStateTime = 0;
        this.totalTrackedTime = 0;
    }

    /**
     * Assess current player state based on metrics
     * @param {Object} metrics - Current simulation metrics
     * @param {number} metrics.avgFear - Average fear level (0-1)
     * @param {number} metrics.engagement - Engagement score (0-1)
     * @param {number} metrics.survivalRate - Agent survival rate (0-1)
     * @param {number} metrics.avgAdrenaline - Average adrenaline (0-1)
     * @param {number} metrics.panicEvents - Recent panic event count
     * @returns {string} Player state: 'BORED', 'OVERWHELMED', 'FLOW', or 'ADJUSTING'
     */
    assessPlayerState(metrics = {}) {
        const {
            avgFear = 0.5,
            engagement = 0.5,
            survivalRate = 0.5,
            avgAdrenaline = 0.3,
            panicEvents = 0
        } = metrics;

        // Store metrics for trend analysis
        this.recordMetrics(metrics);

        // Check for BORED state
        if (avgFear < this.thresholds.boredomFearMax && 
            engagement < this.thresholds.boredomEngagementMax) {
            return 'BORED';
        }

        // Check for OVERWHELMED state
        if (avgFear > this.thresholds.overwhelmedFearMin && 
            survivalRate < this.thresholds.overwhelmedSurvivalMax) {
            return 'OVERWHELMED';
        }

        // Check for extreme panic
        if (panicEvents > 5 || avgAdrenaline > 0.9) {
            return 'OVERWHELMED';
        }

        // Check for FLOW state
        if (avgFear >= this.thresholds.flowFearMin && 
            avgFear <= this.thresholds.flowFearMax && 
            engagement >= this.thresholds.flowEngagementMin) {
            return 'FLOW';
        }

        return 'ADJUSTING';
    }

    /**
     * Update DDA system and apply adjustments
     * @param {Object} metrics - Current metrics
     * @param {Simulation} simulation - Simulation instance to adjust
     * @returns {Object} Adjustment results
     */
    update(metrics, simulation) {
        const newState = this.assessPlayerState(metrics);
        
        // Enforce minimum state duration to prevent rapid oscillation
        if (newState !== this.currentState) {
            if (this.stateTimer < this.minStateDuration) {
                // Stay in current state
                this.stateTimer++;
                return this.getAdjustmentResult();
            }
            
            // State transition
            this.recordStateTransition(this.currentState, newState);
            this.currentState = newState;
            this.stateTimer = 0;
        } else {
            this.stateTimer++;
        }

        // Track time in flow state
        this.totalTrackedTime++;
        if (this.currentState === 'FLOW') {
            this.flowStateTime++;
        }

        // Apply adjustments based on state
        const adjustments = this.applyAdjustments(simulation);

        return this.getAdjustmentResult(adjustments);
    }

    /**
     * Apply difficulty adjustments to simulation
     * @param {Simulation} simulation - Simulation to adjust
     * @returns {Object} Applied adjustments
     */
    applyAdjustments(simulation) {
        const adjustments = {
            state: this.currentState,
            changes: []
        };

        switch (this.currentState) {
            case 'BORED':
                adjustments.changes = this.applyBoredAdjustments(simulation);
                break;
            case 'OVERWHELMED':
                adjustments.changes = this.applyOverwhelmedAdjustments(simulation);
                break;
            case 'FLOW':
                adjustments.changes = this.applyFlowAdjustments(simulation);
                break;
            default:
                // ADJUSTING: make minor tweaks based on trends
                adjustments.changes = this.applyAdjustingTweaks(simulation);
        }

        if (adjustments.changes.length > 0) {
            this.logAdjustment(adjustments);
        }

        return adjustments;
    }

    /**
     * Apply adjustments when player is bored
     * @param {Simulation} simulation - Simulation to adjust
     * @returns {Array} List of changes made
     */
    applyBoredAdjustments(simulation) {
        const changes = [];

        if (simulation.predatorSpawnRate) {
            const oldRate = simulation.predatorSpawnRate;
            simulation.predatorSpawnRate *= this.adjustments.boredPredatorMultiplier;
            changes.push({
                type: 'INCREASE_PREDATORS',
                property: 'predatorSpawnRate',
                oldValue: oldRate,
                newValue: simulation.predatorSpawnRate,
                reason: 'Player bored - increasing threat'
            });
        }

        if (simulation.foodSpawnRate) {
            const oldRate = simulation.foodSpawnRate;
            simulation.foodSpawnRate *= 0.8;  // Less food, more challenge
            changes.push({
                type: 'DECREASE_FOOD',
                property: 'foodSpawnRate',
                oldValue: oldRate,
                newValue: simulation.foodSpawnRate,
                reason: 'Player bored - reducing resources'
            });
        }

        // Increase threat level globally
        if (simulation.globalThreatLevel !== undefined) {
            simulation.globalThreatLevel = Math.min(1.0, 
                simulation.globalThreatLevel + this.adjustments.boredThreatIncrease);
            changes.push({
                type: 'INCREASE_THREAT',
                property: 'globalThreatLevel',
                oldValue: simulation.globalThreatLevel - this.adjustments.boredThreatIncrease,
                newValue: simulation.globalThreatLevel,
                reason: 'Player bored - increasing global threat'
            });
        }

        return changes;
    }

    /**
     * Apply adjustments when player is overwhelmed
     * @param {Simulation} simulation - Simulation to adjust
     * @returns {Array} List of changes made
     */
    applyOverwhelmedAdjustments(simulation) {
        const changes = [];

        if (simulation.predatorSpawnRate) {
            const oldRate = simulation.predatorSpawnRate;
            simulation.predatorSpawnRate *= this.adjustments.overwhelmedSpawnMultiplier;
            changes.push({
                type: 'DECREASE_PREDATORS',
                property: 'predatorSpawnRate',
                oldValue: oldRate,
                newValue: simulation.predatorSpawnRate,
                reason: 'Player overwhelmed - reducing threat'
            });
        }

        if (simulation.foodSpawnRate) {
            const oldRate = simulation.foodSpawnRate;
            simulation.foodSpawnRate *= 1.5;  // More food to help recovery
            changes.push({
                type: 'INCREASE_FOOD',
                property: 'foodSpawnRate',
                oldValue: oldRate,
                newValue: simulation.foodSpawnRate,
                reason: 'Player overwhelmed - increasing resources'
            });
        }

        // Add temporary safe zones
        if (simulation.addEmergencySafeZone) {
            simulation.addEmergencySafeZone(this.adjustments.overwhelmedSafeZoneRadius);
            changes.push({
                type: 'ADD_SAFE_ZONE',
                property: 'safeZones',
                radius: this.adjustments.overwhelmedSafeZoneRadius,
                reason: 'Player overwhelmed - emergency safe zone added'
            });
        }

        // Reduce global threat
        if (simulation.globalThreatLevel !== undefined) {
            const oldThreat = simulation.globalThreatLevel;
            simulation.globalThreatLevel = Math.max(0, 
                simulation.globalThreatLevel - this.adjustments.overwhelmedCalmBoost);
            changes.push({
                type: 'DECREASE_THREAT',
                property: 'globalThreatLevel',
                oldValue: oldThreat,
                newValue: simulation.globalThreatLevel,
                reason: 'Player overwhelmed - reducing global threat'
            });
        }

        // Calm panicking agents
        if (simulation.calmAgents) {
            const calmedCount = simulation.calmAgents(0.5);  // Calm agents with fear > 0.5
            changes.push({
                type: 'CALM_AGENTS',
                count: calmedCount,
                reason: 'Player overwhelmed - calming agents'
            });
        }

        return changes;
    }

    /**
     * Maintain current settings in flow state
     * @param {Simulation} simulation - Simulation
     * @returns {Array} List of changes (usually empty for FLOW)
     */
    applyFlowAdjustments(simulation) {
        // In flow state, we maintain current settings
        // Only make very minor tweaks based on trends
        const changes = [];

        // Gradually normalize extreme values
        if (simulation.globalThreatLevel !== undefined) {
            if (simulation.globalThreatLevel > 0.6) {
                simulation.globalThreatLevel -= 0.001;
            } else if (simulation.globalThreatLevel < 0.3) {
                simulation.globalThreatLevel += 0.001;
            }
        }

        return changes;
    }

    /**
     * Apply minor tweaks during adjusting state
     * @param {Simulation} simulation - Simulation
     * @returns {Array} List of changes
     */
    applyAdjustingTweaks(simulation) {
        const changes = [];
        const trends = this.getMetricTrends();

        // If fear is trending up rapidly, preemptively reduce threat
        if (trends.fearTrend === 'increasing' && trends.fearSlope > 0.01) {
            if (simulation.globalThreatLevel !== undefined) {
                simulation.globalThreatLevel *= 0.95;
                changes.push({
                    type: 'PREEMPTIVE_REDUCTION',
                    reason: 'Fear trending up rapidly'
                });
            }
        }

        // If engagement is dropping, slightly increase challenge
        if (trends.engagementTrend === 'decreasing' && trends.engagementSlope < -0.01) {
            if (simulation.foodSpawnRate) {
                simulation.foodSpawnRate *= 0.98;
                changes.push({
                    type: 'PREEMPTIVE_INCREASE',
                    reason: 'Engagement dropping'
                });
            }
        }

        return changes;
    }

    /**
     * Record metrics for trend analysis
     * @param {Object} metrics - Metrics to record
     */
    recordMetrics(metrics) {
        this.metricsHistory.push({
            timestamp: Date.now(),
            ...metrics
        });

        if (this.metricsHistory.length > this.metricsHistoryLength) {
            this.metricsHistory.shift();
        }
    }

    /**
     * Get metric trends for predictive adjustment
     * @returns {Object} Trend analysis
     */
    getMetricTrends() {
        if (this.metricsHistory.length < 30) {
            return {
                fearTrend: 'stable',
                fearSlope: 0,
                engagementTrend: 'stable',
                engagementSlope: 0
            };
        }

        const recent = this.metricsHistory.slice(-30);
        const firstHalf = recent.slice(0, 15);
        const secondHalf = recent.slice(15);

        const avg = (arr, key) => arr.reduce((sum, m) => sum + (m[key] || 0), 0) / arr.length;

        const fearFirst = avg(firstHalf, 'avgFear');
        const fearSecond = avg(secondHalf, 'avgFear');
        const fearSlope = fearSecond - fearFirst;

        const engagementFirst = avg(firstHalf, 'engagement');
        const engagementSecond = avg(secondHalf, 'engagement');
        const engagementSlope = engagementSecond - engagementFirst;

        const threshold = 0.02;

        return {
            fearTrend: fearSlope > threshold ? 'increasing' : 
                      fearSlope < -threshold ? 'decreasing' : 'stable',
            fearSlope,
            engagementTrend: engagementSlope > threshold ? 'increasing' : 
                            engagementSlope < -threshold ? 'decreasing' : 'stable',
            engagementSlope
        };
    }

    /**
     * Record state transition
     * @param {string} fromState - Previous state
     * @param {string} toState - New state
     */
    recordStateTransition(fromState, toState) {
        this.stateHistory.push({
            timestamp: Date.now(),
            from: fromState,
            to: toState,
            frame: this.totalTrackedTime
        });

        if (this.stateHistory.length > this.maxHistoryLength) {
            this.stateHistory.shift();
        }
    }

    /**
     * Log adjustment for analysis
     * @param {Object} adjustment - Adjustment details
     */
    logAdjustment(adjustment) {
        this.adjustmentLog.push({
            timestamp: Date.now(),
            frame: this.totalTrackedTime,
            ...adjustment
        });

        this.totalAdjustments++;

        if (this.adjustmentLog.length > this.maxLogLength) {
            this.adjustmentLog.shift();
        }
    }

    /**
     * Get adjustment result object
     * @param {Object} adjustments - Applied adjustments
     * @returns {Object} Result summary
     */
    getAdjustmentResult(adjustments = null) {
        return {
            state: this.currentState,
            stateDuration: this.stateTimer,
            adjustments: adjustments,
            flowPercentage: this.totalTrackedTime > 0 ? 
                (this.flowStateTime / this.totalTrackedTime) : 0,
            trends: this.getMetricTrends()
        };
    }

    /**
     * Get current player state
     * @returns {string} Current state
     */
    getCurrentState() {
        return this.currentState;
    }

    /**
     * Get flow state statistics
     * @returns {Object} Flow statistics
     */
    getFlowStatistics() {
        return {
            flowStateTime: this.flowStateTime,
            totalTrackedTime: this.totalTrackedTime,
            flowPercentage: this.totalTrackedTime > 0 ? 
                (this.flowStateTime / this.totalTrackedTime * 100).toFixed(1) + '%' : '0%',
            totalAdjustments: this.totalAdjustments,
            stateTransitions: this.stateHistory.length
        };
    }

    /**
     * Get adjustment history
     * @returns {Array} Adjustment log
     */
    getAdjustmentHistory() {
        return this.adjustmentLog;
    }

    /**
     * Get state transition history
     * @returns {Array} State transitions
     */
    getStateHistory() {
        return this.stateHistory;
    }

    /**
     * Serialize DDA state
     * @returns {Object} Serialized state
     */
    serialize() {
        return {
            thresholds: { ...this.thresholds },
            currentState: this.currentState,
            stateTimer: this.stateTimer,
            flowStateTime: this.flowStateTime,
            totalTrackedTime: this.totalTrackedTime,
            totalAdjustments: this.totalAdjustments,
            stateHistory: [...this.stateHistory],
            adjustmentLog: [...this.adjustmentLog]
        };
    }

    /**
     * Deserialize DDA state
     * @param {Object} data - Serialized state
     */
    deserialize(data) {
        if (data.thresholds) {
            this.thresholds = { ...data.thresholds };
        }
        if (data.currentState) {
            this.currentState = data.currentState;
        }
        if (data.stateTimer !== undefined) {
            this.stateTimer = data.stateTimer;
        }
        if (data.flowStateTime !== undefined) {
            this.flowStateTime = data.flowStateTime;
        }
        if (data.totalTrackedTime !== undefined) {
            this.totalTrackedTime = data.totalTrackedTime;
        }
        if (data.totalAdjustments !== undefined) {
            this.totalAdjustments = data.totalAdjustments;
        }
        if (data.stateHistory) {
            this.stateHistory = [...data.stateHistory];
        }
        if (data.adjustmentLog) {
            this.adjustmentLog = [...data.adjustmentLog];
        }
    }

    /**
     * Reset DDA system
     */
    reset() {
        this.currentState = 'ADJUSTING';
        this.stateTimer = 0;
        this.stateHistory = [];
        this.metricsHistory = [];
        this.adjustmentLog = [];
        this.totalAdjustments = 0;
        this.flowStateTime = 0;
        this.totalTrackedTime = 0;
    }
}

export default DDASystem;
