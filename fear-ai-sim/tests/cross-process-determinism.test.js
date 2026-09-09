/**
 * @file cross-process-determinism.test.js
 *
 * CCIII strongest-claim attack, now a permanent regression gate: the
 * red-team falsified cross-process determinism (Math.random fallback made
 * identical runs diverge on PANIC/FREEZE branches at tick 29). The fix
 * seeds per-agent fallback RNGs. This test spawns separate node processes
 * — same-process equality would miss module-state and entropy leaks.
 */

import { describe, it, expect } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AffectiveAgent } from '../packages/core/src/AffectiveAgent.js';
import { FearCore } from '../packages/core/src/FearCore.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROBE = join(ROOT, 'tests', 'helpers', 'determinism-probe.mjs');

const PERSONAS = [
    { neuroticism: 0.9, resilience: 0.05 },
    { neuroticism: 0.5, resilience: 0.5 },
    { neuroticism: 0.1, resilience: 0.9, extraversion: 0.9 },
    { neuroticism: 0.7, resilience: 0.2, agreeableness: 0.1 }
];

function runProbe(traits) {
    return execFileSync(process.execPath, [PROBE, JSON.stringify(traits)], { encoding: 'utf8', timeout: 30000 });
}

describe('CCIII: cross-process replay determinism', () => {
    it('1. Separate processes produce bit-identical trajectories', () => {
        for (const traits of PERSONAS) {
            expect(runProbe(traits)).toBe(runProbe(traits));
        }
    });

    it('2. Explicit seed option reproduces the same stream', () => {
        const run = (seed) => {
            const agent = new AffectiveAgent('seeded', { neuroticism: 0.8, resilience: 0.1 }, { seed });
            const out = [];
            for (let t = 0; t < 60; t++) {
                out.push(agent.tick(0.016, { threats: [{ distance: 1.0, intensity: 1.0 }] }, {}).fear_band);
            }
            return out;
        };
        expect(run('exp-1')).toEqual(run('exp-1'));
    });

    it('3. FearCore reset restores the fallback stream (replay after reset)', () => {
        const core = new FearCore({ seed: 'reset-check' });
        const run = () => {
            const out = [];
            for (let t = 0; t < 40; t++) {
                out.push(core.update(5.0, {}).state);
            }
            return out;
        };
        const first = run();
        core.reset('CALM');
        expect(run()).toEqual(first);
    });

    it('4. Caller-supplied rng still overrides the fallback', () => {
        const a = new AffectiveAgent('o1', { neuroticism: 0.9, resilience: 0.05 });
        const b = new AffectiveAgent('o2', { neuroticism: 0.9, resilience: 0.05 });
        const fixed = () => 0.99; // never exits PANIC-family branches downward
        const ra = a.tick(0.016, { threats: [{ distance: 1.0, intensity: 1.0 }] }, { rng: fixed });
        const rb = b.tick(0.016, { threats: [{ distance: 1.0, intensity: 1.0 }] }, { rng: fixed });
        expect(ra.fear_band).toBe(rb.fear_band);
    });
});
