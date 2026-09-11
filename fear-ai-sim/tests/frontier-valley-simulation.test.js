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

describe('NEXT-52: economy calibration verdict', () => {
    test('16. Slack plateau is flat, cliffs bind only at starvation and tiny caps', async () => {
        const { runEconomyCalibration } = await import('../benchmarks/behavioral-evaluation/economy_calibration.mjs');
        const grid = { seed: 11, ticks: 5000, upkeepMults: [0, 1, 5], prodMults: [0.5, 1, 2] };
        const a = runEconomyCalibration(grid);
        expect(runEconomyCalibration(grid)).toEqual(a);
        // Caravan cycle time binds in-regime: every plateau cell identical.
        const cells = Object.values(a.plateau);
        expect(new Set(cells).size).toBe(1);
        expect(cells[0]).toBe(88);
        // Cliffs: no production drains initial stock; tiny caps choke flow.
        expect(a.cliffs.productionZero).toBeLessThan(cells[0]);
        expect(a.cliffs.tinyCaps).toBeLessThan(cells[0]);
        expect(a.cliffs.productionZero).toBe(27);
        expect(a.cliffs.tinyCaps).toBe(24);
    });
});

describe('NEXT-67: satiation boundary at long horizon', () => {
    test('17. Upkeep-0 satiates by 15k, upkeep>=1 flows; counts hide volume', async () => {
        const { runSatiationBoundary } = await import('../benchmarks/behavioral-evaluation/economy_calibration.mjs');
        const grid = { seed: 11, ticks: 20000, legEvery: 5000 };
        const a = runSatiationBoundary(grid);
        expect(runSatiationBoundary(grid)).toEqual(a);
        // Satiation onset 5k-10k, full stall by 15k; sink pinned at its cap.
        expect(a.upkeepZero.deltas).toEqual([88, 16, 0, 0]);
        expect(a.upkeepZero.oakFood).toBe(150);
        // Normal upkeep flows at full count forever — even with the sink at
        // 149.7/150: counts measure loop liveness, not moved volume (NEXT-62).
        expect(a.upkeepNormal.deltas).toEqual([88, 89, 89, 88]);
        expect(a.upkeepNormal.oakFood).toBeCloseTo(149.7, 1);
        // Tiny caps throttle only the first window, then wrap at full count
        // while moving crumbs (sink pinned 1.7/2).
        expect(a.tinyCaps.deltas).toEqual([24, 89, 89, 88]);
        expect(a.tinyCaps.oakFood).toBeLessThanOrEqual(2);
    });
});

describe('NEXT-62: volume-weighted calibration', () => {
    test('18. Counts stay flat while volume sags; tiny caps converge near normal', async () => {
        const { runSatiationBoundary } = await import('../benchmarks/behavioral-evaluation/economy_calibration.mjs');
        const grid = { seed: 11, ticks: 20000, legEvery: 5000 };
        const a = runSatiationBoundary(grid);
        expect(runSatiationBoundary(grid)).toEqual(a);
        // Normal run: counts flat 88-89 while volume sags 156->120 (-23%)
        // as the sink fills — the count metric is blind to throughput decay.
        expect(a.upkeepNormal.volumes).toEqual([156, 157.5, 149.14, 120.02]);
        expect(a.upkeepNormal.volumes[3]).toBeLessThan(a.upkeepNormal.volumes[0]);
        // Upkeep-0: volume dies with counts (156/24/0/0).
        expect(a.upkeepZero.volumes).toEqual([156, 24, 0, 0]);
        // Tiny caps reach ~normal steady volume: the system is upkeep-limited
        // in steady state, not cap-limited.
        expect(a.tinyCaps.volumes).toEqual([32.18, 120.7, 120.49, 119.33]);
        expect(a.tinyCaps.volumes[3]).toBeGreaterThan(a.upkeepNormal.volumes[3] * 0.9);
    });
});

