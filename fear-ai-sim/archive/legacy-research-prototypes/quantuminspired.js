/**
 * Quantum-Inspired Algorithms for Fear-AI - T4.4
 * 
 * Implements quantum-inspired computational methods:
 * - Quantum annealing for scenario optimization
 * - Quantum-inspired neural networks (QINN)
 * - Quantum probability for fear state superposition
 * - Grover-inspired search for threat detection
 * 
 * Note: These are classical algorithms inspired by quantum mechanics,
 * not actual quantum computing (which requires quantum hardware).
 */

/**
 * Quantum State representation using complex amplitudes
 * Used for modeling fear as a superposition of states
 */
export class QuantumState {
    constructor(dimensions = 4) {
        this.dimensions = dimensions;
        // Initialize amplitudes as complex numbers (a + bi)
        this.amplitudes = new Array(dimensions).fill(null).map(() => ({
            real: Math.random() - 0.5,
            imag: Math.random() - 0.5
        }));
        this.normalize();
    }

    /**
     * Normalize the quantum state (sum of |amplitude|^2 = 1)
     */
    normalize() {
        let sumSquared = 0;
        for (const amp of this.amplitudes) {
            sumSquared += amp.real * amp.real + amp.imag * amp.imag;
        }
        
        const norm = Math.sqrt(sumSquared);
        if (norm > 0) {
            for (const amp of this.amplitudes) {
                amp.real /= norm;
                amp.imag /= norm;
            }
        }
    }

    /**
     * Measure the state (collapse superposition to single outcome)
     */
    measure() {
        // Calculate probabilities for each state
        const probabilities = this.amplitudes.map(amp => 
            amp.real * amp.real + amp.imag * amp.imag
        );

        // Random selection based on probability amplitudes
        let random = Math.random();
        let cumulative = 0;
        
        for (let i = 0; i < probabilities.length; i++) {
            cumulative += probabilities[i];
            if (random <= cumulative) {
                return {
                    state: i,
                    probability: probabilities[i],
                    collapsed: true
                };
            }
        }

        return { state: this.dimensions - 1, probability: probabilities[this.dimensions - 1], collapsed: true };
    }

    /**
     * Get probability distribution (Born rule)
     */
    getProbabilities() {
        return this.amplitudes.map(amp => 
            amp.real * amp.real + amp.imag * amp.imag
        );
    }

    /**
     * Apply quantum gate (unitary transformation)
     */
    applyGate(gate) {
        const newAmplitudes = [];
        
        for (let i = 0; i < this.dimensions; i++) {
            let real = 0;
            let imag = 0;
            
            for (let j = 0; j < this.dimensions; j++) {
                const g = gate[i][j];
                const a = this.amplitudes[j];
                // Complex multiplication: (g.r + g.i) * (a.r + a.i)
                real += g.real * a.real - g.imag * a.imag;
                imag += g.real * a.imag + g.imag * a.real;
            }
            
            newAmplitudes.push({ real, imag });
        }
        
        this.amplitudes = newAmplitudes;
        this.normalize();
    }

    /**
     * Quantum interference between states
     */
    interfere(other, phase = 0) {
        const result = new QuantumState(this.dimensions);
        
        for (let i = 0; i < this.dimensions; i++) {
            const a = this.amplitudes[i];
            const b = other.amplitudes[i];
            
            // Apply phase shift and add
            const phaseFactor = Math.exp(phase * Math.PI * 2);
            
            result.amplitudes[i] = {
                real: a.real + b.real * Math.cos(phaseFactor) - b.imag * Math.sin(phaseFactor),
                imag: a.imag + b.real * Math.sin(phaseFactor) + b.imag * Math.cos(phaseFactor)
            };
        }
        
        result.normalize();
        return result;
    }

    /**
     * Calculate expectation value of an observable
     */
    expectation(observable) {
        let expectation = 0;
        
        for (let i = 0; i < this.dimensions; i++) {
            for (let j = 0; j < this.dimensions; j++) {
                const a_i = this.amplitudes[i];
                const a_j = this.amplitudes[j];
                const o = observable[i][j];
                
                // <psi|O|psi>
                const contribution = 
                    (a_i.real - a_i.imag) * (o.real * a_j.real - o.imag * a_j.imag) +
                    (a_i.real + a_i.imag) * (o.real * a_j.imag + o.imag * a_j.real);
                
                expectation += contribution;
            }
        }
        
        return expectation;
    }
}

/**
 * Quantum Annealing for fear scenario optimization
 * Finds optimal threat placement for desired fear levels
 */
