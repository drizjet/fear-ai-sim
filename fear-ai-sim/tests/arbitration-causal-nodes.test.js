import { describe, it, expect } from '@jest/globals';
import { CausalEventGraph, CAUSAL_DOMAINS, recordDecisionOutcome } from '../packages/core/index.js';
import { InformationPropagationEngine } from '../packages/core/index.js';
import { AnticipatoryFearEngine } from '../packages/core/index.js';
import { GoalArbitrationEngine, GOAL_TYPES } from '../packages/core/index.js';

// NEXT-147: arbitration outcomes as causal nodes (audit candidate 11).
// recordDecisionOutcome files an arbitrate() result into the causal
// graph with edges from its cited antecedents, so goal flips trace
// back through dread to the rumor that caused them.
describe('NEXT-147: decisions as causal nodes', () => {
    function rumorChain() {
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
        return arb.arbitrate('b', { fear: dread }, {});
    }

    function graphWithRumor() {
        const g = new CausalEventGraph();
        g.recordEvent({
            id: 'rumor_army_injected', tick: 0, domain: CAUSAL_DOMAINS.INFORMATION,
            type: 'RUMOR_INJECTED', entityId: 'a', severity: 0.85,
            description: 'False rumor injected: army marching',
            payload: { truthful: false }
        });
        g.recordEvent({
            id: 'b_dread_onset', tick: 6, domain: CAUSAL_DOMAINS.AFFECTIVE,
            type: 'HEARSAY_DREAD_ONSET', entityId: 'b', severity: 0.685,
            description: 'Listener dread on pure hearsay'
        });
        g.linkCausalEdge('rumor_army_injected', 'b_dread_onset', 0.8, 'RUMOR_HEARSAY');
        return g;
    }

    it('1. Decision outcome records with cause edges', () => {
        const g = graphWithRumor();
        const decision = rumorChain();
        expect(decision.winningGoal).toBe(GOAL_TYPES.SURVIVE);
        const node = recordDecisionOutcome(g, decision, {
            tick: 6,
            causes: [
                { id: 'rumor_army_injected', weight: 0.8, mechanism: 'RUMOR_HEARSAY' },
                { id: 'b_dread_onset', weight: 0.9, mechanism: 'DREAD_MEDIATED_FLIP' }
            ]
        });
        expect(node.id).toBe('b:decision:6:SURVIVE');
        expect(node.domain).toBe(CAUSAL_DOMAINS.AFFECTIVE);
        expect(node.payload.winningGoal).toBe('SURVIVE');
        expect(node.parentIds.has('rumor_army_injected')).toBe(true);
        expect(node.parentIds.has('b_dread_onset')).toBe(true);
    });

    it('2. The decision traces to the rumor as root cause', () => {
        const g = graphWithRumor();
        const node = recordDecisionOutcome(g, rumorChain(), {
            tick: 6,
            causes: [
                { id: 'rumor_army_injected', weight: 0.8, mechanism: 'RUMOR_HEARSAY' },
                { id: 'b_dread_onset', weight: 0.9, mechanism: 'DREAD_MEDIATED_FLIP' }
            ]
        });
        const analysis = g.findRootCauses(node.id);
        expect(analysis.rankedRootCauses[0].rootId).toBe('rumor_army_injected');
        expect(g.generateNarrativeExplanation(node.id)).toMatch(/RUMOR_HEARSAY/);
    });

    it('3. Unknown causes throw without mutating the graph', () => {
        const g = graphWithRumor();
        const before = g.nodes.size;
        expect(() => recordDecisionOutcome(g, rumorChain(), {
            tick: 6, causes: [{ id: 'ghost_event', weight: 1 }]
        })).toThrow(/UNKNOWN_CAUSE/);
        expect(g.nodes.size).toBe(before);
    });

    it('4. Bad decisions, ticks, and weights fail loudly', () => {
        const g = graphWithRumor();
        expect(() => recordDecisionOutcome(null, {})).toThrow(/NEEDS_GRAPH/);
        expect(() => recordDecisionOutcome(g, {})).toThrow(/NEEDS_WINNER/);
        expect(() => recordDecisionOutcome(g, rumorChain(), { tick: -1 })).toThrow(/NEEDS_TICK/);
        expect(() => recordDecisionOutcome(g, rumorChain(), {
            tick: 6, causes: [{ id: 'b_dread_onset', weight: 0 }]
        })).toThrow(/BAD_CAUSE_WEIGHT/);
    });

    it('5. Recording is exactly reproducible', () => {
        const run = () => {
            const g = graphWithRumor();
            return recordDecisionOutcome(g, rumorChain(), {
                tick: 6, causes: [{ id: 'b_dread_onset', weight: 0.9 }]
            });
        };
        expect(run()).toEqual(run());
    });
});
