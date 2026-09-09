import { describe, it, expect } from '@jest/globals';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliPath = path.resolve(__dirname, '../bin/fear-ai.js');

function runCli(args = []) {
    return new Promise((resolve, reject) => {
        execFile(process.execPath, [cliPath, ...args], { timeout: 15000 }, (error, stdout, stderr) => {
            resolve({
                code: error ? error.code : 0,
                stdout: stdout || '',
                stderr: stderr || '',
                error
            });
        });
    });
}

describe('Fear AI Unified CLI (bin/fear-ai.js)', () => {
    it('executes "help" and displays banner with available subcommands', async () => {
        const res = await runCli(['help']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('FEAR AI — UNIVERSAL INTELLIGENCE CLI');
        expect(res.stdout).toContain('server');
        expect(res.stdout).toContain('explain');
        expect(res.stdout).toContain('explain-faction');
        expect(res.stdout).toContain('sim');
        expect(res.stdout).toContain('benchmark');
        expect(res.stdout).toContain('dashboard');
        expect(res.stdout).toContain('verify');
    });

    it('executes "verify" pre-flight sanity checks successfully', async () => {
        const res = await runCli(['verify']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Check 1: Resting baseline maintains CALM band: PASS');
        expect(res.stdout).toContain('Check 2: Severe threat triggers Affective escalation: PASS');
        expect(res.stdout).toContain('Check 3: Diagnostic Explainability Inspector loaded: PASS');
        expect(res.stdout).toContain('Check 4: Reference Game integration harness loaded: PASS');
        expect(res.stdout).toContain('All pre-flight verification checks PASS');
    });

    it('executes "explain --json" and returns structured inspector payload', async () => {
        const res = await runCli([
            'explain',
            '--neuroticism', '0.75',
            '--resilience', '0.25',
            '--distance', '12',
            '--intensity', '0.9',
            '--panic-peers', '2',
            '--json'
        ]);
        expect(res.code).toBe(0);
        const parsed = JSON.parse(res.stdout.trim());
        expect(parsed.agent_id).toBe('agent_npc_designer');
        expect(parsed.threat_attribution).toBeDefined();
        expect(parsed.trait_impacts).toBeDefined();
        expect(parsed.rejected_alternatives).toBeDefined();
        expect(parsed.active_intent).toBeDefined();
    });

    it('executes "explain-faction --json" and outputs bilateral diagnostic stance', async () => {
        const res = await runCli([
            'explain-faction',
            '--factionA', 'kingdom_of_sol',
            '--factionB', 'iron_covenant',
            '--incidents', '4',
            '--json'
        ]);
        expect(res.code).toBe(0);
        const parsed = JSON.parse(res.stdout.trim());
        expect(parsed.faction_a).toBe('kingdom_of_sol');
        expect(parsed.faction_b).toBe('iron_covenant');
        expect(parsed.bilateral_metrics).toBeDefined();
        expect(parsed.current_stance).toBeDefined();
        expect(parsed.contributing_factors).toBeDefined();
    });

    it('executes "sim" running authoritative 2D Dungeon Crawler harness', async () => {
        const res = await runCli(['sim', '--turns', '20']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('=== Reference Game Integration Simulation: Dungeon Crawler 2D ===');
        expect(res.stdout).toContain('Simulation completed');
        expect(res.stdout).toContain('Average Frame / Turn Time:');
    });

    it('executes "benchmark" with custom entities and ticks', async () => {
        const res = await runCli(['benchmark', '--entities', '500', '--ticks', '10']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('=== MASSIVE-SCALE BENCHMARK RESULTS ===');
        expect(res.stdout).toContain('Throughput:');
        expect(res.stdout).toContain('Status:                 PASS');
    });

    it('executes "adversarial" running all 11 stress regimes from Section XXV', async () => {
        const res = await runCli(['adversarial']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Running 11 Adversarial Stress Regimes (Section XXV)');
        expect(res.stdout).toContain('ALL 11 STRESS REGIMES PASSED (100%)');
    });

    it('executes "counterfactual" running all 8 causal experiments from Section XL', async () => {
        const res = await runCli(['counterfactual']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Running 8 Causal Counterfactual Experiments (Section XL)');
        expect(res.stdout).toContain('ALL 8 COUNTERFACTUAL EXPERIMENTS PASSED (100%)');
    });

    it('executes "godot --headless --test" running the 9-station showcase conformance runner', async () => {
        const res = await runCli(['godot', '--headless', '--test']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Launching Godot 4.6 showcase (Headless)');
        expect(res.stdout).toContain('GODOT 4.6 MULTI-STATION SHOWCASE CONFORMANCE: 9 / 9 PASSED (100%)');
    });

    it('executes "situation-strength" and outputs behavioral compression metrics', async () => {
        const res = await runCli(['situation-strength', '--ticks', '10']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('MISCHEL SITUATION STRENGTH & OPPORTUNITY-NORMALIZED PROFILING');
        expect(res.stdout).toContain('Cohort Behavioral Variance:');
        expect(res.stdout).toContain('Compression Ratio:');
        expect(res.stdout).toContain('Reversible Trait Restoration Protocol:');
    });

    it('executes "binary-wire" and outputs sub-millisecond serialization benchmarks', async () => {
        const res = await runCli(['binary-wire', '--entities', '200']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('PROTOCOL V2 ZERO-COPY BINARY WIRE BENCHMARK');
        expect(res.stdout).toContain('Encoding Latency:');
        expect(res.stdout).toContain('Zero-Copy Read:');
        expect(res.stdout).toContain('Throughput:');
    });

    it('executes "governance" and outputs collective deliberation results', async () => {
        const res = await runCli(['governance', '--severity', '0.7']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('FACTION COLLECTIVE GOVERNANCE & DELIBERATION');
        expect(res.stdout).toContain('MILITARY_JUNTA');
        expect(res.stdout).toContain('MERCHANT_OLIGARCHY');
        expect(res.stdout).toContain('TRIBAL_CONSENSUS');
    });

    it('executes "spatial-3d" and outputs 3D spatial sensory appraisal and escape vectors', async () => {
        const res = await runCli(['spatial-3d', '--elevation', '4.0', '--occlusion', '0.3', '--obstacles']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('3D Spatial & Raycast Navigation Appraisal');
        expect(res.stdout).toContain('Tactical Elevation:');
        expect(res.stdout).toContain('VULNERABLE_LOW_GROUND');
        expect(res.stdout).toContain('Line-of-Sight Occlusion:');
        expect(res.stdout).toContain('Advisory Escape Steering:');
        expect(res.stdout).toContain('Obstacle Deflection:');
    });

    it('executes "runaway-loops" and outputs multi-feedback cascade loop gain diagnosis', async () => {
        const res = await runCli(['runaway-loops']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('System-of-Systems Multi-Feedback Cascade Analysis');
        expect(res.stdout).toContain('Active Feedback Cycles:');
        expect(res.stdout).toContain('Runaway Loops');
        expect(res.stdout).toContain('RUNAWAY_FAMINE_PANIC_CASCADE');
        expect(res.stdout).toContain('PERPETUAL_RETALIATION_WAR_VORTEX');
        expect(res.stdout).toContain('INJECT_STRATEGIC_GRAIN_RESERVE');
    });

    it('executes "budget" and outputs adaptive computational backpressure metrics', async () => {
        const res = await runCli(['budget', '--agents', '100', '--budget', '2.0']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Adaptive Computational Budget & Backpressure Benchmark');
        expect(res.stdout).toContain('Enqueued Agents:');
        expect(res.stdout).toContain('Allocated Budget:');
        expect(res.stdout).toContain('Processed Agents:');
        expect(res.stdout).toContain('Execution Performance:');
    });

    it('executes "migration" and outputs dynamic settlement migration impacts and conservation', async () => {
        const res = await runCli(['migration', '--famine', '--war']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Dynamic Settlement Migration & Demographics');
        expect(res.stdout).toContain('Migration Wave Triggered:');
        expect(res.stdout).toContain('Post-Arrival Settlement Impacts:');
        expect(res.stdout).toContain('Northwatch Labor Bonus:');
        expect(res.stdout).toContain('STRICTLY CONSERVED');
    });

    it('executes "memory" and outputs memory consolidation, pruning, and pathology remediation', async () => {
        const res = await runCli(['memory', '--pathology', '--remediate']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Memory Consolidation, Pruning & Pathology Suite');
        expect(res.stdout).toContain('Sleep Consolidation & Selective Pruning:');
        expect(res.stdout).toContain('Memory Pathology Diagnostic Audit:');
        expect(res.stdout).toContain('Remediation Protocol:');
        expect(res.stdout).toContain('FULLY CURED');
    });

    it('executes "compactor" and outputs save-size compression ratio and lossless parity', async () => {
        const res = await runCli(['compactor', '--entities', '150']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('World Snapshot Persistence & Save-Size Compactor');
        expect(res.stdout).toContain('Snapshot Overview:');
        expect(res.stdout).toContain('Compaction Performance:');
        expect(res.stdout).toContain('Footprint Reduction:');
        expect(res.stdout).toContain('VERIFIED BIT-EXACT PARITY');
    });

    it('executes "roaming" and outputs destination utility and emergent encounters', async () => {
        const res = await runCli(['roaming', '--ticks', '15']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Roaming Band Navigation & Procedural Encounters');
        expect(res.stdout).toContain('Simulation Summary:');
        expect(res.stdout).toContain('Active Roaming Bands:');
        expect(res.stdout).toContain('Top Multi-Criteria Destination Utility');
        expect(res.stdout).toContain('Emergent Systemic Encounters:');
    });

    it('executes "intervene" and outputs causal consequence persistence metrics', async () => {
        const res = await runCli(['intervene', '--action', 'blockade', '--ticks', '5']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Scenario Consequence & Player Interventions');
        expect(res.stdout).toContain('Intervention Directive:');
        expect(res.stdout).toContain('BLOCK_TRADE_CORRIDOR');
        expect(res.stdout).toContain('Causal Attribution & Persistence:');
        expect(res.stdout).toContain('Host Authority Check:');
    });

    it('executes "pareto" and outputs non-dominated front and knee-point compromise', async () => {
        const res = await runCli(['pareto', '--preset', 'STOIC_VETERAN', '--candidates', '4', '--surface']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Behavioral Pareto Frontier');
        expect(res.stdout).toContain('Target Archetype Preset:');
        expect(res.stdout).toContain('Candidates Evaluated:');
        expect(res.stdout).toContain('Hypervolume Indicator:');
        expect(res.stdout).toContain('Optimal Knee-Point Compromise:');
        expect(res.stdout).toContain('Identity Invariance:');
        expect(res.stdout).toContain('Calibration Surface Grid');
    });

    it('executes "collision" and outputs whole-world systemic resilience metrics', async () => {
        const res = await runCli(['collision', '--scenario', 'rupture', '--ticks', '20']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Complex Emergent System Collision Harness');
        expect(res.stdout).toContain('Compound Collision Scenario:');
        expect(res.stdout).toContain('THE_GREAT_RUPTURE');
        expect(res.stdout).toContain('Systemic Resilience Index:');
        expect(res.stdout).toContain('Coupling Entropy:');
        expect(res.stdout).toContain('Cascade Dampening Factor:');
        expect(res.stdout).toContain('Numerical Integrity Audit:');
        expect(res.stdout).toContain('CLEAN');
    });

    it('executes "stream" and outputs ring buffer throughput and delta compression savings', async () => {
        const res = await runCli(['stream', '--entities', '150']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Cross-Engine Binary Streaming Buffer');
        expect(res.stdout).toContain('Batch Configuration:');
        expect(res.stdout).toContain('Generated Chunks:');
        expect(res.stdout).toContain('Out-of-Order Reassembly:');
        expect(res.stdout).toContain('VERIFIED');
        expect(res.stdout).toContain('Zero-Allocation Ring Buffer Performance:');
        expect(res.stdout).toContain('Delta Frame Compression');
        expect(res.stdout).toContain('bandwidth savings');
    });

    it('executes "trauma" and outputs persona mutation and phobic avoidance vectors', async () => {
        const res = await runCli(['trauma', '--severity', '0.85', '--extinction']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Diachronic Persona Mutation & Trauma Crystallization');
        expect(res.stdout).toContain('Incident Type:');
        expect(res.stdout).toContain('NEAR_DEATH_SURVIVAL');
        expect(res.stdout).toContain('Personality Trait Remodeling:');
        expect(res.stdout).toContain('Neuroticism:');
        expect(res.stdout).toContain('Conditioned Phobic Reaction');
        expect(res.stdout).toContain('Phobic Dread Spike:');
        expect(res.stdout).toContain('Repulsive Avoidance:');
        expect(res.stdout).toContain('Rehabilitation Extinction:');
    });

    it('executes "trade-chains" and outputs commodity mass conservation', async () => {
        const res = await runCli(['trade-chains', '--ticks', '40']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Regional Dynamic Trade Caravans & Procedural Supply Chains');
        expect(res.stdout).toContain('Arbitrage Routes Scanned:');
        expect(res.stdout).toContain('Caravan Dispatched:');
        expect(res.stdout).toContain('Commodity Mass Conservation:');
        expect(res.stdout).toContain('PERFECT CONSERVATION');
        expect(res.stdout).toContain('Host Authority Check:');
    });

    it('executes "epistemic-fog" and evaluates multi-observer discrepancy', async () => {
        const res = await runCli(['epistemic-fog', '--ticks', '15']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Multi-Observer Epistemic Discrepancy & Fog-of-War');
        expect(res.stdout).toContain('World Ground Truth Check:');
        expect(res.stdout).toContain('IMMUTABLE');
        expect(res.stdout).toContain('Belief Divergence Score:');
        expect(res.stdout).toContain('Network Complacency Index:');
        expect(res.stdout).toContain('Average Threat Latency:');
        expect(res.stdout).toContain('Host Authority Check:');
    });

    it('executes "fabe-world" and prints 7 dimensions, emergence quality scorecard, and degeneracy audit', async () => {
        const res = await runCli(['fabe-world', '--seeds', '101,202', '--ticks', '40']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('FABE-WORLD LIVING-WORLD SIMULATION BENCHMARK');
        expect(res.stdout).toContain('7 Canonical Living-World Benchmark Dimensions (Section 107)');
        expect(res.stdout).toContain('causal_coherence');
        expect(res.stdout).toContain('stability');
        expect(res.stdout).toContain('diversity');
        expect(res.stdout).toContain('replay');
        expect(res.stdout).toContain('population_behavior');
        expect(res.stdout).toContain('faction_decisions');
        expect(res.stdout).toContain('resource_responses');
        expect(res.stdout).toContain('Emergence Quality Scorecard (Section 114)');
        expect(res.stdout).toContain('Emergence Quality Index (EQI)');
        expect(res.stdout).toContain('EXEMPLARY_SYSTEMIC_EMERGENCE');
        expect(res.stdout).toContain('World Degeneracy Audit (Section 113)');
        expect(res.stdout).toContain('World Degenerate Detected         : NO (HEALTHY)');
    });

    it('executes "fabe-world --json" and returns structured JSON with all dimensions >= 0.80', async () => {
        const res = await runCli(['fabe-world', '--seeds', '303', '--ticks', '25', '--json']);
        expect(res.code).toBe(0);
        const parsed = JSON.parse(res.stdout.trim());
        expect(parsed.benchmark).toBe('FABE-WORLD-v1');
        expect(parsed.dimensionScores).toBeDefined();
        for (const [dim, score] of Object.entries(parsed.dimensionScores)) {
            expect(score).toBeGreaterThanOrEqual(0.80);
        }
        expect(parsed.emergenceQualityScorecard.emergenceQualityIndex).toBeGreaterThanOrEqual(0.85);
        expect(parsed.degeneracyCheck.isDegenerate).toBe(false);
        expect(parsed.metrics.populationConservationDeltaMax).toBe(0);
    });

    it('executes "scenario" and returns formatted procedural scenario engine output', async () => {
        const res = await runCli(['scenario', '--fuzz', '999', '--ticks', '10']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Declarative Scenario Procedural Engine');
        expect(res.stdout).toContain('Validation:         ✓ VALID');
        expect(res.stdout).toContain('Property Invariants: ✓ ALL PASS');
    });

    it('executes "scenario --json" and returns structured JSON with verified properties', async () => {
        const res = await runCli(['scenario', '--fuzz', '888', '--ticks', '15', '--json']);
        expect(res.code).toBe(0);
        const parsed = JSON.parse(res.stdout.trim());
        expect(parsed.validation.valid).toBe(true);
        expect(parsed.properties.passed).toBe(true);
        expect(parsed.ticks).toBe(15);
        expect(parsed.factionsCount).toBeGreaterThan(0);
    });

    it('executes "metamorphic" and prints 5/5 relations passed', async () => {
        const res = await runCli(['metamorphic']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Metamorphic Testing & Semantic Invariant Verification');
        expect(res.stdout).toContain('Certified Status:     ✓ FULLY CERTIFIED');
        expect(res.stdout).toContain('5 / 5 passed');
    });

    it('executes "metamorphic --json" and returns 100% certified scorecard', async () => {
        const res = await runCli(['metamorphic', '--json']);
        expect(res.code).toBe(0);
        const parsed = JSON.parse(res.stdout.trim());
        expect(parsed.certified).toBe(true);
        expect(parsed.passedRelations).toBe(5);
        expect(parsed.relationsEvaluated).toBe(5);
        expect(parsed.relations.MR1_DISTANT_SPATIAL_INVARIANCE.passed).toBe(true);
        expect(parsed.relations.MR5_MONOTONIC_RESILIENCE_RECOVERY.passed).toBe(true);
    });

    it('executes "coalition" and outputs multilateral alliance and call-to-arms deliberation', async () => {
        const res = await runCli(['coalition']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Multilateral Coalition Diplomacy, Treaties & Espionage');
        expect(res.stdout).toContain('Cohesion Index (Phi):');
        expect(res.stdout).toContain('Mutual Defense Call-to-Arms Deliberation');
    });

    it('executes "coalition --json" and returns structured JSON with cohesion and call-to-arms', async () => {
        const res = await runCli(['coalition', '--json']);
        expect(res.code).toBe(0);
        const parsed = JSON.parse(res.stdout.trim());
        expect(parsed.coalition).toBeDefined();
        expect(parsed.coalition.cohesion).toBeGreaterThan(0.5);
        expect(parsed.callToArms).toBeDefined();
        expect(parsed.callToArms.outcomes.length).toBeGreaterThan(0);
        expect(parsed.hostAuthorityPreserved).toBe(true);
    });

    it('executes "parallel-batch" and outputs multi-worker cohort evaluation', async () => {
        const res = await runCli(['parallel-batch', '--entities', '2000', '--workers', '2']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Parallel Batch Evaluator & Shared-Memory Worker Pool');
        expect(res.stdout).toContain('Cohort Scale:');
        expect(res.stdout).toContain('2,000 Entities');
        expect(res.stdout).toContain('Throughput:');
        expect(res.stdout).toContain('Host Authority Check:');
    });

    it('executes "parallel-batch --json" and returns structured telemetry and sample entities', async () => {
        const res = await runCli(['parallel-batch', '--entities', '2000', '--workers', '2', '--json']);
        expect(res.code).toBe(0);
        const parsed = JSON.parse(res.stdout.trim());
        expect(parsed.entityCount).toBe(2000);
        expect(parsed.telemetry).toBeDefined();
        expect(parsed.telemetry.throughput).toBeGreaterThan(0);
        expect(parsed.sampleEntities.length).toBe(3);
        expect(parsed.hostAuthorityCheck).toBe('CLEAN_ADVISORY_ONLY');
    });

    it('executes "stepper" and outputs interactive simulation stepping summary', async () => {
        const res = await runCli(['stepper', '--step', '8']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Interactive Scenario Stepper & Semantic Breakpoint Debugger');
        expect(res.stdout).toContain('Current Tick:                 8');
        expect(res.stdout).toContain('Ticks Advanced:               8');
        expect(res.stdout).toContain('Keyframes Retained:');
        expect(res.stdout).toContain('Host Authority Check:');
    });

    it('executes "stepper --json" with live intervention and semantic breakpoint', async () => {
        const res = await runCli(['stepper', '--step', '15', '--intervene', '--until-breakpoint', 'fear', '--threshold', '0.4', '--json']);
        expect(res.code).toBe(0);
        const parsed = JSON.parse(res.stdout.trim());
        expect(parsed.scenarioId).toBeDefined();
        expect(parsed.executionResult.stopped).toBe(true);
        expect(parsed.executionResult.reason).toBe('BREAKPOINT_TRIGGERED');
        expect(parsed.executionResult.firedBreakpoint.fear).toBeGreaterThanOrEqual(0.4);
        expect(parsed.timelineSummary.keyframesRetained).toBeGreaterThanOrEqual(1);
        expect(parsed.hostAuthorityPreserved).toBe(true);
    });

    it('executes "moral" and outputs moral cognitive dissonance deliberation', async () => {
        const res = await runCli(['moral', '--profile', 'guardian', '--transgression', 'LOOT_SETTLEMENT']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Moral Alignment, Cognitive Dissonance & Guilt Engine');
        expect(res.stdout).toContain('HONORABLE_GUARDIAN');
        expect(res.stdout).toContain('Moral Foundations:');
        expect(res.stdout).toContain('Current Guilt Level:');
        expect(res.stdout).toContain('Host Authority Check:');
    });

    it('executes "moral --json" and returns structured moral state and atonement report', async () => {
        const res = await runCli(['moral', '--profile', 'utilitarian', '--transgression', 'EXECUTE_DEFENSELESS', '--atone', 'AID_VICTIMS', '--json']);
        expect(res.code).toBe(0);
        const parsed = JSON.parse(res.stdout.trim());
        expect(parsed.profileName).toBe('COLD_UTILITARIAN');
        expect(parsed.moralState).toBeDefined();
        expect(parsed.transgressionReport).toBeDefined();
        expect(parsed.atonementReport).toBeDefined();
        expect(parsed.atonementReport.guiltRelieved).toBe(0.25);
        expect(parsed.audit.isClean).toBe(true);
    });

    it('executes "causal-graph" and outputs root-cause chronicle', async () => {
        const res = await runCli(['causal-graph']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('CAUSAL EVENT GRAPH & ROOT-CAUSE EXPLAINER');
        expect(res.stdout).toContain('PRIMARY ROOT CAUSE: [Tick 24]');
        expect(res.stdout).toContain('Bandit Raid on North Road');
        expect(res.stdout).toContain('Host Authority Check:');
    });

    it('executes "causal-graph --json" and returns structured causal analysis', async () => {
        const res = await runCli(['causal-graph', '--outcome', 'famine_emergency', '--threshold', '0.2', '--json']);
        expect(res.code).toBe(0);
        const parsed = JSON.parse(res.stdout.trim());
        expect(parsed.outcomeEventId).toBe('famine_emergency');
        expect(parsed.rankedRootCauses[0].rootId).toBe('raid_north_road');
        expect(parsed.minimalInterventionNodes[0].id).toBe('raid_north_road');
        expect(parsed.narrative).toContain('PRIMARY ROOT CAUSE');
        expect(parsed.audit.isClean).toBe(true);
    });

    it('executes "feedback" and outputs execution-aware re-ranking', async () => {
        const res = await runCli(['feedback']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('EXECUTION-AWARE ADVISORY LOOP');
        expect(res.stdout).toContain('SEEK_COVER unavailable:     YES');
        expect(res.stdout).toContain('Top advisory intent:        FLEE_FROM');
        expect(res.stdout).toContain('Host Authority Check:');
    });

    it('executes "feedback --json" and returns structured ranking payload', async () => {
        const res = await runCli(['feedback', '--agent', 'scout_01', '--intent', 'SEEK_COVER', '--outcome', 'EXECUTION_FAILED', '--reason', 'NO_PATH', '--json']);
        expect(res.code).toBe(0);
        const parsed = JSON.parse(res.stdout.trim());
        expect(parsed.agentId).toBe('scout_01');
        expect(parsed.ranking.top.type).toBe('FLEE_FROM');
        expect(parsed.ranking.rejectedAlternatives.map((r) => r.type)).toContain('SEEK_COVER');
        expect(parsed.liveReport.outcome).toBe('EXECUTION_FAILED');
        expect(parsed.audit.isClean).toBe(true);
    });

    it('executes "resilience" and proves core survives injected failures', async () => {
        const res = await runCli(['resilience']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('SUBSYSTEM RESILIENCE & GRACEFUL DEGRADATION');
        expect(res.stdout).toContain('Core alive under failure:   YES');
        expect(res.stdout).toContain('Host Authority Check:');
    });

    it('executes "resilience --json" and returns degraded advisory report', async () => {
        const res = await runCli(['resilience', '--fail', 'memory,economy', '--json']);
        expect(res.code).toBe(0);
        const parsed = JSON.parse(res.stdout.trim());
        expect(parsed.degraded.coreAlive).toBe(true);
        expect(parsed.degraded.failedModules.sort()).toEqual(['economy', 'memory']);
        expect(parsed.degraded.advisoryIntent).toBeDefined();
        expect(parsed.audit.isClean).toBe(true);
    });
});



