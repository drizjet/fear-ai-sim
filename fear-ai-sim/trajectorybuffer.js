/**
 * CircularTrajectoryBuffer - Memory-efficient ring buffer for agent trajectories
 * Optimized: Uses typed arrays, minimizes allocations, 10fps sampling
 * 30 second buffer = 300 samples at 10fps
 */

// Fixed-size schema for memory efficiency
// Each frame: [tick, x, y, vx, vy, fear, energy, state, trauma, 
//               pred_dist, pred_angle, pred_count_danger, pred_count_caution,
//               ally_count, ally_nearest_dist, in_safe_haven]
const FRAME_SIZE = 16; // floats per frame
const MAX_FRAMES = 300; // 30 seconds at 10fps
const BUFFER_SIZE = FRAME_SIZE * MAX_FRAMES;

// State encoding (single byte)
const STATE_ENCODING = {
    'CALM': 0, 'ALERT': 1, 'ANXIOUS': 2, 'PANIC': 3,
    'HIDE': 4, 'RECOVER': 5, 'FREEZE': 6
};

export class CircularTrajectoryBuffer {
    constructor(agentId) {
        this.agentId = agentId;
        
        // Primary storage: Float32Array for numeric data
        this.data = new Float32Array(BUFFER_SIZE);
        
        // Secondary storage: Int8Array for state enum (more compact)
        this.states = new Int8Array(MAX_FRAMES);
        
        // Write position
        this.writeIndex = 0;
        this.frameCount = 0;
        this.isFull = false;
        
        // Metadata
        this.startTick = -1;
        this.lastTick = -1;
    }
    
    /**
     * Record a frame (call at 10fps)
     */
    record(tick, agent, perception, context) {
        const idx = this.writeIndex * FRAME_SIZE;
        
        // Core state (6 floats)
        this.data[idx + 0] = tick;
        this.data[idx + 1] = agent.x;
        this.data[idx + 2] = agent.y;
        this.data[idx + 3] = agent.vx;
        this.data[idx + 4] = agent.vy;
        this.data[idx + 5] = agent.brain?.currentFear || 0;
        
        // Agent metrics (3 floats + 1 state)
        this.data[idx + 6] = agent.energy || 0;
        this.states[this.writeIndex] = STATE_ENCODING[agent.brain?.state] || 0;
        this.data[idx + 7] = agent.trauma || 0;
        this.data[idx + 8] = agent.age || 0;
        
        // Perception: nearest predator (3 floats)
        if (perception?.nearestPredator) {
            this.data[idx + 9] = perception.nearestPredator.distance;
            this.data[idx + 10] = perception.nearestPredator.angle;
        } else {
            this.data[idx + 9] = 9999; // No predator
            this.data[idx + 10] = 0;
        }
        
        // Predator counts (2 floats)
        this.data[idx + 11] = perception?.predatorCount?.dangerZone || 0;
        this.data[idx + 12] = perception?.predatorCount?.cautionZone || 0;
        
        // Ally info (2 floats)
        this.data[idx + 13] = perception?.allyCount || 0;
        this.data[idx + 14] = perception?.nearestAllyDistance || 9999;
        
        // Environment (1 float)
        this.data[idx + 15] = perception?.inSafeHaven ? 1 : 0;
        
        // Update indices
        this.writeIndex = (this.writeIndex + 1) % MAX_FRAMES;
        this.frameCount = Math.min(this.frameCount + 1, MAX_FRAMES);
        this.isFull = this.frameCount === MAX_FRAMES;
        this.lastTick = tick;
        
        if (this.startTick === -1) {
            this.startTick = tick;
        }
    }
    
    /**
     * Get frame at specific index (0 = oldest, frameCount-1 = newest)
     */
    getFrame(index) {
        if (index < 0 || index >= this.frameCount) return null;
        
        // Convert logical index to physical buffer index
        let physicalIdx;
        if (this.isFull) {
            physicalIdx = (this.writeIndex + index) % MAX_FRAMES;
        } else {
            physicalIdx = index;
        }
        
        const dataIdx = physicalIdx * FRAME_SIZE;
        
        return {
            tick: this.data[dataIdx + 0],
            position: { x: this.data[dataIdx + 1], y: this.data[dataIdx + 2] },
            velocity: { x: this.data[dataIdx + 3], y: this.data[dataIdx + 4] },
            fear: this.data[dataIdx + 5],
            energy: this.data[dataIdx + 6],
            state: this._decodeState(this.states[physicalIdx]),
            trauma: this.data[dataIdx + 7],
            age: this.data[dataIdx + 8],
            perception: {
                nearestPredator: {
                    distance: this.data[dataIdx + 9],
                    angle: this.data[dataIdx + 10]
                },
                predatorCount: {
                    dangerZone: this.data[dataIdx + 11],
                    cautionZone: this.data[dataIdx + 12]
                },
                allyCount: this.data[dataIdx + 13],
                nearestAllyDistance: this.data[dataIdx + 14],
                inSafeHaven: this.data[dataIdx + 15] === 1
            }
        };
    }
    
