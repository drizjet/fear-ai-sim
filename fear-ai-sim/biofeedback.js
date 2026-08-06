/**
 * Biofeedback Integration Framework (T4.1)
 * 
 * Supports multiple sensor modalities for fear detection:
 * - EEG (Electroencephalography): Brain wave patterns
 * - HRV (Heart Rate Variability): Cardiac arousal
 * - GSR (Galvanic Skin Response): Electrodermal activity
 * - Facial: Webcam-based fear expression detection
 * 
 * Multi-modal fusion for robust fear scoring
 */

/**
 * Base class for biofeedback sensors
 */
export class BiofeedbackSensor {
    constructor(name) {
        this.name = name;
        this.isConnected = false;
        this.lastReading = null;
        this.lastTimestamp = 0;
        this.errorCount = 0;
        this.maxErrors = 5;
    }

    /**
     * Connect to the sensor
     * @returns {Promise<boolean>} Success status
     */
    async connect() {
        throw new Error('Must implement connect()');
    }

    /**
     * Disconnect from the sensor
     */
    disconnect() {
        this.isConnected = false;
    }

    /**
     * Get a reading from the sensor
     * @returns {Promise<number|null>} Reading value (0-1) or null on error
     */
    async getReading() {
        throw new Error('Must implement getReading()');
    }

    /**
     * Check if sensor is available
     * @returns {boolean}
     */
    isAvailable() {
        return this.isConnected;
    }

    /**
     * Record a successful reading
     * @param {number} value - Reading value
     */
    recordSuccess(value) {
        this.lastReading = value;
        this.lastTimestamp = Date.now();
        this.errorCount = 0;
    }

    /**
     * Record an error
     */
    recordError() {
        this.errorCount++;
        if (this.errorCount >= this.maxErrors) {
            this.disconnect();
        }
    }
}

/**
 * EEG Sensor - Brain wave monitoring
 * Detects beta/gamma power for arousal/fear
 */
export class EEGSensor extends BiofeedbackSensor {
    constructor(config = {}) {
        super('EEG');
        this.config = {
            betaBandLow: config.betaBandLow || 13,
            betaBandHigh: config.betaBandHigh || 30,
            gammaBandLow: config.gammaBandLow || 30,
            gammaBandHigh: config.gammaBandHigh || 100,
            samplingRate: config.samplingRate || 256,  // Hz
            windowSize: config.windowSize || 1024,     // samples
            ...config
        };
        
        // Mock data for simulation
        this.mockBetaPower = 0.3;
        this.mockGammaPower = 0.2;
    }

    async connect() {
        // In real implementation, would connect to Muse/Emotiv SDK
        // For now, simulate successful connection
        this.isConnected = true;
        return true;
    }

    async getReading() {
        if (!this.isConnected) return null;

        try {
            // Get beta/gamma band power
            const betaGammaRatio = await this.getBetaGammaPower();
            
            // Higher beta/gamma = higher arousal/fear
            // Normalize to 0-1 range
            const fearScore = Math.min(1.0, Math.max(0, betaGammaRatio * 1.5));
            
            this.recordSuccess(fearScore);
            return fearScore;
        } catch (error) {
            this.recordError();
            return null;
        }
    }

    /**
     * Get beta/gamma power ratio
     * @returns {Promise<number>} Ratio indicating arousal
     */
    async getBetaGammaPower() {
        // Mock implementation - would use FFT on real EEG data
        // Beta (13-30 Hz) and Gamma (30-100 Hz) correlate with arousal
        
        // Simulate realistic patterns
        const baseArousal = 0.3;
        const noise = (Math.random() - 0.5) * 0.2;
        const spike = Math.random() < 0.1 ? Math.random() * 0.4 : 0;
        
        this.mockBetaPower = Math.min(1, Math.max(0, baseArousal + noise + spike));
        this.mockGammaPower = this.mockBetaPower * 0.7;
        
        return (this.mockBetaPower + this.mockGammaPower) / 2;
    }

    /**
     * Get individual band powers
     * @returns {Promise<Object>} Band powers
     */
    async getBandPowers() {
        return {
            delta: 0.2,  // 0.5-4 Hz
            theta: 0.25, // 4-8 Hz
            alpha: 0.3,  // 8-13 Hz
            beta: this.mockBetaPower,
            gamma: this.mockGammaPower
        };
    }
}

