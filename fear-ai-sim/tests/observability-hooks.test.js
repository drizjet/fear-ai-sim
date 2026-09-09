/**
 * @file observability-hooks.test.js
 *
 * Front D / Section 194: Optional Metrics Hooks.
 */

import { ObservabilityHooks } from '../packages/core/index.js';

describe('Front D / Section 194: Observability Hooks', () => {
    test('1. Counters gauges and timings summarize deterministically', () => {
        const h = new ObservabilityHooks();
        h.defineMetric('mean_fear', 'GAUGE');
        for (const f of [0.2, 0.4, 0.6]) h.emit('mean_fear', f);
        const s = h.summarize('mean_fear');
        expect(s.count).toBe(3);
        expect(s.mean).toBeCloseTo(0.4, 4);
        expect(s.min).toBe(0.2);
        expect(s.max).toBe(0.6);
        expect(h.increment('panics')).toBe(true);
        expect(h.summarize('panics').last).toBe(1);
    });

    test('2. Non-finite samples rejected without corrupting state', () => {
        const h = new ObservabilityHooks();
        expect(h.emit('x', NaN)).toBe(false);
        expect(h.emit('x', Infinity)).toBe(false);
        expect(h.summarize('x').count).toBe(0);
    });

    test('3. Subscriber faults never propagate into simulation', () => {
        const h = new ObservabilityHooks();
        const seen = [];
        h.subscribe(() => { throw new Error('SUBSCRIBER_BOOM'); });
        h.subscribe((e) => seen.push(e.name));
        expect(h.emit('mean_fear', 0.5)).toBe(true);
        expect(seen).toEqual(['mean_fear']);
    });

    test('4. Ring buffer bounds memory while counting lifetime totals', () => {
        const h = new ObservabilityHooks({ ringSize: 8 });
        for (let i = 0; i < 100; i++) h.emit('tick_ms', i);
        const s = h.summarize('tick_ms');
        expect(s.count).toBe(100);
        expect(s.last).toBe(99);
        expect(s.min).toBe(92);
        const snap = h.snapshot();
        expect(snap.map((m) => m.name)).toEqual(['tick_ms']);
    });

    test('5. Snapshots sort by name and audits stay clean', () => {
        const h = new ObservabilityHooks();
        h.emit('zeta', 1);
        h.emit('alpha', 2);
        expect(h.snapshot().map((m) => m.name)).toEqual(['alpha', 'zeta']);
        const audit = h.auditImmutability();
        expect(audit.isClean).toBe(true);
        expect(audit.hostPhysicsMutations).toBe(0);
        h.reset();
        expect(h.summarize('alpha').count).toBe(0);
    });
});
