/**
 * User Calibration System (MSDA - Multi-Source Domain Adaptation)
 * Phase 13: Native Hardening & Research Refinement (T13.6)
 * 
 * Tracks baseline physiological and behavioral data during the first 3 minutes
 * to personalize the Fear and PAD thresholds for the specific user.
 */

export class UserCalibrationSystem {
    constructor() {
        this.isCalibrating = true;
        this.calibrationStartTime = Date.now();
        this.calibrationDuration = 180000; // 3 minutes in ms
        
        this.samples = {
            pupilDiameter: [],
            fearLevels: [],
            reactionTimes: []
        };

        this.baselines = {
            avgPupil: 0,
            stdPupil: 0,
            fearThresholdShift: 0, // Offset to apply to PAD model
            arousalSensitivity: 1.0
        };
    }

    /**
     * Record a sample during the calibration phase
     */
    recordSample(type, value) {
        if (!this.isCalibrating) return;
        
        if (this.samples[type]) {
            this.samples[type].push(value);
        }

        if (Date.now() - this.calibrationStartTime > this.calibrationDuration) {
            this.finalizeCalibration();
        }
    }

    /**
     * Finalize calibration and calculate personal baselines
     */
    finalizeCalibration() {
        this.isCalibrating = false;
        console.log('[CALIBRATION] Phase complete. Calculating personal offsets...');

        // 1. Calculate Pupil Baseline (Differential Entropy prep)
        if (this.samples.pupilDiameter.length > 0) {
            const sum = this.samples.pupilDiameter.reduce((a, b) => a + b, 0);
            this.baselines.avgPupil = sum / this.samples.pupilDiameter.length;
            
            const squareDiffs = this.samples.pupilDiameter.map(v => (v - this.baselines.avgPupil) ** 2);
            this.baselines.stdPupil = Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length);
        }

        // 2. Calculate Fear Threshold Shift
        // If user baseline fear was high during "calm" intro, increase thresholds
        if (this.samples.fearLevels.length > 0) {
            const avgBaselineFear = this.samples.fearLevels.reduce((a, b) => a + b, 0) / this.samples.fearLevels.length;
            this.baselines.fearThresholdShift = avgBaselineFear * 0.2; // Shift thresholds up if naturally anxious
        }

        console.log(`[CALIBRATION] Results: 
            Avg Pupil: ${this.baselines.avgPupil.toFixed(2)}
            Threshold Shift: ${this.baselines.fearThresholdShift.toFixed(2)}`);
    }

    /**
     * Apply personal baseline to a raw fear value
     */
    applyPersonalization(rawFear) {
        // Adjust fear sensitivity based on calibration results
        return Math.max(0, rawFear - this.baselines.fearThresholdShift);
    }

    getBaselines() {
        return this.baselines;
    }
}
