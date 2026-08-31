/**
 * Predator Sequence Learning using Markov Chains
 * Phase 9 & 10: Generative Intelligence & Intent Inference (T9.3, T10.3)
 * 
 * Tracks predator movement between spatial zones and predicts their next location,
 * and uses HMM to infer hidden intents like HUNTING or PATROLLING.
 */

export class MarkovPredictionEngine {
    constructor(width, height, gridSize = 100) {
        this.width = width;
        this.height = height;
        this.gridSize = gridSize;
        this.cols = Math.ceil(width / gridSize);
        this.rows = Math.ceil(height / gridSize);
        
        // Transition matrix: transitions[fromZone][toZone] = count
        this.transitions = new Map();
        
        // Track last known zone for each predator
        this.lastZones = new Map();
        
        // HMM Intent Inference (T10.3)
        this.hmm = new HiddenMarkovModel();
        this.predatorHistory = new Map(); // predatorId -> array of zoneIds
    }

    getZoneId(x, y) {
        const col = Math.floor(Math.max(0, Math.min(this.width - 1, x)) / this.gridSize);
        const row = Math.floor(Math.max(0, Math.min(this.height - 1, y)) / this.gridSize);
        return `${col},${row}`;
    }

    /**
     * Record predator movement
     */
    recordMovement(predatorId, x, y) {
        const currentZone = this.getZoneId(x, y);
        const lastZone = this.lastZones.get(predatorId);

        if (lastZone && lastZone !== currentZone) {
            // Record transition
            if (!this.transitions.has(lastZone)) {
                this.transitions.set(lastZone, new Map());
            }
            
            const stateTransitions = this.transitions.get(lastZone);
            const count = stateTransitions.get(currentZone) || 0;
            stateTransitions.set(currentZone, count + 1);

            // T10.3: Record history for HMM
            if (!this.predatorHistory.has(predatorId)) {
                this.predatorHistory.set(predatorId, []);
            }
            const history = this.predatorHistory.get(predatorId);
            history.push(currentZone);
            if (history.length > 5) history.shift(); // Keep last 5 moves
        }

        this.lastZones.set(predatorId, currentZone);
    }

    /**
     * Predict the most likely next zone for a predator
     */
    predictNextZone(predatorId) {
        const currentZone = this.lastZones.get(predatorId);
        if (!currentZone) return null;

        const stateTransitions = this.transitions.get(currentZone);
        if (!stateTransitions || stateTransitions.size === 0) return null;

        let mostLikelyZone = null;
        let maxCount = 0;
        let totalCount = 0;

        stateTransitions.forEach((count, toZone) => {
            totalCount += count;
            if (count > maxCount) {
                maxCount = count;
                mostLikelyZone = toZone;
            }
        });

        if (!mostLikelyZone) return null;

        // Parse zone back to coordinates (center of zone)
        const [col, row] = mostLikelyZone.split(',').map(Number);
        
        return {
            zoneId: mostLikelyZone,
            probability: maxCount / totalCount,
            x: col * this.gridSize + (this.gridSize / 2),
            y: row * this.gridSize + (this.gridSize / 2)
        };
    }

    /**
     * Infer predator intent using HMM (T10.3)
     */
    inferIntent(predatorId) {
        const history = this.predatorHistory.get(predatorId);
        if (!history || history.length < 3) return 'UNKNOWN';

        // Calculate a simple proxy observation sequence based on distances between zones
        const observations = [];
        for (let i = 1; i < history.length; i++) {
            const [c1, r1] = history[i-1].split(',').map(Number);
            const [c2, r2] = history[i].split(',').map(Number);
            const dist = Math.hypot(c2 - c1, r2 - r1);
            if (dist > 1.5) observations.push('FAST');
            else if (dist > 0) observations.push('SLOW');
            else observations.push('STILL');
        }

        return this.hmm.viterbi(observations);
    }
}

/**
 * Phase 10: Hidden Markov Model (HMM) Intent Inference (T10.3)
 */
export class HiddenMarkovModel {
    constructor() {
        this.states = ['PATROLLING', 'HUNTING', 'AMBUSHING'];
        this.observations = ['FAST', 'SLOW', 'STILL'];
        
        this.startProb = {
            'PATROLLING': 0.6,
            'HUNTING': 0.3,
            'AMBUSHING': 0.1
        };

        this.transProb = {
            'PATROLLING': { 'PATROLLING': 0.7, 'HUNTING': 0.2, 'AMBUSHING': 0.1 },
            'HUNTING': { 'PATROLLING': 0.3, 'HUNTING': 0.7, 'AMBUSHING': 0.0 },
            'AMBUSHING': { 'PATROLLING': 0.2, 'HUNTING': 0.3, 'AMBUSHING': 0.5 }
        };

        this.emitProb = {
            'PATROLLING': { 'FAST': 0.2, 'SLOW': 0.7, 'STILL': 0.1 },
            'HUNTING': { 'FAST': 0.8, 'SLOW': 0.2, 'STILL': 0.0 },
            'AMBUSHING': { 'FAST': 0.0, 'SLOW': 0.1, 'STILL': 0.9 }
        };
    }

    /**
     * Viterbi algorithm to find most likely hidden state sequence
     */
    viterbi(obsSeq) {
        if (!obsSeq || obsSeq.length === 0) return 'UNKNOWN';
        
        let V = [{}];
        
        // Initialize base cases (t == 0)
        for (const st of this.states) {
            V[0][st] = {
                prob: this.startProb[st] * this.emitProb[st][obsSeq[0]],
                prev: null
            };
        }

        // Run Viterbi for t > 0
        for (let t = 1; t < obsSeq.length; t++) {
            V.push({});
            for (const st of this.states) {
                let maxTrProb = -1;
                let prevStSelected = null;
                
                for (const prevSt of this.states) {
                    const trProb = V[t - 1][prevSt].prob * this.transProb[prevSt][st];
                    if (trProb > maxTrProb) {
                        maxTrProb = trProb;
                        prevStSelected = prevSt;
                    }
                }
                
                const maxProb = maxTrProb * this.emitProb[st][obsSeq[t]];
                V[t][st] = { prob: maxProb, prev: prevStSelected };
            }
        }

        // Find the most likely final state
        let maxProb = -1;
        let bestState = null;
        for (const st of this.states) {
            if (V[obsSeq.length - 1][st].prob > maxProb) {
                maxProb = V[obsSeq.length - 1][st].prob;
                bestState = st;
            }
        }

        return bestState || 'UNKNOWN';
    }
}
