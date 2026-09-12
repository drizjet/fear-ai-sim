import { describe, it, expect } from '@jest/globals';
import { PacingDirector } from '../packages/core/index.js';
import {
    RelationshipTensorSystem,
    INTERACTION_TYPES,
} from '../packages/core/index.js';

// Post-25 audit candidate 15: PacingDirector x RelationshipTensorSystem joint.
//
// HISTORY: probed INCONCLUSIVE (pacing read only averageFear; trust extremes
// yielded identical beats). NEXT-189 built the wire: opt-in
// observedMetrics.cohesion in [0, 1] steers the DDA modifier (cohesive
// eases toward 0.7, fragile boosts toward 1.3). Pacing never imports the
// tensor layer; the joint maps live trust [-1, 1] to cohesion as
// (trust + 1) / 2. Original absence wording survives in git history and
// ledger milestone 175. Bare trust/grievance keys remain ignored (test 3).

const SESSION_TICKS = 36000;
const CLIMAX_TICK = 26000; // progress 0.7222 -> CLIMAX, baseIntensity 1.0
const BREATHER_TICK = 15000; // progress 0.4167 -> BREATHER, baseIntensity 0.30

function buildHighTrust() {
    const rel = new RelationshipTensorSystem();
    for (let i = 0; i < 6; i++) {
        rel.recordInteraction('A', 'B', INTERACTION_TYPES.RESCUE_CONFIRMED);
    }
    return rel;
}

function buildLowTrust() {
    const rel = new RelationshipTensorSystem();
    for (let i = 0; i < 3; i++) {
        rel.recordInteraction('A', 'B', INTERACTION_TYPES.BETRAYAL);
    }
    return rel;
}

function pacingAt(tick, observedMetrics = {}) {
    const pacing = new PacingDirector({ totalSessionTicks: SESSION_TICKS });
    pacing.tick(tick, observedMetrics);
    return pacing;
}

