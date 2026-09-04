/**
 * Performance Benchmarks for Fear-AI Simulator
 *
 * V8 corrective checkpoint §9 (2026-08-31): this suite
 * was previously a collection of absolute micro-timing
 * checks (e.g., "mutate 1000 agents within 10ms"). On a
 * Windows machine with cold cache, even a clean run can
 * exceed 10ms; on a busy CI node it can exceed 30ms.
 * Absolute thresholds mask real regressions and trip on
 * noise.
 *
 * The hardened protocol (tests/_perf_harness.mjs):
 *   1. warmup runs to warm V8 caches;
 *   2. measure REPS iterations and collect durations;
 *   3. report median + p95 + environment receipt;
 *   4. assert relative regression against a captured
 *      baseline median (or, where no baseline exists,
 *      against an absolute upper bound that allows for
 *      100x slowdown before declaring a regression).
 *
 * By default the bench is skipped (a single coarse
 * check still runs). Set RUN_PERF=1 to exercise the
 * full bench. The skip preserves the fast `npm test`
 * contract while letting `RUN_PERF=1 npm test` run the
 * reproducible protocol.
 */

import { describe, it, expect } from '@jest/globals';
import { Agent } from '../agent.js';
import { Brain } from '../brain.js';
import { perfCheck } from './_perf_harness.mjs';

