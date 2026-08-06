/**
 * headless-mode.js - Run Fear AI testing without UI
 * For batch testing and automated data collection
 */

import { FearDataGen } from './feardatagen.js';
import { DatasetAutoBalancer } from './autobalancer.js';

/**
 * HeadlessFearTester - Run simulations without UI
 */
export class HeadlessFearTester {
    constructor(simulation, config = {}) {
        this.sim = simulation;
        this.config = {
            targetTrajectories: config.targetTrajectories || 1000,
            maxDuration: config.maxDuration || 3600, // 1 hour
            autoExport: config.autoExport ?? true,
            exportInterval: config.exportInterval || 500,
            logProgress: config.logProgress ?? true,
            ...config
        };
        
        this.dataGen = new FearDataGen(simulation, {
            autoExport: false, // We handle this manually
            enableBalancer: true,
            enableDashboard: false, // No UI
            minQuality: 0.7
        });
        
        this.balancer = new DatasetAutoBalancer(simulation, this.dataGen);
        
        this.startTime = null;
        this.isRunning = false;
        this.lastExportCount = 0;
        
        this.stats = {
            batchesRun: 0,
            totalTrajectories: 0,
            startTime: null,
            endTime: null
        };
    }
    
    /**
     * Initialize and start headless testing
     */
    async initialize(worldSeed, scenarioSeed) {
        this.dataGen.initialize(worldSeed, scenarioSeed);
        console.log('[Headless] Initialized with seeds:', worldSeed, scenarioSeed);
        return this;
    }
    
    /**
     * Run headless simulation until target reached
     */
    async run() {
        if (this.isRunning) {
            console.error('[Headless] Already running');
            return;
        }
        
        this.isRunning = true;
        this.startTime = Date.now();
        this.stats.startTime = new Date().toISOString();
        
        console.log('[Headless] Starting batch test...');
        console.log(`[Headless] Target: ${this.config.targetTrajectories} trajectories`);
        console.log(`[Headless] Max duration: ${this.config.maxDuration}s`);
        
        // Main loop
        const runLoop = () => {
            if (!this.isRunning) return;
            
            // Update simulation
            this.sim.update();
            
            // Update data collection
            this.dataGen.update();
            
            // Update balancer
            this.balancer.update();
            
            // Check progress
            const stats = this.dataGen.getStats();
            const elapsed = (Date.now() - this.startTime) / 1000;
            
            // Log progress
            if (this.config.logProgress && stats.totalValid % 50 === 0) {
                const rate = stats.collectionRate?.toFixed(1) || 0;
                const remaining = Math.max(0, this.config.targetTrajectories - stats.totalValid);
                console.log(`[Headless] Progress: ${stats.totalValid}/${this.config.targetTrajectories} ` +
                           `(${rate}/min) - ${remaining} remaining`);
            }
            
            // Auto-export
            if (this.config.autoExport && 
                stats.totalValid - this.lastExportCount >= this.config.exportInterval) {
                this._doExport();
                this.lastExportCount = stats.totalValid;
            }
            
            // Check completion
            if (stats.totalValid >= this.config.targetTrajectories) {
                console.log('[Headless] Target reached!');
                this.stop();
                return;
            }
            
            // Check timeout
            if (elapsed >= this.config.maxDuration) {
                console.log('[Headless] Max duration reached');
                this.stop();
                return;
            }
            
            // Continue loop
            requestAnimationFrame(runLoop);
        };
        
        // Start loop
        runLoop();
        
        // Return promise that resolves when done
        return new Promise((resolve) => {
            const checkDone = setInterval(() => {
                if (!this.isRunning) {
                    clearInterval(checkDone);
                    resolve(this.getResults());
                }
            }, 100);
        });
    }
    
    /**
     * Stop headless testing
     */
    stop() {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        this.stats.endTime = new Date().toISOString();
        
        console.log('[Headless] Stopping...');
        
        // Final export
        if (this.config.autoExport) {
            this._doExport();
        }
        
        // Print results
        const results = this.getResults();
        console.log('\n[Headless] Results:');
        console.log('==================');
        console.log(`Trajectories: ${results.trajectories}`);
        console.log(`Duration: ${results.duration}s`);
        console.log(`Rate: ${results.rate}/min`);
        console.log(`Balance Score: ${results.balanceScore}%`);
        console.log('==================\n');
    }
    
    /**
     * Do export
     */
    async _doExport() {
        console.log('[Headless] Exporting...');
        try {
            const result = await this.dataGen.export();
            console.log('[Headless] Export complete:', result);
        } catch (error) {
            console.error('[Headless] Export failed:', error);
        }
    }
    
    /**
     * Get current results
     */
    getResults() {
        const stats = this.dataGen.getStats();
        const balance = this.dataGen.getBalanceInfo();
        const elapsed = this.startTime ? (Date.now() - this.startTime) / 1000 : 0;
        
        return {
            trajectories: stats.totalValid,
            duration: elapsed.toFixed(0),
            rate: ((stats.totalValid / (elapsed / 60)) || 0).toFixed(1),
            balanceScore: (this.balancer.stats.lastBalanceScore * 100).toFixed(1),
            scenarios: balance.scenarios,
            outcomes: balance.outcomes,
            startTime: this.stats.startTime,
            endTime: this.stats.endTime
        };
    }
    
    /**
     * Get current stats (for monitoring)
     */
    getStats() {
        return this.dataGen.getStats();
    }
}

/**
 * Quick batch test function
 */
export async function runBatchTest(simulation, targetTrajectories = 500, maxDuration = 1800) {
    const tester = new HeadlessFearTester(simulation, {
        targetTrajectories,
        maxDuration,
        autoExport: true,
        logProgress: true
    });
    
    // Generate random seeds
    const worldSeed = Math.floor(Math.random() * 100000);
    const scenarioSeed = Math.floor(Math.random() * 100000);
    
    await tester.initialize(worldSeed, scenarioSeed);
    return await tester.run();
}

/**
 * CLI-style argument parsing for headless mode
 */
export function parseHeadlessArgs() {
    const args = {
        target: 1000,
        duration: 3600,
        worldSeed: null,
        scenarioSeed: null,
        outputDir: './data'
    };
    
    // Parse from URL or global config
    if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        args.target = parseInt(url.searchParams.get('target')) || args.target;
        args.duration = parseInt(url.searchParams.get('duration')) || args.duration;
        args.worldSeed = parseInt(url.searchParams.get('worldSeed')) || null;
        args.scenarioSeed = parseInt(url.searchParams.get('scenarioSeed')) || null;
        args.outputDir = url.searchParams.get('outputDir') || args.outputDir;
    }
    
    return args;
}
