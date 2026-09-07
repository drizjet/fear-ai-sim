/**
 * LayeredMemorySystem - Bounded multi-layer cognitive memory architecture.
 *
 * Implements a 4-tier cognitive memory model:
 * 1. Sensory Working Memory (short FIFO buffer for active percepts)
 * 2. Episodic Memory (discrete salient historical incidents with decay & flashbulb retention)
 * 3. Trauma Memory (cue- and location-conditioned dread associations)
 * 4. Semantic Knowledge (factual world beliefs with deduplication & confidence degradation)
 *
 * Adheres strictly to the Host Game Authority Invariant:
 * Memory stores subjective internal agent beliefs and experiences, never asserting
 * game-engine authority over transforms, physics, or entity lifecycles.
 */

export const MEMORY_LAYERS = Object.freeze({
    SENSORY: 'sensory',
    EPISODIC: 'episodic',
    TRAUMA: 'trauma',
    SEMANTIC: 'semantic'
});

export const EPISODIC_EVENT_TYPES = Object.freeze({
    SURVIVED_AMBUSH: 'SURVIVED_AMBUSH',
    NEAR_DEATH_PANIC: 'NEAR_DEATH_PANIC',
    ABANDONED_BY_PEER: 'ABANDONED_BY_PEER',
    REASSURED_BY_LEADER: 'REASSURED_BY_LEADER',
    ALLIED_EXTRACTION: 'ALLIED_EXTRACTION',
    RESOURCE_DISCOVERED: 'RESOURCE_DISCOVERED',
    SAFE_SANCTUARY_DISCOVERED: 'SAFE_SANCTUARY_DISCOVERED',
    COMBAT_CONFRONTATION: 'COMBAT_CONFRONTATION'
});

export const SEMANTIC_CATEGORIES = Object.freeze({
    HAZARD: 'HAZARD',
    SANCTUARY: 'SANCTUARY',
    CHOKEPOINT: 'CHOKEPOINT',
    RESOURCE: 'RESOURCE'
});

export const DEFAULT_MEMORY_CONFIG = Object.freeze({
    maxSensoryEntries: 10,
    maxEpisodicEntries: 50,
    maxTraumaEntries: 25,
    maxSemanticEntries: 100,
    episodicBaseDecay: 0.002, // Decay per tick for mundane memories
    semanticDecay: 0.0005     // Confidence loss per tick if unrefreshed
});

export class LayeredMemorySystem {
    /**
     * @param {object} [config={}]
     */
    constructor(config = {}) {
        this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
        this.sensory = [];   // Array<SensoryEntry>
        this.episodic = [];  // Array<EpisodicEntry>
        this.trauma = [];    // Array<TraumaEntry>
        this.semantic = new Map(); // key -> SemanticEntry
        this.nextMemoryId = 1;
        this.tickCount = 0;
    }

    /**
     * Record a sensory observation into working memory (FIFO)
     * @param {object} obs - Host observation
     * @param {number} [tick=0]
     */
    recordSensory(obs, tick = 0) {
        if (!obs) return;
        const entry = {
            tick: Number(tick) || this.tickCount,
            threatDistance: obs.threat_distance !== undefined ? Number(obs.threat_distance) : null,
            threatDetected: Boolean(obs.threat_detected || (obs.threat_distance !== undefined && obs.threat_distance < 30)),
            peerCount: Array.isArray(obs.peers) ? obs.peers.length : (obs.peer_count || 0),
            audioStimulus: obs.audio_stimulus ? { ...obs.audio_stimulus } : null,
            position: obs.position ? { x: obs.position.x || 0, y: obs.position.y || 0, z: obs.position.z || 0 } : null
        };

        this.sensory.push(entry);
        if (this.sensory.length > this.config.maxSensoryEntries) {
            this.sensory.shift();
        }
    }

