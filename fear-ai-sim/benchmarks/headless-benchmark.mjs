/**
 * Headless Performance & Scale Benchmark Suite
 * Measures tick throughput, p50/p95/p99 latency, and heap stability across
 * 1, 10, 100, 1,000, and 5,000 agents.
 */

import { RuntimeSimulation } from '../packages/runtime/index.js';

function formatNumber(num) {
    return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function calculatePercentiles(latenciesMs) {
    const sorted = [...latenciesMs].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.50)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    return { min, p50, p95, p99, max };
}

async function runBenchmarkForScale(agentCount, tickCount = 100) {
    if (global.gc) global.gc();
    const memBefore = process.memoryUsage().heapUsed;

    const sim = new RuntimeSimulation({ seed: 42 });

    // 1. Setup Agents
    for (let i = 0; i < agentCount; i++) {
        const x = (i % 50) * 10;
        const y = Math.floor(i / 50) * 10;
        sim.registerAgent(`agent_${i}`, {
            neuroticism: 0.2 + (i % 7) * 0.1,
            fear: 0.3 + (i % 5) * 0.1,
            extraversion: 0.5,
            resilience: 0.5
        }, {
            initial_position: { x, y, z: 0 }
        });
    }

    // Add trauma zones
    sim.addTraumaZone(100, 100, 0, 1.0, 150, 1800);
    sim.addTraumaZone(250, 250, 0, 0.8, 120, 1800);

    const latenciesMs = [];

    // 2. Warmup (10 ticks)
    for (let t = 0; t < 10; t++) {
        sim.tick(0.016);
    }

    // 3. Timed Benchmark
    const startTime = performance.now();

    for (let t = 0; t < tickCount; t++) {
        // Queue observations for a fraction of agents (active sensory changes)
        const activeCount = Math.min(agentCount, 50);
        for (let i = 0; i < activeCount; i++) {
            sim.queueObservation(`agent_${i}`, {
                x: (i % 50) * 10 + Math.sin(t * 0.1) * 5,
                y: Math.floor(i / 50) * 10 + Math.cos(t * 0.1) * 5,
                threats: (t % 10 === 0) ? [{ id: 'creature', type: 'PREDATOR', distance: 12, intensity: 0.8 }] : []
            });
        }

        const tickStart = performance.now();
        sim.tick(0.016);
        const tickEnd = performance.now();
        latenciesMs.push(tickEnd - tickStart);
    }

    const totalTimeMs = performance.now() - startTime;
    const memAfter = process.memoryUsage().heapUsed;
    const memDeltaMb = (memAfter - memBefore) / (1024 * 1024);

    const stats = calculatePercentiles(latenciesMs);
    const avgLatencyMs = totalTimeMs / tickCount;
    const ticksPerSec = (tickCount / (totalTimeMs / 1000));
    const agentTicksPerSec = (agentCount * tickCount) / (totalTimeMs / 1000);

    return {
        agentCount,
        tickCount,
        totalTimeMs,
        avgLatencyMs,
        p50Ms: stats.p50,
        p95Ms: stats.p95,
        p99Ms: stats.p99,
        ticksPerSec,
        agentTicksPerSec,
        memDeltaMb
    };
}

async function runFullBenchmark() {
    console.log('╔═══════════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║               FEAR AI HEADLESS CORE - SCALE & LATENCY BENCHMARK                       ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════════════════════╝\n');

    const scales = [1, 10, 100, 1000, 5000];
    const results = [];

    console.log('Running benchmarks across scales (1 to 5,000 agents)...');
    console.log('-----------------------------------------------------------------------------------------');
    console.log(
        'Agents'.padEnd(8) +
        'Avg Tick (ms)'.padEnd(16) +
        'p50 (ms)'.padEnd(12) +
        'p95 (ms)'.padEnd(12) +
        'p99 (ms)'.padEnd(12) +
        'Ticks/sec'.padEnd(14) +
        'Agent-Ticks/sec'.padEnd(18) +
        '60FPS Budget'
    );
    console.log('-----------------------------------------------------------------------------------------');

    for (const count of scales) {
        const tickCount = count >= 5000 ? 50 : 100;
        const res = await runBenchmarkForScale(count, tickCount);
        results.push(res);

        const withinBudget = res.avgLatencyMs < 16.6 ? ' PASS (<16ms)' : ' WARN (>16ms)';

        console.log(
            String(res.agentCount).padEnd(8) +
            (res.avgLatencyMs.toFixed(3) + ' ms').padEnd(16) +
            (res.p50Ms.toFixed(3) + ' ms').padEnd(12) +
            (res.p95Ms.toFixed(3) + ' ms').padEnd(12) +
            (res.p99Ms.toFixed(3) + ' ms').padEnd(12) +
            formatNumber(res.ticksPerSec).padEnd(14) +
            formatNumber(res.agentTicksPerSec).padEnd(18) +
            withinBudget
        );
    }

    console.log('-----------------------------------------------------------------------------------------\n');
    console.log('Key Performance Takeaways:');
    const res1k = results.find(r => r.agentCount === 1000);
    if (res1k) {
        console.log(`[+] 1,000 Agents Latency: ${res1k.avgLatencyMs.toFixed(3)} ms per tick (Target: < 16.6 ms).`);
        console.log(`[+] 1,000 Agents Throughput: ${formatNumber(res1k.agentTicksPerSec)} agent evaluations/second.`);
    }
}

runFullBenchmark().catch(console.error);
