/**
 * VR System - VR-specific fear detection and comfort management
 * 
 * Features:
 * - Head movement analysis (ducking, recoiling, freezing, shaking)
 * - Controller grip and gesture analysis
 * - Presence break detection
 * - VR comfort adjustment (prevents simulator sickness)
 * 
 * Research-backed from VRMN-bD dataset findings
 */

/**
 * Analyzes VR head movement patterns for fear detection
 * Reference: VRMN-bD dataset findings
 */
export class VRHeadAnalyzer {
    constructor(config = {}) {
        this.config = {
            duckThreshold: config.duckThreshold || 0.15,        // meters below baseline
            recoilThreshold: config.recoilThreshold || 0.3,     // meters backward
            freezeThreshold: config.freezeThreshold || 0.02,    // meters movement
            shakeThreshold: config.shakeThreshold || 5.0,       // rad/s rotation speed
            scanThreshold: config.scanThreshold || 3.0,         // direction changes per second
            freezeDuration: config.freezeDuration || 2000,     // ms to count as freezing
            ...config
        };

        this.history = [];        // Head position/rotation history
        this.maxHistory = 120;    // 2 seconds at 60fps
        this.baselineHeight = null;
        this.baselinePosition = null;
    }

    /**
     * Calibrate baseline head position
     */
    calibrate(position) {
        this.baselineHeight = position.y;
        this.baselinePosition = { ...position };
    }

    /**
     * Update with new head tracking data
     */
    update(headData) {
        const timestamp = Date.now();
        
        this.history.push({
            timestamp,
            position: { ...headData.position },
            rotation: { ...headData.rotation },
            velocity: headData.velocity ? { ...headData.velocity } : null
        });

        // Keep history bounded
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }

