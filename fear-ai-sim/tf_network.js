/**
 * TFNetwork - Base Neural Network Class with TensorFlow.js
 * Optimized for CPU-only operation
 */
import * as tf from '@tensorflow/tfjs';

// Configure for CPU backend
tf.setBackend('cpu');
console.log('TensorFlow.js backend:', tf.getBackend());

export class TFNetwork {
    constructor(inputDim, outputDim, hiddenDims = [256, 256], learningRate = 3e-4, name = 'network') {
        this.inputDim = inputDim;
        this.outputDim = outputDim;
        this.hiddenDims = hiddenDims;
        this.learningRate = learningRate;
        this.name = name;
        this.model = null;
        this.optimizer = null;
        
        this.buildNetwork();
    }
    
    buildNetwork() {
        // Build sequential model
        const layers = [];
        
        // Input layer
        layers.push(tf.layers.dense({
            units: this.hiddenDims[0],
            activation: 'relu',
            inputShape: [this.inputDim],
            kernelInitializer: 'glorotUniform',
            name: `${this.name}_dense_1`
        }));
        
        // Hidden layers
        for (let i = 1; i < this.hiddenDims.length; i++) {
            layers.push(tf.layers.dense({
                units: this.hiddenDims[i],
                activation: 'relu',
                kernelInitializer: 'glorotUniform',
                name: `${this.name}_dense_${i + 1}`
            }));
        }
        
        // Output layer (linear activation by default)
        layers.push(tf.layers.dense({
            units: this.outputDim,
            activation: 'linear',
            kernelInitializer: 'glorotUniform',
            name: `${this.name}_output`
        }));
        
        this.model = tf.sequential({ layers });
        
        // Adam optimizer
        this.optimizer = tf.train.adam(this.learningRate);
        
        console.log(`TFNetwork '${this.name}' built:`, this.model.summary());
    }
    
    /**
     * Forward pass - returns output tensor
     * @param {tf.Tensor|Array} input - Input tensor or array
     * @returns {tf.Tensor} Output tensor
     */
    forward(input) {
        return tf.tidy(() => {
            const inputTensor = input instanceof tf.Tensor ? input : tf.tensor2d(input);
            return this.model.predict(inputTensor);
        });
    }
    
    /**
     * Forward pass that returns data (not tensor) - use for inference
     * @param {tf.Tensor|Array} input - Input tensor or array
     * @returns {Array} Output data
     */
    predict(input) {
        const output = this.forward(input);
        const data = output.dataSync();
        output.dispose();
        return Array.from(data);
    }
    
    /**
     * Compute gradients and apply them
     * @param {tf.Tensor} input - Input tensor
     * @param {Function} lossFn - Loss function that takes predictions and returns loss
     * @returns {number} Loss value
     */
    async trainStep(input, lossFn) {
        const inputTensor = input instanceof tf.Tensor ? input : tf.tensor2d(input);
        
        const { value, grads } = this.optimizer.computeGradients(() => {
            const predictions = this.model.predict(inputTensor);
            return lossFn(predictions);
        });
        
        this.optimizer.applyGradients(grads);
        
        // Clean up
        Object.values(grads).forEach(g => g.dispose());
        
        const lossValue = await value.data();
        value.dispose();
        inputTensor.dispose();
        
        return lossValue[0];
    }
    
    /**
     * Apply gradients directly
     * @param {Object} grads - Gradients object
     */
    applyGradients(grads) {
        this.optimizer.applyGradients(grads);
    }
    
    /**
     * Soft update (Polyak averaging) - update this network toward another
     * @param {TFNetwork} other - Network to copy from
     * @param {number} tau - Interpolation factor (0-1)
     */
    softUpdate(other, tau = 0.005) {
        const thisWeights = this.model.getWeights();
        const otherWeights = other.model.getWeights();
        
        const newWeights = thisWeights.map((w, i) => {
            return tf.tidy(() => {
                const blended = tf.add(
                    tf.mul(w, 1 - tau),
                    tf.mul(otherWeights[i], tau)
                );
                return blended;
            });
        });
        
        this.model.setWeights(newWeights);
        
        // Clean up
        newWeights.forEach(w => w.dispose());
    }
    
