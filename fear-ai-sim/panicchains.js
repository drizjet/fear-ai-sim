/**
 * PanicChainRenderer: Visualizes the contagion spread during mass panic events
 * Draws subtle connection lines from panicking agents to their panic source
 */
export class PanicChainRenderer {
    constructor(maxChains = 150, maxAge = 120) {
        this.maxChains = maxChains;     // Performance limit: max visible chains
        this.maxAge = maxAge;           // Frames before a chain fades (2 seconds at 60fps)
        this.chains = [];               // Active panic chains
        this.fadeRate = 1 / maxAge;     // Opacity decrement per frame
    }

    /**
     * Records a new panic chain connection
     * @param {Object} from - Source agent (the one who caused panic)
     * @param {Object} to - Target agent (the one who panicked)
     */
    addChain(from, to) {
        if (!from || !to) return;
        
        // Add new chain with full opacity
        this.chains.push({
            fromX: from.x,
            fromY: from.y,
            toX: to.x,
            toY: to.y,
            age: 0,
            opacity: 1.0,
            intensity: to.brain ? to.brain.currentFear : 0.5
        });

        // Trim to max chains (remove oldest)
        if (this.chains.length > this.maxChains) {
            this.chains.shift();
        }
    }

    /**
     * Bulk update chains from all agents with panicSourceId
     * @param {Array} agents - All agents in simulation
     * @param {Map} agentMap - Optional Map for O(1) agent lookups
     */
    updateFromAgents(agents, agentMap = null) {
        // Phase 15: Build id->agent map for O(1) lookups instead of O(N) find
        if (!agentMap) {
            agentMap = new Map();
            for (const agent of agents) {
                agentMap.set(agent.id, agent);
            }
        }
        
        // Find agents that just started panicking and have a panic source
        // Limit processing to prevent frame drops during mass panic
        const maxChainsPerUpdate = 20;
        let chainsAdded = 0;
        
        for (const agent of agents) {
            if (chainsAdded >= maxChainsPerUpdate) break;
            
            if (agent.brain && agent.brain.state === 'PANIC' && agent.panicSourceId !== null) {
                // O(1) lookup via Map instead of O(N) agents.find()
                const source = agentMap.get(agent.panicSourceId);
                if (source && !this.chainExists(source, agent)) {
                    this.addChain(source, agent);
                    chainsAdded++;
                }
            }
        }
    }

    /**
     * Check if a chain already exists between two agents
     */
    chainExists(from, to) {
        // Check recent chains to avoid duplicates
        const recentChains = this.chains.slice(-20);
        return recentChains.some(chain => 
            Math.abs(chain.fromX - from.x) < 1 && 
            Math.abs(chain.fromY - from.y) < 1 &&
            Math.abs(chain.toX - to.x) < 1 && 
            Math.abs(chain.toY - to.y) < 1
        );
    }

    /**
     * Update chain ages and remove expired ones
     */
    update() {
        for (let i = this.chains.length - 1; i >= 0; i--) {
            const chain = this.chains[i];
            chain.age++;
            chain.opacity = 1.0 - (chain.age * this.fadeRate);
            
            if (chain.opacity <= 0) {
                this.chains.splice(i, 1);
            }
        }
    }

    /**
     * Render all active panic chains
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    draw(ctx) {
        if (this.chains.length === 0) return;

        ctx.save();
        
        this.chains.forEach(chain => {
            // Create gradient from source (red) to target (cyan)
            const gradient = ctx.createLinearGradient(
                chain.fromX, chain.fromY, 
                chain.toX, chain.toY
            );
            
            // Red at source (fear origin), cyan at target (infected)
            const alpha = chain.opacity * 0.6; // Max 60% opacity for subtlety
            gradient.addColorStop(0, `rgba(255, 50, 50, ${alpha})`);
            gradient.addColorStop(0.5, `rgba(255, 150, 100, ${alpha * 0.7})`);
            gradient.addColorStop(1, `rgba(0, 200, 255, ${alpha})`);

            ctx.beginPath();
            ctx.moveTo(chain.fromX, chain.fromY);
            ctx.lineTo(chain.toX, chain.toY);
            ctx.strokeStyle = gradient;
            ctx.lineWidth = 1 + chain.intensity * 2; // Thicker for more intense fear
            ctx.setLineDash([4, 4]); // Dashed line for "transmission" effect
            ctx.stroke();

            // Draw small pulse at the target (infection point)
            if (chain.opacity > 0.5) {
                ctx.beginPath();
                const pulseSize = 3 + (1 - chain.opacity) * 5;
                ctx.arc(chain.toX, chain.toY, pulseSize, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(0, 200, 255, ${chain.opacity * 0.4})`;
                ctx.fill();
            }
        });

        ctx.restore();
    }

    /**
     * Get count of active chains for UI display
     */
    getActiveChainCount() {
        return this.chains.length;
    }

    /**
     * Clear all chains (e.g., when simulation resets)
     */
    clear() {
        this.chains = [];
    }
}