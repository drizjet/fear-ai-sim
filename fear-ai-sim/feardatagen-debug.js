/**
 * feardatagen-debug.js - Common issues and fixes for FearDataGen
 */

/**
 * Check and fix common issues
 */
export function diagnoseIssues(simulation, dataGen) {
    const issues = [];
    
    // Issue 1: Missing spatialHash
    if (!simulation.spatialHash) {
        issues.push({
            issue: 'Missing spatialHash',
            fix: 'FastPerception falling back to linear search (slow)',
            critical: false
        });
    }
    
    // Issue 2: Agents without brain property
    const agentsWithoutBrain = simulation.agents?.filter(a => !a.brain);
    if (agentsWithoutBrain?.length > 0) {
        issues.push({
            issue: `Agents without brain: ${agentsWithoutBrain.length}`,
            fix: 'Check agent initialization - brain is required for fear tracking',
            critical: true
        });
    }
    
    // Issue 3: Predators without required methods
    if (simulation.predators?.length > 0) {
        const pred = simulation.predators[0];
        if (!pred.id) {
            issues.push({
                issue: 'Predators missing id property',
                fix: 'Add id to predator objects for tracking',
                critical: true
            });
        }
    }
    
    // Issue 4: Missing safeHavens array
    if (!simulation.safeHavens) {
        simulation.safeHavens = [];
        issues.push({
            issue: 'Missing safeHavens array',
            fix: 'Initialized empty safeHavens array',
            critical: false
        });
    }
    
    // Issue 5: frameCount not incrementing
    if (typeof simulation.frameCount !== 'number') {
        issues.push({
            issue: 'frameCount is not a number',
            fix: 'Initialize frameCount = 0 in constructor, increment in update()',
            critical: true
        });
    }
    
    // Issue 6: width/height not defined
    if (!simulation.width || !simulation.height) {
        issues.push({
            issue: 'Simulation dimensions not defined',
            fix: 'Set simulation.width and simulation.height',
            critical: true
        });
    }
    
    // Issue 7: agents array issues
    if (!Array.isArray(simulation.agents)) {
        issues.push({
            issue: 'simulation.agents is not an array',
            fix: 'Initialize agents = [] in constructor',
            critical: true
        });
    }
    
    // Issue 8: DataGen not initialized
    if (dataGen && !dataGen.seedManager) {
        issues.push({
            issue: 'FearDataGen not initialized with seeds',
            fix: 'Call dataGen.initialize(worldSeed, scenarioSeed)',
            critical: true
        });
    }
    
    return issues;
}

/**
 * Apply automatic fixes
 */
export function applyFixes(simulation) {
    const fixes = [];
    
    // Fix 1: Ensure safeHavens exists
    if (!simulation.safeHavens) {
        simulation.safeHavens = [];
        fixes.push('Created safeHavens array');
    }
    
    // Fix 2: Ensure frameCount exists
    if (typeof simulation.frameCount !== 'number') {
        simulation.frameCount = 0;
        fixes.push('Initialized frameCount to 0');
    }
    
    // Fix 3: Ensure width/height
    if (!simulation.width) {
        simulation.width = 1000;
        fixes.push('Set default width to 1000');
    }
    if (!simulation.height) {
        simulation.height = 1000;
        fixes.push('Set default height to 1000');
    }
    
    // Fix 4: Ensure agents array
    if (!Array.isArray(simulation.agents)) {
        simulation.agents = [];
        fixes.push('Created agents array');
    }
    
    // Fix 5: Ensure predators array
    if (!Array.isArray(simulation.predators)) {
        simulation.predators = [];
        fixes.push('Created predators array');
    }
    
    return fixes;
}

/**
 * Validate simulation structure
 */
export function validateSimulation(simulation) {
    const required = {
        agents: Array.isArray(simulation.agents),
        predators: Array.isArray(simulation.predators),
        width: typeof simulation.width === 'number',
        height: typeof simulation.height === 'number',
        frameCount: typeof simulation.frameCount === 'number',
        update: typeof simulation.update === 'function'
    };
    
    const missing = Object.entries(required)
        .filter(([_, has]) => !has)
        .map(([name]) => name);
    
    return {
        valid: missing.length === 0,
        missing,
        required
    };
}

