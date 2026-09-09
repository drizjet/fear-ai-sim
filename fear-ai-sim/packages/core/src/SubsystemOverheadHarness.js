/**
 * @file SubsystemOverheadHarness.js — Sections LXXIX, CCXXI-CCXXII:
 * per-subsystem advisory-path cost accounting.
 *
 * Measures real per-call costs (median microseconds over measured calls
 * after warmup) for each major subsystem on representative workloads.
 * No models, no extrapolation: every figure is a measured median.
 *
 * Budgets (OVERHEAD_BUDGETS_US) are regression ceilings for typical
 * single-call workloads — generous by design so CI stays stable; they
 * catch pathological regressions (100x blowups), not 10% noise.
 * Deterministic structure: same subsystem set, same order, every run.
 */

import { AffectiveAgent } from './AffectiveAgent.js';
import { LayeredMemorySystem } from './LayeredMemorySystem.js';
import { MemoryRelevanceScorer } from './MemoryRelevanceScorer.js';
import { RumorMemory } from './RumorMemory.js';
import { RouteMemory } from './RouteMemory.js';
import { RelationshipTensorSystem, INTERACTION_TYPES } from './RelationshipTensorSystem.js';
import { GroupContagionSystem, GROUP_TYPES, GROUP_DOCTRINES } from './GroupContagionSystem.js';
import { ContagionGraph } from './ContagionGraph.js';
import { FactionSystem } from './FactionSystem.js';
import { WorldSimulationSystem, ROAMING_PARTY_TYPES } from './WorldSimulationSystem.js';
import { CivilizationSimulationSystem } from './CivilizationSimulationSystem.js';
import { EpistemicBeliefEngine } from './EpistemicBeliefEngine.js';
import { InformationPropagationEngine } from './InformationPropagationEngine.js';

/** Regression ceilings in microseconds per call (generous; catch blowups). */
export const OVERHEAD_BUDGETS_US = Object.freeze({
    'affect.tick': 5000,
    'memory.episodic': 5000,
    'memory.relevance': 20000,
    'memory.rumor': 5000,
    'memory.route': 5000,
    'social.interaction': 5000,
    'group.evaluate': 20000,
    'group.contagion': 5000,
    'faction.incident': 20000,
    'world.tick': 50000,
    'civ.routeRank': 20000,
    'belief.observe': 5000,
    'rumor.spread': 50000
});

function nowUs() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now() * 1000;
    }
    return Date.now() * 1000;
}

