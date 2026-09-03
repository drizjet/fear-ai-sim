/**
 * FearPheromoneSystem: Persistent fear trails left by panicking agents
 * Creates an environmental memory of panic events that fades over time
 */
export class FearPheromoneSystem {
    constructor(width, height, resolution = 10) {
        this.width = width;
        this.height = height;
        this.res = resolution;
        this.cols = Math.ceil(width / resolution);
        this.rows = Math.ceil(height / resolution);
        
        // Grid stores pheromone intensity and age
        this.grid = new Float32Array(this.cols * this.rows);
        this.ageGrid = new Uint32Array(this.cols * this.rows); // Age in frames
        
        this.decayRate = 0.995;      // Slow decay
        this.diffusionRate = 0.1;    // Spread to neighbors
        this.maxAge = 60 * 30;       // 30 seconds at 60fps
        
        // Visual tracking
        this.activeCells = new Set(); // Track which cells have pheromones
    }
    
    /**
     * Deposit pheromone at agent position
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} intensity - Fear intensity (0-1)
     * @param {string} state - Agent state (more intense for PANIC)
     */
    deposit(x, y, intensity, state = 'CALM') {
        const col = Math.floor(x / this.res);
        const row = Math.floor(y / this.res);
        
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
        
        const idx = row * this.cols + col;
        
        // Higher deposit rate for panicking agents
        const depositAmount = state === 'PANIC' ? intensity * 0.8 : 
                              state === 'ANXIOUS' ? intensity * 0.3 : 
                              intensity * 0.1;
        
        this.grid[idx] = Math.min(1.0, this.grid[idx] + depositAmount);
        this.ageGrid[idx] = 0;
        this.activeCells.add(idx);
    }
    
    /**
     * Get pheromone intensity at position
     */
    getIntensity(x, y) {
        const col = Math.floor(x / this.res);
        const row = Math.floor(y / this.res);
        
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return 0;
        
        return this.grid[row * this.cols + col];
    }
    
    /**
     * Get pheromone gradient at position (for agent steering)
     * Returns direction of steepest pheromone increase
     */
    getGradient(x, y) {
        const col = Math.floor(x / this.res);
        const row = Math.floor(y / this.res);
        
        if (col < 1 || col >= this.cols - 1 || row < 1 || row >= this.rows - 1) {
            return { dx: 0, dy: 0 };
        }
        
        const idx = row * this.cols + col;
        
        // Sample neighboring cells
        const left = this.grid[row * this.cols + (col - 1)];
        const right = this.grid[row * this.cols + (col + 1)];
        const up = this.grid[(row - 1) * this.cols + col];
        const down = this.grid[(row + 1) * this.cols + col];
        
        // Calculate gradient (avoid pheromones = negative gradient)
        const dx = left - right;
        const dy = up - down;
        
        // Normalize
        const mag = Math.sqrt(dx * dx + dy * dy);
        if (mag > 0) {
            return { dx: dx / mag, dy: dy / mag };
        }
        return { dx: 0, dy: 0 };
    }
    
    /**
     * Update pheromone system (decay and diffusion)
     * Phase 5: Optimization (T5.7) - Optimized diffusion
     */
    update() {
        const grid = this.grid;
        const newGrid = new Float32Array(grid.length);
        const cols = this.cols;
        const rows = this.rows;
        const decay = this.decayRate;
        const diff = this.diffusionRate;
        const cellsToRemove = [];
        
        this.activeCells.forEach(idx => {
            const row = Math.floor(idx / cols);
            const col = idx % cols;
            
            // Age the pheromone
            this.ageGrid[idx]++;
            
            // Calculate age-based decay
            const ageFactor = 1 - (this.ageGrid[idx] / this.maxAge);
            if (ageFactor <= 0) {
                cellsToRemove.push(idx);
                return;
            }
            
            // Diffusion kernel (3x3 average inspired)
            let sum = grid[idx];
            let neighbors = 1;
            
            if (col > 0) { sum += grid[idx - 1]; neighbors++; }
            if (col < cols - 1) { sum += grid[idx + 1]; neighbors++; }
            if (row > 0) { sum += grid[idx - cols]; neighbors++; }
            if (row < rows - 1) { sum += grid[idx + cols]; neighbors++; }
            
            const diffusedValue = (sum / neighbors) * diff + grid[idx] * (1 - diff);
            let value = diffusedValue * decay * ageFactor;
            
            newGrid[idx] = Math.min(1.0, value);
            
            if (newGrid[idx] < 0.01) {
                cellsToRemove.push(idx);
            }
        });
        
        // Update grid using fast copy
        this.activeCells.forEach(idx => {
            this.grid[idx] = newGrid[idx];
        });
        
        // Remove dead cells
        cellsToRemove.forEach(idx => {
            this.activeCells.delete(idx);
            this.grid[idx] = 0;
            this.ageGrid[idx] = 0;
        });
    }
    
    /**
     * Draw pheromone trails
     */
    draw(ctx) {
        if (this.activeCells.size === 0) return;
        
        ctx.save();
        ctx.globalAlpha = 0.3;
        
        this.activeCells.forEach(idx => {
            const row = Math.floor(idx / this.cols);
            const col = idx % this.cols;
            const intensity = this.grid[idx];
            const age = this.ageGrid[idx];
            
            // Color shifts from red (fresh) to purple (old)
            const ageRatio = age / this.maxAge;
            const r = Math.floor(255 * (1 - ageRatio * 0.5));
            const g = Math.floor(50 * (1 - ageRatio));
            const b = Math.floor(100 + 155 * ageRatio);
            
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${intensity * 0.4})`;
            ctx.fillRect(col * this.res, row * this.res, this.res, this.res);
        });
        
        ctx.restore();
    }
    
    /**
     * Clear all pheromones
     */
    clear() {
        this.grid.fill(0);
        this.ageGrid.fill(0);
        this.activeCells.clear();
    }
    
    /**
     * Get statistics for analytics
     */
    getStats() {
        let totalIntensity = 0;
        let freshTrails = 0; // < 5 seconds old
        let oldTrails = 0;   // > 15 seconds old
        
        this.activeCells.forEach(idx => {
            totalIntensity += this.grid[idx];
            const age = this.ageGrid[idx];
            if (age < 60 * 5) freshTrails++;
            if (age > 60 * 15) oldTrails++;
        });
        
        return {
            activeCells: this.activeCells.size,
            totalIntensity,
            freshTrails,
            oldTrails,
            coverage: (this.activeCells.size / this.grid.length * 100).toFixed(2) + '%'
        };
    }
}