export class QuantumAnnealingOptimizer {
    constructor(config = {}) {
        this.config = {
            initialTemp: config.initialTemp || 100,
            coolingRate: config.coolingRate || 0.995,
            iterations: config.iterations || 1000,
            targetFear: config.targetFear || 0.5,
            ...config
        };
    }

    /**
     * Cost function - lower is better
     */
    calculateCost(currentFear, scenario) {
        // Energy based on distance from target fear
        const fearError = Math.abs(currentFear - this.config.targetFear);
        
        // Penalize unsafe scenarios (too many agents dying)
        const safetyPenalty = scenario.deathRate > 0.3 ? 10 : 0;
        
        // Reward variety in agent states
        const varietyBonus = scenario.stateVariance * 0.1;
        
        return fearError + safetyPenalty - varietyBonus;
    }

    /**
     * Generate neighbor state (quantum tunneling inspired)
     */
    getNeighbor(current) {
        // Quantum tunneling allows "jumping" to distant states
        const tunnelProbability = 0.1;
        
        if (Math.random() < tunnelProbability) {
            // Large jump (tunneling)
            return this.randomScenario();
        } else {
            // Small perturbation (thermal fluctuation)
            const neighbor = { ...current };
            neighbor.threatCount += Math.floor((Math.random() - 0.5) * 3);
            neighbor.threatCount = Math.max(1, Math.min(10, neighbor.threatCount));
            neighbor.threatDistance *= (1 + (Math.random() - 0.5) * 0.2);
            return neighbor;
        }
    }

    /**
     * Random scenario generation
     */
    randomScenario() {
        return {
            threatCount: Math.floor(Math.random() * 10) + 1,
            threatDistance: 50 + Math.random() * 200,
            spawnRate: Math.random() * 0.1,
            aggressionLevel: Math.random()
        };
    }

    /**
     * Run quantum-inspired annealing
     */
    optimize(currentState, simulator) {
        let best = { ...currentState };
        let current = { ...currentState };
        let bestCost = this.calculateCost(simulator.getCurrentFear(), current);
        
        let temperature = this.config.initialTemp;
        
        for (let i = 0; i < this.config.iterations; i++) {
            const neighbor = this.getNeighbor(current);
            const neighborCost = this.calculateCost(
                simulator.simulateFear(neighbor), 
                neighbor
            );
            
            const deltaCost = neighborCost - bestCost;
            
            // Quantum annealing acceptance probability
            // Allows accepting worse states based on temperature
            const acceptanceProb = deltaCost < 0 ? 
                1 : 
                Math.exp(-deltaCost / temperature);
            
            if (Math.random() < acceptanceProb) {
                current = neighbor;
                
                if (neighborCost < bestCost) {
                    best = neighbor;
                    bestCost = neighborCost;
                }
            }
            
            // Cool down
            temperature *= this.config.coolingRate;
        }
        
        return {
            optimal: best,
            cost: bestCost,
            iterations: this.config.iterations,
            finalTemp: temperature
        };
    }
}

/**
 * Quantum-inspired Neural Network (QINN)
 * Uses quantum-inspired activation and superposition of weights
 */
export class QuantumInspiredNN {
    constructor(inputSize, hiddenSize, outputSize) {
        this.inputSize = inputSize;
        this.hiddenSize = hiddenSize;
        this.outputSize = outputSize;
        
        // Initialize weights as quantum superposition
        this.weights1 = this.quantumInitialize(inputSize, hiddenSize);
        this.weights2 = this.quantumInitialize(hiddenSize, outputSize);
        
        // Quantum bias terms
        this.bias1 = new Array(hiddenSize).fill(0).map(() => this.quantumRandom());
        this.bias2 = new Array(outputSize).fill(0).map(() => this.quantumRandom());
    }

    /**
     * Initialize weights with quantum-inspired randomness
     */
    quantumInitialize(rows, cols) {
        const weights = [];
        for (let i = 0; i < rows; i++) {
            const row = [];
            for (let j = 0; j < cols; j++) {
                // Quantum superposition of multiple weight states
                const state1 = (Math.random() - 0.5) * 2;
                const state2 = (Math.random() - 0.5) * 2;
                // Interference pattern
                row.push((state1 + state2) / Math.sqrt(2));
            }
            weights.push(row);
        }
        return weights;
    }

    /**
     * Quantum random number generator (pseudo-random with quantum-inspired distribution)
     */
    quantumRandom() {
        // Simulate quantum measurement uncertainty
        const u1 = Math.random();
        const u2 = Math.random();
        // Box-Muller transform for normal distribution
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return z * 0.1; // Scale down
    }

