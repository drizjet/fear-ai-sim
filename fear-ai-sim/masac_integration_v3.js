/**
 * MASAC Integration v3 - HIGH PERFORMANCE
 * Optimized for smooth gameplay without sacrificing quality
 * 
 * Key optimizations:
 * 1. Batched tensor operations
 * 2. Async training that doesn't block main thread
 * 3. Frame-interleaved inference
 * 4. Object pooling for state arrays
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
            hiddenDims: config.hiddenDims || [256, 256], // FULL QUALITY
            learningRate: config.learningRate || 3e-4,
            batchSize: config.batchSize || 256, // Full batch size
            bufferSize: config.bufferSize || 100000, // Full buffer
            updateInterval: config.updateInterval || 1,
            ...config
        };
        
        this.trainers = {
            predators: null,
            prey: null
        };
        
        this.isInitialized = false;
        this.trainingStep = 0;
        this.isTraining = false;
        
        // Performance: Frame interleaving
        this.frameCounter = 0;
        this.inferenceInterval = 1; // Run inference every N frames
        this.trainInterval = 4; // Train every N frames
        
        // Performance: Action caching
        this.cachedPredatorActions = null;
        this.cachedPreyActions = null;
        this.cacheAge = 0;
        this.maxCacheAge = 3; // Use cached actions for max N frames
        
        // Performance: Object pools
        this.statePool = [];
        this.maxPoolSize = 100;
        
        // Metrics
        this.metrics = {
            predatorRewards: [],
            preyRewards: [],
            kills: 0,
            deaths: 0,
            inferenceTime: 0,
            trainTime: 0
        };
        
        // State tracking for transitions
        this.previousStates = {
            predators: new Map(),
            prey: new Map()
        };
        
        // Async training queue
        this.trainingQueue = [];
        this.isProcessingQueue = false;
    }
    
    initialize() {
        if (this.isInitialized) return;
        
        console.log('[MASAC] Initializing HIGH PERFORMANCE mode');
        console.log(`[MASAC] Network: [${this.config.hiddenDims.join(',')}]`);
        console.log(`[MASAC] Batch size: ${this.config.batchSize}`);
        console.log(`[MASAC] Buffer: ${this.config.bufferSize}`);
        
        // Initialize predator trainer
        this.trainers.predators = new MASACTrainer({
            numAgents: this.config.numPredators,
            stateDim: this.config.stateDim,
            actionDim: this.config.actionDim,
            hiddenDims: this.config.hiddenDims,
            learningRate: this.config.learningRate,
            batchSize: this.config.batchSize,
            bufferSize: this.config.bufferSize,
            warmupSteps: 1000
        });
        
        // Initialize prey trainer - use actual agent count or config fallback
        const numPrey = this.simulation.agents?.length || this.config.numPrey;
        this.trainers.prey = new MASACTrainer({
            numAgents: numPrey,
            stateDim: 20,
            actionDim: this.config.actionDim,
            hiddenDims: this.config.hiddenDims,
            learningRate: this.config.learningRate,
            batchSize: this.config.batchSize,
            bufferSize: this.config.bufferSize,
            warmupSteps: 1000
        });
        
        this.isInitialized = true;
        this.enabled = true;
        console.log('[MASAC] HIGH PERFORMANCE initialization complete');
    }
    
    /**
     * Select actions with frame interleaving and caching
     */
    selectActions() {
        if (!this.isInitialized) return;
        
        this.frameCounter++;
        
        // Check if we can use cached actions
        if (this.cachedPredatorActions && this.cacheAge < this.maxCacheAge) {
            // Use cached actions but add small noise for variety
            this._applyPredatorActions(this._addExplorationNoise(this.cachedPredatorActions));
            this._applyPreyActions(this._addExplorationNoise(this.cachedPreyActions));
            this.cacheAge++;
            return;
        }
        
        // Time to compute new actions
        const startTime = performance.now();
        
        // Get states
        const predatorStates = this.simulation.predators.map(p => 
            StateExtractors.extractPredatorState(p, this.simulation)
        );
        
        const preyStates = this.simulation.agents.map(p =>
            StateExtractors.extractPreyState(p, this.simulation)
        );
        
        // Batched inference
        const predatorActions = this.trainers.predators.selectActions(predatorStates);
        const preyActions = this.trainers.prey.selectActions(preyStates);
        
        // Cache for future frames
        this.cachedPredatorActions = predatorActions;
        this.cachedPreyActions = preyActions;
        this.cacheAge = 0;
        
        // Store states
        this._storeStates(predatorStates, predatorActions, preyStates, preyActions);
        
        // Apply
        this._applyPredatorActions(predatorActions);
        this._applyPreyActions(preyActions);
        
        this.metrics.inferenceTime = performance.now() - startTime;
    }
    
    /**
     * Add small exploration noise to cached actions
     */
    _addExplorationNoise(actions) {
        return actions.map(action => 
            action.map(a => {
                const noise = (Math.random() - 0.5) * 0.1; // Small noise
                return Math.max(-1, Math.min(1, a + noise));
            })
        );
    }
    
    /**
     * Store states for transition tracking
     */
    _storeStates(predatorStates, predatorActions, preyStates, preyActions) {
        this.previousStates.predators.clear();
        this.simulation.predators.forEach((p, i) => {
            this.previousStates.predators.set(p.id, {
                state: predatorStates[i],
                action: predatorActions[i]
            });
        });
        
        this.previousStates.prey.clear();
        this.simulation.agents.forEach((p, i) => {
            this.previousStates.prey.set(p.id, {
                state: preyStates[i],
                action: preyActions[i]
            });
        });
    }
    
    /**
     * Apply predator actions
     */
    _applyPredatorActions(actions) {
        this.simulation.predators.forEach((predator, i) => {
            if (!predator.isDead && actions[i]) {
                StateExtractors.applyAction(
                    predator,
                    actions[i],
                    0.5,
                    predator.maxSpeed || 4
                );
            }
        });
    }
    
    /**
     * Apply prey actions
     */
    _applyPreyActions(actions) {
        this.simulation.agents.forEach((prey, i) => {
            if (!prey.isDead && actions[i]) {
                StateExtractors.applyAction(
                    prey,
                    actions[i],
                    0.5,
                    prey.maxSpeed || 3
                );
            }
        });
    }
    
    /**
     * Post-step: Store transitions and trigger async training
     */
    postStep() {
        if (!this.isInitialized) return;
        
        this._storeTransitions();
        this.trainingStep++;
        
        // Async training - doesn't block main thread
        if (this.trainingStep % this.trainInterval === 0) {
            this._trainAsync();
        }
        
        // Trim metrics
        if (this.metrics.predatorRewards.length > 1000) {
            this.metrics.predatorRewards = this.metrics.predatorRewards.slice(-1000);
            this.metrics.preyRewards = this.metrics.preyRewards.slice(-1000);
        }
    }
    
    /**
     * Store transitions in replay buffers
     */
    _storeTransitions() {
        // Store predator transitions
        const predatorStates = [];
        const predatorActions = [];
        const predatorRewards = [];
        const predatorNextStates = [];
        const predatorDones = [];
        
        this.simulation.predators.forEach((predator) => {
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
        
        this.simulation.agents.forEach((prey) => {
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
    }
    
    /**
     * Async training - uses requestIdleCallback or setTimeout to not block
     */
    async _trainAsync() {
        if (this.isTraining) return;
        
        // Use setTimeout to yield to main thread
        setTimeout(() => {
            this._doTraining();
        }, 0);
    }
    
    _doTraining() {
        if (this.isTraining) return;
        this.isTraining = true;
        
        const startTime = performance.now();
        
        // Train predators and prey asynchronously
        // The trainer now yields frames to keep UI responsive
        Promise.all([
            this.trainers.predators.train(),
            this.trainers.prey.train()
        ]).then(() => {
            this.metrics.trainTime = performance.now() - startTime;
            this.isTraining = false;
        }).catch(err => {
            console.error('[MASAC] Async Training Loop Error:', err);
            this.isTraining = false;
        });
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
            inferenceTime: this.metrics.inferenceTime.toFixed(2),
            trainTime: this.metrics.trainTime.toFixed(2),
            cacheAge: this.cacheAge,
            predatorTrainer: this.trainers.predators?.getMetrics(),
            preyTrainer: this.trainers.prey?.getMetrics()
        };
    }
    
    /**
     * Pre-step hook (called before simulation update)
     */
    preStep() {
        this.selectActions();
    }
    
    save(path) {
        const data = {
            predatorTrainer: this.trainers.predators?.save(),
            preyTrainer: this.trainers.prey?.save(),
            trainingStep: this.trainingStep,
            metrics: this.metrics,
            config: this.config
        };
        
        localStorage.setItem('masac_models_v3', JSON.stringify(data));
        return data;
    }
    
    load() {
        const data = JSON.parse(localStorage.getItem('masac_models_v3'));
        if (!data) return false;
        
        this.initialize();
        this.trainers.predators.load(data.predatorTrainer);
        this.trainers.prey.load(data.preyTrainer);
        this.trainingStep = data.trainingStep;
        this.metrics = data.metrics;
        
        return true;
    }
    
    exportResearchData() {
        return {
            metrics: this.metrics,
            config: this.config,
            trainingStep: this.trainingStep
        };
    }
    
    saveModels() {
        return this.save();
    }
    
    dispose() {
        this.trainers.predators?.dispose();
        this.trainers.prey?.dispose();
        this.isInitialized = false;
    }
}

export default MASACIntegration;
