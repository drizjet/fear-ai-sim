/**
 * MASAC-Enabled Prey System
 * Self-learning escape strategies with fear-based rewards
 */

import { MASAC } from './masac.js';

// State features for prey
function getPreyState(prey, predators, otherPrey, width, height) {
    const state = [];
    
    // 1. Normalized position (2 features)
    state.push(prey.x / width);
    state.push(prey.y / height);
    
    // 2. Normalized velocity (2 features)
    const maxSpeed = prey.maxSpeed || 3;
    state.push(prey.vx / maxSpeed);
    state.push(prey.vy / maxSpeed);
    
    // 3. Distance and direction to nearest predator (2 features)
    // 4. Number of predators in different ranges (3 features)
    let nearestPredDistSq = Infinity;
    let nearestPredAngle = 0;
    let closePredators = 0;    // < 100
    let mediumPredators = 0;   // 100-300
    let farPredators = 0;      // > 300
    
    for (const predator of predators) {
        const dx = predator.x - prey.x;
        const dy = predator.y - prey.y;
        const distSq = dx * dx + dy * dy;
        
        if (distSq < nearestPredDistSq) {
            nearestPredDistSq = distSq;
            nearestPredAngle = Math.atan2(dy, dx);
        }
        
        if (distSq < 10000) closePredators++;
        else if (distSq < 90000) mediumPredators++;
        else farPredators++;
    }
    
    let nearestPredDist = nearestPredDistSq === Infinity ? 500 : Math.sqrt(nearestPredDistSq);
    
    // Normalize
    state.push(Math.min(nearestPredDist / 500, 1.0));
    state.push(nearestPredAngle / Math.PI);
    
    state.push(Math.min(closePredators / 3, 1.0));
    state.push(Math.min(mediumPredators / 5, 1.0));
    state.push(Math.min(farPredators / 10, 1.0));
    
    // 5. Distance to nearest prey (herding instinct) (1 feature)
    let nearestPreyDistSq = Infinity;
    for (const p of otherPrey) {
        if (p.id !== prey.id && !p.dead) {
            const dx = p.x - prey.x;
            const dy = p.y - prey.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < nearestPreyDistSq) {
                nearestPreyDistSq = distSq;
            }
        }
    }
    let nearestPreyDist = nearestPreyDistSq === Infinity ? 300 : Math.sqrt(nearestPreyDistSq);
    state.push(Math.min(nearestPreyDist / 300, 1.0));
    
    // 6. Fear level (from brain) (1 feature)
    const fear = prey.brain?.currentFear || 0;
    state.push(fear);
    
    // 7. Current brain state (one-hot, 5 features)
    const stateMap = {
        'CALM': 0,
        'ANXIOUS': 1,
        'ALERT': 2,
        'PANIC': 3,
        'HIDE': 4
    };
    const brainState = stateMap[prey.brain?.state] || 0;
    for (let i = 0; i < 5; i++) {
        state.push(i === brainState ? 1 : 0);
    }
    
    // Pad or trim to fixed size (16 features)
    while (state.length < 16) state.push(0);
    return state.slice(0, 16);
}

// Action interpretation for prey
function applyPreyAction(prey, action, maxSpeed) {
    // Action is [steering_x, steering_y] in range [-1, 1]
    const [steerX, steerY] = action;
    
    // Scale to acceleration (prey are more agile)
    const accelStrength = 0.4;
    prey.vx += steerX * accelStrength;
    prey.vy += steerY * accelStrength;
    
    // Clamp speed
    const speed = Math.sqrt(prey.vx * prey.vx + prey.vy * prey.vy);
    if (speed > maxSpeed) {
        prey.vx = (prey.vx / speed) * maxSpeed;
        prey.vy = (prey.vy / speed) * maxSpeed;
    }
    
    // Apply small damping for control
    prey.vx *= 0.98;
    prey.vy *= 0.98;
}

// Compute reward for prey
function computePreyReward(prey, predators, survivalTime, wasCaptured) {
    let reward = 0;
    
    // +10 for escaping (surviving N steps)
    // We'll give this as a bonus at episode end
    
    // +0.1 per step survival
    reward += 0.1;
    
    // -10 for being captured
    if (wasCaptured || prey.dead) {
        reward -= 10;
        return reward;
    }
    
    // Reward for maintaining distance from predators
    let minPredatorDistSq = Infinity;
    for (const predator of predators) {
        const dx = predator.x - prey.x;
        const dy = predator.y - prey.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < minPredatorDistSq) {
            minPredatorDistSq = distSq;
        }
    }
    
    let minPredatorDist = minPredatorDistSq === Infinity ? 500 : Math.sqrt(minPredatorDistSq);
    
    // Reward for being far from predators
    if (minPredatorDist < 100) {
        reward -= 2.0; // Danger zone
    } else if (minPredatorDist < 200) {
        reward -= 0.5; // Caution zone
    } else if (minPredatorDist > 300) {
        reward += 0.5; // Safe zone bonus
    }
    
    // Reward for staying near other prey (herding)
    // (Handled in state, implicitly learned)
    
    // Bonus for low fear (calm escape)
    const fear = prey.brain?.currentFear || 0;
    if (fear < 0.3) {
        reward += 0.2; // Bonus for staying calm
    }
    
    // Strategy bonus - if using learned successful strategy
    if (prey.escapeCount > 0) {
        reward += 0.1 * Math.min(prey.escapeCount, 5);
    }
    
    return reward;
}

