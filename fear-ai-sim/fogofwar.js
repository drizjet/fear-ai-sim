/**
 * Fog of War: Visibility Masking & Information Superiority (T14.2)
 * Phase 14: Tactical Environmental Systems
 */

export class FogOfWar {
    constructor(width, height, res = 40) {
        this.width = width;
        this.height = height;
        this.res = res;
        this.cols = Math.ceil(width / res);
        this.rows = Math.ceil(height / res);
        
        // 0 = Unexplored (Black), 0.5 = Explored (Gray), 1.0 = Visible (Clear)
        this.grid = new Float32Array(this.cols * this.rows).fill(0);
        this.explorationMap = new Uint8Array(this.cols * this.rows).fill(0);
    }

    update(agents, predators) {
        // Decay current visibility to "Explored" (Fog)
        for (let i = 0; i < this.grid.length; i++) {
            if (this.grid[i] > 0.5) this.grid[i] -= 0.05;
            if (this.grid[i] < 0.5 && this.explorationMap[i]) this.grid[i] = 0.5;
        }

        // Project vision cones from agents
        agents.forEach(a => {
            if (a.dead) return;
            const r = 150 / this.res; // Vision radius in grid cells
            const cx = Math.floor(a.x / this.res);
            const cy = Math.floor(a.y / this.res);

            for (let i = -r; i <= r; i++) {
                for (let j = -r; j <= r; j++) {
                    const tx = cx + i;
                    const ty = cy + j;
                    if (tx >= 0 && tx < this.cols && ty >= 0 && ty < this.rows) {
                        const dSq = i * i + j * j;
                        if (dSq <= r * r) {
                            const idx = ty * this.cols + tx;
                            const val = 1.0 - (Math.sqrt(dSq) / r) * 0.5;
                            this.grid[idx] = Math.max(this.grid[idx], val);
                            this.explorationMap[idx] = 1;
                        }
                    }
                }
            }
        });
    }

    isVisible(x, y) {
        const c = Math.floor(x / this.res);
        const r = Math.floor(y / this.res);
        if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return false;
        return this.grid[r * this.cols + c] > 0.6;
    }

    draw(ctx) {
        ctx.save();
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const alpha = 1.0 - this.grid[r * this.cols + c];
                if (alpha > 0.1) {
                    ctx.fillStyle = `rgba(0, 0, 5, ${alpha})`;
                    ctx.fillRect(c * this.res, r * this.res, this.res, this.res);
                }
            }
        }
        ctx.restore();
    }
}
