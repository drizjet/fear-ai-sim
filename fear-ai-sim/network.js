/**
 * The Wired: Collective Intelligence Network for LainAI
 * Manages the flow of information between agents.
 */
export class TheWired {
    constructor(maxDistance = 60) {
        this.nodes = new Map(); // Map<agentId, { agent, signals, lastBroadcastIntensity }>
        this.maxDistance = maxDistance;
        this.signalDecay = 0.98;
        this.pulseThreshold = 0.2; // Only broadcast on significant Delta
        this.maxBroadcastsPerFrame = 100; // Phase 15: Limit simultaneous broadcasts
        this.broadcastCount = 0;
    }

    registerAgent(agent) {
        this.nodes.set(agent.id, {
            agent: agent,
            signals: new Map(), // Map<signalId, intensity>
            lastBroadcastIntensity: new Map(),
            lastUpdate: 0
        });
    }

    unregisterAgent(agentId) {
        this.nodes.delete(agentId);
    }

    /**
     * Broadcasts a signal from an agent to its immediate neighbors.
     * Pulse-Mode: Only fire if Delta > pulseThreshold.
     * Phase 15: Spatial-Optimized Broadcast (T15.4) - Uses spatial hash for O(1) queries
     */
    broadcast(sourceId, signalId, intensity, spatialHash = null) {
        const sourceNode = this.nodes.get(sourceId);
        if (!sourceNode) return;

        // Phase 15: Throttle broadcasts to prevent network overload
        if (this.broadcastCount >= this.maxBroadcastsPerFrame) return;

        // Check if change is significant enough to "fire" (Neuromorphic Pulse)
        const lastVal = sourceNode.lastBroadcastIntensity.get(signalId) || 0;
        if (Math.abs(intensity - lastVal) < this.pulseThreshold) return;

        // Apply signal to source and update last broadcast
        sourceNode.signals.set(signalId, intensity);
        sourceNode.lastBroadcastIntensity.set(signalId, intensity);
        this.broadcastCount++;

        // Propagate to nearby nodes
        const source = sourceNode.agent;
        if (!source) return; // Safety check
        
        // Phase 15: Use spatial hash for O(1) proximity query instead of O(N) scan
        const targets = spatialHash
            ? spatialHash.query(source.x, source.y, this.maxDistance)
            : Array.from(this.nodes.values())
                .map(n => n.agent)
                .filter(a => a && a.id !== sourceId); // Added null check for agent
        
        for (const target of targets) {
            if (!target || target.id === sourceId || target.isPredator) continue;
            
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const distSq = dx*dx + dy*dy;
            
            if (distSq < this.maxDistance * this.maxDistance) {
                const targetNode = this.nodes.get(target.id);
                if (!targetNode) continue;
                
                // Connection strength based on distance and agent's neuroticism
                const strength = (1 - Math.sqrt(distSq) / this.maxDistance);
                const currentVal = targetNode.signals.get(signalId) || 0;
                
                // Agents with high neuroticism amplify panic signals
                const multiplier = (signalId === 'PANIC' && target.brain.traits.neuroticism > 0.7) ? 1.5 : 1.0;
                
                targetNode.signals.set(signalId, Math.max(currentVal, intensity * strength * multiplier));
            }
        }
    }

    /**
     * Decays signals over time and cleans up.
     * Phase 15: Reset broadcast counter each frame.
     */
    update() {
        this.nodes.forEach(node => {
            node.signals.forEach((val, id) => {
                const newVal = val * this.signalDecay;
                if (newVal < 0.05) {
                    node.signals.delete(id);
                } else {
                    node.signals.set(id, newVal);
                }
            });
        });
        
        // Reset broadcast throttle counter
        this.broadcastCount = 0;
    }

    getSignalsForAgent(agentId) {
        const node = this.nodes.get(agentId);
        return node ? node.signals : new Map();
    }
}
