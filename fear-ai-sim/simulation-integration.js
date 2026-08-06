/**
 * simulation-integration.js - Integration of FearDataGen with existing simulation
 * 
 * Add this to your main simulation.js file or import and use
 */

import { FearDataGen } from './feardatagen.js';
import { getTauriExporter, isTauri } from './tauri-bridge.js';

/**
 * Initialize data collection in simulation
 * Call this in your Simulation constructor
 */
export async function initDataCollection(simulation, options = {}) {
    // Create FearDataGen instance
    simulation.dataGen = new FearDataGen(simulation, {
        autoExport: options.autoExport ?? false,
        exportInterval: options.exportInterval ?? 100,
        minQuality: options.minQuality ?? 0.7,
        enableBalancer: options.enableBalancer ?? true,
        enableDashboard: options.enableDashboard ?? true,
        dashboardType: options.dashboardType ?? 'visual',
        balancerConfig: options.balancerConfig || {},
        exportConfig: {
            outputDir: options.outputDir || './data'
        }
    });
    
    // Initialize with seeds
    const seeds = simulation.dataGen.initialize(
        options.worldSeed,
        options.scenarioSeed
    );
    
    // Initialize Tauri bridge if in desktop app
    if (isTauri()) {
        simulation.tauriExporter = getTauriExporter();
        await simulation.tauriExporter.initialize(options.worldSeed, options.scenarioSeed);
        
        // Get system info
        const sysInfo = await simulation.tauriExporter.getSystemInfo();
        console.log('[Simulation] Running as desktop app:', sysInfo);
    }
    
    console.log('[Simulation] FearDataGen initialized:', seeds);
    
    return simulation.dataGen;
}

/**
 * Export data using Tauri native file system (if available)
 */
export async function exportDataNative(simulation, format = 'jsonl') {
    if (!simulation.dataGen) {
        console.error('[Simulation] Data collection not initialized');
        return null;
    }
    
    // Use Tauri exporter if available
    if (simulation.tauriExporter) {
        const trajectories = simulation.dataGen.trajectories;
        const labels = simulation.dataGen.labels;
        
        switch (format) {
            case 'jsonl':
                return await simulation.tauriExporter.exportTrajectoriesJSONL(
                    trajectories,
                    `trajectories_${Date.now()}.jsonl`
                );
            case 'csv':
                const summaries = labels.map((l, i) => ({
                    id: trajectories[i]?.id || i,
                    scenario: l.scenario?.type || 'UNKNOWN',
                    survived: l.outcome?.survived ? '1' : '0',
                    peakFear: (l.outcome?.peakFear || 0).toFixed(3),
                    quality: (l.quality?.labelConfidence || 0).toFixed(3)
                }));
                return await simulation.tauriExporter.exportSummaryCSV(
                    summaries,
                    `summary_${Date.now()}.csv`
                );
            case 'zip':
                return await simulation.tauriExporter.compressExports();
            default:
                return await simulation.dataGen.export();
        }
    }
    
    // Fallback to browser export
    return await simulation.dataGen.export();
}

/**
 * Open export directory in file manager (Tauri only)
 */
export async function openExportDirectory(simulation) {
    if (simulation.tauriExporter) {
        return await simulation.tauriExporter.openExportDirectory();
    }
    console.log('[Simulation] Open directory only available in desktop app');
    return { success: false };
}

/**
 * Update data collection each frame
 * Call this at the end of your simulation.update() method
 */
export function updateDataCollection(simulation) {
    if (simulation.dataGen) {
        simulation.dataGen.update();
    }
}

/**
 * Handle agent death for data collection
 * Call this when an agent dies
 */
export function onAgentDeath(simulation, agent, cause) {
    if (simulation.dataGen) {
        simulation.dataGen.onAgentDeath(agent, cause);
    }
}

/**
 * Export collected data
 * Call this on button press or auto-export trigger
 */
export async function exportData(simulation, options = {}) {
    if (!simulation.dataGen) {
        console.error('[Simulation] Data collection not initialized');
        return null;
    }
    
    if (options.split) {
        return await simulation.dataGen.exportSplit(
            options.trainRatio ?? 0.7,
            options.valRatio ?? 0.15
        );
    }
    
    return await simulation.dataGen.export();
}

/**
 * Get data collection statistics
 * For display in dashboard
 */
export function getDataStats(simulation) {
    if (!simulation.dataGen) return null;
    
    const stats = simulation.dataGen.getStats();
    const balance = simulation.dataGen.getBalanceInfo();
    
    return {
        ...stats,
        balance
    };
}

/**
 * Quick integration example for simulation.js
 * 
 * In your Simulation class:
 * 
 * 1. Import at top:
 *    import { initDataCollection, updateDataCollection, onAgentDeath, exportData } from './simulation-integration.js';
 * 
 * 2. In constructor, add:
 *    initDataCollection(this, {
 *        worldSeed: 12345,
 *        scenarioSeed: 67890,
 *        autoExport: false
 *    });
 * 
 * 3. In update() method, at end add:
 *    updateDataCollection(this);
 * 
 * 4. Where agents die, add:
 *    onAgentDeath(this, agent, 'predator');
 * 
 * 5. For export button:
 *    async exportData() {
 *        const result = await exportData(this);
 *        console.log('Exported:', result);
 *    }
 */

/**
 * Dashboard data provider
 * Returns real-time stats for UI display
 */
export function getDashboardData(simulation) {
    const stats = getDataStats(simulation);
    if (!stats) return null;
    
    return {
        // Collection stats
        trajectoriesCollected: stats.storedTrajectories,
        totalSamples: stats.totalSamples,
        totalEvents: stats.totalEvents,
        collectionRate: stats.collectionRate?.toFixed(2) + '/min',
        
        // Quality stats
        validTrajectories: stats.totalValid,
        validityRate: ((stats.totalValid / stats.totalCollected) * 100)?.toFixed(1) + '%',
        
        // Balance info
        scenarioBreakdown: stats.balance?.scenarios || {},
        outcomeBreakdown: stats.balance?.outcomes || {},
        fearBandBreakdown: stats.balance?.fearBands || {},
        
        // Memory
        memoryUsageMB: (stats.memoryUsage / (1024 * 1024))?.toFixed(2),
        
        // Timing
        elapsedTime: (stats.elapsedTime / 60)?.toFixed(1) + ' min'
    };
}

/**
 * Debug helper - log sample trajectory
 */
export function logSampleTrajectory(simulation, index = 0) {
    if (!simulation.dataGen) return;
    
    const sample = simulation.dataGen.getSampleTrajectory(index);
    if (!sample) {
        console.log('[DataGen] No trajectories available');
        return;
    }
    
    console.log('=== Sample Trajectory ===');
    console.log('ID:', sample.trajectory.id);
    console.log('Agent:', sample.trajectory.agentId);
    console.log('Event:', sample.trajectory.eventType);
    console.log('Frames:', sample.trajectory.frames.length);
    console.log('Scenario:', sample.labels.scenario?.type);
    console.log('Outcome:', sample.labels.outcome?.survived ? 'Survived' : 'Died');
    console.log('Peak Fear:', sample.labels.outcome?.peakFear?.toFixed(3));
    console.log('Quality:', sample.labels.quality?.labelConfidence?.toFixed(3));
    console.log('========================');
}
