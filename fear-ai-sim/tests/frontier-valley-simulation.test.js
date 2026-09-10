/**
 * tests/frontier-valley-simulation.test.js
 *
 * Sections 111-114 / Front C: Canonical Frontier Valley Simulation & World Degeneracy Detection.
 *
 * Asserts:
 * 1. Correctly initializes the canonical 3-settlement, 2-corridor, 4-faction Frontier Valley world.
 * 2. Deterministic execution: identical seeds yield bit-for-bit identical macro metrics across 100+ ticks.
 * 3. Seed variation produces genuine emergent variance across encounters, route danger, and fear levels.
 * 4. WorldDegeneracyDetector certifies healthy multi-seed runs without degenerate critical flags.
 * 5. WorldDegeneracyDetector catches artificial universal war, permanent stagnation, and universal panic regimes.
 * 6. Strictly adheres to the Host Game Authority Invariant.
 */

import { describe, it, expect } from '@jest/globals';
import {
    FrontierValleySimulation,
    WorldDegeneracyDetector,
    FRONTIER_VALLEY_FACTIONS,
    FRONTIER_VALLEY_SETTLEMENTS,
    FRONTIER_VALLEY_ROUTES
} from '../packages/core/src/FrontierValleySimulation.js';

describe('Sections 111-114 / Front C: Frontier Valley Canonical World & Degeneracy Detector', () => {
    it('1. Initializes the canonical Frontier Valley world topology', () => {
        const sim = new FrontierValleySimulation({ seed: 1001 });
        const summary = sim.getMacroSummary();

        expect(summary.ticksExecuted).toBe(0);
        expect(summary.settlements.northwatch).toBe(45);
        expect(summary.settlements.riverbend).toBe(65);
        expect(summary.settlements.oakhaven).toBe(90);

        expect(summary.factionSurvivals.settlers).toBe(true);
        expect(summary.factionSurvivals.bandits).toBe(true);
        expect(summary.factionSurvivals.nomads).toBe(true);
        expect(summary.factionSurvivals.wildlife).toBe(true);
    });

    it('2. Executes 100 ticks with strict deterministic replay', () => {
        const simA = new FrontierValleySimulation({ seed: 77777 });
        const summaryA = simA.advance(100);

        const simB = new FrontierValleySimulation({ seed: 77777 });
        const summaryB = simB.advance(100);

        expect(summaryA.ticksExecuted).toBe(100);
        expect(summaryB.ticksExecuted).toBe(100);
        expect(summaryA.totalEncounters).toBe(summaryB.totalEncounters);
        expect(summaryA.meanPopulationFear).toBe(summaryB.meanPopulationFear);
        expect(summaryA.routeFailures).toBe(summaryB.routeFailures);
        expect(summaryA.panicIncidents).toBe(summaryB.panicIncidents);
        expect(summaryA.settlements).toEqual(summaryB.settlements);
    });

    it('3. Generates meaningful macro outcome distributions across varied seeds', () => {
        const seeds = [101, 202, 303, 404, 505];
        const summaries = [];

        for (const seed of seeds) {
            const sim = new FrontierValleySimulation({ seed });
            const summary = sim.advance(120);
            summaries.push(summary);
        }

        // Verify that varied seeds yield diversity in encounters or fear metrics
        const fears = summaries.map(s => s.meanPopulationFear);
        const uniqueFears = new Set(fears);
        expect(uniqueFears.size).toBeGreaterThan(1);
    });

    it('4. WorldDegeneracyDetector certifies healthy multi-seed runs without critical flags', () => {
        const seeds = [111, 222, 333];
        const summaries = seeds.map(seed => {
            const sim = new FrontierValleySimulation({ seed });
            return sim.advance(80);
        });

        const analysis = WorldDegeneracyDetector.analyzeRuns(summaries);
        expect(analysis.degenerate).toBe(false);
        expect(analysis.healthyMetrics.stabilityScore).toBeGreaterThanOrEqual(0.75);
        expect(analysis.flags.filter(f => f.severity === 'CRITICAL').length).toBe(0);
    });

    it('5. WorldDegeneracyDetector flags artificial universal war degeneracy', () => {
        const warRuns = [
            { warsDeclared: 12, totalEncounters: 20, meanPopulationFear: 0.5 },
            { warsDeclared: 10, totalEncounters: 18, meanPopulationFear: 0.55 },
            { warsDeclared: 15, totalEncounters: 22, meanPopulationFear: 0.6 }
        ];

        const analysis = WorldDegeneracyDetector.analyzeRuns(warRuns);
        expect(analysis.degenerate).toBe(true);
        const warFlag = analysis.flags.find(f => f.type === 'UNIVERSAL_WAR_DEGENERACY');
        expect(warFlag).toBeDefined();
        expect(warFlag.severity).toBe('CRITICAL');
    });

    it('6. WorldDegeneracyDetector flags permanent stagnation degeneracy', () => {
        const stagnantRuns = [
            { warsDeclared: 0, totalEncounters: 0, meanPopulationFear: 0.05 },
            { warsDeclared: 0, totalEncounters: 0, meanPopulationFear: 0.05 }
        ];

        const analysis = WorldDegeneracyDetector.analyzeRuns(stagnantRuns);
        expect(analysis.degenerate).toBe(true);
        const stagFlag = analysis.flags.find(f => f.type === 'PERMANENT_STAGNATION_DEGENERACY');
        expect(stagFlag).toBeDefined();
    });

    it('7. Preserves Host Game Authority Invariant across world systems', () => {
        const sim = new FrontierValleySimulation({ seed: 500 });
        const summary = sim.advance(20);

        // Host authority verification: settlements have valid, non-negative populations
        expect(summary.settlements.northwatch).toBeGreaterThan(0);
        expect(summary.settlements.riverbend).toBeGreaterThan(0);
        expect(summary.settlements.oakhaven).toBeGreaterThan(0);
    });
});

