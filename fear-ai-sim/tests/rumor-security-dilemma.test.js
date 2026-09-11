import { describe, it, expect } from '@jest/globals';
import {
    InformationPropagationEngine,
    AnticipatoryFearEngine,
    SecurityDilemmaHarness,
} from '../packages/core/index.js';

// NEXT-160 (audit candidate 25): rumor-triggered security-dilemma
// escalation. A false approaching-army rumor heard on both sides feeds
// hearsay dread into each faction's dilemma fear and misperception; the
// identical setup without the rumor stays stable. No production change:
// the chain composes propagation, anticipatory dread, and the dilemma
// loop through their existing inputs.
function climate({ rumor = true, seed = 2026 } = {}) {
    // Each side hears the other is marching: two listeners, one rumor
    // each, absorbed as unobserved high-threat faction dread.
    const dreads = [];
    for (const side of ['east', 'west']) {
        const net = new InformationPropagationEngine({}, seed);
        net.registerAgent('alarmist', 0.8);
        net.registerAgent(side, 0.5);
        net.addListenEdge(side, 'alarmist');
        const fear = new AnticipatoryFearEngine({}, { neuroticism: 0.5, resilience: 0.5 });
        if (rumor) {
            const rumorId = net.injectRumor('APPROACHING_ARMY', 'Army marching', 'alarmist', { confidence: 0.85 });
            for (let t = 0; t < 6; t++) {
                net.advanceTick();
                for (const held of net.heldBy(side)) {
                    if (held.rumorId === rumorId) {
                        fear.absorb('FACTION', 'invading_army', { confidence: held.confidence, observed: false, threatLevel: 0.9 });
                    }
                }
                fear.advanceTick();
            }
        }
        dreads.push({ net, fear, dread: fear.dreadOf('FACTION', 'invading_army') });
    }
    const dread = Math.max(dreads[0].dread, dreads[1].dread);
    return {
        dreads,
        dilemmaConfig: {
            fearA: 0.4 + dread * 0.5,
            fearB: 0.4 + dread * 0.5,
            misperceptionA: 0.4 + dread * 0.3,
            misperceptionB: 0.4 + dread * 0.3,
        },
    };
}

describe('NEXT-160: rumor-triggered security-dilemma escalation', () => {
    it('1. Hearsay alone builds symmetric dread with zero observations', () => {
        const { dreads } = climate({ rumor: true });
        for (const { dread } of dreads) expect(dread).toBeGreaterThanOrEqual(0.6);
        const quiet = climate({ rumor: false });
        for (const { dread } of quiet.dreads) expect(dread).toBe(0);
    });

    it('2. The same setup is stable quiet but spirals under rumor', () => {
        const d = new SecurityDilemmaHarness();
        const control = d.run({});
        expect(control.verdict).toBe('STABLE_DETERRENCE');
        const { dilemmaConfig } = climate({ rumor: true });
        const rumorRun = d.run({ ...dilemmaConfig, trustAB: 0.3 });
        expect(rumorRun.verdict).toBe('SPIRAL');
        expect(rumorRun.peakA).toBeGreaterThan(control.peakA);
        expect(rumorRun.peakB).toBeGreaterThan(control.peakB);
    });

    it('3. High mutual trust absorbs the same rumor climate', () => {
        const d = new SecurityDilemmaHarness();
        const { dilemmaConfig } = climate({ rumor: true });
        const trusting = d.run({ ...dilemmaConfig, trustAB: 0.7 });
        expect(trusting.verdict).toBe('STABLE_DETERRENCE');
    });

    it('4. Correction plus extinction walks the climate back to stable', () => {
        const d = new SecurityDilemmaHarness();
        const { dreads } = climate({ rumor: true });
        for (const { net, fear } of dreads) {
            for (const held of [...net.heldBy('east'), ...net.heldBy('west')]) {
                net.correctRumor(held.rumorId, false);
            }
            for (let t = 0; t < 200; t++) fear.advanceTick();
        }
        const dread = Math.max(...dreads.map(({ fear }) => fear.dreadOf('FACTION', 'invading_army')));
        const cooled = d.run({
            fearA: 0.4 + dread * 0.5,
            fearB: 0.4 + dread * 0.5,
            misperceptionA: 0.4 + dread * 0.3,
            misperceptionB: 0.4 + dread * 0.3,
            trustAB: 0.3,
        });
        expect(cooled.verdict).toBe('STABLE_DETERRENCE');
    });

    it('5. The rumor-to-spiral chain replays exactly', () => {
        const run = () => {
            const d = new SecurityDilemmaHarness();
            return d.run({ ...climate({ rumor: true }).dilemmaConfig, trustAB: 0.3 }).verdict;
        };
        expect(run()).toBe('SPIRAL');
        expect(run()).toBe(run());
    });
});
