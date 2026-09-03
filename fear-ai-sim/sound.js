/**
 * Acoustic Detection System: Sound waves propagate slower than visual detection
 * Creates a "fear echo" effect where agents hear threats before seeing them
 */
export class SoundWave {
    constructor(x, y, intensity, source = 'predator', type = 'ROAR') {
        this.x = x;
        this.y = y;
        this.radius = 0;
        this.maxRadius = type === 'ROAR' ? 400 : 200;
        this.intensity = intensity; // 0-1
        this.source = source;
        this.type = type; // ROAR, FOOTSTEP, PANIC_SCREAM
        
        // Speed of sound (pixels per frame)
        this.speed = type === 'ROAR' ? 4 : 2;
        this.decay = 0.995;
        
        this.lifetime = 0;
        this.maxLifetime = 120; // 2 seconds at 60fps
        this.dead = false;
    }
    
    update() {
        this.radius += this.speed;
        this.intensity *= this.decay;
        this.lifetime++;
        
        if (this.lifetime > this.maxLifetime || this.intensity < 0.01) {
            this.dead = true;
        }
    }
    
    /**
     * Check if a point can hear this sound wave
     * Returns intensity based on distance from wavefront
     */
    getIntensityAt(x, y) {
        const dx = x - this.x;
        const dy = y - this.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        // Sound is strongest at the wavefront (ring)
        const wavefrontWidth = 20;
        const distFromWavefront = Math.abs(dist - this.radius);
        
        if (distFromWavefront < wavefrontWidth && dist < this.maxRadius) {
            // Calculate intensity based on proximity to wavefront
            const factor = 1 - (distFromWavefront / wavefrontWidth);
            return this.intensity * factor;
        }
        
        return 0;
    }
    
    draw(ctx) {
        if (this.dead) return;
        
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        
        // Color based on type
        let color;
        switch (this.type) {
            case 'ROAR':
                color = `255, 50, 50`; // Red
                break;
            case 'FOOTSTEP':
                color = `200, 150, 50`; // Orange
                break;
            case 'PANIC_SCREAM':
                color = `255, 0, 255`; // Magenta
                break;
            default:
                color = `255, 255, 255`;
        }
        
        ctx.strokeStyle = `rgba(${color}, ${this.intensity * 0.3})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }
}

export class AcousticSystem {
    constructor() {
        this.soundWaves = [];
        this.newEvents = [];
    }
    
    /**
     * Emit a sound wave
     */
    emit(x, y, intensity, source, type = 'ROAR') {
        const wave = new SoundWave(x, y, intensity, source, type);
        this.soundWaves.push(wave);
        this.newEvents.push({ x, y, intensity, source, type, timestamp: Date.now() });
    }
    
    /**
     * Update all sound waves
     */
    update() {
        this.newEvents = []; // Clear events from previous frame
        for (let i = this.soundWaves.length - 1; i >= 0; i--) {
            const wave = this.soundWaves[i];
            wave.update();
            if (wave.dead) {
                this.soundWaves.splice(i, 1);
            }
        }
    }

    getNewEvents() {
        return this.newEvents;
    }
    
    /**
     * Get total sound intensity at a position
     * Returns { intensity, direction, type }
     */
    getSoundAt(x, y) {
        let totalIntensity = 0;
        let loudestWave = null;
        let maxIntensity = 0;
        
        this.soundWaves.forEach(wave => {
            const intensity = wave.getIntensityAt(x, y);
            if (intensity > 0) {
                totalIntensity += intensity;
                if (intensity > maxIntensity) {
                    maxIntensity = intensity;
                    loudestWave = wave;
                }
            }
        });
        
        if (loudestWave) {
            const dx = loudestWave.x - x;
            const dy = loudestWave.y - y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            return {
                intensity: totalIntensity,
                direction: { dx: dx / dist, dy: dy / dist },
                type: loudestWave.type,
                source: loudestWave.source
            };
        }
        
        return { intensity: 0, direction: { dx: 0, dy: 0 }, type: null, source: null };
    }
    
    draw(ctx) {
        this.soundWaves.forEach(wave => wave.draw(ctx));
    }
    
    clear() {
        this.soundWaves = [];
    }
}