/**
 * index.js - Main entry point for FearDataGen
 * Export everything from one place
 */

// Core data collection
export { FearDataGen } from './feardatagen.js';

// All sub-modules (re-exported from feardatagen.js)
export {
    // Data collection
    FearDataCollector,
    EventType,
    
    // Labeling
    TrajectoryLabeler,
    ActionType,
    ScenarioType,
    
    // Validation
    TrajectoryValidator,
    
    // Features
    FeatureEngineer,
    
    // Export
    DataExporter,
    
    // Seeds & Determinism
    SeedManager,
    StateHasher,
    DeterminismValidator,
    
    // Balancing
    DatasetAutoBalancer,
    SimpleBalancer,
    
    // Dashboard
    DataDashboard,
    ConsoleDashboard,
    
    // Testing
    DeterminismTestSuite,
    FearDataGenIntegrationTest,
    runDeterminismTests,
    runIntegrationTests,
    quickDeterminismCheck,
    
    // Tauri Desktop
    TauriExporter,
    isTauri,
    getExporter,
    getTauriExporter,
    
    // Headless mode
    HeadlessFearTester,
    runBatchTest,
    parseHeadlessArgs,
    
    // Debug
    diagnoseIssues,
    diagnoseTauriIssues,
    applyFixes,
    validateSimulation,
    logDebugInfo,
    setupErrorMonitoring
} from './feardatagen.js';

// Simulation integration helpers
export {
    initDataCollection,
    updateDataCollection,
    onAgentDeath,
    exportData,
    exportDataNative,
    openExportDirectory,
    getDataStats,
    getDashboardData,
    logSampleTrajectory
} from './simulation-integration.js';

// Performance & Profiling
export { profiler, instrumentSimulation } from './profiler.js';
export { diagnoseSimulationPerformance, startPerformanceMonitoring } from './diagnose-performance.js';
export { PerformanceMonitor, diagnosePerformance } from './performance-monitor.js';

// Version
export const VERSION = '2.0.0';
export const NAME = 'FearDataGen';
