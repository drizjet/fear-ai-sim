/**
 * Web Worker for AI Processing
 * Phase 5: Optimization (T5.3)
 */

self.onmessage = function(e) {
    const { id, type, payload } = e.data;
    
    if (type === 'DECIDE') {
        const result = calculateDecision(payload);
        self.postMessage({ id, type, result });
    } else if (type === 'STIMULUS') {
        const result = calculateStimulus(payload);
        self.postMessage({ id, type, result });
    }
};

/**
 * Perform brain decision logic in worker
 */
function calculateDecision(state) {
    let { fear, adrenaline, morale, threshold, neighbors } = state;
    
    // Fear decay
    fear *= 0.95;
    
    // Neighbor stimulus
    let stimulus = 0;
    if (neighbors) {
        neighbors.forEach(n => {
            if (n.state === 'PANIC') stimulus += 0.05;
        });
    }
    
    fear += stimulus;
    fear = Math.min(1.0, Math.max(0, fear));
    
    // Simple state machine logic
    let newState = state.state;
    if (fear > 0.8) newState = 'PANIC';
    else if (fear > 0.5) newState = 'ANXIOUS';
    else if (fear > 0.2) newState = 'ALERT';
    else if (fear < 0.1) newState = 'CALM';
    
    return {
        fear,
        state: newState,
        adrenaline: Math.min(1.0, adrenaline + (newState === 'PANIC' ? 0.02 : -0.01))
    };
}

/**
 * Calculate Weber-Fechner response to stimulus
 */
function calculateStimulus(payload) {
    const { intensity, sensitivity } = payload;
    if (intensity <= 0) return 0;
    return sensitivity * Math.log(1 + intensity);
}
