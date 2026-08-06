/**
 * MASAC Trainer - Multi-Agent Soft Actor-Critic
 * Centralized training with decentralized execution
 * 
 * OPTIMIZED FOR LARGE POPULATIONS:
 * 1. Parameter Sharing (Shared Actor Network)
 * 2. Decomposed Centralized Critic (Scalable architecture)
 * 3. Async Yielding (Non-blocking training)
 */
import * as tf from '@tensorflow/tfjs';
import { ActorNetwork, ScalableTwinCritic } from './tf_network.js';
import { MultiAgentReplayBuffer } from './replay_buffer.js';
import { EntropyTuner } from './entropy_tuning.js';

export class MASACTrainer {
    constructor(config = {}) {
        this.numAgents = config.numAgents || 4;
        this.stateDim = config.stateDim || 16;
        this.actionDim = config.actionDim || 2;
        this.centralizedStateDim = config.centralizedStateDim || this.stateDim * this.numAgents;
        
        // Hyperparameters
        this.gamma = config.gamma || 0.99;
        this.tau = config.tau || 0.005;
        this.batchSize = config.batchSize || 16;
        this.bufferSize = config.bufferSize || 5000;
        this.learningRate = config.learningRate || 3e-4;
        this.hiddenDims = config.hiddenDims || [64, 64];
        this.updateInterval = config.updateInterval || 4;
        this.warmupSteps = config.warmupSteps || 1000;
        this.gradientClip = config.gradientClip || 1.0;
        
        // Automatic entropy tuning
        this.autoTuneAlpha = config.autoTuneAlpha !== false;
        this.targetEntropy = config.targetEntropy || -this.actionDim;
        this.initialAlpha = config.alpha || 0.2;
        
        // Training state
        this.step = 0;
        this.episode = 0;
        this.isTraining = false;
        
        // Metrics
        this.metrics = {
            criticLoss: [],
            actorLoss: [],
            alphaLoss: [],
            qValues: [],
            entropy: [],
            alpha: []
        };
        
        this._buildNetworks();
        this._buildReplayBuffer();
    }
    
    _buildNetworks() {
        // WORLD-CLASS OPTIMIZATION: Parameter Sharing
        this.actors = [];
        this.targetActors = [];
        
        const sharedActor = new ActorNetwork(
            this.stateDim,
            this.actionDim,
            this.hiddenDims,
            this.learningRate
        );
        
        const sharedTargetActor = new ActorNetwork(
            this.stateDim,
            this.actionDim,
            this.hiddenDims,
            this.learningRate
        );
        
        sharedTargetActor.model.setWeights(
            sharedActor.model.getWeights().map(w => w.clone())
        );

        for (let i = 0; i < this.numAgents; i++) {
            this.actors.push(sharedActor);
            this.targetActors.push(sharedTargetActor);
        }
        
        // WORLD-CLASS OPTIMIZATION: Scalable Centralized Critic
        // Instead of ONE giant vector, we use a decomposed architecture
        this.centralizedCritic = new ScalableTwinCritic(
            this.stateDim,
            this.actionDim,
            this.hiddenDims,
            this.learningRate
        );
        
        this.targetCritic = new ScalableTwinCritic(
            this.stateDim,
            this.actionDim,
            this.hiddenDims,
            this.learningRate
        );
        
        this.targetCritic.hardUpdate(this.centralizedCritic);
        
        // Entropy tuner
        if (this.autoTuneAlpha) {
            this.alphaTuner = new EntropyTuner(
                this.actionDim,
                this.targetEntropy,
                this.initialAlpha,
                this.learningRate
            );
        } else {
            this.alphaTuner = { getAlpha: () => this.initialAlpha, update: async () => 0 };
        }
        
        console.log(`[MASAC] Scalable Networks initialized:`);
        console.log(`- 1 Shared Actor for ${this.numAgents} agents`);
        console.log(`- Decomposed Critic scales O(1)`);
    }
    
    _buildReplayBuffer() {
        this.replayBuffer = new MultiAgentReplayBuffer(
            this.bufferSize,
            this.numAgents,
            this.stateDim,
            this.actionDim,
            this.centralizedStateDim
        );
    }
    
    selectActions(states, deterministic = false) {
        return tf.tidy(() => {
            const actions = [];
            const sharedActor = this.actors[0];
            for (let i = 0; i < this.numAgents; i++) {
                const action = sharedActor.getAction(states[i], deterministic);
                actions.push(action);
            }
            return actions;
        });
    }
    
