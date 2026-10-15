#!/usr/bin/env node
/**
 * Neutral Horror Reference Demo (CLI / headless) — the product front door.
 *
 * This is the one command someone runs to SEE Fear AI working: two NPCs, one
 * apex threat, and fear crossing between them with NO direct stimulus on the
 * second NPC. It prints affect and advisory intent tick by tick.
 *
 * It is also self-asserting, and that is the point. An earlier revision of this
 * file printed a `VERDICT: ... executed successfully!` banner unconditionally
 * while its own output contradicted its phase labels — it narrated a contagion
 * cascade next to a peer reading `CALM Fear=0.00`, because the scenario ran too
 * few ticks for the model's own thresholds to be crossed. Nothing in the repo
 * ran this file, so it could not fail. Every claim below is now a CHECK: the
 * script exits non-zero and names the claim that broke.
 *
 * The scenario's real dynamics, measured rather than assumed:
 *   - Diaz (0.20 neuroticism, 0.85 resilience) reaches PANIC on the 15th
 *     consecutive tick of contact with a predator at 3 m (tick 18 here).
 *   - Chen is 8 m away and is *never* given a threat. Contagion quantizes a
 *     source by band, so an ANXIOUS Diaz transmits a flat 0.4-scaled impact
 *     (~0.1495) that sits just under the 0.15 telemetry-edge threshold. Only
 *     once Diaz is genuinely PANIC does source fear jump to 0.9 and the impact
 *     reach ~0.34 — which is what lets Chen climb at all, and which is why the
 *     cascade needs ~35 ticks of held contact rather than the 6 an earlier
 *     version of this file allowed before narrating a cascade it never got.
 *   - On threat removal, panic lock releases and the high-resilience Diaz is
 *     CALM within ~6 ticks (fear 0.021) while the high-neuroticism Chen is
 *     still PANIC at 0.603 and still emitting FLEE_FROM.
 *
 * Usage: node examples/cli/neutral-horror-demo.mjs
 * Exit:  0 all checks held · 1 a check failed (the narrative no longer holds)
 */

import { RuntimeSimulation } from '../../packages/runtime/index.js';

const TICK_S = 0.1;
const THREAT_DISTANCE = 3.0;
const DIAZ = 'npc_a_veteran';
const CHEN = 'npc_b_novice';

const failures = [];
const checks = { run: 0, passed: 0 };

/**
 * A printed claim that can go red. Every narrative statement in this file is
 * either a CHECK or a plain observation, and the banner at the end is gated on
 * `failures.length`.
 */
