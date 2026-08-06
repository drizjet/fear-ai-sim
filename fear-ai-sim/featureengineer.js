/**
 * FeatureEngineer - Transform raw trajectories into ML features
 * Creates 50+ normalized features from raw trajectory data
 */

export class FeatureEngineer {
    constructor(config = {}) {
        this.config = {
            normalizePositions: true,
            encodeStates: true,
            computeDerivatives: true,
            populationFeatures: true,
            ...config
        };
        
        // State one-hot encoding
        this.stateList = ['CALM', 'ALERT', 'ANXIOUS', 'PANIC', 'HIDE', 'RECOVER', 'FREEZE'];
        
        // Scenario one-hot encoding
        this.scenarioList = ['AMBUSH', 'CHASE', 'GROUP_PANIC', 'TRAP', 'SAFE_HAVEN_RUSH', 'FALSE_ALARM', 'PATROL'];
        
        // Action one-hot encoding
        this.actionList = ['EXPLORE', 'FLEE_DIRECT', 'FLEE_ZIGZAG', 'HIDE', 'FREEZE', 'GROUP_FLEE', 'SEEK_SAFETY', 'WANDER'];
    }
    
    /**
     * Engineer features for a complete trajectory
     */
    engineerFeatures(trajectory, labels) {
        const frames = trajectory.frames;
        if (frames.length < 2) return null;
        
        const features = [];
        
        for (let i = 0; i < frames.length; i++) {
            const frameFeatures = this._engineerFrameFeatures(
                frames[i], 
                i > 0 ? frames[i - 1] : null,
                i < frames.length - 1 ? frames[i + 1] : null,
                trajectory,
                labels
            );
            features.push(frameFeatures);
        }
        
        return {
            trajectoryId: trajectory.id,
            agentId: trajectory.agentId,
            frameCount: frames.length,
            features: features,
            featureNames: this._getFeatureNames()
        };
    }
    
