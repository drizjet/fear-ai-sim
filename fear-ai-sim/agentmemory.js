/**
 * AgentMemory: Spatial memory of recent threats with social learning
 * Agents remember where they saw predators and share this info with nearby agents
 */
export class AgentMemory {
    constructor(capacity = 10) {
        this.capacity = capacity;
        this.memories = []; // Array of memory entries
        this.decayRate = 0.995; // Memory fades over time
        this.sharingRadius = 80; // How far agents can share memories
        
        // Phase 13.7: Causal Reasoning Buffer
        this.causalBuffer = []; // { timestamp, fearDelta, triggers: [] }
        this.currentContext = { location: { x: 0, y: 0 }, threatLevel: 0, nearbyAgents: [] };
    }
    
    /**
     * Phase 13.7: Infer the true cause of a fear spike
     * Correlation != Causation; this method attempts to find the "Trigger"
     */
    inferCausality(fearDelta, visuals, traumaIntensity) {
        if (fearDelta < 0.1) return; // Only process significant spikes

        const triggers = [];
        
        // 1. Direct Predator Threat (Primary Cause)
        visuals.threats.forEach(t => {
            if (t.dist < 100) triggers.push({ type: 'PREDATOR', weight: 1.0 / (t.dist + 1) });
        });

        // 2. Social Contagion (Second Cause)
        const panickingNeighbors = visuals.neighbors.filter(n => n.brain.state === 'PANIC').length;
        if (panickingNeighbors > 0) triggers.push({ type: 'SOCIAL_PANIC', weight: panickingNeighbors * 0.2 });

        // 3. Environmental Trauma (Third Cause)
        if (traumaIntensity > 0.5) triggers.push({ type: 'ENVIRONMENTAL_TRAUMA', weight: traumaIntensity });

        // Store in buffer
        this.causalBuffer.push({
            timestamp: Date.now(),
            fearDelta: fearDelta,
            triggers: triggers.sort((a, b) => b.weight - a.weight)
        });

        // Cleanup old causal data (keep last 5 seconds)
        if (this.causalBuffer.length > 50) this.causalBuffer.shift();

        // Update memories based on top trigger
        if (triggers.length > 0) {
            const topTrigger = triggers[0];
            if (topTrigger.type === 'PREDATOR' && visuals.threats.length > 0) {
                const nearest = visuals.threats[0];
                this.addMemory({
                    x: this.currentContext.location.x + (nearest.dx * nearest.dist),
                    y: this.currentContext.location.y + (nearest.dy * nearest.dist),
                    type: nearest.type,
                    intensity: nearest.intensity
                }, 1.0); // High confidence: Direct cause
            }
        }
    }
    
    /**
     * Add a new memory
     * @param {Object} threat - { x, y, type, intensity }
     * @param {number} confidence - 0-1 how sure the agent is
     */
    addMemory(threat, confidence = 1.0) {
        // Check if similar memory already exists
        const existingIdx = this.memories.findIndex(m => 
            Math.abs(m.x - threat.x) < 50 && 
            Math.abs(m.y - threat.y) < 50 &&
            m.type === threat.type
        );
        
        if (existingIdx !== -1) {
            // Strengthen existing memory
            this.memories[existingIdx].strength = Math.min(1, this.memories[existingIdx].strength + 0.3);
            this.memories[existingIdx].lastUpdated = Date.now();
            this.memories[existingIdx].confidence = Math.max(this.memories[existingIdx].confidence, confidence);
        } else {
            // Add new memory
            if (this.memories.length >= this.capacity) {
                // Remove weakest memory
                this.memories.sort((a, b) => a.strength - b.strength);
                this.memories.shift();
            }
            
            this.memories.push({
                x: threat.x,
                y: threat.y,
                type: threat.type,
                intensity: threat.intensity || 0.5,
                strength: 1.0,
                confidence: confidence,
                created: Date.now(),
                lastUpdated: Date.now()
            });
        }
    }
    
    /**
     * Update memory strengths (decay)
     */
    update() {
        for (let i = this.memories.length - 1; i >= 0; i--) {
            this.memories[i].strength *= this.decayRate;
            
            if (this.memories[i].strength < 0.1) {
                this.memories.splice(i, 1);
            }
        }
    }
    
    /**
     * Get memory-influenced fear at position
     * Returns 0-1 fear level based on nearby memories
     */
    getMemoryFearAt(x, y) {
        let totalFear = 0;
        
        this.memories.forEach(memory => {
            const dx = x - memory.x;
            const dy = y - memory.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            // Fear based on memory strength and distance
            const influenceRadius = 150;
            if (dist < influenceRadius) {
                const distanceFactor = 1 - (dist / influenceRadius);
                const fear = memory.strength * memory.intensity * distanceFactor * memory.confidence;
                totalFear += fear;
            }
        });
        
        return Math.min(1, totalFear);
    }
    
    /**
     * Get direction to avoid based on memories
     */
    getAvoidanceDirection(x, y) {
        let totalX = 0;
        let totalY = 0;
        let totalWeight = 0;
        
        this.memories.forEach(memory => {
            const dx = x - memory.x;
            const dy = y - memory.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist < 200 && dist > 0) {
                const weight = memory.strength * memory.intensity / dist;
                totalX += (dx / dist) * weight;
                totalY += (dy / dist) * weight;
                totalWeight += weight;
            }
        });
        
        if (totalWeight > 0) {
            return {
                dx: totalX / totalWeight,
                dy: totalY / totalWeight,
                weight: totalWeight
            };
        }
        
        return { dx: 0, dy: 0, weight: 0 };
    }
    
    /**
     * Share memories with another agent
     * @param {AgentMemory} otherMemory - Other agent's memory system
     * @param {number} trust - 0-1 how much to trust the other agent
     */
    shareMemories(otherMemory, trust = 0.7) {
        // Share strongest memories
        const memoriesToShare = this.memories
            .filter(m => m.strength > 0.5)
            .slice(0, 3);
        
        memoriesToShare.forEach(memory => {
            otherMemory.addMemory({
                x: memory.x,
                y: memory.y,
                type: memory.type,
                intensity: memory.intensity
            }, memory.confidence * trust);
        });
    }
    
    /**
     * Get strongest memory for visualization
     */
    getStrongestMemory() {
        if (this.memories.length === 0) return null;
        return this.memories.reduce((strongest, m) => 
            m.strength > strongest.strength ? m : strongest
        );
    }
    
    /**
     * Clear all memories
     */
    clear() {
        this.memories = [];
    }
    
    /**
     * Get memory statistics
     */
    getStats() {
        return {
            count: this.memories.length,
            averageStrength: this.memories.length > 0 
                ? this.memories.reduce((sum, m) => sum + m.strength, 0) / this.memories.length 
                : 0,
            oldestMemory: this.memories.length > 0
                ? Math.min(...this.memories.map(m => m.created))
                : null
        };
    }
}