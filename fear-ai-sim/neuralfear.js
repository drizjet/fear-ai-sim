/**
 * Neural Network Fear Detection - T4.5
 * 
 * Implements a feedforward neural network with backpropagation
 * for real-time fear level prediction from player features.
 * 
 * Features:
 * - Multi-layer perceptron (MLP) architecture
 * - ReLU activation with sigmoid output
 * - Mini-batch gradient descent
 * - Dropout for regularization
 * - Early stopping to prevent overfitting
 * - Feature normalization
 * - Online learning capability
 */

/**
 * Neural Network for fear prediction
 * Architecture: Input -> Hidden(s) -> Output
 */
export class FearNeuralNetwork {
    constructor(config = {}) {
        this.config = {
            inputSize: config.inputSize || 12,
            hiddenLayers: config.hiddenLayers || [64, 32],
            outputSize: config.outputSize || 1,
            learningRate: config.learningRate || 0.001,
            dropoutRate: config.dropoutRate || 0.2,
            batchSize: config.batchSize || 32,
            ...config
        };

        // Initialize weights and biases
        this.weights = [];
        this.biases = [];
        this.initializeParameters();

        // Training state
        this.trainingHistory = [];
        this.isTraining = false;
        this.bestLoss = Infinity;
        this.patience = 10;
        this.patienceCounter = 0;

        // Feature normalization parameters
        this.featureMeans = null;
        this.featureStds = null;
    }

    /**
     * Initialize network parameters with Xavier/Glorot initialization
     */
    initializeParameters() {
        const layerSizes = [
            this.config.inputSize,
            ...this.config.hiddenLayers,
            this.config.outputSize
        ];

        for (let i = 0; i < layerSizes.length - 1; i++) {
            const inputSize = layerSizes[i];
            const outputSize = layerSizes[i + 1];

            // Xavier initialization
            const std = Math.sqrt(2.0 / (inputSize + outputSize));
            const weight = [];
            
            for (let j = 0; j < inputSize; j++) {
                const row = [];
                for (let k = 0; k < outputSize; k++) {
                    row.push(this.gaussianRandom(0, std));
                }
                weight.push(row);
            }

            this.weights.push(weight);
            this.biases.push(new Array(outputSize).fill(0).map(() => this.gaussianRandom(0, std)));
        }
    }

    /**
     * Gaussian random number generator
     */
    gaussianRandom(mean = 0, std = 1) {
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + z * std;
    }

    /**
     * ReLU activation function
     */
    relu(x) {
        return Math.max(0, x);
    }

    /**
     * ReLU derivative
     */
    reluDerivative(x) {
        return x > 0 ? 1 : 0;
    }

    /**
     * Sigmoid activation for output (0-1 range for fear)
     */
    sigmoid(x) {
        return 1 / (1 + Math.exp(-Math.max(-50, Math.min(50, x))));
    }

    /**
     * Sigmoid derivative
     */
    sigmoidDerivative(x) {
        const s = this.sigmoid(x);
        return s * (1 - s);
    }

    /**
     * Forward pass through network
     */
    forward(input, training = false) {
        let current = [...input];
        const activations = [current];
        const preActivations = [];

        // Hidden layers with ReLU
        for (let i = 0; i < this.weights.length - 1; i++) {
            const weight = this.weights[i];
            const bias = this.biases[i];
            
            const preActivation = [];
            const activation = [];

            for (let j = 0; j < bias.length; j++) {
                let sum = bias[j];
                for (let k = 0; k < current.length; k++) {
                    sum += current[k] * weight[k][j];
                }
                preActivation.push(sum);
                
                // Apply dropout during training
                if (training && Math.random() < this.config.dropoutRate) {
                    activation.push(0); // Drop this neuron
                } else {
                    activation.push(this.relu(sum));
                }
            }

            preActivations.push(preActivation);
            activations.push(activation);
            current = activation;
        }

        // Output layer with sigmoid
        const lastWeight = this.weights[this.weights.length - 1];
        const lastBias = this.biases[this.biases.length - 1];
        
        const outputPre = [];
        const output = [];

        for (let j = 0; j < lastBias.length; j++) {
            let sum = lastBias[j];
            for (let k = 0; k < current.length; k++) {
                sum += current[k] * lastWeight[k][j];
            }
            outputPre.push(sum);
            output.push(this.sigmoid(sum));
        }

        preActivations.push(outputPre);
        activations.push(output);

        return { output, activations, preActivations };
    }

