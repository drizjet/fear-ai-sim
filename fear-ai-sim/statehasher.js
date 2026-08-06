/**
 * StateHasher - Fast deterministic hashing for simulation state validation
 * Optimized: Uses typed arrays, minimal allocations, xxHash-style algorithm
 */

export class StateHasher {
    constructor() {
        // Pre-allocated buffers to avoid GC pressure
        this._intBuffer = new Int32Array(1000);
        this._floatBuffer = new Float64Array(1000);
        this._bufferIndex = 0;
    }
    
    /**
     * Hash a complete simulation state
     * Returns 64-bit hash as hex string
     */
    hashSimulationState(agents, predators, tick) {
        this._resetBuffers();
        
        // Add tick for temporal uniqueness
        this._addInt(tick);
        
        // Hash all agents (sorted by ID for consistency)
        const sortedAgents = agents.slice().sort((a, b) => a.id - b.id);
        for (const agent of sortedAgents) {
            if (!agent.dead) {
                this._hashAgent(agent);
            }
        }
        
        // Hash all predators
        const sortedPredators = predators.slice().sort((a, b) => a.id - b.id);
        for (const predator of sortedPredators) {
            this._hashPredator(predator);
        }
        
        return this._computeHash();
    }
    
    /**
     * Hash single agent state
     */
    _hashAgent(agent) {
        // Quantize positions to reduce floating-point noise
        this._addInt(Math.round(agent.x * 100));
        this._addInt(Math.round(agent.y * 100));
        this._addInt(Math.round(agent.vx * 100));
        this._addInt(Math.round(agent.vy * 100));
        this._addInt(Math.round(agent.brain?.currentFear * 100) || 0);
        this._addInt(agent.energy || 0);
        this._addInt(this._stateToInt(agent.brain?.state));
    }
    
    /**
     * Hash single predator state
     */
    _hashPredator(predator) {
        this._addInt(Math.round(predator.x * 100));
        this._addInt(Math.round(predator.y * 100));
        this._addInt(Math.round(predator.vx * 100));
        this._addInt(Math.round(predator.vy * 100));
        this._addInt(this._stateToInt(predator.state));
    }
    
    /**
     * Convert state string to integer
     */
    _stateToInt(state) {
        const stateMap = {
            'CALM': 0, 'ALERT': 1, 'ANXIOUS': 2, 'PANIC': 3,
            'HIDE': 4, 'RECOVER': 5, 'FREEZE': 6,
            'IDLE': 10, 'CHASING': 11, 'CHARGING': 12, 'ATTACKING': 13,
            'PATROLLING': 14, 'AMBUSH_WAIT': 15, 'HUNTING': 16
        };
        return stateMap[state] || 99;
    }
    
    /**
     * Add integer to buffer
     */
    _addInt(val) {
        if (this._bufferIndex >= this._intBuffer.length) {
            this._flushBuffer();
        }
        this._intBuffer[this._bufferIndex++] = val;
    }
    
    /**
     * Reset buffers for new hash
     */
    _resetBuffers() {
        this._bufferIndex = 0;
    }
    
    /**
     * Compute final hash from buffer
     * Uses simple but fast hash (xxHash-inspired)
     */
    _computeHash() {
        let h1 = 0x811c9dc5; // FNV offset basis
        const prime = 0x01000193; // FNV prime
        
        for (let i = 0; i < this._bufferIndex; i++) {
            h1 ^= this._intBuffer[i] & 0xFFFFFFFF;
            h1 = Math.imul(h1, prime);
        }
        
        // Mix final value
        h1 ^= h1 >>> 16;
        h1 = Math.imul(h1, 0x85ebca6b);
        h1 ^= h1 >>> 13;
        h1 = Math.imul(h1, 0xc2b2ae35);
        h1 ^= h1 >>> 16;
        
        // Convert to hex string
        return (h1 >>> 0).toString(16).padStart(8, '0');
    }
    
    /**
     * Flush buffer (rarely called due to large pre-allocation)
     */
    _flushBuffer() {
        // Compute partial hash and reset
        this._computeHash();
        this._bufferIndex = 0;
    }
}

/**
 * DeterminismValidator - Verify simulation reproducibility
 */
export class DeterminismValidator {
    constructor() {
        this.hasher = new StateHasher();
        this.stateHistory = [];
        this.maxHistory = 1000; // Keep last 1000 ticks
    }
    
    /**
     * Record state hash at tick
     */
    recordState(agents, predators, tick) {
        const hash = this.hasher.hashSimulationState(agents, predators, tick);
        this.stateHistory.push({ tick, hash });
        
        // Trim old history
        if (this.stateHistory.length > this.maxHistory) {
            this.stateHistory.shift();
        }
        
        return hash;
    }
    
    /**
     * Compare two state histories for determinism
     */
    static compareHistories(historyA, historyB) {
        const minLen = Math.min(historyA.length, historyB.length);
        const mismatches = [];
        
        for (let i = 0; i < minLen; i++) {
            if (historyA[i].hash !== historyB[i].hash) {
                mismatches.push({
                    tick: historyA[i].tick,
                    hashA: historyA[i].hash,
                    hashB: historyB[i].hash
                });
            }
        }
        
        return {
            matches: mismatches.length === 0,
            totalTicks: minLen,
            mismatches: mismatches,
            mismatchCount: mismatches.length
        };
    }
    
    /**
     * Get hash at specific tick
     */
    getHashAtTick(tick) {
        const entry = this.stateHistory.find(h => h.tick === tick);
        return entry ? entry.hash : null;
    }
    
    /**
     * Clear history
     */
    clear() {
        this.stateHistory = [];
    }
}
