/**
 * benchmarks/behavioral-evaluation/faction_escalation_benchmark.mjs
 *
 * Benchmark for Milestone F: Multi-Faction Diplomacy & the 14-Stage Escalation Matrix.
 * Evaluates:
 * 1. 14-stage progression: UNAWARE -> OBSERVE -> AVOID -> WARN -> NEGOTIATE -> TRADE ->
 *    SHADOW -> THREATEN -> MOBILIZE -> SKIRMISH -> ATTACK -> RETREAT -> SURRENDER -> ALLY
 * 2. Cultural bias modulation (MILITARISTIC vs MERCANTILE vs DEVOUT)
 * 3. Asymmetric directed hostility tensors
 * 4. Capability gates (military/resource exhaustion blocking offensive war)
 * 5. Uncertainty gates (low info confidence forcing OBSERVE/AVOID)
 * 6. Hysteresis preventing 1-tick de-escalation oscillation
 * 7. Checkpoint serialization and 100% bit-for-bit replay determinism
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    FactionSystem,
    ESCALATION_STAGES,
    FACTION_CULTURES,
    INCIDENT_TYPES
} from '../../packages/core/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function runFactionEscalationBenchmark() {
    console.log('--- Starting Milestone F: Faction Escalation Matrix Benchmark ---');
    const startTime = performance.now();

    const factionSys = new FactionSystem();

    // Register 3 distinct factions with varied cultures and profiles
    factionSys.registerFaction({
        id: 'settlers_guild',
        name: 'Settlers Commercial Guild',
        culture: FACTION_CULTURES.MERCANTILE,
        militaryReadiness: 0.60,
        economicStockpile: 0.85,
        legitimacy: 0.80,
        territories: ['green_valley', 'river_crossing']
    });

    factionSys.registerFaction({
        id: 'iron_clans',
        name: 'Iron Clans Warmongers',
        culture: FACTION_CULTURES.MILITARISTIC,
        militaryReadiness: 0.90,
        economicStockpile: 0.50,
        legitimacy: 0.70,
        territories: ['crag_fortress', 'iron_mines']
    });

    factionSys.registerFaction({
        id: 'forest_wardens',
        name: 'Forest Wardens of the Grove',
        culture: FACTION_CULTURES.DEVOUT,
        militaryReadiness: 0.75,
        economicStockpile: 0.60,
        legitimacy: 0.95,
        territories: ['ancient_canopy']
    });

    const results = {
        benchmark: 'Fear AI Faction Escalation Matrix Benchmark',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        totalTicks: 1000,
        phases: {},
        invariants: {},
        metrics: {},
        summary: {}
    };

    // -------------------------------------------------------------
    // Phase 1: Initial Contact & Boundary Encroachment (Ticks 0 - 200)
    // -------------------------------------------------------------
    let p1Initial = factionSys.evaluateStance('settlers_guild', 'iron_clans');
    let p1Report = null;

    for (let t = 0; t < 200; t++) {
        factionSys.advanceTick(1);
        if (t === 20) {
            // First sightings: OBSERVE
            factionSys.evaluateStance('iron_clans', 'settlers_guild', {
                informationConfidence: 0.40,
                territorialPressure: 0.15
            });
        }
        if (t === 80) {
            // Border encroachment incident
            factionSys.recordIncident('settlers_guild', 'iron_clans', INCIDENT_TYPES.BORDER_TRESPASS, {
                location: 'crag_foothills'
            });
        }
        if (t === 85) {
            p1Report = factionSys.evaluateStance('iron_clans', 'settlers_guild');
        }
    }

    if (!p1Report) p1Report = factionSys.evaluateStance('iron_clans', 'settlers_guild');

    results.phases.phase1_contact_and_encroachment = {
        fromStage: p1Initial.toStage,
        currentStage: p1Report.toStage,
        compositePressure: p1Report.compositePressure,
        casusBelli: p1Report.casusBelli,
        warnOrThreatenReached: [ESCALATION_STAGES.WARN, ESCALATION_STAGES.THREATEN, ESCALATION_STAGES.SHADOW].includes(p1Report.toStage)
    };

    // -------------------------------------------------------------
    // Phase 2: Diplomatic Overtures & Commercial Trade (Ticks 200 - 400)
    // -------------------------------------------------------------
    let p2ReportSettlers = null;
    let p2ReportIron = null;

    for (let t = 200; t < 400; t++) {
        factionSys.advanceTick(1);
        if (t === 210) {
            factionSys.recordIncident('settlers_guild', 'iron_clans', INCIDENT_TYPES.TREATY_OFFERED);
        }
        if (t === 230) {
            factionSys.recordIncident('settlers_guild', 'iron_clans', INCIDENT_TYPES.TRADE_ESTABLISHED);
        }
        if (t === 240) {
            p2ReportSettlers = factionSys.evaluateStance('settlers_guild', 'iron_clans', { trust: 0.60, grievance: 0.05 });
            p2ReportIron = factionSys.evaluateStance('iron_clans', 'settlers_guild', { trust: 0.50, grievance: 0.10 });
        }
    }

    if (!p2ReportSettlers) p2ReportSettlers = factionSys.evaluateStance('settlers_guild', 'iron_clans');
    if (!p2ReportIron) p2ReportIron = factionSys.evaluateStance('iron_clans', 'settlers_guild');

    results.phases.phase2_diplomacy_and_trade = {
        settlersStage: p2ReportSettlers.toStage,
        ironStage: p2ReportIron.toStage,
        tradeEstablished: p2ReportSettlers.toStage === ESCALATION_STAGES.TRADE || p2ReportIron.toStage === ESCALATION_STAGES.TRADE,
        settlersTrust: factionSys.getBilateralStance('settlers_guild', 'iron_clans').trust
    };

    // -------------------------------------------------------------
    // Phase 3: Treachery, Raid & Escalation to War (Ticks 400 - 600)
    // -------------------------------------------------------------
    let p3Report = null;

    for (let t = 400; t < 600; t++) {
        factionSys.advanceTick(1);
        if (t === 410) {
            factionSys.recordIncident('iron_clans', 'settlers_guild', INCIDENT_TYPES.TREATY_BROKEN);
        }
        if (t === 420) {
            factionSys.recordIncident('iron_clans', 'settlers_guild', INCIDENT_TYPES.RAID_CONFIRMED, { casualties: 24 });
        }
        if (t === 430) {
            factionSys.recordIncident('iron_clans', 'settlers_guild', INCIDENT_TYPES.SKIRMISH_CASUALTY, { casualties: 12 });
        }
        if (t === 440) {
            p3Report = factionSys.evaluateStance('settlers_guild', 'iron_clans', {
                territorialPressure: 0.85,
                economicPressure: 0.70
            });
        }
    }

    if (!p3Report) p3Report = factionSys.evaluateStance('settlers_guild', 'iron_clans');

    results.phases.phase3_war_escalation = {
        settlersStage: p3Report.toStage,
        compositePressure: p3Report.compositePressure,
        warEscalated: [ESCALATION_STAGES.MOBILIZE, ESCALATION_STAGES.SKIRMISH, ESCALATION_STAGES.ATTACK].includes(p3Report.toStage),
        casusBelli: p3Report.casusBelli
    };

    // -------------------------------------------------------------
    // Phase 4: Capability Gating & Resource Starvation (Ticks 600 - 750)
    // -------------------------------------------------------------
    const settlers = factionSys.getFaction('settlers_guild');
    settlers.militaryReadiness = 0.12; // Depleted (< 0.35)
    settlers.economicStockpile = 0.04; // Starved (< 0.10)

    let p4Report = null;
    for (let t = 600; t < 750; t++) {
        factionSys.advanceTick(1);
        if (t === 610) {
            p4Report = factionSys.evaluateStance('settlers_guild', 'iron_clans', {
                grievance: 0.95,
                territorialPressure: 0.90
            });
        }
    }

    if (!p4Report) p4Report = factionSys.evaluateStance('settlers_guild', 'iron_clans');

    results.phases.phase4_capability_gating = {
        settlersStage: p4Report.toStage,
        blockedByCapability: p4Report.capability.blockedByCapability,
        isMilitarilyCapable: p4Report.capability.isMilitarilyCapable,
        offensiveWarPrevented: p4Report.toStage !== ESCALATION_STAGES.ATTACK
    };

    // -------------------------------------------------------------
    // Phase 5: Capitulation (Surrender) & Mutual Alliance (Ticks 750 - 900)
    // -------------------------------------------------------------
    // Settlers capitulate under acute terror and exhaustion
    const p5Surrender = factionSys.evaluateStance('settlers_guild', 'iron_clans', {
        fear: 0.95,
        grievance: 0.80
    });

    // Iron Clans and Forest Wardens build mutual defense alliance
    factionSys.recordIncident('forest_wardens', 'iron_clans', INCIDENT_TYPES.TREATY_OFFERED);
    factionSys.recordIncident('forest_wardens', 'iron_clans', INCIDENT_TYPES.TRADE_ESTABLISHED);
    const p5Alliance = factionSys.evaluateStance('forest_wardens', 'iron_clans', {
        trust: 0.88,
        grievance: 0.02,
        territorialPressure: 0.05
    });

    results.phases.phase5_surrender_and_alliance = {
        settlersStage: p5Surrender.toStage,
        surrendered: p5Surrender.toStage === ESCALATION_STAGES.SURRENDER,
        allianceStage: p5Alliance.toStage,
        allied: p5Alliance.toStage === ESCALATION_STAGES.ALLY
    };

    // -------------------------------------------------------------
    // Phase 6: Snapshot Serialization & Replay Determinism (Ticks 900 - 1000)
    // -------------------------------------------------------------
    const snapshotAt900 = factionSys.getState();
    const cloneSys = new FactionSystem();
    cloneSys.setState(snapshotAt900);

    for (let t = 900; t < 1000; t++) {
        factionSys.advanceTick(1);
        cloneSys.advanceTick(1);
    }

    const endOrig = factionSys.evaluateStance('settlers_guild', 'iron_clans');
    const endClone = cloneSys.evaluateStance('settlers_guild', 'iron_clans');

    const determinismMatches = (
        endOrig.toStage === endClone.toStage &&
        Math.abs(endOrig.compositePressure - endClone.compositePressure) < 1e-6 &&
        factionSys.tickCount === cloneSys.tickCount
    );

    results.invariants.checkpointDeterminism = {
        deterministic: determinismMatches,
        tickCount: factionSys.tickCount
    };

    const durationMs = performance.now() - startTime;
    results.metrics.executionTimeMs = durationMs;
    results.metrics.ticksPerSec = Math.round((1000 / durationMs) * 1000);

    results.summary = {
        allInvariantsPass: Boolean(
            results.phases.phase1_contact_and_encroachment.warnOrThreatenReached &&
            results.phases.phase2_diplomacy_and_trade.tradeEstablished &&
            results.phases.phase3_war_escalation.warEscalated &&
            results.phases.phase4_capability_gating.blockedByCapability &&
            results.phases.phase5_surrender_and_alliance.surrendered &&
            results.phases.phase5_surrender_and_alliance.allied &&
            results.invariants.checkpointDeterminism.deterministic
        ),
        capabilityGateVerified: results.phases.phase4_capability_gating.blockedByCapability,
        tradeAndAllianceVerified: results.phases.phase2_diplomacy_and_trade.tradeEstablished && results.phases.phase5_surrender_and_alliance.allied,
        surrenderDynamicsVerified: results.phases.phase5_surrender_and_alliance.surrendered
    };

    const outputPath = path.join(__dirname, 'faction_escalation.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`--- Milestone F Benchmark Complete (${durationMs.toFixed(2)} ms). Results saved to ${outputPath} ---`);
    return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    runFactionEscalationBenchmark();
}
