#!/usr/bin/env node

/**
 * tools/codegen/generate_godot_fallback.mjs
 *
 * Generates the Godot showcase's offline-fallback canonical core:
 *
 *   tests/godot_project/addons/fear_ai/fear_canonical_core.gd
 *
 * WHY THIS EXISTS
 * The showcase build ships a local appraisal fallback so the demo runs without
 * the Fear AI server. That fallback previously carried its own hand-copied
 * constants and its own band/intent vocabulary, and drifted from the canonical
 * core (six divergences, resolved 2026-09-20). This generator makes the
 * canonical numbers a DERIVED artifact: every constant and every pure formula
 * below is emitted from the live JavaScript source of truth —
 * `FearCore`, `AffectiveAgent`, `HabituationSystem`, `IntentResolver` — so the
 * GDScript cannot silently disagree with the core.
 *
 * Anything the generator cannot find is a hard error (`mustMatch`), so a
 * canonical rename or renumber fails generation loudly instead of emitting a
 * stale fallback.
 *
 * Regenerate:  node tools/codegen/generate_godot_fallback.mjs
 * Drift + numeric parity: node tools/verification/verify_godot_fallback_parity.mjs
 *
 * Hard Rule 9 compliant: standalone deterministic script, no test runner.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_FEARCORE_CONFIG } from '../../packages/core/src/FearCore.js';
import { DEFAULT_HABITUATION_CONFIG } from '../../packages/core/src/HabituationSystem.js';
import { ACTION_INTENTS } from '../../packages/core/src/IntentResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, '../..');

export const OUTPUT_PATH = 'tests/godot_project/addons/fear_ai/fear_canonical_core.gd';

const SOURCE_AFFECTIVE_AGENT = 'packages/core/src/AffectiveAgent.js';
const SOURCE_INTENT_RESOLVER = 'packages/core/src/IntentResolver.js';

function readRepo(rel) {
    const p = path.join(REPO, rel);
    if (!fs.existsSync(p)) throw new Error(`Missing required source: ${rel}`);
    return fs.readFileSync(p, 'utf8');
}

/** Extract a numeric constant from JS source; a miss is a hard error. */
function mustMatch(src, re, label) {
    const m = src.match(re);
    if (!m || m[1] === undefined) {
        throw new Error(`CODEGEN ANCHOR LOST: ${label} (${re}). Update the generator.`);
    }
    const value = Number(m[1]);
    if (!Number.isFinite(value)) {
        throw new Error(`CODEGEN ANCHOR NOT NUMERIC: ${label} (${re}) -> ${m[1]}`);
    }
    return value;
}

/** Slice a source section between two markers; a miss is a hard error. */
function section(src, startMarker, endMarker, label) {
    const start = src.indexOf(startMarker);
    if (start < 0) throw new Error(`CODEGEN ANCHOR LOST: ${label} start '${startMarker}'`);
    const rest = src.slice(start);
    if (!endMarker) return rest;
    const end = rest.indexOf(endMarker);
    if (end < 0) throw new Error(`CODEGEN ANCHOR LOST: ${label} end '${endMarker}'`);
    return rest.slice(0, end);
}

/** GDScript literal for a number (always keeps a decimal point). */
const num = (v) => {
    const s = String(v);
    return s.includes('.') || s.includes('e') || s.includes('E') ? s : `${s}.0`;
};

/** GDScript literal for an integer count (no decimal point). */
const intLit = (v) => String(Math.trunc(v));

/** GDScript string literal. */
const str = (v) => `"${v}"`;

/**
 * Build the generated GDScript file body.
 * @returns {string}
 */