    /**
     * Hard copy from another network
     * @param {TFNetwork} other - Network to copy from
     */
    hardUpdate(other) {
        const weights = other.model.getWeights().map(w => w.clone());
        this.model.setWeights(weights);
        weights.forEach(w => w.dispose());
    }
    
    /**
     * Save weights to serializable format
     * @returns {Array} Array of weight arrays
     */
    save() {
        const weights = this.model.getWeights();
        return weights.map(w => ({
            shape: w.shape,
            data: Array.from(w.dataSync())
        }));
    }
    
    /**
     * Load weights from serialized format
     * @param {Array} weightData - Array of weight objects
     */
    load(weightData) {
        const tensors = weightData.map(w => 
            tf.tensor(w.data, w.shape)
        );
        this.model.setWeights(tensors);
        tensors.forEach(t => t.dispose());
    }
    
    /**
     * Get total parameter count
     * @returns {number} Number of parameters
     */
    getParameterCount() {
        return this.model.getWeights().reduce((sum, w) => sum + w.size, 0);
    }
    
    /**
     * Dispose of all tensors to free memory
     */
    dispose() {
        if (this.model) {
            this.model.dispose();
        }
    }
}

/**
 * Actor Network for SAC (Gaussian Policy)
 * Outputs mean and log_std for action distribution
 */
export class ActorNetwork {
    constructor(stateDim, actionDim, hiddenDims = [256, 256], learningRate = 3e-4) {
        this.stateDim = stateDim;
        this.actionDim = actionDim;
        this.hiddenDims = hiddenDims;
        this.learningRate = learningRate;
        this.LOG_STD_MIN = -20;
        this.LOG_STD_MAX = 2;
        this.EPSILON = 1e-6;
        
        this.buildNetwork();
    }
    
    buildNetwork() {
        // Shared feature layers
        const input = tf.input({ shape: [this.stateDim] });
        
        let x = tf.layers.dense({
            units: this.hiddenDims[0],
            activation: 'relu',
            kernelInitializer: 'glorotUniform',
            name: 'actor_dense_1'
        }).apply(input);
        
        for (let i = 1; i < this.hiddenDims.length; i++) {
            x = tf.layers.dense({
                units: this.hiddenDims[i],
                activation: 'relu',
                kernelInitializer: 'glorotUniform',
                name: `actor_dense_${i + 1}`
            }).apply(x);
        }
        
        // Mean head
        const mean = tf.layers.dense({
            units: this.actionDim,
            activation: 'linear',
            kernelInitializer: 'glorotUniform',
            name: 'actor_mean'
        }).apply(x);
        
        // Log std head (clamped output)
        const logStd = tf.layers.dense({
            units: this.actionDim,
            activation: 'linear',
            kernelInitializer: 'glorotUniform',
            name: 'actor_logstd'
        }).apply(x);
        
        this.model = tf.model({ inputs: input, outputs: [mean, logStd] });
        this.optimizer = tf.train.adam(this.learningRate);
        
        console.log('Actor network built:', this.model.summary());
    }
    
    /**
     * Sample action using reparameterization trick
     * @param {tf.Tensor} state - State tensor
     * @param {boolean} deterministic - If true, return mean without sampling
     * @returns {Object} { action, logProb, mean }
     */
    sample(state, deterministic = false) {
        return tf.tidy(() => {
            let stateTensor;
            if (state instanceof tf.Tensor) {
                stateTensor = state;
            } else if (Array.isArray(state) && Array.isArray(state[0])) {
                // Already 2D array
                stateTensor = tf.tensor2d(state);
            } else {
                // 1D array, wrap in batch dimension
                stateTensor = tf.tensor2d([state]);
            }
            const [mean, logStd] = this.model.predict(stateTensor);
            
            // Clamp log_std
            const logStdClamped = tf.clipByValue(logStd, this.LOG_STD_MIN, this.LOG_STD_MAX);
            const std = tf.exp(logStdClamped);
            
            let action, logProb;
            
            if (deterministic) {
                action = tf.tanh(mean);
                logProb = null;
            } else {
                // Reparameterization trick
                const noise = tf.randomNormal(mean.shape);
                const rawAction = tf.add(mean, tf.mul(std, noise));
                action = tf.tanh(rawAction);
                
                // Compute log probability with correction for tanh squashing
                const logProbRaw = tf.sub(
                    tf.log(std),
                    tf.add(
                        tf.mul(tf.square(noise), 0.5),
                        tf.mul(tf.log(tf.scalar(2 * Math.PI)), 0.5)
                    )
                );
                
                // Correction for tanh squashing
                const logProbCorrection = tf.sum(
                    tf.mul(tf.log(tf.sub(tf.scalar(1), tf.add(tf.square(action), this.EPSILON))), 2),
                    -1,
                    true
                );
                
                logProb = tf.sub(logProbRaw, logProbCorrection);
            }
            
            return { action, logProb, mean };
        });
    }
    
