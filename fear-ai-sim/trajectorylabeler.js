/**
 * TrajectoryLabeler - Add ML-ready labels to trajectories
 * Labels: actions, outcomes, counterfactuals, scenarios, quality
 */

// Action classes
export const ActionType = {
    EXPLORE: 'EXPLORE',
    FLEE_DIRECT: 'FLEE_DIRECT',
    FLEE_ZIGZAG: 'FLEE_ZIGZAG',
    HIDE: 'HIDE',
    FREEZE: 'FREEZE',
    GROUP_FLEE: 'GROUP_FLEE',
    SEEK_SAFETY: 'SEEK_SAFETY',
    WANDER: 'WANDER'
};

// Scenario types
export const ScenarioType = {
    AMBUSH: 'AMBUSH',
    CHASE: 'CHASE',
    GROUP_PANIC: 'GROUP_PANIC',
    TRAP: 'TRAP',
    SAFE_HAVEN_RUSH: 'SAFE_HAVEN_RUSH',
    FALSE_ALARM: 'FALSE_ALARM',
    PATROL: 'PATROL'
};

export class TrajectoryLabeler {
    constructor() {
        // State transition mapping
        this.stateOrder = ['CALM', 'ALERT', 'ANXIOUS', 'PANIC', 'HIDE', 'RECOVER'];
    }
    
    /**
     * Label a complete trajectory
     */
    labelTrajectory(trajectory) {
        const frames = trajectory.frames;
        if (frames.length < 2) return null;
        
        const labels = {
            // Metadata
            trajectoryId: trajectory.id,
            agentId: trajectory.agentId,
            
            // Timing
            timing: this._labelTiming(frames, trajectory.eventTick),
            
            // State transitions
            stateTransitions: this._labelStateTransitions(frames),
            
            // Actions
            actions: this._labelActions(frames),
            
            // Outcome
            outcome: this._labelOutcome(frames, trajectory.eventType, trajectory.eventData),
            
            // Scenario classification
            scenario: this._classifyScenario(frames, trajectory.eventType, trajectory.eventData),
            
            // Counterfactuals
            counterfactuals: this._labelCounterfactuals(frames, trajectory.eventData),
            
            // Quality
            quality: this._calculateQuality(frames, trajectory)
        };
        
        return labels;
    }
    
    /**
     * Label timing information
     */
    _labelTiming(frames, eventTick) {
        const startTick = frames[0].tick;
        const endTick = frames[frames.length - 1].tick;
        const eventIdx = frames.findIndex(f => f.tick === eventTick);
        
        return {
            startTick,
            endTick,
            duration: endTick - startTick,
            eventTick,
            eventIndex: eventIdx >= 0 ? eventIdx : Math.floor(frames.length / 2),
            preEventDuration: eventIdx >= 0 ? eventTick - startTick : 0,
            postEventDuration: eventIdx >= 0 ? endTick - eventTick : endTick - startTick
        };
    }
    
    /**
     * Label state transitions
     */
    _labelStateTransitions(frames) {
        const transitions = [];
        let prevState = frames[0].state;
        
        for (let i = 1; i < frames.length; i++) {
            const state = frames[i].state;
            if (state !== prevState) {
                transitions.push({
                    from: prevState,
                    to: state,
                    frameIndex: i,
                    tick: frames[i].tick,
                    isEscalation: this._isEscalation(prevState, state),
                    isRecovery: this._isRecovery(prevState, state)
                });
                prevState = state;
            }
        }
        
        return {
            transitions,
            transitionCount: transitions.length,
            hasPanic: transitions.some(t => t.to === 'PANIC'),
            hasRecovery: transitions.some(t => t.isRecovery),
            firstPanicIndex: transitions.findIndex(t => t.to === 'PANIC'),
            mainSequence: this._getMainSequence(transitions)
        };
    }
    
    /**
     * Check if transition is escalation (fear increasing)
     */
    _isEscalation(from, to) {
        const order = { 'CALM': 0, 'ALERT': 1, 'ANXIOUS': 2, 'PANIC': 3, 'HIDE': 2, 'RECOVER': 0 };
        return order[to] > order[from];
    }
    
    /**
     * Check if transition is recovery
     */
    _isRecovery(from, to) {
        return from === 'PANIC' && (to === 'RECOVER' || to === 'CALM' || to === 'ALERT');
    }
    
    /**
     * Get main transition sequence as string
     */
    _getMainSequence(transitions) {
        return transitions.map(t => `${t.from}→${t.to}`).join(',');
    }
    
