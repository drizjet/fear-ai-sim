/**
 * Comprehensive Metrics Collection System
 * Phase 2: Metrics & Analytics (T2.1, T2.2)
 * 
 * Real-time metrics collection with fear distribution tracking
 */

export class MetricsCollector {
    constructor() {
        // Real-time metrics storage
        this.metrics = {
            // Population metrics
            population: [],
            birthRate: [],
            deathRate: [],
            
            // Fear metrics (T2.2)
            avgFear: [],
            fearDistribution: {
                CALM: [],      // fear < 0.2
                ALERT: [],     // fear 0.2-0.5
                ANXIOUS: [],   // fear 0.5-0.8
                PANIC: []      // fear > 0.8
            },
            maxFear: [],
            minFear: [],
            fearVariance: [],
            
            // State metrics
            stateDistribution: {
                CALM: [],
                ALERT: [],
                ANXIOUS: [],
                PANIC: [],
                HIDE: [],
                RECOVER: [],
                FREEZE: []
            },
            stateTransitions: [],
            
            // Behavior metrics
            survivalTime: [],
            killsByPredator: 0,
            killsByStarvation: 0,
            killsByAge: 0,
            
            // Group metrics
            groupSize: [],
            panicChains: [],
            
            // A/B Testing
            abTestGroup: 'A',
            
            // Performance metrics
            fps: [],
            frameTime: [],
            memoryUsage: [],
            agentUpdateTime: [],
            
            // Time series
            timestamps: []
        };
        
        this.maxDataPoints = 1000;
        this.lastMetrics = null;
        
        // Running statistics
        this.runningStats = {
            totalAgentsBorn: 0,
            totalAgentsDied: 0,
            totalPanicEvents: 0,
            totalStateTransitions: 0,
            sessionStartTime: Date.now()
        };
    }

    /**
     * Record comprehensive metrics for a simulation frame
     */
    recordFrame(agents, predators, simulation) {
        const timestamp = Date.now();
        const aliveAgents = agents.filter(a => !a.dead);
        
        // Population metrics
        const population = aliveAgents.length;
        this.metrics.population.push(population);
        
        // Fear metrics (T2.2)
        const fearLevels = aliveAgents.map(a => a.brain.currentFear);
        const avgFear = fearLevels.length > 0 ? 
            fearLevels.reduce((a, b) => a + b, 0) / fearLevels.length : 0;
        const maxFear = fearLevels.length > 0 ? Math.max(...fearLevels) : 0;
        const minFear = fearLevels.length > 0 ? Math.min(...fearLevels) : 0;
        const variance = this.calculateVariance(fearLevels);
        
        this.metrics.avgFear.push(avgFear);
        this.metrics.maxFear.push(maxFear);
        this.metrics.minFear.push(minFear);
        this.metrics.fearVariance.push(variance);
        
        // Fear distribution buckets (T2.2)
        const fearDist = {
            CALM: fearLevels.filter(f => f < 0.2).length,
            ALERT: fearLevels.filter(f => f >= 0.2 && f < 0.5).length,
            ANXIOUS: fearLevels.filter(f => f >= 0.5 && f < 0.8).length,
            PANIC: fearLevels.filter(f => f >= 0.8).length
        };
        
        this.metrics.fearDistribution.CALM.push(fearDist.CALM);
        this.metrics.fearDistribution.ALERT.push(fearDist.ALERT);
        this.metrics.fearDistribution.ANXIOUS.push(fearDist.ANXIOUS);
        this.metrics.fearDistribution.PANIC.push(fearDist.PANIC);
        
        // State distribution
        const stateDist = {
            CALM: aliveAgents.filter(a => a.brain.state === 'CALM').length,
            ALERT: aliveAgents.filter(a => a.brain.state === 'ALERT').length,
            ANXIOUS: aliveAgents.filter(a => a.brain.state === 'ANXIOUS').length,
            PANIC: aliveAgents.filter(a => a.brain.state === 'PANIC').length,
            HIDE: aliveAgents.filter(a => a.brain.state === 'HIDE').length,
            RECOVER: aliveAgents.filter(a => a.brain.state === 'RECOVER').length,
            FREEZE: aliveAgents.filter(a => a.brain.state === 'FREEZE').length
        };
        
        Object.keys(stateDist).forEach(state => {
            this.metrics.stateDistribution[state].push(stateDist[state]);
        });
        
        // Group behavior metrics (T2.5)
        const avgGroupSize = this.calculateAverageGroupSize(aliveAgents);
        this.metrics.groupSize.push(avgGroupSize);
        
        // Performance metrics
        if (simulation) {
            this.metrics.fps.push(simulation.fps || 60);
            this.metrics.frameTime.push(simulation.lastFrameTime || 16);
        }
        
        // Memory usage (if available)
        if (typeof performance !== 'undefined' && performance.memory) {
            this.metrics.memoryUsage.push(performance.memory.usedJSHeapSize / (1024 * 1024));
        }
        
        this.metrics.timestamps.push(timestamp);
        
        // Trim old data
        this.trimOldData();
        
        // Store for quick access
        this.lastMetrics = {
            timestamp,
            population,
            avgFear,
            maxFear,
            fearDist,
            stateDist,
            avgGroupSize,
            fps: simulation?.fps || 60
        };
        
        return this.lastMetrics;
    }