    /**
     * Extract a time window of frames
     */
    extractWindow(startTick, endTick) {
        const frames = [];
        
        for (let i = 0; i < this.frameCount; i++) {
            const frame = this.getFrame(i);
            if (frame && frame.tick >= startTick && frame.tick <= endTick) {
                frames.push(frame);
            }
        }
        
        return frames;
    }
    
    /**
     * Find frame index closest to tick
     */
    findFrameIndex(tick) {
        let bestIdx = -1;
        let bestDiff = Infinity;
        
        for (let i = 0; i < this.frameCount; i++) {
            const frame = this.getFrame(i);
            if (frame) {
                const diff = Math.abs(frame.tick - tick);
                if (diff < bestDiff) {
                    bestDiff = diff;
                    bestIdx = i;
                }
            }
        }
        
        return bestIdx;
    }
    
    /**
     * Get most recent frame
     */
    getLatestFrame() {
        if (this.frameCount === 0) return null;
        return this.getFrame(this.frameCount - 1);
    }
    
    /**
     * Get fear trajectory as array (for quick analysis)
     */
    getFearTrajectory() {
        const fears = new Float32Array(this.frameCount);
        for (let i = 0; i < this.frameCount; i++) {
            const frame = this.getFrame(i);
            if (frame) fears[i] = frame.fear;
        }
        return fears;
    }
    
    /**
     * Clear buffer
     */
    clear() {
        this.data.fill(0);
        this.states.fill(0);
        this.writeIndex = 0;
        this.frameCount = 0;
        this.isFull = false;
        this.startTick = -1;
        this.lastTick = -1;
    }
    
    /**
     * Get memory usage in bytes
     */
    getMemoryUsage() {
        return this.data.byteLength + this.states.byteLength;
    }
    
    /**
     * Decode state from int
     */
    _decodeState(stateCode) {
        const stateMap = ['CALM', 'ALERT', 'ANXIOUS', 'PANIC', 'HIDE', 'RECOVER', 'FREEZE'];
        return stateMap[stateCode] || 'CALM';
    }
    
    /**
     * Serialize to compact format for export
     */
    serialize() {
        const frames = [];
        for (let i = 0; i < this.frameCount; i++) {
            frames.push(this.getFrame(i));
        }
        return {
            agentId: this.agentId,
            frames: frames,
            startTick: this.startTick,
            endTick: this.lastTick
        };
    }
}

/**
 * BufferPool - Manage buffers for many agents efficiently
 */
export class BufferPool {
    constructor() {
        this.buffers = new Map();
        this.maxBuffers = 1000; // Limit total buffers
    }
    
    /**
     * Get or create buffer for agent
     */
    getBuffer(agentId) {
        if (!this.buffers.has(agentId)) {
            // Clear oldest buffer if at limit
            if (this.buffers.size >= this.maxBuffers) {
                const oldestId = this.buffers.keys().next().value;
                this.buffers.delete(oldestId);
            }
            this.buffers.set(agentId, new CircularTrajectoryBuffer(agentId));
        }
        return this.buffers.get(agentId);
    }
    
    /**
     * Remove buffer for dead agent
     */
    removeBuffer(agentId) {
        this.buffers.delete(agentId);
    }
    
    /**
     * Get total memory usage
     */
    getTotalMemoryUsage() {
        let total = 0;
        for (const buffer of this.buffers.values()) {
            total += buffer.getMemoryUsage();
        }
        return total;
    }
    
    /**
     * Clear all buffers
     */
    clear() {
        this.buffers.clear();
    }
    
    /**
     * Get all buffers
     */
    getAllBuffers() {
        return Array.from(this.buffers.values());
    }
}