    /**
     * Predict fear level from features
     */
    predict(features) {
        // Normalize if statistics available
        if (this.featureMeans && this.featureStds) {
            features = this.normalizeFeatures(features);
        }

        const result = this.forward(features);
        return result.output[0];
    }

    /**
     * Backward pass (backpropagation)
     */
    backward(input, target, activations, preActivations) {
        const weightGradients = this.weights.map(w => 
            w.map(row => row.map(() => 0))
        );
        const biasGradients = this.biases.map(b => b.map(() => 0));

        // Output layer error
        let deltas = [];
        for (let i = 0; i < target.length; i++) {
            const error = activations[activations.length - 1][i] - target[i];
            deltas.push(error * this.sigmoidDerivative(preActivations[preActivations.length - 1][i]));
        }

        // Gradients for output layer
        for (let j = 0; j < this.weights[this.weights.length - 1].length; j++) {
            for (let k = 0; k < this.weights[this.weights.length - 1][j].length; k++) {
                weightGradients[this.weights.length - 1][j][k] = 
                    activations[activations.length - 2][j] * deltas[k];
            }
        }
        for (let k = 0; k < deltas.length; k++) {
            biasGradients[biasGradients.length - 1][k] = deltas[k];
        }

        // Backpropagate through hidden layers
        for (let layer = this.weights.length - 2; layer >= 0; layer--) {
            const newDeltas = [];
            
            // For each neuron in current layer
            // weights[layer+1] connects current layer to next layer
            // weights[layer+1].length = number of neurons in current layer
            for (let j = 0; j < this.weights[layer + 1].length; j++) {
                let error = 0;
                // Sum errors from next layer, weighted by connections
                for (let k = 0; k < deltas.length; k++) {
                    error += deltas[k] * this.weights[layer + 1][j][k];
                }
                newDeltas.push(error * this.reluDerivative(preActivations[layer][j]));
            }
            
            deltas = newDeltas;

            // Calculate gradients
            const prevActivation = layer === 0 ? input : activations[layer];
            for (let j = 0; j < this.weights[layer].length; j++) {
                for (let k = 0; k < this.weights[layer][j].length; k++) {
                    weightGradients[layer][j][k] = prevActivation[j] * deltas[k];
                }
            }
            for (let k = 0; k < deltas.length; k++) {
                biasGradients[layer][k] = deltas[k];
            }
        }

        return { weightGradients, biasGradients };
    }

    /**
     * Update weights using gradients
     */
    updateWeights(weightGradients, biasGradients) {
        for (let i = 0; i < this.weights.length; i++) {
            for (let j = 0; j < this.weights[i].length; j++) {
                for (let k = 0; k < this.weights[i][j].length; k++) {
                    this.weights[i][j][k] -= this.config.learningRate * weightGradients[i][j][k];
                }
            }
        }

        for (let i = 0; i < this.biases.length; i++) {
            for (let j = 0; j < this.biases[i].length; j++) {
                this.biases[i][j] -= this.config.learningRate * biasGradients[i][j];
            }
        }
    }

    /**
     * Calculate mean squared error
     */
    calculateLoss(predictions, targets) {
        let totalLoss = 0;
        for (let i = 0; i < predictions.length; i++) {
            const diff = predictions[i][0] - targets[i][0];
            totalLoss += diff * diff;
        }
        return totalLoss / predictions.length;
    }

    /**
     * Train on single example (online learning)
     */
    trainOnline(features, target) {
        if (this.featureMeans === null) {
            this.updateNormalization(features);
        }

        const normalizedFeatures = this.normalizeFeatures(features);
        const targetArray = [target];

        const forwardResult = this.forward(normalizedFeatures, true);
        const { weightGradients, biasGradients } = this.backward(
            normalizedFeatures,
            targetArray,
            forwardResult.activations,
            forwardResult.preActivations
        );

        this.updateWeights(weightGradients, biasGradients);

        const loss = this.calculateLoss([forwardResult.output], [targetArray]);
        return loss;
    }

