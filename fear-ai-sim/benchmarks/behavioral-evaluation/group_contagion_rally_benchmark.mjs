/**
 * Group Contagion & Rally Dynamics Benchmark (Milestone E)
 *
 * Evaluates emergent group intelligence, panic cascade tipping points (bifurcation),
 * leader rally dynamics, leader break catastrophes, and cowardly desertion/fragmentation.
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    GroupContagionSystem,
    GROUP_TYPES,
    GROUP_DOCTRINES,
    GROUP_STATES,
    GROUP_DIRECTIVES,
    RelationshipTensorSystem
} from '../../packages/core/index.js';

export function runGroupContagionRallyBenchmark() {
    const groupSys = new GroupContagionSystem();
    const social = new RelationshipTensorSystem();

    const results = {
        benchmark: "Fear AI Group Contagion & Rally Dynamics Benchmark",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        totalTicks: 1000,
        phases: {},
        invariants: {},
        metrics: {}
    };

    // Create a disciplined military squad
    const squad = groupSys.createGroup(
        'alpha_squad',
        GROUP_TYPES.SQUAD,
        GROUP_DOCTRINES.DISCIPLINED_STAND,
        'squad_leader',
        ['squad_leader', 'vet_medic', 'point_scout', 'loyal_follower', 'heavy_defender', 'rookie_civilian']
    );

    // Create a fragile civilian crowd
    const crowd = groupSys.createGroup(
        'civilian_crowd',
        GROUP_TYPES.CIVILIAN_CROWD,
        GROUP_DOCTRINES.SELF_PRESERVATION,
        null,
        ['civ_1', 'civ_2', 'civ_3', 'civ_4', 'civ_5', 'civ_6']
    );

    // Setup initial relationships in squad
    for (const m of squad.members) {
        if (m !== 'squad_leader') {
            social.recordInteraction(m, 'squad_leader', 'LEADER_CALMING', { weight: 1.5 });
        }
    }

    // -------------------------------------------------------------
    // Phase 1: Isolated Stress vs Bifurcation Threshold (Ticks 0 - 200)
    // -------------------------------------------------------------
    // Single member panics in squad
    const p1States = new Map([
        ['squad_leader', { currentFear: 0.15, isPanicking: false, traits: { leadership: 0.9, resilience: 0.9 }, position: { x: 0, y: 0, z: 0 } }],
        ['vet_medic', { currentFear: 0.20, isPanicking: false, traits: { resilience: 0.8 }, position: { x: 2, y: 0, z: 0 } }],
        ['point_scout', { currentFear: 0.30, isPanicking: false, traits: { resilience: 0.6 }, position: { x: 5, y: 0, z: 0 } }],
        ['loyal_follower', { currentFear: 0.25, isPanicking: false, traits: { resilience: 0.5 }, position: { x: -2, y: 0, z: 0 } }],
        ['heavy_defender', { currentFear: 0.20, isPanicking: false, traits: { resilience: 0.8 }, position: { x: 0, y: 0, z: 2 } }],
        ['rookie_civilian', { currentFear: 0.85, isPanicking: true, traits: { resilience: 0.2, conscientiousness: 0.2 }, position: { x: -5, y: 0, z: 0 } }]
    ]);

    let p1Report = null;
    for (let t = 0; t < 200; t++) {
        p1Report = groupSys.evaluateGroup('alpha_squad', p1States, social, 1);
    }

    results.phases.phase1_isolated_stress = {
        squadState: p1Report.state,
        directive: p1Report.directive,
        panickingRatio: p1Report.panickingRatio,
        bifurcationThreshold: p1Report.bifurcationThreshold,
        squadHeld: p1Report.state === GROUP_STATES.CONTESTED_STAND,
        cohesion: p1Report.cohesion
    };

    // -------------------------------------------------------------
    // Phase 2: Heroic Leader Rally Dynamic (Ticks 200 - 400)
    // -------------------------------------------------------------
    // Two wavering members; calm leader steps forward to rally squad
    const p2States = new Map([
        ['squad_leader', { currentFear: 0.10, isPanicking: false, traits: { leadership: 0.95, resilience: 0.9 }, position: { x: 0, y: 0, z: 0 } }],
        ['vet_medic', { currentFear: 0.20, isPanicking: false, traits: { resilience: 0.8 }, position: { x: 2, y: 0, z: 0 } }],
        ['point_scout', { currentFear: 0.72, isPanicking: true, traits: { resilience: 0.6 }, position: { x: 10, y: 0, z: 0 } }],
        ['loyal_follower', { currentFear: 0.75, isPanicking: true, traits: { resilience: 0.5 }, position: { x: 5, y: 0, z: 0 } }],
        ['heavy_defender', { currentFear: 0.20, isPanicking: false, traits: { resilience: 0.8 }, position: { x: 0, y: 0, z: 2 } }],
        ['rookie_civilian', { currentFear: 0.80, isPanicking: true, traits: { resilience: 0.2, conscientiousness: 0.2 }, position: { x: 15, y: 0, z: 0 } }]
    ]);

    let p2Report = null;
    for (let t = 200; t < 400; t++) {
        p2Report = groupSys.evaluateGroup('alpha_squad', p2States, social, 1);
    }

    results.phases.phase2_leader_rally = {
        squadState: p2Report.state,
        directive: p2Report.directive,
        ralliedCount: p2Report.rallied.length,
        rallyActive: p2Report.state === GROUP_STATES.RALLYING,
        ralliedAgents: p2Report.rallied.map(r => r.agentId)
    };

    // -------------------------------------------------------------
    // Phase 3: Critical Mass & Panic Cascade Bifurcation (Ticks 400 - 600)
    // -------------------------------------------------------------
    // In civilian crowd, 3/6 panic (50% ratio breaches 25% threshold)
    const p3CrowdStates = new Map([
        ['civ_1', { currentFear: 0.85, isPanicking: true, position: { x: 0, y: 0, z: 0 } }],
        ['civ_2', { currentFear: 0.80, isPanicking: true, position: { x: 5, y: 0, z: 0 } }],
        ['civ_3', { currentFear: 0.78, isPanicking: true, position: { x: -5, y: 0, z: 0 } }],
        ['civ_4', { currentFear: 0.40, isPanicking: false, position: { x: 2, y: 0, z: 2 } }],
        ['civ_5', { currentFear: 0.35, isPanicking: false, position: { x: -2, y: 0, z: 2 } }],
        ['civ_6', { currentFear: 0.30, isPanicking: false, position: { x: 0, y: 0, z: 5 } }]
    ]);

    let p3CrowdReport = null;
    for (let t = 400; t < 600; t++) {
        p3CrowdReport = groupSys.evaluateGroup('civilian_crowd', p3CrowdStates, null, 1);
    }

    results.phases.phase3_cascade_bifurcation = {
        crowdState: p3CrowdReport.state,
        crowdDirective: p3CrowdReport.directive,
        cascadeTriggered: p3CrowdReport.state === GROUP_STATES.CASCADE_TRIGGERED || p3CrowdReport.state === GROUP_STATES.SCATTERED_STAMPEDE,
        panickingRatio: p3CrowdReport.panickingRatio,
        threshold: p3CrowdReport.bifurcationThreshold
    };

    // -------------------------------------------------------------
    // Phase 4: Catastrophic Leader Collapse (Ticks 600 - 800)
    // -------------------------------------------------------------
    // Squad leader breaks and enters full panic (fear = 0.95)
    const p4LeaderBrokenStates = new Map([
        ['squad_leader', { currentFear: 0.95, isPanicking: true, traits: { leadership: 0.95, resilience: 0.9 }, position: { x: 0, y: 0, z: 0 } }],
        ['vet_medic', { currentFear: 0.70, isPanicking: true, traits: { resilience: 0.8 }, position: { x: 2, y: 0, z: 0 } }],
        ['point_scout', { currentFear: 0.85, isPanicking: true, traits: { resilience: 0.6 }, position: { x: 10, y: 0, z: 0 } }],
        ['loyal_follower', { currentFear: 0.90, isPanicking: true, traits: { resilience: 0.5 }, position: { x: 5, y: 0, z: 0 } }],
        ['heavy_defender', { currentFear: 0.65, isPanicking: false, traits: { resilience: 0.8 }, position: { x: 0, y: 0, z: 2 } }],
        ['rookie_civilian', { currentFear: 0.95, isPanicking: true, traits: { resilience: 0.2, conscientiousness: 0.2 }, position: { x: 15, y: 0, z: 0 } }]
    ]);

    let p4Report = null;
    for (let t = 600; t < 800; t++) {
        p4Report = groupSys.evaluateGroup('alpha_squad', p4LeaderBrokenStates, social, 1);
    }

    const leaderPanicMultiplier = groupSys.getContagionMultiplier('alpha_squad', 'loyal_follower', true);

    results.phases.phase4_leader_collapse = {
        squadState: p4Report.state,
        squadDirective: p4Report.directive,
        cohesionCollapsed: p4Report.cohesion <= 0.35,
        leaderPanicMultiplier,
        stampedeTriggered: p4Report.state === GROUP_STATES.SCATTERED_STAMPEDE
    };

    // -------------------------------------------------------------
    // Phase 5: Desertion & Squad Fragmentation (Ticks 800 - 1000)
    // -------------------------------------------------------------
    // Check deserters
    const desertersList = p4Report.desertersCount;
    const isFragmented = p4Report.state === GROUP_STATES.FRAGMENTED || p4Report.state === GROUP_STATES.SCATTERED_STAMPEDE;

    // Check relationship grievance against rookie deserter
    const defenderGrievanceAgainstRookie = social.getRelationship('heavy_defender', 'rookie_civilian')?.grievance ?? 0;

    results.phases.phase5_desertion = {
        desertersCount: desertersList,
        squadFragmentedOrStampeding: isFragmented,
        abandonmentGrievanceRecorded: defenderGrievanceAgainstRookie > 0
    };

    // -------------------------------------------------------------
    // Midpoint Checkpoint Determinism Check
    // -------------------------------------------------------------
    const savedGroupSnapshot = groupSys.getState();
    const replayGroupSys = new GroupContagionSystem();
    replayGroupSys.setState(savedGroupSnapshot);

    const snapshotMatch = (
        replayGroupSys.groups.get('alpha_squad').state === groupSys.groups.get('alpha_squad').state &&
        replayGroupSys.groups.get('alpha_squad').cohesion === groupSys.groups.get('alpha_squad').cohesion &&
        replayGroupSys.groups.get('civilian_crowd').state === groupSys.groups.get('civilian_crowd').state
    );

    results.invariants.checkpointDeterminism = {
        deterministic: snapshotMatch
    };

    results.summary = {
        allInvariantsPass: snapshotMatch && results.phases.phase1_isolated_stress.squadHeld && results.phases.phase2_leader_rally.rallyActive && results.phases.phase3_cascade_bifurcation.cascadeTriggered,
        bifurcationVerified: results.phases.phase3_cascade_bifurcation.cascadeTriggered,
        rallyDynamicsVerified: results.phases.phase2_leader_rally.rallyActive,
        leaderCollapseCatastropheVerified: results.phases.phase4_leader_collapse.stampedeTriggered
    };

    return results;
}

export function runAndSaveGroupContagionBenchmark(outputPath = null) {
    const results = runGroupContagionRallyBenchmark();
    const targetPath = outputPath || fileURLToPath(new URL('./group_contagion_rally.json', import.meta.url));
    fs.writeFileSync(targetPath, JSON.stringify(results, null, 2), 'utf8');
    console.log(`Exported group contagion benchmark results to ${targetPath}`);
    return results;
}

if (process.argv[1] && process.argv[1].includes('group_contagion_rally_benchmark.mjs')) {
    runAndSaveGroupContagionBenchmark();
}
