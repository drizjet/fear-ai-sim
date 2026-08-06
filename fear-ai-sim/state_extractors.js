/**
 * State Extractors for MASAC Integration
 * Converts simulation state to neural network inputs
 */

/**
 * Extract predator state (16 dimensions)
 */
export function extractPredatorState(predator, simulation) {
    const state = new Float32Array(16);
    
    // [0-1] Position normalized
    state[0] = predator.x / simulation.width;
    state[1] = predator.y / simulation.height;
    
    // [2-3] Velocity normalized
    const maxSpeed = predator.maxSpeed || 4;
    state[2] = predator.vx / maxSpeed;
    state[3] = predator.vy / maxSpeed;
    
    // [4-5] Nearest prey (distance, angle)
    const nearestPrey = simulation.findNearestPrey(predator);
    if (nearestPrey) {
        const dx = nearestPrey.x - predator.x;
        const dy = nearestPrey.y - predator.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        state[4] = Math.min(dist / 500, 1); // Normalize distance
        state[5] = Math.atan2(dy, dx) / Math.PI; // Normalize angle to [-1, 1]
    } else {
        state[4] = 1; // Max distance
        state[5] = 0;
    }
    
    // [6-7] Pack center relative position
    const packCenter = simulation.getPredatorPackCenter(predator);
    state[6] = (packCenter.x - predator.x) / 200;
    state[7] = (packCenter.y - predator.y) / 200;
    
    // [8] Number of nearby predators
    const nearbyPredators = simulation.countNearbyPredators(predator, 100);
    state[8] = Math.min(nearbyPredators / 5, 1);
    
    // [9] Number of nearby prey
    const nearbyPrey = simulation.countNearbyPrey(predator, 200);
    state[9] = Math.min(nearbyPrey / 10, 1);
    
    // [10] Average prey fear level
    const avgFear = simulation.getAveragePreyFearNear(predator, 150);
    state[10] = avgFear;
    
    // [11] Time since last kill (decay over time)
    const timeSinceKill = simulation.getTimeSinceLastKill(predator);
    state[11] = Math.min(timeSinceKill / 1000, 1);
    
    // [12-13] Heading to nearest safe zone (for prey - predators might want to avoid)
    const safeZone = simulation.getNearestSafeZone(predator);
    if (safeZone) {
        const sdx = safeZone.x - predator.x;
        const sdy = safeZone.y - predator.y;
        state[12] = sdx / 500;
        state[13] = sdy / 500;
    } else {
        state[12] = 0;
        state[13] = 0;
    }
    
    // [14] Energy level
    state[14] = (predator.energy || 100) / 100;
    
    // [15] Current state (one-hot encoded - simplified to just value)
    const states = { IDLE: 0, CHASING: 0.25, CHARGING: 0.5, ATTACKING: 0.75, PATROLLING: 1, AMBUSH_WAIT: 0.33, HUNTING: 0.66 };
    state[15] = states[predator.state] || 0;
    
    return state;
}

/**
 * Extract prey state (20 dimensions)
 */