    /**
     * Record a discrete episodic incident
     * @param {object} event
     * @param {string} event.type - EPISODIC_EVENT_TYPES
     * @param {number} [event.valence=0] - [-1.0, 1.0]
     * @param {number} [event.arousal=0.5] - [0.0, 1.0]
     * @param {number} [event.intensity=0.5] - [0.0, 1.0]
     * @param {number} [event.salience=0.5] - [0.0, 1.0]
     * @param {Array<string>} [event.participants=[]]
     * @param {object} [event.location={x:0, y:0, z:0}]
     * @param {object} [event.details={}]
     * @param {number} [event.tick=0]
     * @returns {number} memoryId
     */
    recordEpisodic(event) {
        if (!event || !event.type) return null;

        const id = this.nextMemoryId++;
        const salience = Math.max(0, Math.min(1.0, Number(event.salience ?? event.intensity ?? 0.5)));
        const intensity = Math.max(0, Math.min(1.0, Number(event.intensity ?? 0.5)));
        const valence = Math.max(-1.0, Math.min(1.0, Number(event.valence ?? 0.0)));
        const arousal = Math.max(0.0, Math.min(1.0, Number(event.arousal ?? 0.5)));

        // Deduplication: prevent identical events at the same tick from creating duplicate entries
        const currentTick = Number(event.tick ?? this.tickCount);
        const existing = this.episodic.find(e =>
            e.type === event.type &&
            e.tick === currentTick &&
            JSON.stringify(e.participants) === JSON.stringify(event.participants || [])
        );
        if (existing) {
            // Reinforce salience rather than duplicate
            existing.salience = Math.min(1.0, existing.salience + 0.2);
            return existing.id;
        }

        const entry = {
            id,
            tick: currentTick,
            type: String(event.type),
            valence,
            arousal,
            intensity,
            salience,
            participants: Array.isArray(event.participants) ? [...event.participants] : [],
            location: event.location ? {
                x: Number(event.location.x) || 0,
                y: Number(event.location.y) || 0,
                z: Number(event.location.z) || 0
            } : null,
            details: event.details ? { ...event.details } : {}
        };

        this.episodic.push(entry);

        // Bounded capacity policy: prune lowest-salience memories first
        if (this.episodic.length > this.config.maxEpisodicEntries) {
            this._pruneEpisodic();
        }

        return id;
    }

    /**
     * Record a cue- or location-conditioned trauma dread memory
     * @param {string} cueType - 'SPATIAL' | 'ACOUSTIC' | 'ENTITY'
     * @param {string|number} cueValue - identifier or coordinate key
     * @param {number} [dreadIntensity=1.0] - [0.0, 1.0]
     * @param {object} [location=null]
     * @param {number} [radius=50]
     * @param {number} [decayRate=0.001]
     * @returns {number} memoryId
     */
    recordTrauma(cueType, cueValue, dreadIntensity = 1.0, location = null, radius = 50, decayRate = 0.001) {
        const id = this.nextMemoryId++;
        const intensity = Math.max(0, Math.min(1.0, Number(dreadIntensity) || 1.0));

        // Check if cue already exists
        const existing = this.trauma.find(t => t.cueType === cueType && t.cueValue === cueValue);
        if (existing) {
            existing.dreadIntensity = Math.min(1.0, existing.dreadIntensity + intensity * 0.5);
            existing.lastReinforcedTick = this.tickCount;
            return existing.id;
        }

        const entry = {
            id,
            cueType: String(cueType || 'SPATIAL'),
            cueValue: String(cueValue || ''),
            dreadIntensity: intensity,
            location: location ? { x: Number(location.x) || 0, y: Number(location.y) || 0, z: Number(location.z) || 0 } : null,
            radius: Math.max(1, Number(radius) || 50),
            decayRate: Math.max(0.0001, Number(decayRate) || 0.001),
            createdTick: this.tickCount,
            lastReinforcedTick: this.tickCount
        };

        this.trauma.push(entry);
        if (this.trauma.length > this.config.maxTraumaEntries) {
            // Prune lowest intensity trauma
            this.trauma.sort((a, b) => a.dreadIntensity - b.dreadIntensity);
            this.trauma.shift();
        }

        return id;
    }

