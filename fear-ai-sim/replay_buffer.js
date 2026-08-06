/**
 * Experience Replay Buffer for Deep RL
 * CPU-optimized circular buffer with efficient sampling
 */
export class ReplayBuffer {
    constructor(capacity = 100000, stateDim, actionDim) {
        this.capacity = capacity;
        this.stateDim = stateDim;
        this.actionDim = actionDim;
        this.size = 0;
        this.position = 0;
        
        // Pre-allocate arrays for efficiency
        this.states = new Array(capacity);
        this.actions = new Array(capacity);
        this.rewards = new Float32Array(capacity);
        this.nextStates = new Array(capacity);
        this.dones = new Uint8Array(capacity);
        
        // For prioritized replay (optional)
        this.priorities = new Float32Array(capacity);
        this.usePrioritized = false;
        this.alpha = 0.6;  // Priority exponent
        this.beta = 0.4;   // Importance sampling exponent
        this.betaIncrement = 0.001;
        this.epsilon = 1e-6;
        
        // Initialize priorities
        this.priorities.fill(1.0);
    }
    
    /**
     * Store a transition
     * @param {Array} state - Current state
     * @param {Array} action - Action taken
     * @param {number} reward - Reward received
     * @param {Array} nextState - Next state
     * @param {boolean} done - Episode done flag
     */
    push(state, action, reward, nextState, done) {
        // Store at current position
        this.states[this.position] = state.slice();
        this.actions[this.position] = action.slice();
        this.rewards[this.position] = reward;
        this.nextStates[this.position] = nextState.slice();
        this.dones[this.position] = done ? 1 : 0;
        this.priorities[this.position] = this.priorities.max || 1.0;
        
        // Update position and size
        this.position = (this.position + 1) % this.capacity;
        this.size = Math.min(this.size + 1, this.capacity);
    }
    
    /**
     * Sample a batch of transitions
     * @param {number} batchSize - Number of samples
     * @returns {Object} Batch of transitions
     */
    sample(batchSize = 256) {
        if (this.size < batchSize) {
            batchSize = this.size;
        }
        
        const indices = new Int32Array(batchSize);
        
        if (this.usePrioritized) {
            // Prioritized experience replay
            const probs = this.priorities.slice(0, this.size);
            const sumProbs = probs.reduce((a, b) => a + b, 0);
            
            for (let i = 0; i < batchSize; i++) {
                const rand = Math.random() * sumProbs;
                let cumsum = 0;
                for (let j = 0; j < this.size; j++) {
                    cumsum += probs[j];
                    if (cumsum >= rand) {
                        indices[i] = j;
                        break;
                    }
                }
            }
            
            // Compute importance sampling weights
            const weights = new Float32Array(batchSize);
            const minProb = Math.min(...probs.slice(0, this.size)) / sumProbs;
            const maxWeight = Math.pow(this.size * minProb, -this.beta);
            
            for (let i = 0; i < batchSize; i++) {
                const prob = probs[indices[i]] / sumProbs;
                weights[i] = Math.pow(this.size * prob, -this.beta) / maxWeight;
            }
            
            // Anneal beta
            this.beta = Math.min(1.0, this.beta + this.betaIncrement);
            
            return this._getBatch(indices, weights);
        } else {
            // Uniform sampling
            for (let i = 0; i < batchSize; i++) {
                indices[i] = Math.floor(Math.random() * this.size);
            }
            
            return this._getBatch(indices);
        }
    }
    
    /**
     * Get batch data at specified indices
     * @private
     */
    _getBatch(indices, weights = null) {
        const batchSize = indices.length;
        
        const states = new Float32Array(batchSize * this.stateDim);
        const actions = new Float32Array(batchSize * this.actionDim);
        const rewards = new Float32Array(batchSize);
        const nextStates = new Float32Array(batchSize * this.stateDim);
        const dones = new Float32Array(batchSize);
        
        for (let i = 0; i < batchSize; i++) {
            const idx = indices[i];
            
            states.set(this.states[idx], i * this.stateDim);
            actions.set(this.actions[idx], i * this.actionDim);
            rewards[i] = this.rewards[idx];
            nextStates.set(this.nextStates[idx], i * this.stateDim);
            dones[i] = this.dones[idx];
        }
        
        return {
            states,
            actions,
            rewards,
            nextStates,
            dones,
            indices,
            weights: weights || new Float32Array(batchSize).fill(1.0)
        };
    }
    
    /**
     * Update priorities for sampled transitions
     * @param {Int32Array} indices - Indices to update
     * @param {Float32Array} tdErrors - TD errors for priorities
     */
    updatePriorities(indices, tdErrors) {
        if (!this.usePrioritized) return;
        
        for (let i = 0; i < indices.length; i++) {
            const priority = Math.pow(Math.abs(tdErrors[i]) + this.epsilon, this.alpha);
            this.priorities[indices[i]] = priority;
        }
    }
    
