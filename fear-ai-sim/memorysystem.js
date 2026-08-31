/**
 * Improved Memory System (T3.7)
 * 
 * Two-tier memory architecture:
 * - Short-term memory: Recent events, high detail, rapid decay
 * - Long-term memory: Important events, consolidated, slower decay
 * 
 * Features:
 * - Memory consolidation (STM → LTM)
 * - Trauma memory (stronger, longer lasting)
 * - Memory sharing between agents
 * - Context-dependent recall
 */

export class MemorySystem {
    constructor(config = {}) {
        // Short-term memory (working memory)
        this.shortTerm = {
            capacity: config.shortTermCapacity || 5,
            decayRate: config.shortTermDecay || 0.9,  // 10% decay per frame
            memories: []
        };

        // Long-term memory
        this.longTerm = {
            capacity: config.longTermCapacity || 20,
            decayRate: config.longTermDecay || 0.995,  // 0.5% decay per frame
            memories: []
        };

        // Configuration
        this.config = {
            consolidationThreshold: config.consolidationThreshold || 0.7,
            traumaThreshold: config.traumaThreshold || 0.8,
            traumaBoost: config.traumaBoost || 2.0,  // Trauma memories last longer
            sharingRadius: config.sharingRadius || 100,
            maxSharingPerFrame: config.maxSharingPerFrame || 3,
            contextMatchThreshold: config.contextMatchThreshold || 0.6
        };

        // Memory metadata
        this.stats = {
            totalMemoriesCreated: 0,
            memoriesConsolidated: 0,
            memoriesShared: 0,
            traumaMemories: 0,
            contextRecalls: 0
        };

        // Context for memory retrieval
        this.currentContext = {
            location: null,
            threatLevel: 0,
            timeOfDay: 0,
            nearbyAgents: []
        };

        // Phase 13: Causal Link Buffer (T13.7)
        this.causalBuffer = []; // { timestamp, stimulus, fearDelta, inferredCause }
        this.maxCausalHistory = 10;
    }

    /**
     * Infer the causality of a fear spike (T13.7)
     * Distinguishes between Direct Threat, Social Contagion, and Environmental Noise.
     */
    inferCausality(fearDelta, visuals, traumaIntensity) {
        let cause = 'UNKNOWN';
        let confidence = 0;

        if (visuals.threats.length > 0) {
            cause = 'DIRECT_THREAT';
            confidence = 0.9;
        } else if (visuals.neighbors.some(n => n.brain.state === 'PANIC')) {
            cause = 'SOCIAL_CONTAGION';
            confidence = 0.7;
        } else if (traumaIntensity > 0.5) {
            cause = 'ENVIRONMENTAL_TRAUMA';
            confidence = 0.6;
        }

        const entry = {
            timestamp: Date.now(),
            fearDelta,
            cause,
            confidence
        };

        this.causalBuffer.push(entry);
        if (this.causalBuffer.length > this.maxCausalHistory) {
            this.causalBuffer.shift();
        }

        return entry;
    }

    /**
     * Add a new memory to short-term memory
     * @param {Object} memory - Memory object
     * @param {string} memory.type - Memory type ('threat', 'food', 'safe', 'danger')
     * @param {number} memory.x - X position
     * @param {number} memory.y - Y position
     * @param {number} memory.intensity - Memory intensity (0-1)
     * @param {Object} context - Context when memory was formed
     * @returns {Object} Created memory
     */
    addMemory(memory, context = {}) {
        const isTrauma = memory.intensity >= this.config.traumaThreshold;

        const newMemory = {
            id: Date.now() + Math.random(),
            type: memory.type,
            x: memory.x,
            y: memory.y,
            intensity: memory.intensity,
            timestamp: Date.now(),
            strength: isTrauma ? memory.intensity * this.config.traumaBoost : memory.intensity,
            isTrauma: isTrauma,
            context: {
                location: context.location || { x: memory.x, y: memory.y },
                threatLevel: context.threatLevel || 0,
                timeOfDay: context.timeOfDay || 0,
                nearbyThreats: context.nearbyThreats || 0
            },
            accessCount: 0,
            lastAccessed: Date.now()
        };

        // Add to short-term memory
        this.shortTerm.memories.push(newMemory);

        // Maintain capacity
        if (this.shortTerm.memories.length > this.shortTerm.capacity) {
            // Remove weakest non-trauma memory
            const removable = this.shortTerm.memories.filter(m => !m.isTrauma);
            if (removable.length > 0) {
                const weakest = removable.reduce((min, m) => 
                    m.strength < min.strength ? m : min
                );
                const idx = this.shortTerm.memories.indexOf(weakest);
                this.shortTerm.memories.splice(idx, 1);
            } else {
                // All are trauma, remove oldest
                this.shortTerm.memories.shift();
            }
        }

        this.stats.totalMemoriesCreated++;
        if (isTrauma) {
            this.stats.traumaMemories++;
        }

        // Immediate consolidation check for trauma
        if (isTrauma) {
            this.consolidateMemory(newMemory);
        }

        return newMemory;
    }

