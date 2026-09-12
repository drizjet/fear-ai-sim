import { describe, it, expect } from '@jest/globals';
import { PerceptionRobustnessEngine } from '../packages/core/index.js';

// R10: smoothing times multi-rate interaction (probe, no production change).
// Hosts running background populations perceive on sparse cadences and reuse
// the last result off-ticks (the NEXT-176 pattern). The smoothing window
// averages buffered raws, so a sparse caller and an every-tick caller see
// different buffer histories. This probe measures the divergence shape:
// bounded lag, eventual convergence on steady input, and determinism.

const TICKS = 60;

function oscillation(t) {
    // Deterministic 12-tick square wave between 0.2 and 0.8.
    return Math.floor(t / 6) % 2 === 0 ? 0.2 : 0.8;
}

function runEveryTick(seed) {
    const e = new PerceptionRobustnessEngine({ seed });
    e.setProfile('a', { noiseStd: 0, smoothingWindow: 3 });
    const out = [];
    for (let t = 0; t < TICKS; t++) {
        out.push(e.perceive('a', t, { visual: { intensity: oscillation(t) } }));
    }
    return out;
}

function runCadence(seed, cadence) {
    const e = new PerceptionRobustnessEngine({ seed });
    e.setProfile('a', { noiseStd: 0, smoothingWindow: 3 });
    const out = [];
    let last = null;
    for (let t = 0; t < TICKS; t++) {
        if (t % cadence === 0 || last === null) {
            last = e.perceive('a', t, { visual: { intensity: oscillation(t) } });
        }
        out.push(last);
    }
    return out;
}

function maxAbsThreatDivergence(a, b) {
    let m = 0;
    for (let i = 0; i < a.length; i++) {
        m = Math.max(m, Math.abs(a[i].fusedThreat - b[i].fusedThreat));
    }
    return m;
}

describe('R10: smoothing under sparse-cadence reuse', () => {
    it('1. Cadence-3 reuse diverges boundedly and rejoins on steady input', () => {
        const a = runEveryTick(31);
        const b = runCadence(31, 3);
        const div = maxAbsThreatDivergence(a, b);
        // Bounded: reuse lags at most one window behind the wave.
        expect(div).toBeLessThanOrEqual(0.5);
        expect(div).toBeGreaterThan(0);
        // Steady input rejoins: constant 0.8 converges identically — the
        // wave tail above does NOT rejoin by t=59 because sparse sampling
        // aliases the transition (B's window still holds a pre-step 0.2).
        const steady = (seed, cadence) => {
            const e = new PerceptionRobustnessEngine({ seed });
            e.setProfile('a', { noiseStd: 0, smoothingWindow: 3 });
            const out = [];
            let last = null;
            for (let t = 0; t < 12; t++) {
                if (t % cadence === 0 || last === null) {
                    last = e.perceive('a', t, { visual: { intensity: 0.8 } });
                }
                out.push(last);
            }
            return out;
        };
        const sA = steady(35, 1);
        const sB = steady(35, 3);
        for (let t = 6; t < 12; t++) {
            expect(sB[t].fusedThreat).toBe(sA[t].fusedThreat);
            expect(sB[t].visual.value).toBe(sA[t].visual.value);
        }
    });

    it('2. Step response arrives within one cadence period', () => {
        const step = (seed, cadence) => {
            const e = new PerceptionRobustnessEngine({ seed });
            e.setProfile('a', { noiseStd: 0, smoothingWindow: 3 });
            const out = [];
            let last = null;
            for (let t = 0; t < 40; t++) {
                const v = t < 20 ? 0.2 : 0.9;
                if (t % cadence === 0 || last === null) {
                    last = e.perceive('a', t, { visual: { intensity: v } });
                }
                out.push(last.fusedThreat);
            }
            return out;
        };
        const fast = step(32, 1);
        const slow = step(32, 4);
        const firstMove = (arr) => arr.findIndex((v) => v > 0.25);
        // Step lands at t=20; sparse caller notices at its next due tick.
        expect(firstMove(fast)).toBe(20);
        expect(firstMove(slow) - 20).toBeLessThanOrEqual(3);
        expect(firstMove(slow) - 20).toBeGreaterThanOrEqual(0);
    });

    it('3. Uncertainty shifts stay within one fuse-branch gap', () => {
        const a = runEveryTick(34);
        const b = runCadence(34, 3);
        let excess = 0;
        for (let i = 0; i < a.length; i++) {
            excess = Math.max(excess, b[i].uncertainty - a[i].uncertainty);
        }
        // Stale smoothed values can sit in a different fuse branch than the
        // fresh ones (0.45 single-branch vs 0.3 visual branch here), so reuse
        // shifts uncertainty by at most one branch gap. Pinned: 0.15.
        expect(excess).toBeCloseTo(0.15, 10);
    });
    it('4. Sparse runs replay exactly under the same seed', () => {
        const a = runCadence(33, 3);
        const b = runCadence(33, 3);
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    });
});