export function extractPreyState(prey, simulation) {
    const state = new Float32Array(20);
    
    // [0-1] Position normalized
    state[0] = prey.x / simulation.width;
    state[1] = prey.y / simulation.height;
    
    // [2-3] Velocity normalized
    const maxSpeed = prey.maxSpeed || 3;
    state[2] = prey.vx / maxSpeed;
    state[3] = prey.vy / maxSpeed;
    
    // [4-5] Nearest predator (distance, angle)
    const nearestPredator = simulation.findNearestPredator(prey);
    if (nearestPredator) {
        const dx = nearestPredator.x - prey.x;
        const dy = nearestPredator.y - prey.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        state[4] = Math.min(dist / 500, 1);
        state[5] = Math.atan2(dy, dx) / Math.PI;
    } else {
        state[4] = 1;
        state[5] = 0;
    }
    
    // [6] Number of predators in danger zone (<100)
    const dangerPredators = simulation.countNearbyPredators(prey, 100);
    state[6] = Math.min(dangerPredators / 3, 1);
    
    // [7] Number of predators in caution zone (100-300)
    const cautionPredators = simulation.countNearbyPredators(prey, 300) - dangerPredators;
    state[7] = Math.min(cautionPredators / 5, 1);
    
    // [8] Nearest prey distance
    const nearestPrey = simulation.findNearestPrey(prey, true); // Exclude self
    if (nearestPrey) {
        const pdx = nearestPrey.x - prey.x;
        const pdy = nearestPrey.y - prey.y;
        const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
        state[8] = Math.min(pdist / 200, 1);
    } else {
        state[8] = 1;
    }
    
    // [9] Number of nearby prey (herd size)
    const herdSize = simulation.countNearbyPrey(prey, 100);
    state[9] = Math.min(herdSize / 10, 1);
    
    // [10] Fear level (0-1)
    state[10] = Math.min(Math.max(prey.brain?.currentFear || 0, 0), 1);
    
    // [11-14] Brain state one-hot
    const brainStates = { CALM: 0, ANXIOUS: 1, ALERT: 2, PANIC: 3 };
    const stateIdx = brainStates[prey.brain?.state || 'CALM'] || 0;
    state[11] = stateIdx === 0 ? 1 : 0;
    state[12] = stateIdx === 1 ? 1 : 0;
    state[13] = stateIdx === 2 ? 1 : 0;
    state[14] = stateIdx === 3 ? 1 : 0;
    
    // [15] Current fear intensity (normalized)
    state[15] = Math.min(Math.max(prey.brain?.currentFear || 0, 0), 1);
    
    // [16-17] Nearest safe haven direction
    const safeHaven = simulation.getNearestSafeHaven(prey);
    if (safeHaven) {
        const hdx = safeHaven.x - prey.x;
        const hdy = safeHaven.y - prey.y;
        state[16] = hdx / 500;
        state[17] = hdy / 500;
    } else {
        state[16] = 0;
        state[17] = 0;
    }
    
    // [18] Energy level
    state[18] = (prey.energy || 100) / 100;
    
    // [19] Trauma level
    state[19] = Math.min(Math.max(prey.trauma || 0, 0), 1);
    
    return state;
}

/**
 * Create global/centralized state from all agents
 */
export function createGlobalState(agentStates) {
    // Flatten all agent states into one array
    const totalLength = agentStates.reduce((sum, s) => sum + s.length, 0);
    const globalState = new Float32Array(totalLength);
    
    let offset = 0;
    for (const state of agentStates) {
        globalState.set(state, offset);
        offset += state.length;
    }
    
    return globalState;
}

/**
 * Compute rewards for predators
 */
export function computePredatorReward(predator, simulation, actionTaken) {
    let reward = 0.0;
    
    // Base survival
    reward += 0.01;
    
    // Kill bonus
    if (predator.hasKillThisStep) {
        reward += 10.0;
    }
    
    // Proximity to prey (shaping)
    const nearestPrey = simulation.findNearestPrey(predator);
    if (nearestPrey) {
        const dx = nearestPrey.x - predator.x;
        const dy = nearestPrey.y - predator.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 50) {
            reward += 0.5;
        } else if (dist < 100) {
            reward += 0.2;
        } else if (dist < 200) {
            reward += 0.05;
        } else {
            reward -= 0.01; // Penalty for being far from prey
        }
    }
    
    // Pack coordination bonus
    const packMembers = simulation.countNearbyPredators(predator, 100);
    if (packMembers >= 2) {
        reward += 0.1;
    } else if (packMembers === 0) {
        reward -= 0.05; // Penalty for being alone
    }
    
    // Energy management
    if (predator.energy && predator.energy < 20) {
        reward -= 0.02;
    }
    
    // Penalty for hitting boundaries
    if (predator.x <= 0 || predator.x >= simulation.width ||
        predator.y <= 0 || predator.y >= simulation.height) {
        reward -= 0.5;
    }
    
    return reward;
}