    /**
     * Get action for execution (data, not tensor)
     * @param {Array} state - State array
     * @param {boolean} deterministic - Use deterministic policy
     * @returns {Array} Action array
     */
    getAction(state, deterministic = false) {
        const { action } = this.sample(state, deterministic);
        const data = action.dataSync();
        action.dispose();
        return Array.from(data);
    }
    
    /**
     * Compute log probability of action given state
     * @param {tf.Tensor} state - State tensor
     * @param {tf.Tensor} action - Action tensor
     * @returns {tf.Tensor} Log probability
     */
    logProb(state, action) {
        return tf.tidy(() => {
            const stateTensor = state instanceof tf.Tensor ? state : tf.tensor2d(state);
            const [mean, logStd] = this.model.predict(stateTensor);
            
            const logStdClamped = tf.clipByValue(logStd, this.LOG_STD_MIN, this.LOG_STD_MAX);
            const std = tf.exp(logStdClamped);
            
            // Inverse tanh
            const actionClamped = tf.clipByValue(action, -1 + this.EPSILON, 1 - this.EPSILON);
            const rawAction = tf.atanh(actionClamped);
            
            // Log prob of Gaussian
            const logProb = tf.sub(
                tf.sub(
                    tf.mul(tf.scalar(-0.5), tf.log(tf.scalar(2 * Math.PI))),
                    logStdClamped
                ),
                tf.mul(tf.square(tf.div(tf.sub(rawAction, mean), std)), 0.5)
            );
            
            // Correction for tanh
            const correction = tf.sum(
                tf.mul(tf.log(tf.sub(tf.scalar(1), tf.square(action))), 2),
                -1,
                true
            );
            
            return tf.sub(logProb, correction);
        });
    }
    
    save() {
        const weights = this.model.getWeights();
        return weights.map(w => ({
            shape: w.shape,
            data: Array.from(w.dataSync())
        }));
    }
    
    load(weightData) {
        const tensors = weightData.map(w => tf.tensor(w.data, w.shape));
        this.model.setWeights(tensors);
        tensors.forEach(t => t.dispose());
    }
    
    softUpdate(other, tau = 0.005) {
        const thisWeights = this.model.getWeights();
        const otherWeights = other.model.getWeights();
        
        const newWeights = thisWeights.map((w, i) => {
            return tf.tidy(() => {
                return tf.add(
                    tf.mul(w, 1 - tau),
                    tf.mul(otherWeights[i], tau)
                );
            });
        });
        
        this.model.setWeights(newWeights);
        newWeights.forEach(w => w.dispose());
    }
    
    dispose() {
        if (this.model) {
            this.model.dispose();
        }
    }
}

/**
 * Critic Network (Q-Network) for SAC
 */
export class CriticNetwork {
    constructor(stateDim, actionDim, hiddenDims = [256, 256], learningRate = 3e-4) {
        this.stateDim = stateDim;
        this.actionDim = actionDim;
        this.hiddenDims = hiddenDims;
        this.learningRate = learningRate;
        
        this.buildNetwork();
    }
    
