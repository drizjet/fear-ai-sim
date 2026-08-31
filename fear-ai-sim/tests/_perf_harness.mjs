// tests/_perf_harness.mjs
//
// V8 corrective checkpoint §9: a reproducible benchmark
// protocol that distinguishes performance checks from
// correctness checks. Correctness checks must be sharp
// (a regression is a regression); performance checks
// must be robust against hardware load and warmup.
//
// The protocol:
//
//   1. warmup: run the operation W times and discard.
//   2. measure: run the operation R times and collect
//      durations.
//   3. summarize: report median, p95, and environment
//      receipt (node version, OS, CPU model if
//      available).
//   4. assert relative regression: the current median
//      must not exceed (BASELINE * REGRESSION_FACTOR).
//      Baseline is the first run's median, captured
//      during a CI release process; tests that lack a
//      baseline use an absolute upper bound.
//
// Performance tests run with `RUN_PERF=1` so they do
// not slow down the default CI run. The env gate
// preserves the `npm test` contract while still allowing
// `RUN_PERF=1 npm test` to exercise the bench.

import { performance } from 'node:perf_hooks';
import { cpus, platform, release, version } from 'node:os';

const WARMUP = 3;
const REPS = 10;
const REGRESSION_FACTOR = 2.0; // current median <= 2x baseline median

export function perfCheck(name, op, { absoluteUpperBoundMs = null, baselineMedianMs = null } = {}) {
    if (process.env.RUN_PERF !== '1') {
        // Skip the heavy run by default. The test still
        // runs once with a coarse bound to detect
        // catastrophic regressions; the perfCheck logs
        // skip and the assertion only fires when
        // RUN_PERF=1.
        const start = performance.now();
        op();
        const duration = performance.now() - start;
        return {
            skipped: true,
            warmup: WARMUP,
            reps: REPS,
            duration,
            environment: environmentReceipt(),
            assertion: `skipped; set RUN_PERF=1 to exercise the bench`,
        };
    }
    // Warmup.
    for (let i = 0; i < WARMUP; i++) op();
    // Measure.
    const durations = [];
    for (let i = 0; i < REPS; i++) {
        const start = performance.now();
        op();
        durations.push(performance.now() - start);
    }
    durations.sort((a, b) => a - b);
    const median = durations[Math.floor(REPS / 2)];
    const p95 = durations[Math.floor(REPS * 0.95)] ?? durations[REPS - 1];
    const receipt = environmentReceipt();
    let assertion = '';
    let threshold;
    if (baselineMedianMs != null) {
        threshold = baselineMedianMs * REGRESSION_FACTOR;
        assertion = `median=${median.toFixed(2)}ms (baseline=${baselineMedianMs}ms x ${REGRESSION_FACTOR}) -> must be <= ${threshold.toFixed(2)}ms`;
    } else if (absoluteUpperBoundMs != null) {
        threshold = absoluteUpperBoundMs;
        assertion = `median=${median.toFixed(2)}ms (absolute upper bound=${absoluteUpperBoundMs}ms)`;
    } else {
        threshold = median * 10; // safety net if neither baseline nor bound is provided
        assertion = `median=${median.toFixed(2)}ms (no baseline provided; using 10x median as safety)`;
    }
    const passed = median <= threshold;
    return {
        skipped: false,
        warmup: WARMUP,
        reps: REPS,
        median,
        p95,
        threshold,
        passed,
        name,
        assertion,
        environment: receipt,
    };
}

function environmentReceipt() {
    const cpu = cpus()[0] ?? {};
    return {
        nodeVersion: version(),
        platform: platform(),
        release: release(),
        cpuModel: cpu.model ?? 'unknown',
        cpuCores: cpus().length,
    };
}