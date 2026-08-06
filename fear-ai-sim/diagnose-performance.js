/**
 * diagnose-performance.js - Real-time performance diagnostics
 * Run this in console to find bottlenecks
 */

export function diagnoseSimulationPerformance(simulation) {
    console.group('🔬 Performance Diagnosis');
    
    const stats = {
        agents: simulation.agents?.filter(a => !a.dead).length || 0,
        predators: simulation.predators?.length || 0,
        fps: simulation.currentFPS?.toFixed(1) || 'N/A',
        frameCount: simulation.frameCount
    };
    
    console.log('Current State:', stats);
    
    // Check for common issues
    const issues = [];
    
    // Issue 1: Too many agents
    if (stats.agents > 150) {
        issues.push({
            severity: 'HIGH',
            issue: `${stats.agents} agents is heavy on CPU`,
            fix: 'Consider reducing max agents to 100-120'
        });
    }
    
    // Issue 2: Too many predators
    if (stats.predators > 5) {
        issues.push({
            severity: 'HIGH',
            issue: `${stats.predators} predators = O(n×m) threat detection`,
            fix: 'Max 3-5 predators recommended'
        });
    }
    
    // Issue 3: Spatial hash missing
    if (!simulation.spatialHash) {
        issues.push({
            severity: 'CRITICAL',
            issue: 'Spatial hash not initialized',
            fix: 'Falling back to O(n²) collision detection'
        });
    }
    
    // Issue 4: Markov engine overhead
    if (simulation.markovEngine && stats.predators > 3) {
        issues.push({
            severity: 'MEDIUM',
            issue: 'Markov predictions on many predators',
            fix: 'Disable for SWARMER type predators'
        });
    }
    
    // Issue 5: MASAC integration
    if (simulation.masacIntegration?.enabled) {
        issues.push({
            severity: 'MEDIUM',
            issue: 'MASAC RL adds compute overhead',
            fix: 'Disable if not actively training'
        });
    }
    
    // Issue 6: Brain workers
    if (simulation.brainWorker?.enabled) {
        issues.push({
            severity: 'LOW',
            issue: 'Brain workers have overhead',
            fix: 'Only needed for large populations'
        });
    }
    
    // Issue 7: 3D view
    if (simulation.view3D?.enabled) {
        issues.push({
            severity: 'HIGH',
            issue: '3D view is GPU intensive',
            fix: 'Switch to 2D mode for better FPS'
        });
    }
    
    // Issue 8: Thermal vision
    if (simulation.isThermalVision) {
        issues.push({
            severity: 'MEDIUM',
            issue: 'Thermal vision requires extra rendering',
            fix: 'Disable if not needed'
        });
    }
    
    // Display issues
    if (issues.length === 0) {
        console.log('✅ No obvious performance issues detected');
    } else {
        console.group(`⚠️  Found ${issues.length} potential issues:`);
        issues.forEach(issue => {
            const color = issue.severity === 'CRITICAL' ? '🔴' : 
                         issue.severity === 'HIGH' ? '🟠' : 
                         issue.severity === 'MEDIUM' ? '🟡' : '🔵';
            console.log(`${color} [${issue.severity}] ${issue.issue}`);
            console.log(`   Fix: ${issue.fix}`);
        });
        console.groupEnd();
    }
    
    // Performance recommendations
    console.group('💡 Quick Fixes:');
    console.log('1. Reduce agent count: simulation.agents = simulation.agents.slice(0, 100)');
    console.log('2. Disable MASAC: simulation.masacIntegration.enabled = false');
    console.log('3. Switch to 2D: simulation.viewMode = "DOTS"');
    console.log('4. Disable thermal: simulation.isThermalVision = false');
    console.groupEnd();
    
    console.groupEnd();
    
    return issues;
}

// Auto-run diagnosis periodically
export function startPerformanceMonitoring(simulation) {
    setInterval(() => {
        if (simulation.currentFPS < 30) {
            diagnoseSimulationPerformance(simulation);
        }
    }, 5000);
}

// Export to window for console access
if (typeof window !== 'undefined') {
    window.diagnosePerformance = diagnoseSimulationPerformance;
    window.perfMonitor = {
        diagnose: diagnoseSimulationPerformance,
        startMonitoring: startPerformanceMonitoring
    };
}
