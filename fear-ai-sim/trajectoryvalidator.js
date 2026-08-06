/**
 * TrajectoryValidator - Validate and filter trajectories
 * Rejects corrupted, impossible, or low-quality data
 */

export class TrajectoryValidator {
    constructor() {
        this.rules = [
            { name: 'completeness', fn: this._checkCompleteness.bind(this), required: true },
            { name: 'range', fn: this._checkRange.bind(this), required: true },
            { name: 'transitions', fn: this._checkTransitions.bind(this), required: true },
            { name: 'temporal', fn: this._checkTemporal.bind(this), required: true },
            { name: 'physics', fn: this._checkPhysics.bind(this), required: false },
            { name: 'duplicates', fn: this._checkDuplicates.bind(this), required: false }
        ];
        
        // Track seen trajectories for duplicate detection
        this.seenHashes = new Set();
        this.maxSeenHashes = 10000;
    }
    
    /**
     * Validate a trajectory
     */
    validate(trajectory) {
        const result = {
            valid: true,
            errors: [],
            warnings: [],
            flags: []
        };
        
        for (const rule of this.rules) {
            const ruleResult = rule.fn(trajectory);
            
            if (!ruleResult.passed) {
                if (rule.required) {
                    result.valid = false;
                    result.errors.push({
                        rule: rule.name,
                        message: ruleResult.message
                    });
                } else {
                    result.warnings.push({
                        rule: rule.name,
                        message: ruleResult.message
                    });
                }
            }
            
            if (ruleResult.flags) {
                result.flags.push(...ruleResult.flags);
            }
        }
        
        return result;
    }
    
    /**
     * Check completeness (all required fields present)
     */
    _checkCompleteness(trajectory) {
        const required = ['id', 'agentId', 'frames', 'eventType', 'eventTick'];
        const missing = required.filter(field => !(field in trajectory));
        
        if (missing.length > 0) {
            return {
                passed: false,
                message: `Missing required fields: ${missing.join(', ')}`
            };
        }
        
        // Check frames array
        if (!Array.isArray(trajectory.frames) || trajectory.frames.length === 0) {
            return {
                passed: false,
                message: 'No frames in trajectory'
            };
        }
        
        // Check each frame has required fields
        const frameRequired = ['tick', 'position', 'fear', 'state'];
        const badFrame = trajectory.frames.find(frame => {
            return frameRequired.some(field => !(field in frame));
        });
        
        if (badFrame) {
            return {
                passed: false,
                message: 'Frame missing required fields'
            };
        }
        
        return { passed: true };
    }
    
    /**
     * Check value ranges
     */
    _checkRange(trajectory) {
        const issues = [];
        
        for (const frame of trajectory.frames) {
            // Fear must be 0-1
            if (frame.fear < 0 || frame.fear > 1 || isNaN(frame.fear)) {
                issues.push(`Invalid fear value: ${frame.fear}`);
            }
            
            // Position must be finite
            if (!isFinite(frame.position?.x) || !isFinite(frame.position?.y)) {
                issues.push('Non-finite position');
            }
            
            // Energy must be 0-100
            if (frame.energy < 0 || frame.energy > 100) {
                issues.push(`Invalid energy: ${frame.energy}`);
            }
        }
        
        if (issues.length > 0) {
            return {
                passed: false,
                message: `Range violations: ${issues.slice(0, 3).join(', ')}${issues.length > 3 ? '...' : ''}`
            };
        }
        
        return { passed: true };
    }
    
    /**
     * Check state transitions are valid
     */
    _checkTransitions(trajectory) {
        const validTransitions = {
            'CALM': ['CALM', 'ALERT', 'ANXIOUS', 'PANIC'],
            'ALERT': ['CALM', 'ALERT', 'ANXIOUS', 'PANIC', 'HIDE'],
            'ANXIOUS': ['ALERT', 'ANXIOUS', 'PANIC', 'HIDE', 'RECOVER'],
            'PANIC': ['ANXIOUS', 'PANIC', 'HIDE', 'RECOVER', 'FREEZE'],
            'HIDE': ['ANXIOUS', 'PANIC', 'HIDE', 'RECOVER'],
            'RECOVER': ['CALM', 'ALERT', 'ANXIOUS', 'RECOVER'],
            'FREEZE': ['PANIC', 'HIDE', 'RECOVER']
        };
        
        const impossible = [];
        
        for (let i = 1; i < trajectory.frames.length; i++) {
            const from = trajectory.frames[i - 1].state;
            const to = trajectory.frames[i].state;
            
            if (from !== to && (!validTransitions[from] || !validTransitions[from].includes(to))) {
                impossible.push(`${from}→${to}`);
            }
        }
        
        if (impossible.length > 0) {
            return {
                passed: false,
                message: `Impossible transitions: ${impossible.slice(0, 3).join(', ')}`
            };
        }
        
        return { passed: true };
    }
    
