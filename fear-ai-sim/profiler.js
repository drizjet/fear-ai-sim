/**
 * profiler.js - Real-time performance profiler for Fear AI
 * Identifies exact bottlenecks without reducing features
 */

export class Profiler {
    constructor() {
        this.timings = new Map();
        this.activeTimers = new Map();
        this.frameStats = [];
        this.maxFrames = 60;
        this.enabled = true;
    }

    start(label) {
        if (!this.enabled) return;
        this.activeTimers.set(label, performance.now());
    }

    end(label) {
        if (!this.enabled) return;
        const start = this.activeTimers.get(label);
        if (!start) return;

        const duration = performance.now() - start;
        this.activeTimers.delete(label);

        if (!this.timings.has(label)) {
            this.timings.set(label, []);
        }
        const times = this.timings.get(label);
        times.push(duration);
        if (times.length > this.maxFrames) times.shift();
    }

    profile(label, fn) {
        this.start(label);
        const result = fn();
        this.end(label);
        return result;
    }

    getReport() {
        const report = {};
        let totalTime = 0;

        for (const [label, times] of this.timings) {
            const avg = times.reduce((a, b) => a + b, 0) / times.length;
            const max = Math.max(...times);
            const min = Math.min(...times);
            const last = times[times.length - 1];

            report[label] = {
                avg: avg.toFixed(2),
                max: max.toFixed(2),
                min: min.toFixed(2),
                last: last.toFixed(2),
                total: (avg * times.length / 1000).toFixed(2)
            };
            totalTime += avg;
        }

        return { sections: report, totalTime: totalTime.toFixed(2) };
    }

    getWorstBottleneck() {
        let worst = null;
        let worstTime = 0;

        for (const [label, times] of this.timings) {
            const avg = times.reduce((a, b) => a + b, 0) / times.length;
            if (avg > worstTime) {
                worstTime = avg;
                worst = label;
            }
        }

        return worst ? { section: worst, time: worstTime.toFixed(2) } : null;
    }

    logReport() {
        const report = this.getReport();
        const bottleneck = this.getWorstBottleneck();

        console.group('🔥 Performance Profile');
        console.log(`Total profiled time: ${report.totalTime}ms`);

        if (bottleneck) {
            console.warn(`⚠️  Worst bottleneck: ${bottleneck.section} (${bottleneck.time}ms avg)`);
        }

        // Sort by average time
        const sorted = Object.entries(report.sections)
            .sort((a, b) => parseFloat(b[1].avg) - parseFloat(a[1].avg));

        for (const [label, stats] of sorted.slice(0, 10)) {
            const warning = parseFloat(stats.avg) > 5 ? '⚠️ ' : '✅ ';
            console.log(`${warning}${label}: ${stats.avg}ms avg (max: ${stats.max}ms)`);
        }

        console.groupEnd();
    }

    reset() {
        this.timings.clear();
        this.activeTimers.clear();
    }
}

export const profiler = new Profiler();

/**
 * Instrument simulation update loop for profiling
 */
export function instrumentSimulation(simulation) {
    const originalUpdate = simulation.update.bind(simulation);

    simulation.update = function() {
        profiler.start('frame');

        // Profile predator updates
        profiler.profile('predators', () => {
            if (this.predators) {
                for (const p of this.predators) {
                    p.update(this.agents, this.width, this.height, this.predators, this.spatialHash);
                }
            }
        });

        // Profile agent updates
        profiler.profile('agents', () => {
            if (this.agents) {
                for (const agent of this.agents) {
                    if (!agent.dead) {
                        agent.update(this.width, this.height);
                    }
                }
            }
        });

        // Profile spatial hash rebuild
        profiler.profile('spatialHash', () => {
            if (this.spatialHash) {
                this.spatialHash.clear();
                for (const agent of this.agents) {
                    if (!agent.dead) {
                        this.spatialHash.insert(agent.x, agent.y, agent);
                    }
                }
            }
        });

        // Profile rendering
        profiler.profile('render', () => {
            if (this.draw) {
                this.draw();
            }
        });

        profiler.end('frame');

        // Log every 60 frames
        if (this.frameCount % 60 === 0) {
            profiler.logReport();
        }
    };

    console.log('[Profiler] Simulation instrumented');
}
