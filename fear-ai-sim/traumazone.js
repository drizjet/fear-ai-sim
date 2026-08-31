/**
 * Environmental Trauma Zone System
 * Phase 7: Research Refinement (T7.3)
 * 
 * Persistent markers at death locations that increase fear for nearby agents.
 */

export class TraumaZoneSystem {
    constructor() {
        this.zones = []; // { x, y, intensity, radius, lifetime }
        this.maxZones = 50;
    }

    /**
     * Record a new trauma zone (e.g. agent death)
     */
    addZone(x, y, intensity = 1.0, radius = 100) {
        this.zones.push({
            x, y, 
            intensity, 
            radius, 
            lifetime: 1800 // 30 seconds at 60fps
        });

        if (this.zones.length > this.maxZones) {
            this.zones.shift();
        }
    }

    /**
     * Update and decay zones
     */
    update() {
        for (let i = this.zones.length - 1; i >= 0; i--) {
            const zone = this.zones[i];
            zone.lifetime--;
            zone.intensity *= 0.999; // Very slow decay

            if (zone.lifetime <= 0 || zone.intensity < 0.05) {
                this.zones.splice(i, 1);
            }
        }
    }

    /**
     * Get total trauma intensity at a location
     */
    getTraumaAt(x, y) {
        let total = 0;
        this.zones.forEach(zone => {
            const dx = x - zone.x;
            const dy = y - zone.y;
            const distSq = dx*dx + dy*dy;
            
            if (distSq < zone.radius * zone.radius) {
                const dist = Math.sqrt(distSq);
                const factor = 1 - (dist / zone.radius);
                total += zone.intensity * factor;
            }
        });
        return Math.min(1.0, total);
    }

    /**
     * Draw zones for debugging (faint red glow)
     */
    draw(ctx) {
        ctx.save();
        this.zones.forEach(zone => {
            const gradient = ctx.createRadialGradient(zone.x, zone.y, 0, zone.x, zone.y, zone.radius);
            gradient.addColorStop(0, `rgba(255, 0, 0, ${zone.intensity * 0.15})`);
            gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    clear() {
        this.zones = [];
    }
}
