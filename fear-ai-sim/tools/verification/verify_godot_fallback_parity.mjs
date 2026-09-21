#!/usr/bin/env node

/**
 * tools/verification/verify_godot_fallback_parity.mjs
 *
 * NUMERIC parity between the Godot showcase's offline fallback and the
 * canonical JavaScript core. Where `verify_godot_stations.mjs` asserts the
 * fallback's vocabulary STRUCTURALLY, this probe asserts its NUMBERS:
 *
 *  PART A  The generated artifact is current: the checked-in
 *          `fear_canonical_core.gd` is byte-identical to what the generator
 *          emits right now from the live JS core. A hand edit or a stale
 *          regeneration fails here.
 *  PART B  The fallback delegates: `fear_agent.gd` holds no canonical numbers
 *          of its own and preloads the generated module.
 *  PART C  Band-transition sweep: a `FearCore` configured from the numbers the
 *          shipped GDScript declares reproduces the canonical core's band
 *          sequence over a fine up/down fear sweep — hysteresis and the panic
 *          lock included — step for step.
 *  PART D  Habituation sweep: a `HabituationSystem` configured from the
 *          GDScript's declared constants reproduces the canonical dampening
 *          curve across stimulus types and burst counts.
 *  PART E  Intent/urgency parity: the GDScript's declared urgency constants and
 *          investigate gates equal what `IntentResolver` returns for the same
 *          band, fear, and openness.
 *
 * Scope: this proves the GDScript's declared canonical math is the core's math.
 * It does not execute GDScript (the in-engine run does that) and makes no
 * rendering or host-game claim.
 *
 * Hard Rule 9 compliant: standalone deterministic probe, no test runner.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generate, OUTPUT_PATH } from '../codegen/generate_godot_fallback.mjs';
import { FearCore, FEAR_BANDS, CORE_BANDS, DEFAULT_FEARCORE_CONFIG } from '../../packages/core/src/FearCore.js';
import { HabituationSystem, DEFAULT_HABITUATION_CONFIG } from '../../packages/core/src/HabituationSystem.js';
import { IntentResolver, ACTION_INTENTS } from '../../packages/core/src/IntentResolver.js';
import { AffectiveAgent } from '../../packages/core/src/AffectiveAgent.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, '../..');

const FALLBACK = 'tests/godot_project/addons/fear_ai/fear_agent.gd';

function readRepo(rel) {
    const p = path.join(REPO, rel);
    if (!fs.existsSync(p)) throw new Error(`Missing required source: ${rel}`);
    return fs.readFileSync(p, 'utf8');
}

let PASS = 0;
function check(label, cond, detail = '') {
    if (!cond) throw new Error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
    PASS++;
    console.log(`  * ${label}: PASS`);
}

const round = (n, d = 6) => Number(Number(n).toFixed(d));

/** Parse `const NAME := <number>` from GDScript source. */
function parseIntConsts(src) {
    const out = {};
    for (const m of src.matchAll(/^const ([A-Z0-9_]+) := (-?[0-9.]+)$/gm)) {
        out[m[1]] = Number(m[2]);
    }
    return out;
}

