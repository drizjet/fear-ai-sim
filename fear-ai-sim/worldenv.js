/**
 * Procedural Environment Generator
 * Part of the Fear-AI Omniverse (Phase 10/11 extension)
 * 
 * Generates heightmaps, moisture maps, and biomes using Simplex-like noise.
 */

export const BIOMES = {
    WATER: { id: 0, name: 'Water', color: '#0044ff', cost: 5.0, fearMult: 1.2 },
    SAND: { id: 1, name: 'Sand', color: '#eedd88', cost: 1.2, fearMult: 1.0 },
    GRASS: { id: 2, name: 'Grass', color: '#33aa33', cost: 1.0, fearMult: 0.8 },
    FOREST: { id: 3, name: 'Forest', color: '#005500', cost: 1.5, fearMult: 1.1, stealth: 0.5 },
    MOUNTAIN: { id: 4, name: 'Mountain', color: '#666666', cost: 3.0, fearMult: 1.3 },
    SNOW: { id: 5, name: 'Snow', color: '#ffffff', cost: 2.0, fearMult: 1.2 }
};

export class WorldEnvironment {
    constructor(width, height, res = 20) {
        this.width = width;
        this.height = height;
        this.res = res;
        this.cols = Math.ceil(width / res);
        this.rows = Math.ceil(height / res);
        
        this.grid = new Int8Array(this.cols * this.rows); // Biome IDs
        this.heightMap = new Float32Array(this.cols * this.rows);
        this.moistureMap = new Float32Array(this.cols * this.rows);
        
        this.generate();
    }

    generate() {
        const seed1 = Math.random() * 1000;
        const seed2 = Math.random() * 1000;

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const idx = r * this.cols + c;
                
                // Simplified Noise (Sum of sines for "fake" Perlin)
                const nx = c / this.cols - 0.5;
                const ny = r / this.rows - 0.5;
                
                // Height: Radial mask + layered frequencies
                let h = 0.5 + 0.5 * Math.sin(nx * 10 + seed1) * Math.cos(ny * 8 + seed1);
                h += 0.25 * Math.sin(nx * 20 + seed1 * 2) * Math.cos(ny * 15 + seed1 * 2);
                const dist = Math.sqrt(nx*nx + ny*ny);
                h *= (1.0 - dist * 1.5); // Falloff at edges for island effect
                
                this.heightMap[idx] = h;

                // Moisture
                let m = 0.5 + 0.5 * Math.sin(nx * 5 + seed2) * Math.cos(ny * 5 + seed2);
                this.moistureMap[idx] = m;

                // Determine Biome
                this.grid[idx] = this.determineBiome(h, m);
            }
        }
    }

    determineBiome(h, m) {
        if (h < 0.15) return BIOMES.WATER.id;
        if (h < 0.25) return BIOMES.SAND.id;
        if (h > 0.75) return BIOMES.MOUNTAIN.id;
        if (h > 0.85) return BIOMES.SNOW.id;
        
        if (m > 0.6) return BIOMES.FOREST.id;
        return BIOMES.GRASS.id;
    }

    getBiomeAt(x, y) {
        const c = Math.floor(x / this.res);
        const r = Math.floor(y / this.res);
        if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return BIOMES.WATER;
        
        const id = this.grid[r * this.cols + c];
        return Object.values(BIOMES).find(b => b.id === id);
    }

    draw(ctx) {
        // Draw Biomes
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const id = this.grid[r * this.cols + c];
                const biome = Object.values(BIOMES).find(b => b.id === id);
                ctx.fillStyle = biome.color;
                ctx.fillRect(c * this.res, r * this.res, this.res, this.res);
            }
        }

        // Draw Grid Overlay (T10/11 RTS Polish)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (let c = 0; c <= this.cols; c++) {
            ctx.moveTo(c * this.res, 0);
            ctx.lineTo(c * this.res, this.height);
        }
        for (let r = 0; r <= this.rows; r++) {
            ctx.moveTo(0, r * this.res);
            ctx.lineTo(this.width, r * this.res);
        }
        ctx.stroke();
    }
}
