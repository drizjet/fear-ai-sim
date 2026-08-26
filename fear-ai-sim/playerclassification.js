/**
 * Player Classification System - T4.3
 * 
 * Classifies players into types based on:
 * - Fear response patterns
 * - Gameplay behavior
 * - Biometric reactions
 * - Engagement metrics
 * 
 * Player Types:
 * - THRILL_SEEKER: High fear tolerance, seeks intense experiences
 * - CHALLENGE_SEEKER: Mastery-oriented, wants to overcome fear
 * - STORY_IMMERSIVE: Emotionally engaged, narrative-focused
 * - CASUAL_EXPLORER: Low intensity, exploratory preference
 * - SOCIAL_PLAYER: Group-oriented, comfort in numbers
 * - ANXIOUS_AVOIDER: High fear sensitivity, needs safety
 * 
 * Research Basis: Player motivation psychology + Fear response profiling
 */

export const PLAYER_TYPES = {
    THRILL_SEEKER: 'THRILL_SEEKER',
    CHALLENGE_SEEKER: 'CHALLENGE_SEEKER',
    STORY_IMMERSIVE: 'STORY_IMMERSIVE',
    CASUAL_EXPLORER: 'CASUAL_EXPLORER',
    SOCIAL_PLAYER: 'SOCIAL_PLAYER',
    ANXIOUS_AVOIDER: 'ANXIOUS_AVOIDER',
    UNKNOWN: 'UNKNOWN'
};

export const FEAR_PROFILES = {
    ADRENALINE_JUNKIE: 'ADRENALINE_JUNKIE',      // Enjoys fear peaks
    STEADY_HANDLER: 'STEADY_HANDLER',            // Consistent under pressure
    RECOVERY_FOCUSED: 'RECOVERY_FOCUSED',          // Prioritizes safety
    EMOTIONALLY_REACTIVE: 'EMOTIONALLY_REACTIVE', // High fear variance
    ADAPTABLE: 'ADAPTABLE'                       // Flexible responses
};

/**
 * Tracks player behavior and fear responses over time
 */
export class PlayerBehaviorTracker {
    constructor(config = {}) {
        this.config = {
            windowSize: config.windowSize || 300,     // 5 minutes of data
            minSamples: config.minSamples || 30,      // Minimum for classification
            ...config
        };

        this.samples = [];
        this.aggregates = {
            fearResponses: [],
            movementPatterns: [],
            engagementLevels: [],
            recoveryTimes: [],
            groupPreferences: []
        };
    }

    /**
     * Record a player behavior sample
     */
    recordSample(sample) {
        const data = {
            timestamp: Date.now(),
            fearLevel: sample.fearLevel || 0,          // 0-1 current fear
            engagement: sample.engagement || 0,        // 0-1 engagement score
            movementSpeed: sample.movementSpeed || 0,  // Current speed
            groupProximity: sample.groupProximity || 0, // Distance to nearest agent
            isExploring: sample.isExploring || false,   // Exploration behavior
            isHiding: sample.isHiding || false,        // Avoidance behavior
            threatFacing: sample.threatFacing || false, // Engaging vs avoiding
            panicDuration: sample.panicDuration || 0,  // Time spent panicking
            recoveryTime: sample.recoveryTime || 0,    // Time to calm down
            deathCount: sample.deathCount || 0,        // Session deaths
            survivalTime: sample.survivalTime || 0     // Time alive
        };

        this.samples.push(data);

        // Keep window bounded
        if (this.samples.length > this.config.windowSize) {
            this.samples.shift();
        }

        // Update aggregates
        this.updateAggregates(data);
    }

    /**
     * Update aggregate statistics
     */
    updateAggregates(data) {
        this.aggregates.fearResponses.push(data.fearLevel);
        this.aggregates.movementPatterns.push(data.movementSpeed);
        this.aggregates.engagementLevels.push(data.engagement);
        
        if (data.recoveryTime > 0) {
            this.aggregates.recoveryTimes.push(data.recoveryTime);
        }
        
        if (data.groupProximity !== undefined) {
            this.aggregates.groupPreferences.push(data.groupProximity);
        }

        // Keep aggregates bounded
        Object.keys(this.aggregates).forEach(key => {
            if (this.aggregates[key].length > this.config.windowSize) {
                this.aggregates[key].shift();
            }
        });
    }

