import { describe, it, expect } from '@jest/globals';
import { RuntimeSimulation } from '../packages/runtime/index.js';
import { IntentStabilizer } from '../packages/core/index.js';

// R9: intent stability under cohesion-DDA movement (XCIX/C).
// The R7 composition lets session intensity drift with live cohesion, and
// pacingIntensity weights perceived threat inside every agent tick. This
// probes whether that drift introduces intent oscillation versus the
// decoupled baseline: identical threat schedules and social scripts, flag
// on vs off. Measured outcome pinned below: zero extra switches — the wire
// moves session intensity (R7 pins 1.15 vs 1.05) but never crosses an
// intent boundary in this scenario.

const THREAT_BLOCKS = [[20, 39], [80, 99], [140, 159], [200, 219], [260, 279]];
const COHESION_SCRIPT = [
    [30, 'BETRAYAL'], [90, 'RESCUE'], [150, 'BETRAYAL'], [210, 'RESCUE'],
];

function threatAt(tick) {
    const on = THREAT_BLOCKS.some(([a, b]) => tick >= a && tick <= b);
    return on ? [{ id: 'pred', type: 'PREDATOR', intensity: 0.55, distance: 15 }] : [];
}

function runScript(seed, { pacingCohesion } = {}) {
    const sim = new RuntimeSimulation({
        seed,
        ...(pacingCohesion === undefined ? {} : { enablePacingCohesion: pacingCohesion }),
    });
    sim.registerAgent('alice', {}, { seed: `${seed}-alice` });
    sim.registerAgent('bob', {}, { seed: `${seed}-bob` });
    const seq = { alice: [], bob: [] };
    for (let t = 0; t < 300; t++) {
        for (const [at, event] of COHESION_SCRIPT) {
            if (at === t) sim.reportSocialEvent({ event, actorId: 'alice', targetId: 'bob', weight: 1 });
        }
        const threats = threatAt(t);
        sim.queueObservation('alice', { x: 0, y: 0, z: 0, threats });
        sim.queueObservation('bob', { x: 5, y: 0, z: 0, threats });
        const outputs = sim.tick(0.0166);
        for (const o of outputs) {
            seq[o.agent_id].push({ type: o.action_intent.type, urgency: o.action_intent.urgency });
        }
    }
    return seq;
}

function switchCount(seq) {
    let n = 0;
    for (let i = 1; i < seq.length; i++) {
        if (seq[i].type !== seq[i - 1].type) n += 1;
    }
    return n;
}

function chatterOf(seq) {
    const stab = new IntentStabilizer({ cooldownTicks: 5, hysteresisMargin: 0.15 });
    seq.forEach((c, i) => stab.update('s', i, c));
    return stab.chatter('s', seq.length).flips;
}

describe('R9: intent stability under cohesion-DDA movement', () => {
    it('1. Cohesion drift introduces zero extra switches (pinned null result)', () => {
        const on = runScript(61, { pacingCohesion: true });
        const off = runScript(61, { pacingCohesion: false });
        // Measured live: alice flips 15x and bob 6x in BOTH runs.
        expect(switchCount(on.alice)).toBe(15);
        expect(switchCount(on.bob)).toBe(6);
        expect(switchCount(off.alice)).toBe(15);
        expect(switchCount(off.bob)).toBe(6);
    });

    it('2. Stabilizer-measured chatter agrees on both runs', () => {
        const on = runScript(61, { pacingCohesion: true });
        const off = runScript(61, { pacingCohesion: false });
        const onChatter = chatterOf(on.alice) + chatterOf(on.bob);
        const offChatter = chatterOf(off.alice) + chatterOf(off.bob);
        expect(Math.abs(onChatter - offChatter)).toBeLessThanOrEqual(2);
    });

    it('3. Emergency override preserved: lethal threat flips fast either way', () => {
        const run = (opts) => {
            const sim = new RuntimeSimulation({ seed: 62, ...opts });
            sim.registerAgent('solo', {}, { seed: '62-solo' });
            let flipTick = -1;
            for (let t = 0; t < 60; t++) {
                const threats = t >= 20
                    ? [{ id: 'apex', type: 'PREDATOR', intensity: 1.0, distance: 3 }]
                    : [];
                sim.queueObservation('solo', { x: 0, y: 0, z: 0, threats });
                const [o] = sim.tick(0.0166);
                if (flipTick < 0 && o.action_intent.type === 'FLEE_FROM') flipTick = t;
            }
            return flipTick;
        };
        const on = run({ pacingCohesion: true });
        const off = run({ pacingCohesion: false });
        expect(on).toBeGreaterThanOrEqual(0);
        expect(on).toBe(off);
    });

    it('4. Identical scripts replay identical intent sequences', () => {
        const a = runScript(63, { pacingCohesion: true });
        const b = runScript(63, { pacingCohesion: true });
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    });
});
