# GENERATED FILE — DO NOT EDIT BY HAND.
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
const FEAR_SCALE := 4.2
# Normalized fear at which the PANIC band is entered, DERIVED in the JS core as
# enter.PANIC / FEAR_SCALE. Emitted rather than recomputed so a GDScript
# fallback cannot pick its own onset.
const PANIC_ONSET_RAW_FEAR := 0.9047619047619047
const FEAR_STEP_UP := 0.05

# --- Core band thresholds (FearCore.config) --------------------------------
const BAND_ENTER_ALERT := 0.8
const BAND_ENTER_ANXIOUS := 1.4
const BAND_ENTER_PANIC := 3.8
const BAND_EXIT_CALM := 0.55
const BAND_EXIT_ALERT := 0.8
const BAND_EXIT_ANXIOUS := 1.2
const PANIC_LOCK_TICKS := 10

# --- Habituation (HabituationSystem defaults) ------------------------------
const HABITUATION_RATE := 0.08
const HABITUATION_MAX := 0.6
const HABITUATION_NOVELTY_BOOST := 0.15
const HABITUATION_NOVELTY_WINDOW := 3
const HABITUATION_RECOVERY_PER_TICK := 0.0005
const STIMULUS_DECAY := {
	"PREDATOR": 1.0,
	"SOUND": 0.8,
	"VISUAL": 1.2,
	"GORE": 0.6,
	"SCREAM": 1.5,
	"ENVIRONMENTAL_DREAD": 0.5
}

# --- Intent vocabulary and urgency slopes (IntentResolver) -----------------
const ACTION_INTENTS := ["IDLE_VIGILANT", "CAUTIOUS_EXPLORE", "INVESTIGATE_SOUND", "FLEE_FROM", "SEEK_COVER", "FREEZE", "CONFRONT_THREAT", "APPROACH_ALLY", "WARN_GROUP", "DESPERATE_FLAIL", "COLLAPSE_EXHAUSTED", "RECOVERING"]
const INTENT_IDLE_VIGILANT := "IDLE_VIGILANT"
const INTENT_CAUTIOUS_EXPLORE := "CAUTIOUS_EXPLORE"
const INTENT_INVESTIGATE_SOUND := "INVESTIGATE_SOUND"
const INTENT_FLEE_FROM := "FLEE_FROM"
const URGENCY_CAUTIOUS_EXPLORE := 0.1
const URGENCY_ANXIOUS_FLEE := 0.65
const URGENCY_ANXIOUS_EXPLORE := 0.45
const URGENCY_IDLE_VIGILANT := 0.3
const URGENCY_PANIC_FLEE_BASE := 0.75
const URGENCY_PANIC_FLEE_FEAR_WEIGHT := 0.25
const URGENCY_ALERT_INVESTIGATE_BASE := 0.25
const URGENCY_ALERT_INVESTIGATE_WEIGHT := 0.3
const URGENCY_CALM_INVESTIGATE_BASE := 0.2
const URGENCY_CALM_INVESTIGATE_WEIGHT := 0.25
const INVESTIGATE_THRESHOLD_ALERT := 0.4
const INVESTIGATE_THRESHOLD_CALM := 0.45

# --- Pure canonical math ---------------------------------------------------

## Mirror of HabituationSystem's per-stimulus-type decay multiplier.
static func decay_multiplier(stimulus_type: String) -> float:
	return float(STIMULUS_DECAY.get(stimulus_type, 1.0))

## Mirror of HabituationSystem.getEffectiveFear's potential-habituation term.
static func potential_habituation(exposure_count: int, stimulus_type: String) -> float:
	return minf(HABITUATION_MAX, float(exposure_count) * (HABITUATION_RATE * decay_multiplier(stimulus_type)))

## Mirror of HabituationSystem.getEffectiveFear's novelty ramp.
static func novelty_bonus(exposure_count: int) -> float:
	if exposure_count >= HABITUATION_NOVELTY_WINDOW:
		return 0.0
	return HABITUATION_NOVELTY_BOOST * ((float(HABITUATION_NOVELTY_WINDOW) - float(exposure_count)) / float(HABITUATION_NOVELTY_WINDOW))

## Mirror of FearCore.update for the canonical core bands: the same enter/exit
## hysteresis and the same 10-tick panic lock. Returns the next band and the
## lock deadline, so the caller holds no transition logic of its own.
static func advance_band(state: String, scaled_fear: float, tick: int, panic_locked_until: int) -> Dictionary:
	if state == "PANIC" and tick < panic_locked_until:
		return { "band": state, "panic_locked_until": panic_locked_until }
	var band := state
	var lock := panic_locked_until
	match state:
		"ALERT":
			if scaled_fear >= BAND_ENTER_ANXIOUS:
				band = "ANXIOUS"
			elif scaled_fear < BAND_EXIT_CALM:
				band = "CALM"
		"ANXIOUS":
			if scaled_fear >= BAND_ENTER_PANIC:
				band = "PANIC"
				lock = tick + PANIC_LOCK_TICKS
			elif scaled_fear < BAND_EXIT_ALERT:
				band = "ALERT"
		"PANIC":
			if scaled_fear < BAND_EXIT_ANXIOUS:
				band = "ANXIOUS"
				lock = -1
		_:
			if scaled_fear >= BAND_ENTER_ALERT:
				band = "ALERT"
	return { "band": band, "panic_locked_until": lock }

## Mirror of IntentResolver.resolveIntent for the canonical core bands that the
## offline appraisal path can reach. Returns { type, urgency }; the caller
## supplies the vector hint from its own spatial data.
static func resolve_intent(band: String, raw_fear: float, openness: float, has_threat: bool, has_sound: bool) -> Dictionary:
	match band:
		"PANIC":
			return { "type": INTENT_FLEE_FROM, "urgency": minf(1.0, URGENCY_PANIC_FLEE_BASE + raw_fear * URGENCY_PANIC_FLEE_FEAR_WEIGHT) }
		"ANXIOUS":
			if has_threat:
				return { "type": INTENT_FLEE_FROM, "urgency": URGENCY_ANXIOUS_FLEE }
			return { "type": INTENT_CAUTIOUS_EXPLORE, "urgency": URGENCY_ANXIOUS_EXPLORE }
		"ALERT":
			if has_sound and openness > INVESTIGATE_THRESHOLD_ALERT * (1.5 - openness):
				return { "type": INTENT_INVESTIGATE_SOUND, "urgency": minf(1.0, URGENCY_ALERT_INVESTIGATE_BASE + openness * URGENCY_ALERT_INVESTIGATE_WEIGHT) }
			return { "type": INTENT_IDLE_VIGILANT, "urgency": URGENCY_IDLE_VIGILANT }
		_:
			if has_sound and openness > INVESTIGATE_THRESHOLD_CALM * (1.5 - openness):
				return { "type": INTENT_INVESTIGATE_SOUND, "urgency": minf(1.0, URGENCY_CALM_INVESTIGATE_BASE + openness * URGENCY_CALM_INVESTIGATE_WEIGHT) }
			return { "type": INTENT_CAUTIOUS_EXPLORE, "urgency": URGENCY_CAUTIOUS_EXPLORE }