describe('pacing x relationship joint (candidate 15)', () => {
    it('fixtures: high-trust vs low-trust tensors hold opposite live state', () => {
        const hi = buildHighTrust();
        const lo = buildLowTrust();
        const hiRel = hi.getRelationship('A', 'B');
        const loRel = lo.getRelationship('A', 'B');
        expect(hiRel.trust).toBeCloseTo(1.0, 10);
        expect(hiRel.affection).toBeCloseTo(1.0, 10);
        expect(hiRel.grievance).toBeCloseTo(0.0, 10);
        expect(hiRel.familiarity).toBeCloseTo(1.0, 10);
        expect(loRel.trust).toBeCloseTo(-1.0, 10);
        expect(loRel.affection).toBeCloseTo(-1.0, 10);
        expect(loRel.grievance).toBeCloseTo(1.0, 10);
        expect(loRel.familiarity).toBeCloseTo(0.0, 10);
    });

    it('BUILT (NEXT-189): same beat diverges when cohesion is mapped from live trust', () => {
        const hi = buildHighTrust();
        const lo = buildLowTrust();
        // Both tensors are live and opposite (guard against fixture rot).
        const hiTrust = hi.getRelationship('A', 'B').trust;
        const loTrust = lo.getRelationship('A', 'B').trust;
        expect(hiTrust).toBeCloseTo(1.0, 10);
        expect(loTrust).toBeCloseTo(-1.0, 10);
        const cohesionOf = (trust) => (trust + 1) / 2;

        // Without the wire the beat stays identical (legacy absence kept).
        const bare1 = pacingAt(CLIMAX_TICK);
        const bare2 = pacingAt(CLIMAX_TICK);
        expect(bare1.getTargetIntensity()).toBeCloseTo(bare2.getTargetIntensity(), 12);
        expect(bare1.getTargetIntensity()).toBeCloseTo(1.0, 10);

        // With cohesion mapped from live trust: cohesive eases to the 0.7
        // floor, fragile boosts to the 1.3 ceiling; phase never moves.
        const hiPacing = pacingAt(CLIMAX_TICK, { cohesion: cohesionOf(hiTrust) });
        const loPacing = pacingAt(CLIMAX_TICK, { cohesion: cohesionOf(loTrust) });
        expect(hiPacing.getCurrentPhase().name).toBe('CLIMAX');
        expect(loPacing.getCurrentPhase().name).toBe('CLIMAX');
        expect(hiPacing.getTargetIntensity()).toBeCloseTo(0.7, 10);
        expect(loPacing.getTargetIntensity()).toBeCloseTo(1.3, 10);
        const hiBreather = pacingAt(BREATHER_TICK, { cohesion: cohesionOf(hiTrust) });
        const loBreather = pacingAt(BREATHER_TICK, { cohesion: cohesionOf(loTrust) });
        expect(hiBreather.getCurrentPhase().name).toBe('BREATHER');
        expect(loBreather.getCurrentPhase().name).toBe('BREATHER');
        expect(hiBreather.getTargetIntensity()).toBeCloseTo(0.21, 10);
        expect(loBreather.getTargetIntensity()).toBeCloseTo(0.39, 10);
    });

    it('INCONCLUSIVE-KEPT: bare trust/grievance keys still do not steer pacing', () => {
        // Only observedMetrics.averageFear and the opt-in cohesion key steer;
        // bare relationship keys must be ignored, not crash or steer.
        const a = pacingAt(CLIMAX_TICK, { averageFear: 0.5, trust: 1.0, grievance: 0.0 });
        const b = pacingAt(CLIMAX_TICK, { averageFear: 0.5, trust: -1.0, grievance: 1.0 });
        expect(a.getTargetIntensity()).toBeCloseTo(b.getTargetIntensity(), 12);
        expect(a.getTargetIntensity()).toBeCloseTo(1.0, 10);
        // Sanity: the fear-driven DDA path itself still works, so the
        // equality above is "ignores bare trust keys", not "ignores all".
        const overwhelmed = pacingAt(CLIMAX_TICK, { averageFear: 0.9 });
        const bored = pacingAt(CLIMAX_TICK, { averageFear: 0.1 });
        expect(overwhelmed.getTargetIntensity()).toBeCloseTo(0.7, 10);
        expect(bored.getTargetIntensity()).toBeCloseTo(1.3, 10);
    });

    it('evidence: relationship-side social gains DO diverge on the same beat', () => {
        const hi = buildHighTrust();
        const lo = buildLowTrust();
        // Same base gain, opposite tensors -> sharply different advisories.
        // NEXT-189 consumes this coupling at the pacing boundary via the cohesion mapping (BUILT test above).
        expect(hi.getContagionSusceptibility('A', 'B', 0.5)).toBeCloseTo(0.5, 10);
        expect(lo.getContagionSusceptibility('A', 'B', 0.5)).toBeCloseTo(0.0375, 10);
        expect(hi.getProSocialWillingness('A', 'B', 0.5)).toBeCloseTo(1.0, 10);
        expect(lo.getProSocialWillingness('A', 'B', 0.5)).toBeCloseTo(0.0, 10);
        expect(hi.getLeaderReassuranceEfficiency('A', 'B', 0.5)).toBeCloseTo(0.5, 10);
        expect(lo.getLeaderReassuranceEfficiency('A', 'B', 0.5)).toBeCloseTo(0.0, 10);
    });

    it('malformed relationship input degrades safely', () => {
        const rel = buildHighTrust();
        expect(rel.getRelationship(null, null)).toBeNull();
        expect(rel.getRelationship('A', 'A')).toBeNull();
        expect(rel.getRelationship('', 'B')).toBeNull();
        expect(rel.hasRelationship('X', 'Y')).toBe(false);
        expect(rel.recordInteraction(null, null, 'NOPE')).toBeNull();
        expect(rel.recordInteraction('A', 'A', INTERACTION_TYPES.BETRAYAL)).toBeNull();
        // Unknown interaction type: no dimension moves, only bookkeeping.
        const before = { ...rel.getRelationship('A', 'B') };
        const after = rel.recordInteraction('A', 'B', 'NOT_A_TYPE');
        expect(after.trust).toBeCloseTo(before.trust, 12);
        expect(after.grievance).toBeCloseTo(before.grievance, 12);
        expect(after.affection).toBeCloseTo(before.affection, 12);
        expect(after.interactionCount).toBe(before.interactionCount + 1);
        // Malformed gain queries stay bounded instead of throwing/NaN.
        expect(rel.getContagionSusceptibility(null, null, 0.5)).toBeCloseTo(0.5, 10);
        expect(rel.getContagionSusceptibility('A', 'B', 'xx')).toBeCloseTo(0.5, 10);
        expect(rel.getContagionSusceptibility('A', 'B', 99)).toBeCloseTo(1.0, 10);
        expect(rel.getProSocialWillingness('NOBODY', 'ELSE', 0.5)).toBeCloseTo(0.5, 10);
        // Fresh-pair default vector (respect 0.5, trust 0): 0.5 * 0.7 * 0.5.
        expect(rel.getLeaderReassuranceEfficiency('NOBODY', 'ELSE', 0.5)).toBeCloseTo(0.175, 10);
        // Pacing tolerates empty/garbage metrics without throwing.
        const p = pacingAt(CLIMAX_TICK, { averageFear: 'hot', trust: NaN });
        expect(p.getTargetIntensity()).toBeCloseTo(1.0, 10);
    });

    it('exact replay: same script twice yields identical joint state', () => {
        function runScript() {
            const rel = new RelationshipTensorSystem();
            const pacing = new PacingDirector({ totalSessionTicks: SESSION_TICKS });
            rel.recordInteraction('A', 'B', INTERACTION_TYPES.SHARED_SURVIVAL);
            rel.recordInteraction('A', 'B', INTERACTION_TYPES.AID_RECEIVED);
            pacing.tick(26000, { averageFear: 0.5 });
            rel.recordInteraction('B', 'A', INTERACTION_TYPES.BETRAYAL);
            pacing.tick(1000, { averageFear: 0.9 });
            return {
                pacing: pacing.getState(),
                rel: rel.getState(),
                intensity: pacing.getTargetIntensity(),
                phase: pacing.getCurrentPhase().name,
            };
        }
        const first = runScript();
        const second = runScript();
        expect(second).toEqual(first);
        expect(first.phase).toBe('CLIMAX');
        expect(first.intensity).toBeCloseTo(0.7, 10);
        expect(first.rel.relationships).toHaveLength(2);
    });

    it('cohesion wire: garbage ignored, neutral holds, extremes clamp', () => {
        // Garbage cohesion leaves the legacy output untouched.
        for (const cohesion of [undefined, NaN, 'high', null, Infinity]) {
            const p = pacingAt(CLIMAX_TICK, { cohesion });
            expect(p.getTargetIntensity()).toBeCloseTo(1.0, 10);
        }
        // Neutral 0.5 holds the modifier steady over many ticks.
        const steady = new PacingDirector({ totalSessionTicks: SESSION_TICKS });
        for (let t = 0; t < 5000; t++) steady.tick(1, { cohesion: 0.5 });
        expect(steady.getState().ddaIntensityModifier).toBeCloseTo(1.0, 12);
        // Out-of-range clamps: 5 behaves as 1, -3 behaves as 0.
        const over = pacingAt(1000, { cohesion: 5 });
        const one = pacingAt(1000, { cohesion: 1 });
        expect(over.getTargetIntensity()).toBeCloseTo(one.getTargetIntensity(), 12);
        const under = pacingAt(1000, { cohesion: -3 });
        const zero = pacingAt(1000, { cohesion: 0 });
        expect(under.getTargetIntensity()).toBeCloseTo(zero.getTargetIntensity(), 12);
        // Bounds hold under sustained extremes: 20000 ticks each way.
        const floor = new PacingDirector({ totalSessionTicks: SESSION_TICKS });
        floor.tick(20000, { cohesion: 1 });
        expect(floor.getState().ddaIntensityModifier).toBeCloseTo(0.7, 12);
        const ceil = new PacingDirector({ totalSessionTicks: SESSION_TICKS });
        ceil.tick(20000, { cohesion: 0 });
        expect(ceil.getState().ddaIntensityModifier).toBeCloseTo(1.3, 12);
        // Modifier round-trips through snapshot state.
        const restored = new PacingDirector({ totalSessionTicks: SESSION_TICKS });
        restored.setState(floor.getState());
        expect(restored.getTargetIntensity()).toBeCloseTo(floor.getTargetIntensity(), 12);
    });
});