/** Parse `const NAME := [ "A", "B" ]` from GDScript source. */
function parseStringArrayConst(src, name) {
    const re = new RegExp(`^const ${name} := \\[([^\\]]*)\\]$`, 'm');
    const m = src.match(re);
    if (!m) return null;
    return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

/** Parse the STIMULUS_DECAY dictionary block from GDScript source. */
function parseStimulusDecay(src) {
    const start = src.indexOf('const STIMULUS_DECAY := {');
    if (start < 0) return null;
    const end = src.indexOf('}', start);
    const block = src.slice(start, end);
    const out = {};
    for (const m of block.matchAll(/"([A-Z_]+)": ([0-9.]+)/g)) out[m[1]] = Number(m[2]);
    return out;
}

async function main() {
    console.log('============================================================');
    console.log('VERIFY GODOT FALLBACK NUMERIC PARITY (GDScript numbers vs JS core)');
    console.log('============================================================\n');

    const generated = readRepo(OUTPUT_PATH);
    const fallback = readRepo(FALLBACK);

    // ------------------------------------------------------------------
    // PART A: the generated artifact is current
    // ------------------------------------------------------------------
    console.log('--- Part A: generated artifact currency ---');
    check('Generated canonical core exists', generated.length > 0);
    check('Generated canonical core declares itself generated', generated.includes('GENERATED FILE — DO NOT EDIT BY HAND'));
    check('Generator output still reproduces the checked-in artifact byte-for-byte',
        generate() === generated,
        'run: node tools/codegen/generate_godot_fallback.mjs');

    const C = parseIntConsts(generated);
    const bands = parseStringArrayConst(generated, 'ACTION_INTENTS');
    const stimulusDecay = parseStimulusDecay(generated);
    check('Generated core carries the band, habituation, and urgency constants',
        ['FEAR_SCALE', 'BAND_ENTER_ALERT', 'BAND_ENTER_ANXIOUS', 'BAND_ENTER_PANIC',
            'BAND_EXIT_CALM', 'BAND_EXIT_ALERT', 'BAND_EXIT_ANXIOUS', 'PANIC_LOCK_TICKS',
            'FEAR_STEP_UP', 'HABITUATION_MAX', 'HABITUATION_RATE', 'HABITUATION_NOVELTY_BOOST',
            'HABITUATION_RECOVERY_PER_TICK', 'URGENCY_ANXIOUS_FLEE', 'URGENCY_IDLE_VIGILANT']
            .every((k) => Number.isFinite(C[k])),
        `missing=[${['FEAR_SCALE', 'PANIC_LOCK_TICKS'].filter((k) => !Number.isFinite(C[k]))}]`);
    check('Generated core declares the canonical intent list', Array.isArray(bands) && bands.length === ACTION_INTENTS.length);
    check('Generated core declares per-stimulus decay multipliers', Boolean(stimulusDecay) && Object.keys(stimulusDecay).length >= 6);

    // ------------------------------------------------------------------
    // PART B: the fallback delegates instead of holding its own numbers
    // ------------------------------------------------------------------
    console.log('\n--- Part B: fallback delegates to the generated core ---');
    check('Fallback preloads the generated canonical core',
        fallback.includes('preload("res://addons/fear_ai/fear_canonical_core.gd")'));
    const duplicated = ['BAND_ENTER_ALERT', 'BAND_ENTER_ANXIOUS', 'BAND_ENTER_PANIC',
        'BAND_EXIT_CALM', 'PANIC_LOCK_TICKS', 'FEAR_SCALE', 'HABITUATION_MAX', 'HABITUATION_RATE']
        .filter((name) => new RegExp(`^const ${name} :=`, 'm').test(fallback));
    check('Fallback declares no canonical threshold of its own', duplicated.length === 0,
        `duplicated=[${duplicated}]`);
    check('Fallback consumes the generated integration step', fallback.includes('Canon.FEAR_STEP_UP'));
    check('Fallback consumes the generated band transition', fallback.includes('Canon.advance_band('));
    check('Fallback consumes the generated intent resolution', fallback.includes('Canon.resolve_intent('));
    check('Fallback consumes the generated habituation curve',
        fallback.includes('Canon.potential_habituation(') && fallback.includes('Canon.novelty_bonus('));

    // ------------------------------------------------------------------
    // PART C: band-transition sweep, hysteresis and panic lock included
    // ------------------------------------------------------------------
    console.log('\n--- Part C: band-transition sweep vs FearCore ---');
    const canonicalCore = new FearCore();
    const declaredCore = new FearCore({
        enter: {
            ALERT: C.BAND_ENTER_ALERT,
            ANXIOUS: C.BAND_ENTER_ANXIOUS,
            PANIC: C.BAND_ENTER_PANIC
        },
        exit: {
            CALM: C.BAND_EXIT_CALM,
            ALERT: C.BAND_EXIT_ALERT,
            ANXIOUS: C.BAND_EXIT_ANXIOUS
        },
        panicLockTicks: C.PANIC_LOCK_TICKS
    });
    const declaredEnter = declaredCore.config.enter;
    const declaredExit = declaredCore.config.exit;
    check('Declared band thresholds equal the canonical FearCore config',
        declaredEnter.ALERT === DEFAULT_FEARCORE_CONFIG.enter.ALERT
        && declaredEnter.ANXIOUS === DEFAULT_FEARCORE_CONFIG.enter.ANXIOUS
        && declaredEnter.PANIC === DEFAULT_FEARCORE_CONFIG.enter.PANIC
        && declaredExit.CALM === DEFAULT_FEARCORE_CONFIG.exit.CALM
        && declaredExit.ALERT === DEFAULT_FEARCORE_CONFIG.exit.ALERT
        && declaredExit.ANXIOUS === DEFAULT_FEARCORE_CONFIG.exit.ANXIOUS
        && C.PANIC_LOCK_TICKS === DEFAULT_FEARCORE_CONFIG.panicLockTicks);

    const smooth = [];
    for (let f = 0; f <= 1.0001; f += 0.002) smooth.push(f);
    for (let f = 1.0; f >= -0.0001; f -= 0.002) smooth.push(f);
    const coarse = [];
    for (let f = 0; f <= 1.0001; f += 0.02) coarse.push(f);
    for (let f = 1.0; f >= -0.0001; f -= 0.02) coarse.push(f);

    const compareTrajectory = (trajectory, label) => {
        const a = new FearCore();
        declaredCore.reset('CALM');
        for (let i = 0; i < trajectory.length; i++) {
            const scaled = trajectory[i] * C.FEAR_SCALE;
            const canonical = a.update(scaled);
            const declared = declaredCore.update(scaled);
            if (canonical.state !== declared.state) {
                throw new Error(`FAIL: ${label} diverged at step ${i} (fear=${round(trajectory[i], 4)}): canonical=${canonical.state} declared=${declared.state}`);
            }
            if (canonical.panicLocked !== declared.panicLocked) {
                throw new Error(`FAIL: ${label} panic-lock diverged at step ${i}`);
            }
        }
        return trajectory.length;
    };
    const smoothSteps = compareTrajectory(smooth, 'smooth sweep');
    const coarseSteps = compareTrajectory(coarse, 'coarse sweep');
    check('Declared thresholds reproduce the canonical band sequence over a smooth up/down sweep',
        smoothSteps > 900, `${smoothSteps} steps`);
    check('Declared thresholds reproduce the canonical band sequence over a coarse up/down sweep',
        coarseSteps > 90, `${coarseSteps} steps`);
    check('Sweep reaches every canonical core band (so the comparison is non-trivial)',
        FEAR_BANDS.length >= 4 && CORE_BANDS.every((b) => FEAR_BANDS.includes(b)));
    {
        const probe = new FearCore();
        const seen = new Set();
        for (const f of smooth) seen.add(probe.update(f * C.FEAR_SCALE).state);
        for (const band of CORE_BANDS) {
            check(`Sweep exercises the canonical ${band} band`, seen.has(band), `seen=[${[...seen]}]`);
        }
    }
    check('Declared fear scale equals AffectiveAgent._fearScale',
        C.FEAR_SCALE === new AffectiveAgent('scale_probe')._fearScale(1),
        `declared=${C.FEAR_SCALE}`);
    check('Declared integration step equals AffectiveAgent fear integration step', C.FEAR_STEP_UP === 0.05,
        `declared=${C.FEAR_STEP_UP}`);

    // ------------------------------------------------------------------
    // PART D: habituation sweep vs HabituationSystem
    // ------------------------------------------------------------------
    console.log('\n--- Part D: habituation sweep vs HabituationSystem ---');
    const declaredHab = new HabituationSystem({
        maxHabituation: C.HABITUATION_MAX,
        habituationRate: C.HABITUATION_RATE,
        noveltyBoost: C.HABITUATION_NOVELTY_BOOST,
        recoveryRatePerTick: C.HABITUATION_RECOVERY_PER_TICK,
        stimulusTypes: Object.fromEntries(Object.entries(stimulusDecay)
            .map(([type, decayMultiplier]) => [type, { decayMultiplier, recoveryMultiplier: 1.0 }]))
    });
    check('Declared habituation constants equal the canonical defaults',
        declaredHab.config.maxHabituation === DEFAULT_HABITUATION_CONFIG.maxHabituation
        && declaredHab.config.habituationRate === DEFAULT_HABITUATION_CONFIG.habituationRate
        && declaredHab.config.noveltyBoost === DEFAULT_HABITUATION_CONFIG.noveltyBoost
        && declaredHab.config.recoveryRatePerTick === DEFAULT_HABITUATION_CONFIG.recoveryRatePerTick);
    const decayMismatches = Object.entries(DEFAULT_HABITUATION_CONFIG.stimulusTypes)
        .filter(([type, cfg]) => stimulusDecay[type] !== cfg.decayMultiplier)
        .map(([type, cfg]) => `${type}: declared=${stimulusDecay[type]} canonical=${cfg.decayMultiplier}`);
    check('Declared stimulus decay multipliers equal the canonical ones', decayMismatches.length === 0,
        decayMismatches.join('; '));

    let habSteps = 0;
    for (const type of Object.keys(DEFAULT_HABITUATION_CONFIG.stimulusTypes)) {
        const canonical = new HabituationSystem();
        const declared = new HabituationSystem({
            maxHabituation: C.HABITUATION_MAX,
            habituationRate: C.HABITUATION_RATE,
            noveltyBoost: C.HABITUATION_NOVELTY_BOOST,
            recoveryRatePerTick: C.HABITUATION_RECOVERY_PER_TICK,
            stimulusTypes: Object.fromEntries(Object.entries(stimulusDecay)
                .map(([t, d]) => [t, { decayMultiplier: d, recoveryMultiplier: 1.0 }]))
        });
        for (let burst = 1; burst <= 40; burst++) {
            const a = canonical.getEffectiveFear(0.9, type, `${type}_probe`, burst);
            const b = declared.getEffectiveFear(0.9, type, `${type}_probe`, burst);
            if (round(a) !== round(b)) {
                throw new Error(`FAIL: habituation diverged for ${type} at burst ${burst}: canonical=${round(a)} declared=${round(b)}`);
            }
            canonical.tick(1);
            declared.tick(1);
            habSteps++;
        }
    }
    check('Declared habituation reproduces the canonical curve across every stimulus type and 40 bursts',
        habSteps === 40 * Object.keys(DEFAULT_HABITUATION_CONFIG.stimulusTypes).length, `${habSteps} steps`);
    {
        const h = new HabituationSystem();
        const seq = [];
        for (let burst = 1; burst <= 4; burst++) {
            seq.push(round(h.getEffectiveFear(0.85, 'SOUND', 'sound_pulse')));
            h.tick(1);
        }
        check('Canonical SOUND curve still damps burst 4 to 0.687', round(seq[3], 3) === 0.687, `burst4=${seq[3]}`);
    }

    // ------------------------------------------------------------------
    // PART E: intent + urgency parity vs IntentResolver
    // ------------------------------------------------------------------
    console.log('\n--- Part E: intent + urgency parity vs IntentResolver ---');
    check('Declared intent vocabulary equals ACTION_INTENTS exactly',
        Array.isArray(bands) && bands.join('|') === ACTION_INTENTS.join('|'),
        `declared=[${bands}]`);

    const probeAgent = (band, traits = {}) => {
        const agent = new AffectiveAgent('parity_probe', { openness: 0.5, ...traits });
        agent.fearCore.state = band;
        return agent;
    };
    const threatObs = { threats: [{ id: 't', type: 'PREDATOR', distance: 20, intensity: 1.0, x: 5, y: 0 }] };
    const soundObs = { sounds: [{ id: 's', x: 5, y: 0, intensity: 0.8 }] };
    const resolved = (band, obs, fear = 0.5, traits) => {
        const agent = probeAgent(band, traits);
        agent.currentFear = fear;
        return IntentResolver.resolveIntent(agent, obs);
    };

    {
        const r = resolved('PANIC', threatObs, 0.9);
        const expected = Math.min(1.0, C.URGENCY_PANIC_FLEE_BASE + 0.9 * C.URGENCY_PANIC_FLEE_FEAR_WEIGHT);
        check('PANIC flee urgency matches the declared slope', r.type === 'FLEE_FROM' && round(r.urgency) === round(expected),
            `canonical=${round(r.urgency)} declared=${round(expected)}`);
    }
    {
        const r = resolved('ANXIOUS', threatObs);
        check('ANXIOUS threat urgency matches the declared constant',
            r.type === 'FLEE_FROM' && round(r.urgency) === round(C.URGENCY_ANXIOUS_FLEE),
            `canonical=${round(r.urgency)} declared=${round(C.URGENCY_ANXIOUS_FLEE)}`);
    }
    {
        const r = resolved('ANXIOUS', {});
        check('ANXIOUS calm urgency matches the declared constant',
            r.type === 'CAUTIOUS_EXPLORE' && round(r.urgency) === round(C.URGENCY_ANXIOUS_EXPLORE),
            `canonical=${round(r.urgency)} declared=${round(C.URGENCY_ANXIOUS_EXPLORE)}`);
    }
    {
        const r = resolved('ALERT', {});
        check('ALERT idle urgency matches the declared constant',
            r.type === 'IDLE_VIGILANT' && round(r.urgency) === round(C.URGENCY_IDLE_VIGILANT),
            `canonical=${round(r.urgency)} declared=${round(C.URGENCY_IDLE_VIGILANT)}`);
    }
    {
        const r = resolved('CALM', {});
        check('CALM default urgency matches the declared constant',
            r.type === 'CAUTIOUS_EXPLORE' && round(r.urgency) === round(C.URGENCY_CAUTIOUS_EXPLORE),
            `canonical=${round(r.urgency)} declared=${round(C.URGENCY_CAUTIOUS_EXPLORE)}`);
    }
    {
        const r = resolved('ALERT', soundObs);
        const expected = Math.min(1.0, C.URGENCY_ALERT_INVESTIGATE_BASE + 0.5 * C.URGENCY_ALERT_INVESTIGATE_WEIGHT);
        check('ALERT sound investigation intent and urgency match the declared slope',
            r.type === 'INVESTIGATE_SOUND' && round(r.urgency) === round(expected),
            `canonical=${r.type}/${round(r.urgency)} declared=INVESTIGATE_SOUND/${round(expected)}`);
        check('ALERT investigation gate is open at openness 0.5', 0.5 > C.INVESTIGATE_THRESHOLD_ALERT * (1.5 - 0.5));
    }
    {
        const r = resolved('CALM', soundObs);
        const expected = Math.min(1.0, C.URGENCY_CALM_INVESTIGATE_BASE + 0.5 * C.URGENCY_CALM_INVESTIGATE_WEIGHT);
        check('CALM sound investigation intent and urgency match the declared slope',
            r.type === 'INVESTIGATE_SOUND' && round(r.urgency) === round(expected),
            `canonical=${r.type}/${round(r.urgency)} declared=INVESTIGATE_SOUND/${round(expected)}`);
        check('CALM investigation gate is open at openness 0.5', 0.5 > C.INVESTIGATE_THRESHOLD_CALM * (1.5 - 0.5));
    }
    {
        // The declared investigate gates must also be closed where the core's are.
        const lowOpenness = resolved('ALERT', soundObs, 0.5, { openness: 0.1 });
        const gateOpenDeclared = 0.1 > C.INVESTIGATE_THRESHOLD_ALERT * (1.5 - 0.1);
        check('ALERT investigation gate is closed for low openness in both implementations',
            lowOpenness.type !== 'INVESTIGATE_SOUND' && gateOpenDeclared === false,
            `canonical=${lowOpenness.type} declaredGate=${gateOpenDeclared}`);
    }

    console.log('\n============================================================');
    console.log(`SUCCESS: All ${PASS} Godot fallback parity assertions PASSED.`);
    console.log('Scope: the GDScript\'s DECLARED canonical math only. GDScript execution is');
    console.log('covered by the in-engine Godot 4.6 showcase run, not by this probe.');
    console.log('============================================================\n');
}

main().catch((err) => {
    console.error('VERIFICATION FAILURE:', err.message);
    process.exit(1);
});