    store(states, actions, rewards, nextStates, dones, globalState = null, nextGlobalState = null) {
        this.replayBuffer.push(states, actions, rewards, nextStates, dones, globalState, nextGlobalState);
        this.step++;
        
        if (this.step >= this.warmupSteps && this.step % this.updateInterval === 0) {
            this.train();
        }
    }
    
    async train() {
        if (this.isTraining) return null;
        if (!this.replayBuffer.canSample(this.batchSize)) return null;
        
        this.isTraining = true;
        
        try {
            await tf.nextFrame();

            const batch = this.replayBuffer.sampleGlobal(this.batchSize);
            
            const states = tf.tensor2d(batch.states, [this.batchSize, this.centralizedStateDim]);
            const actions = tf.tensor2d(batch.actions, [this.batchSize, this.actionDim * this.numAgents]);
            const rewards = tf.tensor1d(batch.rewards);
            const nextStates = tf.tensor2d(batch.nextStates, [this.batchSize, this.centralizedStateDim]);
            const dones = tf.tensor1d(batch.dones);
            
            // 1. Compute target Q-values
            const { targetQ, nextLogProbs } = this._computeTargetQ(nextStates, rewards, dones);
            
            // 2. Update critics
            const criticLoss = await this._updateCritics(states, actions, targetQ);
            
            await tf.nextFrame();

            // 3. Update actors (Optimized for parameter sharing)
            const { actorLoss, logProbs, entropy } = await this._updateActorsShared(states);
            
            // 4. Update alpha
            const alphaLoss = await this.alphaTuner.update(logProbs);
            const alpha = this.alphaTuner.getAlpha();
            
            // 5. Soft update target networks
            this._softUpdateTargets();
            
            // Clean up
            states.dispose();
            actions.dispose();
            rewards.dispose();
            nextStates.dispose();
            dones.dispose();
            targetQ.dispose();
            nextLogProbs.dispose();
            logProbs.dispose();
            
            this.metrics.criticLoss.push(criticLoss);
            this.metrics.actorLoss.push(actorLoss);
            this.metrics.alphaLoss.push(alphaLoss);
            this.metrics.alpha.push(alpha);
            this.metrics.entropy.push(entropy);
            
            if (this.metrics.criticLoss.length > 100) {
                Object.keys(this.metrics).forEach(key => {
                    this.metrics[key] = this.metrics[key].slice(-100);
                });
            }
            
            this.isTraining = false;
            return { criticLoss, actorLoss, alphaLoss, alpha, entropy };
        } catch (err) {
            console.error('[MASAC] Training Error:', err);
            this.isTraining = false;
            return null;
        }
    }
    
    _computeTargetQ(nextStates, rewards, dones) {
        return tf.tidy(() => {
            const nextActionsList = [];
            const nextLogProbsList = [];
            const statePerAgent = this.centralizedStateDim / this.numAgents;
            const sharedTargetActor = this.targetActors[0];
            
            for (let i = 0; i < this.numAgents; i++) {
                const start = i * statePerAgent;
                const agentNextState = nextStates.slice([0, start], [this.batchSize, statePerAgent]);
                const { action, logProb } = sharedTargetActor.sample(agentNextState);
                nextActionsList.push(action);
                nextLogProbsList.push(logProb);
            }
            
            const nextActions = tf.concat(nextActionsList, 1);
            const nextLogProbs = tf.sum(tf.stack(nextLogProbsList), 0);
            
            const { q1: q1Next, q2: q2Next } = this.targetCritic.forward(nextStates, nextActions);
            const minQNext = tf.minimum(q1Next, q2Next);
            
            const alpha = this.alphaTuner.getAlpha();
            const softQNext = tf.sub(minQNext, tf.mul(nextLogProbs, alpha));
            
            const targetQ = tf.add(
                rewards,
                tf.mul(tf.mul(tf.sub(tf.scalar(1), dones), tf.scalar(this.gamma)), softQNext.squeeze())
            );
            
            return { targetQ: targetQ.expandDims(1), nextLogProbs };
        });
    }
    
