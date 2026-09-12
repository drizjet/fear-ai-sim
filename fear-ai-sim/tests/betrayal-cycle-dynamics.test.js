import { describe, it, expect } from '@jest/globals';
import { TraumaCrystallizationEngine, TRAUMA_TYPES } from '../packages/core/index.js';

// Post-25 audit candidate 11: betrayal-path trauma-safety cycles.
// BETRAYAL_ABANDONMENT ignores passive `SANCTUARY*` solace (the engine gates on
// source.startsWith('SANCTUARY')) and accrues solace only from interpersonal
// repair (`SOCIAL_REPAIR_*`, peer solace, anything else). These tests pin:
// crystallization + agreeableness erosion, the solace-source split, compounding
// cycles, extinction therapy, and replay determinism.
const BETRAYAL = TRAUMA_TYPES.BETRAYAL_ABANDONMENT;

// Default engine lifecycle: 20 ACUTE_SHOCK + 100 SENSITIZATION_WINDOW + 30
// CONSOLIDATION_LOCKING = 150 ticks to crystallize. tick(200) leaves only 50
// calm ticks (< 100-tick extinction onset), so no washout.
function betrayedEngine(traits = { agreeableness: 0.6, neuroticism: 0.5, resilience: 0.5 }) {
    const e = new TraumaCrystallizationEngine();
    e.registerAgent('a', traits);
    return e;
}

function crystallizeBetrayal(e, id = 'a', severity = 0.8) {
    e.incurTrauma(id, { traumaType: BETRAYAL, severity });
    e.tick(200);
}

describe('audit-11: betrayal-cycle dynamics', () => {
    it('1. Betrayal crystallizes without solace and erodes agreeableness', () => {
        const e = betrayedEngine();
        const pre = e.agentRecords.get('a').currentTraits.agreeableness;
        expect(pre).toBe(0.6);

        crystallizeBetrayal(e);

        const r = e.agentRecords.get('a');
        expect(r.crystallizedTraumas.length).toBe(1);
        expect(r.activeTraumas.length).toBe(0);
        // ΔA = -0.45 * 0.8 * 0.6 = -0.216 → 0.6 * 0.64 = 0.384
        expect(r.currentTraits.agreeableness).toBeCloseTo(0.384, 10);
        expect(r.currentTraits.agreeableness).toBeLessThan(pre);
        // Sibling mutations pinned alongside: ΔN = +0.40*0.8*(1-0.5) = +0.16,
        // ΔR = -0.35*0.8*0.5 = -0.14.
        expect(r.currentTraits.neuroticism).toBeCloseTo(0.66, 10);
        expect(r.currentTraits.resilience).toBeCloseTo(0.36, 10);
    });

    it('2. Passive sanctuary solace does NOT defuse betrayal; interpersonal repair DOES', () => {
        // Passive sanctuary: source starts with 'SANCTUARY' → ignored.
        const passive = betrayedEngine();
        passive.incurTrauma('a', { traumaType: BETRAYAL, severity: 0.8 });
        passive.tick(25); // inside SENSITIZATION_WINDOW
        passive.administerSolace('a', 0.9, 'SANCTUARY_REST');
        expect(passive.agentRecords.get('a').activeTraumas[0].solaceReceived).toBe(0);
        passive.tick(200);
        const rp = passive.agentRecords.get('a');
        expect(rp.crystallizedTraumas.length).toBe(1);
        expect(rp.currentTraits.agreeableness).toBeCloseTo(0.384, 10);

        // Interpersonal repair: 'SOCIAL_REPAIR_*' accrues → defuses (threshold 0.65).
        const repair = betrayedEngine();
        repair.incurTrauma('a', { traumaType: BETRAYAL, severity: 0.8 });
        repair.tick(25);
        repair.administerSolace('a', 0.9, 'SOCIAL_REPAIR_AMENDS');
        expect(repair.agentRecords.get('a').activeTraumas[0].solaceReceived).toBe(0.9);
        repair.tick(200);
        const rr = repair.agentRecords.get('a');
        expect(rr.crystallizedTraumas.length).toBe(0);
        expect(rr.activeTraumas.length).toBe(0);
        expect(rr.currentTraits.agreeableness).toBe(0.6);
        expect(rr.currentTraits.neuroticism).toBe(0.5);
    });

    it('3. Repeated betrayal cycles compound agreeableness erosion with diminishing marginal damage', () => {
        const e = betrayedEngine();
        const trajectory = [];
        for (let c = 0; c < 4; c++) {
            e.incurTrauma('a', { traumaType: BETRAYAL, severity: 0.8 });
            e.tick(160); // crystallize at ~150 + 10 calm ticks
            for (let t = 0; t < 50; t++) e.tick(1); // 60 calm total: below 100-tick extinction onset
            trajectory.push(e.agentRecords.get('a').currentTraits.agreeableness);
        }
        expect(e.agentRecords.get('a').crystallizedTraumas.length).toBe(4);
        // Exact geometric decay: A_n = 0.6 * 0.64^n (no extinction washout).
        expect(trajectory[0]).toBeCloseTo(0.384, 10);
        expect(trajectory[1]).toBeCloseTo(0.24576, 10);
        expect(trajectory[2]).toBeCloseTo(0.1572864, 10);
        expect(trajectory[3]).toBeCloseTo(0.100663296, 10);
        // Strictly decreasing with diminishing marginal damage.
        const deltas = trajectory.map((v, i) => (i === 0 ? 0.6 - v : trajectory[i - 1] - v));
        expect(deltas[0]).toBeCloseTo(0.216, 10);
        expect(deltas[1]).toBeCloseTo(0.13824, 10);
        expect(deltas[2]).toBeCloseTo(0.0884736, 10);
        expect(deltas[0]).toBeGreaterThan(deltas[1]);
        expect(deltas[1]).toBeGreaterThan(deltas[2]);
        expect(deltas[2]).toBeGreaterThan(deltas[3]);
    });

    it('4. Long sanctuary after crystallization restores toward baseline', () => {
        const e = betrayedEngine();
        crystallizeBetrayal(e);
        const peak = e.agentRecords.get('a').currentTraits.agreeableness;
        expect(peak).toBeCloseTo(0.384, 10);

        e.tick(3000); // protracted calm → extinction therapy

        const r = e.agentRecords.get('a');
        expect(r.currentTraits.agreeableness).toBeGreaterThan(peak);
        expect(r.currentTraits.agreeableness).toBeCloseTo(0.6, 3);
        expect(r.currentTraits.neuroticism).toBeCloseTo(0.5, 3);
        expect(r.currentTraits.resilience).toBeCloseTo(0.5, 3);
        expect(r.quiescentFearFloor).toBeCloseTo(0, 3);
    });

    it('5. Identical betrayal schedules replay exactly', () => {
        function runSchedule() {
            const e = betrayedEngine();
            const trajectory = [];
            for (let c = 0; c < 3; c++) {
                e.incurTrauma('a', { traumaType: BETRAYAL, severity: 0.8 });
                e.tick(160);
                for (let t = 0; t < 50; t++) e.tick(1);
                trajectory.push(e.agentRecords.get('a').currentTraits.agreeableness);
            }
            return { trajectory, state: e.getState() };
        }
        const first = runSchedule();
        const second = runSchedule();
        expect(first.trajectory).toEqual(second.trajectory);
        expect(first.state).toEqual(second.state);
    });
});
