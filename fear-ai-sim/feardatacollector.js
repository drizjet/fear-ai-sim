/**
 * FearDataCollector - Main data collection system
 * Integrates buffers, perception, events, and extraction
 * Optimized: Minimal overhead, 10fps sampling, event-triggered extraction
 */

import { BufferPool, CircularTrajectoryBuffer } from './trajectorybuffer.js';
import { FastPerception } from './fastperception.js';
import { StateHasher } from './statehasher.js';

// Event types
export const EventType = {
    PANIC_START: 'PANIC_START',
    FEAR_THRESHOLD: 'FEAR_THRESHOLD',
    DEATH: 'DEATH',
    ESCAPE: 'ESCAPE',
    RECOVERY_COMPLETE: 'RECOVERY_COMPLETE',
    GROUP_COLLAPSE: 'GROUP_COLLAPSE',
    TRAP_ENTRY: 'TRAP_ENTRY',
    SAFE_HAVEN_REACHED: 'SAFE_HAVEN_REACHED',
    FALSE_ALARM: 'FALSE_ALARM'
};

export class FearDataCollector {
    constructor(simulation) {
        this.sim = simulation;
        
        // Data collection components
        this.bufferPool = new BufferPool();
        this.perception = new FastPerception(simulation);
        this.stateHasher = new StateHasher();
        
        // Sampling control
        this.sampleInterval = 6; // 10fps at 60fps sim
        this.frameCounter = 0;
        
        // Event detection state
        this.agentStates = new Map(); // Track previous state for transitions
        this.recentDeaths = []; // For nearby death counting
        
        // Trajectory storage
        this.pendingTrajectories = []; // Extracted but not yet processed
        this.completedTrajectories = [];
        this.maxPending = 100;
        this.maxCompleted = 1000;
        
        // Statistics
        this.stats = {
            totalSamples: 0,
            totalEvents: 0,
            trajectoriesExtracted: 0,
            memoryUsage: 0
        };
        
        // Configuration
        this.config = {
            preRollTicks: 300, // 5s at 60fps = 300 ticks
            postRollTicks: 900, // 15s max
            minFearForPanic: 0.7,
            maxFearForRecovery: 0.2,
            groupCollapseThreshold: 0.5,
            dangerDistance: 100,
            cautionDistance: 300,
            escapeDistance: 300
        };
    }
    
    /**
     * Main update - call every simulation frame
     */
    update() {
        this.frameCounter++;
        
        // Sample at 10fps (every 6th frame)
        if (this.frameCounter % this.sampleInterval !== 0) return;
        
        const tick = this.sim.frameCount;
        
        // Sample all alive agents
        for (const agent of this.sim.agents) {
            if (agent.dead) continue;
            
            // Get or create buffer
            const buffer = this.bufferPool.getBuffer(agent.id);
            
            // Gather perception
            const perception = this.perception.gather(agent);
            const context = this.perception.getContext(agent);
            
            // Record frame
            buffer.record(tick, agent, perception, context);
            this.stats.totalSamples++;
            
            // Detect events
            this._detectEvents(agent, tick, perception, context);
        }
        
        // Update memory stats
        this.stats.memoryUsage = this.bufferPool.getTotalMemoryUsage();
        
        // Process pending trajectories
        this._processPendingTrajectories();
    }
    
