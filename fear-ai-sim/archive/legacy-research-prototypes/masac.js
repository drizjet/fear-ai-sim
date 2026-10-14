/**
 * Multi-Agent Soft Actor-Critic (MASAC)
 * Centralized Training with Decentralized Execution (CTDE)
 * Based on Qingdao University 2025 paper and ffelten/MASAC
 */

import { Matrix, NeuralNetwork } from './neuralnet.js';
import { GaussianPolicy, QNetwork, SACAgent } from './sac_agent.js';

// Multi-Agent Replay Buffer
class MultiAgentReplayBuffer {
    constructor(capacity, numAgents, stateDim, actionDim) {
        this.capacity = capacity;
        this.numAgents = numAgents;
        this.ptr = 0;
        this.size = 0;
        
        // Store transitions for all agents
        this.states = [];
        this.actions = [];
        this.rewards = [];
        this.nextStates = [];
        this.dones = [];
        
        // Global state (for centralized critic)
        this.globalStates = new Float32Array(capacity * numAgents * stateDim);
        this.globalNextStates = new Float32Array(capacity * numAgents * stateDim);
        
        for (let i = 0; i < numAgents; i++) {
            this.states.push(new Float32Array(capacity * stateDim));
            this.actions.push(new Float32Array(capacity * actionDim));
            this.rewards.push(new Float32Array(capacity));
            this.nextStates.push(new Float32Array(capacity * stateDim));
            this.dones.push(new Float32Array(capacity));
        }
        
        this.stateDim = stateDim;
        this.actionDim = actionDim;
    }

    push(agentStates, agentActions, agentRewards, agentNextStates, agentDones) {
        const idx = this.ptr;
        
        // Store global state (concatenation of all agent states)
        for (let agentId = 0; agentId < this.numAgents; agentId++) {
            const offset = agentId * this.stateDim;
            for (let i = 0; i < this.stateDim; i++) {
                this.globalStates[idx * this.numAgents * this.stateDim + offset + i] = agentStates[agentId][i];
                this.globalNextStates[idx * this.numAgents * this.stateDim + offset + i] = agentNextStates[agentId][i];
            }
            
            // Store individual agent data
            for (let i = 0; i < this.stateDim; i++) {
                this.states[agentId][idx * this.stateDim + i] = agentStates[agentId][i];
                this.nextStates[agentId][idx * this.stateDim + i] = agentNextStates[agentId][i];
            }
            
            for (let i = 0; i < this.actionDim; i++) {
                this.actions[agentId][idx * this.actionDim + i] = agentActions[agentId][i];
            }
            
            this.rewards[agentId][idx] = agentRewards[agentId];
            this.dones[agentId][idx] = agentDones[agentId] ? 1 : 0;
        }
        
        this.ptr = (this.ptr + 1) % this.capacity;
        this.size = Math.min(this.size + 1, this.capacity);
    }

    sample(batchSize) {
        const indices = [];
        for (let i = 0; i < batchSize; i++) {
            indices.push(Math.floor(Math.random() * this.size));
        }
        
        const batch = {
            states: [],
            actions: [],
            rewards: [],
            nextStates: [],
            dones: [],
            globalStates: [],
            globalNextStates: [],
            globalActions: [],
            globalNextActions: []
        };
        
        for (let agentId = 0; agentId < this.numAgents; agentId++) {
            batch.states.push([]);
            batch.actions.push([]);
            batch.rewards.push([]);
            batch.nextStates.push([]);
            batch.dones.push([]);
        }
        
        for (const idx of indices) {
            // Extract global state
            const globalState = [];
            const globalNextState = [];
            const globalAction = [];
            
            for (let agentId = 0; agentId < this.numAgents; agentId++) {
                const offset = agentId * this.stateDim;
                const agentGlobalState = [];
                const agentGlobalNextState = [];
                
                for (let i = 0; i < this.stateDim; i++) {
                    agentGlobalState.push(this.globalStates[idx * this.numAgents * this.stateDim + offset + i]);
                    agentGlobalNextState.push(this.globalNextStates[idx * this.numAgents * this.stateDim + offset + i]);
                }
                globalState.push(...agentGlobalState);
                globalNextState.push(...agentGlobalNextState);
                
                // Extract agent-specific data
                const state = [];
                const nextState = [];
                const action = [];
                
                for (let i = 0; i < this.stateDim; i++) {
                    state.push(this.states[agentId][idx * this.stateDim + i]);
                    nextState.push(this.nextStates[agentId][idx * this.stateDim + i]);
                }
                
                for (let i = 0; i < this.actionDim; i++) {
                    action.push(this.actions[agentId][idx * this.actionDim + i]);
                }
                
                batch.states[agentId].push(state);
                batch.actions[agentId].push(action);
                batch.rewards[agentId].push(this.rewards[agentId][idx]);
                batch.nextStates[agentId].push(nextState);
                batch.dones[agentId].push(this.dones[agentId][idx]);
                
                globalAction.push(...action);
            }
            
            batch.globalStates.push(globalState);
            batch.globalNextStates.push(globalNextState);
            batch.globalActions.push(globalAction);
        }
        
        return batch;
    }
}

