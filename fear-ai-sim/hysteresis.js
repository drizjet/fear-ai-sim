/**
 * Hysteresis Controller for State Transitions
 * Phase 3: Core System Improvements (T3.1)
 * 
 * Prevents state oscillation by using different thresholds for
 * entering vs exiting states. Based on V.A.I.L. system and
 * industry best practices.
 */

export class HysteresisController {
    constructor() {
        this.currentState = 'CALM';
        this.stateTimer = 0;
        this.minStateDuration = 10; // Minimum frames before state change allowed
        
        // Hysteresis thresholds - different for entering vs exiting
        // Format: { enter: threshold_to_enter, exit: threshold_to_exit }
        this.thresholds = {
            CALM: {
                enter: 0.0,      // Always in CALM at start
                exitUp: 0.25,    // Exit to ALERT when fear > 0.25
                exitDown: -1.0   // Can't go below CALM
            },
            ALERT: {
                enter: 0.25,     // Enter from CALM when fear > 0.25
                exitUp: 0.55,    // Exit to ANXIOUS when fear > 0.55
                exitDown: 0.15   // Exit to CALM when fear < 0.15
            },
            ANXIOUS: {
                enter: 0.55,     // Enter from ALERT when fear > 0.55
                exitUp: 0.75,    // Exit to PANIC when fear > 0.75
                exitDown: 0.45   // Exit to ALERT when fear < 0.45
            },
            PANIC: {
                enter: 0.75,     // Enter from ANXIOUS when fear > 0.75
                exitUp: 0.85,    // Exit to HIDE when fear > 0.85 (if skilled)
                exitDown: 0.65   // Exit to ANXIOUS when fear < 0.65
            },
            HIDE: {
                enter: 0.85,     // Enter from PANIC (if skilled and chooses to hide)
                exitUp: 0.90,    // Exit back to PANIC if fear gets too high
                exitDown: 0.60   // Exit to RECOVER when fear < 0.60
            },
            RECOVER: {
                enter: 0.0,      // Enter from any state when fear drops
                exitUp: 0.30,    // Exit to ANXIOUS if fear rises again
                exitDown: 0.20   // Exit to CALM when fear < 0.20
            },
            FREEZE: {
                enter: 0.80,     // Enter from PANIC (rare, low morale)
                exitUp: 0.95,    // Stay frozen until fear peaks or drops
                exitDown: 0.50   // Exit to RECOVER when fear < 0.50
            }
        };
        
        // State transition history for debugging
        this.transitionHistory = [];
        this.maxHistoryLength = 50;
    }

    /**
     * Update state based on current fear level with hysteresis
     * @param {number} fearLevel - Current fear level (0-1)
     * @param {Object} context - Additional context (skill, morale, etc.)
     * @returns {string} New state
     */
    update(fearLevel, context = {}) {
        const { skill = 0.5, morale = 1.0, threats = [] } = context;
        
        this.stateTimer++;
        
        // Enforce minimum state duration to prevent rapid oscillation
        if (this.stateTimer < this.minStateDuration) {
            return this.currentState;
        }
        
        const oldState = this.currentState;
        let newState = this.currentState;
        
        // Get current state thresholds
        const currentThresholds = this.thresholds[this.currentState];
        
        // Determine possible state transitions based on fear level
        switch (this.currentState) {
            case 'CALM':
                if (fearLevel > currentThresholds.exitUp) {
                    newState = 'ALERT';
                }
                break;
                
            case 'ALERT':
                if (fearLevel > currentThresholds.exitUp) {
                    newState = 'ANXIOUS';
                } else if (fearLevel < currentThresholds.exitDown) {
                    newState = 'CALM';
                }
                break;
                
            case 'ANXIOUS':
                if (fearLevel > currentThresholds.exitUp) {
                    newState = 'PANIC';
                } else if (fearLevel < currentThresholds.exitDown) {
                    newState = 'ALERT';
                }
                break;
                
            case 'PANIC':
                // Check for freeze (rare, low morale)
                if (morale < 0.4 && fearLevel > 0.8 && Math.random() < 0.05) {
                    newState = 'FREEZE';
                } else if (fearLevel > currentThresholds.exitUp && skill > 0.6) {
                    // High skill agents may hide instead of panic
                    newState = 'HIDE';
                } else if (fearLevel < currentThresholds.exitDown) {
                    newState = 'ANXIOUS';
                }
                break;
                
            case 'HIDE':
                if (fearLevel > currentThresholds.exitUp) {
                    // Hide failed, back to panic
                    newState = 'PANIC';
                } else if (fearLevel < currentThresholds.exitDown || threats.length === 0) {
                    // Safe to recover
                    newState = 'RECOVER';
                }
                break;
                
            case 'RECOVER':
                if (fearLevel > currentThresholds.exitUp) {
                    newState = 'ANXIOUS';
                } else if (fearLevel < currentThresholds.exitDown) {
                    newState = 'CALM';
                }
                break;
                
            case 'FREEZE':
                if (fearLevel < currentThresholds.exitDown || Math.random() < 0.02) {
                    newState = 'RECOVER';
                }
                break;
        }
        
        // Record transition if state changed
        if (newState !== oldState) {
            this.recordTransition(oldState, newState, fearLevel);
            this.currentState = newState;
            this.stateTimer = 0;
        }
        
        return this.currentState;
    }

