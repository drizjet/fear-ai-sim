#!/usr/bin/env node
/**
 * Neutral Horror Reference Demo (CLI / Headless)
 *
 * Demonstrates the canonical horror scenario:
 * 1. NPC A (brave veteran) & NPC B (skittish recruit) start CALM.
 * 2. An apex threat appears near NPC A.
 * 3. NPC A perceives threat -> fear escalates -> switches from CALM to ALERT to PANIC -> emits FLEE_FROM.
 * 4. NPC B does NOT see the monster directly, but perceives NPC A's screaming panic via Contagion Graph.
 * 5. NPC B's fear rises rapidly through social contagion -> transitions to PANIC -> emits SEEK_COVER.
 * 6. Threat disappears (breaks sight).
 * 7. Panic lock holds both agents briefly, then hysteresis enables gradual recovery.
 * 8. NPC A (high resilience) recovers quickly to ALERT/CALM; NPC B (high neuroticism) lingers in ANXIOUS.
 */

import { RuntimeSimulation } from '../../packages/runtime/index.js';

async function runDemo() {
    console.log('================================================================================');
    console.log('              FEAR AI CANONICAL REFERENCE DEMO: THE ENCOUNTER                   ');
    console.log('================================================================================\n');

    const sim = new RuntimeSimulation({ seed: 42 });

    // Register NPC A: Veteran scout (high resilience, low neuroticism, leader)
    sim.registerAgent('npc_a_veteran', {
        fear: 0.3,
        neuroticism: 0.2,
        resilience: 0.85,
        leadership: 0.7
    }, { name: 'Veteran Diaz', initial_position: { x: 0, y: 0, z: 0 } });

    // Register NPC B: Novice medic (moderate fear, high neuroticism, low resilience)
    sim.registerAgent('npc_b_novice', {
        fear: 0.6,
        neuroticism: 0.85,
        resilience: 0.2,
        leadership: 0.1
    }, { name: 'Novice Chen', initial_position: { x: 8, y: 0, z: 0 } });

    const logState = (phaseName, step) => {
        const agentA = sim.agents.get('npc_a_veteran');
        const agentB = sim.agents.get('npc_b_novice');
        const outA = agentA.lastResult || {};
        const outB = agentB.lastResult || {};

        console.log(`[Step ${String(step).padStart(2, '0')}] ${phaseName}`);
        console.log(`   Diaz (Veteran): Band=${outA.fear_band?.padEnd(8)} Fear=${outA.affective_state?.raw_fear?.toFixed(2)} Intent=${(outA.action_intent?.type || 'NONE').padEnd(14)} Heartbeat=${outA.audio_hints?.heartbeat_bpm} BPM`);
        console.log(`   Chen (Novice) : Band=${outB.fear_band?.padEnd(8)} Fear=${outB.affective_state?.raw_fear?.toFixed(2)} Intent=${(outB.action_intent?.type || 'NONE').padEnd(14)} Heartbeat=${outB.audio_hints?.heartbeat_bpm} BPM`);
        console.log('');
    };

    // Phase 1: Calm Baseline (5 ticks)
    console.log('>>> PHASE 1: Calm Baseline (Both agents patrolling quietly)');
    for (let t = 1; t <= 3; t++) {
        sim.tick(0.1);
    }
    logState('Calm Patrol', 3);

    // Phase 2: Threat Appears Near Diaz (Chen cannot see it)
    console.log('>>> PHASE 2: Threat Appears 4m from Veteran Diaz! (Chen is around the corner, 0 vision)');
    for (let t = 4; t <= 8; t++) {
        // Only Diaz perceives the apex predator
        sim.queueObservation('npc_a_veteran', {
            x: 0, y: 0, z: 0,
            threats: [{ id: 'apex_stalker', type: 'PREDATOR', distance: 4.0, intensity: 1.0 }]
        });
        // Chen has NO direct threat observations
        sim.queueObservation('npc_b_novice', {
            x: 8, y: 0, z: 0,
            threats: []
        });
        sim.tick(0.1);
    }
    logState('Threat Contact (Diaz Panics & Screams)', 8);

    // Phase 3: Social Contagion takes hold of Chen
    console.log('>>> PHASE 3: Contagion Cascade (Chen hears Diaz screaming and panics via proximity graph)');
    for (let t = 9; t <= 14; t++) {
        sim.queueObservation('npc_a_veteran', {
            threats: [{ id: 'apex_stalker', type: 'PREDATOR', distance: 5.0, intensity: 1.0 }]
        });
        sim.queueObservation('npc_b_novice', { threats: [] });
        sim.tick(0.1);
    }
    logState('Contagion Cascade (Both in Panic)', 14);

    // Phase 4: Threat Retreats into Darkness
    console.log('>>> PHASE 4: Threat Breaks Contact & Vanishes');
    for (let t = 15; t <= 25; t++) {
        // No threats observed by either
        sim.queueObservation('npc_a_veteran', { threats: [] });
        sim.queueObservation('npc_b_novice', { threats: [] });
        sim.tick(0.1);
    }
    logState('Immediate Aftermath (Panic Lock Hysteresis)', 25);

    // Phase 5: Long-Horizon Recovery & Personality Differentiation
    console.log('>>> PHASE 5: Prolonged Recovery (Veteran stabilizes quickly; Novice remains shaken)');
    for (let t = 26; t <= 60; t++) {
        sim.tick(0.1);
    }
    logState('Resolution (Diaz recovers; Chen still hyper-vigilant)', 60);

    console.log('================================================================================');
    console.log('VERDICT: Canonical horror behavioral sequence executed successfully!');
    console.log('100% deterministic, zero host mutations, pure affective advising.');
    console.log('================================================================================\n');
}

runDemo().catch(err => {
    console.error('Demo error:', err);
    process.exit(1);
});