        return this.analyze();
    }

    /**
     * Analyze head data for fear behaviors
     */
    analyze() {
        if (this.history.length < 10) return null;

        const current = this.history[this.history.length - 1];
        const behaviors = {
            rapidLooking: this.detectScanning(),
            ducking: this.detectDucking(current),
            recoiling: this.detectRecoiling(),
            freezing: this.detectFreezing(),
            shaking: this.detectShaking(),
            avoidance: this.detectAvoidance(current)
        };

        // Calculate composite fear score (0-1)
        const weights = {
            rapidLooking: 0.15,
            ducking: 0.25,
            recoiling: 0.20,
            freezing: 0.20,
            shaking: 0.15,
            avoidance: 0.05
        };

        let fearScore = 0;
        let totalWeight = 0;

        for (const [behavior, present] of Object.entries(behaviors)) {
            if (present) {
                fearScore += weights[behavior];
                totalWeight += weights[behavior];
            }
        }

        // Normalize
        const normalizedScore = totalWeight > 0 ? fearScore / totalWeight : 0;

        return {
            fearScore: Math.min(1.0, normalizedScore),
            behaviors,
            timestamp: current.timestamp,
            intensity: this.getIntensity(normalizedScore)
        };
    }

    /**
     * Detect rapid head scanning (looking around frantically)
     */
    detectScanning() {
        if (this.history.length < 30) return false;

        // Look at last 0.5 seconds (30 frames)
        const recent = this.history.slice(-30);
        let directionChanges = 0;
        let lastSign = 0;

        for (let i = 1; i < recent.length; i++) {
            const delta = recent[i].rotation.y - recent[i-1].rotation.y;
            const sign = Math.sign(delta);
            
            if (sign !== 0 && sign !== lastSign) {
                directionChanges++;
                lastSign = sign;
            }
        }

        const rate = directionChanges / (recent.length / 60); // per second
        return rate > this.config.scanThreshold;
    }

    /**
     * Detect ducking (head moving down suddenly)
     */
    detectDucking(current) {
        if (!this.baselineHeight) return false;
        
        const drop = this.baselineHeight - current.position.y;
        return drop > this.config.duckThreshold;
    }

    /**
     * Detect recoiling (sudden backward movement)
     */
    detectRecoiling() {
        if (this.history.length < 5) return false;

        const current = this.history[this.history.length - 1];
        const fiveFramesAgo = this.history[this.history.length - 5];
        
        // Calculate backward movement (Z axis in VR space)
        const backwardMovement = fiveFramesAgo.position.z - current.position.z;
        
        return backwardMovement > this.config.recoilThreshold;
    }

    /**
     * Detect freezing (minimal movement for duration)
     */
    detectFreezing() {
        if (this.history.length < 60) return false;

        // Look for minimal movement over freeze duration
        const recent = this.history.slice(-60);
        let maxMovement = 0;

        for (let i = 1; i < recent.length; i++) {
            const dx = recent[i].position.x - recent[i-1].position.x;
            const dy = recent[i].position.y - recent[i-1].position.y;
            const dz = recent[i].position.z - recent[i-1].position.z;
            const movement = Math.sqrt(dx*dx + dy*dy + dz*dz);
            maxMovement = Math.max(maxMovement, movement);
        }

        return maxMovement < this.config.freezeThreshold;
    }

    /**
     * Detect head shaking (high frequency rotation)
     */
    detectShaking() {
        if (this.history.length < 10 || !this.history[0].velocity) return false;

        const recent = this.history.slice(-10);
        let maxAngularVelocity = 0;

        for (const frame of recent) {
            if (frame.velocity) {
                const angularVel = Math.sqrt(
                    frame.velocity.rotX ** 2 + 
                    frame.velocity.rotY ** 2
                );
                maxAngularVelocity = Math.max(maxAngularVelocity, angularVel);
            }
        }

        return maxAngularVelocity > this.config.shakeThreshold;
    }

    /**
     * Detect threat avoidance (looking away from threats)
     */
    detectAvoidance(current) {
        // Would integrate with threat position from game
        // For now, placeholder based on sudden rotation away from forward
        return Math.abs(current.rotation.y) > Math.PI / 3; // 60 degrees
    }

    /**
     * Get intensity level from score
     */
    getIntensity(score) {
        if (score > 0.8) return 'EXTREME';
        if (score > 0.6) return 'HIGH';
        if (score > 0.4) return 'MODERATE';
        if (score > 0.2) return 'LOW';
        return 'NONE';
    }

    /**
     * Get current head velocity
     */
    getCurrentVelocity() {
        if (this.history.length < 2) return { x: 0, y: 0, z: 0 };

        const current = this.history[this.history.length - 1];
        const previous = this.history[this.history.length - 2];
        const dt = (current.timestamp - previous.timestamp) / 1000;

        if (dt === 0) return { x: 0, y: 0, z: 0 };

        return {
            x: (current.position.x - previous.position.x) / dt,
            y: (current.position.y - previous.position.y) / dt,
            z: (current.position.z - previous.position.z) / dt
        };
    }

    /**
     * Reset analyzer
     */
    reset() {
        this.history = [];
        this.baselineHeight = null;
        this.baselinePosition = null;
    }
}

/**
 * Analyzes VR controller data for fear detection
 */
export class VRControllerAnalyzer {
    constructor(config = {}) {
        this.config = {
            gripThreshold: config.gripThreshold || 0.7,       // 0-1 pressure
            shakeThreshold: config.shakeThreshold || 0.3,     // m/s vibration
            guardDistance: config.guardDistance || 0.2,       // meters from face
            ...config
        };

        this.history = { left: [], right: [] };
        this.maxHistory = 60;
        this.baselineGrip = { left: 0.3, right: 0.3 };
    }

    /**
     * Update with controller data
     */
    update(controllers) {
        const timestamp = Date.now();

        // Left controller
        if (controllers.left) {
            this.history.left.push({
                timestamp,
                position: { ...controllers.left.position },
                grip: controllers.left.grip || 0,
                velocity: controllers.left.velocity || { x: 0, y: 0, z: 0 }
            });
            if (this.history.left.length > this.maxHistory) {
                this.history.left.shift();
            }
        }

        // Right controller
        if (controllers.right) {
            this.history.right.push({
                timestamp,
                position: { ...controllers.right.position },
                grip: controllers.right.grip || 0,
                velocity: controllers.right.velocity || { x: 0, y: 0, z: 0 }
            });
            if (this.history.right.length > this.maxHistory) {
                this.history.right.shift();
            }
        }

        return this.analyze(controllers);
    }

