/**
 * tools/verification/measure_runtime_performance.mjs
 *
 * Measures the JavaScript RuntimeSimulation tick path with reproducible run
 * metadata. This is a measurement artifact, not a universal pass/fail gate:
 * host Rust simulation timings and JS middleware timings must remain separate.
 */

import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { RuntimeSimulation } from '../../packages/runtime/src/RuntimeSimulation.js';

const WARMUP_TICKS = 10;
const MEASURED_TICKS = 100;
const SCALES = [32, 128, 512];

function quantile(sorted, p) {
    if (sorted.length === 0) return null;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
    return sorted[index];
}

function gitCommit() {
    try {
        return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
        return 'unknown';
    }
}

function createSimulation(agentCount) {
    const sim = new RuntimeSimulation({ seed: 61000 + agentCount });
    for (let i = 0; i < agentCount; i++) {
        sim.registerAgent(`perf-${agentCount}-${i}`, {
            neuroticism: 0.35 + ((i % 5) * 0.05),
            resilience: 0.70 - ((i % 4) * 0.05),
            extraversion: 0.45 + ((i % 3) * 0.1),
            leadership: i === 0 ? 0.8 : 0.1
        }, {
            initial_position: {
                x: (i % 32) * 4,
                y: 0,
                z: Math.floor(i / 32) * 4
            }
        });
    }
    return sim;
}

function measureScale(agentCount) {
    const sim = createSimulation(agentCount);
    for (let i = 0; i < WARMUP_TICKS; i++) sim.tick(0.0166);

    const before = process.memoryUsage();
    const samples = [];
    let outputCount = 0;
    for (let i = 0; i < MEASURED_TICKS; i++) {
        const start = performance.now();
        const outputs = sim.tick(0.0166);
        samples.push(performance.now() - start);
        outputCount = outputs.length;
    }
    const after = process.memoryUsage();
    const sorted = [...samples].sort((a, b) => a - b);
    const meanMs = samples.reduce((sum, value) => sum + value, 0) / samples.length;

    return {
        agentCount,
        warmupTicks: WARMUP_TICKS,
        measuredTicks: MEASURED_TICKS,
        outputCount,
        meanMs,
        p50Ms: quantile(sorted, 0.50),
        p95Ms: quantile(sorted, 0.95),
        p99Ms: quantile(sorted, 0.99),
        maxMs: sorted[sorted.length - 1],
        heapUsedBeforeBytes: before.heapUsed,
        heapUsedAfterBytes: after.heapUsed,
        rssBeforeBytes: before.rss,
        rssAfterBytes: after.rss,
        finalTick: sim.tickCount,
        finalAgentCount: sim.agents.size
    };
}

const report = {
    measuredAtUtc: new Date().toISOString(),
    gitCommit: gitCommit(),
    node: process.version,
    nodeVersions: process.versions,
    platform: {
        os: os.platform(),
        release: os.release(),
        arch: os.arch(),
        cpuModel: os.cpus()[0]?.model || 'unknown',
        cpuCount: os.cpus().length,
        totalMemoryBytes: os.totalmem()
    },
    benchmark: {
        subsystem: 'RuntimeSimulation.tick',
        hostAuthority: 'JS middleware only; no host physics, movement, combat, or inventory',
        dtSeconds: 0.0166,
        scales: SCALES,
        warmupTicks: WARMUP_TICKS,
        measuredTicks: MEASURED_TICKS,
        timingClock: 'node:perf_hooks performance.now()'
    },
    results: SCALES.map(measureScale)
};

console.log(JSON.stringify(report, null, 2));
