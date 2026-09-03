/**
 * Fear Pacing / Session Arc Controller
 * Phase 3: Core System Improvements (T3.3)
 * 
 * Structures fear intensity over the play session to create
 * satisfying narrative arc. Based on player experience research
 * and flow state theory.
 */

/**
 * Session phase constants for procedural content generation
 */
export const SESSION_PHASES = {
    EXPOSITION: 'introduction',
    BUILDUP: 'build_tension',
    FIRST_PEAK: 'first_peak',
    RECOVERY: 'recovery_1',
    RISING_ACTION: 'rising_action',
    TENSION: 'climax',
    CLIMAX: 'climax',
    RESOLUTION: 'resolution',
    FALLING_ACTION: 'falling_action'
};

export class SessionArcController {
    constructor(sessionDurationMinutes = 10) {
        this.sessionDuration = sessionDurationMinutes * 60 * 1000; // Convert to ms
        this.startTime = Date.now();
        this.currentPhase = 0;
        
        // Define session phases with narrative structure
        this.phases = [
            {
                name: 'introduction',
                start: 0.0,
                end: 0.10,
                intensity: 0.2,
                description: 'Calm introduction, establish baseline'
            },
            {
                name: 'build_tension',
                start: 0.10,
                end: 0.20,
                intensity: 0.4,
                description: 'Slow build, hint at danger'
            },
            {
                name: 'first_peak',
                start: 0.20,
                end: 0.30,
                intensity: 0.7,
                description: 'Initial scare, first real threat'
            },
            {
                name: 'recovery_1',
                start: 0.30,
                end: 0.40,
                intensity: 0.3,
                description: 'Recovery period, let player breathe'
            },
            {
                name: 'rising_action',
                start: 0.40,
                end: 0.60,
                intensity: 0.6,
                description: 'Escalating tension, multiple threats'
            },
            {
                name: 'climax',
                start: 0.60,
                end: 0.75,
                intensity: 1.0,
                description: 'Maximum intensity, main climax'
            },
            {
                name: 'falling_action',
                start: 0.75,
                end: 0.85,
                intensity: 0.5,
                description: 'Aftermath, lingering tension'
            },
            {
                name: 'resolution',
                start: 0.85,
                end: 1.0,
                intensity: 0.2,
                description: 'Safe resolution, closure'
            }
        ];
        
        // Dynamic difficulty adjustment based on actual player state
        this.playerState = {
            avgFear: 0,
            panicEvents: 0,
            recoveryTime: 0,
            engagementLevel: 0.5 // 0-1
        };
        
        // Adjustment parameters
        this.adjustmentConfig = {
            targetEngagement: 0.6,      // Optimal engagement level
            adjustmentSpeed: 0.1,       // How fast to adjust
            minMultiplier: 0.5,         // Never go below 50%
            maxMultiplier: 1.5          // Never go above 150%
        };
        
        this.currentMultiplier = 1.0;
        
        // Event markers for special moments
        this.eventMarkers = [];
    }

    /**
     * Get current session progress (0-1)
     */
    getProgress() {
        const elapsed = Date.now() - this.startTime;
        return Math.min(1.0, elapsed / this.sessionDuration);
    }

    /**
     * Get current phase info
     */
    getCurrentPhase() {
        const progress = this.getProgress();
        
        for (let i = 0; i < this.phases.length; i++) {
            const phase = this.phases[i];
            if (progress >= phase.start && progress < phase.end) {
                this.currentPhase = i;
                return phase;
            }
        }
        
        // Return last phase if at end
        return this.phases[this.phases.length - 1];
    }

    /**
     * Get intensity multiplier for current session point
     * @returns {number} Multiplier to apply to base fear
     */
    getIntensityMultiplier() {
        const progress = this.getProgress();
        const phase = this.getCurrentPhase();
        
        // Calculate progress within current phase (0-1)
        const phaseProgress = (progress - phase.start) / (phase.end - phase.start);
        
        // Get next phase for interpolation
        const nextPhase = this.phases[this.currentPhase + 1];
        
        let targetIntensity;
        if (nextPhase) {
            // Interpolate between current and next phase
            targetIntensity = phase.intensity + 
                (nextPhase.intensity - phase.intensity) * phaseProgress;
        } else {
            targetIntensity = phase.intensity;
        }
        
        // Apply dynamic adjustment based on player state
        const adjustedIntensity = this.applyDynamicAdjustment(targetIntensity);
        
        return adjustedIntensity;
    }