function check(label, condition, detail = '') {
    checks.run += 1;
    if (condition) {
        checks.passed += 1;
        console.log(`   [ok]   ${label}`);
        return true;
    }
    failures.push(detail ? `${label} (${detail})` : label);
    console.log(`   [FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
    return false;
}

function fmtFear(agent) {
    return (agent?.currentFear ?? 0).toFixed(3);
}

function band(agent) {
    return agent?.fearCore?.state ?? 'UNKNOWN';
}

function intent(agent) {
    return agent?.lastResult?.action_intent?.type ?? 'NONE';
}

function heartbeat(agent) {
    return agent?.lastResult?.audio_hints?.heartbeat_bpm ?? '?';
}

function contagionOf(agent) {
    return agent?.lastResult?.debug_trace?.perception_breakdown?.contagion_weighted ?? 0;
}

function sensoryOf(agent) {
    return agent?.lastResult?.debug_trace?.perception_breakdown?.sensory_raw ?? 0;
}

async function runDemo() {
    console.log('================================================================================');
    console.log('              FEAR AI CANONICAL REFERENCE DEMO: THE ENCOUNTER                   ');
    console.log('================================================================================');
    console.log('Diaz: veteran scout  (neuroticism 0.20, resilience 0.85, leadership 0.70) at x=0');
    console.log('Chen: novice medic   (neuroticism 0.85, resilience 0.20, leadership 0.10) at x=8');
    console.log(`The predator is only ever reported to Diaz. Chen receives empty threat lists.\n`);

    const sim = new RuntimeSimulation({ seed: 42 });

    sim.registerAgent(DIAZ, {
        fear: 0.0,
        neuroticism: 0.2,
        resilience: 0.85,
        leadership: 0.7
    }, { name: 'Veteran Diaz', initial_position: { x: 0, y: 0, z: 0 } });

    sim.registerAgent(CHEN, {
        fear: 0.0,
        neuroticism: 0.85,
        resilience: 0.2,
        leadership: 0.1
    }, { name: 'Novice Chen', initial_position: { x: 8, y: 0, z: 0 } });

    const diaz = sim.agents.get(DIAZ);
    const chen = sim.agents.get(CHEN);

    const show = (label, tick) => {
        console.log(`[tick ${String(tick).padStart(3, '0')}] ${label}`);
        console.log(`   Diaz (Veteran): Band=${band(diaz).padEnd(8)} Fear=${fmtFear(diaz)} Intent=${intent(diaz).padEnd(16)} Heartbeat=${heartbeat(diaz)} BPM`);
        console.log(`   Chen (Novice) : Band=${band(chen).padEnd(8)} Fear=${fmtFear(chen)} Intent=${intent(chen).padEnd(16)} Heartbeat=${heartbeat(chen)} BPM`);
    };

    const step = ({ threatDiaz = false } = {}) => {
        sim.queueObservation(DIAZ, {
            x: 0, y: 0, z: 0,
            threats: threatDiaz
                ? [{ id: 'apex_stalker', type: 'PREDATOR', distance: THREAT_DISTANCE, intensity: 1.0 }]
                : []
        });
        // Chen never receives a threat. This is the entire premise of the demo:
        // any fear he develops must have arrived from Diaz.
        sim.queueObservation(CHEN, { x: 8, y: 0, z: 0, threats: [] });
        sim.tick(TICK_S);
    };

    // ---------------------------------------------------------------- Phase 1
    console.log('>>> PHASE 1 — Calm baseline (no threats reported to anyone)');
    for (let t = 1; t <= 3; t++) step({});
    show('Calm patrol', 3);
    check('both agents start CALM', band(diaz) === 'CALM' && band(chen) === 'CALM');
    check('both agents are near zero fear', diaz.currentFear < 0.05 && chen.currentFear < 0.05,
        `Diaz ${fmtFear(diaz)}, Chen ${fmtFear(chen)}`);
    console.log('');

    // ---------------------------------------------------------------- Phase 2
    // Window chosen from measurement, not taste: 15 consecutive ticks of direct
    // contact is the first tick at which Diaz is PANIC *while Chen is still
    // exactly 0.000 CALM*, which is the only moment that isolates the claim
    // "Diaz panicked on his own, Chen has felt nothing yet".
    console.log('>>> PHASE 2 — The predator is 3 m from Diaz and reported only to him');
    for (let t = 4; t <= 18; t++) step({ threatDiaz: true });
    show('First PANIC on direct contact', 18);
    check('Diaz escalates to PANIC on sustained direct contact', band(diaz) === 'PANIC',
        `band is ${band(diaz)} at fear ${fmtFear(diaz)}`);
    check('Diaz INTENT becomes a flight response', ['FLEE_FROM', 'FREEZE', 'SEEK_COVER'].includes(intent(diaz)),
        `intent is ${intent(diaz)}`);
    check('Diaz\'s panic lock is engaged', diaz.lastResult?.debug_trace?.panic_locked === true);
    check('Chen is still CALM — he has been given no threat at all', band(chen) === 'CALM',
        `band is ${band(chen)} at fear ${fmtFear(chen)}`);
    check('Chen\'s direct sensory input is exactly zero', sensoryOf(chen) === 0,
        `sensory_raw is ${sensoryOf(chen)}`);
    console.log('');

    // ---------------------------------------------------------------- Phase 3
    console.log('>>> PHASE 3 — Contact held: fear crosses to Chen by contagion alone');
    for (let t = 19; t <= 40; t++) step({ threatDiaz: true });
    show('Cascade complete', 40);
    check('Chen reaches PANIC with no threat of his own', band(chen) === 'PANIC',
        `band is ${band(chen)} at fear ${fmtFear(chen)}`);
    check('Chen\'s fear is attributable to contagion, not to perception', contagionOf(chen) > 0 && sensoryOf(chen) === 0,
        `contagion_weighted ${contagionOf(chen).toFixed(4)}, sensory_raw ${sensoryOf(chen)}`);
    const edges = sim.contagion.activeEdges.filter((e) => e.from === DIAZ && e.to === CHEN);
    check('a propagation edge Diaz -> Chen is recorded', edges.length > 0,
        `active edges: ${JSON.stringify(sim.contagion.activeEdges)}`);
    check('Chen\'s panic lock is engaged too', chen.lastResult?.debug_trace?.panic_locked === true);
    console.log('');

    // ---------------------------------------------------------------- Phase 4
    console.log('>>> PHASE 4 — Peak: both agents panicking at once');
    for (let t = 41; t <= 44; t++) step({ threatDiaz: true });
    show('Peak', 44);
    check('both agents are simultaneously in PANIC', band(diaz) === 'PANIC' && band(chen) === 'PANIC',
        `Diaz ${band(diaz)}, Chen ${band(chen)}`);
    console.log('');

    // ---------------------------------------------------------------- Phase 5
    console.log('>>> PHASE 5 — Threat breaks contact: the veteran clears, the novice does not');
    for (let t = 45; t <= 53; t++) step({});
    show('10 ticks after the threat vanished', 53);
    check('the veteran stabilizes quickly', diaz.currentFear < 0.05,
        `Diaz fear is ${fmtFear(diaz)}`);
    check('the novice is still panicking', band(chen) === 'PANIC',
        `band is ${band(chen)} at fear ${fmtFear(chen)}`);
    check('the novice is still being advised to flee', intent(chen) === 'FLEE_FROM',
        `intent is ${intent(chen)}`);
    check('the differentiation is large, not a rounding artifact',
        diaz.currentFear + 0.4 < chen.currentFear,
        `Diaz ${fmtFear(diaz)} vs Chen ${fmtFear(chen)}`);
    console.log('');

    // ---------------------------------------------------------------- Epilogue
    console.log('>>> EPILOGUE — Long recovery: both settle, at very different rates');
    for (let t = 54; t <= 60; t++) step({});
    show('Seventeen ticks after the threat vanished', 60);
    check('the veteran is fully calm', band(diaz) === 'CALM',
        `band is ${band(diaz)} at fear ${fmtFear(diaz)}`);
    check('the novice is still measurably elevated above the veteran',
        chen.currentFear > diaz.currentFear + 0.1,
        `Diaz ${fmtFear(diaz)} vs Chen ${fmtFear(chen)}`);
    console.log('');

    console.log('================================================================================');
    console.log(`CHECKS: ${checks.passed}/${checks.run} held`);
    console.log('Advisory only: the host engine still owns movement, physics and combat.');
    console.log('Deterministic: seed 42, zero host mutation, no wall-clock or Math.random input.');
    if (failures.length > 0) {
        console.log('');
        console.log(`VERDICT: FAILED — the canonical sequence did NOT hold. ${failures.length} claim(s) broke:`);
        for (const f of failures) console.log(`  - ${f}`);
        console.log('================================================================================');
        process.exitCode = 1;
        return;
    }
    console.log('VERDICT: the canonical horror sequence held, every claim above verified at runtime.');
    console.log('================================================================================');
}

runDemo().catch((err) => {
    console.error('Demo error:', err);
    process.exit(1);
});