    /**
     * Train on batch
     */
    trainBatch(features, targets) {
        if (features.length === 0) return 0;

        // Normalize features
        if (this.featureMeans === null) {
            this.calculateNormalization(features);
        }

        const normalizedFeatures = features.map(f => this.normalizeFeatures(f));

        let totalLoss = 0;
        const batchWeightGradients = this.weights.map(w => 
            w.map(row => row.map(() => 0))
        );
        const batchBiasGradients = this.biases.map(b => b.map(() => 0));

        // Accumulate gradients
        for (let i = 0; i < normalizedFeatures.length; i++) {
            const forwardResult = this.forward(normalizedFeatures[i], true);
            const { weightGradients, biasGradients } = this.backward(
                normalizedFeatures[i],
                [targets[i]],
                forwardResult.activations,
                forwardResult.preActivations
            );

            // Accumulate
            for (let layer = 0; layer < weightGradients.length; layer++) {
                for (let j = 0; j < weightGradients[layer].length; j++) {
                    for (let k = 0; k < weightGradients[layer][j].length; k++) {
                        batchWeightGradients[layer][j][k] += weightGradients[layer][j][k];
                    }
                }
                for (let k = 0; k < biasGradients[layer].length; k++) {
                    batchBiasGradients[layer][k] += biasGradients[layer][k];
                }
            }

            totalLoss += this.calculateLoss([forwardResult.output], [[targets[i]]]);
        }

        // Average gradients
        const batchSize = normalizedFeatures.length;
        for (let layer = 0; layer < batchWeightGradients.length; layer++) {
            for (let j = 0; j < batchWeightGradients[layer].length; j++) {
                for (let k = 0; k < batchWeightGradients[layer][j].length; k++) {
                    batchWeightGradients[layer][j][k] /= batchSize;
                }
            }
            for (let k = 0; k < batchBiasGradients[layer].length; k++) {
                batchBiasGradients[layer][k] /= batchSize;
            }
        }

        this.updateWeights(batchWeightGradients, batchBiasGradients);

        return totalLoss / batchSize;
    }

    /**
     * Calculate feature normalization statistics
     */
    calculateNormalization(features) {
        const featureCount = features[0].length;
        this.featureMeans = new Array(featureCount).fill(0);
        this.featureStds = new Array(featureCount).fill(0);

        // Calculate means
        for (const feature of features) {
            for (let i = 0; i < featureCount; i++) {
                this.featureMeans[i] += feature[i];
            }
        }
        for (let i = 0; i < featureCount; i++) {
            this.featureMeans[i] /= features.length;
        }

        // Calculate standard deviations
        for (const feature of features) {
            for (let i = 0; i < featureCount; i++) {
                const diff = feature[i] - this.featureMeans[i];
                this.featureStds[i] += diff * diff;
            }
        }
        for (let i = 0; i < featureCount; i++) {
            this.featureStds[i] = Math.sqrt(this.featureStds[i] / features.length) || 1;
        }
    }

    /**
     * Update normalization with new data (online)
     */
    updateNormalization(features) {
        if (this.featureMeans === null) {
            this.featureMeans = [...features];
            this.featureStds = new Array(features.length).fill(1);
            return;
        }

        // Simple moving average update
        const alpha = 0.1;
        for (let i = 0; i < features.length; i++) {
            this.featureMeans[i] = (1 - alpha) * this.featureMeans[i] + alpha * features[i];
        }
    }

    /**
     * Normalize features
     */
    normalizeFeatures(features) {
        if (!this.featureMeans || !this.featureStds) return features;
        
        return features.map((f, i) => (f - this.featureMeans[i]) / this.featureStds[i]);
    }

