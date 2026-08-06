/**
 * autobalancer.js - Automatic dataset balancing system
 * Monitors dataset distribution and adjusts simulation parameters
 */

import { ScenarioType } from './trajectorylabeler.js';

/**
 * DatasetAutoBalancer - Ensures even distribution across scenarios, outcomes, fear states
 */
export class DatasetAutoBalancer {
    constructor(simulation, fearDataGen, config = {}) {
        this.sim = simulation;
        this.dataGen = fearDataGen;
        
        this.config = {
            // Target distributions (percentages)
            targetScenarioBalance: config.targetScenarioBalance || {
                'AMBUSH': 15,
                'CHASE': 20,
                'GROUP_PANIC': 15,
                'TRAP': 10,
                'SAFE_HAVEN_RUSH': 15,
                'FALSE_ALARM': 10,
                'PATROL': 15
            },
            targetOutcomeBalance: config.targetOutcomeBalance || {
                survived: 60,
                died: 40
            },
            targetFearBandBalance: config.targetFearBandBalance || {
                calm: 20,
                alert: 30,
                anxious: 25,
                panic: 25
            },
            
            // Adjustment thresholds
            imbalanceThreshold: config.imbalanceThreshold || 0.15, // 15% deviation triggers adjustment
            minSamplesBeforeAdjust: config.minSamplesBeforeAdjust || 50,
            adjustmentCooldown: config.adjustmentCooldown || 300, // 5 seconds at 60fps
            
            // Spawn controls
            maxPredators: config.maxPredators || 10,
            minPredators: config.minPredators || 1,
            ...config
        };
        
        // Current state
        this.currentDistribution = {
            scenarios: {},
            outcomes: {},
            fearBands: {},
            soloVsGroup: { solo: 0, group: 0 }
        };
        
        // Adjustment state
        this.lastAdjustmentTick = 0;
        this.adjustmentQueue = [];
        this.pendingSpawns = [];
        
        // Statistics
        this.stats = {
            totalAdjustments: 0,
            scenariosAdjusted: {},
            lastBalanceScore: 0
        };
    }
    
    /**
     * Update balancing - call each frame
     */
    update() {
        if (!this.dataGen) return;
        
        const currentTick = this.sim.frameCount;
        const balance = this.dataGen.getBalanceInfo();
        
        // Update distribution tracking
        this._updateDistribution(balance);
        
        // Check if we should adjust
        if (currentTick - this.lastAdjustmentTick < this.config.adjustmentCooldown) {
            return;
        }
        
        if (balance.total < this.config.minSamplesBeforeAdjust) {
            return;
        }
        
        // Calculate balance score
        const balanceScore = this._calculateBalanceScore();
        this.stats.lastBalanceScore = balanceScore;
        
        // If imbalanced, trigger adjustments
        if (balanceScore < 0.85) { // Less than 85% balanced
            this._triggerAdjustments(balance);
            this.lastAdjustmentTick = currentTick;
            this.stats.totalAdjustments++;
        }
    }
    
    /**
     * Update internal distribution tracking
     */
    _updateDistribution(balance) {
        this.currentDistribution.scenarios = balance.scenarios || {};
        this.currentDistribution.outcomes = balance.outcomes || {};
        this.currentDistribution.fearBands = balance.fearBands || {};
    }
    
    /**
     * Calculate overall balance score (0-1)
     */
    _calculateBalanceScore() {
        let totalScore = 0;
        let categories = 0;
        
        // Scenario balance
        const scenarioScore = this._calculateCategoryScore(
            this.currentDistribution.scenarios,
            this.config.targetScenarioBalance
        );
        totalScore += scenarioScore;
        categories++;
        
        // Outcome balance
        const outcomeScore = this._calculateCategoryScore(
            this.currentDistribution.outcomes,
            this.config.targetOutcomeBalance
        );
        totalScore += outcomeScore;
        categories++;
        
        // Fear band balance
        const fearBandScore = this._calculateCategoryScore(
            this.currentDistribution.fearBands,
            this.config.targetFearBandBalance
        );
        totalScore += fearBandScore;
        categories++;
        
        return totalScore / categories;
    }
    
