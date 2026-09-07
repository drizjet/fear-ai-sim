/**
 * Layered Memory & Relationship Tensor Benchmark (Milestone D)
 *
 * Evaluates the 4-tier layered memory architecture (sensory, episodic, trauma, semantic)
 * and directed multi-dimensional relationship tensors across long-horizon social scenarios (2,000 ticks).
 *
 * Quantifies:
 * 1. Directed Asymmetric Dynamics: R_ij !== R_ji
 * 2. Interaction-Driven Relationship Evolution: shared survival, rescue, abandonment, betrayal
 * 3. Behavioral Modulation: contagion filtering, leader reassurance gating, and altruism refusal
 * 4. Bounded Resource Policy: zero memory leaks or unbounded growth across thousands of events
 * 5. Replay Determinism: bit-for-bit identical snapshot restoration
 */

import {
    LayeredMemorySystem,
    EPISODIC_EVENT_TYPES,
    SEMANTIC_CATEGORIES,
    RelationshipTensorSystem,
    INTERACTION_TYPES
} from '../../packages/core/index.js';

export function runLayeredMemoryRelationshipBenchmark() {
    const memory = new LayeredMemorySystem();
    const social = new RelationshipTensorSystem();

    const results = {
        benchmark: "Fear AI Layered Memory & Relationship Tensor Benchmark",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        totalTicks: 2000,
        phases: {},
        invariants: {},
        metrics: {}
    };

    const agents = [
        { id: 'hero_medic', name: 'Resilient Medic', agreeableness: 0.9, leadership: 0.5 },
        { id: 'cowardly_scout', name: 'Cowardly Scout', agreeableness: 0.1, leadership: 0.1 },
        { id: 'trusted_leader', name: 'Protective Leader', agreeableness: 0.7, leadership: 0.95 },
        { id: 'grateful_follower', name: 'Compliant Follower', agreeableness: 0.8, leadership: 0.2 },
        { id: 'traumatized_watcher', name: 'Paranoid Watcher', agreeableness: 0.4, leadership: 0.3 }
    ];

    // -------------------------------------------------------------
    // Phase 1: Baseline Stranger Reconnaissance (Ticks 0 - 100)
    // -------------------------------------------------------------
    for (let t = 0; t < 100; t++) {
        memory.recordSensory({
            threat_distance: 60,
            threat_detected: false,
            peers: ['trusted_leader', 'hero_medic'],
            position: { x: t * 0.5, y: 0, z: 0 }
        }, t);

        if (t === 20) {
            memory.recordSemantic('cache_alpha', SEMANTIC_CATEGORIES.RESOURCE, { x: 10, y: 0, z: 5 }, 0.85, { type: 'medical_supplies' }, t);
            memory.recordSemantic('ridge_chokepoint', SEMANTIC_CATEGORIES.CHOKEPOINT, { x: 45, y: 0, z: 0 }, 0.90, { dangerLevel: 0.3 }, t);
        }

        memory.tick(1);
        social.tick(1);
    }

    const p1StrangerTrust = social.getRelationship('grateful_follower', 'trusted_leader').trust;
    const p1StrangerGrievance = social.getRelationship('grateful_follower', 'cowardly_scout').grievance;

    results.phases.phase1_baseline = {
        sensoryBufferCount: memory.sensory.length,
        semanticBeliefsCount: memory.semantic.size,
        initialTrust: p1StrangerTrust,
        initialGrievance: p1StrangerGrievance
    };

    // -------------------------------------------------------------
    // Phase 2: Shared Threat Survival & Heroic Rescue (Ticks 100 - 300)
    // -------------------------------------------------------------
    // Threat strikes: leader calms follower; hero medic rescues traumatized watcher
    for (let t = 100; t < 300; t++) {
        if (t === 120) {
            social.recordInteraction('grateful_follower', 'trusted_leader', INTERACTION_TYPES.LEADER_CALMING, { weight: 1.5 });
            social.recordInteraction('traumatized_watcher', 'hero_medic', INTERACTION_TYPES.RESCUE_CONFIRMED, { weight: 1.5 });
            social.recordInteraction('hero_medic', 'traumatized_watcher', INTERACTION_TYPES.AID_PROVIDED, { weight: 1.0 });

            memory.recordEpisodic({
                type: EPISODIC_EVENT_TYPES.REASSURED_BY_LEADER,
                valence: 0.6,
                arousal: 0.4,
                intensity: 0.7,
                salience: 0.8,
                participants: ['trusted_leader', 'grateful_follower'],
                location: { x: 25, y: 0, z: 10 },
                details: { calmingEffect: 0.45 },
                tick: t
            });

            memory.recordEpisodic({
                type: EPISODIC_EVENT_TYPES.ALLIED_EXTRACTION,
                valence: 0.9,
                arousal: 0.6,
                intensity: 0.9,
                salience: 0.95,
                participants: ['hero_medic', 'traumatized_watcher'],
                location: { x: 30, y: 0, z: 12 },
                details: { lifeSaved: true },
                tick: t
            });
        }

        memory.tick(1);
        social.tick(1);
    }

    const p2FollowerLeaderRespect = social.getRelationship('grateful_follower', 'trusted_leader').respect;
    const p2WatcherMedicTrust = social.getRelationship('traumatized_watcher', 'hero_medic').trust;
    const p2WatcherMedicObligation = social.getRelationship('traumatized_watcher', 'hero_medic').obligation;

    // Directed Asymmetric check: watcher has high obligation to medic, but medic has zero obligation to watcher!
    const p2MedicWatcherObligation = social.getRelationship('hero_medic', 'traumatized_watcher').obligation;

    results.phases.phase2_bonding_rescue = {
        followerLeaderRespect: p2FollowerLeaderRespect,
        watcherMedicTrust: p2WatcherMedicTrust,
        watcherMedicObligation: p2WatcherMedicObligation,
        medicWatcherObligation: p2MedicWatcherObligation,
        directedAsymmetryVerified: p2WatcherMedicObligation > 0.4 && p2MedicWatcherObligation < 0.1
    };

    // -------------------------------------------------------------
    // Phase 3: Acute Treachery & Abandonment (Ticks 300 - 500)
    // -------------------------------------------------------------
    // Cowardly scout abandons grateful follower to a predator
    for (let t = 300; t < 500; t++) {
        if (t === 320) {
            social.recordInteraction('grateful_follower', 'cowardly_scout', INTERACTION_TYPES.ABANDONMENT, { weight: 1.2 });
            social.recordInteraction('grateful_follower', 'cowardly_scout', INTERACTION_TYPES.BETRAYAL, { weight: 1.0 });

            memory.recordEpisodic({
                type: EPISODIC_EVENT_TYPES.ABANDONED_BY_PEER,
                valence: -0.9,
                arousal: 0.95,
                intensity: 0.95,
                salience: 0.95, // Flashbulb salient traumatic betrayal
                participants: ['cowardly_scout', 'grateful_follower'],
                location: { x: 50, y: 0, z: -10 },
                details: { betrayedUnderFire: true },
                tick: t
            });

            // Spatial trauma scarred at ambush coordinate
            memory.recordTrauma('SPATIAL', 'ambush_ravine', 0.95, { x: 50, y: 0, z: -10 }, 40, 0.001);
            memory.recordTrauma('ENTITY', 'predator_stalker_01', 0.90, null, 0, 0.001);
        }

        memory.tick(1);
        social.tick(1);
    }

    const p3BetrayalTrust = social.getRelationship('grateful_follower', 'cowardly_scout').trust;
    const p3BetrayalGrievance = social.getRelationship('grateful_follower', 'cowardly_scout').grievance;

    results.phases.phase3_betrayal = {
        betrayalTrust: p3BetrayalTrust,
        betrayalGrievance: p3BetrayalGrievance,
        traumaCuesCount: memory.trauma.length
    };

    // -------------------------------------------------------------
    // Phase 4: Crisis Divergence & Altruism Gating (Ticks 500 - 700)
    // -------------------------------------------------------------
    // Follower encounters situation where both scout and medic are in danger
    const p4WillingnessToHelpScout = social.getProSocialWillingness('grateful_follower', 'cowardly_scout', 0.8);
    const p4WillingnessToHelpMedic = social.getProSocialWillingness('grateful_follower', 'hero_medic', 0.8);
    const p4ContagionFromScout = social.getContagionSusceptibility('grateful_follower', 'cowardly_scout', 0.8);
    const p4ContagionFromLeader = social.getContagionSusceptibility('grateful_follower', 'trusted_leader', 0.8);

    // Leader attempts to calm follower vs cowardly scout attempting to calm follower
    const p4ReassuranceFromLeader = social.getLeaderReassuranceEfficiency('grateful_follower', 'trusted_leader', 0.6);
    const p4ReassuranceFromScout = social.getLeaderReassuranceEfficiency('grateful_follower', 'cowardly_scout', 0.6);

    // Check trauma dread at ambush site
    const p4TraumaDreadAtAmbush = memory.getTraumaDread({ x: 50, y: 0, z: -10 });
    const p4TraumaDreadAtSafe = memory.getTraumaDread({ x: 0, y: 0, z: 0 });

    results.phases.phase4_divergence = {
        willingnessToHelpBetrayer: p4WillingnessToHelpScout,
        willingnessToHelpAlly: p4WillingnessToHelpMedic,
        contagionFromBetrayer: p4ContagionFromScout,
        contagionFromTrustedLeader: p4ContagionFromLeader,
        reassuranceFromLeader: p4ReassuranceFromLeader,
        reassuranceFromBetrayer: p4ReassuranceFromScout,
        traumaDreadAtAmbushSite: p4TraumaDreadAtAmbush,
        traumaDreadAtSafeSite: p4TraumaDreadAtSafe
    };

    // -------------------------------------------------------------
    // Midpoint Checkpoint Determinism (Save at tick 700)
    // -------------------------------------------------------------
    const savedMemorySnapshot = memory.getState();
    const savedSocialSnapshot = social.getState();

    // Advance original simulation to tick 2,000 (1,300 peaceful ticks)
    for (let t = 700; t < 2000; t++) {
        memory.tick(1);
        social.tick(1);
    }

    const originalFinalGrievance = social.getRelationship('grateful_follower', 'cowardly_scout').grievance;
    const originalFinalEpisodicCount = memory.episodic.length;
    const originalFinalTraumaDread = memory.getTraumaDread({ x: 50, y: 0, z: -10 });

    // Restore into fresh simulation instances and advance identically
    const replayMemory = new LayeredMemorySystem();
    const replaySocial = new RelationshipTensorSystem();
    replayMemory.setState(savedMemorySnapshot);
    replaySocial.setState(savedSocialSnapshot);

    for (let t = 700; t < 2000; t++) {
        replayMemory.tick(1);
        replaySocial.tick(1);
    }

    const replayFinalGrievance = replaySocial.getRelationship('grateful_follower', 'cowardly_scout').grievance;
    const replayFinalEpisodicCount = replayMemory.episodic.length;
    const replayFinalTraumaDread = replayMemory.getTraumaDread({ x: 50, y: 0, z: -10 });

    const determinismMatch = (
        Math.abs(originalFinalGrievance - replayFinalGrievance) < 1e-9 &&
        originalFinalEpisodicCount === replayFinalEpisodicCount &&
        Math.abs(originalFinalTraumaDread - replayFinalTraumaDread) < 1e-9
    );

    results.invariants.checkpointRestoreDeterminism = {
        deterministic: determinismMatch,
        originalFinalGrievance,
        replayFinalGrievance,
        originalFinalEpisodicCount,
        replayFinalEpisodicCount
    };

    // -------------------------------------------------------------
    // High-Scale Stress & Bounded Resource Policy Check
    // -------------------------------------------------------------
    const stressMemory = new LayeredMemorySystem();
    const stressSocial = new RelationshipTensorSystem();

    // Inject 5,000 rapid events to verify strictly bounded capacity
    for (let i = 0; i < 5000; i++) {
        stressMemory.recordSensory({ threat_distance: i % 50 }, i);
        stressMemory.recordEpisodic({
            type: EPISODIC_EVENT_TYPES.SURVIVED_AMBUSH,
            salience: (i % 100) / 100,
            tick: i
        });
        stressMemory.recordSemantic(`loc_${i % 300}`, SEMANTIC_CATEGORIES.HAZARD, { x: i, y: 0, z: 0 }, 0.5, {}, i);
        stressSocial.recordInteraction('agent_a', `peer_${i % 100}`, INTERACTION_TYPES.SHARED_SURVIVAL);
    }

    const boundedCapacityVerified = (
        stressMemory.sensory.length <= stressMemory.config.maxSensoryEntries &&
        stressMemory.episodic.length <= stressMemory.config.maxEpisodicEntries &&
        stressMemory.semantic.size <= stressMemory.config.maxSemanticEntries &&
        stressSocial.relationships.get('agent_a').size <= stressSocial.config.maxRelationshipsPerAgent
    );

    results.invariants.boundedCapacityPolicy = {
        boundedVerified: boundedCapacityVerified,
        sensoryCapacity: `${stressMemory.sensory.length} / ${stressMemory.config.maxSensoryEntries}`,
        episodicCapacity: `${stressMemory.episodic.length} / ${stressMemory.config.maxEpisodicEntries}`,
        semanticCapacity: `${stressMemory.semantic.size} / ${stressMemory.config.maxSemanticEntries}`,
        relationshipCapacity: `${stressSocial.relationships.get('agent_a').size} / ${stressSocial.config.maxRelationshipsPerAgent}`
    };

    // -------------------------------------------------------------
    // Entity Lifecycle Garbage Collection
    // -------------------------------------------------------------
    stressSocial.purgeAgent('peer_1');
    const entityPurgeVerified = !stressSocial.hasRelationship('agent_a', 'peer_1');
    results.invariants.entityPurgeGarbageCollection = entityPurgeVerified;

    results.summary = {
        allInvariantsPass: determinismMatch && boundedCapacityVerified && entityPurgeVerified,
        forgivenessDecayedGrievance: originalFinalGrievance < 0.05,
        altruismRefusalPreserved: p4WillingnessToHelpScout === 0.0 && p4WillingnessToHelpMedic >= 0.8
    };

    return results;
}

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export function runAndSaveLayeredMemoryBenchmark(outputPath = null) {
    const results = runLayeredMemoryRelationshipBenchmark();
    const targetPath = outputPath || fileURLToPath(new URL('./layered_memory_relationship.json', import.meta.url));
    fs.writeFileSync(targetPath, JSON.stringify(results, null, 2), 'utf8');
    console.log(`Exported benchmark results to ${targetPath}`);
    return results;
}

if (process.argv[1] && process.argv[1].includes('layered_memory_relationship_benchmark.mjs')) {
    runAndSaveLayeredMemoryBenchmark();
}