describe('Performance Benchmarks (V8 corrective checkpoint §9 reproducible protocol)', () => {
    // TM-TEMP-11: every bench runs a real single measurement in
    // default mode too. The catastrophic bound (100x the bench
    // bound) is a tripwire for hangs/pathologies, not a perf
    // assertion — the median check under RUN_PERF=1 is the real
    // oracle. A test asserting nothing in default mode is vacuous.
    function expectCatastrophicBound(r, boundMs) {
        if (r.skipped) expect(r.duration).toBeLessThanOrEqual(boundMs * 100);
    }


    describe('Agent Update Performance', () => {
        it('2000 agents update: median <= 100ms', () => {
            const agents = [];
            for (let i = 0; i < 2000; i++) {
                agents.push(new Agent(Math.random() * 800, Math.random() * 600));
            }
            const op = () => agents.forEach(agent => {
                if (!agent.dead) {
                    agent.age += 1;
                    agent.energy -= 0.05;
                    agent.brain.currentFear *= 0.95;
                }
            });
            const r = perfCheck('2000-agents-update', op, { absoluteUpperBoundMs: 100 });
            if (!r.skipped) expect(r.median).toBeLessThanOrEqual(r.threshold);
            expectCatastrophicBound(r, 100);
        });

        it('Social forces (50 neighbors): median <= 10ms', () => {
            const agent = new Agent(400, 300);
            const neighbors = [];
            for (let i = 0; i < 50; i++) {
                neighbors.push(new Agent(400 + (Math.random() - 0.5) * 100, 300 + (Math.random() - 0.5) * 100));
            }
            const op = () => {
                let socialForce = { ax: 0, ay: 0 };
                neighbors.forEach(other => {
                    const dx = agent.x - other.x;
                    const dy = agent.y - other.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 40) {
                        const repulsionScale = 2 * Math.exp((10 - dist) / 5);
                        socialForce.ax += (dx / (dist || 1)) * repulsionScale;
                        socialForce.ay += (dy / (dist || 1)) * repulsionScale;
                    }
                });
                return socialForce;
            };
            const r = perfCheck('social-forces-50', op, { absoluteUpperBoundMs: 10 });
            if (!r.skipped) expect(r.median).toBeLessThanOrEqual(r.threshold);
            expectCatastrophicBound(r, 10);
        });
    });

    describe('Brain Decision Performance', () => {
        it('Brain decide(): median <= 5ms', () => {
            const agent = new Agent(400, 300);
            const brain = agent.brain;
            const op = () => {
                const percievedThreat = brain.calculateStimulusResponse(0, 0);
                brain.currentFear = Math.max(brain.currentFear * 0.95, percievedThreat * brain.traits.fear);
                if (brain.currentFear > 0.8) brain.state = 'PANIC';
                else if (brain.currentFear > 0.5) brain.state = 'ANXIOUS';
                else if (brain.currentFear > 0.2) brain.state = 'ALERT';
                else brain.state = 'CALM';
                return brain.state;
            };
            const r = perfCheck('brain-decide', op, { absoluteUpperBoundMs: 5 });
            if (!r.skipped) expect(r.median).toBeLessThanOrEqual(r.threshold);
            expectCatastrophicBound(r, 5);
        });

        it('1000 stimulus calculations: median <= 50ms', () => {
            const brain = new Brain();
            const op = () => {
                for (let i = 0; i < 1000; i++) {
                    brain.calculateStimulusResponse(Math.floor(Math.random() * 10), Math.random());
                }
            };
            const r = perfCheck('1000-stimulus', op, { absoluteUpperBoundMs: 50 });
            if (!r.skipped) expect(r.median).toBeLessThanOrEqual(r.threshold);
            expectCatastrophicBound(r, 50);
        });
    });

    describe('Trait Mutation Performance', () => {
        it('1000 trait mutations: median <= 50ms (relative baseline, 2x median guard)', () => {
            const agents = [];
            for (let i = 0; i < 1000; i++) {
                agents.push(new Agent(Math.random() * 800, Math.random() * 600));
            }
            const op = () => agents.forEach(agent => {
                agent.brain.mutate(0.1);
            });
            const r = perfCheck('1000-mutations', op, { absoluteUpperBoundMs: 50 });
            if (!r.skipped) expect(r.median).toBeLessThanOrEqual(r.threshold);
            expectCatastrophicBound(r, 50);
        });
    });

    describe('Panic Propagation Performance', () => {
        it('panic propagation 1000 agents: median <= 100ms', () => {
            const agents = [];
            for (let i = 0; i < 1000; i++) {
                const agent = new Agent(Math.random() * 800, Math.random() * 600);
                agent.brain.state = 'CALM';
                agents.push(agent);
            }
            agents[0].brain.state = 'PANIC';
            agents[0].brain.currentFear = 1.0;
            const op = () => {
                agents.forEach((agent, index) => {
                    if (index < 5) {
                        agent.brain.state = 'PANIC';
                        return;
                    }
                    const nearbyAgents = agents.slice(Math.max(0, index - 10), index);
                    const panickingNearby = nearbyAgents.filter(a => a.brain.state === 'PANIC').length;
                    if (panickingNearby > 2) {
                        agent.brain.currentFear += 0.2;
                        if (agent.brain.currentFear > 0.8) {
                            agent.brain.state = 'PANIC';
                        }
                    }
                });
                return agents.filter(a => a.brain.state === 'PANIC').length;
            };
            const r = perfCheck('panic-propagation-1000', op, { absoluteUpperBoundMs: 100 });
            if (!r.skipped) expect(r.median).toBeLessThanOrEqual(r.threshold);
            expectCatastrophicBound(r, 100);
        });
    });

    describe('Memory Usage Benchmarks', () => {
        it('agent memory footprint under 100MB (measured heap delta)', () => {
            // TM-TEMP-11: the old test asserted hardcoded arithmetic
            // (1000 * 500 bytes < 100MB) and measured nothing. This
            // asserts the actual heap delta of materializing agents.
            if (global.gc) global.gc();
            const before = process.memoryUsage().heapUsed;
            const agents = [];
            const count = 1000;
            for (let i = 0; i < count; i++) {
                agents.push(new Agent(Math.random() * 800, Math.random() * 600));
            }
            const after = process.memoryUsage().heapUsed;
            expect(agents.length).toBe(count);
            expect(after - before).toBeLessThan(100 * 1024 * 1024);
        });
    });
});