    /**
     * Calculate balance score for a category
     */
    _calculateCategoryScore(actual, targets) {
        const total = Object.values(actual).reduce((a, b) => a + b, 0);
        if (total === 0) return 0;
        
        let score = 0;
        let targetKeys = Object.keys(targets);
        
        for (const key of targetKeys) {
            const actualCount = actual[key] || 0;
            const actualPct = actualCount / total;
            const targetPct = targets[key] / 100;
            
            // Score based on how close to target
            const diff = Math.abs(actualPct - targetPct);
            const keyScore = Math.max(0, 1 - (diff / this.config.imbalanceThreshold));
            score += keyScore;
        }
        
        return score / targetKeys.length;
    }
    
    /**
     * Trigger adjustments for underrepresented categories
     */
    _triggerAdjustments(balance) {
        const adjustments = [];
        
        // Find underrepresented scenarios
        const total = balance.total;
        
        for (const [scenario, targetPct] of Object.entries(this.config.targetScenarioBalance)) {
            const actualCount = balance.scenarios[scenario] || 0;
            const actualPct = (actualCount / total) * 100;
            const diff = targetPct - actualPct;
            
            if (diff > this.config.imbalanceThreshold * 100) {
                adjustments.push({
                    type: 'scenario',
                    target: scenario,
                    priority: diff,
                    action: this._getScenarioAction(scenario)
                });
            }
        }
        
        // Find underrepresented outcomes
        for (const [outcome, targetPct] of Object.entries(this.config.targetOutcomeBalance)) {
            const actualCount = balance.outcomes[outcome === 'survived' ? 'survived' : 'died'] || 0;
            const actualPct = (actualCount / total) * 100;
            const diff = targetPct - actualPct;
            
            if (diff > this.config.imbalanceThreshold * 100) {
                adjustments.push({
                    type: 'outcome',
                    target: outcome,
                    priority: diff,
                    action: this._getOutcomeAction(outcome)
                });
            }
        }
        
        // Sort by priority and apply top adjustments
        adjustments.sort((a, b) => b.priority - a.priority);
        
        // Apply top 2 adjustments
        for (const adjustment of adjustments.slice(0, 2)) {
            this._applyAdjustment(adjustment);
        }
    }
    
    /**
     * Get action for scenario type
     */
    _getScenarioAction(scenario) {
        const actions = {
            'AMBUSH': { spawnPredator: true, predatorType: 'STALKER', position: 'near' },
            'CHASE': { spawnPredator: true, predatorType: 'TANK', position: 'far' },
            'GROUP_PANIC': { spawnPredator: true, predatorType: 'SWARMER', count: 3 },
            'TRAP': { spawnPredator: true, predatorType: 'STALKER', cornerTrap: true },
            'SAFE_HAVEN_RUSH': { spawnPredator: true, predatorType: 'TANK', farFromHaven: true },
            'FALSE_ALARM': { triggerFalseAlarm: true },
            'PATROL': { reduceThreats: true }
        };
        
        return actions[scenario] || {};
    }
    
    /**
     * Get action for outcome type
     */
    _getOutcomeAction(outcome) {
        if (outcome === 'survived') {
            return { addSafeHavens: true, reducePredatorAggression: true };
        } else {
            return { increasePredatorAggression: true, reduceSafeHavens: true };
        }
    }
    
    /**
     * Apply a single adjustment
     */
    _applyAdjustment(adjustment) {
        console.log(`[AutoBalancer] Applying adjustment: ${adjustment.type}=${adjustment.target} (priority: ${adjustment.priority.toFixed(1)}%)`);
        
        const action = adjustment.action;
        
        // Track adjustment
        this.stats.scenariosAdjusted[adjustment.target] = (this.stats.scenariosAdjusted[adjustment.target] || 0) + 1;
        
        // Spawn predator
        if (action.spawnPredator) {
            this._spawnPredatorForScenario(adjustment.target, action);
        }
        
        // Other actions
        if (action.addSafeHavens) {
            this._addSafeHaven();
        }
        
        if (action.reduceThreats) {
            this._reducePredators();
        }
    }
    
