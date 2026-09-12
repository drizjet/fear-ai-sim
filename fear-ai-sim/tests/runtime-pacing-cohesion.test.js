import { describe, it, expect } from '@jest/globals';
import { RuntimeSimulation } from '../packages/runtime/index.js';

// R7: cohesion-DDA valley end-to-end. The NEXT-189 wire was proven in joint
// isolation only. Here the runtime composes its own subsystems: live social
// edges -> mean-trust cohesion -> PacingDirector -> pacingIntensity ->
// agents. Betrayal-fractured and rescue-bonded runs share identical agents,
// seeds, and tick counts, so the fear-DDA common mode cancels and only the
// cohesion wire can separate them.

function buildWorld(seed, { pacingCohesion } = {}) {
    const sim = new RuntimeSimulation({
        seed,
        ...(pacingCohesion === undefined ? {} : { enablePacingCohesion: pacingCohesion }),
    });
    sim.registerAgent('alice', {}, { seed: `${seed}-alice` });
    sim.registerAgent('bob', {}, { seed: `${seed}-bob` });
    return sim;
}

function runWorld(seed, events, ticks, opts) {
    const sim = buildWorld(seed, opts);
    for (const event of events) {
        sim.reportSocialEvent({ event, actorId: 'alice', targetId: 'bob', weight: 1 });
    }
    for (let t = 0; t < ticks; t++) sim.tick(0.0166);
    return {
        intensity: sim.pacing.getTargetIntensity(),
        modifier: sim.pacing.getState().ddaIntensityModifier,
        phase: sim.pacing.getCurrentPhase().name,
    };
}
const BETRAYALS = ['BETRAYAL', 'BETRAYAL', 'BETRAYAL'];
const RESCUES = ['RESCUE', 'RESCUE', 'RESCUE', 'RESCUE', 'RESCUE', 'RESCUE'];

describe('R7: runtime cohesion composition end to end', () => {
    it('1. Fractured vs bonded runs diverge through the live loop', () => {
        const low = runWorld(42, BETRAYALS, 50);
        const high = runWorld(42, RESCUES, 50);
        // Same phase (session progress untouched by cohesion)...
        expect(low.phase).toBe(high.phase);
        expect(low.phase).toBe('EXPOSITION');
        // ...but fractured intensity exceeds bonded intensity. Pinned live
        // numbers: common-mode fear boost (+0.1 over 50 ticks) plus the
        // cohesion wire (fractured +0.05, bonded -0.05).
        expect(low.modifier).toBeCloseTo(1.15, 10);
        expect(high.modifier).toBeCloseTo(1.05, 10);
        expect(low.intensity).toBeCloseTo(0.23, 10);
        expect(high.intensity).toBeCloseTo(0.21, 10);
        expect(low.intensity).toBeGreaterThan(high.intensity);
    });

    it('2. Opt-out flag restores the decoupled baseline exactly', () => {
        const off = runWorld(42, BETRAYALS, 50, { pacingCohesion: false });
        const on = runWorld(42, BETRAYALS, 50, { pacingCohesion: true });
        expect(off.intensity).not.toBe(on.intensity);
        // Flag off equals a world with no social graph at all.
        const clean = buildWorld(99);
        for (let t = 0; t < 50; t++) clean.tick(0.0166);
        const offClean = runWorld(99, [], 50, { pacingCohesion: false });
        expect(offClean.intensity).toBeCloseTo(clean.pacing.getTargetIntensity(), 12);
    });

    it('3. Empty social graph feeds nothing (legacy even with flag on)', () => {
        const sim = buildWorld(7, { pacingCohesion: true });
        for (let t = 0; t < 50; t++) sim.tick(0.0166);
        const flaggedOff = runWorld(7, [], 50, { pacingCohesion: false });
        expect(sim.pacing.getTargetIntensity()).toBeCloseTo(flaggedOff.intensity, 12);
    });

    it('4. Identical scripts replay byte-identical pacing state', () => {
        const a = runWorld(13, [...BETRAYALS, ...RESCUES], 60);
        const b = runWorld(13, [...BETRAYALS, ...RESCUES], 60);
        expect(b).toEqual(a);
    });
});