    buildNetwork() {
        // Input: concatenated state and action
        const input = tf.input({ shape: [this.stateDim + this.actionDim] });
        
        let x = tf.layers.dense({
            units: this.hiddenDims[0],
            activation: 'relu',
            kernelInitializer: 'glorotUniform',
            name: 'critic_dense_1'
        }).apply(input);
        
        for (let i = 1; i < this.hiddenDims.length; i++) {
            x = tf.layers.dense({
                units: this.hiddenDims[i],
                activation: 'relu',
                kernelInitializer: 'glorotUniform',
                name: `critic_dense_${i + 1}`
            }).apply(x);
        }
        
        const output = tf.layers.dense({
            units: 1,
            activation: 'linear',
            kernelInitializer: 'glorotUniform',
            name: 'critic_output'
        }).apply(x);
        
        this.model = tf.model({ inputs: input, outputs: output });
        this.optimizer = tf.train.adam(this.learningRate);
        
        console.log('Critic network built');
    }
    
    /**
     * Compute Q-value
     * @param {tf.Tensor} state - State tensor
     * @param {tf.Tensor} action - Action tensor
     * @returns {tf.Tensor} Q-value
     */
    forward(state, action) {
        return tf.tidy(() => {
            const stateTensor = state instanceof tf.Tensor ? state : tf.tensor2d(state);
            const actionTensor = action instanceof tf.Tensor ? action : tf.tensor2d(action);
            const combined = tf.concat([stateTensor, actionTensor], 1);
            return this.model.predict(combined);
        });
    }
    
    /**
     * Get Q-value as number
     * @param {Array} state - State array
     * @param {Array} action - Action array
     * @returns {number} Q-value
     */
    predict(state, action) {
        const qValue = this.forward(state, action);
        const value = qValue.dataSync()[0];
        qValue.dispose();
        return value;
    }
    
    save() {
        const weights = this.model.getWeights();
        return weights.map(w => ({
            shape: w.shape,
            data: Array.from(w.dataSync())
        }));
    }
    
    load(weightData) {
        const tensors = weightData.map(w => tf.tensor(w.data, w.shape));
        this.model.setWeights(tensors);
        tensors.forEach(t => t.dispose());
    }
    
    softUpdate(other, tau = 0.005) {
        const thisWeights = this.model.getWeights();
        const otherWeights = other.model.getWeights();
        
        const newWeights = thisWeights.map((w, i) => {
            return tf.tidy(() => {
                return tf.add(
                    tf.mul(w, 1 - tau),
                    tf.mul(otherWeights[i], tau)
                );
            });
        });
        
        this.model.setWeights(newWeights);
        newWeights.forEach(w => w.dispose());
    }
    
    dispose() {
        if (this.model) {
            this.model.dispose();
        }
    }
}

/**
 * Decomposed Centralized Critic for Massive Scale (MASAC)
 * Scales O(1) with respect to agent count by using symmetric pooling.
 */
export class ScalableCriticNetwork {
    constructor(agentStateDim, agentActionDim, hiddenDims = [128, 128], learningRate = 3e-4) {
        this.agentStateDim = agentStateDim;
        this.agentActionDim = agentActionDim;
        this.hiddenDims = hiddenDims;
        this.learningRate = learningRate;
        
        this.buildNetwork();
    }
    
    buildNetwork() {
        // WORLD-CLASS ARCHITECTURE: Decomposed Attention-style Critic
        // 1. Agent Feature Extractor (Shared across all agent slots)
        const agentInput = tf.input({ shape: [this.agentStateDim + this.agentActionDim] });
        let x = tf.layers.dense({ units: 64, activation: 'relu' }).apply(agentInput);
        x = tf.layers.dense({ units: 64, activation: 'relu' }).apply(x);
        const featureModel = tf.model({ inputs: agentInput, outputs: x });

        // 2. Global Aggregator (Total states)
        // We use a trick: instead of fixed input, we allow any number of agents
        // By using Global Average Pooling on the "Agent Dimension"
        const stateInput = tf.input({ shape: [null, this.agentStateDim + this.agentActionDim] });
        
        // This is a custom layer concept in TFJS sequential, but we can 
        // simulate it by reshaping or using a fixed maximum if needed.
        // For MASAC in this sim, we'll use a Fixed Max of 16 'Global Context' agents 
        // to keep math stable while allowing 10,000+ total population.
        const MAX_CONTEXT = 16;
        const fixedInput = tf.input({ shape: [MAX_CONTEXT, this.agentStateDim + this.agentActionDim] });
        
        // Apply feature extractor to each agent in context
        // TimeDistributed allows sharing weights across the agent list
        const td = tf.layers.timeDistributed({ layer: featureModel }).apply(fixedInput);
        
        // Permutation invariant pooling (Max or Average)
        // This is key: the critic doesn't care about the order of agents
        const pooled = tf.layers.globalAveragePooling1d({}).apply(td);
        
        // Final Q-value head
        let q = tf.layers.dense({ units: 128, activation: 'relu' }).apply(pooled);
        q = tf.layers.dense({ units: 1, activation: 'linear' }).apply(q);
        
        this.model = tf.model({ inputs: fixedInput, outputs: q });
        this.optimizer = tf.train.adam(this.learningRate);
        
        console.log('[MASAC] Scalable Decomposed Critic Initialized');
    }