    /**
     * Calculate average group size using simple spatial clustering (T2.5)
     */
    calculateAverageGroupSize(agents) {
        if (agents.length === 0) return 0;
        if (agents.length === 1) return 1;
        
        const threshold = 50; // Distance threshold for "grouped"
        const visited = new Set();
        const groupSizes = [];
        
        for (let i = 0; i < agents.length; i++) {
            if (visited.has(i)) continue;
            
            let groupCount = 0;
            const stack = [i];
            visited.add(i);
            
            while (stack.length > 0) {
                const currentIdx = stack.pop();
                groupCount++;
                
                const currentAgent = agents[currentIdx];
                
                for (let j = 0; j < agents.length; j++) {
                    if (visited.has(j)) continue;
                    
                    const otherAgent = agents[j];
                    const dx = currentAgent.x - otherAgent.x;
                    const dy = currentAgent.y - otherAgent.y;
                    const distSq = dx * dx + dy * dy;
                    
                    if (distSq < threshold * threshold) {
                        visited.add(j);
                        stack.push(j);
                    }
                }
            }
            groupSizes.push(groupCount);
        }
        
        return groupSizes.reduce((a, b) => a + b, 0) / groupSizes.length;
    }

    /**
     * Get survival time statistics (T2.4)
     */
    getSurvivalTimeStats() {
        const times = this.metrics.survivalTime;
        if (times.length === 0) return { avg: 0, min: 0, max: 0, median: 0 };
        
        const sorted = [...times].sort((a, b) => a - b);
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        const median = sorted[Math.floor(sorted.length / 2)];
        
        return {
            avg: parseFloat(avg.toFixed(2)),
            min: sorted[0],
            max: sorted[sorted.length - 1],
            median,
            count: times.length
        };
    }