// MASAC Prey System
export class MASACPreySystem {
    constructor(numPrey, config = {}) {
        this.numPrey = numPrey;
        this.config = {
            lr: 3e-4,
            gamma: 0.99,
            tau: 0.005,
            alpha: 0.2,
            batchSize: 64,
            bufferCapacity: 50000,
            ...config
        };
        
        // State: 16 features, Action: 2 features
        this.masac = new MASAC(numPrey, 16, 2, this.config);
        
        // Track previous states and actions
        this.prevStates = null;
        this.prevActions = null;
        
        // Survival tracking
        this.survivalCount = 0;
        this.deathCount = 0;
        
        // Episode tracking
        this.episodeSteps = 0;
        this.episodeReward = 0;
        
        // Metrics
        this.metrics = {
            episodeRewards: [],
            episodeLengths: [],
            survivalRates: [],
            meanQValues: []
        };
        
        // Track which prey died this step
        this.prevDead = new Array(numPrey).fill(false);
    }

    // Called at the start of each frame
    selectActions(preyList, predators, width, height) {
        // Get states for all prey
        const states = preyList.map((p, i) => 
            getPreyState(p, predators, preyList, width, height)
        );
        
        // Select actions from MASAC
        const actions = this.masac.selectActions(states, false);
        
        // Store for next transition
        this.prevStates = states;
        this.prevActions = actions;
        
        return { states, actions };
    }

    // Apply actions to prey
    applyActions(preyList, actions) {
        for (let i = 0; i < preyList.length; i++) {
            if (!preyList[i].dead) {
                applyPreyAction(preyList[i], actions[i], preyList[i].maxSpeed);
            }
        }
    }

    // Called after environment step
    storeTransitions(preyList, predators, width, height) {
        if (!this.prevStates || !this.prevActions) return;
        
        // Get current states
        const currentStates = preyList.map((p, i) => 
            getPreyState(p, predators, preyList, width, height)
        );
        
        // Check which prey died
        const dones = preyList.map((p, i) => {
            const wasCaptured = p.dead && !this.prevDead[i];
            if (wasCaptured) {
                this.deathCount++;
            } else if (!p.dead) {
                this.survivalCount++;
            }
            this.prevDead[i] = p.dead;
            return p.dead;
        });
        
        // Compute rewards
        const rewards = preyList.map((p, i) => {
            const wasCaptured = p.dead && !this.prevDead[i];
            return computePreyReward(p, predators, p.stressSurvivalTime, wasCaptured);
        });
        
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
        
        // Check if all prey dead (episode end)
        const allDead = preyList.every(p => p.dead);
        if (allDead || this.episodeSteps >= 1000) {
            this.endEpisode(preyList.length);
        }
    }

    // Training step
    train() {
        return this.masac.train();
    }

    endEpisode(numPrey) {
        this.metrics.episodeRewards.push(this.episodeReward);
        this.metrics.episodeLengths.push(this.episodeSteps);
        
        // Survival rate
        const survivors = numPrey - this.deathCount;
        this.metrics.survivalRates.push(survivors / numPrey);
        
        // Reset episode tracking
        this.episodeSteps = 0;
        this.episodeReward = 0;
        this.prevDead.fill(false);
        
        // Keep only last 100 episodes
        if (this.metrics.episodeRewards.length > 100) {
            this.metrics.episodeRewards.shift();
            this.metrics.episodeLengths.shift();
            this.metrics.survivalRates.shift();
        }
    }

    getMetrics() {
        const recent = (arr) => arr.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, arr.length);
        
        return {
            avgEpisodeReward: recent(this.metrics.episodeRewards),
            avgEpisodeLength: recent(this.metrics.episodeLengths),
            survivalRate: recent(this.metrics.survivalRates),
            totalSurvived: this.survivalCount,
            totalDeaths: this.deathCount,
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
            survivalCount: this.survivalCount,
            deathCount: this.deathCount
        };
    }

    load(checkpoint) {
        this.masac.load(checkpoint.masac);
        this.metrics = checkpoint.metrics;
        this.survivalCount = checkpoint.survivalCount;
        this.deathCount = checkpoint.deathCount;
    }
}

export { getPreyState, applyPreyAction, computePreyReward };
