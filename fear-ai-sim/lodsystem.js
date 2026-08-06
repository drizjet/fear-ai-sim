/**
 * Level of Detail (LOD) System
 * Phase 5: Optimization (T5.5)
 * 
 * Manages update frequency and detail levels for agents based on distance
 */

export class LODSystem {
    constructor(focusPoint = { x: 500, y: 500 }) {
        this.focusPoint = focusPoint;
        
        // LOD Thresholds
        this.thresholds = {
            HIGH: 300,   // Full update every frame (HIGH_FIDELITY)
            MEDIUM: 700, // Update every 2nd frame (TACTICAL)
            LOW: 1500    // Update every 4th frame (CROWD - Mean Field)
        };
        
        this.frameCounter = 0;
    }

    /**
     * Phase 12.3: Get Intelligence Profile (LOD 2.0)
     */
    getIntelligenceProfile(agent) {
        const distSq = this.getDistanceSq(agent);
        
        if (distSq < this.thresholds.HIGH * this.thresholds.HIGH) {
            return 'HIGH_FIDELITY';
        } else if (distSq < this.thresholds.MEDIUM * this.thresholds.MEDIUM) {
            return 'TACTICAL';
        } else {
            return 'CROWD';
        }
    }

    /**
     * Update the focus point (e.g., player position)
     */
    updateFocus(x, y) {
        this.focusPoint.x = x;
        this.focusPoint.y = y;
        this.frameCounter++;
    }

    /**
     * Determine if an agent should update this frame
     */
    shouldUpdate(agent) {
        const distSq = this.getDistanceSq(agent);
        
        // High detail (close)
        if (distSq < this.thresholds.HIGH * this.thresholds.HIGH) {
            return true;
        }
        
        // Medium detail
        if (distSq < this.thresholds.MEDIUM * this.thresholds.MEDIUM) {
            return this.frameCounter % 2 === 0;
        }
        
        // Low detail
        return this.frameCounter % 4 === 0;
    }

    /**
     * Get detail level for rendering/logic
     */
    getDetailLevel(agent) {
        const distSq = this.getDistanceSq(agent);
        
        if (distSq < this.thresholds.HIGH * this.thresholds.HIGH) {
            return 'HIGH';
        } else if (distSq < this.thresholds.MEDIUM * this.thresholds.MEDIUM) {
            return 'MEDIUM';
        } else {
            return 'LOW';
        }
    }

    /**
     * Calculate squared distance to focus point
     */
    getDistanceSq(agent) {
        const dx = agent.x - this.focusPoint.x;
        const dy = agent.y - this.focusPoint.y;
        return dx * dx + dy * dy;
    }

    /**
     * Reset frame counter
     */
    reset() {
        this.frameCounter = 0;
    }
}