    /**
     * Apply dynamic difficulty adjustment
     * @param {number} targetIntensity - Base intensity from arc
     */
    applyDynamicAdjustment(targetIntensity) {
        const engagementDelta = this.playerState.engagementLevel - 
                               this.adjustmentConfig.targetEngagement;
        
        // If engagement is too low, increase intensity
        // If engagement is too high, decrease intensity
        const adjustment = -engagementDelta * this.adjustmentConfig.adjustmentSpeed;
        
        this.currentMultiplier += adjustment;
        
        // Clamp to valid range
        this.currentMultiplier = Math.max(
            this.adjustmentConfig.minMultiplier,
            Math.min(this.adjustmentConfig.maxMultiplier, this.currentMultiplier)
        );
        
        return targetIntensity * this.currentMultiplier;
    }

    /**
     * Scale fear value based on session arc
     * @param {number} baseFear - Original fear value
     * @returns {number} Scaled fear value
     */
    scaleFear(baseFear) {
        const multiplier = this.getIntensityMultiplier();
        return Math.min(1.0, baseFear * multiplier);
    }

    /**
     * Update player state for dynamic adjustment
     * @param {Object} state - Current player/agent state
     */
    updatePlayerState(state) {
        this.playerState = {
            ...this.playerState,
            ...state
        };
    }

    /**
     * Check if current phase expects high intensity
     * Useful for spawning decisions
     */
    isHighIntensityPhase() {
        const phase = this.getCurrentPhase();
        return phase.intensity > 0.6;
    }

    /**
     * Check if current phase is recovery (low intensity)
     */
    isRecoveryPhase() {
        const phaseName = this.getCurrentPhase().name;
        return phaseName.includes('recovery') || phaseName === 'resolution';
    }

    /**
     * Get recommended threat level for spawning
     * @returns {number} 0-1 recommended threat intensity
     */
    getRecommendedThreatLevel() {
        const multiplier = this.getIntensityMultiplier();
        
        // Map multiplier to threat level
        if (multiplier > 0.8) return 1.0;  // Spawn intense threats
        if (multiplier > 0.5) return 0.6;  // Spawn moderate threats
        return 0.3;                         // Spawn light threats
    }

    /**
     * Mark a significant event in the session
     * @param {string} eventType - Type of event
     * @param {Object} data - Event data
     */
    markEvent(eventType, data = {}) {
        this.eventMarkers.push({
            timestamp: Date.now(),
            progress: this.getProgress(),
            phase: this.getCurrentPhase().name,
            type: eventType,
            data
        });
    }

    /**
     * Get session summary
     */
    getSummary() {
        const progress = this.getProgress();
        const currentPhase = this.getCurrentPhase();
        
        return {
            progress: (progress * 100).toFixed(1) + '%',
            currentPhase: currentPhase.name,
            intensity: (this.getIntensityMultiplier() * 100).toFixed(1) + '%',
            adjustmentMultiplier: this.currentMultiplier.toFixed(2),
            timeRemaining: Math.max(0, this.sessionDuration - (Date.now() - this.startTime)),
            events: this.eventMarkers.length,
            playerEngagement: (this.playerState.engagementLevel * 100).toFixed(1) + '%'
        };
    }

    /**
     * Get upcoming phase info (next 2 phases)
     */
    getUpcomingPhases() {
        const upcoming = [];
        for (let i = this.currentPhase + 1; i < Math.min(this.phases.length, this.currentPhase + 3); i++) {
            upcoming.push(this.phases[i]);
        }
        return upcoming;
    }

    /**
     * Skip to a specific phase (for testing/debugging)
     * @param {string} phaseName - Name of phase to skip to
     */
    skipToPhase(phaseName) {
        const phase = this.phases.find(p => p.name === phaseName);
        if (phase) {
            const targetTime = this.startTime + (phase.start * this.sessionDuration);
            const timeDelta = Date.now() - targetTime;
            this.startTime -= timeDelta; // Adjust start time
        }
    }

    /**
     * Extend or shorten session duration
     * @param {number} newDurationMinutes - New duration in minutes
     */
    setDuration(newDurationMinutes) {
        const oldDuration = this.sessionDuration;
        this.sessionDuration = newDurationMinutes * 60 * 1000;
        
        // Adjust start time to maintain current progress
        const currentProgress = (Date.now() - this.startTime) / oldDuration;
        this.startTime = Date.now() - (currentProgress * this.sessionDuration);
    }

    /**
     * Reset session
     */
    reset() {
        this.startTime = Date.now();
        this.currentPhase = 0;
        this.currentMultiplier = 1.0;
        this.eventMarkers = [];
        this.playerState = {
            avgFear: 0,
            panicEvents: 0,
            recoveryTime: 0,
            engagementLevel: 0.5
        };
    }

    /**
     * Export session data for analysis
     */
    export() {
        return {
            phases: this.phases,
            eventMarkers: this.eventMarkers,
            finalPlayerState: this.playerState,
            summary: this.getSummary()
        };
    }
}