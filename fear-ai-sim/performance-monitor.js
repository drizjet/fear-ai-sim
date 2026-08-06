/**
 * performance-monitor.js - Track and optimize simulation performance
 */

export class PerformanceMonitor {
    constructor() {
        this.frames = [];
        this.maxFrames = 60;
        this.lastTime = performance.now();
        this.fps = 60;
        
        // Performance tracking
        this.metrics = {
            agentUpdateTime: [],
            predatorUpdateTime: [],
            renderTime: [],
            spatialHashTime: [],
            threatDetectionTime: []
        };
        
        this.slowFrames = [];
        this.warningThreshold = 30; // FPS below this is warning
        this.criticalThreshold = 15; // FPS below this is critical
    }
    
    startFrame() {
        this.frameStartTime = performance.now();
    }
    
    endFrame() {
        const now = performance.now();
        const delta = now - this.lastTime;
        this.lastTime = now;
        
        const currentFPS = 1000 / delta;
        this.frames.push(currentFPS);
        
        if (this.frames.length > this.maxFrames) {
            this.frames.shift();
        }
        
        // Calculate average
        this.fps = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
        
        // Track slow frames
        if (currentFPS < this.warningThreshold) {
            this.slowFrames.push({
                fps: currentFPS,
                time: now,
                agents: this.lastAgentCount,
                predators: this.lastPredatorCount
            });
            
            // Keep only last 10 slow frames
            if (this.slowFrames.length > 10) {
                this.slowFrames.shift();
            }
        }
        
        return currentFPS;
    }
    
    measure(label, fn) {
        const start = performance.now();
        const result = fn();
        const end = performance.now();
        
        if (this.metrics[label]) {
            this.metrics[label].push(end - start);
            if (this.metrics[label].length > 60) {
                this.metrics[label].shift();
            }
        }
        
        return result;
    }
    
    updateCounts(agents, predators) {
        this.lastAgentCount = agents;
        this.lastPredatorCount = predators;
    }
    
    getStats() {
        const stats = {
            fps: this.fps.toFixed(1),
            currentFPS: this.frames[this.frames.length - 1]?.toFixed(1) || 'N/A',
            slowFrameCount: this.slowFrames.length,
            isPerformingWell: this.fps > this.warningThreshold
        };
        
        // Add timing averages
        for (const [key, times] of Object.entries(this.metrics)) {
            if (times.length > 0) {
                const avg = times.reduce((a, b) => a + b, 0) / times.length;
                stats[key] = avg.toFixed(2) + 'ms';
            }
        }
        
        return stats;
    }
    
    getBottleneck() {
        let worstMetric = null;
        let worstTime = 0;
        
        for (const [key, times] of Object.entries(this.metrics)) {
            if (times.length > 0) {
                const avg = times.reduce((a, b) => a + b, 0) / times.length;
                if (avg > worstTime) {
                    worstTime = avg;
                    worstMetric = key;
                }
            }
        }
        
        if (worstTime > 5) { // More than 5ms is concerning
            return { metric: worstMetric, time: worstTime.toFixed(2) + 'ms' };
        }
        
        return null;
    }
    
    logPerformance() {
        const stats = this.getStats();
        const bottleneck = this.getBottleneck();
        
        console.group('🔧 Performance Stats');
        console.log(`FPS: ${stats.fps} (current: ${stats.currentFPS})`);
        console.log(`Slow frames: ${stats.slowFrameCount}`);
        
        if (bottleneck) {
            console.warn(`⚠️ Bottleneck: ${bottleneck.metric} (${bottleneck.time})`);
        }
        
        if (!stats.isPerformingWell) {
            console.warn('⚠️ Performance warning: FPS below 30');
            console.log('Agents:', this.lastAgentCount, 'Predators:', this.lastPredatorCount);
        }
        
        console.groupEnd();
    }
    
    reset() {
        this.frames = [];
        this.slowFrames = [];
        for (const key of Object.keys(this.metrics)) {
            this.metrics[key] = [];
        }
    }
}

// Quick performance check function
export function diagnosePerformance(simulation) {
    const issues = [];
    
    // Check agent count
    const agentCount = simulation.agents?.filter(a => !a.dead).length || 0;
    if (agentCount > 200) {
        issues.push({
            severity: 'warning',
            issue: `High agent count: ${agentCount}`,
            suggestion: 'Consider reducing to 100-150 for better performance'
        });
    }
    
    // Check predator count
    const predatorCount = simulation.predators?.length || 0;
    if (predatorCount > 5) {
        issues.push({
            severity: 'warning', 
            issue: `High predator count: ${predatorCount}`,
            suggestion: 'Each predator adds O(n) overhead to threat detection'
        });
    }
    
    // Check spatial hash
    if (!simulation.spatialHash) {
        issues.push({
            severity: 'critical',
            issue: 'Spatial hash not initialized',
            suggestion: 'Falling back to O(n²) collision detection - will lag'
        });
    }
    
    // Check if Markov engine is running on too many predators
    if (simulation.markovEngine && predatorCount > 3) {
        issues.push({
            severity: 'info',
            issue: 'Markov predictions on many predators',
            suggestion: 'Consider disabling predictions for SWARMER type'
        });
    }
    
    return issues;
}

// Export singleton
export const perfMonitor = new PerformanceMonitor();
