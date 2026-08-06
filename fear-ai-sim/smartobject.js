/**
 * Smart Object System
 * Phase 10: Environmental Interaction (T10.1)
 * 
 * Inspired by F.E.A.R. AI. Tags environmental obstacles with semantic interaction data.
 * Instead of just pathing around, agents can vault over, crawl under, or use for cover.
 */

export const SMART_OBJECT_TYPES = {
    COVER: 'COVER',
    VAULT: 'VAULT',
    CRAWL: 'CRAWL'
};

export class SmartObject {
    constructor(x, y, w, h, type) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.type = type;
        
        // Interaction points (where agent should stand to interact)
        this.interactionPoints = this.calculateInteractionPoints();
    }

    calculateInteractionPoints() {
        const points = [];
        const padding = 10; // Distance from the object
        
        if (this.type === SMART_OBJECT_TYPES.COVER) {
            // Can take cover behind any of the 4 sides
            points.push({ x: this.x + this.w / 2, y: this.y - padding, side: 'top' });
            points.push({ x: this.x + this.w / 2, y: this.y + this.h + padding, side: 'bottom' });
            points.push({ x: this.x - padding, y: this.y + this.h / 2, side: 'left' });
            points.push({ x: this.x + this.w + padding, y: this.y + this.h / 2, side: 'right' });
        } else if (this.type === SMART_OBJECT_TYPES.VAULT || this.type === SMART_OBJECT_TYPES.CRAWL) {
            // Usually approach from the longer side
            if (this.w > this.h) {
                points.push({ x: this.x + this.w / 2, y: this.y - padding, dir: 'down' });
                points.push({ x: this.x + this.w / 2, y: this.y + this.h + padding, dir: 'up' });
            } else {
                points.push({ x: this.x - padding, y: this.y + this.h / 2, dir: 'right' });
                points.push({ x: this.x + this.w + padding, y: this.y + this.h / 2, dir: 'left' });
            }
        }
        
        return points;
    }
}

export class SmartObjectSystem {
    constructor() {
        this.smartObjects = [];
    }

    registerObject(x, y, w, h, type) {
        const obj = new SmartObject(x, y, w, h, type);
        this.smartObjects.push(obj);
        return obj;
    }

    /**
     * Find nearest smart object of a specific type
     */
    findNearest(x, y, type = null, maxDist = Infinity) {
        let nearest = null;
        let minDistSq = maxDist * maxDist;

        for (const obj of this.smartObjects) {
            if (type && obj.type !== type) continue;

            const cx = obj.x + obj.w / 2;
            const cy = obj.y + obj.h / 2;
            const distSq = (cx - x) ** 2 + (cy - y) ** 2;

            if (distSq < minDistSq) {
                minDistSq = distSq;
                nearest = obj;
            }
        }

        return nearest;
    }

    /**
     * Get the best interaction point for a cover object relative to a threat
     */
    getBestCoverPoint(smartObject, threatX, threatY) {
        if (!smartObject || smartObject.type !== SMART_OBJECT_TYPES.COVER) return null;

        let bestPoint = null;
        let maxDistSq = -1; // Want the point farthest from threat (behind cover)

        for (const pt of smartObject.interactionPoints) {
            const distSq = (pt.x - threatX) ** 2 + (pt.y - threatY) ** 2;
            if (distSq > maxDistSq) {
                maxDistSq = distSq;
                bestPoint = pt;
            }
        }

        return bestPoint;
    }
    
    draw(ctx) {
        ctx.save();
        this.smartObjects.forEach(obj => {
            // Draw object
            if (obj.type === SMART_OBJECT_TYPES.COVER) ctx.fillStyle = 'rgba(100, 100, 200, 0.5)';
            else if (obj.type === SMART_OBJECT_TYPES.VAULT) ctx.fillStyle = 'rgba(200, 150, 50, 0.5)';
            else ctx.fillStyle = 'rgba(100, 200, 100, 0.5)';
            
            ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
            ctx.strokeStyle = '#fff';
            ctx.strokeRect(obj.x, obj.y, obj.w, obj.h);
            
            // Draw interaction points
            ctx.fillStyle = '#fff';
            obj.interactionPoints.forEach(pt => {
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
                ctx.fill();
            });
        });
        ctx.restore();
    }
    
    clear() {
        this.smartObjects = [];
    }
}
