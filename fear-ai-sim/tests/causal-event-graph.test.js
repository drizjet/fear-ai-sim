/**
 * @file causal-event-graph.test.js
 *
 * Frontier E / Sections 156–160:
 * Causal Event Graph (DAG) & Automated Root-Cause Explainer.
 */

import { CausalEventGraph, CAUSAL_DOMAINS } from '../packages/core/index.js';

function buildSolariaCascade() {
    const graph = new CausalEventGraph({ defaultThreshold: 0.20 });
    graph.recordEvent({ id: 'raid_north_road', tick: 24, domain: CAUSAL_DOMAINS.ROAMING, type: 'BANDIT_RAID', entityId: 'caravan_3', severity: 0.85, description: 'Bandit Raid on North Road' });
    graph.recordEvent({ id: 'solaria_scarcity', tick: 38, domain: CAUSAL_DOMAINS.ECONOMIC, type: 'STOCKPILE_SCARCITY', entityId: 'solaria', severity: 0.78, description: 'Solaria Food Reserve dropped below 20.0 units' });
    graph.recordEvent({ id: 'rationing_fear', tick: 50, domain: CAUSAL_DOMAINS.AFFECTIVE, type: 'RATIONING_FEAR_SURGE', entityId: 'solaria_civilians', severity: 0.65, description: 'Rationing Directive enacted; Civilian Fear surged to 0.62' });
    graph.recordEvent({ id: 'famine_emergency', tick: 82, domain: CAUSAL_DOMAINS.DEMOGRAPHIC, type: 'FAMINE_EMERGENCY', entityId: 'solaria', severity: 0.92, description: 'Famine Emergency declared; 42 Citizens migrated south' });
    graph.linkCausalEdge('raid_north_road', 'solaria_scarcity', 0.85, 'CARGO_LOOTED_STARVES_RESERVE');
    graph.linkCausalEdge('solaria_scarcity', 'rationing_fear', 0.78, 'SCARCITY_DRIVES_DESPERATION_FEAR');
    graph.linkCausalEdge('rationing_fear', 'famine_emergency', 0.92, 'DESPERATION_TRIGGERS_MIGRATION_WAVE');
    return graph;
}

