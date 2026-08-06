/**
 * MASAC-Enabled Predator System
 * Self-learning AI with fear-based rewards
 */

import { MASAC } from './masac.js';

// State features for predator
function getPredatorState(predator, agents, otherPredators, width, height) {
    const state = [];
    
    // 1. Normalized position (2 features)
    state.push(predator.x / width);
    state.push(predator.y / height);
    
    // 2. Normalized velocity (2 features)
    const speed = Math.sqrt(predator.vx * predator.vx + predator.vy * predator.vy);
    const maxSpeed = predator.config.speed;
    state.push(predator.vx / maxSpeed);
    state.push(predator.vy / maxSpeed);
    
    // 3. Distance and direction to nearest prey (2 features)
    let nearestPreyDistSq = Infinity;
    let nearestPreyAngle = 0;
    let nearestPrey = null;
    
    for (const agent of agents) {
        if (agent.dead || agent.isPredator) continue;
        
        const dx = agent.x - predator.x;
        const dy = agent.y - predator.y;
        const distSq = dx * dx + dy * dy;
        
        if (distSq < nearestPreyDistSq) {
            nearestPreyDistSq = distSq;
            nearestPreyAngle = Math.atan2(dy, dx);
            nearestPrey = agent;
        }
    }
    
    let nearestPreyDist = nearestPreyDistSq === Infinity ? 500 : Math.sqrt(nearestPreyDistSq);
    
    // Normalize distance (assume max relevant distance is 500)
    state.push(Math.min(nearestPreyDist / 500, 1.0));
    state.push(nearestPreyAngle / Math.PI); // -1 to 1
    
    // 4. Pack information - average position of other predators (2 features)
    let packX = 0, packY = 0, packCount = 0;
    for (const p of otherPredators) {
        if (p.id !== predator.id && !p.dead) {
            packX += p.x;
            packY += p.y;
            packCount++;
        }
    }
    
    if (packCount > 0) {
        packX /= packCount;
        packY /= packCount;
        state.push((packX - predator.x) / width);
        state.push((packY - predator.y) / height);
    } else {
        state.push(0, 0);
    }
    
    // 5. Energy level (1 feature)
    state.push((predator.energy || 50) / 100);
    
    // 6. Current strategy indicator (one-hot, 3 features)
    const strategyMap = { 'CHASE': 0, 'AMBUSH': 1, 'PACK': 2 };
    const strat = strategyMap[predator.config.behavior] || 0;
    state.push(strat === 0 ? 1 : 0);
    state.push(strat === 1 ? 1 : 0);
    state.push(strat === 2 ? 1 : 0);
    
    // Pad or trim to fixed size (12 features)
    while (state.length < 12) state.push(0);
    return state.slice(0, 12);
}

// Action interpretation for predator
function applyPredatorAction(predator, action, maxSpeed) {
    // Action is [steering_x, steering_y] in range [-1, 1]
    const [steerX, steerY] = action;
    
    // Scale to acceleration
    const accelStrength = 0.3;
    predator.vx += steerX * accelStrength;
    predator.vy += steerY * accelStrength;
    
    // Clamp speed
    const speed = Math.sqrt(predator.vx * predator.vx + predator.vy * predator.vy);
    if (speed > maxSpeed) {
        predator.vx = (predator.vx / speed) * maxSpeed;
        predator.vy = (predator.vy / speed) * maxSpeed;
    }
}

// Compute reward for predator
function computePredatorReward(predator, agents, prevKillCount, currentKillCount, survivalTime) {
    let reward = 0;
    
    // +10 for each kill (from Qingdao paper)
    const newKills = currentKillCount - prevKillCount;
    reward += newKills * 10;
    
    // +0.1 per step survival
    reward += 0.1;
    
    // -5 for collision with other predators (would need collision detection)
    // Simplified: small penalty for being too close to other predators
    
    // Distance penalty: reward for getting closer to prey
    let nearestDistSq = Infinity;
    for (const agent of agents) {
        if (agent.dead || agent.isPredator) continue;
        const dx = agent.x - predator.x;
        const dy = agent.y - predator.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < nearestDistSq) {
            nearestDistSq = distSq;
        }
    }
    let nearestDist = nearestDistSq === Infinity ? Infinity : Math.sqrt(nearestDistSq);
    
    // -1 for distance (normalized)
    if (nearestDist < Infinity) {
        reward -= nearestDist / 500;
    }
    
    // Bonus for hunting success rate
    if (predator.personalSuccessCount > 0) {
        reward += 0.5; // Small bonus for experienced hunters
    }
    
    return reward;
}