    /**
     * Engineer features for a single frame
     */
    _engineerFrameFeatures(frame, prevFrame, nextFrame, trajectory, labels) {
        const f = [];
        
        // 1. TEMPORAL FEATURES (1)
        f.push(this._normalize(frame.tick - trajectory.frames[0].tick, 0, 1800)); // Time in trajectory
        
        // 2. POSITION FEATURES (4)
        f.push(this._normalize(frame.position.x, 0, this._getSimWidth()));
        f.push(this._normalize(frame.position.y, 0, this._getSimHeight()));
        if (prevFrame) {
            f.push(this._normalize(frame.position.x - prevFrame.position.x, -10, 10)); // Delta X
            f.push(this._normalize(frame.position.y - prevFrame.position.y, -10, 10)); // Delta Y
        } else {
            f.push(0, 0);
        }
        
        // 3. VELOCITY FEATURES (3)
        if (prevFrame) {
            const vx = frame.position.x - prevFrame.position.x;
            const vy = frame.position.y - prevFrame.position.y;
            const speed = Math.sqrt(vx * vx + vy * vy);
            f.push(this._normalize(speed, 0, 10));
            f.push(this._normalize(vx, -10, 10));
            f.push(this._normalize(vy, -10, 10));
        } else {
            f.push(0, 0, 0);
        }
        
        // 4. FEAR FEATURES (4)
        f.push(frame.fear); // Already 0-1
        f.push(this._normalize(this._fearDelta(frame, prevFrame), -1, 1));
        f.push(this._normalize(this._fearAcceleration(frame, prevFrame, nextFrame), -1, 1));
        f.push(frame.fear > 0.7 ? 1 : 0); // Is panicking
        
        // 5. STATE FEATURES (7 one-hot)
        const stateOneHot = this._oneHotEncode(frame.state, this.stateList);
        f.push(...stateOneHot);
        
        // 6. AGENT METRICS (3)
        f.push(this._normalize(frame.energy || 0, 0, 100));
        f.push(frame.trauma || 0); // Already 0-1
        f.push(this._normalize(frame.age || 0, 0, 5000));
        
        // 7. THREAT FEATURES (5)
        const pred = frame.perception?.nearestPredator;
        if (pred) {
            f.push(this._normalize(pred.distance, 0, 1000)); // Threat distance
            f.push(Math.cos(pred.angle)); // Threat direction X
            f.push(Math.sin(pred.angle)); // Threat direction Y
            f.push(pred.distance < 100 ? 1 : 0); // In danger zone
            f.push(pred.distance < 300 ? 1 : 0); // In caution zone
        } else {
            f.push(1, 0, 0, 0, 0); // No threat
        }
        
        // 8. PREDATOR COUNT FEATURES (2)
        f.push(this._normalize(frame.perception?.predatorCount?.dangerZone || 0, 0, 5));
        f.push(this._normalize(frame.perception?.predatorCount?.cautionZone || 0, 0, 10));
        
        // 9. ALLY FEATURES (3)
        f.push(this._normalize(frame.perception?.allyCount || 0, 0, 20));
        f.push(this._normalize(frame.perception?.nearestAllyDistance || 9999, 0, 500));
        f.push(frame.perception?.inSafeHaven ? 1 : 0);
        
        // 10. POPULATION FEATURES (4)
        // These would come from context - using placeholders
        f.push(0.1); // local_panic_density (placeholder)
        f.push(0.5); // group_cohesion (placeholder)
        f.push(0.2); // global_panic_ratio (placeholder)
        f.push(0); // nearby_deaths (placeholder)
        
        // 11. DERIVED KINEMATIC FEATURES (4)
        if (prevFrame && nextFrame) {
            const curvature = this._calculateCurvature(prevFrame, frame, nextFrame);
            f.push(this._normalize(curvature, 0, 1));
            
            const acceleration = this._calculateAcceleration(prevFrame, frame, nextFrame);
            f.push(this._normalize(acceleration, 0, 5));
        } else {
            f.push(0, 0);
        }
        
        // Angular velocity
        if (prevFrame && nextFrame) {
            const angularVel = this._calculateAngularVelocity(prevFrame, frame, nextFrame);
            f.push(this._normalize(angularVel, -3, 3));
        } else {
            f.push(0);
        }
        
        // Path efficiency
        if (labels?.actions && frame.tick) {
            const actionIdx = labels.actions.actions.findIndex(a => a.tick === frame.tick);
            if (actionIdx >= 0) {
                f.push(labels.actions.actions[actionIdx].isOptimalFlee ? 1 : 0);
            } else {
                f.push(0);
            }
        } else {
            f.push(0);
        }
        
        // 12. SCENARIO FEATURES (7 one-hot) - constant across trajectory
        if (labels?.scenario) {
            const scenarioOneHot = this._oneHotEncode(labels.scenario.type, this.scenarioList);
            f.push(...scenarioOneHot);
        } else {
            f.push(...new Array(7).fill(0));
        }
        
        // 13. TRAIT FEATURES (5) - constant across trajectory
        // These would come from agent traits
        f.push(0.5); // trait_fear (placeholder)
        f.push(0.5); // trait_resilience (placeholder)
        f.push(0.5); // trait_skill (placeholder)
        f.push(0.5); // trait_curiosity (placeholder)
        f.push(0.5); // trait_leadership (placeholder)
        
        // 14. CONTEXT FEATURES (3)
        f.push(frame.perception?.nearestPredator ? 1 : 0); // threat_visible
        f.push((frame.perception?.allyCount || 0) > 2 ? 1 : 0); // has_herd
        f.push(frame.energy < 20 ? 1 : 0); // low_energy
        
        return f;
    }
    
