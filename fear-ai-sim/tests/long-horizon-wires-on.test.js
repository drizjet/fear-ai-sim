import { describe, it, expect } from '@jest/globals';
import { AffectiveAgent } from '../packages/core/index.js';
import { CharacterIdentityArchitecture } from '../packages/core/index.js';
import { TraumaCrystallizationEngine } from '../packages/core/index.js';

// NEXT-129: long-horizon identity visibility with all wires on (CCI-28
// frontier 13). Brave vs coward agents run 10k ticks through alternating
// threat/calm regimes with CIA blend plus trauma feed attached.
// Identity must stay visible (onset and recovery ordering), the adaptive
// layer must engage (crystallized traumas), and nothing may collapse
// (finite fears, bounded drift, calm end-state).
describe('NEXT-129: 10k-tick identity visibility with wires on', () => {
    const BRAVE = { neuroticism: 0.15, fear: 0.15, resilience: 0.9, leadership: 0.8 };
    const COWARD = { neuroticism: 0.9, fear: 0.85, resilience: 0.2 };
    const THREAT = { threats: [{ id: 'x', type: 'WOLF', intensity: 0.8, distance: 6 }] };
    const hot = (t) => t <= 2000 || (t > 5000 && t <= 7000);

    function run() {
        const mk = (traits, seed) => {
            const cia = new CharacterIdentityArchitecture();
            const eng = new TraumaCrystallizationEngine();
            const agent = new AffectiveAgent(`lh_${seed}`, traits, {
                seed: `lh_${seed}`,
                identityArchitecture: cia,
                identityBlend: 1,
                traumaEngine: eng
            });
            return { agent, cia, eng };
        };
        const B = mk(BRAVE, 'b');
        const C = mk(COWARD, 'c');
        const out = {
            bOnset: -1, cOnset: -1, bRecover: -1, cRecover: -1, nonfinite: 0
        };
        for (let t = 1; t <= 10000; t++) {
            const obs = hot(t) ? THREAT : {};
            const rb = B.agent.tick(0.016, obs);
            const rc = C.agent.tick(0.016, obs);
            for (const r of [rb, rc]) {
                if (!Number.isFinite(r.affective_state.raw_fear)) out.nonfinite += 1;
            }
            if (out.bOnset < 0 && rb.fear_band === 'PANIC') out.bOnset = t;
            if (out.cOnset < 0 && rc.fear_band === 'PANIC') out.cOnset = t;
            if (t > 7000) {
                if (out.bRecover < 0 && rb.affective_state.raw_fear < 0.1) out.bRecover = t - 7000;
                if (out.cRecover < 0 && rc.affective_state.raw_fear < 0.1) out.cRecover = t - 7000;
            }
            if (t === 10000) {
                out.bFinal = rb.affective_state.raw_fear;
                out.cFinal = rc.affective_state.raw_fear;
                out.bDrift = B.cia.drift('lh_b');
                out.cDrift = C.cia.drift('lh_c');
                out.bCrys = B.eng.agentRecords.get('lh_b').crystallizedTraumas.length;
                out.cCrys = C.eng.agentRecords.get('lh_c').crystallizedTraumas.length;
            }
        }
        return out;
    }

    it('1. Brave resists panic onset longer than the coward', () => {
        const r = run();
        expect(r.cOnset).toBeGreaterThan(0);
        expect(r.bOnset).toBeGreaterThan(r.cOnset);
    });

    it('2. Brave recovers faster after the final threat block', () => {
        const r = run();
        expect(r.bRecover).toBeGreaterThan(0);
        expect(r.cRecover).toBeGreaterThan(r.bRecover);
    });

    it('3. Adaptive layer engages: both crystallize trauma yet keep order', () => {
        const r = run();
        expect(r.bCrys).toBeGreaterThanOrEqual(1);
        expect(r.cCrys).toBeGreaterThanOrEqual(1);
        // Trauma does not erase identity: recovery ordering survives it.
        expect(r.bRecover).toBeLessThan(r.cRecover);
    });

    it('4. No collapse: finite fears, bounded drift, calm end-state', () => {
        const r = run();
        expect(r.nonfinite).toBe(0);
        expect(r.bDrift).toBeLessThan(0.3);
        expect(r.cDrift).toBeLessThan(0.3);
        expect(r.bFinal).toBeLessThan(0.1);
        expect(r.cFinal).toBeLessThan(0.1);
    });

    it('5. Ten-thousand-tick run is deterministic', () => {
        expect(run()).toEqual(run());
    });
});
