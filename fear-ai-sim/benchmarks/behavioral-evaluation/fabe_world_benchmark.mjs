#!/usr/bin/env node
/**
 * benchmarks/behavioral-evaluation/fabe_world_benchmark.mjs
 *
 * Section 107 / 113 / 114 / 118: FABE-WORLD Living-World Simulation Benchmark.
 *
 * Evaluates the 7 canonical living-world dimensions:
 * 1. Causal Coherence (100% traceable events to simulated antecedents)
 * 2. Stability (Bounded state, zero NaNs/Infs, absence of permanent panic lock)
 * 3. Diversity (Shannon entropy of event types and diplomatic escalation stages)
 * 4. Replay (1.0000 bit-exact deterministic replay parity)
 * 5. Population Behavior (Opportunity-normalized demographic flow & strict conservation)
 * 6. Faction Decisions (Non-monotonic escalation ladder dynamics)
 * 7. Resource Responses (Commodity supply/demand elasticity under corridor disruption)
 *
 * Checks 6 World Degeneracy Flags:
 * UNIVERSAL_ALLIANCE, UNIVERSAL_WAR, PERMANENT_STAGNATION, INFINITE_RESOURCE, UNIVERSAL_MIGRATION, UNIVERSAL_PANIC.
 *
 * Synthesizes the Emergence Quality Scorecard:
 * C_trace, S_ground, R_parity, G_sensitivity -> Emergence Quality Index (EQI).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { FabeWorldBenchmarkSuite } from '../../packages/core/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function runFabeWorldBenchmark(options = {}) {
    console.log('=== Starting FABE-WORLD Living-World Simulation Benchmark Battery ===');
    const startTime = performance.now();

    const seeds = options.seeds || [101, 202, 303, 404, 505];
    const ticks = options.ticks || 100;

    const suite = new FabeWorldBenchmarkSuite({ seeds, ticks });
    const report = suite.runBenchmark();

    const elapsed = performance.now() - startTime;
    console.log(`[FABE-WORLD] Completed ${seeds.length} runs x ${ticks} ticks (${seeds.length * ticks} total simulation ticks) in ${elapsed.toFixed(1)} ms`);

    console.log('\n--- 7 Canonical Living-World Benchmark Dimensions (Section 107) ---');
    for (const [dim, score] of Object.entries(report.dimensionScores)) {
        const pass = score >= 0.80 ? 'PASS' : 'FAIL';
        console.log(`  - ${dim.padEnd(22)}: ${score.toFixed(4)} [${pass}]`);
    }

    console.log('\n--- Emergence Quality Scorecard (Section 114) ---');
    console.log(`  - Causal Traceability (C_trace)    : ${report.emergenceQualityScorecard.causalTraceability.toFixed(4)}`);
    console.log(`  - State Grounding (S_ground)        : ${report.emergenceQualityScorecard.stateGrounding.toFixed(4)}`);
    console.log(`  - Replay Parity (R_parity)          : ${report.emergenceQualityScorecard.replayParity.toFixed(4)}`);
    console.log(`  - Gameplay Sensitivity (G_sens)     : ${report.emergenceQualityScorecard.gameplaySensitivity.toFixed(4)}`);
    console.log(`  - Emergence Quality Index (EQI)     : ${report.emergenceQualityScorecard.emergenceQualityIndex.toFixed(4)}`);
    console.log(`  - Scorecard Emergence Rating        : ${report.emergenceQualityScorecard.rating}`);

    console.log('\n--- World Degeneracy Audit (Section 113) ---');
    console.log(`  - World Degenerate Detected         : ${report.degeneracyCheck.isDegenerate ? 'YES (FAIL)' : 'NO (HEALTHY)'}`);
    if (report.degeneracyCheck.flags.length > 0) {
        console.log(`  - Degeneracy Flags                  : ${report.degeneracyCheck.flags.map(f => f.type).join(', ')}`);
    } else {
        console.log(`  - Degeneracy Flags                  : None (0 pathological collapse modes triggered)`);
    }

    console.log('\n--- Causal World Chronicle Snippet (Section 118) ---');
    for (const entry of report.worldChronicleSnippet.slice(0, 5)) {
        console.log(`  [Tick ${String(entry.tick).padStart(3)}] ${entry.type} -> Cause: ${entry.cause}`);
    }

    const outputPath = path.resolve(__dirname, 'fabe_world_benchmark_results.json');
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`\n[FABE-WORLD] Benchmark results exported to: ${outputPath}`);

    return report;
}

// Execute directly if run via CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    runFabeWorldBenchmark();
}
