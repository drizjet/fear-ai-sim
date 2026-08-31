export class ThreatHeatmap {
    constructor(width, height, resolution = 20) {
        this.width = width;
        this.height = height;
        this.res = resolution;
        this.cols = Math.ceil(width / resolution);
        this.rows = Math.ceil(height / resolution);
        this.grid = new Float32Array(this.cols * this.rows);
    }

    update(predators) {
        // Decay existing threat
        for (let i = 0; i < this.grid.length; i++) {
            this.grid[i] *= 0.95;
        }

        // Add threat from Predators based on their fear properties
        predators.forEach(predator => {
            const fearProps = predator.getFearProperties ? predator.getFearProperties() : { radius: 200, intensity: 0.8 };
            const gx = Math.floor(predator.x / this.res);
            const gy = Math.floor(predator.y / this.res);
            
            // Influence radius in grid cells (fearRadius converted to grid units)
            const radius = Math.ceil(fearProps.radius / this.res);
            const intensity = fearProps.intensity;
            
            for (let i = -radius; i <= radius; i++) {
                for (let j = -radius; j <= radius; j++) {
                    const col = gx + i;
                    const row = gy + j;
                    if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
                        const dist = Math.sqrt(i*i + j*j);
                        if (dist < radius) {
                            const weight = (1 - dist / radius) * 0.5 * intensity;
                            this.grid[row * this.cols + col] = Math.min(1.0, this.grid[row * this.cols + col] + weight);
                        }
                    }
                }
            }
        });
    }

    getThreat(x, y) {
        const col = Math.floor(x / this.res);
        const row = Math.floor(y / this.res);
        if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
            return this.grid[row * this.cols + col];
        }
        return 0;
    }

    draw(ctx) {
        ctx.globalAlpha = 0.3;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const val = this.grid[r * this.cols + c];
                if (val > 0.01) {
                    ctx.fillStyle = `rgb(${Math.floor(val * 255)}, 0, 0)`;
                    ctx.fillRect(c * this.res, r * this.res, this.res, this.res);
                }
            }
        }
        ctx.globalAlpha = 1.0;
    }
}

export class ActionHeatmap {
    constructor(width, height, resolution = 20) {
        this.width = width;
        this.height = height;
        this.res = resolution;
        this.cols = Math.ceil(width / resolution);
        this.rows = Math.ceil(height / resolution);
        this.grid = new Float32Array(this.cols * this.rows);
    }

    update(agents) {
        // Higher decay for action mapping (more dynamic)
        for (let i = 0; i < this.grid.length; i++) {
            this.grid[i] *= 0.92;
        }

        // Add action intensity from panicking agents
        agents.forEach(a => {
            if (a.brain.state === 'PANIC') {
                const gx = Math.floor(a.x / this.res);
                const gy = Math.floor(a.y / this.res);
                if (gx >= 0 && gx < this.cols && gy >= 0 && gy < this.rows) {
                    this.grid[gy * this.cols + gx] = Math.min(1.0, this.grid[gy * this.cols + gx] + 0.1);
                }
            }
        });
    }

    draw(ctx) {
        ctx.globalAlpha = 0.2;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const val = this.grid[r * this.cols + c];
                if (val > 0.05) {
                    // Cyan-White gradient for 'action'
                    const r_comp = Math.floor(val * 100);
                    const g_comp = Math.floor(val * 255);
                    const b_comp = 255;
                    ctx.fillStyle = `rgb(${r_comp}, ${g_comp}, ${b_comp})`;
                    ctx.fillRect(c * this.res, r * this.res, this.res, this.res);
                }
            }
        }
        ctx.globalAlpha = 1.0;
    }
}