    /**
     * Label actions for each frame
     */
    _labelActions(frames) {
        const actions = [];
        
        for (let i = 1; i < frames.length; i++) {
            const prev = frames[i - 1];
            const curr = frames[i];
            
            // Calculate movement
            const dx = curr.position.x - prev.position.x;
            const dy = curr.position.y - prev.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const speed = dist / (curr.tick - prev.tick) * 60; // units per second
            
            // Calculate direction relative to threat
            let threatAngle = 0;
            let fleeAngle = 0;
            let directionError = 0;
            
            if (curr.perception?.nearestPredator) {
                threatAngle = curr.perception.nearestPredator.angle;
                fleeAngle = Math.atan2(dy, dx);
                directionError = Math.abs(this._normalizeAngle(fleeAngle - (threatAngle + Math.PI)));
            }
            
            // Classify action
            const actionType = this._classifyAction(curr, speed, directionError, prev);
            
            actions.push({
                frameIndex: i,
                tick: curr.tick,
                type: actionType,
                movement: { dx, dy, speed },
                directionError,
                isOptimalFlee: directionError < 0.3 && speed > 2,
                state: curr.state
            });
        }
        
        return {
            actions,
            dominantAction: this._getDominantAction(actions),
            fleeQuality: this._calculateFleeQuality(actions),
            avgDirectionError: actions.reduce((sum, a) => sum + a.directionError, 0) / actions.length
        };
    }
    
    /**
     * Classify action type
     */
    _classifyAction(frame, speed, directionError, prevFrame) {
        const state = frame.state;
        const hasPredator = frame.perception?.nearestPredator?.distance < 9999;
        const allyCount = frame.perception?.allyCount || 0;
        
        // PANIC state actions
        if (state === 'PANIC') {
            if (!hasPredator) return ActionType.FALSE_ALARM;
            if (speed < 0.5) return ActionType.FREEZE;
            if (directionError < 0.5) return ActionType.FLEE_DIRECT;
            if (directionError > 1.0) return ActionType.FLEE_ZIGZAG;
            if (allyCount >= 3) return ActionType.GROUP_FLEE;
            return ActionType.FLEE_DIRECT;
        }
        
        // HIDE state
        if (state === 'HIDE') return ActionType.HIDE;
        
        // RECOVER state
        if (state === 'RECOVER') return ActionType.SEEK_SAFETY;
        
        // Non-panic states
        if (hasPredator && frame.perception.nearestPredator.distance < 200) {
            return ActionType.FLEE_DIRECT;
        }
        
        if (speed > 1) return ActionType.EXPLORE;
        return ActionType.WANDER;
    }
    
    /**
     * Get dominant action (most frequent)
     */
    _getDominantAction(actions) {
        const counts = {};
        for (const action of actions) {
            counts[action.type] = (counts[action.type] || 0) + 1;
        }
        return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || ActionType.WANDER;
    }
    
    /**
     * Calculate flee quality score (0-1)
     */
    _calculateFleeQuality(actions) {
        const fleeActions = actions.filter(a => 
            a.type === ActionType.FLEE_DIRECT || 
            a.type === ActionType.FLEE_ZIGZAG ||
            a.type === ActionType.GROUP_FLEE
        );
        
        if (fleeActions.length === 0) return 0;
        
        const optimalCount = fleeActions.filter(a => a.isOptimalFlee).length;
        return optimalCount / fleeActions.length;
    }
    
    /**
     * Label outcome
     */
    _labelOutcome(frames, eventType, eventData) {
        const firstFrame = frames[0];
        const lastFrame = frames[frames.length - 1];
        
        // Calculate fear trajectory
        const fears = frames.map(f => f.fear);
        const peakFear = Math.max(...fears);
        const finalFear = lastFrame.fear;
        
        // Survival metrics
        const survived = eventType !== 'DEATH';
        const survivalTime = lastFrame.tick - firstFrame.tick;
        
        // Escape metrics
        const firstThreatDist = firstFrame.perception?.nearestPredator?.distance || 9999;
        const lastThreatDist = lastFrame.perception?.nearestPredator?.distance || 9999;
        const escaped = lastThreatDist > 300 && firstThreatDist < 300;
        
        // Recovery metrics
        const panicFrames = frames.filter(f => f.state === 'PANIC');
        const recoveryTime = panicFrames.length > 0 
            ? frames.length - frames.findIndex(f => f.state === 'PANIC') - panicFrames.length
            : 0;
        
        return {
            survived,
            deathCause: eventType === 'DEATH' ? eventData.cause : null,
            survivalTime,
            peakFear,
            finalFear,
            fearReduction: peakFear - finalFear,
            escaped,
            escapeTime: escaped ? frames.findIndex(f => 
                (f.perception?.nearestPredator?.distance || 9999) > 300
            ) * 100 / 60 : null, // Approximate ms
            minThreatDistance: Math.min(...frames.map(f => 
                f.perception?.nearestPredator?.distance || 9999
            )),
            inSafeHaven: lastFrame.perception?.inSafeHaven || false,
            recoveryTime
        };
    }
    