    /**
     * Enable prioritized experience replay
     */
    enablePrioritized(alpha = 0.6, beta = 0.4) {
        this.usePrioritized = true;
        this.alpha = alpha;
        this.beta = beta;
    }
    
    /**
     * Get current buffer size
     * @returns {number} Number of stored transitions
     */
    getSize() {
        return this.size;
    }
    
    /**
     * Check if buffer has enough samples
     * @param {number} batchSize - Required batch size
     * @returns {boolean}
     */
    canSample(batchSize) {
        return this.size >= batchSize;
    }
    
    /**
     * Clear the buffer
     */
    clear() {
        this.size = 0;
        this.position = 0;
        this.states.fill(null);
        this.actions.fill(null);
        this.nextStates.fill(null);
        this.priorities.fill(1.0);
    }
    
    /**
     * Save buffer state (for checkpointing)
     * @returns {Object} Serializable state
     */
    save() {
        return {
            capacity: this.capacity,
            stateDim: this.stateDim,
            actionDim: this.actionDim,
            size: this.size,
            position: this.position,
            states: this.states.slice(0, this.size),
            actions: this.actions.slice(0, this.size),
            rewards: Array.from(this.rewards.slice(0, this.size)),
            nextStates: this.nextStates.slice(0, this.size),
            dones: Array.from(this.dones.slice(0, this.size)),
            priorities: Array.from(this.priorities.slice(0, this.size))
        };
    }
    
    /**
     * Load buffer state
     * @param {Object} data - Saved state
     */
    load(data) {
        this.capacity = data.capacity;
        this.stateDim = data.stateDim;
        this.actionDim = data.actionDim;
        this.size = data.size;
        this.position = data.position;
        
        this.states = data.states;
        this.actions = data.actions;
        this.rewards = new Float32Array(data.rewards);
        this.nextStates = data.nextStates;
        this.dones = new Uint8Array(data.dones);
        this.priorities = new Float32Array(data.priorities);
    }
}

/**
 * Multi-Agent Replay Buffer
 * Stores experiences from multiple agents with centralized/decentralized handling
 */
export class MultiAgentReplayBuffer {
    constructor(capacity, numAgents, stateDim, actionDim, centralizedStateDim = null) {
        this.numAgents = numAgents;
        this.centralizedStateDim = centralizedStateDim || stateDim * numAgents;
        
        // Individual buffers for each agent
        this.buffers = [];
        for (let i = 0; i < numAgents; i++) {
            this.buffers.push(new ReplayBuffer(capacity, stateDim, actionDim));
        }
        
        // Global buffer for centralized training
        this.globalBuffer = new ReplayBuffer(capacity, this.centralizedStateDim, actionDim * numAgents);
        
        this.capacity = capacity;
        this.stateDim = stateDim;
        this.actionDim = actionDim;
    }
    
    /**
     * Store transitions from all agents
     * @param {Array} states - Array of states per agent
     * @param {Array} actions - Array of actions per agent
     * @param {Array} rewards - Array of rewards per agent
     * @param {Array} nextStates - Array of next states per agent
     * @param {Array} dones - Array of done flags per agent
     * @param {Array} globalState - Centralized state (optional)
     * @param {Array} nextGlobalState - Next centralized state (optional)
     */
    push(states, actions, rewards, nextStates, dones, globalState = null, nextGlobalState = null) {
        // Store in individual buffers
        for (let i = 0; i < this.numAgents; i++) {
            this.buffers[i].push(states[i], actions[i], rewards[i], nextStates[i], dones[i]);
        }
        
        // Store in global buffer if centralized states provided
        if (globalState && nextGlobalState) {
            // Flatten all actions for global buffer
            const globalActions = actions.flat();
            // Use mean reward for global
            const globalReward = rewards.reduce((a, b) => a + b, 0) / rewards.length;
            const globalDone = dones.some(d => d);
            
            this.globalBuffer.push(globalState, globalActions, globalReward, nextGlobalState, globalDone);
        }
    }
    
    /**
     * Sample batch for a specific agent
     * @param {number} agentId - Agent index
     * @param {number} batchSize - Batch size
     */
    sampleForAgent(agentId, batchSize) {
        return this.buffers[agentId].sample(batchSize);
    }
    
    /**
     * Sample global batch for centralized critic
     * @param {number} batchSize - Batch size
     */
    sampleGlobal(batchSize) {
        return this.globalBuffer.sample(batchSize);
    }
    
    /**
     * Sample batch with all agents' data
     * @param {number} batchSize - Batch size
     */
    sampleMultiAgent(batchSize) {
        const samples = [];
        for (let i = 0; i < this.numAgents; i++) {
            samples.push(this.buffers[i].sample(batchSize));
        }
        return samples;
    }
    
    canSample(batchSize) {
        return this.buffers.every(b => b.canSample(batchSize));
    }
    
    clear() {
        this.buffers.forEach(b => b.clear());
        this.globalBuffer.clear();
    }
    
    getSize() {
        return Math.min(...this.buffers.map(b => b.getSize()));
    }
}

export default { ReplayBuffer, MultiAgentReplayBuffer };