// Centralized Critic for MASAC
// Takes global state and all agents' actions
class CentralizedCritic {
    constructor(numAgents, stateDim, actionDim, hiddenDims = [256, 256]) {
        this.numAgents = numAgents;
        this.stateDim = stateDim;
        this.actionDim = actionDim;
        
        // Input: concatenation of all states and all actions
        const inputDim = numAgents * stateDim + numAgents * actionDim;
        
        // Build network
        const layers = [];
        let currentDim = inputDim;
        
        for (const hiddenDim of hiddenDims) {
            layers.push(new Layer(currentDim, hiddenDim, 'relu'));
            currentDim = hiddenDim;
        }
        
        // Output: single Q-value for the team
        layers.push(new Layer(currentDim, 1, 'relu'));
        
        this.network = new NeuralNetwork(layers);
    }

    forward(globalState, globalActions) {
        // Concatenate global state and all actions
        const x = new Matrix(globalState.length + globalActions.length, 1);
        
        for (let i = 0; i < globalState.length; i++) {
            x.data[i] = globalState[i];
        }
        for (let i = 0; i < globalActions.length; i++) {
            x.data[globalState.length + i] = globalActions[i];
        }
        
        return this.network.forward(x);
    }

    getParameters() {
        return this.network.getParameters();
    }

    setParameters(params) {
        this.network.setParameters(params);
    }

    softUpdate(otherCritic, tau) {
        this.network.softUpdate(otherCritic.network, tau);
    }
}

// MASAC Agent (one per team - predators or prey)
class MASAC {
    constructor(numAgents, stateDim, actionDim, config = {}) {
        this.numAgents = numAgents;
        this.stateDim = stateDim;
        this.actionDim = actionDim;
        
        // Hyperparameters
        this.lr = config.lr || 3e-4;
        this.gamma = config.gamma || 0.99;
        this.tau = config.tau || 0.005;
        this.alpha = config.alpha || 0.2;
        this.autoTuneAlpha = config.autoTuneAlpha !== false;
        this.batchSize = config.batchSize || 256;
        this.bufferCapacity = config.bufferCapacity || 100000;
        this.updateInterval = config.updateInterval || 1;
        
        // Target entropy for auto-tuning
        this.targetEntropy = -actionDim * numAgents;
        this.logAlpha = Math.log(this.alpha);
        
        // Individual actors for each agent (decentralized execution)
        this.actors = [];
        for (let i = 0; i < numAgents; i++) {
            this.actors.push(new GaussianPolicy(stateDim, actionDim));
        }
        
        // Shared centralized critics (twin Q-networks)
        // All agents share the same critic during training
        this.critic1 = new CentralizedCritic(numAgents, stateDim, actionDim);
        this.critic2 = new CentralizedCritic(numAgents, stateDim, actionDim);
        
        this.critic1Target = new CentralizedCritic(numAgents, stateDim, actionDim);
        this.critic2Target = new CentralizedCritic(numAgents, stateDim, actionDim);
        
        // Copy to targets
        this.critic1Target.setParameters(this.critic1.getParameters());
        this.critic2Target.setParameters(this.critic2.getParameters());
        
        // Shared replay buffer
        this.replayBuffer = new MultiAgentReplayBuffer(
            this.bufferCapacity, numAgents, stateDim, actionDim
        );
        
        // Training step
        this.trainStep = 0;
        
        // Metrics tracking
        this.metrics = {
            criticLosses: [],
            policyLosses: [],
            alphas: [],
            meanQValues: []
        };
    }

