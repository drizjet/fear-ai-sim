/**
 * HabituationSystem - Deterministic stimulus desensitization engine.
 * Pure tick-based recovery and decay. No wall-clock dependencies.
 */

export const DEFAULT_HABITUATION_CONFIG = Object.freeze({
    habituationRate: 0.08,        // 8% fear reduction per exposure
    maxHabituation: 0.60,         // Max 60% fear reduction
    recoveryRatePerTick: 0.0005,  // Recovery per tick when not exposed (~0.03 per second at 60Hz)
    noveltyBoost: 0.15,           // Bonus resistance for first 3 exposures
    stimulusTypes: Object.freeze({
        PREDATOR: { decayMultiplier: 1.0, recoveryMultiplier: 1.0 },
        SOUND: { decayMultiplier: 0.8, recoveryMultiplier: 1.5 },
        VISUAL: { decayMultiplier: 1.2, recoveryMultiplier: 1.0 },
        GORE: { decayMultiplier: 0.6, recoveryMultiplier: 0.7 },
        SCREAM: { decayMultiplier: 1.5, recoveryMultiplier: 1.2 },
        ENVIRONMENTAL_DREAD: { decayMultiplier: 0.5, recoveryMultiplier: 0.5 }
    })
});

export class HabituationSystem {
    /**
     * @param {object} [config={}]
     */
    constructor(config = {}) {
        this.config = {
            ...DEFAULT_HABITUATION_CONFIG,
            ...config,
            stimulusTypes: {
                ...DEFAULT_HABITUATION_CONFIG.stimulusTypes,
                ...(config.stimulusTypes || {})
            }
        };

        // key -> { count, habituationLevel, lastExposureTick, totalFearReduced }
        this.exposureMap = new Map();
        this.totalExposures = 0;
        this.habituationEvents = 0;
    }

    _getKey(stimulusType, stimulusId) {
        return stimulusId ? `${stimulusType}:${stimulusId}` : stimulusType;
    }

    _getTypeConfig(stimulusType) {
        return this.config.stimulusTypes[stimulusType] || {
            decayMultiplier: 1.0,
            recoveryMultiplier: 1.0
        };
    }

    /**
     * Get habituated fear level
     * @param {number} baseFear - 0..1
     * @param {string} stimulusType
     * @param {string|null} [stimulusId=null]
     * @param {number} [currentTick=0]
     * @returns {number} adjusted fear
     */
    getEffectiveFear(baseFear, stimulusType, stimulusId = null, currentTick = 0) {
        if (baseFear <= 0) return 0;
        const key = this._getKey(stimulusType, stimulusId);
        const typeCfg = this._getTypeConfig(stimulusType);

        let record = this.exposureMap.get(key);
        if (!record) {
            record = {
                count: 0,
                habituationLevel: 0,
                lastExposureTick: currentTick,
                totalFearReduced: 0
            };
            this.exposureMap.set(key, record);
        }

        // Apply tick-based recovery since last exposure
        const ticksSinceLast = Math.max(0, currentTick - record.lastExposureTick);
        if (ticksSinceLast > 0 && record.habituationLevel > 0) {
            const recovery = ticksSinceLast * this.config.recoveryRatePerTick * typeCfg.recoveryMultiplier;
            record.habituationLevel = Math.max(0, record.habituationLevel - recovery);
        }

        // Calculate potential habituation
        const potentialHabituation = Math.min(
            this.config.maxHabituation,
            record.count * (this.config.habituationRate * typeCfg.decayMultiplier)
        );

        // Novelty bonus for early exposures
        let noveltyBonus = 0;
        if (record.count < 3) {
            noveltyBonus = this.config.noveltyBoost * ((3 - record.count) / 3);
        }

        const effectiveHabituation = Math.max(0, potentialHabituation - noveltyBonus);
        const adjustedFear = Math.max(0, baseFear * (1.0 - effectiveHabituation));

        // Update record
        record.count++;
        record.lastExposureTick = currentTick;
        record.habituationLevel = effectiveHabituation;
        record.totalFearReduced += (baseFear - adjustedFear);

        this.totalExposures++;
        if (effectiveHabituation > 0) {
            this.habituationEvents++;
        }

        return adjustedFear;
    }

    /**
     * Advance recovery for all tracked stimuli
     * @param {number} deltaTicks
     */
    tick(deltaTicks = 1) {
        if (deltaTicks <= 0) return;
        for (const [key, record] of this.exposureMap.entries()) {
            const stimulusType = key.split(':')[0];
            const typeCfg = this._getTypeConfig(stimulusType);
            const recovery = deltaTicks * this.config.recoveryRatePerTick * typeCfg.recoveryMultiplier;
            record.habituationLevel = Math.max(0, record.habituationLevel - recovery);
        }
    }

    /**
     * Get habituation ratio for a stimulus (0..maxHabituation)
     * @param {string} stimulusType
     * @param {string|null} [stimulusId=null]
     * @returns {number}
     */
    getHabituationLevel(stimulusType, stimulusId = null) {
        const key = this._getKey(stimulusType, stimulusId);
        const record = this.exposureMap.get(key);
        return record ? record.habituationLevel : 0;
    }

    getState() {
        const entries = [];
        for (const [key, val] of this.exposureMap.entries()) {
            entries.push([key, { ...val }]);
        }
        return {
            totalExposures: this.totalExposures,
            habituationEvents: this.habituationEvents,
            entries
        };
    }

    setState(snapshot) {
        if (!snapshot) return;
        this.totalExposures = snapshot.totalExposures || 0;
        this.habituationEvents = snapshot.habituationEvents || 0;
        this.exposureMap = new Map();
        if (Array.isArray(snapshot.entries)) {
            for (const [k, v] of snapshot.entries) {
                this.exposureMap.set(k, { ...v });
            }
        }
    }
}

export default HabituationSystem;
