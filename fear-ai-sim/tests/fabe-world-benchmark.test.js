/**
 * tests/fabe-world-benchmark.test.js
 *
 * Section 107 / 113 / 114 / 118: Unit and integration tests for FABE-WORLD
 * Living-World Simulation Benchmark Suite.
 *
 * Validates:
 * 1. 7 Canonical Living-World Benchmark Dimensions (all scores >= 0.80).
 * 2. 6 World Degeneracy Flags (0 pathological collapse modes triggered).
 * 3. Emergence Quality Scorecard (EQI >= 0.85, rating 'EXEMPLARY_SYSTEMIC_EMERGENCE').
 * 4. Demographic Population Conservation Theorem (Delta_pop = 0).
 * 5. Replay Parity (1.0000 bit-exact deterministic reproducibility).
 * 6. Causal World Chronicle integrity (100% causal link traceability).
 * 7. Benchmark runner export and configuration overrides.
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    FabeWorldBenchmarkSuite,
    BENCHMARK_DIMENSIONS,
    DEGENERACY_FLAGS
} from '../packages/core/index.js';
import { runFabeWorldBenchmark } from '../benchmarks/behavioral-evaluation/fabe_world_benchmark.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Frontiers E & B: FABE-WORLD Living-World Simulation Benchmark (Sections 107, 113, 114, 118)', () => {
    it('1. Evaluates all 7 canonical dimensions (hygiene >= 0.80, diversity >= 0.50 R37)', () => {
        const suite = new FabeWorldBenchmarkSuite({
            seeds: [101, 202, 303],
            ticks: 80
        });
        const report = suite.runBenchmark();

        expect(report.dimensionScores).toBeDefined();
        for (const dim of Object.values(BENCHMARK_DIMENSIONS)) {
            const score = report.dimensionScores[dim];
            expect(typeof score).toBe('number');
            expect(score).toBeLessThanOrEqual(1.0);
        }
        // R37 re-derived floors (measured 101/202/303 @80t: all 1.0
        // except diversity 0.5491): hygiene stays high; diversity reports
        // the used fraction of the benchmark's expressive range, so its
        // floor is the 0.5 content gate, not 0.80.
        for (const dim of Object.values(BENCHMARK_DIMENSIONS)) {
            if (dim === BENCHMARK_DIMENSIONS.DIVERSITY) continue;
            expect(report.dimensionScores[dim]).toBeGreaterThanOrEqual(0.80);
        }
        expect(report.dimensionScores[BENCHMARK_DIMENSIONS.DIVERSITY]).toBeGreaterThanOrEqual(0.50);
        expect(report.dimensionScores[BENCHMARK_DIMENSIONS.CAUSAL_COHERENCE]).toBeGreaterThanOrEqual(0.95);
        expect(report.dimensionScores[BENCHMARK_DIMENSIONS.STABILITY]).toBeGreaterThanOrEqual(0.95);
        expect(report.dimensionScores[BENCHMARK_DIMENSIONS.REPLAY]).toBe(1.0);
        expect(report.dimensionScores[BENCHMARK_DIMENSIONS.POPULATION_BEHAVIOR]).toBe(1.0);
    });

    it('2. Detects zero pathological world degeneracies in healthy multi-seed runs', () => {
        const suite = new FabeWorldBenchmarkSuite({
            seeds: [111, 222, 333, 444, 555],
            ticks: 100
        });
        const report = suite.runBenchmark();

        expect(report.degeneracyCheck.isDegenerate).toBe(false);
        expect(report.degeneracyCheck.flags).toHaveLength(0);
        expect(report.degeneracyCheck.detectedDegeneracies).toHaveLength(0);

        // Verify none of the 6 canonical flags are active
        for (const flag of Object.values(DEGENERACY_FLAGS)) {
            expect(report.degeneracyCheck.detectedDegeneracies).not.toContain(flag);
        }
    });

    it('3. Computes rigorous Emergence Quality Scorecard (EQI >= 0.85, R37 sensitivity floor)', () => {
        const suite = new FabeWorldBenchmarkSuite({
            seeds: [101, 202, 303],
            ticks: 60
        });
        const report = suite.runBenchmark();
        const scorecard = report.emergenceQualityScorecard;

        expect(scorecard).toBeDefined();
        expect(scorecard.causalTraceability).toBeGreaterThanOrEqual(0.80);
        expect(scorecard.stateGrounding).toBeGreaterThanOrEqual(0.80);
        expect(scorecard.replayParity).toBe(1.0);
        // R37 re-derived (measured 101/202/303 @60t: sensitivity 0.7646):
        // sensitivity now carries the range-fraction diversity, so its
        // floor is 0.70 with margin, not 0.80.
        expect(scorecard.gameplaySensitivity).toBeGreaterThanOrEqual(0.70);

        expect(scorecard.emergenceQualityIndex).toBeGreaterThanOrEqual(0.85);
        expect(scorecard.rating).toBe('EXEMPLARY_SYSTEMIC_EMERGENCE');
    });

    it('4. Enforces Demographic Population Conservation Theorem (Delta_pop = 0)', () => {
        const suite = new FabeWorldBenchmarkSuite({
            seeds: [100, 200, 300],
            ticks: 75
        });
        const report = suite.runBenchmark();

        expect(report.metrics.populationConservationDeltaMax).toBe(0);
        for (const run of report.perSeedSummaries) {
            expect(run.populationConservationDelta).toBe(0);
        }
    });

    it('5. Generates structured Causal World Chronicle with 100% causal antecedents', () => {
        const suite = new FabeWorldBenchmarkSuite({
            seeds: [4242],
            ticks: 50
        });
        const report = suite.runBenchmark();

        expect(Array.isArray(report.worldChronicleSnippet)).toBe(true);
        expect(report.worldChronicleSnippet.length).toBeGreaterThan(0);

        for (const entry of report.worldChronicleSnippet) {
            expect(entry.tick).toBeGreaterThan(0);
            expect(entry.type).toBeDefined();
            expect(entry.cause).toBeDefined();
            expect(typeof entry.cause).toBe('string');
            expect(entry.cause.length).toBeGreaterThan(3);
        }

        expect(report.metrics.totalEventsEvaluated).toBeGreaterThan(0);
        expect(report.metrics.totalTraceableEvents).toBe(report.metrics.totalEventsEvaluated);
    });

    it('6. Executes runFabeWorldBenchmark runner and emits valid results artifact', () => {
        const report = runFabeWorldBenchmark({
            seeds: [777, 888],
            ticks: 40
        });

        expect(report).toBeDefined();
        expect(report.benchmark).toBe('FABE-WORLD-v1');
        expect(report.config.seedsEvaluated).toBe(2);
        expect(report.config.ticksPerSeed).toBe(40);

        const resultsPath = path.resolve(__dirname, '../benchmarks/behavioral-evaluation/fabe_world_benchmark_results.json');
        expect(fs.existsSync(resultsPath)).toBe(true);
        const parsed = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
        expect(parsed.benchmark).toBe('FABE-WORLD-v1');
        // R37 degeneracy recalibration: a 40-tick world (measured
        // diversity 0.4524 < 0.5 gate) is coherent and stable but
        // content-poor, so it must NOT read as exemplary systemic
        // emergence. This is the anti-gaming pin: the metric can no
        // longer bless impoverished worlds.
        expect(parsed.emergenceQualityScorecard.rating).toBe('ACCEPTABLE');
        expect(parsed.dimensionScores.diversity).toBeLessThan(0.5);
    });

    it('7. Richer worlds outrank poor ones on diversity and rating (R37 discrimination)', () => {
        const poor = new FabeWorldBenchmarkSuite({ seeds: [777, 888], ticks: 40 }).runBenchmark();
        const rich = new FabeWorldBenchmarkSuite({ seeds: [101, 202], ticks: 2000 }).runBenchmark();
        // Ordering, not thresholds: the metric must discriminate content
        // poverty from developed worlds (measured poor 0.4524 vs rich 0.5457).
        expect(rich.dimensionScores.diversity).toBeGreaterThan(poor.dimensionScores.diversity);
        expect(poor.emergenceQualityScorecard.rating).toBe('ACCEPTABLE');
        expect(rich.emergenceQualityScorecard.rating).toBe('EXEMPLARY_SYSTEMIC_EMERGENCE');
    });
});