    /**
     * Detect events for an agent
     */
    _detectEvents(agent, tick, perception, context) {
        const prevState = this.agentStates.get(agent.id);
        const currentState = agent.brain?.state;
        const fear = agent.brain?.currentFear || 0;
        
        // PANIC_START: Transition to PANIC
        if (currentState === 'PANIC' && prevState !== 'PANIC') {
            this._triggerEvent(EventType.PANIC_START, agent, tick, {
                fearLevel: fear,
                predatorDistance: perception.nearestPredator?.distance || 9999
            });
        }
        
        // FEAR_THRESHOLD: Cross major thresholds
        if (prevState) {
            const prevFear = prevState.fear || 0;
            const thresholds = [0.2, 0.5, 0.7, 0.9];
            for (const thresh of thresholds) {
                if (prevFear < thresh && fear >= thresh) {
                    this._triggerEvent(EventType.FEAR_THRESHOLD, agent, tick, {
                        threshold: thresh,
                        direction: 'up'
                    });
                }
            }
        }
        
        // ESCAPE: Predator far for sustained period
        if (perception.nearestPredator?.distance > this.config.escapeDistance) {
            const escapeStart = this.agentStates.get(agent.id)?.escapeStartTick;
            if (escapeStart && tick - escapeStart > 180) { // 3s at 60fps
                this._triggerEvent(EventType.ESCAPE, agent, tick, {
                    duration: tick - escapeStart
                });
            } else if (!escapeStart) {
                if (!this.agentStates.has(agent.id)) {
                    this.agentStates.set(agent.id, {});
                }
                this.agentStates.get(agent.id).escapeStartTick = tick;
            }
        } else {
            // Reset escape timer if predator close
            if (this.agentStates.has(agent.id)) {
                this.agentStates.get(agent.id).escapeStartTick = null;
            }
        }
        
        // RECOVERY_COMPLETE: Fear drops below threshold after panic
        if (fear < this.config.maxFearForRecovery && prevState?.wasPanicking) {
            this._triggerEvent(EventType.RECOVERY_COMPLETE, agent, tick, {
                recoveryTime: tick - (prevState.panicStartTick || tick)
            });
        }
        
        // GROUP_COLLAPSE: Local panic density spikes
        if (context.localPanicDensity > this.config.groupCollapseThreshold) {
            const lastCollapse = this.agentStates.get(agent.id)?.lastCollapseTick;
            if (!lastCollapse || tick - lastCollapse > 600) { // 10s cooldown
                this._triggerEvent(EventType.GROUP_COLLAPSE, agent, tick, {
                    panicDensity: context.localPanicDensity
                });
                if (!this.agentStates.has(agent.id)) {
                    this.agentStates.set(agent.id, {});
                }
                this.agentStates.get(agent.id).lastCollapseTick = tick;
            }
        }
        
        // TRAP_ENTRY: Corner + predator nearby
        const isInCorner = this._isInCorner(agent);
        if (isInCorner && perception.nearestPredator?.distance < this.config.dangerDistance) {
            this._triggerEvent(EventType.TRAP_ENTRY, agent, tick, {
                predatorDistance: perception.nearestPredator.distance
            });
        }
        
        // SAFE_HAVEN_REACHED: Enter safe zone
        if (perception.inSafeHaven && !prevState?.inSafeHaven) {
            this._triggerEvent(EventType.SAFE_HAVEN_REACHED, agent, tick, {});
        }
        
        // FALSE_ALARM: Fear spike but no threat
        if (fear > 0.5 && !perception.nearestPredator && prevState?.hadPredator) {
            this._triggerEvent(EventType.FALSE_ALARM, agent, tick, {
                peakFear: fear
            });
        }
        
        // Update state tracking
        this.agentStates.set(agent.id, {
            state: currentState,
            fear: fear,
            wasPanicking: currentState === 'PANIC' || prevState?.wasPanicking,
            panicStartTick: currentState === 'PANIC' ? (prevState?.panicStartTick || tick) : null,
            inSafeHaven: perception.inSafeHaven,
            hadPredator: !!perception.nearestPredator
        });
    }
    
    /**
     * Trigger event and extract trajectory
     */
    _triggerEvent(eventType, agent, tick, data) {
        this.stats.totalEvents++;
        
        // Get buffer for this agent
        const buffer = this.bufferPool.getBuffer(agent.id);
        
        // Calculate extraction window
        const startTick = Math.max(0, tick - this.config.preRollTicks);
        const maxEndTick = tick + this.config.postRollTicks;
        
        // Create trajectory object
        const trajectory = {
            id: this._generateTrajectoryId(),
            agentId: agent.id,
            eventType: eventType,
            eventTick: tick,
            eventData: data,
            startTick: startTick,
            maxEndTick: maxEndTick,
            actualEndTick: null,
            buffer: buffer,
            status: 'pending', // pending, complete, extracting
            frames: []
        };
        
        // Add to pending
        this.pendingTrajectories.push(trajectory);
        
        // Trim pending if too many
        if (this.pendingTrajectories.length > this.maxPending) {
            const old = this.pendingTrajectories.shift();
            old.status = 'dropped';
        }
    }
    