    /**
     * Quantum-inspired activation function
     */
    quantumActivation(x) {
        // Sigmoid with quantum phase shift
        const phase = Math.PI * 0.1; // Small quantum phase
        const shifted = x * Math.cos(phase);
        return 1 / (1 + Math.exp(-shifted));
    }

    /**
     * Forward pass with quantum superposition
     */
    forward(input) {
        // Hidden layer with quantum activation
        const hidden = [];
        for (let i = 0; i < this.hiddenSize; i++) {
            let sum = this.bias1[i];
            for (let j = 0; j < this.inputSize; j++) {
                sum += input[j] * this.weights1[j][i];
            }
            hidden.push(this.quantumActivation(sum));
        }

        // Output layer
        const output = [];
        for (let i = 0; i < this.outputSize; i++) {
            let sum = this.bias2[i];
            for (let j = 0; j < this.hiddenSize; j++) {
                sum += hidden[j] * this.weights2[j][i];
            }
            output.push(this.quantumActivation(sum));
        }

        return output;
    }

    /**
     * Predict fear level from features
     */
    predictFear(features) {
        const output = this.forward(features);
        return output[0]; // Fear level prediction
    }

    /**
     * Train with quantum-inspired backpropagation
     */
    train(input, target, learningRate = 0.01) {
        // Forward pass
        const hidden = [];
        for (let i = 0; i < this.hiddenSize; i++) {
            let sum = this.bias1[i];
            for (let j = 0; j < this.inputSize; j++) {
                sum += input[j] * this.weights1[j][i];
            }
            hidden.push(this.quantumActivation(sum));
        }

        const output = [];
        for (let i = 0; i < this.outputSize; i++) {
            let sum = this.bias2[i];
            for (let j = 0; j < this.hiddenSize; j++) {
                sum += hidden[j] * this.weights2[j][i];
            }
            output.push(this.quantumActivation(sum));
        }

        // Backpropagation with quantum noise (for exploration)
        const outputError = target - output[0];
        const quantumNoise = () => (Math.random() - 0.5) * 0.01;

        // Update output weights
        for (let i = 0; i < this.hiddenSize; i++) {
            this.weights2[i][0] += learningRate * outputError * hidden[i] + quantumNoise();
        }
        this.bias2[0] += learningRate * outputError + quantumNoise();

        // Update hidden weights
        for (let i = 0; i < this.inputSize; i++) {
            for (let j = 0; j < this.hiddenSize; j++) {
                const hiddenError = outputError * this.weights2[j][0] * hidden[j] * (1 - hidden[j]);
                this.weights1[i][j] += learningRate * hiddenError * input[i] + quantumNoise();
            }
        }

        return Math.abs(outputError);
    }
}

/**
 * Grover-inspired search algorithm for threat detection
 * Amplifies probability of finding threats in game state
 */
export class GroverThreatSearch {
    constructor() {
        this.iterations = 0;
    }

    /**
     * Search for threats using Grover-inspired amplification
     */
    search(gameState, threatPredicate) {
        const threats = [];
        const candidates = gameState.potentialThreats || [];
        
        if (candidates.length === 0) return threats;

        // Initialize uniform superposition
        const n = candidates.length;
        const amplitudes = new Array(n).fill(1 / Math.sqrt(n));
        
        // Optimal number of iterations: ~π/4 * √N
        const optimalIterations = Math.floor(Math.PI / 4 * Math.sqrt(n));
        
        for (let iter = 0; iter < optimalIterations; iter++) {
            // Oracle: mark threats (phase inversion)
            for (let i = 0; i < n; i++) {
                if (threatPredicate(candidates[i])) {
                    amplitudes[i] = -amplitudes[i]; // Phase flip
                }
            }
            
            // Diffusion operator (inversion about mean)
            const mean = amplitudes.reduce((a, b) => a + b, 0) / n;
            for (let i = 0; i < n; i++) {
                amplitudes[i] = 2 * mean - amplitudes[i];
            }
        }
        
        // Measure (select high probability candidates)
        const probabilities = amplitudes.map(a => a * a);
        const threshold = 1 / n; // Average probability
        
        for (let i = 0; i < n; i++) {
            if (probabilities[i] > threshold * 2) {
                threats.push({
                    threat: candidates[i],
                    confidence: probabilities[i],
                    found: true
                });
            }
        }
        
        this.iterations = optimalIterations;
        return threats;
    }

    /**
     * Get search statistics
     */
    getStats() {
        return {
            iterations: this.iterations,
            speedup: 'O(√N) vs O(N) classical'
        };
    }
}

/**
 * Quantum Decision Maker - Uses superposition for decision making
 */
