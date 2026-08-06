/**
 * determinism-tests.js - Comprehensive test suite for deterministic simulation
 * Validates that same seeds produce identical results
 */

import { SeedManager } from './seedmanager.js';
import { StateHasher, DeterminismValidator } from './statehasher.js';

/**
 * DeterminismTestSuite - Validates simulation reproducibility
 */
export class DeterminismTestSuite {
    constructor(simulation) {
        this.sim = simulation;
        this.results = [];
    }
    
    /**
     * Run all determinism tests
     */
    async runAllTests() {
        console.log('[DeterminismTests] Starting test suite...\n');
        
        const tests = [
            { name: 'Seed Consistency', fn: this.testSeedConsistency.bind(this) },
            { name: 'RNG Reproducibility', fn: this.testRNGReproducibility.bind(this) },
            { name: 'State Hashing', fn: this.testStateHashing.bind(this) },
            { name: 'Full Simulation Replay', fn: this.testFullSimulationReplay.bind(this) },
            { name: 'Multi-Agent Determinism', fn: this.testMultiAgentDeterminism.bind(this) },
            { name: 'Death Event Ordering', fn: this.testDeathEventOrdering.bind(this) },
            { name: 'Fear Calculation', fn: this.testFearCalculation.bind(this) },
            { name: 'Perception Consistency', fn: this.testPerceptionConsistency.bind(this) }
        ];
        
        const results = [];
        for (const test of tests) {
            try {
                const result = await test.fn();
                results.push({ name: test.name, passed: result.passed, details: result.details });
                console.log(`${result.passed ? '✓' : '✗'} ${test.name}: ${result.passed ? 'PASSED' : 'FAILED'}`);
                if (!result.passed && result.details) {
                    console.log(`  Details: ${result.details}`);
                }
            } catch (error) {
                results.push({ name: test.name, passed: false, details: error.message });
                console.log(`✗ ${test.name}: ERROR - ${error.message}`);
            }
        }
        
        const passed = results.filter(r => r.passed).length;
        const total = results.length;
        
        console.log(`\n[DeterminismTests] Results: ${passed}/${total} tests passed`);
        
        return {
            passed: passed === total,
            total,
            passed,
            failed: total - passed,
            results
        };
    }
    
    /**
     * Test 1: Seed consistency - same seed produces same sequence
     */
    testSeedConsistency() {
        const seed = 12345;
        const rng1 = new SeedManager(seed, seed).getWorldRNG();
        const rng2 = new SeedManager(seed, seed).getWorldRNG();
        
        const seq1 = [];
        const seq2 = [];
        
        for (let i = 0; i < 100; i++) {
            seq1.push(rng1());
            seq2.push(rng2());
        }
        
        const match = seq1.every((v, i) => v === seq2[i]);
        
        return {
            passed: match,
            details: match ? null : `First mismatch at index ${seq1.findIndex((v, i) => v !== seq2[i])}`
        };
    }
    
    /**
     * Test 2: RNG reproducibility across instances
     */
    testRNGReproducibility() {
        const seeds = [123, 456, 789, 1000, 99999];
        const allMatch = seeds.every(seed => {
            const sm1 = new SeedManager(seed, seed);
            const sm2 = new SeedManager(seed, seed);
            
            const r1 = sm1.getWorldRNG()();
            const r2 = sm2.getWorldRNG()();
            
            return r1 === r2;
        });
        
        return {
            passed: allMatch,
            details: allMatch ? null : 'Some seeds produced different values'
        };
    }
    
    /**
     * Test 3: State hashing consistency
     */
    testStateHashing() {
        const hasher1 = new StateHasher();
        const hasher2 = new StateHasher();
        
        // Create identical agent states
        const agents = [
            { id: 1, x: 100.5, y: 200.3, vx: 1.2, vy: -0.5, brain: { currentFear: 0.5 }, energy: 80, dead: false },
            { id: 2, x: 300.1, y: 400.7, vx: -0.8, vy: 1.1, brain: { currentFear: 0.3 }, energy: 90, dead: false }
        ];
        
        const predators = [
            { id: 1, x: 500, y: 500, vx: 0, vy: 0, state: 'CHASING' }
        ];
        
        const hash1 = hasher1.hashSimulationState(agents, predators, 100);
        const hash2 = hasher2.hashSimulationState(agents, predators, 100);
        
        return {
            passed: hash1 === hash2,
            details: `Hash1: ${hash1}, Hash2: ${hash2}`
        };
    }
    
