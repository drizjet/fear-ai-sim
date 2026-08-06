/**
 * Automatic Entropy Tuning for SAC
 * Adjusts temperature parameter alpha to maintain target entropy
 */
import * as tf from '@tensorflow/tfjs';

export class EntropyTuner {
    constructor(actionDim, targetEntropy = null, alpha = 0.2, learningRate = 3e-4) {
        this.actionDim = actionDim;
        // Target entropy: -dim(A) for continuous actions
        this.targetEntropy = targetEntropy !== null ? targetEntropy : -actionDim;
        
        // Log alpha for numerical stability
        this.logAlpha = tf.variable(tf.scalar(Math.log(alpha)));
        this.alpha = alpha;
        
        this.learningRate = learningRate;
        
        this.updateCount = 0;
        this.alphaHistory = [];
    }
    
    /**
     * Get current alpha value
     * @returns {number} Temperature parameter
     */
    getAlpha() {
        return this.alpha;
    }
    
    /**
     * Update alpha based on entropy deficit
     * @param {tf.Tensor} logProbs - Log probabilities from policy
     * @returns {number} Alpha loss value
     */
    async update(logProbs) {
        // Compute mean log prob
        const logProbsData = await logProbs.data();
        const meanLogProb = logProbsData.reduce((a, b) => a + b, 0) / logProbsData.length;
        
        // Alpha loss: -log(alpha) * (mean_log_prob + target_entropy)
        const entropyDeficit = meanLogProb + this.targetEntropy;
        
        // Simple gradient descent on logAlpha
        const logAlphaData = await this.logAlpha.data();
        const currentLogAlpha = logAlphaData[0];
        
        // Gradient of -logAlpha * entropyDeficit w.r.t logAlpha is -entropyDeficit
        const gradient = -entropyDeficit;
        
        // Apply gradient step
        const newLogAlpha = currentLogAlpha - this.learningRate * gradient;
        
        // Update the variable
        this.logAlpha.assign(tf.scalar(newLogAlpha));
        this.alpha = Math.max(0.01, Math.exp(newLogAlpha));
        
        const loss = -currentLogAlpha * entropyDeficit;
        
        this.updateCount++;
        
        // Record history every 100 updates
        if (this.updateCount % 100 === 0) {
            this.alphaHistory.push({
                step: this.updateCount,
                alpha: this.alpha,
                loss: loss
            });
        }
        
        return loss;
    }
    
    /**
     * Compute entropy for monitoring
     * @param {tf.Tensor} logProbs - Log probabilities
     * @returns {number} Entropy value
     */
    computeEntropy(logProbs) {
        const entropy = tf.tidy(() => {
            return tf.neg(tf.mean(logProbs));
        });
        
        const value = entropy.dataSync()[0];
        entropy.dispose();
        return value;
    }
    
    /**
     * Save tuner state
     * @returns {Object} Serializable state
     */
    save() {
        return {
            actionDim: this.actionDim,
            targetEntropy: this.targetEntropy,
            alpha: this.alpha,
            logAlpha: Array.from(this.logAlpha.dataSync()),
            learningRate: this.learningRate,
            updateCount: this.updateCount,
            alphaHistory: this.alphaHistory
        };
    }
    
    /**
     * Load tuner state
     * @param {Object} data - Saved state
     */
    load(data) {
        this.actionDim = data.actionDim;
        this.targetEntropy = data.targetEntropy;
        this.alpha = data.alpha;
        this.logAlpha = tf.variable(tf.tensor(data.logAlpha));
        this.learningRate = data.learningRate;
        this.updateCount = data.updateCount;
        this.alphaHistory = data.alphaHistory || [];
    }
    
    /**
     * Get statistics for logging
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            alpha: this.alpha,
            targetEntropy: this.targetEntropy,
            updateCount: this.updateCount
        };
    }
    
    dispose() {
        if (this.logAlpha) {
            this.logAlpha.dispose();
        }
    }
}

/**
 * Fixed Alpha (no automatic tuning)
 * Use this if you want constant temperature
 */
export class FixedAlpha {
    constructor(alpha = 0.2) {
        this.alpha = alpha;
        this.targetEntropy = null;
    }
    
    getAlpha() {
        return this.alpha;
    }
    
    async update() {
        return 0; // No update
    }
    
    computeEntropy() {
        return 0;
    }
    
    save() {
        return { alpha: this.alpha };
    }
    
    load(data) {
        this.alpha = data.alpha;
    }
    
    getStats() {
        return { alpha: this.alpha };
    }
    
    dispose() {}
}

export default { EntropyTuner, FixedAlpha };