    /**
     * Process pending trajectories (finalize completed ones)
     */
    _processPendingTrajectories() {
        const currentTick = this.sim.frameCount;
        const completed = [];
        
        for (let i = this.pendingTrajectories.length - 1; i >= 0; i--) {
            const traj = this.pendingTrajectories[i];
            
            // Check if recovery/death occurred
            const agent = this.sim.agents.find(a => a.id === traj.agentId);
            
            let shouldFinalize = false;
            let actualEndTick = traj.maxEndTick;
            
            if (!agent || agent.dead) {
                // Agent died - end at death
                shouldFinalize = true;
                actualEndTick = currentTick;
            } else if (agent.brain?.currentFear < this.config.maxFearForRecovery) {
                // Recovered - check if sustained
                const recoveryTicks = this._countRecoveryTicks(traj.agentId, currentTick);
                if (recoveryTicks > 60) { // 1s sustained recovery
                    shouldFinalize = true;
                    actualEndTick = currentTick;
                }
            }
            
            // Max duration reached
            if (currentTick >= traj.maxEndTick) {
                shouldFinalize = true;
            }
            
            if (shouldFinalize) {
                traj.actualEndTick = Math.min(actualEndTick, traj.maxEndTick);
                traj.status = 'extracting';
                
                // Extract frames from buffer
                traj.frames = traj.buffer.extractWindow(traj.startTick, traj.actualEndTick);
                traj.status = 'complete';
                
                completed.push(traj);
                this.pendingTrajectories.splice(i, 1);
            }
        }
        
        // Add to completed list
        for (const traj of completed) {
            this.completedTrajectories.push(traj);
            this.stats.trajectoriesExtracted++;
        }
        
        // Trim completed if too many
        while (this.completedTrajectories.length > this.maxCompleted) {
            this.completedTrajectories.shift();
        }
    }
    
    /**
     * Check if agent is in a corner
     */
    _isInCorner(agent) {
        const margin = 50;
        const w = this.sim.width;
        const h = this.sim.height;
        
        const nearLeft = agent.x < margin;
        const nearRight = agent.x > w - margin;
        const nearTop = agent.y < margin;
        const nearBottom = agent.y > h - margin;
        
        return (nearLeft || nearRight) && (nearTop || nearBottom);
    }
    
    /**
     * Count consecutive recovery ticks
     */
    _countRecoveryTicks(agentId, currentTick) {
        // Simplified - would need actual tracking
        return 61; // Assume recovered
    }
    
    /**
     * Generate unique trajectory ID
     */
    _generateTrajectoryId() {
        return `traj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Handle agent death
     */
    onAgentDeath(agent, cause) {
        // Trigger death event
        this._triggerEvent(EventType.DEATH, agent, this.sim.frameCount, {
            cause: cause,
            finalFear: agent.brain?.currentFear || 0
        });
        
        // Clean up agent state
        this.agentStates.delete(agent.id);
        
        // Keep buffer for a bit longer (for trajectory extraction)
        // Will be cleaned up by pool later
    }
    
    /**
     * Get all completed trajectories
     */
    getCompletedTrajectories() {
        return this.completedTrajectories.filter(t => t.status === 'complete');
    }
    
    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this.stats,
            pendingCount: this.pendingTrajectories.length,
            completedCount: this.completedTrajectories.length,
            bufferCount: this.sim.agents.filter(a => !a.dead).length
        };
    }
    
    /**
     * Clear all data
     */
    clear() {
        this.bufferPool.clear();
        this.agentStates.clear();
        this.pendingTrajectories = [];
        this.completedTrajectories = [];
        this.recentDeaths = [];
        this.stats = {
            totalSamples: 0,
            totalEvents: 0,
            trajectoriesExtracted: 0,
            memoryUsage: 0
        };
    }
}