/**
 * Compute rewards for prey
 */
export function computePreyReward(prey, simulation, actionTaken) {
    let reward = 0.0;
    
    // Base survival
    reward += 0.01;
    
    // Distance from predators
    const nearestPredator = simulation.findNearestPredator(prey);
    if (nearestPredator) {
        const dx = nearestPredator.x - prey.x;
        const dy = nearestPredator.y - prey.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > 300) {  // Safe zone
            reward += 0.3;
        } else if (dist > 200) {
            reward += 0.1;
        } else if (dist < 100) {  // Danger zone
            reward -= 1.0;
        } else if (dist < 50) {   // Critical
            reward -= 3.0;
        }
    } else {
        reward += 0.5; // Bonus for no predators nearby
    }
    
    // Herding bonus
    const herdSize = simulation.countNearbyPrey(prey, 100);
    if (herdSize >= 3) {
        reward += 0.1;
    }
    
    // Safe haven proximity
    const safeHaven = simulation.getNearestSafeHaven(prey);
    if (safeHaven) {
        const hdx = safeHaven.x - prey.x;
        const hdy = safeHaven.y - prey.y;
        const hdist = Math.sqrt(hdx * hdx + hdy * hdy);
        
        if (hdist < 100) {
            reward += 0.2;
        }
    }
    
    // Death penalty
    if (prey.isDead) {
        reward -= 10.0;
    }
    
    // Calm bonus (successful escape without panic)
    if ((prey.fear || 0) < 0.3 && !prey.wasInDanger) {
        reward += 0.1;
    }
    
    // Penalty for panic when not needed
    if ((prey.fear || 0) > 0.7 && (!nearestPredator || 
        Math.sqrt((nearestPredator.x - prey.x)**2 + (nearestPredator.y - prey.y)**2) > 200)) {
        reward -= 0.1;
    }
    
    // Penalty for hitting boundaries
    if (prey.x <= 0 || prey.x >= simulation.width ||
        prey.y <= 0 || prey.y >= simulation.height) {
        reward -= 0.5;
    }
    
    return reward;
}

/**
 * Apply continuous action to agent
 * @param {Object} agent - Agent to update
 * @param {Array} action - Continuous action [-1, 1] for each dimension
 * @param {number} maxAcceleration - Maximum acceleration
 * @param {number} maxSpeed - Maximum speed
 */
export function applyAction(agent, action, maxAcceleration = 0.5, maxSpeed = 4) {
    const [steerX, steerY] = action;
    
    // Convert to acceleration
    const accelerationX = steerX * maxAcceleration;
    const accelerationY = steerY * maxAcceleration;
    
    // Update velocity
    agent.vx = (agent.vx || 0) + accelerationX;
    agent.vy = (agent.vy || 0) + accelerationY;
    
    // Clamp to max speed
    const speed = Math.sqrt(agent.vx * agent.vx + agent.vy * agent.vy);
    if (speed > maxSpeed) {
        agent.vx = (agent.vx / speed) * maxSpeed;
        agent.vy = (agent.vy / speed) * maxSpeed;
    }
    
    // Apply damping
    agent.vx *= 0.98;
    agent.vy *= 0.98;
    
    // Update position
    agent.x += agent.vx;
    agent.y += agent.vy;
    
    // Clamp to boundaries
    agent.x = Math.max(0, Math.min(agent.x, agent.simulation?.width || 1000));
    agent.y = Math.max(0, Math.min(agent.y, agent.simulation?.height || 1000));
}

export default {
    extractPredatorState,
    extractPreyState,
    createGlobalState,
    computePredatorReward,
    computePreyReward,
    applyAction
};
