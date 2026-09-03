/**
 * Environmental Fear Modifiers (T3.6)
 * 
 * Environmental factors that affect agent fear levels:
 * - Darkness: Increases fear in low light
 * - Weather: Storms, fog increase fear
 * - Terrain: Confined spaces, open fields affect fear differently
 * - Time of day: Night is scarier
 * - Ambient sounds: Unexplained noises boost fear
 */

export class EnvironmentSystem {
    constructor(config = {}) {
        // Environmental conditions (0-1 scale)
        this.conditions = {
            darkness: config.darkness || 0.0,        // 0 = bright, 1 = pitch black
            fogDensity: config.fogDensity || 0.0,    // Visibility reduction
            stormIntensity: config.stormIntensity || 0.0,  // Storm strength
            isNight: config.isNight || false,
            ambientNoise: config.ambientNoise || 0.0,  // Background sound level
            temperature: config.temperature || 0.5,    // 0 = freezing, 1 = hot
            confinedSpace: config.confinedSpace || 0.0,  // Claustrophobia factor
            isolation: config.isolation || 0.0,         // How alone the agent is
        };

        // Configuration
        this.config = {
            // Fear modification rates
            darknessFearRate: config.darknessFearRate || 0.002,
            stormFearRate: config.stormFearRate || 0.003,
            fogFearRate: config.fogFearRate || 0.001,
            nightFearMultiplier: config.nightFearMultiplier || 1.3,
            noiseFearRate: config.noiseFearRate || 0.002,
            temperatureExtremeRate: config.temperatureExtremeRate || 0.001,
            confinedSpaceRate: config.confinedSpaceRate || 0.002,
            isolationFearRate: config.isolationFearRate || 0.001,

            // Thresholds
            darknessThreshold: config.darknessThreshold || 0.6,
            stormThreshold: config.stormThreshold || 0.5,
            fogThreshold: config.fogThreshold || 0.7,
            extremeTempMin: config.extremeTempMin || 0.2,
            extremeTempMax: config.extremeTempMax || 0.8,
            confinedThreshold: config.confinedThreshold || 0.7,

            // Time cycle
            dayLength: config.dayLength || 3600,  // Frames (60fps = 60 seconds)
            nightDuration: config.nightDuration || 0.4,  // % of day that's night
        };

        // Time tracking
        this.timeOfDay = config.startTime || 0;  // 0-1 (0=dawn, 0.5=noon, 1=dusk)
        this.frame = 0;

        // Environmental events
        this.activeEvents = [];

        // Ambient sound sources
        this.soundSources = [];

        // History for trend analysis
        this.conditionHistory = [];
        this.maxHistoryLength = 300;
    }

    /**
     * Update environmental conditions and cycle time
     * @param {number} deltaTime - Time since last update
     */
    update(deltaTime = 1) {
        this.frame += deltaTime;

        // Update day/night cycle
        this.updateDayNightCycle();

        // Update active events
        this.updateEvents(deltaTime);

        // Update ambient sounds
        this.updateAmbientSounds(deltaTime);

        // Record history
        this.recordHistory();

        return this.getEnvironmentalState();
    }

    /**
     * Update day/night cycle
     */
    updateDayNightCycle() {
        const cycle = (this.frame % this.config.dayLength) / this.config.dayLength;
        this.timeOfDay = cycle;

        // Night is centered around 0.5 (midnight)
        // Day is 0.0 (dawn) to 0.25, and 0.75 to 1.0 (dusk)
        const nightStart = 0.5 - (this.config.nightDuration / 2);
        const nightEnd = 0.5 + (this.config.nightDuration / 2);

        this.conditions.isNight = cycle > nightStart && cycle < nightEnd;

        // Calculate darkness based on time
        if (this.conditions.isNight) {
            // Peak darkness at midnight (0.5)
            const distFromMidnight = Math.abs(cycle - 0.5);
            const nightProgress = distFromMidnight / (this.config.nightDuration / 2);
            this.conditions.darkness = 0.7 + (0.3 * (1 - nightProgress));
        } else {
            // Day time
            const distFromNoon = Math.abs(cycle - 0.25);
            if (distFromNoon < 0.25) {
                this.conditions.darkness = 0.0;  // Full daylight
            } else {
                // Dawn/dusk transitions
                this.conditions.darkness = 0.3;
            }
        }
    }

