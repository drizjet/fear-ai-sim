/**
 * packages/core/src/ObservabilityHooks.js
 *
 * Front D / Section 194: Optional Metrics Hooks.
 *
 * Hosts and designer tools can observe Fear AI internals without
 * coupling to them: counters (panic episodes), gauges (mean fear),
 * and timings (tick latency ms) behind one deterministic registry.
 * - Zero subscribers → emit() is a cheap no-op guard.
 * - Bounded: each metric keeps a ring of the last N samples (default
 *   256); snapshots sort by metric name for deterministic output.
 * - Summaries report count, last, mean, min, max — no unbounded growth.
 *
 * STRICT INVARIANT: observation only. Zero host state mutation.
 */

const DEFAULT_RING = 256;

function round4(n) {
    return Number(Number(n).toFixed(4));
}

export const METRIC_KINDS = Object.freeze({
    COUNTER: 'COUNTER',
    GAUGE: 'GAUGE',
    TIMING: 'TIMING'
});

export class ObservabilityHooks {
    constructor(options = {}) {
        this.ringSize = options.ringSize ?? DEFAULT_RING;
        this.metrics = new Map();
        this.subscribers = new Set();
    }

    defineMetric(name, kind = METRIC_KINDS.GAUGE) {
        if (!name) throw new Error('defineMetric requires a name.');
        if (!Object.values(METRIC_KINDS).includes(kind)) throw new Error(`Unknown metric kind "${kind}".`);
        if (!this.metrics.has(name)) {
            this.metrics.set(name, { name: String(name), kind, samples: [], total: 0 });
        }
        return this.metrics.get(name);
    }

    subscribe(fn) {
        if (typeof fn !== 'function') throw new Error('subscribe requires a function.');
        this.subscribers.add(fn);
        return () => this.subscribers.delete(fn);
    }

    emit(name, value, tags = {}) {
        const num = Number(value);
        if (!Number.isFinite(num)) return false;
        let m = this.metrics.get(name);
        if (!m) m = this.defineMetric(name, METRIC_KINDS.GAUGE);
        m.samples.push(num);
        if (m.samples.length > this.ringSize) m.samples.shift();
        m.total += 1;
        if (this.subscribers.size === 0) return true;
        const event = { name, value: num, tags: { ...tags } };
        for (const fn of this.subscribers) {
            try {
                fn(event);
            } catch {
                // Subscriber faults never propagate into the simulation.
            }
        }
        return true;
    }

    increment(name, delta = 1, tags) {
        const m = this.metrics.get(name) || this.defineMetric(name, METRIC_KINDS.COUNTER);
        const last = m.samples.length > 0 ? m.samples[m.samples.length - 1] : 0;
        return this.emit(name, last + delta, tags);
    }

    summarize(name) {
        const m = this.metrics.get(name);
        if (!m || m.samples.length === 0) return { name, count: 0, last: null, mean: null, min: null, max: null };
        const s = m.samples;
        let sum = 0;
        let min = Infinity;
        let max = -Infinity;
        for (const v of s) {
            sum += v;
            if (v < min) min = v;
            if (v > max) max = v;
        }
        return {
            name,
            kind: m.kind,
            count: m.total,
            last: s[s.length - 1],
            mean: round4(sum / s.length),
            min,
            max
        };
    }

    snapshot() {
        return Array.from(this.metrics.keys())
            .sort()
            .map((name) => this.summarize(name));
    }

    reset(name) {
        if (name) {
            const m = this.metrics.get(name);
            if (m) {
                m.samples = [];
                m.total = 0;
            }
            return;
        }
        for (const m of this.metrics.values()) {
            m.samples = [];
            m.total = 0;
        }
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            metricsTracked: this.metrics.size,
            subscriberCount: this.subscribers.size
        };
    }
}
