#!/usr/bin/env node

/**
 * tools/verification/measure_session_bringup.mjs
 *
 * MEASUREMENT artifact: what batching the control plane actually buys a host at
 * session start.
 *
 * This is not a pass/fail gate and it makes no universal claim. It measures one
 * thing on one machine, with reproducible run metadata so the number can be
 * re-taken rather than believed:
 *
 *   "How long does a host with N agents spend registering them, and how long
 *    until its first advisory arrives?"
 *
 * WHY THE COMPARISON IS FAIR
 * Both strategies run against the SAME already-listening server, on the same
 * machine, in the same process, over the same loopback, with the same per-agent
 * payloads and the same working set. The only difference is how many control
 * REQUESTS carry that work: N sequential round trips (what a pre-batch client
 * had to do, since the control plane allows one request in flight) versus one
 * batched request. Nothing else is varied, so the measured delta isolates the
 * round-trip cost of the control plane rather than any change in the server's
 * per-agent work.
 *
 * The sequential strategy is a faithful model of the old client, not a
 * simulation of one: it issues real HTTP requests, one at a time, awaiting each
 * response before starting the next - which is exactly what a single-slot
 * HTTPRequest control plane does.
 *
 * WHAT IS DELIBERATELY NOT MEASURED
 * No host engine, no rendering, no physics, no WebSocket transport, and no
 * claim that these figures transfer to any other machine, Node version, or
 * network configuration beyond loopback.
 *
 * Hard Rule 9 compliant: standalone deterministic measurement, no test runner.
 */

import http from 'node:http';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { FearServer } from '../../packages/runtime/src/FearServer.js';

/** Scales to measure. 512 is the batch cap, so it is the largest single-request case. */
const SCALES = [64, 256, 512];
const TRIALS = 5;
const DT = 0.0166;

function gitCommit() {
    try {
        return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
        return 'unknown';
    }
}

function post(port, path, body) {
    const payload = JSON.stringify(body);
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1',
            port,
            path,
            method: 'POST',
            agent: false,
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let parsed = null;
                try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
                resolve({ status: res.statusCode, body: parsed });
            });
        });
        req.on('error', reject);
        req.end(payload);
    });
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function agentPayload(scale, i) {
    return {
        agent_id: `bringup_${scale}_${i}`,
        traits: {
            neuroticism: 0.35 + ((i % 5) * 0.05),
            resilience: 0.70 - ((i % 4) * 0.05),
            extraversion: 0.45 + ((i % 3) * 0.1),
            leadership: i === 0 ? 0.8 : 0.1
        },
        initial_position: { x: (i % 32) * 4, y: 0, z: Math.floor(i / 32) * 4 }
    };
}

/** One observation per agent, so the first tick is a full-population tick. */
function firstTickObservations(scale) {
    const observations = [];
    for (let i = 0; i < scale; i++) {
        observations.push({
            agent_id: `bringup_${scale}_${i}`,
            threats: [{ id: `threat_${i}`, type: 'PREDATOR', intensity: 0.6, distance: 12 }]
        });
    }
    return observations;
}

async function reset(port) {
    // Reset is untimed setup: it must not appear in either strategy's figure.
    await post(port, '/api/v1/reset', { clear_agents: true });
}

/**
 * Strategy A: one registration request per agent, sequentially.
 * This is the pre-batch control plane's only option.
 */
async function registerIndividually(port, scale) {
    const started = performance.now();
    for (let i = 0; i < scale; i++) {
        const res = await post(port, '/api/v1/register', agentPayload(scale, i));
        if (res.status !== 200) throw new Error(`individual registration failed at ${i}: ${res.status}`);
    }
    return performance.now() - started;
}

/** Strategy B: one batched registration request for the whole population. */
async function registerBatched(port, scale) {
    const agents = [];
    for (let i = 0; i < scale; i++) agents.push(agentPayload(scale, i));
    const started = performance.now();
    const res = await post(port, '/api/v1/register/batch', { agents });
    const elapsed = performance.now() - started;
    if (res.status !== 200 || res.body.count !== scale) {
        throw new Error(`batch registration failed: ${res.status} count=${res.body?.count}`);
    }
    return elapsed;
}