    /**
     * Calculate fear modifier based on environmental conditions
     * @param {Object} agent - Agent context
     * @param {number} agent.baseFear - Agent's current fear level
     * @param {boolean} agent.isIndoors - Whether agent is inside
     * @param {boolean} agent.hasLightSource - Whether agent has light
     * @returns {Object} Fear modification details
     */
    calculateFearModifier(agent = {}) {
        const {
            baseFear = 0.5,
            isIndoors = false,
            hasLightSource = false
        } = agent;

        let fearBoost = 0;
        const modifiers = [];

        // Darkness modifier
        if (this.conditions.darkness > this.config.darknessThreshold && !hasLightSource) {
            const darknessBoost = (this.conditions.darkness - this.config.darknessThreshold) 
                * this.config.darknessFearRate;
            fearBoost += darknessBoost;
            modifiers.push({ type: 'darkness', value: darknessBoost });
        }

        // Night multiplier (applied to existing fear)
        if (this.conditions.isNight) {
            const nightBoost = baseFear * (this.config.nightFearMultiplier - 1);
            fearBoost += nightBoost;
            modifiers.push({ type: 'night', value: nightBoost });
        }

        // Storm modifier
        if (this.conditions.stormIntensity > this.config.stormThreshold) {
            const stormBoost = this.conditions.stormIntensity * this.config.stormFearRate;
            fearBoost += stormBoost;
            modifiers.push({ type: 'storm', value: stormBoost });
        }

        // Fog modifier
        if (this.conditions.fogDensity > this.config.fogThreshold) {
            const fogBoost = this.conditions.fogDensity * this.config.fogFearRate;
            fearBoost += fogBoost;
            modifiers.push({ type: 'fog', value: fogBoost });
        }

        // Temperature extremes
        if (this.conditions.temperature < this.config.extremeTempMin ||
            this.conditions.temperature > this.config.extremeTempMax) {
            const tempBoost = this.config.temperatureExtremeRate;
            fearBoost += tempBoost;
            modifiers.push({ type: 'temperature', value: tempBoost });
        }

        // Confined space (claustrophobia)
        if (isIndoors && this.conditions.confinedSpace > this.config.confinedThreshold) {
            const confinedBoost = this.conditions.confinedSpace * this.config.confinedSpaceRate;
            fearBoost += confinedBoost;
            modifiers.push({ type: 'confined', value: confinedBoost });
        }

        // Isolation
        if (this.conditions.isolation > 0.5) {
            const isolationBoost = this.conditions.isolation * this.config.isolationFearRate;
            fearBoost += isolationBoost;
            modifiers.push({ type: 'isolation', value: isolationBoost });
        }

        // Ambient noise (unexplained sounds)
        if (this.conditions.ambientNoise > 0.3) {
            const noiseBoost = this.conditions.ambientNoise * this.config.noiseFearRate;
            fearBoost += noiseBoost;
            modifiers.push({ type: 'noise', value: noiseBoost });
        }

        // Active events
        for (const event of this.activeEvents) {
            const eventBoost = event.intensity * event.fearModifier;
            fearBoost += eventBoost;
            modifiers.push({ type: event.type, value: eventBoost });
        }

        return {
            fearBoost,
            totalFear: Math.min(1.0, baseFear + fearBoost),
            modifiers,
            dominantModifier: this.getDominantModifier(modifiers)
        };
    }

    /**
     * Get the dominant (largest) fear modifier
     * @param {Array} modifiers - List of modifiers
     * @returns {Object|null} Dominant modifier
     */
    getDominantModifier(modifiers) {
        if (modifiers.length === 0) return null;
        return modifiers.reduce((max, mod) => mod.value > max.value ? mod : max);
    }

    /**
     * Add an environmental event
     * @param {string} type - Event type (thunder, earthquake, etc.)
     * @param {number} intensity - Event intensity (0-1)
     * @param {number} duration - Event duration in frames
     * @param {number} fearModifier - Fear multiplier during event
     */
    addEvent(type, intensity, duration, fearModifier = 0.1) {
        this.activeEvents.push({
            type,
            intensity,
            duration,
            remaining: duration,
            fearModifier
        });
    }

    /**
     * Update active events
     * @param {number} deltaTime - Time delta
     */
    updateEvents(deltaTime) {
        for (let i = this.activeEvents.length - 1; i >= 0; i--) {
            this.activeEvents[i].remaining -= deltaTime;
            if (this.activeEvents[i].remaining <= 0) {
                this.activeEvents.splice(i, 1);
            }
        }
    }

    /**
     * Add an ambient sound source
     * @param {string} type - Sound type
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} radius - Audible radius
     * @param {number} intensity - Sound intensity
     */
    addSoundSource(type, x, y, radius, intensity) {
        this.soundSources.push({
            type,
            x,
            y,
            radius,
            intensity,
            id: Date.now() + Math.random()
        });
    }

    /**
     * Update ambient sounds
     * @param {number} deltaTime - Time delta
     */
    updateAmbientSounds(deltaTime) {
        // Calculate ambient noise based on nearby sound sources
        // This is a simplified version - in reality, would calculate per-agent
        const totalIntensity = this.soundSources.reduce((sum, source) => {
            return sum + source.intensity;
        }, 0);

        this.conditions.ambientNoise = Math.min(1.0, totalIntensity * 0.1);

        // Remove old sound sources periodically
        if (this.frame % 300 === 0) {
            this.soundSources = this.soundSources.filter(source => {
                return source.intensity > 0.01;
            });
        }
    }