    /**
     * Analyze controller data
     */
    analyze(controllers) {
        const leftAnalysis = this.analyzeController('left', controllers.left);
        const rightAnalysis = this.analyzeController('right', controllers.right);

        // Combine analyses
        const combinedGrip = Math.max(leftAnalysis.gripStress, rightAnalysis.gripStress);
        const combinedShake = Math.max(leftAnalysis.shakeIntensity, rightAnalysis.shakeIntensity);
        const guardPosition = leftAnalysis.guardPosition || rightAnalysis.guardPosition;
        const controllerSpread = this.calculateSpread();

        // Calculate fear score
        let fearScore = 0;
        if (combinedGrip > 0.8) fearScore += 0.3;
        if (combinedGrip > 0.6) fearScore += 0.2;
        if (combinedShake > this.config.shakeThreshold) fearScore += 0.25;
        if (guardPosition) fearScore += 0.25;
        if (controllerSpread < 0.1) fearScore += 0.15; // Clenched together

        return {
            fearScore: Math.min(1.0, fearScore),
            left: leftAnalysis,
            right: rightAnalysis,
            combinedGrip,
            combinedShake,
            guardPosition,
            controllerSpread,
            timestamp: Date.now()
        };
    }

    /**
     * Analyze single controller
     */
    analyzeController(side, controller) {
        if (!controller) {
            return {
                gripStress: 0,
                shakeIntensity: 0,
                guardPosition: false,
                dropped: true
            };
        }

        const history = this.history[side];
        const baseline = this.baselineGrip[side];

        // Grip stress analysis
        const gripStress = Math.max(0, (controller.grip - baseline) / (1 - baseline));

        // Shake detection
        let shakeIntensity = 0;
        if (history.length >= 10) {
            const recent = history.slice(-10);
            let totalVelocity = 0;
            for (const frame of recent) {
                const vel = frame.velocity;
                totalVelocity += Math.sqrt(vel.x**2 + vel.y**2 + vel.z**2);
            }
            shakeIntensity = totalVelocity / recent.length;
        }

        // Guard position (hands near face - defensive)
        // Head position assumed at (0, 1.6, 0) in seated VR
        const headPos = { x: 0, y: 1.6, z: 0 };
        const distance = Math.sqrt(
            (controller.position.x - headPos.x)**2 +
            (controller.position.y - headPos.y)**2 +
            (controller.position.z - headPos.z)**2
        );
        const guardPosition = distance < this.config.guardDistance && controller.position.y > 1.2;

        return {
            gripStress,
            shakeIntensity,
            guardPosition,
            dropped: false
        };
    }

    /**
     * Calculate distance between controllers (spread)
     */
    calculateSpread() {
        const left = this.history.left[this.history.left.length - 1];
        const right = this.history.right[this.history.right.length - 1];

        if (!left || !right) return 0;

        return Math.sqrt(
            (left.position.x - right.position.x)**2 +
            (left.position.y - right.position.y)**2 +
            (left.position.z - right.position.z)**2
        );
    }

    /**
     * Calibrate baseline grip pressure
     */
    calibrate(controllers) {
        if (controllers.left) {
            this.baselineGrip.left = controllers.left.grip || 0.3;
        }
        if (controllers.right) {
            this.baselineGrip.right = controllers.right.grip || 0.3;
        }
    }

    /**
     * Reset analyzer
     */
    reset() {
        this.history = { left: [], right: [] };
        this.baselineGrip = { left: 0.3, right: 0.3 };
    }
}

/**
 * Detects presence breaks - when VR immersion is lost due to extreme fear
 */
export class PresenceBreakDetector {
    constructor(config = {}) {
        this.config = {
            headsetTimeout: config.headsetTimeout || 5000,     // ms
            idleTimeout: config.idleTimeout || 5000,           // ms
            eyesClosedThreshold: config.eyesClosedThreshold || 2000, // ms
            rockingThreshold: config.rockingThreshold || 3,      // cycles
            ...config
        };

        this.headsetWorn = true;
        this.lastControllerInput = Date.now();
        this.eyesClosedStart = null;
        this.rockingHistory = [];
        this.isCalm = false;
    }