    /**
     * Train with early stopping
     */
    train(trainFeatures, trainTargets, valFeatures, valTargets, epochs = 100) {
        this.isTraining = true;
        this.trainingHistory = [];

        for (let epoch = 0; epoch < epochs; epoch++) {
            // Shuffle training data
            const indices = Array.from({ length: trainFeatures.length }, (_, i) => i);
            for (let i = indices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }

            // Mini-batch training
            let batchLoss = 0;
            for (let i = 0; i < indices.length; i += this.config.batchSize) {
                const batchIndices = indices.slice(i, i + this.config.batchSize);
                const batchFeatures = batchIndices.map(idx => trainFeatures[idx]);
                const batchTargets = batchIndices.map(idx => trainTargets[idx]);
                
                batchLoss += this.trainBatch(batchFeatures, batchTargets);
            }

            // Validation
            const valPredictions = valFeatures.map(f => this.predict(f));
            const valLoss = this.calculateLoss(valPredictions.map(p => [p]), valTargets.map(t => [t]));

            this.trainingHistory.push({
                epoch,
                trainLoss: batchLoss / (indices.length / this.config.batchSize),
                valLoss
            });

            // Early stopping
            if (valLoss < this.bestLoss) {
                this.bestLoss = valLoss;
                this.patienceCounter = 0;
            } else {
                this.patienceCounter++;
                if (this.patienceCounter >= this.patience) {
                    this.isTraining = false;
                    return { stopped: true, epoch, valLoss };
                }
            }
        }

        this.isTraining = false;
        return { stopped: false, epoch: epochs };
    }

    /**
     * Get training history
     */
    getTrainingHistory() {
        return [...this.trainingHistory];
    }

    /**
     * Evaluate model
     */
    evaluate(features, targets) {
        const predictions = features.map(f => this.predict(f));
        
        let mse = 0;
        let mae = 0;
        
        for (let i = 0; i < predictions.length; i++) {
            const error = predictions[i] - targets[i];
            mse += error * error;
            mae += Math.abs(error);
        }

        return {
            mse: mse / predictions.length,
            rmse: Math.sqrt(mse / predictions.length),
            mae: mae / predictions.length,
            predictions
        };
    }

    /**
     * Export model parameters
     */
    export() {
        return {
            config: this.config,
            weights: this.weights,
            biases: this.biases,
            featureMeans: this.featureMeans,
            featureStds: this.featureStds,
            trainingHistory: this.trainingHistory
        };
    }

    /**
     * Import model parameters
     */
    import(data) {
        this.config = data.config;
        this.weights = data.weights;
        this.biases = data.biases;
        this.featureMeans = data.featureMeans;
        this.featureStds = data.featureStds;
        this.trainingHistory = data.trainingHistory || [];
    }
}

/**
 * Feature extractor for fear detection
 */
export class FearFeatureExtractor {
    constructor() {
        this.featureNames = [
            'heartRate',           // BPM
            'hrv',                 // Heart rate variability
            'gsr',                 // Galvanic skin response
            'eyeDilation',         // Pupil dilation
            'blinkRate',           // Blinks per minute
            'headMovement',        // Head velocity magnitude
            'controllerShake',     // Controller vibration
            'gripPressure',        // Controller grip force
            'timeInPanic',         // Duration in panic state
            'proximityToThreat',   // Distance to nearest threat
            'groupProximity',      // Distance to nearest ally
            'recentDeaths'         // Deaths in last minute
        ];
    }

    /**
     * Extract features from player data and apply DE transformation (T13.8)
     */
    extract(playerData) {
        const raw = [
            this.normalize(playerData.heartRate, 60, 120),
            this.normalize(playerData.hrv, 20, 100),
            this.normalize(playerData.gsr, 0, 1),
            this.normalize(playerData.eyeDilation, 2, 8),
            this.normalize(playerData.blinkRate, 10, 40),
            this.normalize(playerData.headMovement, 0, 5),
            this.normalize(playerData.controllerShake, 0, 3),
            this.normalize(playerData.gripPressure, 0, 1),
            this.normalize(playerData.timeInPanic, 0, 60),
            this.normalize(playerData.proximityToThreat, 0, 200, true), // Inverted
            this.normalize(playerData.groupProximity, 0, 200, true), // Inverted
            this.normalize(playerData.recentDeaths, 0, 5)
        ];

        // Phase 13 Nuance: Right Temporal High Gamma Priority
        // We apply a spatial weighting mask (approximated)
        // High Gamma (indices 0, 2, 3 in our proxy) is weighted 1.5x
        const weights = [1.5, 1.0, 1.5, 1.5, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
        const weighted = raw.map((v, i) => v * weights[i]);

        // Apply Differential Entropy transformation (approximate)
        return weighted.map(v => this.applyDETransform(v));
    }

    /**
     * Approximate Differential Entropy (DE) transform (T13.8)
     * h(X) = 0.5 * log(2 * PI * e * sigma^2)
     * Normalized to 0-1 range for NN compatibility.
     */
    applyDETransform(value) {
        // We model sigma^2 as the variance from the normalized mean (0.5)
        const variance = Math.max(0.001, (value - 0.5) ** 2);
        const de = 0.5 * Math.log(2 * Math.PI * Math.E * variance);
        
        // Squash DE result (typically -2 to 2 range) into 0-1
        return 1 / (1 + Math.exp(-de));
    }

    /**
     * Normalize value to 0-1 range
     */
    normalize(value, min, max, invert = false) {
        let normalized = (value - min) / (max - min);
        normalized = Math.max(0, Math.min(1, normalized));
        return invert ? 1 - normalized : normalized;
    }

    /**
     * Get feature names
     */
    getFeatureNames() {
        return [...this.featureNames];
    }
}

/**
 * Main Neural Fear Detection System
 */
export class NeuralFearSystem {
    constructor(config = {}) {
        this.network = new FearNeuralNetwork(config.network);
        this.extractor = new FearFeatureExtractor();
        this.predictionHistory = [];
        this.maxHistory = 100;
        this.isCalibrated = false;
    }