    /**
     * Consolidate a memory from STM to LTM
     * @param {Object} memory - Memory to consolidate
     */
    consolidateMemory(memory) {
        // Remove from STM
        const stmIdx = this.shortTerm.memories.findIndex(m => m.id === memory.id);
        if (stmIdx !== -1) {
            this.shortTerm.memories.splice(stmIdx, 1);
        }

        // Add to LTM
        const ltmMemory = {
            ...memory,
            consolidatedAt: Date.now(),
            strength: Math.min(1.0, memory.strength * 1.2)  // Boost on consolidation
        };

        this.longTerm.memories.push(ltmMemory);

        // Maintain LTM capacity
        if (this.longTerm.memories.length > this.longTerm.capacity) {
            this.forgetWeakestMemory();
        }

        this.stats.memoriesConsolidated++;
    }

    /**
     * Forget weakest long-term memory
     */
    forgetWeakestMemory() {
        // Sort by strength (weakest first)
        this.longTerm.memories.sort((a, b) => {
            // Trauma memories are harder to forget
            const aWeight = a.isTrauma ? a.strength * 2 : a.strength;
            const bWeight = b.isTrauma ? b.strength * 2 : b.strength;
            return aWeight - bWeight;
        });

        // Remove weakest
        this.longTerm.memories.shift();
    }

    /**
     * Update memory decay and consolidation
     * @param {Object} currentContext - Current situation context
     */
    update(currentContext = {}) {
        this.currentContext = { ...this.currentContext, ...currentContext };

        // Decay short-term memories
        this.shortTerm.memories = this.shortTerm.memories.filter(memory => {
            memory.strength *= this.shortTerm.decayRate;
            
            // Consolidate strong memories
            if (memory.strength >= this.config.consolidationThreshold) {
                this.consolidateMemory(memory);
                return false;  // Removed from STM
            }

            // Forget weak memories
            return memory.strength > 0.1;
        });

        // Decay long-term memories (slower)
        this.longTerm.memories = this.longTerm.memories.filter(memory => {
            const decayRate = memory.isTrauma ? 
                this.longTerm.decayRate * 0.5 :  // Trauma decays slower
                this.longTerm.decayRate;
            
            memory.strength *= decayRate;
            return memory.strength > 0.05;
        });

        return this.getMemoryState();
    }

    /**
     * Recall memories based on current context
     * @param {Object} queryContext - Context to match
     * @param {number} limit - Maximum memories to return
     * @returns {Array} Relevant memories
     */
    recall(queryContext = {}, limit = 3) {
        const context = { ...this.currentContext, ...queryContext };
        const allMemories = [...this.shortTerm.memories, ...this.longTerm.memories];

        // Score memories by relevance
        const scored = allMemories.map(memory => {
            let score = memory.strength;

            // Location similarity
            if (context.location && memory.context.location) {
                const dist = Math.sqrt(
                    (context.location.x - memory.context.location.x) ** 2 +
                    (context.location.y - memory.context.location.y) ** 2
                );
                const locationScore = Math.max(0, 1 - (dist / 200));
                score += locationScore * 0.3;
            }

            // Threat level match
            if (context.threatLevel !== undefined && memory.context.threatLevel !== undefined) {
                const threatDiff = Math.abs(context.threatLevel - memory.context.threatLevel);
                score += (1 - threatDiff) * 0.2;
            }

            // Time of day match
            if (context.timeOfDay !== undefined && memory.context.timeOfDay !== undefined) {
                const timeDiff = Math.abs(context.timeOfDay - memory.context.timeOfDay);
                score += (1 - timeDiff) * 0.1;
            }

            // Recent access boost
            const recency = (Date.now() - memory.lastAccessed) / 60000;  // Minutes
            if (recency < 1) {
                score += 0.2;
            }

            // Trauma priority
            if (memory.isTrauma) {
                score += 0.3;
            }

            return { memory, score };
        });

        // Sort by score
        scored.sort((a, b) => b.score - a.score);

        // Return top memories
        const recalled = scored.slice(0, limit).map(item => {
            item.memory.accessCount++;
            item.memory.lastAccessed = Date.now();
            return item.memory;
        });

        if (recalled.length > 0) {
            this.stats.contextRecalls++;
        }

        return recalled;
    }

