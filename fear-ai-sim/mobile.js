/**
 * Mobile Optimizer for Fear-AI Evolution Simulator
 * Phase 5: Optimization (T5.8)
 * 
 * Adjusts simulation parameters and rendering for mobile devices
 */

export class MobileOptimizer {
    /**
     * Apply mobile optimizations to simulation
     */
    static apply(simulation) {
        console.log('📱 Applying mobile optimizations...');
        
        // 1. Reduce population
        const mobilePopulation = 500;
        if (simulation.agents.length > mobilePopulation) {
            // Release excess back to pool
            const excess = simulation.agents.splice(mobilePopulation);
            excess.forEach(a => simulation.agentPool.release(a));
        }
        
        // 2. Reduce grid resolutions
        if (simulation.heatmap) simulation.heatmap.res = 20;
        if (simulation.actionMap) simulation.actionMap.res = 20;
        if (simulation.pheromoneSystem) simulation.pheromoneSystem.res = 20;
        
        // 3. Optimize Spatial Hash
        if (simulation.spatialHash) {
            simulation.spatialHash.cellSize = 150; // Larger cells
        }
        
        // 4. Aggressive LOD
        if (simulation.lodSystem) {
            simulation.lodSystem.thresholds = {
                HIGH: 150,   // Much smaller high-detail area
                MEDIUM: 400,
                LOW: 800
            };
        }
        
        // 5. Disable expensive rendering
        simulation.config.renderGlows = false;
        simulation.config.renderShadows = false;
        simulation.config.networkViz = false;
        simulation.config.particleEffects = false;
        
        // 6. Reduce update frequency for non-critical systems
        simulation.config.metricsInterval = 120; // Every 2 seconds
        simulation.config.saveInterval = 600;    // Every 10 seconds
        
        return {
            status: 'Optimized for Mobile',
            population: mobilePopulation,
            lowPowerMode: true
        };
    }

    /**
     * High-efficiency mode for restricted resource environments (T12.4)
     */
    static setPowerMode(simulation, mode = 'HIGH_PERFORMANCE') {
        if (mode === 'LOW_POWER') {
            console.log('🔋 Low Power Mode activated');
            simulation.config.metricsInterval = 300; // Every 5 seconds
            simulation.config.saveInterval = 1200;   // Every 20 seconds
            simulation.config.aiQualityScale = 0.5;
            simulation.config.particleEffects = false;
            simulation.config.renderGlows = false;
        } else {
            console.log('⚡ High Performance Mode activated');
            simulation.config.metricsInterval = 60;
            simulation.config.saveInterval = 300;
            simulation.config.aiQualityScale = 1.0;
            simulation.config.particleEffects = true;
            simulation.config.renderGlows = true;
        }
    }

    /**
     * Detect if running on mobile device
     */
    static isMobile() {
        if (typeof navigator === 'undefined') return false;
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
}