    /**
     * Spawn predator to create specific scenario
     */
    _spawnPredatorForScenario(scenario, action) {
        if (!this.sim.predators) return;
        
        // Don't exceed max
        if (this.sim.predators.length >= this.config.maxPredators) {
            // Remove oldest predator
            this.sim.predators.shift();
        }
        
        // Calculate spawn position
        let x, y;
        
        if (action.position === 'near') {
            // Spawn near a random agent
            const agents = this.sim.agents.filter(a => !a.dead);
            if (agents.length > 0) {
                const target = agents[Math.floor(Math.random() * agents.length)];
                const angle = Math.random() * Math.PI * 2;
                const dist = 50 + Math.random() * 50;
                x = target.x + Math.cos(angle) * dist;
                y = target.y + Math.sin(angle) * dist;
            }
        } else if (action.cornerTrap) {
            // Spawn in corner
            const corners = [
                { x: 50, y: 50 },
                { x: this.sim.width - 50, y: 50 },
                { x: 50, y: this.sim.height - 50 },
                { x: this.sim.width - 50, y: this.sim.height - 50 }
            ];
            const corner = corners[Math.floor(Math.random() * corners.length)];
            x = corner.x;
            y = corner.y;
        } else {
            // Random position
            x = Math.random() * this.sim.width;
            y = Math.random() * this.sim.height;
        }
        
        // Clamp to bounds
        x = Math.max(50, Math.min(this.sim.width - 50, x));
        y = Math.max(50, Math.min(this.sim.height - 50, y));
        
        // Spawn
        if (this.sim.spawnPredator) {
            this.sim.spawnPredator(x, y, action.predatorType || 'STALKER');
        }
    }
    
    /**
     * Add a safe haven
     */
    _addSafeHaven() {
        if (!this.sim.safeHavens) return;
        
        // Add safe haven in central area
        const x = this.sim.width * 0.3 + Math.random() * this.sim.width * 0.4;
        const y = this.sim.height * 0.3 + Math.random() * this.sim.height * 0.4;
        
        this.sim.safeHavens.push({
            x, y,
            radius: 80,
            id: `haven_${Date.now()}`
        });
        
        // Limit number of safe havens
        if (this.sim.safeHavens.length > 5) {
            this.sim.safeHavens.shift();
        }
    }
    
    /**
     * Reduce number of predators
     */
    _reducePredators() {
        if (!this.sim.predators) return;
        
        while (this.sim.predators.length > this.config.minPredators) {
            this.sim.predators.pop();
        }
    }
    
    /**
     * Get current balance report
     */
    getBalanceReport() {
        const total = Object.values(this.currentDistribution.scenarios).reduce((a, b) => a + b, 0);
        
        const report = {
            overallScore: (this.stats.lastBalanceScore * 100).toFixed(1) + '%',
            totalSamples: total,
            scenarios: {},
            outcomes: {},
            recommendations: []
        };
        
        // Scenario breakdown
        for (const [scenario, target] of Object.entries(this.config.targetScenarioBalance)) {
            const actual = this.currentDistribution.scenarios[scenario] || 0;
            const actualPct = total > 0 ? (actual / total * 100).toFixed(1) : 0;
            const status = Math.abs(parseFloat(actualPct) - target) < this.config.imbalanceThreshold * 100 ? '✓' : '⚠';
            
            report.scenarios[scenario] = {
                target: target + '%',
                actual: actualPct + '%',
                count: actual,
                status
            };
            
            if (status === '⚠') {
                report.recommendations.push(`Need more ${scenario} scenarios`);
            }
        }
        
        return report;
    }
    
    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this.stats,
            currentDistribution: this.currentDistribution,
            totalAdjustments: this.stats.totalAdjustments
        };
    }
    
    /**
     * Manually trigger scenario
     */
    triggerScenario(scenarioType) {
        const action = this._getScenarioAction(scenarioType);
        this._spawnPredatorForScenario(scenarioType, action);
        console.log(`[AutoBalancer] Manually triggered scenario: ${scenarioType}`);
    }
    
    /**
     * Reset balancer
     */
    reset() {
        this.currentDistribution = {
            scenarios: {},
            outcomes: {},
            fearBands: {},
            soloVsGroup: { solo: 0, group: 0 }
        };
        this.lastAdjustmentTick = 0;
        this.adjustmentQueue = [];
        this.stats = {
            totalAdjustments: 0,
            scenariosAdjusted: {},
            lastBalanceScore: 0
        };
    }
}