/**
 * HRV Sensor - Heart rate variability
 * Low HRV indicates stress/fear
 */
export class HRVSensor extends BiofeedbackSensor {
    constructor(config = {}) {
        super('HRV');
        this.config = {
            windowSize: config.windowSize || 60,  // seconds
            sampleRate: config.sampleRate || 1,   // Hz
            baselineRMSSD: config.baselineRMSSD || 50,  // ms
            ...config
        };
        
        this.heartbeats = [];
        this.mockRMSSD = 50;
    }

    async connect() {
        // Would connect to Polar H10 or similar
        this.isConnected = true;
        return true;
    }

    async getReading() {
        if (!this.isConnected) return null;

        try {
            const rmssd = await this.getRMSSD();
            
            // Lower RMSSD = higher stress/fear
            // Invert and normalize
            const normalized = Math.max(0, Math.min(1, 
                1 - (rmssd / this.config.baselineRMSSD)
            ));
            
            this.recordSuccess(normalized);
            return normalized;
        } catch (error) {
            this.recordError();
            return null;
        }
    }

    /**
     * Get RMSSD (Root Mean Square of Successive Differences)
     * @returns {Promise<number>} RMSSD value
     */
    async getRMSSD() {
        // Mock implementation
        // Real implementation would analyze R-R intervals
        
        const stressFactor = Math.random() * 0.5;  // 0 = relaxed, 1 = stressed
        this.mockRMSSD = this.config.baselineRMSSD * (1 - stressFactor * 0.6);
        
        return this.mockRMSSD;
    }

    /**
     * Add a heartbeat (for real-time monitoring)
     * @param {number} timestamp - Beat timestamp
     */
    addHeartbeat(timestamp) {
        this.heartbeats.push(timestamp);
        
        // Keep only recent beats
        const cutoff = Date.now() - (this.config.windowSize * 1000);
        this.heartbeats = this.heartbeats.filter(t => t > cutoff);
    }

    /**
     * Get heart rate
     * @returns {number} BPM
     */
    getHeartRate() {
        if (this.heartbeats.length < 2) return 60;
        
        const windowSeconds = (Date.now() - this.heartbeats[0]) / 1000;
        return (this.heartbeats.length / windowSeconds) * 60;
    }
}

/**
 * GSR Sensor - Galvanic Skin Response
 * Measures electrodermal activity (sweating)
 */
export class GSRSensor extends BiofeedbackSensor {
    constructor(config = {}) {
        super('GSR');
        this.config = {
            samplingRate: config.samplingRate || 10,  // Hz
            baseline: config.baseline || 0.5,
            threshold: config.threshold || 0.3,
            ...config
        };
        
        this.readings = [];
        this.mockConductance = 0.5;
    }

    async connect() {
        // Would connect to Empatica E4 or similar
        this.isConnected = true;
        return true;
    }

    async getReading() {
        if (!this.isConnected) return null;

        try {
            const phasic = await this.getPhasicResponse();
            
            // Higher phasic response = higher arousal
            const normalized = Math.min(1, Math.max(0, phasic * 2));
            
            this.recordSuccess(normalized);
            return normalized;
        } catch (error) {
            this.recordError();
            return null;
        }
    }

    /**
     * Get phasic (rapid) component of GSR
     * @returns {Promise<number>} Phasic response
     */
    async getPhasicResponse() {
        // Mock implementation
        // Real: Decompose signal into tonic (baseline) and phasic (rapid) components
        
        const arousal = Math.random();
        this.mockConductance = 0.3 + (arousal * 0.5);
        
        // Phasic spikes when aroused
        const phasic = arousal > 0.6 ? (arousal - 0.6) * 2.5 : 0;
        
        return phasic;
    }

    /**
     * Get tonic (baseline) level
     * @returns {number} Baseline conductance
     */
    getTonicLevel() {
        return this.mockConductance;
    }

    /**
     * Detect GSR spikes (significant events)
     * @returns {Array} Detected spikes
     */
    detectSpikes() {
        const spikes = [];
        for (let i = 1; i < this.readings.length; i++) {
            const diff = this.readings[i] - this.readings[i-1];
            if (diff > this.config.threshold) {
                spikes.push({
                    timestamp: Date.now(),
                    amplitude: diff
                });
            }
        }
        return spikes;
    }
}

