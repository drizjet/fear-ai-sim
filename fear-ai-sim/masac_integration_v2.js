/**
 * MASAC Integration v2
 * Full neural network-based MASAC integration with the simulation
 */
import { MASACTrainer } from './masac_trainer.js';
import * as StateExtractors from './state_extractors.js';

export class MASACIntegration {
    constructor(simulation, config = {}) {
        this.simulation = simulation;
        this.config = {
            numPredators: config.numPredators || 4,
            numPrey: config.numPrey || 8,
            stateDim: config.stateDim || 16,
            actionDim: config.actionDim || 2,
            hiddenDims: config.hiddenDims || [64, 64], // CPU-optimized - smaller networks
            learningRate: config.learningRate || 3e-4,
            batchSize: config.batchSize || 16, // Smaller for CPU
            bufferSize: config.bufferSize || 5000, // Reduced memory
            updateInterval: config.updateInterval || 4, // Train every 4th step
            ...config
        };
        
        this.frameCounter = 0;
        this.skipFrames = config.skipFrames || 2; // Skip every N frames for performance
        
        this.trainers = {
            predators: null,
            prey: null
        };
        
        this.isInitialized = false;
        this.trainingStep = 0;
        
        // Metrics
        this.metrics = {
            predatorRewards: [],
            preyRewards: [],
            kills: 0,
            deaths: 0,
            avgPredatorLoss: 0,
            avgPreyLoss: 0
        };
        
        // State tracking for transitions
        this.previousStates = {
            predators: new Map(),
            prey: new Map()
        };
    }
    
    /**
     * Initialize MASAC trainers
     */
    initialize() {
        if (this.isInitialized) return;
        
        // Initialize predator trainer
        this.trainers.predators = new MASACTrainer({
            numAgents: this.config.numPredators,
            stateDim: this.config.stateDim,
            actionDim: this.config.actionDim,
            hiddenDims: this.config.hiddenDims,
            learningRate: this.config.learningRate,
            batchSize: this.config.batchSize,
            bufferSize: this.config.bufferSize,
            warmupSteps: 500
        });
        
        // Initialize prey trainer (prey have larger state for fear)
        this.trainers.prey = new MASACTrainer({
            numAgents: this.config.numPrey,
            stateDim: 20, // Prey state dimension
            actionDim: this.config.actionDim,
            hiddenDims: this.config.hiddenDims,
            learningRate: this.config.learningRate,
            batchSize: this.config.batchSize,
            bufferSize: this.config.bufferSize,
            warmupSteps: 500
        });
        
        this.isInitialized = true;
        console.log('MASAC Integration initialized');
        console.log('- Predators:', this.config.numPredators);
        console.log('- Prey:', this.config.numPrey);
    }
    
    /**
     * Select actions for all agents
     */
    selectActions() {
        if (!this.isInitialized) return;
        
        this.frameCounter++;
        
        // Frame skipping for CPU performance - reuse previous actions
        if (this.frameCounter % this.skipFrames !== 0) {
            // Apply previous actions again if available
            if (this.previousStates.predators.size > 0) {
                const predatorActions = Array.from(this.previousStates.predators.values()).map(v => v.action);
                const preyActions = Array.from(this.previousStates.prey.values()).map(v => v.action);
                this._applyPredatorActions(predatorActions);
                this._applyPreyActions(preyActions);
            }
            return;
        }
        
        // Get current states
        const predatorStates = this.simulation.predators.map(p =>
            StateExtractors.extractPredatorState(p, this.simulation)
        );

        const preyStates = this.simulation.prey.map(p =>
            StateExtractors.extractPreyState(p, this.simulation)
        );

        // Select actions
        const predatorActions = this.trainers.predators.selectActions(predatorStates);
        const preyActions = this.trainers.prey.selectActions(preyStates);
        
        // Store states for transition
        this.previousStates.predators.clear();
        this.simulation.predators.forEach((p, i) => {
            this.previousStates.predators.set(p.id, {
                state: predatorStates[i],
                action: predatorActions[i]
            });
        });
        
        this.previousStates.prey.clear();
        this.simulation.prey.forEach((p, i) => {
            this.previousStates.prey.set(p.id, {
                state: preyStates[i],
                action: preyActions[i]
            });
        });
        
        // Apply actions
        this._applyPredatorActions(predatorActions);
        this._applyPreyActions(preyActions);
    }
    
    /**
     * Apply predator actions
     */
    _applyPredatorActions(actions) {
        this.simulation.predators.forEach((predator, i) => {
            if (!predator.isDead) {
                StateExtractors.applyAction(
                    predator,
                    actions[i],
                    0.5,  // maxAcceleration
                    predator.maxSpeed || 4
                );
            }
        });
    }
    
    /**
     * Apply prey actions
     */
    _applyPreyActions(actions) {
        this.simulation.prey.forEach((prey, i) => {
            if (!prey.isDead) {
                StateExtractors.applyAction(
                    prey,
                    actions[i],
                    0.5,  // maxAcceleration
                    prey.maxSpeed || 3
                );
            }
        });
    }
    