    // Select actions for all agents (decentralized - each uses only its observation)
    selectActions(states, deterministic = false) {
        const actions = [];
        for (let i = 0; i < this.numAgents; i++) {
            const stateMatrix = Matrix.fromArray(states[i].map(s => [s]));
            const { action } = this.actors[i].forward(stateMatrix, deterministic);
            actions.push(action.data);
        }
        return actions;
    }

    // Store transition from all agents
    storeTransition(states, actions, rewards, nextStates, dones) {
        this.replayBuffer.push(states, actions, rewards, nextStates, dones);
    }

    // Training step (centralized)
    train() {
        if (this.replayBuffer.size < this.batchSize) {
            return null;
        }
        
        // Sample batch
        const batch = this.replayBuffer.sample(this.batchSize);
        
        // ===== UPDATE CRITICS =====
        const criticLoss = this.updateCritics(batch);
        
        // ===== UPDATE ACTORS (delayed) =====
        let policyLoss = 0;
        if (this.trainStep % this.updateInterval === 0) {
            policyLoss = this.updateActors(batch);
            
            // ===== UPDATE ALPHA =====
            if (this.autoTuneAlpha) {
                this.updateAlpha(batch);
            }
            
            // ===== SOFT UPDATE TARGETS =====
            this.critic1Target.softUpdate(this.critic1, this.tau);
            this.critic2Target.softUpdate(this.critic2, this.tau);
        }
        
        this.trainStep++;
        
        // Store metrics
        this.metrics.criticLosses.push(criticLoss);
        this.metrics.policyLosses.push(policyLoss);
        this.metrics.alphas.push(this.alpha);
        
        return {
            criticLoss,
            policyLoss,
            alpha: this.alpha,
            step: this.trainStep
        };
    }

    updateCritics(batch) {
        // For each agent, compute Q-target and Q-loss
        let totalLoss = 0;
        
        // Get next actions from all agents' current policies
        const nextActions = [];
        const nextLogProbs = [];
        
        for (let i = 0; i < this.numAgents; i++) {
            const nextState = Matrix.fromArray(batch.nextStates[i]);
            const { action, logProb } = this.actors[i].forward(nextState, false, true);
            nextActions.push(action.data);
            nextLogProbs.push(logProb);
        }
        
        for (let agentId = 0; agentId < this.numAgents; agentId++) {
            // Compute Q-targets
            const q1Next = this.critic1Target.forward(
                batch.globalNextStates.flat(),
                nextActions.flat()
            );
            const q2Next = this.critic2Target.forward(
                batch.globalNextStates.flat(),
                nextActions.flat()
            );
            
            // Min of twin Q-networks
            const qNext = new Matrix(q1Next.rows, q1Next.cols);
            for (let i = 0; i < qNext.data.length; i++) {
                qNext.data[i] = Math.min(q1Next.data[i], q2Next.data[i]);
            }
            
            // Add entropy term
            const entropyBonus = this.alpha * (nextLogProbs.reduce((a, b) => a + b, 0) / this.numAgents);
            
            // Target: r + γ * (1 - d) * (Q - α * log π)
            const rewards = Matrix.fromArray(batch.rewards[agentId].map(r => [r]));
            const dones = Matrix.fromArray(batch.dones[agentId].map(d => [d]));
            
            const targetQ = [];
            for (let i = 0; i < this.batchSize; i++) {
                const r = rewards.data[i];
                const done = dones.data[i];
                const q = qNext.data[i];
                targetQ.push([r + (1 - done) * this.gamma * (q - entropyBonus)]);
            }
            
            // Current Q-values
            const q1Current = this.critic1.forward(
                batch.globalStates.flat(),
                batch.globalActions.flat()
            );
            const q2Current = this.critic2.forward(
                batch.globalStates.flat(),
                batch.globalActions.flat()
            );
            
            // MSE loss
            let loss1 = 0, loss2 = 0;
            for (let i = 0; i < this.batchSize; i++) {
                const diff1 = q1Current.data[i] - targetQ[i][0];
                const diff2 = q2Current.data[i] - targetQ[i][0];
                loss1 += diff1 * diff1;
                loss2 += diff2 * diff2;
            }
            
            totalLoss += (loss1 + loss2) / (2 * this.batchSize);
            
            // Note: Actual gradient update would require autograd
            // This is the loss computation for monitoring
        }
        
        return totalLoss / this.numAgents;
    }