/**
 * Facial Sensor - Webcam-based fear detection
 * Analyzes facial expressions for fear indicators
 */
export class FacialSensor extends BiofeedbackSensor {
    constructor(config = {}) {
        super('Facial');
        this.config = {
            detectionInterval: config.detectionInterval || 100,  // ms
            confidenceThreshold: config.confidenceThreshold || 0.6,
            ...config
        };
        
        this.isTracking = false;
        this.lastExpression = null;
    }

    async connect() {
        // Would initialize webcam and face detection
        try {
            // Mock: assume webcam available
            this.isConnected = true;
            this.isTracking = true;
            return true;
        } catch (error) {
            return false;
        }
    }

    disconnect() {
        super.disconnect();
        this.isTracking = false;
    }

    async getReading() {
        if (!this.isConnected || !this.isTracking) return null;

        try {
            const fearExpression = await this.getFearExpression();
            
            if (fearExpression.confidence < this.config.confidenceThreshold) {
                return null;
            }
            
            this.recordSuccess(fearExpression.intensity);
            return fearExpression.intensity;
        } catch (error) {
            this.recordError();
            return null;
        }
    }

    /**
     * Detect fear expression in current frame
     * @returns {Promise<Object>} Expression data
     */
    async getFearExpression() {
        // Mock implementation
        // Real: Use MediaPipe, Affectiva Affdex, or similar
        
        const expressions = {
            neutral: 0.4,
            fear: Math.random() * 0.6,
            surprise: Math.random() * 0.4,
            anger: Math.random() * 0.2
        };
        
        this.lastExpression = expressions;
        
        return {
            intensity: expressions.fear,
            confidence: 0.7 + (Math.random() * 0.3),
            expressions: expressions
        };
    }

    /**
     * Get all detected expressions
     * @returns {Promise<Object>} All expression scores
     */
    async getAllExpressions() {
        return {
            neutral: 0.3,
            happy: 0.1,
            sad: 0.1,
            angry: 0.1,
            fearful: Math.random() * 0.6,
            disgusted: 0.05,
            surprised: Math.random() * 0.3
        };
    }

    /**
     * Check if face is detected
     * @returns {boolean}
     */
    isFaceDetected() {
        return this.isTracking && Math.random() > 0.1;  // 90% detection rate
    }
}

/**
 * Biofeedback Manager - Multi-modal fear detection
 */
export class BiofeedbackManager {
    constructor(config = {}) {
        this.sensors = {
            eeg: new EEGSensor(config.eeg),
            hrv: new HRVSensor(config.hrv),
            gsr: new GSRSensor(config.gsr),
            facial: new FacialSensor(config.facial)
        };

        // Fusion weights
        this.weights = {
            eeg: config.weights?.eeg ?? 0.4,
            hrv: config.weights?.hrv ?? 0.2,
            gsr: config.weights?.gsr ?? 0.2,
            facial: config.weights?.facial ?? 0.2
        };

        // History for smoothing
        this.history = [];
        this.maxHistoryLength = 10;

        // Calibration
        this.baseline = null;
        this.isCalibrated = false;

        // Statistics
        this.stats = {
            totalReadings: 0,
            successfulReadings: 0,
            failedReadings: 0,
            lastFearScore: 0.5
        };
    }

    /**
     * Initialize all sensors
     * @returns {Promise<Object>} Connection status for each sensor
     */
    async initialize() {
        const results = {};
        
        for (const [name, sensor] of Object.entries(this.sensors)) {
            try {
                results[name] = await sensor.connect();
            } catch (error) {
                results[name] = false;
            }
        }
        
        return results;
    }

    /**
     * Get fear score from all available sensors
     * @returns {Promise<Object>} Fear score and metadata
     */
    async getFearScore() {
        const readings = await Promise.all([
            this.sensors.eeg.getReading(),
            this.sensors.hrv.getReading(),
            this.sensors.gsr.getReading(),
            this.sensors.facial.getReading()
        ]);

        const sensorData = {
            eeg: readings[0],
            hrv: readings[1],
            gsr: readings[2],
            facial: readings[3]
        };

        // Fuse modalities
        const fusedScore = this.fuseModalities(sensorData);
        
        // Apply calibration if available
        const calibratedScore = this.isCalibrated && this.baseline ?
            Math.max(0, fusedScore - this.baseline) / (1 - this.baseline) :
            fusedScore;

        // Smooth with history
        const smoothedScore = this.smoothScore(calibratedScore);

        // Update stats
        this.stats.totalReadings++;
        this.stats.successfulReadings++;
        this.stats.lastFearScore = smoothedScore;

        return {
            fearScore: smoothedScore,
            rawScore: fusedScore,
            sensorData,
            activeSensors: Object.entries(sensorData)
                .filter(([_, v]) => v !== null).length,
            confidence: this.calculateConfidence(sensorData),
            timestamp: Date.now()
        };
    }