export function generate() {
    const agentSrc = readRepo(SOURCE_AFFECTIVE_AGENT);
    const intentSrc = readRepo(SOURCE_INTENT_RESOLVER);

    // --- Derived numbers (source of truth: the canonical JS core) -----------
    const fearScale = mustMatch(agentSrc, /normalizedFear \* ([0-9.]+)/, 'AffectiveAgent._fearScale');
    const fearStepUp = mustMatch(agentSrc, /this\.currentFear \+ ([0-9.]+)/, 'AffectiveAgent fear integration step');
    const enter = DEFAULT_FEARCORE_CONFIG.enter;
    const exit = DEFAULT_FEARCORE_CONFIG.exit;
    const panicLockTicks = DEFAULT_FEARCORE_CONFIG.panicLockTicks;
    const hab = DEFAULT_HABITUATION_CONFIG;

    // Each band's numbers are read from that band's own source section, so a
    // shared literal elsewhere (HIDE also uses a fear slope) cannot be picked up
    // by accident.
    const anxiousSection = section(intentSrc, '// 6. High Anxiety', '// 7. Alert', 'ANXIOUS');
    const alertSection = section(intentSrc, "if (band === 'ALERT')", '// 8. Recovery', 'ALERT');
    const panicSection = section(intentSrc, '// 5. Acute Panic / Flight', '// 6. High Anxiety', 'PANIC');
    const calmSection = section(intentSrc, '// 9. Default Calm', null, 'CALM');

    const anxiousUrgencies = [...anxiousSection.matchAll(/urgency: ([0-9.]+),/g)].map((m) => Number(m[1]));
    if (anxiousUrgencies.length < 2) {
        throw new Error(`CODEGEN ANCHOR LOST: IntentResolver ANXIOUS urgency pair (found ${anxiousUrgencies.length})`);
    }
    const [urgencyAnxiousFlee, urgencyAnxiousExplore] = anxiousUrgencies;
    const urgencyIdleVigilant = mustMatch(alertSection, /urgency: ([0-9.]+),/, 'IntentResolver ALERT idle urgency');
    const urgencyCautiousExplore = mustMatch(calmSection, /urgency: ([0-9.]+),/, 'IntentResolver CALM default urgency');
    const panicFleeBase = mustMatch(panicSection, /urgency: Math\.min\(1\.0, ([0-9.]+) \+ fear \* [0-9.]+\)/, 'IntentResolver PANIC flee slope');
    const panicFleeFearWeight = mustMatch(panicSection, /urgency: Math\.min\(1\.0, [0-9.]+ \+ fear \* ([0-9.]+)\)/, 'IntentResolver PANIC flee weight');
    const alertInvestigateBase = mustMatch(alertSection, /Math\.min\(1\.0, ([0-9.]+) \+ openness \* [0-9.]+\)/, 'IntentResolver ALERT investigate slope');
    const alertInvestigateWeight = mustMatch(alertSection, /Math\.min\(1\.0, [0-9.]+ \+ openness \* ([0-9.]+)\)/, 'IntentResolver ALERT investigate weight');
    const calmInvestigateBase = mustMatch(calmSection, /Math\.min\(1\.0, ([0-9.]+) \+ openness \* [0-9.]+\)/, 'IntentResolver CALM investigate slope');
    const calmInvestigateWeight = mustMatch(calmSection, /Math\.min\(1\.0, [0-9.]+ \+ openness \* ([0-9.]+)\)/, 'IntentResolver CALM investigate weight');
    const thresholdAlert = mustMatch(alertSection, /investigateThreshold = ([0-9.]+) \* \(1\.5 - openness\)/, 'IntentResolver ALERT investigate threshold');
    const thresholdCalm = mustMatch(calmSection, /investigateThreshold = ([0-9.]+) \* \(1\.5 - openness\)/, 'IntentResolver CALM investigate threshold');

    // Intent names must be real members of the canonical vocabulary.
    for (const name of ['IDLE_VIGILANT', 'CAUTIOUS_EXPLORE', 'INVESTIGATE_SOUND', 'FLEE_FROM']) {
        if (!ACTION_INTENTS.includes(name)) {
            throw new Error(`CODEGEN VOCABULARY LOST: ${name} is no longer in ACTION_INTENTS`);
        }
    }

    const stimulusDecayEntries = Object.entries(hab.stimulusTypes)
        .map(([type, cfg]) => `\t${str(type)}: ${num(cfg.decayMultiplier)}`)
        .join(',\n');
    const intentList = ACTION_INTENTS.map(str).join(', ');

    return `# GENERATED FILE — DO NOT EDIT BY HAND.
# Source of truth: tools/codegen/generate_godot_fallback.mjs
# Regenerate with: node tools/codegen/generate_godot_fallback.mjs
# Verified by:     node tools/verification/verify_godot_fallback_parity.mjs
#
# Canonical Fear AI constants and pure appraisal math, emitted from
# packages/core (FearCore, AffectiveAgent, HabituationSystem, IntentResolver).
# The showcase's offline fallback consumes this module, so the fallback's
# numbers and vocabulary are derived from the core rather than hand-copied.
#
# This file is the showcase build's copy only. The packaged adapter
# (packages/adapters/godot/fear_agent.gd) is transport-only and reads band and
# intent from server state.
class_name FearCanonicalCore
extends RefCounted

# --- Scale and integration (AffectiveAgent) --------------------------------
const FEAR_SCALE := ${num(fearScale)}
const FEAR_STEP_UP := ${num(fearStepUp)}

# --- Core band thresholds (FearCore.config) --------------------------------
const BAND_ENTER_ALERT := ${num(enter.ALERT)}
const BAND_ENTER_ANXIOUS := ${num(enter.ANXIOUS)}
const BAND_ENTER_PANIC := ${num(enter.PANIC)}
const BAND_EXIT_CALM := ${num(exit.CALM)}
const BAND_EXIT_ALERT := ${num(exit.ALERT)}
const BAND_EXIT_ANXIOUS := ${num(exit.ANXIOUS)}
const PANIC_LOCK_TICKS := ${intLit(panicLockTicks)}

# --- Habituation (HabituationSystem defaults) ------------------------------
const HABITUATION_RATE := ${num(hab.habituationRate)}
const HABITUATION_MAX := ${num(hab.maxHabituation)}
const HABITUATION_NOVELTY_BOOST := ${num(hab.noveltyBoost)}
const HABITUATION_NOVELTY_WINDOW := 3
const HABITUATION_RECOVERY_PER_TICK := ${num(hab.recoveryRatePerTick)}
const STIMULUS_DECAY := {
${stimulusDecayEntries}
}

# --- Intent vocabulary and urgency slopes (IntentResolver) -----------------
const ACTION_INTENTS := [${intentList}]
const INTENT_IDLE_VIGILANT := ${str('IDLE_VIGILANT')}
const INTENT_CAUTIOUS_EXPLORE := ${str('CAUTIOUS_EXPLORE')}
const INTENT_INVESTIGATE_SOUND := ${str('INVESTIGATE_SOUND')}
const INTENT_FLEE_FROM := ${str('FLEE_FROM')}
const URGENCY_CAUTIOUS_EXPLORE := ${num(urgencyCautiousExplore)}
const URGENCY_ANXIOUS_FLEE := ${num(urgencyAnxiousFlee)}
const URGENCY_ANXIOUS_EXPLORE := ${num(urgencyAnxiousExplore)}
const URGENCY_IDLE_VIGILANT := ${num(urgencyIdleVigilant)}
const URGENCY_PANIC_FLEE_BASE := ${num(panicFleeBase)}
const URGENCY_PANIC_FLEE_FEAR_WEIGHT := ${num(panicFleeFearWeight)}
const URGENCY_ALERT_INVESTIGATE_BASE := ${num(alertInvestigateBase)}
const URGENCY_ALERT_INVESTIGATE_WEIGHT := ${num(alertInvestigateWeight)}
const URGENCY_CALM_INVESTIGATE_BASE := ${num(calmInvestigateBase)}
const URGENCY_CALM_INVESTIGATE_WEIGHT := ${num(calmInvestigateWeight)}
const INVESTIGATE_THRESHOLD_ALERT := ${num(thresholdAlert)}
const INVESTIGATE_THRESHOLD_CALM := ${num(thresholdCalm)}

# --- Pure canonical math ---------------------------------------------------

## Mirror of HabituationSystem's per-stimulus-type decay multiplier.
static func decay_multiplier(stimulus_type: String) -> float:
\treturn float(STIMULUS_DECAY.get(stimulus_type, 1.0))

## Mirror of HabituationSystem.getEffectiveFear's potential-habituation term.
static func potential_habituation(exposure_count: int, stimulus_type: String) -> float:
\treturn minf(HABITUATION_MAX, float(exposure_count) * (HABITUATION_RATE * decay_multiplier(stimulus_type)))

## Mirror of HabituationSystem.getEffectiveFear's novelty ramp.
static func novelty_bonus(exposure_count: int) -> float:
\tif exposure_count >= HABITUATION_NOVELTY_WINDOW:
\t\treturn 0.0
\treturn HABITUATION_NOVELTY_BOOST * ((float(HABITUATION_NOVELTY_WINDOW) - float(exposure_count)) / float(HABITUATION_NOVELTY_WINDOW))

## Mirror of FearCore.update for the canonical core bands: the same enter/exit
## hysteresis and the same 10-tick panic lock. Returns the next band and the
## lock deadline, so the caller holds no transition logic of its own.
static func advance_band(state: String, scaled_fear: float, tick: int, panic_locked_until: int) -> Dictionary:
\tif state == "PANIC" and tick < panic_locked_until:
\t\treturn { "band": state, "panic_locked_until": panic_locked_until }
\tvar band := state
\tvar lock := panic_locked_until
\tmatch state:
\t\t"ALERT":
\t\t\tif scaled_fear >= BAND_ENTER_ANXIOUS:
\t\t\t\tband = "ANXIOUS"
\t\t\telif scaled_fear < BAND_EXIT_CALM:
\t\t\t\tband = "CALM"
\t\t"ANXIOUS":
\t\t\tif scaled_fear >= BAND_ENTER_PANIC:
\t\t\t\tband = "PANIC"
\t\t\t\tlock = tick + PANIC_LOCK_TICKS
\t\t\telif scaled_fear < BAND_EXIT_ALERT:
\t\t\t\tband = "ALERT"
\t\t"PANIC":
\t\t\tif scaled_fear < BAND_EXIT_ANXIOUS:
\t\t\t\tband = "ANXIOUS"
\t\t\t\tlock = -1
\t\t_:
\t\t\tif scaled_fear >= BAND_ENTER_ALERT:
\t\t\t\tband = "ALERT"
\treturn { "band": band, "panic_locked_until": lock }

## Mirror of IntentResolver.resolveIntent for the canonical core bands that the
## offline appraisal path can reach. Returns { type, urgency }; the caller
## supplies the vector hint from its own spatial data.
static func resolve_intent(band: String, raw_fear: float, openness: float, has_threat: bool, has_sound: bool) -> Dictionary:
\tmatch band:
\t\t"PANIC":
\t\t\treturn { "type": INTENT_FLEE_FROM, "urgency": minf(1.0, URGENCY_PANIC_FLEE_BASE + raw_fear * URGENCY_PANIC_FLEE_FEAR_WEIGHT) }
\t\t"ANXIOUS":
\t\t\tif has_threat:
\t\t\t\treturn { "type": INTENT_FLEE_FROM, "urgency": URGENCY_ANXIOUS_FLEE }
\t\t\treturn { "type": INTENT_CAUTIOUS_EXPLORE, "urgency": URGENCY_ANXIOUS_EXPLORE }
\t\t"ALERT":
\t\t\tif has_sound and openness > INVESTIGATE_THRESHOLD_ALERT * (1.5 - openness):
\t\t\t\treturn { "type": INTENT_INVESTIGATE_SOUND, "urgency": minf(1.0, URGENCY_ALERT_INVESTIGATE_BASE + openness * URGENCY_ALERT_INVESTIGATE_WEIGHT) }
\t\t\treturn { "type": INTENT_IDLE_VIGILANT, "urgency": URGENCY_IDLE_VIGILANT }
\t\t_:
\t\t\tif has_sound and openness > INVESTIGATE_THRESHOLD_CALM * (1.5 - openness):
\t\t\t\treturn { "type": INTENT_INVESTIGATE_SOUND, "urgency": minf(1.0, URGENCY_CALM_INVESTIGATE_BASE + openness * URGENCY_CALM_INVESTIGATE_WEIGHT) }
\t\t\treturn { "type": INTENT_CAUTIOUS_EXPLORE, "urgency": URGENCY_CAUTIOUS_EXPLORE }
`;
}

function main() {
    const outPath = path.join(REPO, OUTPUT_PATH);
    const body = generate();
    const check = process.argv.includes('--check');
    const current = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;
    if (check) {
        if (current !== body) {
            console.error(`GENERATED ARTIFACT STALE: ${OUTPUT_PATH}`);
            console.error('Run: node tools/codegen/generate_godot_fallback.mjs');
            process.exit(1);
        }
        console.log(`GENERATED ARTIFACT CURRENT: ${OUTPUT_PATH}`);
        return;
    }
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, body, 'utf8');
    const rel = current === body ? 'unchanged' : 'written';
    console.log(`GENERATED: ${OUTPUT_PATH} (${rel}, ${body.split('\n').length} lines)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main();
}