describe('Frontier E / Sections 156–160: Causal Event Graph & Root-Cause Explainer', () => {
    test('1. DAG construction enforces temporal ordering and rejects cycles', () => {
        const graph = new CausalEventGraph();
        graph.recordEvent({ id: 'e1', tick: 10, domain: CAUSAL_DOMAINS.ROAMING, type: 'BANDIT_RAID' });
        graph.recordEvent({ id: 'e2', tick: 20, domain: CAUSAL_DOMAINS.ECONOMIC, type: 'STOCKPILE_SCARCITY' });
        graph.recordEvent({ id: 'e3', tick: 20, domain: CAUSAL_DOMAINS.DIPLOMATIC, type: 'TREATY_RUMOR' });
        expect(graph.nodes.size).toBe(3);
        graph.linkCausalEdge('e1', 'e2', 0.7, 'RAID_LOOTS_RESERVE');
        expect(graph.edges.size).toBe(1);
        expect(() => graph.recordEvent({ id: 'e1', tick: 11, domain: CAUSAL_DOMAINS.MORAL, type: 'DUP' })).toThrow();
        expect(() => graph.linkCausalEdge('e2', 'e1', 0.5, 'TIME_REVERSAL')).toThrow();
        expect(() => graph.linkCausalEdge('e2', 'e2', 0.5, 'SELF_LOOP')).toThrow();
        graph.linkCausalEdge('e2', 'e3', 0.6, 'SCARCITY_STRAINS_TREATY');
        expect(() => graph.linkCausalEdge('e3', 'e1', 0.5, 'CLOSES_CYCLE')).toThrow();
    });

    test('2. Multi-hop traversal computes compound causal weight product', () => {
        const graph = buildSolariaCascade();
        const analysis = graph.findRootCauses('famine_emergency');
        expect(analysis.totalAncestors).toBe(3);
        expect(analysis.totalPathsFound).toBe(1);
        expect(analysis.depth).toBe(3);
        expect(analysis.criticalCompoundWeight).toBeCloseTo(0.85 * 0.78 * 0.92, 4);
        const ids = analysis.criticalPath.map((s) => s.node.id);
        expect(ids).toEqual(['raid_north_road', 'solaria_scarcity', 'rationing_fear', 'famine_emergency']);
        expect(analysis.rankedRootCauses[0].rootId).toBe('raid_north_road');
        const repeat = graph.findRootCauses('famine_emergency');
        expect(repeat.criticalCompoundWeight).toBe(analysis.criticalCompoundWeight);
        expect(repeat.criticalPath.map((s) => s.node.id)).toEqual(ids);
    });

    test('3. Minimal causal cut isolates roots across multi-system cascade', () => {
        const graph = new CausalEventGraph();
        graph.recordEvent({ id: 'rootA', tick: 10, domain: CAUSAL_DOMAINS.ROAMING, type: 'BANDIT_RAID' });
        graph.recordEvent({ id: 'midA', tick: 20, domain: CAUSAL_DOMAINS.ECONOMIC, type: 'STOCKPILE_SCARCITY' });
        graph.recordEvent({ id: 'rootB', tick: 12, domain: CAUSAL_DOMAINS.DIPLOMATIC, type: 'BORDER_PROVOCATION' });
        graph.recordEvent({ id: 'outcome', tick: 30, domain: CAUSAL_DOMAINS.DEMOGRAPHIC, type: 'MIGRATION_WAVE' });
        graph.linkCausalEdge('rootA', 'midA', 0.9, 'RAID_LOOTS_RESERVE');
        graph.linkCausalEdge('midA', 'outcome', 0.9, 'SCARCITY_DRIVES_FLIGHT');
        graph.linkCausalEdge('rootB', 'outcome', 0.5, 'TERROR_DRIVES_FLIGHT');
        const analysis = graph.findRootCauses('outcome');
        expect(analysis.rankedRootCauses.length).toBe(2);
        expect(analysis.rankedRootCauses[0].rootId).toBe('rootA');
        expect(analysis.rankedRootCauses[0].maxCompoundWeight).toBeCloseTo(0.81, 4);
        const cut = graph.isolateMinimalInterventionSet('outcome', 0.2);
        expect(cut.coveredRootCausesCount).toBe(2);
        expect(cut.totalRootCausesCount).toBe(2);
        expect(cut.minimalInterventionNodes.length).toBeGreaterThanOrEqual(2);
        const highThreshold = graph.findRootCauses('outcome', { threshold: 0.9 });
        expect(highThreshold.rankedRootCauses.length).toBeGreaterThanOrEqual(1);
    });

    test('4. Counterfactual intervention identifies earliest high-leverage node', () => {
        const graph = buildSolariaCascade();
        const cut = graph.isolateMinimalInterventionSet('famine_emergency', 0.2);
        expect(cut.minimalInterventionNodes.length).toBeGreaterThanOrEqual(1);
        expect(cut.minimalInterventionNodes[0].id).toBe('raid_north_road');
        expect(cut.minimalInterventionNodes[0].tick).toBe(24);
        expect(cut.estimatedPreventionConfidence).toBeGreaterThanOrEqual(0.9);
        expect(cut.coveredRootCausesCount).toBe(cut.totalRootCausesCount);
    });

    test('5. Narrative explanation synthesizes exact chronological chronicle', () => {
        const graph = buildSolariaCascade();
        const narrative = graph.generateNarrativeExplanation('famine_emergency');
        expect(narrative).toContain('OUTCOME EVENT: [Tick 82]');
        expect(narrative).toContain('PRIMARY ROOT CAUSE: [Tick 24]');
        expect(narrative).toContain('CRITICAL CAUSAL CHAIN:');
        expect(narrative).toContain('Tick  24: Bandit Raid on North Road');
        expect(narrative).toContain('Tick  82: Famine Emergency declared; 42 Citizens migrated south');
        expect(narrative).toContain('CARGO_LOOTED_STARVES_RESERVE');
        expect(narrative).toContain('COUNTERFACTUAL MITIGATION INTERVENTION:');
        expect(narrative).toContain('prevention confidence');
    });

    test('6. Bounded pruning preserves active causal ancestors', () => {
        const graph = buildSolariaCascade();
        graph.recordEvent({ id: 'stale_gossip', tick: 5, domain: CAUSAL_DOMAINS.DIPLOMATIC, type: 'STALE_RUMOR', entityId: 'tavern', severity: 0.1, description: 'Stale tavern gossip' });
        expect(graph.nodes.size).toBe(5);
        const pruned = graph.pruneBeyondHorizon(120, 100);
        expect(pruned).toBe(1);
        expect(graph.nodes.has('stale_gossip')).toBe(false);
        expect(graph.nodes.has('famine_emergency')).toBe(true);
        expect(graph.nodes.has('raid_north_road')).toBe(true);
        const analysis = graph.findRootCauses('famine_emergency');
        expect(analysis.criticalCompoundWeight).toBeCloseTo(0.85 * 0.78 * 0.92, 4);
        expect(graph.eventsByTick.has(5)).toBe(false);
    });

    test('7. Host game authority invariant strictly preserved', () => {
        const graph = buildSolariaCascade();
        const audit = graph.auditImmutability();
        expect(audit.isClean).toBe(true);
        expect(audit.status).toBe('CLEAN_ADVISORY_ONLY');
        expect(audit.hostPhysicsMutations).toBe(0);
        expect(audit.hostGeometryMutations).toBe(0);
        expect(audit.totalCausalNodes).toBe(4);
        expect(audit.totalCausalEdges).toBe(3);
    });
});