    /**
     * Update detection state.
     *
     * TM-TEMP-11: `now` is injectable (defaults to Date.now()) so
     * the idle/eyes-closed thresholds are testable without real
     * wall-clock waits. Production passes nothing and behaves
     * exactly as before.
     */
    update(state, now = Date.now()) {
        // Check headset status
        if (state.headsetWorn !== undefined) {
            this.headsetWorn = state.headsetWorn;
        }

        // Check controller activity
        if (state.controllerActive) {
            this.lastControllerInput = now;
        }

        // Check eye tracking
        if (state.eyesClosed) {
            if (!this.eyesClosedStart) {
                this.eyesClosedStart = now;
            }
        } else {
            this.eyesClosedStart = null;
        }

        // Update rocking detection
        if (state.headPosition) {
            this.updateRockingDetection(state.headPosition);
        }

        // Check for calm request
        this.isCalm = state.requestCalm || false;

        return this.detectPresenceBreak(now);
    }

    /**
     * Detect if player is experiencing presence break
     */
    detectPresenceBreak(now = Date.now()) {
        const indicators = {
            headsetRemoved: !this.headsetWorn,
            controllerIdle: (now - this.lastControllerInput) > this.config.idleTimeout,
            eyesClosed: this.eyesClosedStart && (now - this.eyesClosedStart) > this.config.eyesClosedThreshold,
            repetitiveRocking: this.detectRocking(),
            calmRequested: this.isCalm
        };

        const breakScore = Object.values(indicators).filter(Boolean).length;
        const severity = breakScore >= 3 ? 'CRITICAL' :
                        breakScore >= 2 ? 'HIGH' :
                        breakScore >= 1 ? 'MODERATE' : 'NONE';

        return {
            presenceBreaking: breakScore > 0,
            severity,
            indicators,
            breakScore,
            timestamp: now
        };
    }

    /**
     * Update rocking detection history
     */
    updateRockingDetection(position) {
        this.rockingHistory.push({
            timestamp: Date.now(),
            z: position.z
        });

        // Keep last 5 seconds
        const cutoff = Date.now() - 5000;
        this.rockingHistory = this.rockingHistory.filter(h => h.timestamp > cutoff);
    }

    /**
     * Detect repetitive rocking motion (comfort seeking)
     */
    detectRocking() {
        if (this.rockingHistory.length < 20) return false;

        // Look for oscillating Z movement
        let peaks = 0;
        let lastPeak = 0;
        const threshold = 0.05; // 5cm movement

        for (let i = 2; i < this.rockingHistory.length - 2; i++) {
            const prev = this.rockingHistory[i-1].z;
            const curr = this.rockingHistory[i].z;
            const next = this.rockingHistory[i+1].z;

            // Peak detection
            if (curr > prev && curr > next && Math.abs(curr - prev) > threshold) {
                if (lastPeak === 0 || (i - lastPeak) > 10) { // At least 0.15s apart
                    peaks++;
                    lastPeak = i;
                }
            }
        }

        return peaks >= this.config.rockingThreshold;
    }

    /**
     * Reset detector
     */
    reset() {
        this.headsetWorn = true;
        this.lastControllerInput = Date.now();
        this.eyesClosedStart = null;
        this.rockingHistory = [];
        this.isCalm = false;
    }
}

/**
 * Manages VR comfort vs fear balance
 * Prevents simulator sickness while maintaining immersion
 */
export class VRComfortManager {
    constructor() {
        this.comfortSettings = {
            snapTurn: false,           // Smooth turning preferred
            teleportMovement: false,     // Free movement if comfortable
            vignetteEnabled: true,      // Comfort vignette during motion
            reducedMotion: false         // Reduce artificial motion
        };

        this.playerComfortLevel = 'COMFORTABLE'; // COMFORTABLE, CAUTION, WARNING
        this.lastDiscomfortTime = 0;
        this.discomfortCount = 0;
    }