// MASAC Predator System
export class MASACPredatorSystem {
    constructor(numPredators, config = {}) {
        this.numPredators = numPredators;
        this.config = {
            lr: 3e-4,
            gamma: 0.99,
            tau: 0.005,
            alpha: 0.2,
            batchSize: 64, // Smaller for browser
            bufferCapacity: 50000, // Reduced for memory
            ...config
        };
        
        // State: 12 features, Action: 2 features (x, y steering)
        this.masac = new MASAC(numPredators, 12, 2, this.config);
        
        // Track previous states and actions for transition
        this.prevStates = null;
        this.prevActions = null;
        
        // Kill tracking
        this.prevKillCount = 0;
        this.totalKills = 0;
        
        // Episode tracking
        this.episodeSteps = 0;
        this.episodeReward = 0;
        
        // Metrics
        this.metrics = {
            episodeRewards: [],
            episodeLengths: [],
            killRates: [],
            meanQValues: []
        };
    }

    // Called at the start of each frame
    selectActions(predators, agents, width, height) {
        // Get states for all predators
        const states = predators.map((p, i) => 
            getPredatorState(p, agents, predators, width, height)
        );
        
        // Select actions from MASAC
        const actions = this.masac.selectActions(states, false); // stochastic
        
        // Store for next transition
        this.prevStates = states;
        this.prevActions = actions;
        
        return { states, actions };
    }

    // Apply actions to predators
    applyActions(predators, actions) {
        for (let i = 0; i < predators.length; i++) {
            if (!predators[i].dead) {
                applyPredatorAction(predators[i], actions[i], predators[i].maxSpeed);
            }
        }
    }

    // Called after environment step
    storeTransitions(predators, agents, dones, width, height) {
        if (!this.prevStates || !this.prevActions) return;
        
        // Get current states
        const currentStates = predators.map((p, i) => 
            getPredatorState(p, agents, predators, width, height)
        );
        
        // Compute rewards
        const rewards = predators.map((p, i) => {
            // Count current kills
            const currentKills = p.personalSuccessCount || 0;
            const reward = computePredatorReward(p, agents, this.prevKillCount, currentKills, p.stressSurvivalTime);
            this.totalKills += (currentKills - this.prevKillCount);
            return reward;
        });
        
        this.prevKillCount = this.totalKills;
        
        // Store transition
        this.masac.storeTransition(
            this.prevStates,
            this.prevActions,
            rewards,
            currentStates,
            dones
        );
        
        // Track episode reward
        this.episodeReward += rewards.reduce((a, b) => a + b, 0);
        this.episodeSteps++;
    }

    // Training step
    train() {
        const result = this.masac.train();
        
        // Check for episode end (if any predator dies or timeout)
        const maxEpisodeLength = 1000;
        if (this.episodeSteps >= maxEpisodeLength) {
            this.endEpisode();
        }
        
        return result;
    }

    endEpisode() {
        this.metrics.episodeRewards.push(this.episodeReward);
        this.metrics.episodeLengths.push(this.episodeSteps);
        this.metrics.killRates.push(this.totalKills / Math.max(1, this.episodeSteps));
        
        // Reset episode tracking
        this.episodeSteps = 0;
        this.episodeReward = 0;
        this.prevKillCount = 0;
        
        // Keep only last 100 episodes
        if (this.metrics.episodeRewards.length > 100) {
            this.metrics.episodeRewards.shift();
            this.metrics.episodeLengths.shift();
            this.metrics.killRates.shift();
        }
    }

    getMetrics() {
        const recent = (arr) => arr.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, arr.length);
        
        return {
            avgEpisodeReward: recent(this.metrics.episodeRewards),
            avgEpisodeLength: recent(this.metrics.episodeLengths),
            avgKillRate: recent(this.metrics.killRates),
            totalKills: this.totalKills,
            bufferSize: this.masac.replayBuffer.size,
            trainStep: this.masac.trainStep,
            alpha: this.masac.alpha,
            ...this.masac.getMetrics()
        };
    }

    save() {
        return {
            masac: this.masac.save(),
            metrics: this.metrics,
            totalKills: this.totalKills
        };
    }

    load(checkpoint) {
        this.masac.load(checkpoint.masac);
        this.metrics = checkpoint.metrics;
        this.totalKills = checkpoint.totalKills;
    }
}

export { getPredatorState, applyPredatorAction, computePredatorReward };