    /**
     * Get feature names for reference
     */
    _getFeatureNames() {
        return [
            // Temporal (1)
            'time_in_trajectory',
            // Position (4)
            'pos_x', 'pos_y', 'delta_x', 'delta_y',
            // Velocity (3)
            'speed', 'velocity_x', 'velocity_y',
            // Fear (4)
            'fear_level', 'fear_delta', 'fear_acceleration', 'is_panicking',
            // State (7)
            ...this.stateList.map(s => `state_${s.toLowerCase()}`),
            // Agent metrics (3)
            'energy', 'trauma', 'age',
            // Threat (5)
            'threat_distance', 'threat_dir_x', 'threat_dir_y', 'in_danger_zone', 'in_caution_zone',
            // Predator counts (2)
            'predator_count_danger', 'predator_count_caution',
            // Ally (3)
            'ally_count', 'nearest_ally_dist', 'in_safe_haven',
            // Population (4)
            'local_panic_density', 'group_cohesion', 'global_panic_ratio', 'nearby_deaths',
            // Kinematic (4)
            'path_curvature', 'acceleration', 'angular_velocity', 'is_optimal_flee',
            // Scenario (7)
            ...this.scenarioList.map(s => `scenario_${s.toLowerCase()}`),
            // Traits (5)
            'trait_fear', 'trait_resilience', 'trait_skill', 'trait_curiosity', 'trait_leadership',
            // Context (3)
            'threat_visible', 'has_herd', 'low_energy'
        ];
    }
    
    /**
     * Normalize value to [0, 1]
     */
    _normalize(value, min, max) {
        return Math.max(0, Math.min(1, (value - min) / (max - min)));
    }
    
    /**
     * One-hot encode categorical value
     */
    _oneHotEncode(value, categories) {
        return categories.map(cat => cat === value ? 1 : 0);
    }
    
    /**
     * Calculate fear delta
     */
    _fearDelta(frame, prevFrame) {
        if (!prevFrame) return 0;
        return frame.fear - prevFrame.fear;
    }
    
    /**
     * Calculate fear acceleration (second derivative)
     */
    _fearAcceleration(frame, prevFrame, nextFrame) {
        if (!prevFrame || !nextFrame) return 0;
        const delta1 = frame.fear - prevFrame.fear;
        const delta2 = nextFrame.fear - frame.fear;
        return delta2 - delta1;
    }
    
    /**
     * Calculate path curvature
     */
    _calculateCurvature(f0, f1, f2) {
        // Simplified curvature using three points
        const dx1 = f1.position.x - f0.position.x;
        const dy1 = f1.position.y - f0.position.y;
        const dx2 = f2.position.x - f1.position.x;
        const dy2 = f2.position.y - f1.position.y;
        
        const cross = dx1 * dy2 - dy1 * dx2;
        const dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        
        if (dist1 < 0.001 || dist2 < 0.001) return 0;
        
        return Math.abs(cross) / (dist1 * dist2);
    }
    
    /**
     * Calculate acceleration magnitude
     */
    _calculateAcceleration(f0, f1, f2) {
        const v1x = f1.position.x - f0.position.x;
        const v1y = f1.position.y - f0.position.y;
        const v2x = f2.position.x - f1.position.x;
        const v2y = f2.position.y - f1.position.y;
        
        const ax = v2x - v1x;
        const ay = v2y - v1y;
        
        return Math.sqrt(ax * ax + ay * ay);
    }
    
    /**
     * Calculate angular velocity
     */
    _calculateAngularVelocity(f0, f1, f2) {
        const a1 = Math.atan2(f1.position.y - f0.position.y, f1.position.x - f0.position.x);
        const a2 = Math.atan2(f2.position.y - f1.position.y, f2.position.x - f1.position.x);
        
        let delta = a2 - a1;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        
        return delta;
    }
    
    /**
     * Get simulation width (placeholder)
     */
    _getSimWidth() {
        return 1000;
    }
    
    /**
     * Get simulation height (placeholder)
     */
    _getSimHeight() {
        return 1000;
    }
    
    /**
     * Engineer features for batch of trajectories
     */
    engineerBatch(trajectories, labels) {
        return trajectories.map((traj, i) => this.engineerFeatures(traj, labels[i]));
    }
}
