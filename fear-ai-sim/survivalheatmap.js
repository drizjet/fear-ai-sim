/**
 * SurvivalHeatmap: Tracks where agents survive the longest
 * Creates a spatial map of survival times for evolutionary analysis
 */
export class SurvivalHeatmap {
    constructor(width, height, resolution = 20) {
        this.width = width;
        this.height = height;
        this.res = resolution;
        this.cols = Math.ceil(width / resolution);
        this.rows = Math.ceil(height / resolution);
        
        // Grid stores total survival time and visit count
        this.survivalGrid = new Float32Array(this.cols * this.rows);
        this.visitGrid = new Uint32Array(this.cols * this.rows);
        
        // For visualization
        this.maxAvgSurvival = 1;
    }
    
    /**
     * Record agent position and survival time
     */
    record(agent) {
        if (agent.dead) return;
        
        const col = Math.floor(agent.x / this.res);
        const row = Math.floor(agent.y / this.res);
        
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
        
        const idx = row * this.cols + col;
        this.survivalGrid[idx] += agent.stressSurvivalTime || agent.age;
        this.visitGrid[idx]++;
    }
    
    /**
     * Get average survival time at position
     */
    getAverageSurvival(x, y) {
        const col = Math.floor(x / this.res);
        const row = Math.floor(y / this.res);
        
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return 0;
        
        const idx = row * this.cols + col;
        if (this.visitGrid[idx] === 0) return 0;
        
        return this.survivalGrid[idx] / this.visitGrid[idx];
    }
    
    /**
     * Update max value for normalization
     */
    updateMax() {
        let max = 1;
        for (let i = 0; i < this.survivalGrid.length; i++) {
            if (this.visitGrid[i] > 0) {
                const avg = this.survivalGrid[i] / this.visitGrid[i];
                max = Math.max(max, avg);
            }
        }
        this.maxAvgSurvival = max;
    }
    
    /**
     * Clear the heatmap
     */
    clear() {
        this.survivalGrid.fill(0);
        this.visitGrid.fill(0);
        this.maxAvgSurvival = 1;
    }
    
    /**
     * Get statistics
     */
    getStats() {
        let totalSurvival = 0;
        let totalVisits = 0;
        let safestCell = { x: 0, y: 0, value: 0 };
        let deadliestCell = { x: 0, y: 0, value: Infinity };
        
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const idx = r * this.cols + c;
                const visits = this.visitGrid[idx];
                
                if (visits > 0) {
                    const avg = this.survivalGrid[idx] / visits;
                    totalSurvival += this.survivalGrid[idx];
                    totalVisits += visits;
                    
                    if (avg > safestCell.value) {
                        safestCell = { x: c * this.res, y: r * this.res, value: avg };
                    }
                    if (avg < deadliestCell.value && avg > 0) {
                        deadliestCell = { x: c * this.res, y: r * this.res, value: avg };
                    }
                }
            }
        }
        
        return {
            averageSurvival: totalVisits > 0 ? totalSurvival / totalVisits : 0,
            safestZone: safestCell,
            deadliestZone: deadliestCell.value === Infinity ? null : deadliestCell,
            coverage: (totalVisits / (this.cols * this.rows * 2000)) * 100 // Approximate coverage
        };
    }
}