    /**
     * Calibrate with baseline data
     */
    calibrate(baselineData) {
        // Calculate baseline fear level (should be low)
        const baselineFeatures = baselineData.map(d => this.extractor.extract(d));
        
        // Set normalization
        this.network.calculateNormalization(baselineFeatures);
        
        // Train network to predict 0.1 for baseline
        const targets = baselineFeatures.map(() => 0.1);
        this.network.trainBatch(baselineFeatures, targets);
        
        this.isCalibrated = true;
        return { calibrated: true, samples: baselineData.length };
    }

    /**
     * Predict fear level from player data
     */
    predict(playerData) {
        const features = this.extractor.extract(playerData);
        const fearLevel = this.network.predict(features);
        
        this.predictionHistory.push({
            timestamp: Date.now(),
            fearLevel,
            features
        });

        if (this.predictionHistory.length > this.maxHistory) {
            this.predictionHistory.shift();
        }

        return {
            fearLevel,
            confidence: this.calculateConfidence(),
            calibrated: this.isCalibrated
        };
    }

    /**
     * Calculate prediction confidence
     */
    calculateConfidence() {
        if (this.predictionHistory.length < 10) return 0.5;
        
        const recent = this.predictionHistory.slice(-10);
        const variance = this.calculateVariance(recent.map(p => p.fearLevel));
        
        // High variance = low confidence, Low variance = high confidence
        return Math.max(0, Math.min(1, 1 - variance * 2));
    }

    /**
     * Calculate variance
     */
    calculateVariance(values) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    }

    /**
     * Train with labeled data
     */
    train(trainingData, validationData) {
        const trainFeatures = trainingData.map(d => this.extractor.extract(d));
        const trainTargets = trainingData.map(d => d.fearLevel);
        
        const valFeatures = validationData.map(d => this.extractor.extract(d));
        const valTargets = validationData.map(d => d.fearLevel);

        return this.network.train(trainFeatures, trainTargets, valFeatures, valTargets);
    }

    /**
     * Online learning from real-time feedback
     */
    learn(playerData, actualFear) {
        const features = this.extractor.extract(playerData);
        return this.network.trainOnline(features, actualFear);
    }

    /**
     * Get prediction history
     */
    getHistory() {
        return [...this.predictionHistory];
    }

    /**
     * Get system statistics
     */
    getStats() {
        return {
            predictions: this.predictionHistory.length,
            isCalibrated: this.isCalibrated,
            networkConfig: this.network.config,
            trainingHistory: this.network.getTrainingHistory()
        };
    }

    /**
     * Export system state
     */
    export() {
        return {
            network: this.network.export(),
            isCalibrated: this.isCalibrated,
            predictionHistory: this.predictionHistory
        };
    }

    /**
     * Import system state
     */
    import(data) {
        this.network.import(data.network);
        this.isCalibrated = data.isCalibrated;
        this.predictionHistory = data.predictionHistory || [];
    }

    /**
     * Reset system
     */
    reset() {
        this.network = new FearNeuralNetwork(this.network.config);
        this.predictionHistory = [];
        this.isCalibrated = false;
    }
}

// Default export
export default {
    FearNeuralNetwork,
    FearFeatureExtractor,
    NeuralFearSystem
};