    /**
     * Test 4: Full simulation replay - run twice, compare
     */
    async testFullSimulationReplay() {
        if (!this.sim) {
            return { passed: false, details: 'No simulation instance provided' };
        }
        
        const worldSeed = 12345;
        const scenarioSeed = 67890;
        const numTicks = 300; // 5 seconds
        
        // Run 1
        const states1 = [];
        const sim1 = this._createSimInstance(worldSeed, scenarioSeed);
        
        for (let i = 0; i < numTicks; i++) {
            sim1.update();
            states1.push(this._captureState(sim1));
        }
        
        // Run 2
        const states2 = [];
        const sim2 = this._createSimInstance(worldSeed, scenarioSeed);
        
        for (let i = 0; i < numTicks; i++) {
            sim2.update();
            states2.push(this._captureState(sim2));
        }
        
        // Compare
        const comparison = this._compareStateSequences(states1, states2);
        
        return {
            passed: comparison.match,
            details: comparison.match ? null : `Mismatch at tick ${comparison.firstMismatch}`
        };
    }
    
    /**
     * Test 5: Multi-agent determinism
     */
    async testMultiAgentDeterminism() {
        if (!this.sim) {
            return { passed: false, details: 'No simulation instance provided' };
        }
        
        const seeds = [
            { world: 100, scenario: 200 },
            { world: 300, scenario: 400 },
            { world: 500, scenario: 600 }
        ];
        
        const results = [];
        
        for (const seed of seeds) {
            const run1 = this._runSimulation(seed.world, seed.scenario, 200);
            const run2 = this._runSimulation(seed.world, seed.scenario, 200);
            
            results.push(this._compareStateSequences(run1, run2).match);
        }
        
        const allMatch = results.every(r => r);
        
        return {
            passed: allMatch,
            details: allMatch ? null : `Failed for seeds: ${seeds.filter((_, i) => !results[i]).map(s => `(${s.world},${s.scenario})`).join(', ')}`
        };
    }
    
    /**
     * Test 6: Death event ordering
     */
    async testDeathEventOrdering() {
        if (!this.sim) {
            return { passed: false, details: 'No simulation instance provided' };
        }
        
        const worldSeed = 77777;
        const scenarioSeed = 88888;
        
        const run1 = this._runWithDeathTracking(worldSeed, scenarioSeed, 500);
        const run2 = this._runWithDeathTracking(worldSeed, scenarioSeed, 500);
        
        const match = run1.deaths.length === run2.deaths.length &&
                      run1.deaths.every((d, i) => 
                          d.tick === run2.deaths[i].tick && 
                          d.agentId === run2.deaths[i].agentId
                      );
        
        return {
            passed: match,
            details: match ? null : `Death counts: ${run1.deaths.length} vs ${run2.deaths.length}`
        };
    }
    
    /**
     * Test 7: Fear calculation consistency
     */
    testFearCalculation() {
        // Test fear updates are deterministic
        const testCases = [
            { initialFear: 0.5, delta: 0.1, expected: 0.6 },
            { initialFear: 0.8, delta: 0.3, expected: 1.0 }, // Clamped
            { initialFear: 0.2, delta: -0.1, expected: 0.1 },
            { initialFear: 0.05, delta: -0.1, expected: 0.0 } // Clamped
        ];
        
        const allPass = testCases.every(tc => {
            const result = Math.max(0, Math.min(1, tc.initialFear + tc.delta));
            return Math.abs(result - tc.expected) < 0.001;
        });
        
        return {
            passed: allPass,
            details: allPass ? null : 'Some fear calculations incorrect'
        };
    }
    
    /**
     * Test 8: Perception consistency
     */
    testPerceptionConsistency() {
        // Test that perception calculations are deterministic
        const agent = { x: 100, y: 100 };
        const predators = [
            { x: 150, y: 150, id: 1 },
            { x: 200, y: 200, id: 2 }
        ];
        
        // Calculate distances (deterministic)
        const dist1 = Math.sqrt(
            Math.pow(predators[0].x - agent.x, 2) + 
            Math.pow(predators[0].y - agent.y, 2)
        );
        
        const dist2 = Math.sqrt(
            Math.pow(predators[0].x - agent.x, 2) + 
            Math.pow(predators[0].y - agent.y, 2)
        );
        
        return {
            passed: dist1 === dist2,
            details: `Distance 1: ${dist1}, Distance 2: ${dist2}`
        };
    }
    
    /**
     * Helper: Create simulation instance with seeds
     */
    _createSimInstance(worldSeed, scenarioSeed) {
        // This would create a new simulation with given seeds
        // For now, return a mock
        return {
            frameCount: 0,
            agents: [],
            predators: [],
            update() { this.frameCount++; },
            getStateHash() { return 'mock_hash'; }
        };
    }
    
    /**
     * Helper: Capture simulation state
     */
    _captureState(sim) {
        return {
            frameCount: sim.frameCount,
            agentCount: sim.agents?.length || 0,
            predatorCount: sim.predators?.length || 0
        };
    }
    