    /**
     * Classify scenario type
     */
    _classifyScenario(frames, eventType, eventData) {
        // Use event type as primary indicator
        if (eventType === 'FALSE_ALARM') {
            return { type: ScenarioType.FALSE_ALARM, confidence: 0.95 };
        }
        
        if (eventType === 'GROUP_COLLAPSE') {
            return { type: ScenarioType.GROUP_PANIC, confidence: 0.9 };
        }
        
        if (eventType === 'TRAP_ENTRY') {
            return { type: ScenarioType.TRAP, confidence: 0.9 };
        }
        
        if (eventType === 'SAFE_HAVEN_REACHED') {
            return { type: ScenarioType.SAFE_HAVEN_RUSH, confidence: 0.85 };
        }
        
        // Analyze predator behavior for AMBUSH vs CHASE
        const predatorDistances = frames.map(f => 
            f.perception?.nearestPredator?.distance || 9999
        );
        const initialDist = predatorDistances[0];
        const minDist = Math.min(...predatorDistances);
        
        // Ambush: predator very close at start
        if (initialDist < 150) {
            return { type: ScenarioType.AMBUSH, confidence: 0.85 };
        }
        
        // Chase: predator pursuit over time
        const hasPursuit = predatorDistances.some((d, i) => i > 0 && d < predatorDistances[i-1]);
        if (hasPursuit && minDist < 200) {
            return { type: ScenarioType.CHASE, confidence: 0.8 };
        }
        
        // Default to patrol if no clear threat
        return { type: ScenarioType.PATROL, confidence: 0.6 };
    }
    
    /**
     * Label counterfactuals (what could have been)
     */
    _labelCounterfactuals(frames, eventData) {
        const outcome = this._labelOutcome(frames, 'PANIC_START', eventData);
        
        // Calculate optimal path metrics
        let optimalPath = true;
        let betterActionAvailable = false;
        let safeRouteExisted = true;
        let avoidableDeath = false;
        
        // Analyze flee efficiency
        const fleeActions = frames.filter(f => f.state === 'PANIC');
        if (fleeActions.length > 0) {
            // Check for zigzag/wasted motion
            const positionChanges = [];
            for (let i = 1; i < fleeActions.length; i++) {
                const dx = fleeActions[i].position.x - fleeActions[i-1].position.x;
                const dy = fleeActions[i].position.y - fleeActions[i-1].position.y;
                positionChanges.push(Math.atan2(dy, dx));
            }
            
            // High direction variance = inefficient
            let directionVariance = 0;
            for (let i = 1; i < positionChanges.length; i++) {
                directionVariance += Math.abs(this._normalizeAngle(
                    positionChanges[i] - positionChanges[i-1]
                ));
            }
            
            optimalPath = directionVariance < 1.0; // Low variance = straight flee
            betterActionAvailable = directionVariance > 2.0; // Wasted motion
        }
        
        // Check if death was avoidable
        if (!outcome.survived) {
            const minThreatDist = outcome.minThreatDistance;
            avoidableDeath = minThreatDist > 50; // Had space to escape
        }
        
        // Check if safe route existed
        safeRouteExisted = outcome.escaped || outcome.inSafeHaven;
        
        return {
            optimalPath,
            betterActionAvailable,
            safeRouteExisted,
            avoidableDeath,
            expertWouldFlee: outcome.peakFear > 0.5,
            expertActionMatch: optimalPath
        };
    }
    
    /**
     * Calculate quality metrics
     */
    _calculateQuality(frames, trajectory) {
        const issues = [];
        
        // Check for missing frames
        const expectedFrames = trajectory.actualEndTick - trajectory.startTick;
        const missingFrames = expectedFrames - frames.length;
        
        if (missingFrames > 10) {
            issues.push('MISSING_FRAMES');
        }
        
        // Check for data corruption
        const hasNaN = frames.some(f => 
            isNaN(f.position.x) || isNaN(f.position.y) || isNaN(f.fear)
        );
        
        if (hasNaN) {
            issues.push('CORRUPTED_DATA');
        }
        
        // Check for truncated trajectory
        const isTruncated = trajectory.actualEndTick >= trajectory.maxEndTick;
        
        // Calculate label confidence
        let confidence = 1.0;
        
        // Reduce confidence for short trajectories
        if (frames.length < 30) confidence -= 0.2;
        
        // Reduce confidence if many missing frames
        if (missingFrames > 5) confidence -= 0.15;
        
        // Reduce confidence for ambiguous states
        const stateChanges = frames.filter((f, i) => i > 0 && f.state !== frames[i-1].state).length;
        if (stateChanges > 10) confidence -= 0.1; // Too chaotic
        
        // Check for ambiguous moments (fear near threshold)
        const ambiguousFrames = frames.filter(f => {
            const nearThreshold = Math.abs(f.fear - 0.5) < 0.1 || 
                                  Math.abs(f.fear - 0.7) < 0.1;
            return nearThreshold;
        }).length;
        
        const isAmbiguous = ambiguousFrames / frames.length > 0.3;
        
        return {
            valid: !hasNaN && frames.length >= 10,
            truncated: isTruncated,
            missingFrames: Math.max(0, missingFrames),
            corruptionFlags: hasNaN ? ['NAN_VALUES'] : [],
            anomalyFlags: issues,
            labelConfidence: Math.max(0, confidence),
            isAmbiguous,
            frameCount: frames.length,
            duration: frames.length > 0 ? frames[frames.length - 1].tick - frames[0].tick : 0
        };
    }
    
    /**
     * Normalize angle to [-PI, PI]
     */
    _normalizeAngle(angle) {
        while (angle > Math.PI) angle -= 2 * Math.PI;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
    }
}