    /**
     * Fuse multiple sensor readings into single score
     * @param {Object} readings - Sensor readings
     * @returns {number} Fused score
     */
    fuseModalities(readings) {
        let totalWeight = 0;
        let weightedSum = 0;

        for (const [modality, value] of Object.entries(readings)) {
            if (value !== null && !isNaN(value)) {
                weightedSum += value * this.weights[modality];
                totalWeight += this.weights[modality];
            }
        }

        return totalWeight > 0 ? weightedSum / totalWeight : 0.5;
    }

    /**
     * Calculate confidence based on sensor availability
     * @param {Object} readings - Sensor readings
     * @returns {number} Confidence (0-1)
     */
    calculateConfidence(readings) {
        const availableSensors = Object.values(readings).filter(v => v !== null).length;
        return Math.min(1, availableSensors / 4);
    }

    /**
     * Smooth score using moving average
     * @param {number} score - Current score
     * @returns {number} Smoothed score
     */
    smoothScore(score) {
        this.history.push(score);
        
        if (this.history.length > this.maxHistoryLength) {
            this.history.shift();
        }

        const sum = this.history.reduce((a, b) => a + b, 0);
        return sum / this.history.length;
    }

    /**
     * Calibrate baseline (measure relaxed state)
     * @param {number} duration - Calibration duration in ms
     * @returns {Promise<number>} Baseline level
     */
    async calibrate(duration = 30000) {
        const readings = [];
        const startTime = Date.now();

        while (Date.now() - startTime < duration) {
            const score = await this.getFearScore();
            if (score && typeof score.fearScore === 'number' && !isNaN(score.fearScore)) {
                readings.push(score.fearScore);
            }
            
            // Wait 100ms between readings
            await new Promise(r => setTimeout(r, 100));
        }

        // Need at least 4 readings to calculate quartiles
        if (readings.length < 4) {
            // Fall back to average of all readings
            this.baseline = readings.length > 0 
                ? readings.reduce((a, b) => a + b, 0) / readings.length 
                : 0.3;  // Default baseline
        } else {
            // Calculate baseline as average of lowest quartile
            readings.sort((a, b) => a - b);
            const quartileSize = Math.max(1, Math.floor(readings.length / 4));
            const lowestQuartile = readings.slice(0, quartileSize);
            this.baseline = lowestQuartile.reduce((a, b) => a + b, 0) / lowestQuartile.length;
        }
        
        this.isCalibrated = true;
        return this.baseline;
    }

    /**
     * Get sensor status
     * @returns {Object} Status of each sensor
     */
    getSensorStatus() {
        const status = {};
        for (const [name, sensor] of Object.entries(this.sensors)) {
            status[name] = {
                connected: sensor.isConnected,
                lastReading: sensor.lastReading,
                lastTimestamp: sensor.lastTimestamp,
                errorCount: sensor.errorCount
            };
        }
        return status;
    }

    /**
     * Set fusion weights
     * @param {Object} weights - New weights
     */
    setWeights(weights) {
        this.weights = { ...this.weights, ...weights };
        
        // Normalize to sum to 1
        const sum = Object.values(this.weights).reduce((a, b) => a + b, 0);
        if (sum > 0) {
            for (const key of Object.keys(this.weights)) {
                this.weights[key] /= sum;
            }
        }
    }

    /**
     * Get statistics
     * @returns {Object} Statistics
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Disconnect all sensors
     */
    disconnectAll() {
        for (const sensor of Object.values(this.sensors)) {
            sensor.disconnect();
        }
    }

    /**
     * Reset calibration and history
     */
    reset() {
        this.baseline = null;
        this.isCalibrated = false;
        this.history = [];
        this.stats = {
            totalReadings: 0,
            successfulReadings: 0,
            failedReadings: 0,
            lastFearScore: 0.5
        };
    }
}

export default BiofeedbackManager;