    /**
     * Get behavior metrics
     */
    getMetrics() {
        if (this.samples.length < this.config.minSamples) {
            return null;
        }

        return {
            sampleCount: this.samples.length,
            avgFear: this.average(this.aggregates.fearResponses),
            fearVariance: this.variance(this.aggregates.fearResponses),
            maxFear: Math.max(...this.aggregates.fearResponses),
            avgEngagement: this.average(this.aggregates.engagementLevels),
            avgSpeed: this.average(this.aggregates.movementPatterns),
            avgGroupProximity: this.average(this.aggregates.groupPreferences),
            avgRecoveryTime: this.average(this.aggregates.recoveryTimes) || 0,
            explorationRatio: this.samples.filter(s => s.isExploring).length / this.samples.length,
            hidingRatio: this.samples.filter(s => s.isHiding).length / this.samples.length,
            threatFacingRatio: this.samples.filter(s => s.threatFacing).length / this.samples.length,
            panicRatio: this.samples.reduce((sum, s) => sum + s.panicDuration, 0) / this.samples.length,
            survivalRate: this.calculateSurvivalRate()
        };
    }

    /**
     * Calculate average of array
     */
    average(arr) {
        if (!arr || arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    /**
     * Calculate variance of array
     */
    variance(arr) {
        if (!arr || arr.length < 2) return 0;
        const avg = this.average(arr);
        return this.average(arr.map(x => (x - avg) ** 2));
    }

    /**
     * Calculate survival rate
     */
    calculateSurvivalRate() {
        if (this.samples.length === 0) return 1;
        const recentDeaths = this.samples.filter(s => s.deathCount > 0).length;
        return 1 - (recentDeaths / this.samples.length);
    }

    /**
     * Reset tracker
     */
    reset() {
        this.samples = [];
        this.aggregates = {
            fearResponses: [],
            movementPatterns: [],
            engagementLevels: [],
            recoveryTimes: [],
            groupPreferences: []
        };
    }
}

/**
 * Classifies players into types based on behavior patterns
 */
export class PlayerClassifier {
    constructor(config = {}) {
        this.config = {
            confidenceThreshold: config.confidenceThreshold || 0.6,
            classificationCooldown: config.classificationCooldown || 60000, // 1 min
            ...config
        };

        this.tracker = new PlayerBehaviorTracker(config);
        this.currentClassification = {
            type: PLAYER_TYPES.UNKNOWN,
            confidence: 0,
            fearProfile: null,
            timestamp: 0
        };
        this.classificationHistory = [];
    }

    /**
     * Process new player data
     */
    update(playerData) {
        this.tracker.recordSample(playerData);
        
        // Attempt classification if enough data
        const metrics = this.tracker.getMetrics();
        if (metrics && this.shouldReclassify()) {
            this.classify(metrics);
        }

        return this.getClassification();
    }

    /**
     * Check if we should reclassify
     */
    shouldReclassify() {
        const timeSinceLast = Date.now() - this.currentClassification.timestamp;
        return timeSinceLast >= this.config.classificationCooldown;
    }

    /**
     * Classify player based on metrics
     */
    classify(metrics) {
        const scores = this.calculateTypeScores(metrics);
        
        // Find best match
        let bestType = PLAYER_TYPES.UNKNOWN;
        let bestScore = 0;
        
        for (const [type, score] of Object.entries(scores)) {
            if (score > bestScore) {
                bestScore = score;
                bestType = type;
            }
        }

        // Calculate confidence
        const confidence = this.calculateConfidence(scores, bestScore);
        
        // Determine fear profile
        const fearProfile = this.determineFearProfile(metrics);

        // Update classification
        this.currentClassification = {
            type: bestType,
            confidence,
            fearProfile,
            timestamp: Date.now(),
            metrics
        };

        // Add to history
        this.classificationHistory.push({
            type: bestType,
            confidence,
            timestamp: Date.now()
        });

        return this.currentClassification;
    }

    /**
     * Calculate scores for each player type
     */
    calculateTypeScores(metrics) {
        const scores = {};

        // THRILL_SEEKER: High fear tolerance, low hiding, high engagement
        scores[PLAYER_TYPES.THRILL_SEEKER] = (
            (metrics.avgFear > 0.5 ? 0.3 : 0) +
            (metrics.maxFear > 0.8 ? 0.3 : 0) +
            (metrics.hidingRatio < 0.2 ? 0.2 : 0) +
            (metrics.avgEngagement > 0.7 ? 0.2 : 0)
        );

        // CHALLENGE_SEEKER: High threat facing, good survival, consistent engagement
        scores[PLAYER_TYPES.CHALLENGE_SEEKER] = (
            (metrics.threatFacingRatio > 0.5 ? 0.3 : 0) +
            (metrics.survivalRate > 0.6 ? 0.3 : 0) +
            (metrics.avgEngagement > 0.6 ? 0.2 : 0) +
            (metrics.avgRecoveryTime < 3000 ? 0.2 : 0) // Quick recovery
        );

        // STORY_IMMERSIVE: High engagement, varied fear responses, exploration
        scores[PLAYER_TYPES.STORY_IMMERSIVE] = (
            (metrics.avgEngagement > 0.7 ? 0.3 : 0) +
            (metrics.explorationRatio > 0.4 ? 0.3 : 0) +
            (metrics.fearVariance > 0.1 ? 0.2 : 0) +
            (metrics.avgGroupProximity > 100 ? 0.2 : 0) // Solo exploration
        );

        // CASUAL_EXPLORER: Low fear preference, high exploration, moderate engagement
        scores[PLAYER_TYPES.CASUAL_EXPLORER] = (
            (metrics.avgFear < 0.4 ? 0.3 : 0) +
            (metrics.explorationRatio > 0.5 ? 0.3 : 0) +
            (metrics.maxFear < 0.6 ? 0.2 : 0) +
            (metrics.hidingRatio < 0.3 ? 0.2 : 0)
        );

        // SOCIAL_PLAYER: Stays near others, moderate fear, group-oriented
        scores[PLAYER_TYPES.SOCIAL_PLAYER] = (
            (metrics.avgGroupProximity < 80 ? 0.4 : 0) + // Close to others
            (metrics.avgFear > 0.3 && metrics.avgFear < 0.7 ? 0.3 : 0) +
            (metrics.explorationRatio < 0.4 ? 0.2 : 0) + // Less solo exploration
            (metrics.panicRatio < 0.1 ? 0.1 : 0)
        );

        // ANXIOUS_AVOIDER: High fear, high hiding, low threat facing, long recovery
        scores[PLAYER_TYPES.ANXIOUS_AVOIDER] = (
            (metrics.avgFear > 0.6 ? 0.3 : 0) +
            (metrics.hidingRatio > 0.4 ? 0.3 : 0) +
            (metrics.threatFacingRatio < 0.3 ? 0.2 : 0) +
            (metrics.avgRecoveryTime > 5000 ? 0.2 : 0)
        );

        return scores;
    }

    /**
     * Calculate classification confidence
     */
    calculateConfidence(scores, bestScore) {
        const sortedScores = Object.values(scores).sort((a, b) => b - a);
        const margin = sortedScores[0] - sortedScores[1];
        
        // Confidence based on margin between top two scores
        return Math.min(1.0, margin * 2 + 0.3);
    }

    /**
     * Determine fear response profile
     */
    determineFearProfile(metrics) {
        if (metrics.avgFear > 0.6 && metrics.fearVariance > 0.15) {
            return FEAR_PROFILES.ADRENALINE_JUNKIE;
        }
        if (metrics.fearVariance < 0.1 && metrics.avgFear > 0.3) {
            return FEAR_PROFILES.STEADY_HANDLER;
        }
        if (metrics.hidingRatio > 0.3 || metrics.avgRecoveryTime > 4000) {
            return FEAR_PROFILES.RECOVERY_FOCUSED;
        }
        if (metrics.fearVariance > 0.2) {
            return FEAR_PROFILES.EMOTIONALLY_REACTIVE;
        }
        return FEAR_PROFILES.ADAPTABLE;
    }

    /**
     * Get current classification
     */
    getClassification() {
        return {
            ...this.currentClassification,
            sampleCount: this.tracker.samples.length,
            isConfident: this.currentClassification.confidence >= this.config.confidenceThreshold
        };
    }

    /**
     * Get recommended settings for player type
     */
    getRecommendedSettings() {
        const type = this.currentClassification.type;
        const profile = this.currentClassification.fearProfile;

        const settings = {
            baseIntensity: 0.5,
            maxIntensity: 0.8,
            pacing: 'moderate',
            safetyNet: false,
            groupBonus: false,
            explorationReward: false
        };

        switch (type) {
            case PLAYER_TYPES.THRILL_SEEKER:
                settings.baseIntensity = 0.6;
                settings.maxIntensity = 1.0;
                settings.pacing = 'intense';
                break;
            case PLAYER_TYPES.CHALLENGE_SEEKER:
                settings.baseIntensity = 0.5;
                settings.maxIntensity = 0.9;
                settings.pacing = 'progressive';
                settings.safetyNet = true; // Give them a chance to learn
                break;
            case PLAYER_TYPES.STORY_IMMERSIVE:
                settings.baseIntensity = 0.5;
                settings.maxIntensity = 0.8;
                settings.pacing = 'narrative';
                settings.explorationReward = true;
                break;
            case PLAYER_TYPES.CASUAL_EXPLORER:
                settings.baseIntensity = 0.3;
                settings.maxIntensity = 0.6;
                settings.pacing = 'relaxed';
                settings.safetyNet = true;
                settings.explorationReward = true;
                break;
            case PLAYER_TYPES.SOCIAL_PLAYER:
                settings.baseIntensity = 0.4;
                settings.maxIntensity = 0.7;
                settings.pacing = 'moderate';
                settings.groupBonus = true; // Benefit from being near others
                break;
            case PLAYER_TYPES.ANXIOUS_AVOIDER:
                settings.baseIntensity = 0.3;
                settings.maxIntensity = 0.5;
                settings.pacing = 'gentle';
                settings.safetyNet = true;
                settings.groupBonus = true;
                break;
        }

        // Adjust based on fear profile
        if (profile === FEAR_PROFILES.ADRENALINE_JUNKIE) {
            settings.maxIntensity = Math.min(1.0, settings.maxIntensity + 0.1);
        } else if (profile === FEAR_PROFILES.RECOVERY_FOCUSED) {
            settings.safetyNet = true;
            settings.maxIntensity = Math.max(0.4, settings.maxIntensity - 0.1);
        }

        return settings;
    }

    /**
     * Get classification history
     */
    getHistory() {
        return [...this.classificationHistory];
    }

    /**
     * Get type stability (how consistent classifications have been)
     */
    getTypeStability() {
        if (this.classificationHistory.length < 3) return 0;
        
        const recent = this.classificationHistory.slice(-5);
        const types = recent.map(h => h.type);
        const uniqueTypes = new Set(types).size;
        
        // Stability: 1.0 = all same type, 0.0 = all different
        return 1 - ((uniqueTypes - 1) / types.length);
    }

    /**
     * Reset classifier
     */
    reset() {
        this.tracker.reset();
        this.currentClassification = {
            type: PLAYER_TYPES.UNKNOWN,
            confidence: 0,
            fearProfile: null,
            timestamp: 0
        };
        this.classificationHistory = [];
    }
}

/**
 * Manages player types across multiple players/agents
 */
export class PlayerTypeManager {
    constructor() {
        this.classifiers = new Map(); // playerId -> PlayerClassifier
        this.globalStats = {
            typeDistribution: {},
            totalClassifications: 0
        };
    }

    /**
     * Get or create classifier for player
     */
    getClassifier(playerId) {
        if (!this.classifiers.has(playerId)) {
            this.classifiers.set(playerId, new PlayerClassifier());
        }
        return this.classifiers.get(playerId);
    }

    /**
     * Update player data and get classification
     */
    updatePlayer(playerId, playerData) {
        const classifier = this.getClassifier(playerId);
        const classification = classifier.update(playerData);
        
        // Update global stats
        if (classification && classification.type !== PLAYER_TYPES.UNKNOWN) {
            this.updateGlobalStats(classification.type);
        }

        return classification;
    }

    /**
     * Update global statistics
     */
    updateGlobalStats(type) {
        this.globalStats.typeDistribution[type] = 
            (this.globalStats.typeDistribution[type] || 0) + 1;
        this.globalStats.totalClassifications++;
    }

    /**
     * Get player classification
     */
    getPlayerType(playerId) {
        const classifier = this.classifiers.get(playerId);
        return classifier ? classifier.getClassification() : null;
    }

    /**
     * Get recommended settings for player
     */
    getPlayerSettings(playerId) {
        const classifier = this.classifiers.get(playerId);
        return classifier ? classifier.getRecommendedSettings() : null;
    }

    /**
     * Get global type distribution
     */
    getGlobalDistribution() {
        if (this.globalStats.totalClassifications === 0) return {};
        
        const distribution = {};
        for (const [type, count] of Object.entries(this.globalStats.typeDistribution)) {
            distribution[type] = count / this.globalStats.totalClassifications;
        }
        return distribution;
    }

    /**
     * Get players by type
     */
    getPlayersByType(type) {
        const players = [];
        for (const [id, classifier] of this.classifiers) {
            if (classifier.currentClassification.type === type) {
                players.push(id);
            }
        }
        return players;
    }

    /**
     * Get type summary for all players
     */
    getAllClassifications() {
        const summary = {};
        for (const [id, classifier] of this.classifiers) {
            summary[id] = classifier.getClassification();
        }
        return summary;
    }

    /**
     * Remove player
     */
    removePlayer(playerId) {
        this.classifiers.delete(playerId);
    }

    /**
     * Reset all data
     */
    reset() {
        this.classifiers.clear();
        this.globalStats = {
            typeDistribution: {},
            totalClassifications: 0
        };
    }
}

// Default exports
export default {
    PlayerClassifier,
    PlayerBehaviorTracker,
    PlayerTypeManager,
    PLAYER_TYPES,
    FEAR_PROFILES
};