function median(values) {
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export class SubsystemOverheadHarness {
    constructor(warmupCalls = 20, measuredCalls = 100) {
        this.warmupCalls = Math.max(0, warmupCalls);
        this.measuredCalls = Math.max(1, measuredCalls);
    }

    time(fn) {
        for (let i = 0; i < this.warmupCalls; i++) fn(i);
        const samples = [];
        for (let i = 0; i < this.measuredCalls; i++) {
            const t0 = nowUs();
            fn(i);
            samples.push(nowUs() - t0);
        }
        const med = median(samples);
        return { medianUs: Math.round(med * 100) / 100, samples: samples.length };
    }

    measureAll() {
        const rows = {};
        const threat = { distance: 6.0, intensity: 0.7 };

        const agent = new AffectiveAgent('perf', { neuroticism: 0.5, resilience: 0.5 });
        rows['affect.tick'] = this.time(() => agent.tick(0.016, { threats: [threat] }, {}));

        const mem = new LayeredMemorySystem();
        let mic = 0;
        rows['memory.episodic'] = this.time((i) => {
            mem.recordEpisodic({ type: 'RESOURCE_DISCOVERED', salience: 0.4, participants: [`n${i % 25}`], tick: i });
        });
        const scorer = new MemoryRelevanceScorer();
        rows['memory.relevance'] = this.time(() => {
            scorer.rank(mem, { nowTick: 1000, entityIds: ['n3'], goalTags: ['ambush'] }, 5);
            mic += 1;
        });

        const rumors = new RumorMemory();
        rows['memory.rumor'] = this.time((i) => {
            rumors.hear({ id: `pr${i % 40}`, topic: 'ROAD_AMBUSH', claim: 'danger', confidence: 0.7 }, 0.6, i);
        });

        const routes = new RouteMemory();
        rows['memory.route'] = this.time((i) => {
            routes.recordTraversal(`rd${i % 10}`, { safe: i % 7 !== 0, tick: i });
        });

        const rel = new RelationshipTensorSystem();
        rows['social.interaction'] = this.time((i) => {
            rel.recordInteraction(`a${i % 10}`, `b${(i + 1) % 10}`, INTERACTION_TYPES.SHARED_SURVIVAL, {});
        });

        const groups = new GroupContagionSystem();
        groups.createGroup('g', GROUP_TYPES.SQUAD, GROUP_DOCTRINES.DISCIPLINED_STAND, 'l', ['l', 'm1', 'm2', 'm3']);
        const states = [
            { id: 'l', fear: 0.2, fearBand: 'CALM', isPanicking: false, traits: { leadership: 0.8 } },
            { id: 'm1', fear: 0.8, fearBand: 'PANIC', isPanicking: true },
            { id: 'm2', fear: 0.5, fearBand: 'ANXIOUS', isPanicking: false },
            { id: 'm3', fear: 0.1, fearBand: 'CALM', isPanicking: false }
        ];
        rows['group.evaluate'] = this.time(() => groups.evaluateGroup('g', states));

        const graph = new ContagionGraph();
        const focal = { id: 'f', x: 0, y: 0, z: 0, traits: { extraversion: 0.6, neuroticism: 0.6 } };
        const peers = [{ id: 'p', x: 3, y: 0, z: 0, fearBand: 'PANIC', isPanicking: true }];
        rows['group.contagion'] = this.time(() => graph.evaluateContagion(focal, peers));

        const factions = new FactionSystem();
        factions.registerFaction({ id: 'f1', name: 'F1' });
        factions.registerFaction({ id: 'f2', name: 'F2' });
        rows['faction.incident'] = this.time((i) => {
            factions.recordIncident('f1', 'f2', 'BORDER_TRESPASS', { n: i % 5 });
            if (i % 10 === 0) factions.evaluateStance('f2', 'f1', {});
        });

        const world = new WorldSimulationSystem();
        world.registerGroup('w1', { type: ROAMING_PARTY_TYPES.PATROL, factionId: 'f1', position: { x: 0, y: 0, z: 0 } });
        world.registerGroup('w2', { type: ROAMING_PARTY_TYPES.PATROL, factionId: 'f2', position: { x: 5, y: 0, z: 0 } });
        rows['world.tick'] = this.time(() => world.tick(1.0, { factionSystem: factions }));

        const civ = new CivilizationSimulationSystem();
        civ.registerNode('n1', { x: 0, y: 0, z: 0 });
        civ.registerNode('n2', { x: 100, y: 0, z: 0 });
        civ.registerRoute('r1', { fromNodeId: 'n1', toNodeId: 'n2' });
        rows['civ.routeRank'] = this.time(() => civ.rankTradeRoutes('n1', 'n2'));

        const belief = new EpistemicBeliefEngine('perf-agent', {});
        rows['belief.observe'] = this.time((i) => {
            belief.observeDirect({ threats: [{ id: `t${i % 5}`, distance: 10, intensity: 0.5 }] });
            if (i % 20 === 0) belief.tick(1);
        });

        const net = new InformationPropagationEngine({}, 99);
        for (const a of ['a', 'b', 'c', 'd', 'e']) net.registerAgent(a, 0.5);
        net.addListenEdge('b', 'a');
        net.addListenEdge('c', 'b');
        net.addListenEdge('d', 'c');
        net.addListenEdge('e', 'd');
        net.injectRumor('ROAD_AMBUSH', 'ambush ahead', 'a', { confidence: 0.9 });
        rows['rumor.spread'] = this.time(() => net.advanceTick());

        const report = { rows: {}, overBudget: [] };
        for (const [k, v] of Object.entries(rows)) {
            const budget = OVERHEAD_BUDGETS_US[k];
            report.rows[k] = { ...v, budgetUs: budget };
            if (v.medianUs > budget) report.overBudget.push(k);
        }
        report.subsystems = Object.keys(rows).length;
        report.allWithinBudget = report.overBudget.length === 0;
        return report;
    }
}

export default SubsystemOverheadHarness;
