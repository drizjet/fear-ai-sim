/**
 * Working MASAC - Simplified but Functional
 * Uses proper Q-learning that actually trains
 */

import { SACAgent } from './sac_agent.js';

// Simple Q-Table for fast learning (fallback when neural nets are unstable)
class QTable {
    constructor(stateSize, actionSize, learningRate = 0.1) {
        this.qTable = new Map();
        this.lr = learningRate;
        this.gamma = 0.95;
        this.epsilon = 0.3;
        this.epsilonDecay = 0.995;
        this.minEpsilon = 0.01;
    }

    getKey(state) {
        // Discretize state for table lookup
        return state.map(s => Math.round(s * 10) / 10).join(',');
    }

    getAction(state, actionSize) {
        const key = this.getKey(state);
        
        // Epsilon-greedy
        if (Math.random() < this.epsilon) {
            return Array(actionSize).fill(0).map(() => Math.random() * 2 - 1);
        }
        
        if (!this.qTable.has(key)) {
            this.qTable.set(key, Array(actionSize).fill(0).map(() => Math.random() * 0.1));
        }
        
        return this.qTable.get(key);
    }

    update(state, action, reward, nextState) {
        const key = this.getKey(state);
        const nextKey = this.getKey(nextState);
        
        if (!this.qTable.has(key)) {
            this.qTable.set(key, Array(action.length).fill(0));
        }
        if (!this.qTable.has(nextKey)) {
            this.qTable.set(nextKey, Array(action.length).fill(0));
        }
        
        const qValues = this.qTable.get(key);
        const nextQValues = this.qTable.get(nextKey);
        
        const maxNextQ = Math.max(...nextQValues);
        
        // Update each action dimension
        for (let i = 0; i < action.length; i++) {
            const target = reward + this.gamma * maxNextQ;
            qValues[i] = qValues[i] + this.lr * (target - qValues[i]);
        }
        
        // Decay epsilon
        this.epsilon = Math.max(this.minEpsilon, this.epsilon * this.epsilonDecay);
    }

    getEpsilon() {
        return this.epsilon;
    }
}

// Working MASAC - simplified but functional
export class WorkingMASAC {
    constructor(numAgents, stateDim, actionDim, config = {}) {
        this.numAgents = numAgents;
        this.stateDim = stateDim;
        this.actionDim = actionDim;
        
        // Use Q-tables for reliable learning (faster and more stable than neural nets for browser)
        this.agents = [];
        for (let i = 0; i < numAgents; i++) {
            this.agents.push({
                qTable: new QTable(stateDim, actionDim, config.lr || 0.1),
                lastState: null,
                lastAction: null,
                totalReward: 0,
                episodeSteps: 0,
                kills: 0
            });
        }
        
        // Shared learning (tribal knowledge)
        this.sharedQTable = new QTable(stateDim, actionDim, config.lr || 0.1);
        this.shareRate = 0.1; // How much to share with tribe
        
        this.gamma = config.gamma || 0.95;
        this.trainStep = 0;
        
        // Metrics
        this.metrics = {
            avgReward: 0,
            avgEpsilon: 0,
            totalEpisodes: 0
        };
    }

    selectActions(states) {
        const actions = [];
        
        for (let i = 0; i < this.numAgents; i++) {
            // Blend personal Q-table with shared tribal knowledge
            const personalAction = this.agents[i].qTable.getAction(states[i], this.actionDim);
            const sharedAction = this.sharedQTable.getAction(states[i], this.actionDim);
            
            // Weighted combination
            const action = personalAction.map((a, idx) => 
                (1 - this.shareRate) * a + this.shareRate * sharedAction[idx]
            );
            
            // Add small noise for exploration
            const finalAction = action.map(a => {
                const noise = (Math.random() - 0.5) * 0.2;
                return Math.max(-1, Math.min(1, a + noise));
            });
            
            this.agents[i].lastState = states[i];
            this.agents[i].lastAction = finalAction;
            
            actions.push(finalAction);
        }
        
        return actions;
    }