/**
 * Simple threshold-based balancer (lighter weight alternative)
 */
export class SimpleBalancer {
    constructor(simulation, config = {}) {
        this.sim = simulation;
        this.config = {
            targetScenarioRatios: config.targetScenarioRatios || {
                'AMBUSH': 0.15,
                'CHASE': 0.20,
                'GROUP_PANIC': 0.15,
                'TRAP': 0.10,
                'SAFE_HAVEN_RUSH': 0.15,
                'FALSE_ALARM': 0.10,
                'PATROL': 0.15
            },
            checkInterval: config.checkInterval || 600, // 10 seconds
            ...config
        };
        
        this.frameCounter = 0;
        this.scenarioCounts = {};
    }
    
    update(trajectoryLabels) {
        this.frameCounter++;
        
        if (this.frameCounter % this.config.checkInterval !== 0) return;
        
        // Count scenarios from recent labels
        const recentLabels = trajectoryLabels.slice(-100);
        const counts = {};
        
        for (const label of recentLabels) {
            const scenario = label?.scenario?.type || 'UNKNOWN';
            counts[scenario] = (counts[scenario] || 0) + 1;
        }
        
        this.scenarioCounts = counts;
        
        // Find most underrepresented
        const total = recentLabels.length;
        if (total < 20) return; // Need enough samples
        
        let mostUnderrepresented = null;
        let biggestGap = 0;
        
        for (const [scenario, targetRatio] of Object.entries(this.config.targetScenarioRatios)) {
            const actualCount = counts[scenario] || 0;
            const actualRatio = actualCount / total;
            const gap = targetRatio - actualRatio;
            
            if (gap > biggestGap) {
                biggestGap = gap;
                mostUnderrepresented = scenario;
            }
        }
        
        // Trigger if gap is significant
        if (mostUnderrepresented && biggestGap > 0.1) {
            console.log(`[SimpleBalancer] Triggering ${mostUnderrepresented} (gap: ${(biggestGap * 100).toFixed(1)}%)`);
            this._triggerScenario(mostUnderrepresented);
        }
    }
    
    _triggerScenario(scenario) {
        // Simple spawn logic
        const scenarios = {
            'AMBUSH': () => this._spawnPredator('STALKER', 'near'),
            'CHASE': () => this._spawnPredator('TANK', 'far'),
            'GROUP_PANIC': () => this._spawnMultiplePredators(3),
            'TRAP': () => this._spawnPredator('STALKER', 'corner'),
            'SAFE_HAVEN_RUSH': () => this._spawnPredator('TANK', 'far')
        };
        
        const action = scenarios[scenario];
        if (action) action();
    }
    
    _spawnPredator(type, position) {
        if (!this.sim.spawnPredator) return;
        
        let x, y;
        
        if (position === 'near' && this.sim.agents.length > 0) {
            const agent = this.sim.agents[Math.floor(Math.random() * this.sim.agents.length)];
            x = agent.x + (Math.random() - 0.5) * 100;
            y = agent.y + (Math.random() - 0.5) * 100;
        } else if (position === 'corner') {
            x = Math.random() > 0.5 ? 50 : this.sim.width - 50;
            y = Math.random() > 0.5 ? 50 : this.sim.height - 50;
        } else {
            x = Math.random() * this.sim.width;
            y = Math.random() * this.sim.height;
        }
        
        this.sim.spawnPredator(x, y, type);
    }
    
    _spawnMultiplePredators(count) {
        for (let i = 0; i < count; i++) {
            this._spawnPredator('SWARMER', 'random');
        }
    }
}
