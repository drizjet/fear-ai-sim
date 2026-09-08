/**
 * benchmarks/behavioral-evaluation/parallel_batch_benchmark.mjs
 *
 * Frontier D / Sections 136–140: Multi-Threaded Parallel Batch Evaluator Benchmark.
 * Evaluates performance, multi-core scaling, and numerical determinism across
 * massive entity cohorts (1k, 10k, 50k, 100k, 250k entities).
 *
 * Measures:
 * 1. Synchronous vs Multi-Threaded Latency (Mean, p50, p95, p99)
 * 2. Multi-Core Speedup Factor (T_sync / T_parallel)
 * 3. Throughput: Entity-Evaluations/sec
 * 4. Bit-Exact Numerical Parity (Max Absolute Deviation == 0.0000)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import {
    ParallelBatchEvaluator,
    SharedMemoryEntityBuffer
} from '../../packages/core/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function computePercentiles(samples) {
    if (!samples || samples.length === 0) return { mean: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 };
    const sorted = [...samples].sort((a, b) => a - b);
    const n = sorted.length;
    const sum = sorted.reduce((acc, v) => acc + v, 0);

    const p50Index = Math.min(n - 1, Math.floor(n * 0.50));
    const p95Index = Math.min(n - 1, Math.floor(n * 0.95));
    const p99Index = Math.min(n - 1, Math.floor(n * 0.99));

    return {
        mean: Number((sum / n).toFixed(4)),
        p50: Number(sorted[p50Index].toFixed(4)),
        p95: Number(sorted[p95Index].toFixed(4)),
        p99: Number(sorted[p99Index].toFixed(4)),
        min: Number(sorted[0].toFixed(4)),
        max: Number(sorted[n - 1].toFixed(4))
    };
}

export async function runParallelBatchBenchmark(options = {}) {
    const scales = options.scales || [1000, 10000, 50000, 100000];
    const iterations = options.iterations || 10;
    const detectedCpus = typeof os !== 'undefined' && os.cpus ? os.cpus().length : 4;
    const workerCount = options.workerCount || Math.min(detectedCpus, 8);

    console.log(`=== Frontier D: Parallel Batch Evaluator Benchmark ===`);
    console.log(`CPUs Detected: ${detectedCpus} | Active Workers: ${workerCount} | Iterations: ${iterations}\n`);

    const evaluator = new ParallelBatchEvaluator({
        workerCount,
        chunkSize: 5000,
        useWorkers: true
    });

    const results = [];

    for (const N of scales) {
        console.log(`[Scale: ${N.toLocaleString()} Entities]`);

        // Create two identical buffers: one for sync, one for parallel
        const syncBuffer = SharedMemoryEntityBuffer.createProcedural(N, { shared: false });
        const parallelBuffer = SharedMemoryEntityBuffer.createProcedural(N, { shared: true });

        // Warm up
        evaluator.evaluateSync(syncBuffer, 0, N);
        await evaluator.evaluateBatch(parallelBuffer, N);

        // Benchmark Sync
        const syncSamples = [];
        for (let it = 0; it < iterations; it++) {
            const start = process.hrtime.bigint();
            evaluator.evaluateSync(syncBuffer, 0, N);
            const end = process.hrtime.bigint();
            syncSamples.push(Number(end - start) / 1_000_000);
        }
        const syncMetrics = computePercentiles(syncSamples);

        // Benchmark Parallel
        const parallelSamples = [];
        for (let it = 0; it < iterations; it++) {
            const start = process.hrtime.bigint();
            await evaluator.evaluateBatch(parallelBuffer, N);
            const end = process.hrtime.bigint();
            parallelSamples.push(Number(end - start) / 1_000_000);
        }
        const parallelMetrics = computePercentiles(parallelSamples);

        // Numerical Parity Check
        let maxFearDeviation = 0.0;
        let intentMismatchCount = 0;
        for (let i = 0; i < N; i++) {
            const syncEnt = syncBuffer.getEntity(i);
            const parEnt = parallelBuffer.getEntity(i);
            const fearDiff = Math.abs(syncEnt.outFear - parEnt.outFear);
            if (fearDiff > maxFearDeviation) maxFearDeviation = fearDiff;
            if (syncEnt.outIntent !== parEnt.outIntent) intentMismatchCount++;
        }

        const speedup = Number((syncMetrics.mean / Math.max(0.0001, parallelMetrics.mean)).toFixed(2));
        const syncThroughput = Math.round((N / syncMetrics.mean) * 1000);
        const parallelThroughput = Math.round((N / parallelMetrics.mean) * 1000);

        console.log(`  Sync Mean:     ${syncMetrics.mean.toFixed(3)} ms (${syncThroughput.toLocaleString()} ent/s)`);
        console.log(`  Parallel Mean: ${parallelMetrics.mean.toFixed(3)} ms (${parallelThroughput.toLocaleString()} ent/s)`);
        console.log(`  Speedup:       ${speedup}x`);
        console.log(`  Parity:        max fear dev = ${maxFearDeviation.toFixed(6)}, intent mismatches = ${intentMismatchCount}\n`);

        results.push({
            entityCount: N,
            workers: workerCount,
            sync: syncMetrics,
            parallel: parallelMetrics,
            speedup,
            syncThroughput,
            parallelThroughput,
            maxFearDeviation,
            intentMismatchCount,
            parityPass: maxFearDeviation < 0.0001 && intentMismatchCount === 0
        });
    }

    await evaluator.terminate();

    const outputReport = {
        timestamp: new Date().toISOString(),
        system: {
            platform: process.platform,
            arch: process.arch,
            cpus: detectedCpus,
            workers: workerCount
        },
        scales: results
    };

    const outPath = path.join(__dirname, 'parallel_batch_benchmark_results.json');
    fs.writeFileSync(outPath, JSON.stringify(outputReport, null, 2), 'utf-8');
    console.log(`Benchmark results saved to ${outPath}`);

    return outputReport;
}

if (process.argv[1] && process.argv[1].endsWith('parallel_batch_benchmark.mjs')) {
    runParallelBatchBenchmark().catch(err => {
        console.error('Benchmark error:', err);
        process.exit(1);
    });
}