    /**
     * Assess player comfort from VR metrics
     */
    assessComfort(vrMetrics) {
        const indicators = {
            headVelocity: this.getHeadVelocityMagnitude(vrMetrics.headVelocity),
            rotationSpeed: vrMetrics.rotationSpeed || 0,
            acceleration: vrMetrics.acceleration || 0,
            timeSinceLastFrame: vrMetrics.frameTime || 11
        };

        // Comfort thresholds
        if (indicators.headVelocity > 2.0 || 
            indicators.rotationSpeed > 3.0 ||
            indicators.acceleration > 5.0 ||
            indicators.timeSinceLastFrame > 20) {
            
            this.discomfortCount++;
            this.lastDiscomfortTime = Date.now();
            
            if (this.discomfortCount > 5) {
                this.playerComfortLevel = 'WARNING';
            } else if (this.discomfortCount > 2) {
                this.playerComfortLevel = 'CAUTION';
            }
        } else {
            // Recover comfort over time
            if (Date.now() - this.lastDiscomfortTime > 5000) {
                this.discomfortCount = Math.max(0, this.discomfortCount - 1);
                if (this.discomfortCount === 0) {
                    this.playerComfortLevel = 'COMFORTABLE';
                }
            }
        }

        return this.playerComfortLevel;
    }

    /**
     * Get recommended comfort settings
     */
    getComfortSettings() {
        switch (this.playerComfortLevel) {
            case 'WARNING':
                return {
                    snapTurn: true,
                    teleportMovement: true,
                    vignetteEnabled: true,
                    reducedMotion: true,
                    maxFearIntensity: 0.6  // Cap fear to reduce stress
                };
            case 'CAUTION':
                return {
                    snapTurn: true,
                    teleportMovement: false,
                    vignetteEnabled: true,
                    reducedMotion: false,
                    maxFearIntensity: 0.8
                };
            default:
                return {
                    snapTurn: false,
                    teleportMovement: false,
                    vignetteEnabled: true,
                    reducedMotion: false,
                    maxFearIntensity: 1.0
                };
        }
    }

    /**
     * Adjust fear intensity for VR comfort
     */
    adjustFearForVR(baseFearIntensity) {
        const settings = this.getComfortSettings();
        return Math.min(baseFearIntensity, settings.maxFearIntensity);
    }

    /**
     * Get magnitude of head velocity vector
     */
    getHeadVelocityMagnitude(velocity) {
        if (!velocity) return 0;
        return Math.sqrt(velocity.x**2 + velocity.y**2 + velocity.z**2);
    }

    /**
     * Reset comfort manager
     */
    reset() {
        this.playerComfortLevel = 'COMFORTABLE';
        this.lastDiscomfortTime = 0;
        this.discomfortCount = 0;
    }
}

/**
 * Main VR System - Combines all VR analysis components
 */
export class VRSystem {
    constructor(config = {}) {
        this.headAnalyzer = new VRHeadAnalyzer(config.head);
        this.controllerAnalyzer = new VRControllerAnalyzer(config.controller);
        this.presenceDetector = new PresenceBreakDetector(config.presence);
        this.comfortManager = new VRComfortManager();

        this.isActive = false;
        this.fearMultiplier = 1.4;  // VR amplifies fear by ~40%
        this.lastAnalysis = null;
        this.stats = {
            totalAnalyses: 0,
            presenceBreaks: 0,
            highFearEvents: 0
        };
    }

    /**
     * Initialize VR system
     */
    initialize() {
        this.isActive = true;
        return {
            status: 'ACTIVE',
            components: ['head', 'controller', 'presence', 'comfort'],
            fearMultiplier: this.fearMultiplier
        };
    }