    /**
     * Record or update semantic world knowledge with conflict resolution
     * @param {string} key - Unique location or concept key
     * @param {string} category - SEMANTIC_CATEGORIES
     * @param {object} location - {x, y, z}
     * @param {number} [confidence=0.8] - [0.0, 1.0]
     * @param {object} [details={}]
     * @param {number} [tick=0]
     * @returns {string} key
     */
    recordSemantic(key, category, location, confidence = 0.8, details = {}, tick = 0) {
        if (!key) return null;
        const validKey = String(key);
        const newConf = Math.max(0, Math.min(1.0, Number(confidence) || 0.8));
        const currentTick = Number(tick) || this.tickCount;

        if (this.semantic.has(validKey)) {
            const existing = this.semantic.get(validKey);
            // Conflict resolution: If category changed, newer observation with higher confidence wins
            if (existing.category !== category) {
                if (newConf >= existing.confidence) {
                    existing.category = category;
                    existing.confidence = newConf;
                    existing.details = { ...details };
                }
            } else {
                // Same category: reinforce confidence
                existing.confidence = Math.min(1.0, existing.confidence + 0.15);
                existing.details = { ...existing.details, ...details };
            }
            existing.location = location ? { x: location.x || 0, y: location.y || 0, z: location.z || 0 } : existing.location;
            existing.lastSeenTick = currentTick;
            return validKey;
        }

        const entry = {
            key: validKey,
            category: String(category || SEMANTIC_CATEGORIES.HAZARD),
            location: location ? { x: Number(location.x) || 0, y: Number(location.y) || 0, z: Number(location.z) || 0 } : null,
            confidence: newConf,
            details: { ...details },
            firstSeenTick: currentTick,
            lastSeenTick: currentTick
        };

        this.semantic.set(validKey, entry);

        // Bounded capacity policy for semantic store
        if (this.semantic.size > this.config.maxSemanticEntries) {
            // Find lowest confidence entry to evict
            let lowestKey = null;
            let lowestConf = Infinity;
            for (const [k, v] of this.semantic.entries()) {
                if (v.confidence < lowestConf) {
                    lowestConf = v.confidence;
                    lowestKey = k;
                }
            }
            if (lowestKey) {
                this.semantic.delete(lowestKey);
            }
        }

        return validKey;
    }

    /**
     * Retrieve episodic memories matching search query
     * @param {object} query
     * @param {string} [query.type]
     * @param {string} [query.participantId]
     * @param {number} [query.minSalience=0]
     * @param {object} [query.nearLocation] - {x, y, z, maxDist}
     * @param {number} [query.limit=10]
     * @returns {Array<object>}
     */
    retrieveEpisodic(query = {}) {
        let results = this.episodic.filter(e => {
            if (query.type && e.type !== query.type) return false;
            if (query.participantId && !e.participants.includes(query.participantId)) return false;
            if (query.minSalience && e.salience < query.minSalience) return false;
            if (query.nearLocation && e.location) {
                const maxDist = query.nearLocation.maxDist || 50;
                const dx = e.location.x - query.nearLocation.x;
                const dy = e.location.y - query.nearLocation.y;
                const dz = (e.location.z || 0) - (query.nearLocation.z || 0);
                const distSq = dx * dx + dy * dy + dz * dz;
                if (distSq > maxDist * maxDist) return false;
            }
            return true;
        });

        // Sort by composite score: salience + recency
        results.sort((a, b) => {
            const scoreA = a.salience * 0.7 + (a.tick / Math.max(1, this.tickCount)) * 0.3;
            const scoreB = b.salience * 0.7 + (b.tick / Math.max(1, this.tickCount)) * 0.3;
            return scoreB - scoreA;
        });

        if (query.limit && query.limit > 0) {
            results = results.slice(0, query.limit);
        }

        return results;
    }

    /**
     * Compute aggregate trauma dread for an agent at position and with active perceptual cues
     * @param {object} position - {x, y, z}
     * @param {Array<string>} [activeEntityCues=[]]
     * @returns {number} dread intensity in [0, 1]
     */
    getTraumaDread(position, activeEntityCues = []) {
        if (this.trauma.length === 0) return 0;
        let totalDread = 0;

        for (const t of this.trauma) {
            if (t.dreadIntensity <= 0.01) continue;

            if (t.cueType === 'SPATIAL' && t.location && position) {
                const dx = position.x - t.location.x;
                const dy = position.y - t.location.y;
                const dz = (position.z || 0) - (t.location.z || 0);
                const distSq = dx * dx + dy * dy + dz * dz;
                const radSq = t.radius * t.radius;
                if (distSq < radSq) {
                    const dist = Math.sqrt(distSq);
                    const factor = 1.0 - (dist / t.radius);
                    totalDread += t.dreadIntensity * factor;
                }
            } else if (t.cueType === 'ENTITY' && activeEntityCues.includes(t.cueValue)) {
                totalDread += t.dreadIntensity * 0.8;
            }
        }

        return Math.min(1.0, totalDread);
    }

