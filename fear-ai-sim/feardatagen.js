/**
 * FearDataGen - Main integration class
 * Coordinates all data collection, labeling, validation, and export
 */

import { FearDataCollector, EventType } from './feardatacollector.js';
import { TrajectoryLabeler } from './trajectorylabeler.js';
import { TrajectoryValidator } from './trajectoryvalidator.js';
import { FeatureEngineer } from './featureengineer.js';
import { DataExporter } from './dataexporter.js';
import { SeedManager } from './seedmanager.js';
import { DatasetAutoBalancer, SimpleBalancer } from './autobalancer.js';
import { DataDashboard, ConsoleDashboard } from './datadashboard.js';

export class FearDataGen {
    constructor(simulation, config = {}) {
        this.sim = simulation;
        this.config = {
            autoExport: config.autoExport ?? false,
            exportInterval: config.exportInterval ?? 100, // Trajectories
            minTrajectoryQuality: config.minQuality ?? 0.7,
            enableBalancer: config.enableBalancer ?? true,
            enableDashboard: config.enableDashboard ?? true,
            dashboardType: config.dashboardType ?? 'visual', // 'visual' or 'console'
            ...config
        };
        
        // Components
        this.collector = new FearDataCollector(simulation);
        this.labeler = new TrajectoryLabeler();
        this.validator = new TrajectoryValidator();
        this.featureEngineer = new FeatureEngineer();
        this.exporter = new DataExporter(config.exportConfig);
        
        // Balancer
        this.balancer = null;
        if (this.config.enableBalancer) {
            this.balancer = new DatasetAutoBalancer(simulation, this, config.balancerConfig);
        }
        
        // Dashboard
        this.dashboard = null;
        if (this.config.enableDashboard) {
            if (this.config.dashboardType === 'console') {
                this.dashboard = new ConsoleDashboard(this, this.balancer);
                this.dashboard.start();
            } else {
                this.dashboard = new DataDashboard(this, this.balancer);
                this.dashboard.init();
            }
        }
        
        // Storage
        this.trajectories = [];
        this.labels = [];
        this.features = [];
        this.maxStored = 10000;
        
        // Statistics
        this.stats = {
            totalCollected: 0,
            totalValid: 0,
            totalExported: 0,
            startTime: Date.now()
        };
        
        // Auto-export timer
        this.lastExportCount = 0;
    }
    
    /**
     * Initialize with seeds for deterministic replay
     */
    initialize(worldSeed, scenarioSeed) {
        this.seedManager = new SeedManager(worldSeed, scenarioSeed);
        console.log('[FearDataGen] Initialized with seeds:', this.seedManager.getSeeds());
        return this.seedManager.getSeeds();
    }
    
    /**
     * Main update - call every simulation frame
     */
    update() {
        // Update collector (samples at 10fps internally)
        this.collector.update();
        
        // Process completed trajectories
        this._processCompletedTrajectories();
        
        // Update balancer
        if (this.balancer) {
            this.balancer.update();
        }
        
        // Auto-export if enabled
        if (this.config.autoExport && 
            this.trajectories.length - this.lastExportCount >= this.config.exportInterval) {
            this.export();
            this.lastExportCount = this.trajectories.length;
        }
    }
    
    /**
     * Process completed trajectories from collector
     */
    _processCompletedTrajectories() {
        const completed = this.collector.getCompletedTrajectories();
        
        for (const traj of completed) {
            // Skip if already processed
            if (this.trajectories.find(t => t.id === traj.id)) continue;
            
            this.stats.totalCollected++;
            
            // Add seeds and versions
            traj.seeds = this.seedManager?.getSeeds() || {};
            traj.versions = {
                sim: '2.0.0',
                feature: 'v1',
                label: 'v1'
            };
            
            // Label trajectory
            const labels = this.labeler.labelTrajectory(traj);
            
            // Check quality
            if (!labels || labels.quality.labelConfidence < this.config.minTrajectoryQuality) {
                continue; // Skip low quality
            }
            
            // Validate
            const validation = this.validator.validate(traj);
            if (!validation.valid) {
                console.log('[FearDataGen] Rejected invalid trajectory:', validation.errors);
                continue;
            }
            
            // Engineer features
            const features = this.featureEngineer.engineerFeatures(traj, labels);
            
            // Store
            this.trajectories.push(traj);
            this.labels.push(labels);
            this.features.push(features);
            
            this.stats.totalValid++;
            
            // Trim if too many
            if (this.trajectories.length > this.maxStored) {
                this.trajectories.shift();
                this.labels.shift();
                this.features.shift();
            }
        }
    }
    
