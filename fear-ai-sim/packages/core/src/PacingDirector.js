/**
 * PacingDirector - Session narrative arc controller & Dynamic Difficulty Adjustment (DDA).
 * Guides player and world affective intensity along a psychological tension curve.
 * Zero wall-clock dependencies; driven purely by simulation ticks.
 */

export const SESSION_PHASES = Object.freeze([
    { name: 'EXPOSITION', startRatio: 0.0, endRatio: 0.10, baseIntensity: 0.2, label: 'Calm Introduction' },
    { name: 'BUILDUP', startRatio: 0.10, endRatio: 0.25, baseIntensity: 0.45, label: 'Rising Tension' },
    { name: 'FIRST_PEAK', startRatio: 0.25, endRatio: 0.35, baseIntensity: 0.75, label: 'Initial Scare & Attack' },
    { name: 'BREATHER', startRatio: 0.35, endRatio: 0.50, baseIntensity: 0.30, label: 'Recovery & Respite' },
    { name: 'ESCALATION', startRatio: 0.50, endRatio: 0.70, baseIntensity: 0.65, label: 'Mounting Dread & Complex Threats' },
    { name: 'CLIMAX', startRatio: 0.70, endRatio: 0.85, baseIntensity: 1.00, label: 'Peak Horror Encounter' },
    { name: 'FALLING_ACTION', startRatio: 0.85, endRatio: 0.95, baseIntensity: 0.40, label: 'Aftermath & Lingering Shock' },
    { name: 'RESOLUTION', startRatio: 0.95, endRatio: 1.00, baseIntensity: 0.15, label: 'Closure or Safety' }
]);

export class PacingDirector {
    /**
     * @param {object} [config={}]
     */
    constructor(config = {}) {
        // Default session length: 36,000 ticks (10 minutes at 60Hz)
        this.totalSessionTicks = config.totalSessionTicks || 36000;
        this.currentTick = 0;
        this.phases = config.phases || SESSION_PHASES;

        // Dynamic metrics for DDA
        this.recentPanicRate = 0;
        this.ddaIntensityModifier = 1.0;
        this.pacingOverride = null;
    }

    /**
     * Advance pacing by deltaTicks
     * @param {number} [deltaTicks=1]
     * @param {object} [observedMetrics={}]
     */
    tick(deltaTicks = 1, observedMetrics = {}) {
        this.currentTick += deltaTicks;

        // Update DDA based on recent panic events or agent stress
        if (typeof observedMetrics.averageFear === 'number') {
            const avgFear = observedMetrics.averageFear;
            // If player/agents are continuously overwhelmed (>0.8 avg fear), ease intensity slightly
            if (avgFear > 0.85) {
                this.ddaIntensityModifier = Math.max(0.7, this.ddaIntensityModifier - 0.002 * deltaTicks);
            } else if (avgFear < 0.25) {
                // If boredom/calm reigns (<0.25 avg fear), boost tension slightly
                this.ddaIntensityModifier = Math.min(1.3, this.ddaIntensityModifier + 0.002 * deltaTicks);
            }
        }
    }

    /**
     * Current session progress ratio in [0, 1]
     * @returns {number}
     */
    getProgress() {
        if (this.totalSessionTicks <= 0) return 0;
        return Math.min(1.0, Math.max(0.0, this.currentTick / this.totalSessionTicks));
    }

    /**
     * Get current phase descriptor
     * @returns {object}
     */
    getCurrentPhase() {
        if (this.pacingOverride) {
            return {
                name: 'OVERRIDE',
                startRatio: 0,
                endRatio: 1,
                baseIntensity: this.pacingOverride,
                label: 'Manual Pacing Override'
            };
        }

        const progress = this.getProgress();
        for (let i = 0; i < this.phases.length; i++) {
            const phase = this.phases[i];
            if (progress >= phase.startRatio && progress <= phase.endRatio) {
                return phase;
            }
        }
        return this.phases[this.phases.length - 1];
    }

    /**
     * Calculate effective narrative intensity multiplier
     * @returns {number} intensity in [0, 1.5]
     */
    getTargetIntensity() {
        if (this.pacingOverride !== null) {
            return this.pacingOverride;
        }

        const phase = this.getCurrentPhase();
        return Math.min(1.5, Math.max(0.05, phase.baseIntensity * this.ddaIntensityModifier));
    }

    setOverride(intensity) {
        this.pacingOverride = intensity === null ? null : Math.max(0, Math.min(1.5, intensity));
    }

    reset() {
        this.currentTick = 0;
        this.recentPanicRate = 0;
        this.ddaIntensityModifier = 1.0;
        this.pacingOverride = null;
    }

    getState() {
        return {
            currentTick: this.currentTick,
            totalSessionTicks: this.totalSessionTicks,
            ddaIntensityModifier: this.ddaIntensityModifier,
            pacingOverride: this.pacingOverride,
            progress: this.getProgress(),
            phase: this.getCurrentPhase().name,
            targetIntensity: this.getTargetIntensity()
        };
    }

    setState(snapshot) {
        if (!snapshot) return;
        this.currentTick = snapshot.currentTick || 0;
        this.totalSessionTicks = snapshot.totalSessionTicks || this.totalSessionTicks;
        this.ddaIntensityModifier = snapshot.ddaIntensityModifier ?? 1.0;
        this.pacingOverride = snapshot.pacingOverride ?? null;
    }
}

export default PacingDirector;
