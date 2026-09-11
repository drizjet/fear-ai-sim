import { describe, it, expect } from '@jest/globals';
import { CausalEventGraph, CAUSAL_DOMAINS, recordDecisionOutcome } from '../packages/core/index.js';
import { InformationPropagationEngine } from '../packages/core/index.js';
import { AnticipatoryFearEngine } from '../packages/core/index.js';
import { GoalArbitrationEngine, GOAL_TYPES } from '../packages/core/index.js';
import { FactionSystem } from '../packages/core/index.js';
import { compactEventLog, verifyAnchorClosure } from '../packages/core/src/EventLogCompactor.js';

// NEXT-153: history compaction preserving causal anchors (audit
// candidate 18). A full rumor-to-migration chain across five systems
// must survive aggressive pruning with its root-cause trace intact,
// and the parallel event log must compact with closed anchors.
// No production change was needed; these tests pin the composition.
describe('NEXT-153: compaction preserves causal anchors', () => {
    // Live five-system chain with 30 unrelated noise events.
    function worldChain() {
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
        const decision = arb.arbitrate('b', { fear: dread }, {});
        const factions = new FactionSystem({});
        factions.registerFaction({ id: 'A', culture: 'HONORABLE', militaryReadiness: 0.8, economicStockpile: 0.8 });
        factions.registerFaction({ id: 'B', culture: 'HONORABLE', militaryReadiness: 0.8, economicStockpile: 0.8 });
        const stance = factions.evaluateStance('A', 'B', {
            grievance: 0.9, trust: 0.2, territorialPressure: 0.3,
            informationConfidence: 0.8, leaderAggression: 1.0
        });

        const g = new CausalEventGraph();
        g.recordEvent({
            id: 'rumor_army_injected', tick: 0, domain: CAUSAL_DOMAINS.INFORMATION,
            type: 'RUMOR_INJECTED', entityId: 'a', severity: 0.85,
            description: 'False rumor injected: army marching', payload: { truthful: false }
        });
        g.recordEvent({
            id: 'b_dread_onset', tick: 6, domain: CAUSAL_DOMAINS.AFFECTIVE,
            type: 'HEARSAY_DREAD_ONSET', entityId: 'b', severity: dread,
            description: 'Listener dread on pure hearsay'
        });
        g.linkCausalEdge('rumor_army_injected', 'b_dread_onset', 0.8, 'RUMOR_HEARSAY');
        const node = recordDecisionOutcome(g, decision, {
            tick: 6,
            causes: [
                { id: 'rumor_army_injected', weight: 0.8, mechanism: 'RUMOR_HEARSAY' },
                { id: 'b_dread_onset', weight: 0.9, mechanism: 'DREAD_MEDIATED_FLIP' }
            ]
        });
        g.recordEvent({
            id: 'faction_mobilizes', tick: 60, domain: CAUSAL_DOMAINS.DIPLOMATIC,
            type: 'FACTION_MOBILIZE', entityId: 'A', severity: 0.7,
            description: `Faction mobilizes under hawkish leadership (${stance.toStage})`
        });
        g.linkCausalEdge(node.id, 'faction_mobilizes', 0.6, 'CLIMATE_OF_FEAR');
        g.recordEvent({
            id: 'settlement_migrates', tick: 200, domain: CAUSAL_DOMAINS.DEMOGRAPHIC,
            type: 'SETTLEMENT_MIGRATION', entityId: 'border_village', severity: 0.8,
            description: 'Border village migrates as armies muster'
        });
        g.linkCausalEdge('faction_mobilizes', 'settlement_migrates', 0.8, 'WAR_DISPLACEMENT');
        for (let i = 0; i < 30; i++) {
            g.recordEvent({
                id: `noise_${i}`, tick: i, domain: CAUSAL_DOMAINS.AFFECTIVE,
                type: 'BACKGROUND_NOISE', entityId: 'crowd', severity: 0.05,
                description: 'Unrelated background fluctuation'
            });
        }
        return { g, dread, winner: decision.winningGoal, stance: stance.toStage };
    }

    function eventLog() {
        const events = [
            { eventId: 'rumor_army_injected', tick: 0, type: 'RUMOR_INJECTED', anchor: true, parentEventIds: [] },
            { eventId: 'b_dread_onset', tick: 6, type: 'HEARSAY_DREAD_ONSET', parents: undefined, parentEventIds: ['rumor_army_injected'] },
            { eventId: 'b_decision', tick: 6, type: 'GOAL_FLIP', parentEventIds: ['b_dread_onset', 'rumor_army_injected'] },
            { eventId: 'faction_mobilizes', tick: 60, type: 'FACTION_MOBILIZE', parentEventIds: ['b_decision'] },
            { eventId: 'settlement_migrates', tick: 200, type: 'SETTLEMENT_MIGRATION', parentEventIds: ['faction_mobilizes'] }
        ];
        for (let i = 0; i < 60; i++) {
            events.push({ eventId: `bulk_${i}`, tick: i, type: 'BACKGROUND_NOISE', parentEventIds: [] });
        }
        return events;
    }

    it('1. Five-system chain assembles with the expected winners', () => {
        const { dread, winner, stance } = worldChain();
        expect(dread).toBeGreaterThanOrEqual(0.6);
        expect(winner).toBe(GOAL_TYPES.SURVIVE);
        expect(stance).toBe('MOBILIZE');
    });

    it('2. Aggressive pruning keeps the root-cause trace', () => {
        const { g } = worldChain();
        expect(g.nodes.size).toBe(35);
        const pruned = g.pruneBeyondHorizon(200, 100);
        expect(pruned).toBe(30);
        expect(g.nodes.size).toBe(5);
        const analysis = g.findRootCauses('settlement_migrates');
        expect(analysis.rankedRootCauses[0].rootId).toBe('rumor_army_injected');
        expect(analysis.rankedRootCauses[0].rootNode.payload.truthful).toBe(false);
    });

    it('3. Event-log compaction keeps anchors with closed closure', () => {
        const r = compactEventLog(eventLog(), { bulkTypes: ['BACKGROUND_NOISE'] });
        const ids = new Set(r.events.map((e) => e.eventId));
        for (const anchor of ['rumor_army_injected', 'b_dread_onset', 'b_decision', 'faction_mobilizes', 'settlement_migrates']) {
            expect(ids.has(anchor)).toBe(true);
        }
        expect(r.summaries.length).toBeGreaterThan(0);
        expect(verifyAnchorClosure(r.events).closed).toBe(true);
    });

    it('4. Pruning is exactly reproducible', () => {
        const run = () => {
            const { g } = worldChain();
            g.pruneBeyondHorizon(200, 100);
            return g.findRootCauses('settlement_migrates').rankedRootCauses[0].rootId;
        };
        expect(run()).toBe('rumor_army_injected');
        expect(run()).toBe(run());
    });
});