export class QuantumDecisionMaker {
    constructor(options) {
        this.options = options;
        this.dimensions = options.length;
        this.state = new QuantumState(this.dimensions);
    }

    /**
     * Update decision state based on new information
     */
    update(observation) {
        // Create rotation gate based on observation
        const gate = [];
        for (let i = 0; i < this.dimensions; i++) {
            const row = [];
            for (let j = 0; j < this.dimensions; j++) {
                if (i === j) {
                    // Rotation based on observation favorability
                    const angle = observation[i] * Math.PI / 2;
                    row.push({ real: Math.cos(angle), imag: 0 });
                } else if (i === j + 1 || (i === 0 && j === this.dimensions - 1)) {
                    // Small coupling between adjacent options
                    row.push({ real: 0, imag: 0.1 });
                } else {
                    row.push({ real: 0, imag: 0 });
                }
            }
            gate.push(row);
        }
        
        this.state.applyGate(gate);
    }

    /**
     * Make decision by measuring quantum state
     */
    decide() {
        const measurement = this.state.measure();
        return {
            choice: this.options[measurement.state],
            probability: measurement.probability,
            quantum: true
        };
    }

    /**
     * Get decision probabilities
     */
    getProbabilities() {
        return this.state.getProbabilities().map((p, i) => ({
            option: this.options[i],
            probability: p
        }));
    }
}

/**
 * Main Quantum-Inspired System for Fear-AI
 */
export class QuantumInspiredSystem {
    constructor(config = {}) {
        this.config = {
            nnInputSize: config.nnInputSize || 10,
            nnHiddenSize: config.nnHiddenSize || 20,
            nnOutputSize: config.nnOutputSize || 1,
            ...config
        };

        this.fearPredictor = new QuantumInspiredNN(
            this.config.nnInputSize,
            this.config.nnHiddenSize,
            this.config.nnOutputSize
        );
        
        this.optimizer = new QuantumAnnealingOptimizer(config.annealing);
        this.threatSearch = new GroverThreatSearch();
        this.decisionMakers = new Map();
        
        this.stats = {
            predictions: 0,
            optimizations: 0,
            searches: 0
        };
    }

    /**
     * Predict fear level using QINN
     */
    predictFear(features) {
        this.stats.predictions++;
        return this.fearPredictor.predictFear(features);
    }

    /**
     * Train fear predictor
     */
    trainFearPredictor(features, target) {
        return this.fearPredictor.train(features, target);
    }

    /**
     * Optimize scenario using quantum annealing
     */
    optimizeScenario(currentState, simulator) {
        this.stats.optimizations++;
        return this.optimizer.optimize(currentState, simulator);
    }

    /**
     * Search for threats using Grover algorithm
     */
    searchThreats(gameState, threatPredicate) {
        this.stats.searches++;
        return this.threatSearch.search(gameState, threatPredicate);
    }

    /**
     * Create quantum decision maker for an agent
     */
    createDecisionMaker(agentId, options) {
        const dm = new QuantumDecisionMaker(options);
        this.decisionMakers.set(agentId, dm);
        return dm;
    }

    /**
     * Get quantum decision maker
     */
    getDecisionMaker(agentId) {
        return this.decisionMakers.get(agentId);
    }

    /**
     * Create quantum state for fear modeling
     */
    createFearState() {
        // 4 states: calm, alert, anxious, panic
        return new QuantumState(4);
    }

    /**
     * Calculate fear state probabilities
     */
    calculateFearProbabilities(quantumState) {
        const probs = quantumState.getProbabilities();
        return {
            calm: probs[0],
            alert: probs[1],
            anxious: probs[2],
            panic: probs[3]
        };
    }

    /**
     * Get system statistics
     */
    getStats() {
        return {
            ...this.stats,
            decisionMakers: this.decisionMakers.size,
            searchStats: this.threatSearch.getStats()
        };
    }

    /**
     * Reset system
     */
    reset() {
        this.fearPredictor = new QuantumInspiredNN(
            this.config.nnInputSize,
            this.config.nnHiddenSize,
            this.config.nnOutputSize
        );
        this.optimizer = new QuantumAnnealingOptimizer(this.config.annealing);
        this.threatSearch = new GroverThreatSearch();
        this.decisionMakers.clear();
        this.stats = {
            predictions: 0,
            optimizations: 0,
            searches: 0
        };
    }
}

// Default export
export default {
    QuantumState,
    QuantumAnnealingOptimizer,
    QuantumInspiredNN,
    GroverThreatSearch,
    QuantumDecisionMaker,
    QuantumInspiredSystem
};
