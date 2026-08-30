/**
 * MASAC Web Worker
 * Offloads neural network training to separate thread
 * Keeps main thread free for smooth rendering
 */

let tf = null;
let trainer = null;
let isTraining = false;

// Import TensorFlow.js dynamically
self.importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
// Deterministic training metric. The module is a pure ES module that also
// publishes itself on the global scope via `importScripts` so this classic
// worker can use the same function that the test suite imports.
self.importScripts('./masac_metrics.js');

// Configure for CPU
if (tf) {
    tf.setBackend('cpu');
}

self.onmessage = async function(e) {
    const { type, data } = e.data;
    
    switch (type) {
        case 'INIT':
            await initTrainer(data.config);
            break;
            
        case 'SELECT_ACTIONS':
            const actions = selectActions(data.states, data.agentType);
            self.postMessage({ type: 'ACTIONS', agentType: data.agentType, actions });
            break;
            
        case 'TRAIN':
            if (!isTraining) {
                isTraining = true;
                const metrics = await trainStep(data.batch);
                self.postMessage({ type: 'TRAIN_COMPLETE', metrics, agentType: data.agentType });
                isTraining = false;
            }
            break;
            
        case 'STORE':
            storeExperience(data.experience, data.agentType);
            break;
            
        case 'GET_METRICS':
            self.postMessage({ type: 'METRICS', metrics: getMetrics() });
            break;
            
        case 'SAVE':
            const saveData = saveModels();
            self.postMessage({ type: 'SAVE_DATA', data: saveData });
            break;
            
        case 'LOAD':
            loadModels(data.saveData);
            break;
    }
};

async function initTrainer(config) {
    // Initialize trainer configuration
    self.config = config;
    self.replayBuffers = {
        predators: [],
        prey: []
    };
    self.actors = {};
    
    // Build simple actor networks for inference
    for (const [agentType, agentConfig] of Object.entries(config.agents)) {
        self.actors[agentType] = buildActorNetwork(
            agentConfig.stateDim,
            agentConfig.actionDim,
            agentConfig.hiddenDims
        );
    }
    
    self.postMessage({ type: 'INIT_COMPLETE' });
}

function buildActorNetwork(stateDim, actionDim, hiddenDims) {
    const inputs = tf.input({ shape: [stateDim] });
    let x = inputs;
    
    for (const units of hiddenDims) {
        x = tf.layers.dense({ units, activation: 'relu' }).apply(x);
    }
    
    const mean = tf.layers.dense({ units: actionDim, activation: 'tanh' }).apply(x);
    const logStd = tf.layers.dense({ units: actionDim }).apply(x);
    
    return tf.model({ inputs, outputs: [mean, logStd] });
}

function selectActions(states, agentType) {
    if (!self.actors[agentType]) return null;
    
    const model = self.actors[agentType];
    const statesTensor = tf.tensor2d(states);
    
    const [mean, logStd] = model.predict(statesTensor);
    const std = tf.exp(tf.clipByValue(logStd, -20, 2));
    const noise = tf.randomNormal(mean.shape);
    const actions = tf.tanh(tf.add(mean, tf.mul(std, noise)));
    
    const actionsData = actions.dataSync();
    
    statesTensor.dispose();
    mean.dispose();
    logStd.dispose();
    std.dispose();
    noise.dispose();
    actions.dispose();
    
    // Reshape to [numAgents, actionDim]
    const numAgents = states.length;
    const actionDim = actionsData.length / numAgents;
    const result = [];
    for (let i = 0; i < numAgents; i++) {
        const agentActions = [];
        for (let j = 0; j < actionDim; j++) {
            agentActions.push(actionsData[i * actionDim + j]);
        }
        result.push(agentActions);
    }
    
    return result;
}

function storeExperience(experience, agentType) {
    const buffer = self.replayBuffers[agentType];
    if (buffer) {
        buffer.push(experience);
        // Keep buffer size limited
        if (buffer.length > self.config.bufferSize) {
            buffer.shift();
        }
    }
}

async function trainStep(batch) {
    // Delegate to the shared metric module so the worker's behavior and the
    // test suite both exercise the same function. The metrics module is loaded
    // via `importScripts` above and exposes itself on `self.MasacMetrics`.
    const compute = self.MasacMetrics && self.MasacMetrics.computeTrainingMetric;
    if (typeof compute !== 'function') {
        throw new Error('MasacMetrics.computeTrainingMetric unavailable; metrics module not loaded');
    }
    return compute(batch, self.replayBuffers, self.config);
}

function getMetrics() {
    return {
        predatorBufferSize: self.replayBuffers.predators?.length || 0,
        preyBufferSize: self.replayBuffers.prey?.length || 0,
        isTraining
    };
}

function saveModels() {
    // Serialize model weights
    const weights = {};
    for (const [agentType, model] of Object.entries(self.actors)) {
        weights[agentType] = model.getWeights().map(w => ({
            shape: w.shape,
            data: Array.from(w.dataSync())
        }));
    }
    return weights;
}

function loadModels(saveData) {
    for (const [agentType, weightData] of Object.entries(saveData)) {
        if (self.actors[agentType]) {
            const tensors = weightData.map(w => tf.tensor(w.data, w.shape));
            self.actors[agentType].setWeights(tensors);
            tensors.forEach(t => t.dispose());
        }
    }
}