    updateActors(batch) {
        let totalLoss = 0;
        
        for (let agentId = 0; agentId < this.numAgents; agentId++) {
            // Sample new actions from current policy
            const states = Matrix.fromArray(batch.states[agentId]);
            const { action: newActions, logProb } = this.actors[agentId].forward(states, false, true);
            
            // Build global action vector with new action for this agent
            const globalActions = [];
            for (let i = 0; i < this.batchSize; i++) {
                const actionsForState = [];
                for (let j = 0; j < this.numAgents; j++) {
                    if (j === agentId) {
                        actionsForState.push(newActions.data[i * this.actionDim + 0] || 0);
                        actionsForState.push(newActions.data[i * this.actionDim + 1] || 0);
                    } else {
                        // Use old actions from buffer for other agents
                        actionsForState.push(batch.globalActions[i][j * this.actionDim + 0]);
                        actionsForState.push(batch.globalActions[i][j * this.actionDim + 1]);
                    }
                }
                globalActions.push(...actionsForState);
            }
            
            // Get Q-values
            const q1 = this.critic1.forward(batch.globalStates.flat(), globalActions);
            const q2 = this.critic2.forward(batch.globalStates.flat(), globalActions);
            
            const q = new Matrix(q1.rows, q1.cols);
            for (let i = 0; i < q.data.length; i++) {
                q.data[i] = Math.min(q1.data[i], q2.data[i]);
            }
            
            // Policy loss: α * log π(a|s) - Q(s,a)
            const loss = this.alpha * logProb - q.data.reduce((a, b) => a + b, 0) / this.batchSize;
            totalLoss += loss;
        }
        
        return totalLoss / this.numAgents;
    }

    updateAlpha(batch) {
        // Compute alpha loss
        let loss = 0;
        
        for (let i = 0; i < this.numAgents; i++) {
            const states = Matrix.fromArray(batch.states[i]);
            const { logProb } = this.actors[i].forward(states, false, true);
            loss += -this.logAlpha * (logProb + this.targetEntropy / this.numAgents);
        }
        
        loss /= this.numAgents;
        
        // Gradient step
        this.logAlpha -= this.lr * loss;
        this.alpha = Math.exp(this.logAlpha);
    }

    // Save/load functionality
    save() {
        return {
            actors: this.actors.map(a => a.getParameters()),
            critic1: this.critic1.getParameters(),
            critic2: this.critic2.getParameters(),
            alpha: this.alpha,
            logAlpha: this.logAlpha,
            trainStep: this.trainStep
        };
    }

    load(checkpoint) {
        for (let i = 0; i < this.numAgents; i++) {
            this.actors[i].setParameters(checkpoint.actors[i]);
        }
        this.critic1.setParameters(checkpoint.critic1);
        this.critic2.setParameters(checkpoint.critic2);
        this.critic1Target.setParameters(checkpoint.critic1);
        this.critic2Target.setParameters(checkpoint.critic2);
        this.alpha = checkpoint.alpha;
        this.logAlpha = checkpoint.logAlpha;
        this.trainStep = checkpoint.trainStep;
    }

    getMetrics() {
        return {
            ...this.metrics,
            recentCriticLoss: this.metrics.criticLosses.slice(-100).reduce((a, b) => a + b, 0) / 100,
            recentPolicyLoss: this.metrics.policyLosses.slice(-100).reduce((a, b) => a + b, 0) / 100,
            currentAlpha: this.alpha
        };
    }
}

export { MASAC, MultiAgentReplayBuffer, CentralizedCritic };