    /**
     * Check temporal consistency
     */
    _checkTemporal(trajectory) {
        // Check timestamps are monotonic
        for (let i = 1; i < trajectory.frames.length; i++) {
            if (trajectory.frames[i].tick <= trajectory.frames[i - 1].tick) {
                return {
                    passed: false,
                    message: `Non-monotonic timestamps at frame ${i}`
                };
            }
        }
        
        // Check reasonable time gaps (not too sparse)
        const gaps = [];
        for (let i = 1; i < trajectory.frames.length; i++) {
            const gap = trajectory.frames[i].tick - trajectory.frames[i - 1].tick;
            if (gap > 20) { // > 20 ticks (~333ms) is suspicious
                gaps.push(gap);
            }
        }
        
        if (gaps.length > trajectory.frames.length * 0.3) {
            return {
                passed: false,
                message: `Too many large gaps in data`,
                flags: ['SPARSE_DATA']
            };
        }
        
        return { passed: true };
    }
    
    /**
     * Check physics constraints
     */
    _checkPhysics(trajectory) {
        const maxSpeed = 10; // units per tick
        const maxAcceleration = 5; // units per tick^2
        
        for (let i = 2; i < trajectory.frames.length; i++) {
            const f0 = trajectory.frames[i - 2];
            const f1 = trajectory.frames[i - 1];
            const f2 = trajectory.frames[i];
            
            // Calculate velocity
            const v1x = f1.position.x - f0.position.x;
            const v1y = f1.position.y - f0.position.y;
            const v2x = f2.position.x - f1.position.x;
            const v2y = f2.position.y - f1.position.y;
            
            // Check speed
            const speed = Math.sqrt(v2x * v2x + v2y * v2y);
            if (speed > maxSpeed) {
                return {
                    passed: false,
                    message: `Impossible speed: ${speed.toFixed(2)}`,
                    flags: ['PHYSICS_ANOMALY']
                };
            }
            
            // Check acceleration
            const ax = v2x - v1x;
            const ay = v2y - v1y;
            const accel = Math.sqrt(ax * ax + ay * ay);
            
            if (accel > maxAcceleration) {
                return {
                    passed: true, // Warning only
                    message: `High acceleration: ${accel.toFixed(2)}`,
                    flags: ['HIGH_ACCELERATION']
                };
            }
        }
        
        return { passed: true };
    }
    
    /**
     * Check for duplicate trajectories
     */
    _checkDuplicates(trajectory) {
        // Create hash of key trajectory features
        const hash = this._hashTrajectory(trajectory);
        
        if (this.seenHashes.has(hash)) {
            return {
                passed: false,
                message: 'Duplicate trajectory detected',
                flags: ['DUPLICATE']
            };
        }
        
        // Add to seen hashes
        this.seenHashes.add(hash);
        
        // Clean up old hashes if too many
        if (this.seenHashes.size > this.maxSeenHashes) {
            const toDelete = this.maxSeenHashes * 0.2;
            const iter = this.seenHashes.values();
            for (let i = 0; i < toDelete; i++) {
                const val = iter.next().value;
                this.seenHashes.delete(val);
            }
        }
        
        return { passed: true };
    }
    
    /**
     * Create hash for duplicate detection
     */
    _hashTrajectory(trajectory) {
        // Simple hash: agentId + startTick + endTick + frameCount + firstFear + lastFear
        const firstFrame = trajectory.frames[0];
        const lastFrame = trajectory.frames[trajectory.frames.length - 1];
        
        return `${trajectory.agentId}_${firstFrame.tick}_${lastFrame.tick}_${trajectory.frames.length}_${Math.round(firstFrame.fear * 10)}_${Math.round(lastFrame.fear * 10)}`;
    }
    
    /**
     * Batch validate multiple trajectories
     */
    validateBatch(trajectories) {
        const results = [];
        let validCount = 0;
        let invalidCount = 0;
        
        for (const traj of trajectories) {
            const result = this.validate(traj);
            results.push({ trajectory: traj, validation: result });
            
            if (result.valid) {
                validCount++;
            } else {
                invalidCount++;
            }
        }
        
        return {
            results,
            summary: {
                total: trajectories.length,
                valid: validCount,
                invalid: invalidCount,
                validityRate: validCount / trajectories.length
            }
        };
    }
}
