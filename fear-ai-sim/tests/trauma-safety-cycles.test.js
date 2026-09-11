import { describe, it, expect } from '@jest/globals';
import { TraumaCrystallizationEngine, TRAUMA_TYPES } from '../packages/core/index.js';

// NEXT-154 (audit candidate 19): repeated trauma-safety cycles.
// One trauma + calm gap, repeated. Questions: runaway ratchet or
// saturation? Does sanctuary compound or erase? Is it deterministic?
function cycledEngine({ seed = 7, severity = 0.8, cycles, calmGap, solace = 0 }) {
    const e = new TraumaCrystallizationEngine({ seed });
    e.registerAgent('a', { neuroticism: 0.5, resilience: 0.5 });
    const neuroticism = [];
    for (let c = 0; c < cycles; c++) {
        e.incurTrauma('a', { traumaType: TRAUMA_TYPES.NEAR_DEATH_SURVIVAL, severity });
        for (let t = 0; t < 150; t++) {
            if (solace > 0) e.administerSolace('a', solace);
            e.tick(1);
        }
        for (let t = 0; t < calmGap; t++) e.tick(1);
        neuroticism.push(e.agentRecords.get('a').currentTraits.neuroticism);
    }
    return { e, neuroticism };
}

describe('NEXT-154: repeated trauma-safety cycles', () => {
    it('1. Short-gap cycles compound with diminishing marginal damage', () => {
        const { e, neuroticism } = cycledEngine({ cycles: 5, calmGap: 200 });
        for (let c = 1; c < neuroticism.length; c++) {
            expect(neuroticism[c]).toBeGreaterThan(neuroticism[c - 1]);
        }
        const first = neuroticism[0] - 0.5;
        const last = neuroticism[4] - neuroticism[3];
        expect(first).toBeGreaterThan(last);
        expect(e.agentRecords.get('a').crystallizedTraumas.length).toBe(5);
    });

    it('2. Twenty max-severity cycles stay inside all published bounds', () => {
        const { e } = cycledEngine({ severity: 1.0, cycles: 20, calmGap: 200 });
        const r = e.agentRecords.get('a');
        expect(r.currentTraits.neuroticism).toBeLessThanOrEqual(0.98);
        expect(r.currentTraits.resilience).toBeGreaterThanOrEqual(0.08);
        expect(r.quiescentFearFloor).toBeLessThanOrEqual(0.4);
        expect(r.recoveryHalfLifeMultiplier).toBeLessThanOrEqual(4.5);
    });

    it('3. Per-cycle solace defuses every cycle with zero crystallization', () => {
        const { e } = cycledEngine({ cycles: 5, calmGap: 200, solace: 0.9 });
        const r = e.agentRecords.get('a');
        expect(r.crystallizedTraumas.length).toBe(0);
        expect(r.currentTraits.neuroticism).toBe(0.5);
        expect(r.currentTraits.resilience).toBe(0.5);
    });

    it('4. Long sanctuary erases short-gap displacement (no permanent ratchet)', () => {
        const { e, neuroticism } = cycledEngine({ cycles: 3, calmGap: 200 });
        const peak = neuroticism[2];
        expect(peak).toBeGreaterThan(0.55);
        for (let t = 0; t < 2000; t++) e.tick(1);
        const r = e.agentRecords.get('a');
        expect(r.currentTraits.neuroticism).toBeCloseTo(0.5, 3);
        expect(r.currentTraits.resilience).toBeCloseTo(0.5, 3);
    });

    it('5. Identical cycle schedules replay exactly', () => {
        const a = cycledEngine({ cycles: 4, calmGap: 200 }).neuroticism;
        const b = cycledEngine({ cycles: 4, calmGap: 200 }).neuroticism;
        expect(a).toEqual(b);
    });
});
