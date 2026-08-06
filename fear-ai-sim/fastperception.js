/**
 * FastPerception - Optimized perception gathering for data collection
 * Minimizes allocations, uses spatial queries efficiently
 */

export class FastPerception {
    constructor(simulation) {
        this.sim = simulation;
        
        // Pre-allocated result objects to avoid GC
        this._result = {
            nearestPredator: null,
            predatorCount: { dangerZone: 0, cautionZone: 0, visible: 0 },
            allyCount: 0,
            nearestAllyDistance: 9999,
            inSafeHaven: false
        };
        
        // Reusable distance calculation
        this._dx = 0;
        this._dy = 0;
        this._distSq = 0;
    }
    
    /**
     * Gather perception for agent (optimized, minimal allocations)
     */
    gather(agent) {
        // Reset result object (reuse)
        this._result.nearestPredator = null;
        this._result.predatorCount.dangerZone = 0;
        this._result.predatorCount.cautionZone = 0;
        this._result.predatorCount.visible = 0;
        this._result.allyCount = 0;
        this._result.nearestAllyDistance = 9999;
        this._result.inSafeHaven = false;
        
        let nearestPredDistSq = Infinity;
        
        // Check predators
        for (const predator of this.sim.predators) {
            this._dx = predator.x - agent.x;
            this._dy = predator.y - agent.y;
            this._distSq = this._dx * this._dx + this._dy * this._dy;
            
            const dist = Math.sqrt(this._distSq);
            
            // Track nearest
            if (this._distSq < nearestPredDistSq) {
                nearestPredDistSq = this._distSq;
                this._result.nearestPredator = {
                    id: predator.id,
                    distance: dist,
                    angle: Math.atan2(this._dy, this._dx),
                    type: predator.type
                };
            }
            
            // Count by zone
            if (dist < 100) {
                this._result.predatorCount.dangerZone++;
            } else if (dist < 300) {
                this._result.predatorCount.cautionZone++;
            }
            
            if (dist < 150) { // Visibility radius
                this._result.predatorCount.visible++;
            }
        }
        
        // Check allies (using spatial hash if available, else linear)
        const agents = this.sim.spatialHash 
            ? this.sim.spatialHash.query(agent.x, agent.y, 100)
            : this.sim.agents;
        
        for (const other of agents) {
            if (other === agent || other.dead) continue;
            
            this._dx = other.x - agent.x;
            this._dy = other.y - agent.y;
            this._distSq = this._dx * this._dx + this._dy * this._dy;
            
            if (this._distSq < 10000) { // 100 units
                this._result.allyCount++;
                const dist = Math.sqrt(this._distSq);
                if (dist < this._result.nearestAllyDistance) {
                    this._result.nearestAllyDistance = dist;
                }
            }
        }
        
        // Check safe haven
        for (const haven of this.sim.safeHavens || []) {
            this._dx = haven.x - agent.x;
            this._dy = haven.y - agent.y;
            if ((this._dx * this._dx + this._dy * this._dy) < haven.radius * haven.radius) {
                this._result.inSafeHaven = true;
                break;
            }
        }
        
        // Return copy to prevent external mutation
        return {
            nearestPredator: this._result.nearestPredator,
            predatorCount: { ...this._result.predatorCount },
            allyCount: this._result.allyCount,
            nearestAllyDistance: this._result.nearestAllyDistance,
            inSafeHaven: this._result.inSafeHaven
        };
    }
    
    /**
     * Get global context (population-level features)
     */
    getContext(agent) {
        let localPanicCount = 0;
        let totalNearby = 0;
        
        // Sample nearby agents for local panic density
        const nearbyAgents = this.sim.spatialHash 
            ? this.sim.spatialHash.query(agent.x, agent.y, 100)
            : this.sim.agents.filter(a => !a.dead && a !== agent);
        
        for (const other of nearbyAgents) {
            if (other === agent) continue;
            
            this._dx = other.x - agent.x;
            this._dy = other.y - agent.y;
            if (this._dx * this._dx + this._dy * this._dy < 10000) {
                totalNearby++;
                if (other.brain?.state === 'PANIC') {
                    localPanicCount++;
                }
            }
        }
        
        // Count total panicking agents
        let totalPanic = 0;
        let totalAlive = 0;
        for (const a of this.sim.agents) {
            if (!a.dead) {
                totalAlive++;
                if (a.brain?.state === 'PANIC') totalPanic++;
            }
        }
        
        return {
            globalPanicRatio: totalAlive > 0 ? totalPanic / totalAlive : 0,
            localPanicDensity: totalNearby > 0 ? localPanicCount / totalNearby : 0,
            nearbyDeathsLast10s: this._countRecentDeaths(agent.x, agent.y, 100, 600), // 10s at 60fps
            groupCohesion: this._calculateCohesion(agent, nearbyAgents)
        };
    }
    
    /**
     * Count deaths near position in last N ticks
     */
    _countRecentDeaths(x, y, radius, ticks) {
        // This would need a death log - simplified version
        return 0;
    }
    
    /**
     * Calculate group cohesion (0 = scattered, 1 = tight cluster)
     */
    _calculateCohesion(agent, nearbyAgents) {
        if (nearbyAgents.length < 2) return 1.0;
        
        let totalDist = 0;
        let count = 0;
        
        for (const other of nearbyAgents) {
            if (other === agent) continue;
            this._dx = other.x - agent.x;
            this._dy = other.y - agent.y;
            totalDist += Math.sqrt(this._dx * this._dx + this._dy * this._dy);
            count++;
        }
        
        const avgDist = count > 0 ? totalDist / count : 0;
        // Normalize: <30 = cohesive (1.0), >100 = scattered (0.0)
        return Math.max(0, Math.min(1, 1 - (avgDist - 30) / 70));
    }
}
