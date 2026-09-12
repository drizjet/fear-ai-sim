import { describe, it, expect } from '@jest/globals';
import {
    InformationPropagationEngine,
    AnticipatoryFearEngine,
    SecurityDilemmaHarness,
} from '../packages/core/index.js';

// NEXT-167 (post-25 candidate 7): unilateral-rumor spiral dynamics.
// NEXT-160 showed bilateral hearsay spirals while one-sided rumor caps
// at ASYMMETRIC under the default threshold. This maps the unilateral
// dynamics honestly: B's peak climbs a dose ladder while A stays pinned
// at its fear-driven cap, the spiral boundary sits exactly at that cap,
// trust absorbs, and repeated waves settle on a fixed point instead of
// ratcheting (the harness carries no inter-run memory).
function hearB() {
    const net = new InformationPropagationEngine({}, 2026);
    net.registerAgent('alarmist', 0.8);
    net.registerAgent('west', 0.5);
    net.addListenEdge('west', 'alarmist');
    const rumorId = net.injectRumor('APPROACHING_ARMY', 'Army marching', 'alarmist', { confidence: 0.85 });
    const fear = new AnticipatoryFearEngine({}, { neuroticism: 0.5, resilience: 0.5 });
    for (let t = 0; t < 6; t++) {
        net.advanceTick();
        for (const held of net.heldBy('west')) {
            if (held.rumorId === rumorId) {
                fear.absorb('FACTION', 'invading_army', { confidence: held.confidence, observed: false, threatLevel: 0.9 });
            }
        }
        fear.advanceTick();
    }
    return fear.dreadOf('FACTION', 'invading_army');
}

const UNI = { fearA: 0.4, misperceptionA: 0.4 };

describe('NEXT-167: unilateral-rumor spiral dynamics', () => {
    it('1. Live one-sided hearsay escalates to ASYMMETRIC, not spiral', () => {
        const dread = hearB();
        expect(dread).toBeGreaterThanOrEqual(0.6);
        const d = new SecurityDilemmaHarness();
        const r = d.run({
            ...UNI, fearB: 0.4 + dread, misperceptionB: 0.4 + dread * 0.3, trustAB: 0.1,
        });
        expect(r.verdict).toBe('ASYMMETRIC');
        expect(r.peakB).toBeGreaterThanOrEqual(0.8);
        expect(r.peakA).toBeLessThan(0.8);
    });

    it('2. Rumor-dose ladder climbs on B while A stays capped', () => {
        const d = new SecurityDilemmaHarness();
        const peaksB = [];
        for (const dose of [0.4, 0.6, 0.8, 1.0]) {
            const r = d.run({ ...UNI, fearB: dose, misperceptionB: dose, trustAB: 0.1 });
            peaksB.push(r.peakB);
            expect(r.peakA).toBeLessThanOrEqual(0.7);
        }
        for (let i = 1; i < peaksB.length; i++) {
            expect(peaksB[i]).toBeGreaterThan(peaksB[i - 1]);
        }
        expect(d.run({ ...UNI, fearB: 0.4, misperceptionB: 0.4, trustAB: 0.1 }).verdict)
            .toBe('STABLE_DETERRENCE');
    });

    it('3. Spiral boundary sits exactly at the unrumored cap', () => {
        const d = new SecurityDilemmaHarness();
        const cfg = { ...UNI, fearB: 1.0, misperceptionB: 1.0, trustAB: 0.1 };
        expect(d.run({ ...cfg, warThreshold: 0.7 }).verdict).toBe('SPIRAL');
        expect(d.run({ ...cfg, warThreshold: 0.71 }).verdict).toBe('ASYMMETRIC');
    });

    it('4. High trust absorbs the unilateral shock back to stable', () => {
        const d = new SecurityDilemmaHarness();
        const r = d.run({ ...UNI, fearB: 1.0, misperceptionB: 1.0, trustAB: 0.9 });
        expect(r.verdict).toBe('STABLE_DETERRENCE');
    });

    it('5. Repeated waves settle on a fixed point instead of ratcheting', () => {
        const d = new SecurityDilemmaHarness();
        const cfg = { ...UNI, fearB: 1.0, misperceptionB: 1.0, trustAB: 0.1 };
        let mobA = 0.2;
        let mobB = 0.2;
        const ends = [];
        for (let w = 0; w < 3; w++) {
            const r = d.run({ ...cfg, mobilizationA: mobA, mobilizationB: mobB });
            mobA = r.endA;
            mobB = r.endB;
            ends.push([r.endA, r.endB]);
        }
        expect(ends[1]).toEqual(ends[0]);
        expect(ends[2]).toEqual(ends[0]);
    });

    it('6. Unilateral dynamics replay exactly', () => {
        const run = () => new SecurityDilemmaHarness().run(
            { ...UNI, fearB: 1.0, misperceptionB: 1.0, trustAB: 0.1 }).verdict;
        expect(run()).toBe('ASYMMETRIC');
        expect(run()).toBe(run());
    });
});
