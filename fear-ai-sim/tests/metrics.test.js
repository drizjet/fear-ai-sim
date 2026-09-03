/**
 * Metrics Collector Tests
 * Phase 2: Metrics & Analytics (T2.1, T2.2)
 * 
 * Tests comprehensive metrics collection and fear distribution tracking
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { MetricsCollector } from '../metrics.js';
import { Agent } from '../agent.js';

describe('MetricsCollector', () => {
    let metrics;

    beforeEach(() => {
        metrics = new MetricsCollector();
        Agent.nextId = 0;
    });

    describe('Initialization (T2.1)', () => {
        it('should initialize with empty metrics', () => {
            expect(metrics.metrics.population).toEqual([]);
            expect(metrics.metrics.avgFear).toEqual([]);
            expect(metrics.metrics.stateTransitions).toEqual([]);
        });

        it('should initialize fear distribution buckets (T2.2)', () => {
            expect(metrics.metrics.fearDistribution.CALM).toEqual([]);
            expect(metrics.metrics.fearDistribution.ALERT).toEqual([]);
            expect(metrics.metrics.fearDistribution.ANXIOUS).toEqual([]);
            expect(metrics.metrics.fearDistribution.PANIC).toEqual([]);
        });

        it('should initialize state distribution buckets', () => {
            expect(metrics.metrics.stateDistribution.CALM).toEqual([]);
            expect(metrics.metrics.stateDistribution.PANIC).toEqual([]);
            expect(metrics.metrics.stateDistribution.HIDE).toEqual([]);
            expect(metrics.metrics.stateDistribution.RECOVER).toEqual([]);
        });

        it('should have max data points limit', () => {
            expect(metrics.maxDataPoints).toBe(1000);
        });
    });

    describe('Frame Recording (T2.1)', () => {
        it('should record population metrics', () => {
            const agents = [
                new Agent(100, 100),
                new Agent(200, 200),
                new Agent(300, 300)
            ];

            metrics.recordFrame(agents, [], {});

            expect(metrics.metrics.population.length).toBe(1);
            expect(metrics.metrics.population[0]).toBe(3);
        });

        it('should calculate average fear (T2.2)', () => {
            const agents = [
                new Agent(100, 100),
                new Agent(200, 200),
                new Agent(300, 300)
            ];
            agents[0].brain.currentFear = 0.1;
            agents[1].brain.currentFear = 0.5;
            agents[2].brain.currentFear = 0.9;

            metrics.recordFrame(agents, [], {});

            expect(metrics.metrics.avgFear.length).toBe(1);
            expect(metrics.metrics.avgFear[0]).toBeCloseTo(0.5, 5);
        });

        it('should track fear distribution (T2.2)', () => {
            const agents = [
                new Agent(100, 100),
                new Agent(200, 200),
                new Agent(300, 300),
                new Agent(400, 400)
            ];
            agents[0].brain.currentFear = 0.1; // CALM
            agents[1].brain.currentFear = 0.3; // ALERT
            agents[2].brain.currentFear = 0.6; // ANXIOUS
            agents[3].brain.currentFear = 0.9; // PANIC

            metrics.recordFrame(agents, [], {});

            expect(metrics.metrics.fearDistribution.CALM[0]).toBe(1);
            expect(metrics.metrics.fearDistribution.ALERT[0]).toBe(1);
            expect(metrics.metrics.fearDistribution.ANXIOUS[0]).toBe(1);
            expect(metrics.metrics.fearDistribution.PANIC[0]).toBe(1);
        });

        it('should track state distribution', () => {
            const agents = [
                new Agent(100, 100),
                new Agent(200, 200)
            ];
            agents[0].brain.state = 'CALM';
            agents[1].brain.state = 'PANIC';

            metrics.recordFrame(agents, [], {});

            expect(metrics.metrics.stateDistribution.CALM[0]).toBe(1);
            expect(metrics.metrics.stateDistribution.PANIC[0]).toBe(1);
        });

        it('should handle empty agent list', () => {
            metrics.recordFrame([], [], {});

            expect(metrics.metrics.population[0]).toBe(0);
            expect(metrics.metrics.avgFear[0]).toBe(0);
        });

        it('should record timestamps', () => {
            const before = Date.now();
            metrics.recordFrame([], [], {});
            const after = Date.now();

            expect(metrics.metrics.timestamps.length).toBe(1);
            expect(metrics.metrics.timestamps[0]).toBeGreaterThanOrEqual(before);
            expect(metrics.metrics.timestamps[0]).toBeLessThanOrEqual(after);
        });
    });

    describe('Fear Distribution Percentages (T2.2)', () => {
        it('should calculate fear distribution as percentages', () => {
            const agents = [
                new Agent(100, 100),
                new Agent(200, 200),
                new Agent(300, 300),
                new Agent(400, 400)
            ];
            agents[0].brain.currentFear = 0.1; // CALM
            agents[1].brain.currentFear = 0.1; // CALM
            agents[2].brain.currentFear = 0.9; // PANIC
            agents[3].brain.currentFear = 0.9; // PANIC

            metrics.recordFrame(agents, [], {});
            const dist = metrics.getFearDistributionPercentages();

            expect(parseFloat(dist.CALM)).toBe(50.0);
            expect(parseFloat(dist.PANIC)).toBe(50.0);
            expect(parseFloat(dist.ALERT)).toBe(0.0);
            expect(parseFloat(dist.ANXIOUS)).toBe(0.0);
        });

        it('should handle zero population', () => {
            metrics.recordFrame([], [], {});
            const dist = metrics.getFearDistributionPercentages();

            expect(dist).toEqual({ CALM: 0, ALERT: 0, ANXIOUS: 0, PANIC: 0 });
        });
    });

    describe('State Transitions (T2.1)', () => {
        it('should record state transitions', () => {
            metrics.recordStateTransition('CALM', 'ALERT', 1);
            metrics.recordStateTransition('ALERT', 'PANIC', 2);

            expect(metrics.metrics.stateTransitions.length).toBe(2);
            expect(metrics.metrics.stateTransitions[0]).toEqual({
                timestamp: expect.any(Number),
                from: 'CALM',
                to: 'ALERT',
                agentId: 1
            });
        });

        it('should count total panic events', () => {
            metrics.recordStateTransition('ALERT', 'PANIC', 1);
            metrics.recordStateTransition('CALM', 'PANIC', 2);

            expect(metrics.runningStats.totalPanicEvents).toBe(2);
        });

        it('should get state transition statistics', () => {
            metrics.recordStateTransition('CALM', 'ALERT', 1);
            metrics.recordStateTransition('CALM', 'ALERT', 2);
            metrics.recordStateTransition('ALERT', 'PANIC', 3);

            const stats = metrics.getStateTransitionStats();

            expect(stats['CALM->ALERT']).toBe(2);
            expect(stats['ALERT->PANIC']).toBe(1);
        });
    });

    describe('Death Recording (T2.1)', () => {
        it('should record death by predator', () => {
            const agent = new Agent(100, 100);
            metrics.recordDeath('predator', agent);

            expect(metrics.metrics.killsByPredator).toBe(1);
            expect(metrics.runningStats.totalAgentsDied).toBe(1);
        });

        it('should record death by starvation', () => {
            const agent = new Agent(100, 100);
            agent.age = 500;
            metrics.recordDeath('starvation', agent);

            expect(metrics.metrics.killsByStarvation).toBe(1);
            expect(metrics.metrics.survivalTime[0]).toBe(500);
        });

        it('should record death by age', () => {
            metrics.recordDeath('age', null);

            expect(metrics.metrics.killsByAge).toBe(1);
        });
    });

    describe('Birth Recording (T2.1)', () => {
        it('should record birth', () => {
            metrics.recordBirth(5);
            metrics.recordBirth(10);

            expect(metrics.runningStats.totalAgentsBorn).toBe(2);
        });

        it('should record birth without parent', () => {
            metrics.recordBirth();

            expect(metrics.runningStats.totalAgentsBorn).toBe(1);
        });
    });

    describe('Panic Chain Recording (T2.1)', () => {
        it('should record panic chain events', () => {
            metrics.recordPanicChain(5, 1);
            metrics.recordPanicChain(10, 2);

            expect(metrics.metrics.panicChains.length).toBe(2);
            expect(metrics.metrics.panicChains[0]).toEqual({
                timestamp: expect.any(Number),
                length: 5,
                sourceAgentId: 1
            });
        });
    });

    describe('Performance Summary (T2.1)', () => {
        it('should calculate performance summary', () => {
            // Add some FPS data
            metrics.metrics.fps = [60, 58, 59, 60, 61];

            const summary = metrics.getPerformanceSummary();

            expect(summary.avgFPS).toBeDefined();
            expect(summary.minFPS).toBeDefined();
            expect(summary.sessionDuration).toBeDefined();
        });

        it('should handle empty FPS data', () => {
            const summary = metrics.getPerformanceSummary();

            expect(parseFloat(summary.avgFPS)).toBe(0);
        });
    });

    describe('Export (T2.1)', () => {
        it('should export metrics as JSON', () => {
            metrics.recordFrame([new Agent(100, 100)], [], {});
            metrics.recordBirth();

            const exported = metrics.exportMetrics();
            const parsed = JSON.parse(exported);

            expect(parsed.metrics).toBeDefined();
            expect(parsed.runningStats).toBeDefined();
            expect(parsed.summary).toBeDefined();
        });
    });

    describe('Reset (T2.1)', () => {
        it('should reset all metrics', () => {
            metrics.recordFrame([new Agent(100, 100)], [], {});
            metrics.recordDeath('predator', null);
            metrics.runningStats.totalAgentsBorn = 10;

            metrics.reset();

            expect(metrics.metrics.population).toEqual([]);
            expect(metrics.metrics.killsByPredator).toBe(0);
            expect(metrics.runningStats.totalAgentsBorn).toBe(0);
            expect(metrics.lastMetrics).toBeNull();
        });
    });

    describe('Data Trimming (T2.1)', () => {
        it('should trim old data when exceeding max points', () => {
            // Add more than maxDataPoints entries
            for (let i = 0; i < 1100; i++) {
                metrics.metrics.timestamps.push(i);
                metrics.metrics.population.push(i);
            }

            metrics.trimOldData();

            expect(metrics.metrics.timestamps.length).toBeLessThanOrEqual(1000);
            expect(metrics.metrics.population.length).toBeLessThanOrEqual(1000);
        });
    });

    describe('Variance Calculation', () => {
        it('should calculate variance correctly', () => {
            const arr = [2, 4, 4, 4, 5, 5, 7, 9];
            const variance = metrics.calculateVariance(arr);

            // Population variance = 4
            expect(variance).toBe(4);
        });

        it('should return 0 for empty array', () => {
            expect(metrics.calculateVariance([])).toBe(0);
        });

        it('should return 0 for single element', () => {
            expect(metrics.calculateVariance([5])).toBe(0);
        });
    });

    describe('Survival Time Stats (T2.4)', () => {
        it('should calculate survival time statistics', () => {
            metrics.metrics.survivalTime = [100, 200, 300, 400, 500];
            const stats = metrics.getSurvivalTimeStats();

            expect(stats.avg).toBe(300);
            expect(stats.min).toBe(100);
            expect(stats.max).toBe(500);
            expect(stats.median).toBe(300);
            expect(stats.count).toBe(5);
        });

        it('should handle empty survival times', () => {
            const stats = metrics.getSurvivalTimeStats();
            expect(stats.avg).toBe(0);
        });
    });

    describe('Group Behavior Stats (T2.5)', () => {
        it('should calculate average group size in frame', () => {
            const agents = [
                { x: 10, y: 10, dead: false, brain: { currentFear: 0.1, state: 'CALM' } },
                { x: 15, y: 15, dead: false, brain: { currentFear: 0.1, state: 'CALM' } },
                { x: 100, y: 100, dead: false, brain: { currentFear: 0.1, state: 'CALM' } }
            ];

            metrics.recordFrame(agents, [], {});

            // Group 1: agents[0], agents[1] (size 2)
            // Group 2: agents[2] (size 1)
            // Avg group size: (2 + 1) / 2 = 1.5
            expect(metrics.metrics.groupSize[0]).toBe(1.5);
        });

        it('should get group size statistics', () => {
            metrics.metrics.groupSize = [1.5, 2.0, 2.5];
            const stats = metrics.getGroupSizeStats();

            expect(stats.avg).toBe(2.0);
            expect(stats.max).toBe(2.5);
            expect(stats.current).toBe(2.5);
        });
    });

    describe('State Transition Matrix (T2.3)', () => {
        it('should generate state transition matrix', () => {
            metrics.recordStateTransition('CALM', 'ALERT', 1);
            metrics.recordStateTransition('CALM', 'ALERT', 2);
            metrics.recordStateTransition('ALERT', 'PANIC', 3);
            metrics.recordStateTransition('PANIC', 'RECOVER', 4);

            const matrix = metrics.getStateTransitionMatrix();

            expect(matrix.CALM.ALERT).toBe(2);
            expect(matrix.ALERT.PANIC).toBe(1);
            expect(matrix.PANIC.RECOVER).toBe(1);
        });
    });
});
