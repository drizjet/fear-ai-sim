import { describe, it, expect } from '@jest/globals';
import { InformationPropagationEngine } from '../packages/core/index.js';
import { AnticipatoryFearEngine } from '../packages/core/index.js';
import { GoalArbitrationEngine, GOAL_TYPES } from '../packages/core/index.js';

// NEXT-140: rumor-to-arbitration chain (audit candidate 4). A false rumor
// of an approaching army must move goal choice with zero sensed fear:
// propagation -> hearsay dread -> arbitration flip. No production change
// was needed; these tests pin the composed behavior and its correction.
describe('NEXT-140: hearsay moves intent choice', () => {
    // Listener b hears a's army rumor for `ticks` propagations; returns
    // b's dread engine plus the network for correction arms.
    function hearsay(ticks = 6, seed = 2026) {
        const net = new InformationPropagationEngine({}, seed);
        net.registerAgent('a', 0.8);
        net.registerAgent('b', 0.5);
        net.addListenEdge('b', 'a');
        const rumorId = net.injectRumor('APPROACHING_ARMY', 'Army marching', 'a', { confidence: 0.85 });
        const fear = new AnticipatoryFearEngine({}, { neuroticism: 0.5, resilience: 0.5 });
        for (let t = 0; t < ticks; t++) {
            net.advanceTick();
            for (const held of net.heldBy('b')) {
                if (held.rumorId === rumorId) {
                    fear.absorb('FACTION', 'invading_army', { confidence: held.confidence, observed: false, threatLevel: 0.9 });
                }
            }
            fear.advanceTick();
        }
        return { net, rumorId, fear };
    }

    function arbitrate(dread) {
        const arb = new GoalArbitrationEngine();
        arb.registerGoal('b', { type: GOAL_TYPES.PROTECT_ALLY, priority: 0.45 });
        arb.registerGoal('b', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
        return arb.arbitrate('b', { fear: dread }, {}).winningGoal;
    }

    it('1. Hearsay alone builds actionable dread with zero observations', () => {
        const { fear } = hearsay();
        expect(fear.dreadOf('FACTION', 'invading_army')).toBeGreaterThanOrEqual(0.6);
    });

    it('2. Rumor-fed dread flips PROTECT_ALLY to SURVIVE at zero sensed fear', () => {
        expect(arbitrate(0)).toBe(GOAL_TYPES.PROTECT_ALLY);
        const { fear } = hearsay();
        expect(arbitrate(fear.dreadOf('FACTION', 'invading_army'))).toBe(GOAL_TYPES.SURVIVE);
    });

    it('3. An unconnected agent is unaffected by the same rumor', () => {
        const net = new InformationPropagationEngine({}, 2026);
        net.registerAgent('a', 0.8);
        net.registerAgent('stranger', 0.5);
        // No listen edge: stranger never holds the rumor.
        net.injectRumor('APPROACHING_ARMY', 'Army marching', 'a', { confidence: 0.85 });
        for (let t = 0; t < 6; t++) net.advanceTick();
        expect(net.heldBy('stranger').length).toBe(0);
        expect(arbitrate(0)).toBe(GOAL_TYPES.PROTECT_ALLY);
    });

    it('4. Correction plus extinction restores the protect goal', () => {
        const { net, rumorId, fear } = hearsay();
        expect(arbitrate(fear.dreadOf('FACTION', 'invading_army'))).toBe(GOAL_TYPES.SURVIVE);
        net.correctRumor(rumorId, false);
        // Corrected hearsay is no longer absorbed; long quiet extinguishes.
        for (let t = 0; t < 200; t++) fear.advanceTick();
        expect(arbitrate(fear.dreadOf('FACTION', 'invading_army'))).toBe(GOAL_TYPES.PROTECT_ALLY);
    });

    it('5. The full chain is exactly reproducible', () => {
        const run = () => arbitrate(hearsay().fear.dreadOf('FACTION', 'invading_army'));
        expect(run()).toBe(run());
        expect(run()).toBe(GOAL_TYPES.SURVIVE);
    });
});