    /**
     * Get threat assessment based on memories
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} radius - Search radius
     * @returns {Object} Threat assessment
     */
    assessThreat(x, y, radius = 100) {
        const allMemories = [...this.shortTerm.memories, ...this.longTerm.memories];
        
        const relevantThreats = allMemories.filter(m => {
            const dist = Math.sqrt((x - m.x) ** 2 + (y - m.y) ** 2);
            return dist < radius && (m.type === 'threat' || m.type === 'danger');
        });

        if (relevantThreats.length === 0) {
            return { threatLevel: 0, confidence: 0, sources: [] };
        }

        const totalThreat = relevantThreats.reduce((sum, m) => sum + m.strength * m.intensity, 0);
        const avgThreat = totalThreat / relevantThreats.length;

        return {
            threatLevel: Math.min(1.0, avgThreat),
            confidence: Math.min(1.0, relevantThreats.length * 0.2),
            sources: relevantThreats.map(m => ({ x: m.x, y: m.y, strength: m.strength }))
        };
    }

    /**
     * Share memories with another agent
     * @param {MemorySystem} otherMemory - Other agent's memory system
     * @param {number} x - This agent's X position
     * @param {number} y - This agent's Y position
     * @param {number} otherX - Other agent's X position
     * @param {number} otherY - Other agent's Y position
     * @returns {number} Number of memories shared
     */
    shareMemories(otherMemory, x, y, otherX, otherY) {
        const dist = Math.sqrt((x - otherX) ** 2 + (y - otherY) ** 2);
        if (dist > this.config.sharingRadius) {
            return 0;
        }

        // Get strongest memories
        const allMemories = [...this.shortTerm.memories, ...this.longTerm.memories];
        const shareable = allMemories
            .filter(m => m.strength > 0.5)
            .sort((a, b) => b.strength - a.strength)
            .slice(0, this.config.maxSharingPerFrame);

        let sharedCount = 0;
        for (const memory of shareable) {
            // Create shared copy (slightly degraded)
            const sharedMemory = {
                ...memory,
                intensity: memory.intensity * 0.8,  // Lose some intensity
                strength: memory.strength * 0.9,    // Lose some strength
                isShared: true,
                originalSource: memory.id,
                id: Date.now() + Math.random()
            };

            otherMemory.addMemory(sharedMemory, memory.context);
            sharedCount++;
        }

        this.stats.memoriesShared += sharedCount;
        return sharedCount;
    }

    /**
     * Get memory statistics
     * @returns {Object} Memory statistics
     */
    getStats() {
        return {
            ...this.stats,
            shortTermCount: this.shortTerm.memories.length,
            longTermCount: this.longTerm.memories.length,
            totalActiveMemories: this.shortTerm.memories.length + this.longTerm.memories.length,
            traumaMemoryCount: [...this.shortTerm.memories, ...this.longTerm.memories]
                .filter(m => m.isTrauma).length,
            avgShortTermStrength: this.getAvgStrength(this.shortTerm.memories),
            avgLongTermStrength: this.getAvgStrength(this.longTerm.memories)
        };
    }

    /**
     * Get average strength of memories
     * @param {Array} memories - Array of memories
     * @returns {number} Average strength
     */
    getAvgStrength(memories) {
        if (memories.length === 0) return 0;
        return memories.reduce((sum, m) => sum + m.strength, 0) / memories.length;
    }

    /**
     * Get current memory state
     * @returns {Object} Memory state
     */
    getMemoryState() {
        return {
            shortTerm: {
                capacity: this.shortTerm.capacity,
                used: this.shortTerm.memories.length,
                memories: this.shortTerm.memories.map(m => ({
                    type: m.type,
                    strength: m.strength,
                    isTrauma: m.isTrauma
                }))
            },
            longTerm: {
                capacity: this.longTerm.capacity,
                used: this.longTerm.memories.length,
                memories: this.longTerm.memories.map(m => ({
                    type: m.type,
                    strength: m.strength,
                    isTrauma: m.isTrauma,
                    consolidated: true
                }))
            }
        };
    }

    /**
     * Clear all memories (e.g., for testing or reset)
     */
    clear() {
        this.shortTerm.memories = [];
        this.longTerm.memories = [];
        this.stats = {
            totalMemoriesCreated: 0,
            memoriesConsolidated: 0,
            memoriesShared: 0,
            traumaMemories: 0,
            contextRecalls: 0
        };
    }

    /**
     * Serialize memory system
     * @returns {Object} Serialized state
     */
    serialize() {
        return {
            shortTerm: {
                memories: [...this.shortTerm.memories]
            },
            longTerm: {
                memories: [...this.longTerm.memories]
            },
            stats: { ...this.stats }
        };
    }

    /**
     * Deserialize memory system
     * @param {Object} data - Serialized state
     */
    deserialize(data) {
        if (data.shortTerm && data.shortTerm.memories) {
            this.shortTerm.memories = [...data.shortTerm.memories];
        }
        if (data.longTerm && data.longTerm.memories) {
            this.longTerm.memories = [...data.longTerm.memories];
        }
        if (data.stats) {
            this.stats = { ...data.stats };
        }
    }
}

export default MemorySystem;