/**
 * Log helpful debug info
 */
export function logDebugInfo(simulation, dataGen) {
    console.group('🔍 FearDataGen Debug Info');
    
    // Simulation state
    console.log('Simulation:', {
        agents: simulation.agents?.length || 0,
        predators: simulation.predators?.length || 0,
        frameCount: simulation.frameCount,
        width: simulation.width,
        height: simulation.height
    });
    
    // DataGen state
    if (dataGen) {
        const stats = dataGen.getStats();
        console.log('DataGen Stats:', stats);
        
        const balance = dataGen.getBalanceInfo();
        console.log('Dataset Balance:', balance);
        
        if (dataGen.balancer) {
            console.log('Balancer Report:', dataGen.balancer.getBalanceReport());
        }
    }
    
    // Check for issues
    const issues = diagnoseIssues(simulation, dataGen);
    if (issues.length > 0) {
        console.group('⚠️ Issues Found:');
        issues.forEach(issue => {
            const icon = issue.critical ? '🔴' : '🟡';
            console.log(`${icon} ${issue.issue}`);
            console.log(`   Fix: ${issue.fix}`);
        });
        console.groupEnd();
    } else {
        console.log('✅ No issues found');
    }
    
    console.groupEnd();
}

/**
 * Tauri-specific issues and fixes
 */
export function diagnoseTauriIssues() {
    const issues = [];
    
    // Check if running in Tauri
    const isTauri = typeof window !== 'undefined' && window.__TAURI__ !== undefined;
    
    if (!isTauri) {
        issues.push({
            type: 'info',
            message: 'Running in browser mode (not Tauri desktop app)',
            impact: 'File exports will use browser downloads instead of native file system'
        });
        return issues;
    }
    
    // Check Tauri API availability
    try {
        const { invoke } = require('@tauri-apps/api/core');
        if (!invoke) {
            issues.push({
                type: 'error',
                message: 'Tauri invoke not available',
                fix: 'Make sure @tauri-apps/api is installed: npm install @tauri-apps/api'
            });
        }
    } catch (e) {
        issues.push({
            type: 'warning',
            message: 'Cannot import Tauri API',
            fix: 'Check that Tauri is properly initialized'
        });
    }
    
    return issues;
}

/**
 * Common console errors and solutions
 */
export const COMMON_ERRORS = {
    'Cannot read property \'currentFear\' of undefined': {
        cause: 'Agent missing brain property',
        solution: 'Ensure all agents have agent.brain = { currentFear: 0, state: "CALM" }'
    },
    'Cannot read property \'x\' of undefined': {
        cause: 'Agent missing position',
        solution: 'Ensure all agents have agent.x and agent.y'
    },
    'seedrandom is not a function': {
        cause: 'seedrandom not installed',
        solution: 'Run: npm install seedrandom'
    },
    'Cannot read property \'query\' of undefined': {
        cause: 'spatialHash not initialized',
        solution: 'Initialize spatialHash or FearDataGen will use linear fallback'
    },
    'Maximum call stack size exceeded': {
        cause: 'Infinite loop in trajectory processing',
        solution: 'Check that trajectories are not being processed recursively'
    },
    'Float32Array is not defined': {
        cause: 'Very old browser',
        solution: 'Use a modern browser or add polyfill'
    },
    // Tauri-specific errors
    'failed to invoke': {
        cause: 'Tauri command not found or failed',
        solution: 'Check that Rust backend is compiled and command is registered in main.rs'
    },
    'error while running tauri application': {
        cause: 'Tauri failed to start',
        solution: 'Run: cargo tauri dev from src-tauri directory'
    }
};

/**
 * Monitor for errors and provide helpful messages
 */
export function setupErrorMonitoring() {
    const originalError = console.error;
    
    console.error = function(...args) {
        const message = args[0]?.toString() || '';
        
        // Check against common errors
        for (const [pattern, info] of Object.entries(COMMON_ERRORS)) {
            if (message.includes(pattern)) {
                console.group('🔴 FearDataGen Error Help');
                console.log('Error:', pattern);
                console.log('Cause:', info.cause);
                console.log('Solution:', info.solution);
                console.groupEnd();
                break;
            }
        }
        
        originalError.apply(console, args);
    };
}