    /**
     * Store transitions and train after simulation step
     */
    postStep() {
        if (!this.isInitialized) return;
        
        // Store predator transitions
        const predatorStates = [];
        const predatorActions = [];
        const predatorRewards = [];
        const predatorNextStates = [];
        const predatorDones = [];
        
        this.simulation.predators.forEach((predator, i) => {
            if (this.previousStates.predators.has(predator.id)) {
                const prev = this.previousStates.predators.get(predator.id);
                const reward = StateExtractors.computePredatorReward(predator, this.simulation);
                const nextState = StateExtractors.extractPredatorState(predator, this.simulation);
                
                predatorStates.push(prev.state);
                predatorActions.push(prev.action);
                predatorRewards.push(reward);
                predatorNextStates.push(nextState);
                predatorDones.push(predator.isDead || false);
            }
        });
        
        if (predatorStates.length > 0) {
            const globalState = StateExtractors.createGlobalState(predatorStates);
            const nextGlobalState = StateExtractors.createGlobalState(predatorNextStates);
            
            this.trainers.predators.store(
                predatorStates,
                predatorActions,
                predatorRewards,
                predatorNextStates,
                predatorDones,
                globalState,
                nextGlobalState
            );
            
            this.metrics.predatorRewards.push(...predatorRewards);
        }
        
        // Store prey transitions
        const preyStates = [];
        const preyActions = [];
        const preyRewards = [];
        const preyNextStates = [];
        const preyDones = [];
        
        this.simulation.prey.forEach((prey, i) => {
            if (this.previousStates.prey.has(prey.id)) {
                const prev = this.previousStates.prey.get(prey.id);
                const reward = StateExtractors.computePreyReward(prey, this.simulation);
                const nextState = StateExtractors.extractPreyState(prey, this.simulation);
                
                preyStates.push(prev.state);
                preyActions.push(prev.action);
                preyRewards.push(reward);
                preyNextStates.push(nextState);
                preyDones.push(prey.isDead || false);
            }
        });
        
        if (preyStates.length > 0) {
            const globalState = StateExtractors.createGlobalState(preyStates);
            const nextGlobalState = StateExtractors.createGlobalState(preyNextStates);
            
            this.trainers.prey.store(
                preyStates,
                preyActions,
                preyRewards,
                preyNextStates,
                preyDones,
                globalState,
                nextGlobalState
            );
            
            this.metrics.preyRewards.push(...preyRewards);
        }
        
        this.trainingStep++;
        
        // Trim metrics
        if (this.metrics.predatorRewards.length > 1000) {
            this.metrics.predatorRewards = this.metrics.predatorRewards.slice(-1000);
        }
        if (this.metrics.preyRewards.length > 1000) {
            this.metrics.preyRewards = this.metrics.preyRewards.slice(-1000);
        }
    }
    
    /**
     * Get current metrics
     */
    getMetrics() {
        const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
        
        return {
            trainingStep: this.trainingStep,
            avgPredatorReward: avg(this.metrics.predatorRewards.slice(-100)),
            avgPreyReward: avg(this.metrics.preyRewards.slice(-100)),
            predatorTrainer: this.trainers.predators?.getMetrics(),
            preyTrainer: this.trainers.prey?.getMetrics()
        };
    }
    
    /**
     * Save models
     */
    save(path) {
        const data = {
            predatorTrainer: this.trainers.predators?.save(),
            preyTrainer: this.trainers.prey?.save(),
            trainingStep: this.trainingStep,
            metrics: this.metrics,
            config: this.config
        };
        
        localStorage.setItem('masac_models', JSON.stringify(data));
        console.log('MASAC models saved');
        return data;
    }
    
    /**
     * Load models
     */
    load() {
        const data = JSON.parse(localStorage.getItem('masac_models'));
        if (!data) {
            console.warn('No saved MASAC models found');
            return false;
        }
        
        this.initialize();
        this.trainers.predators.load(data.predatorTrainer);
        this.trainers.prey.load(data.preyTrainer);
        this.trainingStep = data.trainingStep;
        this.metrics = data.metrics;
        
        console.log('MASAC models loaded');
        return true;
    }
    
    /**
     * Handle new agent spawning
     */
    onAgentSpawn(agent, type) {
        // New agents automatically use the shared policy
        // Their experiences will be added to the replay buffer
        console.log(`New ${type} spawned: ${agent.id}`);
    }
    
    /**
     * Handle agent death
     */
    onAgentDeath(agent, type) {
        // Death is handled via done flags in the replay buffer
        console.log(`${type} died: ${agent.id}`);
    }
    
    /**
     * Dispose all resources
     */
    dispose() {
        this.trainers.predators?.dispose();
        this.trainers.prey?.dispose();
        this.isInitialized = false;
    }
}

export default MASACIntegration;