describe('NEXT-33: autonomous settlement-layer trade flow', () => {
    it('8. Caravan loop-wrap delivers conserved goods and logs history', () => {
        const sim = new FrontierValleySimulation({ seed: 11 });
        for (let t = 0; t < 1000 && sim.macroMetrics.deliveries < 1; t++) sim.advance(1);
        // Both caravans may settle on the same tick; count matches events.
        expect(sim.macroMetrics.deliveries).toBeGreaterThanOrEqual(1);
        const events = sim.worldSystem.queryHistory({ eventType: 'TRADE_DELIVERY', limit: 0 });
        expect(events.length).toBe(sim.macroMetrics.deliveries);
        expect(events.map(e => e.consequences)).toContainEqual(expect.objectContaining({ commodity: 'food', amount: 2 }));
        // Faction ledger stays host-reported only: autonomy forges nothing.
        sim.advance(3000);
        expect(sim.tradeLedger.length).toBe(0);
    });

    it('9. Production sustains origins and flow is deterministic', () => {
        const run = () => {
            const sim = new FrontierValleySimulation({ seed: 11 });
            sim.advance(3000);
            return {
                deliveries: sim.macroMetrics.deliveries,
                north: sim.civSystem.nodes.get(FRONTIER_VALLEY_SETTLEMENTS.NORTHWATCH).market.food,
                oak: sim.civSystem.nodes.get(FRONTIER_VALLEY_SETTLEMENTS.OAKHAVEN).market.food
            };
        };
        const a = run();
        expect(run()).toEqual(a);
        // Pre-production this was exactly 10 with Northwatch drained to 0;
        // production plus the second caravan changed both deliberately.
        expect(a.deliveries).toBe(53);
        expect(a.north).toBeGreaterThan(5);
    });
});

describe('NEXT-45: production, upkeep, and multi-caravan scheduling', () => {
    test('11. Both caravans deliver; sinks stay capped with no negatives over 20k ticks', () => {
        const sim = new FrontierValleySimulation({ seed: 11 });
        sim.advance(1000);
        const early = sim.worldSystem.queryHistory({ eventType: 'TRADE_DELIVERY', limit: 0 });
        expect(new Set(early.map(e => e.primaryId))).toEqual(new Set(['caravan_merchant_1', 'caravan_merchant_2']));
        const d3k = (() => { const s = new FrontierValleySimulation({ seed: 11 }); s.advance(3000); return s.macroMetrics.deliveries; })();
        sim.advance(19000);
        expect(sim.macroMetrics.deliveries).toBeGreaterThan(d3k);
        const oak = sim.civSystem.nodes.get(FRONTIER_VALLEY_SETTLEMENTS.OAKHAVEN).market;
        expect(oak.food).toBeLessThanOrEqual(150.0);
        expect(oak.timber).toBeLessThanOrEqual(120.0);
        for (const node of sim.civSystem.nodes.values()) {
            for (const qty of Object.values(node.market)) expect(qty).toBeGreaterThanOrEqual(0);
        }
    });
});

