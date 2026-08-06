/**
 * Emotion Map: Grid-based Fear and Anger Diffusion (T5.7, T12.3)
 * Phase 15: Mass Scaling & Mean-Field Tribalism
 * 
 * Provides an O(1) environmental representation of "The Collective Arousal"
 * for massive crowds (10,000+ units).
 */

export class EmotionMap {
    constructor(width, height, res = 20) {
        this.width = width;
        this.height = height;
        this.res = res;
        this.cols = Math.ceil(width / res);
        this.rows = Math.ceil(height / res);
        
        // Two layers: Arousal (Fear) and Tension (Anger/Aggression)
        this.arousal = new Float32Array(this.cols * this.rows);
        this.tension = new Float32Array(this.cols * this.rows);
        
        this.diffusionRate = 0.1;
        this.decayRate = 0.98;
    }

    getIdx(x, y) {
        const c = Math.floor(Math.max(0, Math.min(this.width - 1, x)) / this.res);
        const r = Math.floor(Math.max(0, Math.min(this.height - 1, y)) / this.res);
        return r * this.cols + c;
    }

    /**
     * Deposit emotion into the grid (called by agents)
     */
    deposit(x, y, fear, anger) {
        const idx = this.getIdx(x, y);
        this.arousal[idx] = Math.max(this.arousal[idx], fear);
        this.tension[idx] = Math.max(this.tension[idx], anger);
    }

    /**
     * GPU-inspired Diffusion (Box Blur Approximation)
     */
    update() {
        const nextArousal = new Float32Array(this.arousal.length);
        const nextTension = new Float32Array(this.tension.length);

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const idx = r * this.cols + c;
                
                // Average with neighbors (4-way diffusion)
                let sumA = this.arousal[idx];
                let sumT = this.tension[idx];
                let neighbors = 1;

                const check = (cc, rr) => {
                    if (cc >= 0 && cc < this.cols && rr >= 0 && rr < this.rows) {
                        const i = rr * this.cols + cc;
                        sumA += this.arousal[i];
                        sumT += this.tension[i];
                        neighbors++;
                    }
                };

                check(c + 1, r);
                check(c - 1, r);
                check(c, r + 1);
                check(c, r - 1);

                nextArousal[idx] = (sumA / neighbors) * this.decayRate;
                nextTension[idx] = (sumT / neighbors) * this.decayRate;
            }
        }

        this.arousal = nextArousal;
        this.tension = nextTension;
    }

    getEmotionAt(x, y) {
        const idx = this.getIdx(x, y);
        return {
            fear: this.arousal[idx],
            anger: this.tension[idx]
        };
    }

    /**
     * Calculate Fear Gradient (Pressure Vector)
     * Points AWAY from high-fear zones
     */
    getFearGradient(x, y) {
        const c = Math.floor(x / this.res);
        const r = Math.floor(y / this.res);
        
        const getA = (cc, rr) => {
            if (cc < 0 || cc >= this.cols || rr < 0 || rr >= this.rows) return 0;
            return this.arousal[rr * this.cols + cc];
        };

        const dx = getA(c - 1, r) - getA(c + 1, r);
        const dy = getA(c, r - 1) - getA(c, r + 1);
        
        return { dx, dy };
    }

    draw(ctx) {
        // Draw debug visualization of the fear grid
        ctx.save();
        ctx.globalAlpha = 0.3;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const fear = this.arousal[r * this.cols + c];
                const anger = this.tension[r * this.cols + c];
                if (fear > 0.1 || anger > 0.1) {
                    ctx.fillStyle = `rgb(${Math.floor(fear * 255)}, ${Math.floor(anger * 100)}, 100)`;
                    ctx.fillRect(c * this.res, r * this.res, this.res, this.res);
                }
            }
        }
        ctx.restore();
    }
}