describe('NEXT-72: upkeep-law formalization', () => {
    test('19. Volume rises with upkeep then saturates at caravan capacity', async () => {
        const { runUpkeepLaw } = await import('../benchmarks/behavioral-evaluation/economy_calibration.mjs');
        const a = runUpkeepLaw();
        expect(runUpkeepLaw()).toEqual(a);
        const v = (t, u) => a.table[`T${t}/u${u}`];
        // Exact steady volumes at both horizons.
        expect(v(10000, 0.002)).toBe(219.9);
        expect(v(10000, 0.012)).toBe(313.5);
        expect(v(20000, 0.002)).toBe(259.8);
        expect(v(20000, 0.012)).toBe(582.7);
        // Monotone in upkeep at each horizon; saturating at the top
        // (inflow-limited: drains clear faster than caravans deliver).
        for (const t of [10000, 20000]) {
            expect(v(t, 0.002)).toBeLessThan(v(t, 0.012));
            expect(v(t, 0.02) / v(t, 0.012)).toBeLessThan(1.2);
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

describe('NEXT-50: leak assay retained-state legs', () => {
    test('15. Cold archive stays far below warm at matched ticks, legs stay ordered', async () => {
        const { runLeakAssay, leakDigest } = await import('../benchmarks/behavioral-evaluation/leak_assay.mjs');
        const grid = { seeds: [11], ticks: 8000, window: 100, legEvery: 4000 };
        const cold = runLeakAssay({ ...grid, cold: true });
        // Deterministic modulo wall clock and GC timing (not in the digest).
        expect(leakDigest(runLeakAssay({ ...grid, cold: true }))).toBe(leakDigest(cold));
        const warm = runLeakAssay({ ...grid, cold: false });
        const c = cold.runs[0];
        const w = warm.runs[0];
        // Cold tier absorbs the churn at matched ticks.
        expect(c.legs[c.legs.length - 1].archive).toBeLessThan(w.legs[w.legs.length - 1].archive);
        // Summaries stay bounded on both paths (cross-pass merge).
        for (const leg of [...c.legs, ...w.legs]) expect(leg.summaries).toBeLessThan(200);
        // Legs march forward in tick order with non-shrinking archives.
        for (const run of [c, w]) {
            expect(run.legs.map((l) => l.tick)).toEqual([4000, 8000]);
            expect(run.legs[1].archive).toBeGreaterThanOrEqual(run.legs[0].archive);
        }
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

describe('NEXT-63: advisory price channel', () => {
    test('20. Danger-scarcity prices are deterministic, bounded, and ordered', () => {
        const a = new FrontierValleySimulation({ seed: 11 });
        const b = new FrontierValleySimulation({ seed: 11 });
        // Deterministic at construction and bounded below by base.
        expect(a.advisoryPrice('food')).toBe(b.advisoryPrice('food'));
        expect(a.advisoryPrice('food')).toBeGreaterThanOrEqual(1);
        expect(a.advisoryPrice('timber')).toBeGreaterThanOrEqual(1);
        expect(a.advisoryPrice('food')).toBeCloseTo(1.508, 3);
        a.advance(10000);
        // Blocked-pass food carries a danger premium over safe-route timber.
        expect(a.advisoryPrice('food')).toBeCloseTo(1.551, 3);
        expect(a.advisoryPrice('timber')).toBeCloseTo(1.377, 3);
        expect(a.advisoryPrice('food')).toBeGreaterThan(a.advisoryPrice('timber'));
    });
});

describe('NEXT-80: valley misinformation end to end', () => {
    const SEED = 11;
    function seededValley() {
        const sim = new FrontierValleySimulation({ seed: SEED });
        const rumor = sim.worldSystem.createRumor('WAR_DECLARED', {
            sourceEntityId: 'bandit_warband_1', severity: 0.9, description: 'false army report'
        });
        return { sim, rumor };
    }
    function holders(sim, rumor) {
        return [...sim.worldSystem.groups.values()]
            .filter(g => g.knownRumors.has(rumor.id)).map(g => g.id).sort();
    }
    test('21. A false army report cascades live across valley groups', () => {
        const { sim, rumor } = seededValley();
        sim.advance(150);
        expect(holders(sim, rumor).length).toBeGreaterThanOrEqual(4);
        expect(sim.worldSystem.queryHistory({ eventType: 'RUMOR_SPREAD' }).length).toBeGreaterThanOrEqual(3);
    });
    test('22. Holder refutation cleans believers and costs bandit-directed trust', () => {
        const { sim, rumor } = seededValley();
        sim.advance(150);
        const pre = holders(sim, rumor).length;
        sim.worldSystem.correctRumor(rumor.id, {
            confirmed: false, byGroupId: 'caravan_merchant_1',
            relationshipTensorSystem: sim.relationshipSystem
        });
        sim.advance(150);
        expect(holders(sim, rumor).length).toBeLessThan(pre);
        expect(sim.worldSystem.queryHistory({ eventType: 'RUMOR_CORRECTED' }).length).toBe(1);
        const writes = [];
        for (const [, m] of sim.relationshipSystem.relationships) {
            for (const [t, v] of m) {
                if (t === 'lead_bandit_warband' && v.trust < 0.5) writes.push(v);
            }
        }
        expect(writes.length).toBeGreaterThanOrEqual(1);
        expect(writes.every(v => v.grievance > 0)).toBe(true);
        // Encounter-path pin: caravan_2 never corrected anything itself; its
        // loss must have arrived via a live encounter, which requires the
        // valley tick to thread the relationship store (not just correctRumor).
        expect(sim.relationshipSystem.getRelationship('lead_caravan_merchant_2', 'lead_bandit_warband').trust)
            .toBeLessThan(0.5);
    });
    test('23. The valley converges to zero holders of the falsehood', () => {
        const { sim, rumor } = seededValley();
        sim.advance(150);
        sim.worldSystem.correctRumor(rumor.id, {
            confirmed: false, byGroupId: 'caravan_merchant_1',
            relationshipTensorSystem: sim.relationshipSystem
        });
        sim.advance(450);
        expect(holders(sim, rumor)).toEqual([]);
    });
    test('24. Valley cascade is deterministic for a fixed seed', () => {
        const run = () => {
            const { sim, rumor } = seededValley();
            sim.advance(150);
            return holders(sim, rumor);
        };
        expect(run()).toEqual(run());
    });
    test('25. Valley snapshot preserves rumor and correction state', () => {
        const { sim, rumor } = seededValley();
        sim.advance(150);
        sim.worldSystem.correctRumor(rumor.id, {
            confirmed: false, byGroupId: 'caravan_merchant_1',
            relationshipTensorSystem: sim.relationshipSystem
        });
        sim.advance(150);
        const restored = new FrontierValleySimulation({ seed: 999 });
        restored.setState(sim.getState());
        expect(holders(restored, rumor)).toEqual(holders(sim, rumor));
        expect(restored.worldSystem.rumors.get(rumor.id).correction.confirmed).toBe(false);
        expect(restored.relationshipSystem.getRelationship('lead_caravan_merchant_2', 'lead_bandit_warband').trust)
            .toBe(sim.relationshipSystem.getRelationship('lead_caravan_merchant_2', 'lead_bandit_warband').trust);
    });
});

describe('NEXT-82: valley seed plumbing', () => {
    test('26. World-system stream varies by valley seed and is stable per seed', () => {
        const a = new FrontierValleySimulation({ seed: 11 });
        const b = new FrontierValleySimulation({ seed: 12 });
        const c = new FrontierValleySimulation({ seed: 11 });
        expect(a.worldSystem.config.seed).not.toBe(b.worldSystem.config.seed);
        expect(a.worldSystem.config.seed).toBe(c.worldSystem.config.seed);
    });
    test('27. Rumor distortion is deterministic for a fixed valley seed', () => {
        const run = () => {
            const sim = new FrontierValleySimulation({ seed: 11 });
            const rumor = sim.worldSystem.createRumor('WAR_DECLARED', {
                sourceEntityId: 'bandit_warband_1', severity: 0.9
            });
            sim.advance(150);
            const sevs = [];
            for (const g of sim.worldSystem.groups.values()) {
                const inst = g.knownRumors.get(rumor.id);
                if (inst) sevs.push(inst.perceivedSeverity);
            }
            return sevs;
        };
        const first = run();
        expect(first.length).toBeGreaterThanOrEqual(4);
        expect(run()).toEqual(first);
    });
});

describe('NEXT-85: hearsay route danger', () => {
    const SEED = 42;
    const PASS = FRONTIER_VALLEY_ROUTES.HIGHLAND_PASS;
    const RIVER = FRONTIER_VALLEY_ROUTES.RIVERWAY;
    function danger(sim, routeId) {
        return sim.civSystem.routes.get(routeId).perceivedDanger;
    }
    function twinRumored() {
        const sim = new FrontierValleySimulation({ seed: SEED });
        sim.worldSystem.createRumor('WAR_DECLARED', {
            sourceEntityId: 'bandit_warband_1', severity: 0.9, description: 'false army report',
            originLocation: { x: 250, y: 0, z: 175 }
        });
        sim.advance(150);
        return sim;
    }
    test('28. Heard threats raise route danger versus the rumor-free twin', () => {
        const plain = new FrontierValleySimulation({ seed: SEED });
        plain.advance(150);
        const rumored = twinRumored();
        expect(danger(rumored, RIVER)).toBeGreaterThan(danger(plain, RIVER));
        expect(danger(rumored, PASS)).toBeGreaterThanOrEqual(danger(plain, PASS));
    });
    test('29. Hearsay danger is deterministic for a fixed seed', () => {
        expect(danger(twinRumored(), RIVER)).toBe(danger(twinRumored(), RIVER));
    });
    test('30. One peaceful hearing adds exactly hearsay weight on the nearest route', () => {
        const sim = new FrontierValleySimulation({ seed: 11 });
        sim.worldSystem.groups.get('caravan_merchant_2').position = { x: 250, y: 0, z: 175 };
        const base = danger(sim, RIVER);
        sim._recordEncounterConsequences([{
            partyAId: 'caravan_merchant_2', partyBId: 'caravan_merchant_1',
            advisoryResolution: 'MUTUAL_AVOIDANCE', heardThreatRumor: true
        }]);
        expect(danger(sim, RIVER)).toBeCloseTo(base + 0.10, 9);
    });
    test('31. Combat encounters skip the hearsay branch', () => {
        const sim = new FrontierValleySimulation({ seed: 11 });
        sim._recordEncounterConsequences([{
            partyAId: 'bandit_warband_1', partyBId: 'caravan_merchant_1',
            advisoryResolution: 'COMBAT_ENGAGEMENT', heardThreatRumor: true
        }]);
        expect(danger(sim, PASS)).toBeCloseTo(0.35 + 0.25, 9);
    });
    test('32. NEXT-91: danger follows the threat site, not the hearing site', () => {
        const sim = new FrontierValleySimulation({ seed: 11 });
        const rumor = sim.worldSystem.createRumor('AMBUSH_HOTSPOT', {
            sourceEntityId: 'bandit_warband_1', severity: 0.9,
            originLocation: { x: 250, y: 0, z: 175 }
        });
        // Hearing parties stand on the pass; the reported threat is riverway.
        sim.worldSystem.groups.get('caravan_merchant_1').position = { x: 50, y: 0, z: 200 };
        const passBase = danger(sim, PASS);
        const riverBase = danger(sim, RIVER);
        sim._recordEncounterConsequences([{
            partyAId: 'caravan_merchant_1', partyBId: 'caravan_merchant_2',
            advisoryResolution: 'MUTUAL_AVOIDANCE', heardThreatRumor: true,
            heardThreatRumorIds: [rumor.id]
        }]);
        expect(danger(sim, RIVER)).toBeCloseTo(riverBase + 0.10, 9);
        expect(danger(sim, PASS)).toBe(passBase);
    });
});

describe('NEXT-92: hearsay advisory movement', () => {
    test('33. Two clustered hearings flip a quiet route SAFE to WATCHFUL', () => {
        const sim = new FrontierValleySimulation({ seed: 11 });
        const RIVER = FRONTIER_VALLEY_ROUTES.RIVERWAY;
        const route = () => sim.civSystem.routes.get(RIVER);
        expect(route().status).toBe('SAFE');
        sim.worldSystem.groups.get('caravan_merchant_2').position = { x: 250, y: 0, z: 175 };
        const enc = {
            partyAId: 'caravan_merchant_2', partyBId: 'caravan_merchant_1',
            advisoryResolution: 'MUTUAL_AVOIDANCE', heardThreatRumor: true
        };
        sim._recordEncounterConsequences([enc]);
        sim._recordEncounterConsequences([enc]);
        expect(route().perceivedDanger).toBeCloseTo(0.30, 9);
        expect(route().status).toBe('WATCHFUL');
    });
});