/** Time from "registration finished" to "first advisory for the whole population". */
async function timeToFirstAdvisory(port, scale) {
    const started = performance.now();
    const res = await post(port, '/api/v1/tick', { dt: DT, observations: firstTickObservations(scale) });
    const elapsed = performance.now() - started;
    if (res.status !== 200) throw new Error(`first tick failed: ${res.status}`);
    const returned = Array.isArray(res.body.results) ? res.body.results.length : 0;
    if (returned !== scale) throw new Error(`first tick returned ${returned} of ${scale} agents`);
    return elapsed;
}

async function main() {
    console.log('============================================================');
    console.log('MEASURE SESSION BRING-UP: BATCHED vs PER-AGENT REGISTRATION');
    console.log('============================================================\n');

    const server = new FearServer({ host: '127.0.0.1', port: 0, seed: 61000 });
    const { port } = await server.start();

    const results = [];
    try {
        for (const scale of SCALES) {
            const individual = [];
            const batched = [];
            const firstAdvisoryIndividual = [];
            const firstAdvisoryBatched = [];

            // Warmup on the first scale only: the point is a warm process, not a
            // warm JSON parser, and each scale re-creates the same working set.
            const warmups = scale === SCALES[0] ? 2 : 1;
            for (let t = -warmups; t < TRIALS; t++) {
                await reset(port);
                const individualMs = await registerIndividually(port, scale);
                const individualFirst = await timeToFirstAdvisory(port, scale);

                await reset(port);
                const batchedMs = await registerBatched(port, scale);
                const batchedFirst = await timeToFirstAdvisory(port, scale);

                if (t < 0) continue;
                individual.push(individualMs);
                batched.push(batchedMs);
                firstAdvisoryIndividual.push(individualFirst);
                firstAdvisoryBatched.push(batchedFirst);
            }

            const medIndividual = median(individual);
            const medBatched = median(batched);
            const medFirstIndividual = median(firstAdvisoryIndividual);
            const medFirstBatched = median(firstAdvisoryBatched);

            results.push({
                agents: scale,
                trials: TRIALS,
                register_individual_ms: medIndividual,
                register_batched_ms: medBatched,
                register_speedup: medIndividual / medBatched,
                register_saved_ms: medIndividual - medBatched,
                per_request_ms_individual: medIndividual / scale,
                first_advisory_ms_individual: medFirstIndividual,
                first_advisory_ms_batched: medFirstBatched,
                // The number a host actually feels: from "start registering" to
                // "first advisory for the whole population".
                bringup_individual_ms: medIndividual + medFirstIndividual,
                bringup_batched_ms: medBatched + medFirstBatched,
                requests_individual: scale,
                requests_batched: 1
            });

            const r = results[results.length - 1];
            console.log(`--- ${scale} agents ---`);
            console.log(`  per-agent registration : ${r.register_individual_ms.toFixed(1)} ms over ${scale} requests (${r.per_request_ms_individual.toFixed(3)} ms/request)`);
            console.log(`  batched registration   : ${r.register_batched_ms.toFixed(1)} ms over 1 request`);
            console.log(`  registration saved     : ${r.register_saved_ms.toFixed(1)} ms (${r.register_speedup.toFixed(1)}x)`);
            console.log(`  to first full advisory : ${r.bringup_individual_ms.toFixed(1)} ms -> ${r.bringup_batched_ms.toFixed(1)} ms`);
            console.log('');
        }
    } finally {
        await server.stop();
    }

    const report = {
        measured_at: new Date().toISOString(),
        commit: gitCommit(),
        runtime: {
            node: process.version,
            v8: process.versions.v8,
            platform: `${os.type()} ${os.release()} (${os.arch()})`,
            cpus: os.cpus().map((c) => c.model).filter((m, i, a) => a.indexOf(m) === i),
            cpu_count: os.cpus().length
        },
        method: {
            transport: 'loopback HTTP/1.1, keep-alive disabled per request (agent: false)',
            trials: TRIALS,
            statistic: 'median',
            reset_between_trials: true,
            sequential_model: 'one awaited request per agent, matching a single-slot HTTPRequest control plane'
        },
        scales: results
    };

    console.log('============================================================');
    console.log(JSON.stringify(report, null, 2));
    console.log('============================================================');
    console.log('\nScope: headless Node middleware bring-up over loopback only.');
    console.log('No host-engine, rendering, physics, or cross-machine claim.');
}

main().catch((error) => {
    console.error('MEASUREMENT FAILURE:', error);
    process.exit(1);
});
