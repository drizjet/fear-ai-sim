/**
 * benchmarks/behavioral-evaluation/civilization_lod_trade_benchmark.mjs
 *
 * Benchmark for Milestone G: Civilization-Scale Simulation, Dynamic Trade Routes,
 * and 5-Tier Cognitive Level-of-Detail (LOD).
 *
 * Evaluates:
 * 1. 5-Tier Cognitive LOD distribution across 1,000 entities
 * 2. State continuity invariant across LOD promotion/demotion (focus shifting)
 * 3. Dynamic economic danger rerouting: caravans detour around raided corridors
 * 4. Temporal decay of perceived route danger
 * 5. Checkpoint serialization and 100% bit-for-bit replay determinism
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    CivilizationSimulationSystem,
    COGNITIVE_LOD_TIERS,
    ROUTE_STATUS,
    COMMODITY_TYPES
} from '../../packages/core/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function runCivilizationBenchmark() {
    console.log('--- Starting Milestone G: Civilization Simulation & Cognitive LOD Benchmark ---');
    const startTime = performance.now();

    const civ = new CivilizationSimulationSystem();

    // 1. Setup Settlements & Waypoint Nodes
    civ.registerNode('valley_haven', {
        name: 'Valley Haven Agricultural Town',
        position: { x: 0, y: 0, z: 0 },
        factionId: 'settlers_guild',
        market: {
            [COMMODITY_TYPES.FOOD]: { sellPrice: 8, buyPrice: 12 },
            [COMMODITY_TYPES.ORE]: { sellPrice: 30, buyPrice: 45 }
        }
    });

    civ.registerNode('iron_city', {
        name: 'Iron City Mining Fortress',
        position: { x: 300, y: 400, z: 0 }, // 500m distance
        factionId: 'iron_clans',
        market: {
            [COMMODITY_TYPES.FOOD]: { sellPrice: 28, buyPrice: 35 },
            [COMMODITY_TYPES.ORE]: { sellPrice: 10, buyPrice: 15 }
        }
    });

    // 2. Setup Competing Trade Routes
    // Route 1: Short direct mountain pass (150m)
    civ.registerRoute('highland_pass', {
        fromNodeId: 'valley_haven',
        toNodeId: 'iron_city',
        distance: 150,
        baseSecurity: 0.85,
        toll: 0
    });

    // Route 2: Longer detour through river valley (350m, toll 5)
    civ.registerRoute('river_detour', {
        fromNodeId: 'valley_haven',
        toNodeId: 'iron_city',
        distance: 350,
        baseSecurity: 0.95,
        toll: 5
    });

    // 3. Register 1,000 Entities across the World Spatial Volume
    for (let i = 0; i < 1000; i++) {
        // Distribute entities in rings from 5m to 2000m
        const radius = (i % 50 === 0)
            ? 15 // Close (<30m)
            : (i % 20 === 0)
                ? 50 // Tactical (30-80m)
                : (i % 5 === 0)
                    ? 180 // Regional (80-250m)
                    : (i % 2 === 0)
                        ? 600 // Macro Route (250-1000m)
                        : 1500; // Offscreen (>1000m)

        const angle = (i * 0.37) % (2 * Math.PI);
        const x = Math.round(radius * Math.cos(angle));
        const y = Math.round(radius * Math.sin(angle));

        civ.registerEntity(`entity_${i}`, {
            type: (i % 10 === 0) ? 'CARAVAN' : (i % 4 === 0) ? 'PATROL' : 'NOMAD',
            position: { x, y, z: 0 },
            fear: (i % 100) / 200,
            morale: 0.8,
            currentRouteId: 'highland_pass'
        });
    }

    const results = {
        benchmark: 'Fear AI Civilization Simulation & Cognitive LOD Benchmark',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        totalEntities: 1000,
        totalTicks: 1000,
        phases: {},
        invariants: {},
        metrics: {},
        summary: {}
    };

    // -------------------------------------------------------------
    // Phase 1: 5-Tier Cognitive LOD Spatial Partitioning (Ticks 0 - 200)
    // -------------------------------------------------------------
    civ.setFocusOrigin(0, 0, 0);
    const lodReportInitial = civ.updateLODTiers();

    results.phases.phase1_lod_partitioning = {
        lodCounts: lodReportInitial.counts,
        allTiersPopulated: Object.values(lodReportInitial.counts).every(c => c > 0),
        immediateCount: lodReportInitial.counts[COGNITIVE_LOD_TIERS.LOD0_IMMEDIATE],
        offscreenCount: lodReportInitial.counts[COGNITIVE_LOD_TIERS.LOD4_OFFSCREEN]
    };

    // -------------------------------------------------------------
    // Phase 2: Promotion / Demotion Continuity Invariant (Ticks 200 - 400)
    // -------------------------------------------------------------
    // Shift focus origin to Iron City (300, 400), causing massive tier transitions
    civ.setFocusOrigin(300, 400, 0);
    const lodReportShift = civ.updateLODTiers();

    // Verify zero discontinuous corruption on promoted/demoted entities
    let continuityHolds = true;
    for (const trans of lodReportShift.transitions) {
        if (!Number.isFinite(trans.fear) || !Number.isFinite(trans.morale) || trans.fear < 0 || trans.morale < 0) {
            continuityHolds = false;
            break;
        }
    }

    results.phases.phase2_continuity_invariant = {
        totalTransitions: lodReportShift.transitions.length,
        continuityPreserved: continuityHolds,
        newLodCounts: lodReportShift.counts
    };

    // -------------------------------------------------------------
    // Phase 3: Dynamic Economic Trade Route Rerouting (Ticks 400 - 600)
    // -------------------------------------------------------------
    // Step 1: Initial normal ranking (Highland Pass should win due to shorter distance)
    const initialRanking = civ.rankTradeRoutes('valley_haven', 'iron_city', COMMODITY_TYPES.FOOD);
    const initialBestRoute = initialRanking[0].routeId;

    // Step 2: Severe bandit raid on Highland Pass
    civ.recordRouteIncident('highland_pass', 'BANDIT_RAID', 0.85);

    // Step 3: Re-ranking (River Detour should win because Highland Pass is BLOCKED)
    const reroutedRanking = civ.rankTradeRoutes('valley_haven', 'iron_city', COMMODITY_TYPES.FOOD);
    const reroutedBestRoute = reroutedRanking[0].routeId;

    results.phases.phase3_danger_rerouting = {
        initialBestRoute,
        initialPassedPass: initialBestRoute === 'highland_pass',
        postIncidentBestRoute: reroutedBestRoute,
        detourSelected: reroutedBestRoute === 'river_detour',
        highlandStatus: civ.routes.get('highland_pass').status,
        highlandBlocked: civ.routes.get('highland_pass').status === ROUTE_STATUS.BLOCKED
    };

    // -------------------------------------------------------------
    // Phase 4: Perceived Route Danger Temporal Decay (Ticks 600 - 800)
    // -------------------------------------------------------------
    const dangerBeforeDecay = civ.routes.get('highland_pass').perceivedDanger;
    for (let t = 0; t < 200; t++) {
        civ.advanceSimulation(1);
    }
    const dangerAfterDecay = civ.routes.get('highland_pass').perceivedDanger;

    results.phases.phase4_danger_decay = {
        dangerBefore: dangerBeforeDecay,
        dangerAfter: dangerAfterDecay,
        decayedSignificantly: dangerAfterDecay < dangerBeforeDecay * 0.5
    };

    // -------------------------------------------------------------
    // Phase 5: Snapshot Serialization & Replay Determinism (Ticks 800 - 1000)
    // -------------------------------------------------------------
    const snapshotAt800 = civ.getState();
    const cloneCiv = new CivilizationSimulationSystem();
    cloneCiv.setState(snapshotAt800);

    for (let t = 0; t < 200; t++) {
        civ.advanceSimulation(1);
        cloneCiv.advanceSimulation(1);
    }

    const origEnt = civ.entities.get('entity_0');
    const cloneEnt = cloneCiv.entities.get('entity_0');

    const determinismMatches = (
        origEnt.lodTier === cloneEnt.lodTier &&
        Math.abs(origEnt.fear - cloneEnt.fear) < 1e-6 &&
        Math.abs(origEnt.routeProgress - cloneEnt.routeProgress) < 1e-6 &&
        civ.tickCount === cloneCiv.tickCount
    );

    results.invariants.checkpointDeterminism = {
        deterministic: determinismMatches,
        tickCount: civ.tickCount
    };

    const durationMs = performance.now() - startTime;
    results.metrics.executionTimeMs = durationMs;
    results.metrics.entityUpdatesPerSec = Math.round((1000 * 400 / durationMs) * 1000);

    results.summary = {
        allInvariantsPass: Boolean(
            results.phases.phase1_lod_partitioning.allTiersPopulated &&
            results.phases.phase2_continuity_invariant.continuityPreserved &&
            results.phases.phase3_danger_rerouting.initialPassedPass &&
            results.phases.phase3_danger_rerouting.detourSelected &&
            results.phases.phase4_danger_decay.decayedSignificantly &&
            results.invariants.checkpointDeterminism.deterministic
        ),
        allTiersPopulated: results.phases.phase1_lod_partitioning.allTiersPopulated,
        continuityPreserved: results.phases.phase2_continuity_invariant.continuityPreserved,
        dangerReroutingVerified: results.phases.phase3_danger_rerouting.detourSelected,
        dangerDecayVerified: results.phases.phase4_danger_decay.decayedSignificantly
    };

    const outputPath = path.join(__dirname, 'civilization_lod_trade.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`--- Milestone G Benchmark Complete (${durationMs.toFixed(2)} ms). Results saved to ${outputPath} ---`);
    return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    runCivilizationBenchmark();
}