    /**
     * Update with new VR tracking data
     */
    update(vrData) {
        if (!this.isActive) return null;

        const timestamp = Date.now();
        const results = {
            timestamp,
            head: null,
            controller: null,
            presence: null,
            comfort: null
        };

        // Update head analyzer
        if (vrData.head) {
            if (!this.headAnalyzer.baselineHeight && vrData.calibrate) {
                this.headAnalyzer.calibrate(vrData.head.position);
            }
            results.head = this.headAnalyzer.update(vrData.head);
        }

        // Update controller analyzer
        if (vrData.controllers) {
            if (vrData.calibrate) {
                this.controllerAnalyzer.calibrate(vrData.controllers);
            }
            results.controller = this.controllerAnalyzer.update(vrData.controllers);
        }

        // Update presence detector
        results.presence = this.presenceDetector.update({
            headsetWorn: vrData.headsetWorn,
            controllerActive: vrData.controllerActive,
            eyesClosed: vrData.eyesClosed,
            headPosition: vrData.head?.position,
            requestCalm: vrData.requestCalm
        });

        // Update comfort manager
        results.comfort = this.comfortManager.assessComfort({
            headVelocity: this.headAnalyzer.getCurrentVelocity(),
            rotationSpeed: vrData.head?.velocity?.rotY,
            frameTime: vrData.frameTime
        });

        // Calculate combined fear score
        const combinedFear = this.calculateCombinedFear(results);
        results.combinedFear = combinedFear;

        // Adjust for VR presence breaks
        if (results.presence.presenceBreaking) {
            this.stats.presenceBreaks++;
            combinedFear.adjusted *= 0.5; // Reduce fear when presence breaking
        }

        // Apply VR fear multiplier
        combinedFear.vrAdjusted = Math.min(1.0, combinedFear.raw * this.fearMultiplier);

        // Apply comfort limits
        combinedFear.final = this.comfortManager.adjustFearForVR(combinedFear.vrAdjusted);

        results.combinedFear = combinedFear;

        // Update stats
        this.stats.totalAnalyses++;
        if (combinedFear.final > 0.7) {
            this.stats.highFearEvents++;
        }

        this.lastAnalysis = results;
        return results;
    }

    /**
     * Calculate combined fear from all sources
     */
    calculateCombinedFear(results) {
        let rawFear = 0;
        let sources = [];

        if (results.head) {
            rawFear = Math.max(rawFear, results.head.fearScore);
            if (results.head.fearScore > 0.3) {
                sources.push('head');
            }
        }

        if (results.controller) {
            rawFear = Math.max(rawFear, results.controller.fearScore);
            if (results.controller.fearScore > 0.3) {
                sources.push('controller');
            }
        }

        return {
            raw: rawFear,
            adjusted: rawFear,
            vrAdjusted: rawFear,
            final: rawFear,
            sources
        };
    }

    /**
     * Get recommended actions based on VR state
     */
    getRecommendations() {
        if (!this.lastAnalysis) return [];

        const recs = [];
        const analysis = this.lastAnalysis;

        // Presence break recommendations
        if (analysis.presence?.presenceBreaking) {
            recs.push({
                type: 'URGENT',
                action: 'REDUCE_INTENSITY',
                reason: 'Player experiencing presence break'
            });
        }

        // Comfort recommendations
        const comfortSettings = this.comfortManager.getComfortSettings();
        if (comfortSettings.reducedMotion) {
            recs.push({
                type: 'COMFORT',
                action: 'ENABLE_TELEPORT',
                reason: 'Player comfort level: WARNING'
            });
        }

        // High fear recommendations
        if (analysis.combinedFear?.final > 0.8) {
            recs.push({
                type: 'BALANCE',
                action: 'ADD_SAFE_ZONE',
                reason: 'Extreme fear detected - offer respite'
            });
        }

        return recs;
    }

    /**
     * Get system statistics
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            active: this.isActive,
            fearMultiplier: this.fearMultiplier,
            comfortLevel: this.comfortManager.playerComfortLevel,
            lastAnalysis: this.lastAnalysis?.timestamp
        };
    }

    /**
     * Reset VR system
     */
    reset() {
        this.headAnalyzer.reset();
        this.controllerAnalyzer.reset();
        this.presenceDetector.reset();
        this.comfortManager.reset();
        this.lastAnalysis = null;
        this.stats = {
            totalAnalyses: 0,
            presenceBreaks: 0,
            highFearEvents: 0
        };
    }

    /**
     * Shutdown VR system
     */
    shutdown() {
        this.isActive = false;
        this.reset();
    }
}

// Default export
export default VRSystem;
