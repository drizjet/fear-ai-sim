import { describe, it, expect } from '@jest/globals';
import { CausalEventGraph, CAUSAL_DOMAINS } from '../packages/core/index.js';
import { InformationPropagationEngine } from '../packages/core/index.js';
import { AnticipatoryFearEngine } from '../packages/core/index.js';
import { GoalArbitrationEngine, GOAL_TYPES } from '../packages/core/index.js';

// NEXT-141: rumor provenance in causal explanations (audit candidate 5).
// A rumor-driven goal flip must trace back to the rumor injection as its
// root cause — including the rumor's truth status — and corrections must
// append provenance, never rewrite it.
describe('NEXT-141: rumor provenance in causal chains', () => {
    // Full live chain: inject false army rumor -> propagate -> dread ->
    // arbitration flip; every step recorded into the causal graph.
    function liveChain() {
        const net = new InformationPropagationEngine({}, 2026);
        net.registerAgent('a', 0.8);
        net.registerAgent('b', 0.5);
        net.addListenEdge('b', 'a');
        const rumorId = net.injectRumor('APPROACHING_ARMY', 'Army marching', 'a', { confidence: 0.85 });
        const fear = new AnticipatoryFearEngine({}, { neuroticism: 0.5, resilience: 0.5 });
        for (let t = 0; t < 6; t++) {
            net.advanceTick();
            for (const held of net.heldBy('b')) {
                if (held.rumorId === rumorId) {
                    fear.absorb('FACTION', 'invading_army', { confidence: held.confidence, observed: false, threatLevel: 0.9 });
                }
            }
            fear.advanceTick();
        }
        const dread = fear.dreadOf('FACTION', 'invading_army');
        const arb = new GoalArbitrationEngine();
        arb.registerGoal('b', { type: GOAL_TYPES.PROTECT_ALLY, priority: 0.45 });
        arb.registerGoal('b', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
        const winner = arb.arbitrate('b', { fear: dread }, {}).winningGoal;

        const g = new CausalEventGraph();
        g.recordEvent({
            id: 'rumor_army_injected', tick: 0, domain: CAUSAL_DOMAINS.INFORMATION,
            type: 'RUMOR_INJECTED', entityId: 'a', severity: 0.85,
            description: 'False rumor injected: army marching on the valley',
            payload: { rumorId, truthful: false, topic: 'APPROACHING_ARMY' }
        });
        g.recordEvent({
            id: 'b_dread_onset', tick: 6, domain: CAUSAL_DOMAINS.AFFECTIVE,
            type: 'HEARSAY_DREAD_ONSET', entityId: 'b', severity: dread,
            description: `Listener dread reached ${dread.toFixed(3)} on pure hearsay`,
            payload: { rumorId, dread }
        });
        g.recordEvent({
            id: 'b_goal_flip', tick: 6, domain: CAUSAL_DOMAINS.AFFECTIVE,
            type: 'GOAL_FLIP', entityId: 'b', severity: 0.7,
            description: `Goal flipped PROTECT_ALLY -> ${winner} on hearsay dread`,
            payload: { rumorId, winner }
        });
        g.linkCausalEdge('rumor_army_injected', 'b_dread_onset', 0.8, 'RUMOR_HEARSAY');
        g.linkCausalEdge('b_dread_onset', 'b_goal_flip', 0.9, 'DREAD_MEDIATED_FLIP');
        return { g, rumorId, dread, winner };
    }

    it('1. INFORMATION is a first-class causal domain', () => {
        expect(CAUSAL_DOMAINS.INFORMATION).toBe('INFORMATION');
    });

    it('2. The goal flip traces to the rumor injection as root cause', () => {
        const { g, winner } = liveChain();
        expect(winner).toBe(GOAL_TYPES.SURVIVE);
        const analysis = g.findRootCauses('b_goal_flip');
        expect(analysis.rankedRootCauses[0].rootId).toBe('rumor_army_injected');
        expect(analysis.rankedRootCauses[0].rootNode.domain).toBe(CAUSAL_DOMAINS.INFORMATION);
        expect(analysis.rankedRootCauses[0].rootNode.payload.truthful).toBe(false);
    });

    it('3. The narrative names the false rumor and its transmission', () => {
        const { g } = liveChain();
        const text = g.generateNarrativeExplanation('b_goal_flip');
        expect(text).toMatch(/False rumor injected/);
        expect(text).toMatch(/RUMOR_HEARSAY/);
        expect(text).toMatch(/DREAD_MEDIATED_FLIP/);
    });

    it('4. Correction appends provenance without rewriting history', () => {
        const { g } = liveChain();
        g.recordEvent({
            id: 'rumor_army_corrected', tick: 12, domain: CAUSAL_DOMAINS.INFORMATION,
            type: 'RUMOR_CORRECTED', entityId: 'a', severity: 0.3,
            description: 'Army rumor corrected as lies',
            payload: { rumorId: 'APPROACHING_ARMY', truthful: false }
        });
        g.linkCausalEdge('rumor_army_injected', 'rumor_army_corrected', 1.0, 'CORRECTION_SUPERSEDES');
        // Original chain intact: flip still traces to the injection.
        const analysis = g.findRootCauses('b_goal_flip');
        expect(analysis.rankedRootCauses[0].rootId).toBe('rumor_army_injected');
        // And the correction itself is reachable from the same root.
        const correction = g.findRootCauses('rumor_army_corrected');
        expect(correction.rankedRootCauses[0].rootId).toBe('rumor_army_injected');
    });

    it('5. Intervention analysis fingers the rumor injection', () => {
        const { g } = liveChain();
        const intervention = g.isolateMinimalInterventionSet('b_goal_flip');
        expect(intervention.minimalInterventionNodes.some((n) => n.id === 'rumor_army_injected')).toBe(true);
    });
});