    /**
     * Export all collected data
     */
    async export() {
        if (this.trajectories.length === 0) {
            console.log('[FearDataGen] No trajectories to export');
            return null;
        }
        
        console.log(`[FearDataGen] Exporting ${this.trajectories.length} trajectories...`);
        
        const results = await this.exporter.exportAll(
            this.trajectories,
            this.labels,
            this.features
        );
        
        this.stats.totalExported += this.trajectories.length;
        
        console.log('[FearDataGen] Export complete:', results);
        
        return results;
    }
    
    /**
     * Export train/val/test split
     */
    async exportSplit(trainRatio = 0.7, valRatio = 0.15) {
        const testRatio = 1 - trainRatio - valRatio;
        
        return await this.exporter.exportSplit(
            this.trajectories,
            this.labels,
            this.features,
            [trainRatio, valRatio, testRatio]
        );
    }
    
    /**
     * Get current statistics
     */
    getStats() {
        const collectorStats = this.collector.getStats();
        
        return {
            ...this.stats,
            ...collectorStats,
            storedTrajectories: this.trajectories.length,
            elapsedTime: (Date.now() - this.stats.startTime) / 1000,
            collectionRate: this.stats.totalValid / ((Date.now() - this.stats.startTime) / 1000 / 60)
        };
    }
    
    /**
     * Get dataset balance info
     */
    getBalanceInfo() {
        const scenarioCounts = {};
        const outcomeCounts = { survived: 0, died: 0 };
        const fearBandCounts = { calm: 0, alert: 0, anxious: 0, panic: 0 };
        
        for (const label of this.labels) {
            // Scenario balance
            const scenario = label.scenario?.type || 'UNKNOWN';
            scenarioCounts[scenario] = (scenarioCounts[scenario] || 0) + 1;
            
            // Outcome balance
            if (label.outcome?.survived) {
                outcomeCounts.survived++;
            } else {
                outcomeCounts.died++;
            }
            
            // Fear band
            const peakFear = label.outcome?.peakFear || 0;
            if (peakFear < 0.2) fearBandCounts.calm++;
            else if (peakFear < 0.5) fearBandCounts.alert++;
            else if (peakFear < 0.7) fearBandCounts.anxious++;
            else fearBandCounts.panic++;
        }
        
        return {
            total: this.labels.length,
            scenarios: scenarioCounts,
            outcomes: outcomeCounts,
            fearBands: fearBandCounts
        };
    }
    
    /**
     * Clear all stored data
     */
    clear() {
        this.trajectories = [];
        this.labels = [];
        this.features = [];
        this.collector.clear();
        this.validator.seenHashes.clear();
        
        if (this.balancer) {
            this.balancer.reset();
        }
        
        this.stats = {
            totalCollected: 0,
            totalValid: 0,
            totalExported: 0,
            startTime: Date.now()
        };
    }
    
    /**
     * Destroy and cleanup
     */
    destroy() {
        if (this.dashboard) {
            this.dashboard.destroy();
            this.dashboard = null;
        }
        
        this.clear();
    }
    
    /**
     * Get a sample trajectory for debugging
     */
    getSampleTrajectory(index = 0) {
        if (index >= this.trajectories.length) return null;
        
        return {
            trajectory: this.trajectories[index],
            labels: this.labels[index],
            features: this.features[index]
        };
    }
    
    /**
     * Get trajectories by scenario type
     */
    getTrajectoriesByScenario(scenarioType) {
        const indices = [];
        for (let i = 0; i < this.labels.length; i++) {
            if (this.labels[i].scenario?.type === scenarioType) {
                indices.push(i);
            }
        }
        
        return indices.map(i => ({
            trajectory: this.trajectories[i],
            labels: this.labels[i]
        }));
    }
    
    /**
     * Handle agent death event
     */
    onAgentDeath(agent, cause) {
        this.collector.onAgentDeath(agent, cause);
    }
}

// Export all components
export { FearDataCollector, EventType } from './feardatacollector.js';
export { TrajectoryLabeler, ActionType, ScenarioType } from './trajectorylabeler.js';
export { TrajectoryValidator } from './trajectoryvalidator.js';
export { FeatureEngineer } from './featureengineer.js';
export { DataExporter } from './dataexporter.js';
export { SeedManager } from './seedmanager.js';
export { StateHasher, DeterminismValidator } from './statehasher.js';
export { DatasetAutoBalancer, SimpleBalancer } from './autobalancer.js';
export { DataDashboard, ConsoleDashboard } from './datadashboard.js';
export { DeterminismTestSuite, FearDataGenIntegrationTest, runDeterminismTests, runIntegrationTests, quickDeterminismCheck } from './determinism-tests.js';

// Tauri Desktop App exports
export { TauriExporter, isTauri, getExporter, getTauriExporter } from './tauri-bridge.js';
export { HeadlessFearTester, runBatchTest, parseHeadlessArgs } from './headless-mode.js';

// Debug utilities
export { diagnoseIssues, diagnoseTauriIssues, applyFixes, validateSimulation, logDebugInfo, setupErrorMonitoring } from './feardatagen-debug.js';
