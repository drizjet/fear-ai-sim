/**
 * SeedManager - Deterministic RNG for reproducible simulations
 * Optimized: Fast, minimal memory, cached RNG instances
 */

import seedrandom from 'seedrandom';

export class SeedManager {
    constructor(worldSeed = null, scenarioSeed = null) {
        // Use provided seeds or generate from timestamp + random
        this.worldSeed = worldSeed ?? this._generateSeed();
        this.scenarioSeed = scenarioSeed ?? this._generateSeed();
        
        // Cache RNG instances for reuse (avoid recreating)
        this._rngs = new Map();
        this._agentSeeds = new Map();
        
        // Version for replay compatibility
        this.version = '2.0.0';
    }
    
    /**
     * Generate a random seed (32-bit integer)
     */
    _generateSeed() {
        return Math.floor(Math.random() * 2147483647);
    }
    
    /**
     * Get world RNG (for map, obstacles, food)
     */
    getWorldRNG() {
        if (!this._rngs.has('world')) {
            this._rngs.set('world', seedrandom(this.worldSeed.toString()));
        }
        return this._rngs.get('world');
    }
    
    /**
     * Get scenario RNG (for predator timing, positions)
     */
    getScenarioRNG() {
        if (!this._rngs.has('scenario')) {
            this._rngs.set('scenario', seedrandom(this.scenarioSeed.toString()));
        }
        return this._rngs.get('scenario');
    }
    
    /**
     * Get or create agent seed
     */
    getAgentSeed(agentId) {
        if (!this._agentSeeds.has(agentId)) {
            // Derive agent seed from world seed + agent ID
            const seed = this._hashString(`${this.worldSeed}_agent_${agentId}`);
            this._agentSeeds.set(agentId, seed);
        }
        return this._agentSeeds.get(agentId);
    }
    
    /**
     * Get RNG for specific agent
     */
    getAgentRNG(agentId) {
        const cacheKey = `agent_${agentId}`;
        if (!this._rngs.has(cacheKey)) {
            const seed = this.getAgentSeed(agentId);
            this._rngs.set(cacheKey, seedrandom(seed.toString()));
        }
        return this._rngs.get(cacheKey);
    }
    
    /**
     * Get RNG for predator (derived from scenario seed)
     */
    getPredatorRNG(predatorId) {
        const cacheKey = `predator_${predatorId}`;
        if (!this._rngs.has(cacheKey)) {
            const seed = this._hashString(`${this.scenarioSeed}_predator_${predatorId}`);
            this._rngs.set(cacheKey, seedrandom(seed.toString()));
        }
        return this._rngs.get(cacheKey);
    }
    
    /**
     * Fast string hash for seed derivation
     */
    _hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }
    
    /**
     * Get all seeds as object (for serialization)
     */
    getSeeds() {
        return {
            world: this.worldSeed,
            scenario: this.scenarioSeed,
            version: this.version
        };
    }
    
    /**
     * Create from serialized seeds
     */
    static fromSeeds(seeds) {
        const manager = new SeedManager(seeds.world, seeds.scenario);
        return manager;
    }
    
    /**
     * Reset all RNGs (for replay from beginning)
     */
    reset() {
        this._rngs.clear();
    }
    
    /**
     * Clear agent-specific RNGs (memory cleanup)
     */
    clearAgentRNGs() {
        for (const [key, _] of this._rngs) {
            if (key.startsWith('agent_') || key.startsWith('predator_')) {
                this._rngs.delete(key);
            }
        }
        this._agentSeeds.clear();
    }
}

/**
 * Fast random functions using cached RNG
 * These are drop-in replacements for Math.random()
 */
export class FastRNG {
    constructor(seedManager) {
        this.seedManager = seedManager;
        this.currentRNG = seedManager.getWorldRNG();
    }
    
    /**
     * Set which RNG to use
     */
    useWorldRNG() {
        this.currentRNG = this.seedManager.getWorldRNG();
        return this;
    }
    
    useScenarioRNG() {
        this.currentRNG = this.seedManager.getScenarioRNG();
        return this;
    }
    
    useAgentRNG(agentId) {
        this.currentRNG = this.seedManager.getAgentRNG(agentId);
        return this;
    }
    
    /**
     * Random float [0, 1)
     */
    random() {
        return this.currentRNG();
    }
    
    /**
     * Random int [min, max)
     */
    randomInt(min, max) {
        return Math.floor(this.currentRNG() * (max - min)) + min;
    }
    
    /**
     * Random float [min, max)
     */
    randomFloat(min, max) {
        return this.currentRNG() * (max - min) + min;
    }
    
    /**
     * Random choice from array
     */
    randomChoice(arr) {
        return arr[Math.floor(this.currentRNG() * arr.length)];
    }
    
    /**
     * Random boolean with probability
     */
    randomBool(probability = 0.5) {
        return this.currentRNG() < probability;
    }
    
    /**
     * Random gaussian (Box-Muller transform)
     */
    randomGaussian(mean = 0, std = 1) {
        const u1 = this.currentRNG();
        const u2 = this.currentRNG();
        const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        return z * std + mean;
    }
}

// Singleton for global access
let globalSeedManager = null;

export function initGlobalSeeds(worldSeed, scenarioSeed) {
    globalSeedManager = new SeedManager(worldSeed, scenarioSeed);
    return globalSeedManager;
}

export function getGlobalSeedManager() {
    if (!globalSeedManager) {
        globalSeedManager = new SeedManager();
    }
    return globalSeedManager;
}