    /**
     * Force a state change (for external events)
     * @param {string} newState - State to transition to
     * @param {string} reason - Reason for forced transition
     */
    forceState(newState, reason = 'forced') {
        if (newState !== this.currentState) {
            this.recordTransition(this.currentState, newState, 0, reason);
            this.currentState = newState;
            this.stateTimer = 0;
        }
    }

    /**
     * Get current hysteresis gap for a transition
     * @param {string} fromState - Source state
     * @param {string} toState - Target state
     * @returns {number} Gap value
     */
    getHysteresisGap(fromState, toState) {
        const fromThresholds = this.thresholds[fromState];
        
        // Determine direction and calculate gap
        const states = ['CALM', 'ALERT', 'ANXIOUS', 'PANIC', 'HIDE'];
        const fromIndex = states.indexOf(fromState);
        const toIndex = states.indexOf(toState);
        
        if (toIndex > fromIndex) {
            // Escalating: gap between exitUp and enter threshold of next state
            return fromThresholds.exitUp - this.thresholds[toState].enter;
        } else if (toIndex < fromIndex) {
            // De-escalating: gap between exitDown and enter threshold of lower state
            return this.thresholds[toState].enter - fromThresholds.exitDown;
        }
        
        return 0;
    }

    /**
     * Record state transition for debugging
     */
    recordTransition(from, to, fearLevel, reason = 'automatic') {
        this.transitionHistory.push({
            timestamp: Date.now(),
            from,
            to,
            fearLevel,
            reason,
            stateTimer: this.stateTimer
        });
        
        // Trim history
        if (this.transitionHistory.length > this.maxHistoryLength) {
            this.transitionHistory.shift();
        }
    }

    /**
     * Get transition statistics
     */
    getTransitionStats() {
        const stats = {};
        
        this.transitionHistory.forEach(t => {
            const key = `${t.from}->${t.to}`;
            if (!stats[key]) {
                stats[key] = { count: 0, avgFear: 0, lastTime: 0 };
            }
            stats[key].count++;
            stats[key].avgFear += t.fearLevel;
            stats[key].lastTime = Math.max(stats[key].lastTime, t.timestamp);
        });
        
        // Calculate averages
        Object.keys(stats).forEach(key => {
            stats[key].avgFear /= stats[key].count;
        });
        
        return stats;
    }

    /**
     * Get current state
     */
    getState() {
        return this.currentState;
    }

    /**
     * Get time in current state (frames)
     */
    getStateDuration() {
        return this.stateTimer;
    }

    /**
     * Get recent transition history
     */
    getHistory() {
        return this.transitionHistory;
    }

    /**
     * Reset controller
     */
    reset() {
        this.currentState = 'CALM';
        this.stateTimer = 0;
        this.transitionHistory = [];
    }

    /**
     * Check if state change is allowed (minimum duration met)
     */
    canChangeState() {
        return this.stateTimer >= this.minStateDuration;
    }

    /**
     * Get threshold info for current state
     */
    getCurrentThresholds() {
        return this.thresholds[this.currentState];
    }
}