    forward(agentStates, agentActions) {
        return tf.tidy(() => {
            // states: [batch, numAgents * stateDim]
            // actions: [batch, numAgents * actionDim]
            // We need to reshape them into [batch, numAgents, stateDim + actionDim]
            const batchSize = agentStates.shape[0];
            const numAgents = agentStates.shape[1] / this.agentStateDim;
            
            const statesReshaped = agentStates.reshape([batchSize, numAgents, this.agentStateDim]);
            const actionsReshaped = agentActions.reshape([batchSize, numAgents, this.agentActionDim]);
            
            const combined = tf.concat([statesReshaped, actionsReshaped], 2);
            
            // Limit to MAX_CONTEXT agents for the centralized critic to prevent OOM
            const MAX_CONTEXT = 16;
            const context = combined.slice([0, 0, 0], [batchSize, Math.min(numAgents, MAX_CONTEXT), -1]);
            
            // If fewer than MAX_CONTEXT, pad with zeros
            let paddedContext = context;
            if (numAgents < MAX_CONTEXT) {
                const padding = tf.zeros([batchSize, MAX_CONTEXT - numAgents, this.agentStateDim + this.agentActionDim]);
                paddedContext = tf.concat([context, padding], 1);
            }

            return this.model.predict(paddedContext);
        });
    }

    save() {
        const weights = this.model.getWeights();
        return weights.map(w => ({ shape: w.shape, data: Array.from(w.dataSync()) }));
    }

    load(weightData) {
        const tensors = weightData.map(w => tf.tensor(w.data, w.shape));
        this.model.setWeights(tensors);
        tensors.forEach(t => t.dispose());
    }

    dispose() {
        this.model.dispose();
    }
}

/**
 * Scalable Twin Critic for MASAC
 */
export class ScalableTwinCritic {
    constructor(agentStateDim, agentActionDim, hiddenDims = [128, 128], learningRate = 3e-4) {
        this.q1 = new ScalableCriticNetwork(agentStateDim, agentActionDim, hiddenDims, learningRate);
        this.q2 = new ScalableCriticNetwork(agentStateDim, agentActionDim, hiddenDims, learningRate);
    }

    forward(states, actions) {
        return {
            q1: this.q1.forward(states, actions),
            q2: this.q2.forward(states, actions)
        };
    }

    hardUpdate(other) {
        this.q1.load(other.q1.save());
        this.q2.load(other.q2.save());
    }

    softUpdate(other, tau = 0.005) {
        // Implement manual soft update since they aren't sequential
        const update = (net, target) => {
            const w1 = net.model.getWeights();
            const w2 = target.model.getWeights();
            const blended = w1.map((w, i) => tf.tidy(() => tf.add(tf.mul(w, 1 - tau), tf.mul(w2[i], tau))));
            net.model.setWeights(blended);
            blended.forEach(b => b.dispose());
        };
        update(this.q1, other.q1);
        update(this.q2, other.q2);
    }

    save() { return { q1: this.q1.save(), q2: this.q2.save() }; }
    load(data) { this.q1.load(data.q1); this.q2.load(data.q2); }
    dispose() { this.q1.dispose(); this.q2.dispose(); }
}

export default { TFNetwork, ActorNetwork, CriticNetwork, ScalableCriticNetwork, ScalableTwinCritic };