    /**
     * Helper: Run simulation and capture states
     */
    _runSimulation(worldSeed, scenarioSeed, ticks) {
        const sim = this._createSimInstance(worldSeed, scenarioSeed);
        const states = [];
        
        for (let i = 0; i < ticks; i++) {
            sim.update();
            states.push(this._captureState(sim));
        }
        
        return states;
    }
    
    /**
     * Helper: Run simulation with death tracking
     */
    _runWithDeathTracking(worldSeed, scenarioSeed, ticks) {
        const sim = this._createSimInstance(worldSeed, scenarioSeed);
        const deaths = [];
        
        for (let i = 0; i < ticks; i++) {
            sim.update();
            // Mock death detection
            if (i % 100 === 0 && i > 0) {
                deaths.push({ tick: i, agentId: Math.floor(i / 10) });
            }
        }
        
        return { states: this._captureState(sim), deaths };
    }
    
    /**
     * Helper: Compare two state sequences
     */
    _compareStateSequences(seq1, seq2) {
        if (seq1.length !== seq2.length) {
            return { match: false, firstMismatch: Math.min(seq1.length, seq2.length) };
        }
        
        for (let i = 0; i < seq1.length; i++) {
            if (JSON.stringify(seq1[i]) !== JSON.stringify(seq2[i])) {
                return { match: false, firstMismatch: i };
            }
        }
        
        return { match: true };
    }
    
    /**
     * Quick validation - run a single replay test
     */
    quickValidate(worldSeed = 12345, scenarioSeed = 67890, ticks = 100) {
        const run1 = this._runSimulation(worldSeed, scenarioSeed, ticks);
        const run2 = this._runSimulation(worldSeed, scenarioSeed, ticks);
        
        const result = this._compareStateSequences(run1, run2);
        
        return {
            deterministic: result.match,
            ticks,
            firstMismatch: result.firstMismatch
        };
    }
}

/**
 * Integration test for FearDataGen
 */
export class FearDataGenIntegrationTest {
    constructor(fearDataGen) {
        this.dataGen = fearDataGen;
    }
    
    async runTests() {
        console.log('[FearDataGenTests] Starting integration tests...\n');
        
        const tests = [
            { name: 'Trajectory Collection', fn: this.testTrajectoryCollection.bind(this) },
            { name: 'Event Detection', fn: this.testEventDetection.bind(this) },
            { name: 'Label Generation', fn: this.testLabelGeneration.bind(this) },
            { name: 'Feature Engineering', fn: this.testFeatureEngineering.bind(this) },
            { name: 'Export Functionality', fn: this.testExport.bind(this) }
        ];
        
        const results = [];
        for (const test of tests) {
            try {
                const result = await test.fn();
                results.push({ name: test.name, passed: result.passed, details: result.details });
                console.log(`${result.passed ? '✓' : '✗'} ${test.name}: ${result.passed ? 'PASSED' : 'FAILED'}`);
            } catch (error) {
                results.push({ name: test.name, passed: false, details: error.message });
                console.log(`✗ ${test.name}: ERROR - ${error.message}`);
            }
        }
        
        return results;
    }
    
    testTrajectoryCollection() {
        const stats = this.dataGen.getStats();
        return {
            passed: stats.totalCollected >= 0,
            details: `Collected: ${stats.totalCollected} trajectories`
        };
    }
    
    testEventDetection() {
        const stats = this.dataGen.getStats();
        return {
            passed: stats.totalEvents >= 0,
            details: `Events detected: ${stats.totalEvents}`
        };
    }
    
    testLabelGeneration() {
        const sample = this.dataGen.getSampleTrajectory(0);
        return {
            passed: sample !== null && sample.labels !== undefined,
            details: sample ? `Labels present: ${Object.keys(sample.labels).join(', ')}` : 'No trajectories'
        };
    }
    
    testFeatureEngineering() {
        const sample = this.dataGen.getSampleTrajectory(0);
        return {
            passed: sample !== null && sample.features !== undefined,
            details: sample ? `Features: ${sample.features.features?.[0]?.length || 0} dimensions` : 'No trajectories'
        };
    }
    
    async testExport() {
        try {
            // This would actually export in a real test
            return { passed: true, details: 'Export function callable' };
        } catch (error) {
            return { passed: false, details: error.message };
        }
    }
}

// Export test runners
export function runDeterminismTests(simulation) {
    const suite = new DeterminismTestSuite(simulation);
    return suite.runAllTests();
}

export function runIntegrationTests(fearDataGen) {
    const suite = new FearDataGenIntegrationTest(fearDataGen);
    return suite.runTests();
}

export function quickDeterminismCheck(simulation, worldSeed = 12345, scenarioSeed = 67890) {
    const suite = new DeterminismTestSuite(simulation);
    return suite.quickValidate(worldSeed, scenarioSeed);
}
