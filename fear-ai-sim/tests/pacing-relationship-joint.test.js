import { describe, it, expect } from '@jest/globals';
import { PacingDirector } from '../packages/core/index.js';
import {
    RelationshipTensorSystem,
    INTERACTION_TYPES,
} from '../packages/core/index.js';

// Post-25 audit candidate 15: PacingDirector x RelationshipTensorSystem joint.
//
// Hypothesis under test: pacing/valley directives that schedule social beats
// (reunions, betrayals, reconciliations) land differently depending on live
// relationship state — e.g. a scheduled rally/betrayal beat amplifies or
// dampens based on trust.
//
// MEASURED OUTCOME: INCONCLUSIVE-with-evidence (no coupling inside either
// class). PacingDirector.tick only reads `observedMetrics.averageFear` and
// phase baseIntensity; it accepts no relationship input, so identical pacing
// beats yield identical intensity/phase across trust extremes. The
// relationship layer DOES modulate social gains (contagion / prosocial /
// leader-reassurance differ sharply), but that modulation lives entirely in
// RelationshipTensorSystem — no wire connects the two classes. Both halves
// are pinned below with live objects so a future coupling would fail loudly.

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

    it('INCONCLUSIVE: identical pacing beat yields identical output across trust extremes', () => {
        const hi = buildHighTrust();
        const lo = buildLowTrust();
        // Both tensors are live and opposite (guard against fixture rot).
        expect(hi.getRelationship('A', 'B').trust).toBeCloseTo(1.0, 10);
        expect(lo.getRelationship('A', 'B').trust).toBeCloseTo(-1.0, 10);

        // The pacing beat itself takes no relationship input: same tick,
        // same metrics -> same advisory output regardless of tensor state.
        const hiPacing = pacingAt(CLIMAX_TICK);
        const loPacing = pacingAt(CLIMAX_TICK);
        expect(hiPacing.getCurrentPhase().name).toBe('CLIMAX');
        expect(loPacing.getCurrentPhase().name).toBe('CLIMAX');
        expect(hiPacing.getTargetIntensity()).toBeCloseTo(1.0, 10);
        expect(loPacing.getTargetIntensity()).toBeCloseTo(1.0, 10);

        const hiBreather = pacingAt(BREATHER_TICK);
        const loBreather = pacingAt(BREATHER_TICK);
        expect(hiBreather.getCurrentPhase().name).toBe('BREATHER');
        expect(loBreather.getCurrentPhase().name).toBe('BREATHER');
        expect(hiBreather.getTargetIntensity()).toBeCloseTo(0.3, 10);
        expect(loBreather.getTargetIntensity()).toBeCloseTo(0.3, 10);
    });

    it('INCONCLUSIVE: relationship-flavoured metrics keys do not steer pacing', () => {
        // PacingDirector.tick only reads observedMetrics.averageFear;
        // extra relationship keys must be ignored, not crash or steer.
        const a = pacingAt(CLIMAX_TICK, { averageFear: 0.5, trust: 1.0, grievance: 0.0 });
        const b = pacingAt(CLIMAX_TICK, { averageFear: 0.5, trust: -1.0, grievance: 1.0 });
        expect(a.getTargetIntensity()).toBeCloseTo(b.getTargetIntensity(), 12);
        expect(a.getTargetIntensity()).toBeCloseTo(1.0, 10);
        // Sanity: the fear-driven DDA path itself still works (fear is the
        // only steering input), so the equality above is "ignores trust",
        // not "ignores everything".
        const overwhelmed = pacingAt(CLIMAX_TICK, { averageFear: 0.9 });
        const bored = pacingAt(CLIMAX_TICK, { averageFear: 0.1 });
        expect(overwhelmed.getTargetIntensity()).toBeCloseTo(0.7, 10);
        expect(bored.getTargetIntensity()).toBeCloseTo(1.3, 10);
    });

    it('evidence: relationship-side social gains DO diverge on the same beat', () => {
        const hi = buildHighTrust();
        const lo = buildLowTrust();
        // Same base gain, opposite tensors -> sharply different advisories.
        // This is the coupling a future pacing beat COULD consume; today it
        // does not (see INCONCLUSIVE tests above).
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
});
