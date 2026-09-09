/**
 * @file fabe-chunk-integration.test.js
 *
 * Sections CXLVI-CXLIX + CL-CLIII: chunk-era FABE dimensions with
 * frozen thresholds, hard-negative baseline, and governance checks.
 */

import { describe, it, expect } from '@jest/globals';
import {
    FabeChunkIntegrationSuite,
    CHUNK_BENCHMARK_DIMENSIONS,
    CHUNK_DIMENSION_THRESHOLDS
} from '../packages/core/index.js';
import { runFabeChunkIntegrationBenchmark } from '../benchmarks/behavioral-evaluation/fabe_chunk_integration.mjs';

describe('FABE chunk integration dimensions (Sections CXLVI-CXLIX)', () => {
    it('1. All six dimensions pass frozen thresholds', () => {
        const suite = new FabeChunkIntegrationSuite({ seeds: [11, 22, 33] });
        const report = suite.runBenchmark();
        for (const dim of Object.values(CHUNK_BENCHMARK_DIMENSIONS)) {
            const score = report.dimensionScores[dim];
            expect(typeof score).toBe('number');
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(1);
            expect(score).toBeGreaterThanOrEqual(CHUNK_DIMENSION_THRESHOLDS[dim]);
        }
        expect(report.allPass).toBe(true);
    });

    it('2. Hard-negative baseline reported without superiority claims', () => {
        const suite = new FabeChunkIntegrationSuite({ seeds: [11, 22, 33] });
        const report = suite.runBenchmark();
        expect(typeof report.naiveTraitVectorBaseline).toBe('number');
        // Honest parity: curves buy interpretability, not retrieval accuracy.
        expect(report.dimensionScores.SIGNATURE_TRACEABILITY).toBeGreaterThanOrEqual(0.9);
    });

    it('3. Benchmark runner module reproduces suite results', () => {
        const via = runFabeChunkIntegrationBenchmark({ seeds: [11, 22, 33] });
        const direct = new FabeChunkIntegrationSuite({ seeds: [11, 22, 33] }).runBenchmark();
        expect(via).toEqual(direct);
    });

    it('4. Scores deterministic across repeated runs', () => {
        const a = new FabeChunkIntegrationSuite({ seeds: [7, 77] }).runBenchmark();
        const b = new FabeChunkIntegrationSuite({ seeds: [7, 77] }).runBenchmark();
        expect(a).toEqual(b);
        expect(a.dimensionScores.CHAIN_INTEGRITY).toBe(1);
        expect(a.dimensionScores.FIDELITY_ROBUSTNESS).toBe(1);
    });
});