    /**
     * Advance memory system decay across ticks
     * @param {number} [deltaTicks=1]
     */
    tick(deltaTicks = 1) {
        if (deltaTicks <= 0) return;
        this.tickCount += deltaTicks;

        // 1. Decay episodic memories (flashbulb high-salience memories resist decay)
        for (let i = this.episodic.length - 1; i >= 0; i--) {
            const mem = this.episodic[i];
            const decayRate = mem.salience >= 0.8
                ? this.config.episodicBaseDecay * 0.1 // 10x slower decay for extreme traumatic/salient events
                : this.config.episodicBaseDecay;

            mem.salience *= Math.pow(1.0 - decayRate, deltaTicks);

            // Evict completely forgotten mundane memories
            if (mem.salience < 0.05) {
                this.episodic.splice(i, 1);
            }
        }

        // 2. Decay trauma dread
        for (let i = this.trauma.length - 1; i >= 0; i--) {
            const tr = this.trauma[i];
            tr.dreadIntensity *= Math.pow(1.0 - tr.decayRate, deltaTicks);
            if (tr.dreadIntensity < 0.02) {
                this.trauma.splice(i, 1);
            }
        }

        // 3. Degrade unrefreshed semantic confidence
        for (const [k, sem] of this.semantic.entries()) {
            const ticksSinceSeen = this.tickCount - sem.lastSeenTick;
            if (ticksSinceSeen > 500) {
                sem.confidence *= Math.pow(1.0 - this.config.semanticDecay, deltaTicks);
                if (sem.confidence < 0.10) {
                    this.semantic.delete(k);
                }
            }
        }
    }

    /**
     * Reinforce an episodic memory
     * @param {number} memoryId
     * @param {number} [boost=0.2]
     */
    reinforce(memoryId, boost = 0.2) {
        const mem = this.episodic.find(e => e.id === memoryId);
        if (mem) {
            mem.salience = Math.min(1.0, mem.salience + Math.max(0, boost));
            return true;
        }
        return false;
    }

    /**
     * Clean up deleted entity references
     * @param {string} entityId
     */
    purgeEntityReferences(entityId) {
        if (!entityId) return;
        for (const ep of this.episodic) {
            ep.participants = ep.participants.filter(id => id !== entityId);
        }
        this.trauma = this.trauma.filter(t => !(t.cueType === 'ENTITY' && t.cueValue === entityId));
    }

    /**
     * Prune episodic memory to enforce max capacity
     * @private
     */
    _pruneEpisodic() {
        this.episodic.sort((a, b) => a.salience - b.salience);
        while (this.episodic.length > this.config.maxEpisodicEntries) {
            this.episodic.shift();
        }
    }

    /**
     * Clear all memory stores
     */
    clear() {
        this.sensory = [];
        this.episodic = [];
        this.trauma = [];
        this.semantic.clear();
    }

    /**
     * Serialize complete state for snapshot persistence
     * @returns {object}
     */
    getState() {
        const semanticArray = [];
        for (const sem of this.semantic.values()) {
            semanticArray.push({ ...sem });
        }

        return {
            tickCount: this.tickCount,
            nextMemoryId: this.nextMemoryId,
            sensory: this.sensory.map(s => ({ ...s })),
            episodic: this.episodic.map(e => ({
                ...e,
                participants: [...e.participants],
                location: e.location ? { ...e.location } : null,
                details: { ...e.details }
            })),
            trauma: this.trauma.map(t => ({
                ...t,
                location: t.location ? { ...t.location } : null
            })),
            semantic: semanticArray
        };
    }

    /**
     * Restore memory state from snapshot
     * @param {object} snapshot
     */
    setState(snapshot) {
        if (!snapshot) return;
        this.tickCount = Number(snapshot.tickCount) || 0;
        this.nextMemoryId = Number(snapshot.nextMemoryId) || 1;
        this.sensory = Array.isArray(snapshot.sensory) ? snapshot.sensory.map(s => ({ ...s })) : [];
        this.episodic = Array.isArray(snapshot.episodic) ? snapshot.episodic.map(e => ({
            ...e,
            participants: Array.isArray(e.participants) ? [...e.participants] : [],
            location: e.location ? { ...e.location } : null,
            details: e.details ? { ...e.details } : {}
        })) : [];
        this.trauma = Array.isArray(snapshot.trauma) ? snapshot.trauma.map(t => ({
            ...t,
            location: t.location ? { ...t.location } : null
        })) : [];
        this.semantic.clear();
        if (Array.isArray(snapshot.semantic)) {
            for (const sem of snapshot.semantic) {
                if (sem && sem.key) {
                    this.semantic.set(sem.key, { ...sem });
                }
            }
        }
    }
}

export default LayeredMemorySystem;