    storeTransitions(states, actions, rewards, nextStates, dones) {
        for (let i = 0; i < this.numAgents; i++) {
            // Update personal Q-table
            this.agents[i].qTable.update(
                this.agents[i].lastState,
                this.agents[i].lastAction,
                rewards[i],
                nextStates[i]
            );
            
            // Update shared tribal Q-table (slower learning)
            this.sharedQTable.update(
                this.agents[i].lastState,
                this.agents[i].lastAction,
                rewards[i],
                nextStates[i]
            );
            
            this.agents[i].totalReward += rewards[i];
            this.agents[i].episodeSteps++;
            
            if (dones[i]) {
                this.metrics.totalEpisodes++;
            }
        }
        
        this.trainStep++;
        this.updateMetrics();
    }

    updateMetrics() {
        const totalReward = this.agents.reduce((sum, a) => sum + a.totalReward, 0);
        const totalEpsilon = this.agents.reduce((sum, a) => sum + a.qTable.getEpsilon(), 0);
        
        this.metrics.avgReward = totalReward / this.numAgents;
        this.metrics.avgEpsilon = totalEpsilon / this.numAgents;
    }

    getMetrics() {
        return {
            ...this.metrics,
            trainStep: this.trainStep,
            qTableSize: this.sharedQTable.qTable.size
        };
    }

    save() {
        return {
            agents: this.agents.map(a => ({
                totalReward: a.totalReward,
                episodeSteps: a.episodeSteps
            })),
            trainStep: this.trainStep,
            metrics: this.metrics
        };
    }

    load(checkpoint) {
        // Restore basic stats
        this.trainStep = checkpoint.trainStep || 0;
        this.metrics = checkpoint.metrics || this.metrics;
    }
}

// State extractors
export function getPredatorState(predator, agents, otherPredators, width, height) {
    const state = [];
    
    // Position (normalized)
    state.push(predator.x / width);
    state.push(predator.y / height);
    
    // Velocity (normalized)
    const maxSpeed = predator.maxSpeed || 3;
    state.push(predator.vx / maxSpeed);
    state.push(predator.vy / maxSpeed);
    
    // Nearest prey
    let nearestDist = Infinity;
    let nearestAngle = 0;
    
    for (const agent of agents) {
        if (agent.dead) continue;
        const dx = agent.x - predator.x;
        const dy = agent.y - predator.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearestAngle = Math.atan2(dy, dx);
        }
    }
    
    state.push(Math.min(nearestDist / 500, 1));
    state.push(nearestAngle / Math.PI);
    
    // Pack center
    let packX = 0, packY = 0, packCount = 0;
    for (const p of otherPredators) {
        if (p.id !== predator.id && !p.dead) {
            packX += p.x;
            packY += p.y;
            packCount++;
        }
    }
    
    if (packCount > 0) {
        state.push((packX / packCount - predator.x) / width);
        state.push((packY / packCount - predator.y) / height);
    } else {
        state.push(0, 0);
    }
    
    return state;
}

export function getPreyState(prey, predators, otherPrey, width, height) {
    const state = [];
    
    // Position
    state.push(prey.x / width);
    state.push(prey.y / height);
    
    // Velocity
    const maxSpeed = prey.maxSpeed || 3;
    state.push(prey.vx / maxSpeed);
    state.push(prey.vy / maxSpeed);
    
    // Nearest predator
    let nearestDist = Infinity;
    let nearestAngle = 0;
    
    for (const predator of predators) {
        const dx = predator.x - prey.x;
        const dy = predator.y - prey.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearestAngle = Math.atan2(dy, dx);
        }
    }
    
    state.push(Math.min(nearestDist / 500, 1));
    state.push(nearestAngle / Math.PI);
    
    // Number of nearby predators (discretized)
    let closeCount = 0;
    for (const predator of predators) {
        const dx = predator.x - prey.x;
        const dy = predator.y - prey.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) closeCount++;
    }
    state.push(Math.min(closeCount / 3, 1));
    
    // Fear level
    state.push(prey.brain?.currentFear || 0);
    
    return state;
}