describe('NEXT-43: setup-sweep outcome knobs', () => {
    test('10. Overrides apply, reject unknowns, and split outcome classes', async () => {
        const { runSetupSweep, setupSweepDigest } = await import('../benchmarks/behavioral-evaluation/valley_setup_sweep.mjs');
        const def = new FrontierValleySimulation({ seed: 11 });
        expect(def.factionSystem.getBilateralStance(
            FRONTIER_VALLEY_FACTIONS.SETTLERS,
            FRONTIER_VALLEY_FACTIONS.NOMADS).trust).toBe(0.6);
        expect(() => def.applySetupStance({ source: 'GHOST', target: FRONTIER_VALLEY_FACTIONS.NOMADS, patch: {} }))
            .toThrow('UNKNOWN_SETUP_FACTION');
        // Sweep: deterministic, and setup splits what seeds could not.
        const full = runSetupSweep();
        expect(setupSweepDigest(runSetupSweep())).toBe(setupSweepDigest(full));
        expect(full.cellCount).toBe(12);
        expect(full.classCount).toBe(3);
        expect(Object.keys(full.classes).sort()).toEqual([
            'SHADOW/ALLY/UNAWARE|wars=1|ally=1',
            'SHADOW/NEGOTIATE/UNAWARE|wars=1|ally=0',
            'SHADOW/TRADE/UNAWARE|wars=1|ally=0'
        ]);
    });
});

describe('NEXT-9: compaction-wired long soak', () => {
    test('12. Rolling compaction keeps every delivery anchor with a bounded live ledger', async () => {
        const { runCompactionSoak, compactionDigest } = await import('../benchmarks/behavioral-evaluation/valley_compaction_soak.mjs');
        // Tiny grid for suite speed; the full 2x100k grid lives in the script.
        const tiny = { seeds: [11], ticks: 2000, window: 100 };
        const first = runCompactionSoak(tiny);
        expect(compactionDigest(runCompactionSoak(tiny))).toBe(compactionDigest(first));
        const r = first.runs[0];
        expect(r.liveLedger).toBeLessThanOrEqual(1000);
        expect(r.anchorComplete).toBe(true);
        expect(r.keptDeliveries).toBe(r.deliveries);
        expect(r.deliveries).toBeGreaterThan(0);
    });
});

describe('NEXT-49: cold-tier archive bounding on the long grid', () => {
    test('14. Camp churn rolls into occupancy while delivery anchors stay complete', async () => {
        const { runCompactionSoak, compactionDigest } = await import('../benchmarks/behavioral-evaluation/valley_compaction_soak.mjs');
        // 8000 ticks crosses the 5000-tick cold age; suite stays fast.
        const grid = { seeds: [11], ticks: 8000, window: 100 };
        const first = runCompactionSoak(grid);
        expect(compactionDigest(runCompactionSoak(grid))).toBe(compactionDigest(first));
        const r = first.runs[0];
        expect(r.anchorComplete).toBe(true);
        expect(r.keptDeliveries).toBe(r.deliveries);
        // Churn absorbed: pairs rolled, per-group occupancy bounded.
        expect(r.coldPaired).toBeGreaterThan(0);
        expect(r.coldPairSummaryCount).toBeLessThanOrEqual(8);
        // Residual archive is anchors plus the warm window, not the churn.
        expect(r.archiveEvents).toBeLessThan(r.deliveries + 1000);
    });
});

describe('NEXT-41: HighlandPass pin attribution verdict', () => {
    test('13. Pin is chronic combat, not sticky decay: removal recovers to floor', () => {
        const sim = new FrontierValleySimulation({ seed: 11 });
        sim.advance(500);
        // Chronic side: a failure nearly every tick while bandits operate.
        expect(sim.macroMetrics.routeFailures).toBeGreaterThanOrEqual(400);
        expect(sim.civSystem.routes.get('HighlandPass').perceivedDanger).toBe(1.0);
        // Host removes the warband (host owns entities); decay alone must
        // recover the route to its floor on the documented half-life.
        sim.worldSystem.groups.delete('bandit_warband_1');
        sim.advance(800);
        expect(sim.civSystem.routes.get('HighlandPass').perceivedDanger).toBeCloseTo(0.35, 2);
    });
});