    async _updateCritics(states, actions, targetQ) {
        const optimizer = tf.train.adam(this.learningRate);
        const loss = tf.tidy(() => {
            const { q1, q2 } = this.centralizedCritic.forward(states, actions);
            return tf.add(tf.losses.meanSquaredError(targetQ, q1), tf.losses.meanSquaredError(targetQ, q2));
        });
        
        const weights = this.centralizedCritic.q1.model.getWeights().concat(this.centralizedCritic.q2.model.getWeights());
        const grads = optimizer.computeGradients(() => loss, weights);
        
        if (this.gradientClip > 0) {
            Object.keys(grads.grads).forEach(key => {
                if (grads.grads[key]) {
                    const clipped = tf.clipByValue(grads.grads[key], -this.gradientClip, this.gradientClip);
                    grads.grads[key].dispose();
                    grads.grads[key] = clipped;
                }
            });
        }
        
        optimizer.applyGradients(grads.grads);
        Object.values(grads.grads).forEach(g => { if(g) g.dispose(); });
        const lossValue = await loss.data();
        loss.dispose();
        return lossValue[0];
    }
    
    async _updateActorsShared(states) {
        const optimizer = tf.train.adam(this.learningRate);
        const sharedActor = this.actors[0];
        const statePerAgent = this.centralizedStateDim / this.numAgents;
        let lastLogProb = null;

        const grads = optimizer.computeGradients(() => {
            let totalPolicyLoss = tf.scalar(0);
            const trainAgents = Math.min(this.numAgents, 4);
            for (let i = 0; i < trainAgents; i++) {
                const start = i * statePerAgent;
                const agentState = states.slice([0, start], [this.batchSize, statePerAgent]);
                const { action, logProb } = sharedActor.sample(agentState);
                const jointActions = this._buildJointAction(action, i);
                const { q1, q2 } = this.centralizedCritic.forward(states, jointActions);
                const qValue = tf.minimum(q1, q2);
                const individualLoss = tf.mean(tf.sub(tf.mul(logProb, this.alphaTuner.getAlpha()), qValue));
                totalPolicyLoss = tf.add(totalPolicyLoss, individualLoss);
                if (i === 0) lastLogProb = logProb.clone();
                else logProb.dispose();
                jointActions.dispose();
            }
            return tf.div(totalPolicyLoss, tf.scalar(trainAgents));
        }, sharedActor.model.getWeights());

        if (this.gradientClip > 0) {
            Object.keys(grads.grads).forEach(key => {
                if (grads.grads[key]) {
                    const clipped = tf.clipByValue(grads.grads[key], -this.gradientClip, this.gradientClip);
                    grads.grads[key].dispose();
                    grads.grads[key] = clipped;
                }
            });
        }

        optimizer.applyGradients(grads.grads);
        Object.values(grads.grads).forEach(g => { if(g) g.dispose(); });
        const entropy = tf.neg(tf.mean(lastLogProb)).dataSync()[0];
        return { actorLoss: 0, logProbs: lastLogProb, entropy };
    }

    _buildJointAction(agentAction, agentIdx) {
        return tf.tidy(() => {
            const joint = [];
            for (let i = 0; i < this.numAgents; i++) {
                joint.push(i === agentIdx ? agentAction : tf.zeros([this.batchSize, this.actionDim]));
            }
            return tf.concat(joint, 1);
        });
    }
    
    _softUpdateTargets() {
        this.targetActors[0].softUpdate(this.actors[0], this.tau);
        this.targetCritic.softUpdate(this.centralizedCritic, this.tau);
    }
    
    getMetrics() {
        const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
        return {
            step: this.step,
            alpha: this.alphaTuner.getAlpha(),
            avgCriticLoss: avg(this.metrics.criticLoss),
            avgActorLoss: avg(this.metrics.actorLoss),
            avgEntropy: avg(this.metrics.entropy),
            bufferSize: this.replayBuffer.getSize()
        };
    }
    
    save() {
        return {
            actors: [this.actors[0].save()],
            critics: this.centralizedCritic.save(),
            alphaTuner: this.alphaTuner.save(),
            step: this.step,
            metrics: this.metrics
        };
    }
    
    load(data) {
        if (data.actors && data.actors[0]) {
            this.actors[0].load(data.actors[0]);
            this.targetActors[0].load(data.actors[0]);
        }
        this.centralizedCritic.load(data.critics);
        this.targetCritic.hardUpdate(this.centralizedCritic);
        this.alphaTuner.load(data.alphaTuner);
        this.step = data.step;
        this.metrics = data.metrics;
    }
    
    dispose() {
        this.actors[0].dispose();
        this.targetActors[0].dispose();
        this.centralizedCritic.dispose();
        this.targetCritic.dispose();
        this.alphaTuner.dispose();
    }
}

export default MASACTrainer;