    /**
     * Get sound intensity at a specific position
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {number} Sound intensity at position
     */
    getSoundIntensityAt(x, y) {
        let totalIntensity = 0;

        for (const source of this.soundSources) {
            const dist = Math.sqrt((x - source.x) ** 2 + (y - source.y) ** 2);
            if (dist < source.radius) {
                const falloff = 1 - (dist / source.radius);
                totalIntensity += source.intensity * falloff;
            }
        }

        return Math.min(1.0, totalIntensity);
    }

    /**
     * Set weather conditions
     * @param {string} weather - Weather type ('clear', 'rain', 'storm', 'fog')
     * @param {number} intensity - Weather intensity (0-1)
     */
    setWeather(weather, intensity) {
        switch (weather) {
            case 'clear':
                this.conditions.stormIntensity = 0;
                this.conditions.fogDensity = 0;
                break;
            case 'rain':
                this.conditions.stormIntensity = intensity * 0.3;
                this.conditions.fogDensity = intensity * 0.2;
                break;
            case 'storm':
                this.conditions.stormIntensity = intensity;
                this.conditions.fogDensity = intensity * 0.4;
                break;
            case 'fog':
                this.conditions.fogDensity = intensity;
                this.conditions.stormIntensity = 0;
                break;
        }
    }

    /**
     * Get current environmental state
     * @returns {Object} Environmental conditions
     */
    getEnvironmentalState() {
        return {
            conditions: { ...this.conditions },
            timeOfDay: this.timeOfDay,
            isNight: this.conditions.isNight,
            activeEvents: this.activeEvents.length,
            soundSources: this.soundSources.length,
            weather: this.getWeatherDescription()
        };
    }

    /**
     * Get human-readable weather description
     * @returns {string} Weather description
     */
    getWeatherDescription() {
        if (this.conditions.stormIntensity > 0.7) return 'severe_storm';
        if (this.conditions.stormIntensity > 0.3) return 'rain';
        if (this.conditions.fogDensity > 0.6) return 'dense_fog';
        if (this.conditions.fogDensity > 0.3) return 'light_fog';
        if (this.conditions.darkness > 0.8) return 'pitch_black';
        if (this.conditions.darkness > 0.5) return 'dark';
        return 'clear';
    }

    /**
     * Set isolation level for an area
     * @param {number} x - Center X
     * @param {number} y - Center Y
     * @param {number} radius - Radius
     * @param {number} isolation - Isolation level (0-1)
     */
    setIsolationArea(x, y, radius, isolation) {
        // Store isolation zones for per-agent calculation
        this.isolationZones = this.isolationZones || [];
        this.isolationZones.push({ x, y, radius, isolation });
    }

    /**
     * Get isolation level at position
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {number} Isolation level
     */
    getIsolationAt(x, y) {
        if (!this.isolationZones) return this.conditions.isolation;

        let maxIsolation = this.conditions.isolation;

        for (const zone of this.isolationZones) {
            const dist = Math.sqrt((x - zone.x) ** 2 + (y - zone.y) ** 2);
            if (dist < zone.radius) {
                const factor = 1 - (dist / zone.radius);
                maxIsolation = Math.max(maxIsolation, zone.isolation * factor);
            }
        }

        return maxIsolation;
    }

    /**
     * Record condition history
     */
    recordHistory() {
        this.conditionHistory.push({
            timestamp: Date.now(),
            frame: this.frame,
            conditions: { ...this.conditions }
        });

        if (this.conditionHistory.length > this.maxHistoryLength) {
            this.conditionHistory.shift();
        }
    }

    /**
     * Get condition history
     * @returns {Array} History of conditions
     */
    getHistory() {
        return this.conditionHistory;
    }

    /**
     * Serialize environment state
     * @returns {Object} Serialized state
     */
    serialize() {
        return {
            conditions: { ...this.conditions },
            timeOfDay: this.timeOfDay,
            frame: this.frame,
            config: { ...this.config },
            activeEvents: [...this.activeEvents],
            soundSources: [...this.soundSources]
        };
    }

    /**
     * Deserialize environment state
     * @param {Object} data - Serialized state
     */
    deserialize(data) {
        if (data.conditions) {
            this.conditions = { ...data.conditions };
        }
        if (data.timeOfDay !== undefined) {
            this.timeOfDay = data.timeOfDay;
        }
        if (data.frame !== undefined) {
            this.frame = data.frame;
        }
        if (data.config) {
            this.config = { ...data.config };
        }
        if (data.activeEvents) {
            this.activeEvents = [...data.activeEvents];
        }
        if (data.soundSources) {
            this.soundSources = [...data.soundSources];
        }
    }

    /**
     * Reset environment to default state
     */
    reset() {
        this.conditions = {
            darkness: 0.0,
            fogDensity: 0.0,
            stormIntensity: 0.0,
            isNight: false,
            ambientNoise: 0.0,
            temperature: 0.5,
            confinedSpace: 0.0,
            isolation: 0.0
        };
        this.timeOfDay = 0;
        this.frame = 0;
        this.activeEvents = [];
        this.soundSources = [];
        this.isolationZones = [];
        this.conditionHistory = [];
    }
}

export default EnvironmentSystem;