    /**
     * Get group size statistics (T2.5)
     */
    getGroupSizeStats() {
        const sizes = this.metrics.groupSize;
        if (sizes.length === 0) return { avg: 0, max: 0 };
        
        return {
            avg: parseFloat((sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(2)),
            max: Math.max(...sizes),
            current: sizes[sizes.length - 1]
        };
    }

    /**
     * Get state transition matrix (T2.3)
     */
    getStateTransitionMatrix() {
        const transitions = this.metrics.stateTransitions;
        const matrix = {};
        
        transitions.forEach(t => {
            if (!matrix[t.from]) matrix[t.from] = {};
            matrix[t.from][t.to] = (matrix[t.from][t.to] || 0) + 1;
        });
        
        return matrix;
    }

    /**
     * Record a state transition event
     */
    recordStateTransition(fromState, toState, agentId) {
        this.metrics.stateTransitions.push({
            timestamp: Date.now(),
            from: fromState,
            to: toState,
            agentId
        });
        this.runningStats.totalStateTransitions++;
        
        if (toState === 'PANIC') {
            this.runningStats.totalPanicEvents++;
        }
    }

    /**
     * Record agent death
     */
    recordDeath(cause, agent) {
        this.runningStats.totalAgentsDied++;
        
        switch(cause) {
            case 'predator':
                this.metrics.killsByPredator++;
                break;
            case 'starvation':
                this.metrics.killsByStarvation++;
                break;
            case 'age':
                this.metrics.killsByAge++;
                break;
        }
        
        if (agent) {
            this.metrics.survivalTime.push(agent.age);
        }
    }

    /**
     * Record agent birth
     */
    recordBirth(parentId = null) {
        this.runningStats.totalAgentsBorn++;
    }

    /**
     * Record panic chain event
     */
    recordPanicChain(chainLength, sourceAgentId) {
        this.metrics.panicChains.push({
            timestamp: Date.now(),
            length: chainLength,
            sourceAgentId
        });
    }

    /**
     * Get current fear distribution as percentages (T2.2)
     */
    getFearDistributionPercentages() {
        if (!this.lastMetrics) return null;
        
        const total = this.lastMetrics.population;
        if (total === 0) return { CALM: 0, ALERT: 0, ANXIOUS: 0, PANIC: 0 };
        
        return {
            CALM: (this.lastMetrics.fearDist.CALM / total * 100).toFixed(1),
            ALERT: (this.lastMetrics.fearDist.ALERT / total * 100).toFixed(1),
            ANXIOUS: (this.lastMetrics.fearDist.ANXIOUS / total * 100).toFixed(1),
            PANIC: (this.lastMetrics.fearDist.PANIC / total * 100).toFixed(1)
        };
    }

    /**
     * Get state transition statistics
     */
    getStateTransitionStats() {
        const transitions = this.metrics.stateTransitions;
        if (transitions.length === 0) return {};
        
        const stats = {};
        transitions.forEach(t => {
            const key = `${t.from}->${t.to}`;
            stats[key] = (stats[key] || 0) + 1;
        });
        
        return stats;
    }

    /**
     * Get performance summary
     */
    getPerformanceSummary() {
        const recentFPS = this.metrics.fps.slice(-100);
        const avgFPS = recentFPS.length > 0 ?
            recentFPS.reduce((a, b) => a + b, 0) / recentFPS.length : 0;
        
        const recentMemory = this.metrics.memoryUsage.slice(-10);
        const avgMemory = recentMemory.length > 0 ?
            recentMemory.reduce((a, b) => a + b, 0) / recentMemory.length : 0;
        
        return {
            avgFPS: avgFPS.toFixed(1),
            minFPS: Math.min(...recentFPS).toFixed(1),
            avgMemoryMB: avgMemory.toFixed(1),
            sessionDuration: ((Date.now() - this.runningStats.sessionStartTime) / 1000).toFixed(0)
        };
    }

    /**
     * Export metrics to JSON for analysis
     */
    exportMetrics() {
        return JSON.stringify({
            metrics: this.metrics,
            runningStats: this.runningStats,
            summary: this.generateSummary()
        }, null, 2);
    }

    /**
     * Generate human-readable summary
     */
    generateSummary() {
        const perf = this.getPerformanceSummary();
        const fearDist = this.getFearDistributionPercentages();
        
        return {
            session: {
                duration: perf.sessionDuration + 's',
                totalBorn: this.runningStats.totalAgentsBorn,
                totalDied: this.runningStats.totalAgentsDied,
                totalPanicEvents: this.runningStats.totalPanicEvents
            },
            current: this.lastMetrics,
            fearDistribution: fearDist,
            performance: perf,
            stateTransitions: this.getStateTransitionStats()
        };
    }

    /**
     * Calculate variance of an array
     */
    calculateVariance(arr) {
        if (arr.length < 2) return 0;
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        const squaredDiffs = arr.map(x => Math.pow(x - mean, 2));
        return squaredDiffs.reduce((a, b) => a + b, 0) / arr.length;
    }

    /**
     * Trim old data to maintain max size
     */
    trimOldData() {
        if (this.metrics.timestamps.length > this.maxDataPoints) {
            const excess = this.metrics.timestamps.length - this.maxDataPoints;
            
            this.metrics.timestamps.splice(0, excess);
            this.metrics.population.splice(0, excess);
            this.metrics.avgFear.splice(0, excess);
            this.metrics.maxFear.splice(0, excess);
            this.metrics.minFear.splice(0, excess);
            this.metrics.fearVariance.splice(0, excess);
            this.metrics.fps.splice(0, excess);
            this.metrics.frameTime.splice(0, excess);
            this.metrics.memoryUsage.splice(0, excess);
            
            Object.keys(this.metrics.fearDistribution).forEach(key => {
                this.metrics.fearDistribution[key].splice(0, excess);
            });
            
            Object.keys(this.metrics.stateDistribution).forEach(key => {
                this.metrics.stateDistribution[key].splice(0, excess);
            });
        }
    }

    /**
     * Reset all metrics
     */
    reset() {
        this.metrics = {
            population: [],
            birthRate: [],
            deathRate: [],
            avgFear: [],
            fearDistribution: { CALM: [], ALERT: [], ANXIOUS: [], PANIC: [] },
            maxFear: [],
            minFear: [],
            fearVariance: [],
            stateDistribution: { CALM: [], ALERT: [], ANXIOUS: [], PANIC: [], HIDE: [], RECOVER: [], FREEZE: [] },
            stateTransitions: [],
            survivalTime: [],
            killsByPredator: 0,
            killsByStarvation: 0,
            killsByAge: 0,
            groupSize: [],
            panicChains: [],
            fps: [],
            frameTime: [],
            memoryUsage: [],
            agentUpdateTime: [],
            timestamps: []
        };
        
        this.runningStats = {
            totalAgentsBorn: 0,
            totalAgentsDied: 0,
            totalPanicEvents: 0,
            totalStateTransitions: 0,
            sessionStartTime: Date.now()
        };
        
        this.lastMetrics = null;
    }
}