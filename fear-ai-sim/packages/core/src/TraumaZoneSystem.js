/**
 * TraumaZoneSystem - Persistent spatial trauma memory.
 * Coordinates where violence, attacks, or extreme terror occurred retain residual
 * psychological dread that decays deterministically across simulation ticks.
 */

export class TraumaZoneSystem {
    /**
     * @param {object} [config={}]
     */
    constructor(config = {}) {
        this.maxZones = config.maxZones || 100;
        this.zones = []; // Array<{ id, x, y, z, intensity, radius, lifetimeTicks, maxLifetime }>
        this.nextZoneId = 1;
    }

    /**
     * Record a new trauma zone
     * @param {number} x
     * @param {number} y
     * @param {number} [z=0]
     * @param {number} [intensity=1.0] - 0..1
     * @param {number} [radius=150]
     * @param {number} [lifetimeTicks=1800] - 30s at 60Hz
     * @returns {number} zone id
     */
    addZone(x, y, z = 0, intensity = 1.0, radius = 150, lifetimeTicks = 1800) {
        const id = this.nextZoneId++;
        this.zones.push({
            id,
            x: Number(x) || 0,
            y: Number(y) || 0,
            z: Number(z) || 0,
            intensity: Math.max(0, Math.min(1.0, Number(intensity) || 1.0)),
            radius: Math.max(1, Number(radius) || 150),
            lifetimeTicks: Math.max(1, Math.floor(lifetimeTicks)),
            maxLifetime: Math.max(1, Math.floor(lifetimeTicks))
        });

        if (this.zones.length > this.maxZones) {
            this.zones.shift();
        }
        return id;
    }

    /**
     * Advance trauma zone decay deterministically
     * @param {number} [deltaTicks=1]
     */
    tick(deltaTicks = 1) {
        if (deltaTicks <= 0) return;
        for (let i = this.zones.length - 1; i >= 0; i--) {
            const z = this.zones[i];
            z.lifetimeTicks -= deltaTicks;
            // Linear and exponential decay blend
            z.intensity *= Math.pow(0.999, deltaTicks);

            if (z.lifetimeTicks <= 0 || z.intensity < 0.02) {
                this.zones.splice(i, 1);
            }
        }
    }

    /**
     * Calculate aggregate trauma dread at coordinate
     * @param {number} x
     * @param {number} y
     * @param {number} [z=0]
     * @returns {number} trauma intensity in [0, 1]
     */
    getTraumaAt(x, y, z = 0) {
        let total = 0;
        const targetX = Number(x) || 0;
        const targetY = Number(y) || 0;
        const targetZ = Number(z) || 0;

        for (let i = 0; i < this.zones.length; i++) {
            const zone = this.zones[i];
            const dx = targetX - zone.x;
            const dy = targetY - zone.y;
            const dz = targetZ - zone.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            const radiusSq = zone.radius * zone.radius;

            if (distSq < radiusSq) {
                const dist = Math.sqrt(distSq);
                const distanceFactor = 1.0 - (dist / zone.radius);
                total += zone.intensity * distanceFactor;
            }
        }
        return Math.min(1.0, total);
    }

    clear() {
        this.zones = [];
    }

    getState() {
        return {
            maxZones: this.maxZones,
            nextZoneId: this.nextZoneId,
            zones: this.zones.map(z => ({ ...z }))
        };
    }

    setState(snapshot) {
        if (!snapshot) return;
        if (Number.isFinite(snapshot.maxZones) && snapshot.maxZones >= 1) {
            this.maxZones = Math.floor(snapshot.maxZones);
        }
        this.nextZoneId = snapshot.nextZoneId || 1;
        this.zones = Array.isArray(snapshot.zones) ? snapshot.zones.map(z => ({ ...z })) : [];
    }
}

export default TraumaZoneSystem;
