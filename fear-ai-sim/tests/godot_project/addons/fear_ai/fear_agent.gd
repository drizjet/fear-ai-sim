# Fear AI Godot 4 Character Agent Component
#
# SHOWCASE VARIANT with a selectable APPRAISAL SOURCE.
# This copy lives inside the standalone showcase project and can appraise two
# ways:
#
#   LOCAL_FALLBACK - evaluates on the generated canonical core
#     (`evaluate_local`) so the demo runs with no server. Mirrors FearCore,
#     HabituationSystem, and IntentResolver from packages/core.
#   LIVE_SERVER    - submits observations to a running FearServer and applies
#     the advisory the server returns. No local evaluation happens at all, so
#     a run in this mode is evidence about the real appraisal pipeline rather
#     than about the fallback.
#
# The packaged adapter (packages/adapters/godot/fear_agent.gd) has no fallback
# and is transport-only. Both copies MUST speak the identical canonical
# vocabulary.
#
# LIVE_SERVER semantics worth stating plainly, because they are not the same as
# the fallback's:
#   * one server tick per physics frame - the fallback's `ticks` argument (N
#     evaluations in one call) has no live equivalent, so multi-tick settling
#     must be expressed as real frames;
#   * habituation, contagion, trauma dread, and intent resolution are computed
#     server-side, so the host must not also apply them locally;
#   * `trauma_presence` has no observation channel - live trauma is authored
#     through `FearAIClient.add_trauma_zone()`, and passing a non-zero value
#     here is recorded in `live_ignored_local_channels` instead of being
#     silently discarded.
class_name FearAgent
extends Node

signal fear_band_changed(band: String)
signal intent_changed(intent: Dictionary)
signal audio_hints_received(hints: Dictionary)

## Where appraisals come from. See the header for the semantics of each mode.
enum AppraisalSource { LOCAL_FALLBACK, LIVE_SERVER }

@export var agent_id: String = ""
@export var sight_range: float = 20.0
@export var base_speed: float = 200.0
@export var panic_speed_mult: float = 1.6

@export_group("OCEAN Traits")
@export_range(0.0, 1.0) var neuroticism: float = 0.5
@export_range(0.0, 1.0) var leadership: float = 0.5
@export_range(0.0, 1.0) var fear_baseline: float = 0.5
@export_range(0.0, 1.0) var resilience: float = 0.5
## Auditory curiosity axis (IntentResolver openness). Neutral 0.5.
@export_range(0.0, 1.0) var openness: float = 0.5

# --- Canonical vocabulary and math (GENERATED from packages/core) -----------
# Every constant and formula the offline fallback needs is derived from the
# canonical JavaScript core by tools/codegen/generate_godot_fallback.mjs, so
# this file cannot silently disagree with FearCore, AffectiveAgent,
# HabituationSystem, or IntentResolver. Do not hand-copy canonical numbers
# here; regenerate instead.
const Canon = preload("res://addons/fear_ai/fear_canonical_core.gd")

var current_fear_band: String = "CALM"
var current_intent: String = "IDLE_VIGILANT"
var current_urgency: float = 0.0
var current_heartbeat_bpm: int = 60
var recommended_vector: Vector3 = Vector3.ZERO

var _parent_body: Node
var _client: Node

# --- Appraisal source -------------------------------------------------------
## Defaults to the offline fallback so the standalone demo keeps working with
## no server. Hosts and the live conformance suite opt in explicitly.
var appraisal_source: int = AppraisalSource.LOCAL_FALLBACK
## Advisories applied from server state (live) vs. local evaluations run.
var live_state_applications: int = 0
var local_evaluations: int = 0
var live_submissions: int = 0
## Set when live mode had no client to talk to. Live mode never falls back to
## local evaluation silently; a run that sets this is not live evidence.
var live_unavailable: bool = false
## Local-only channels a caller passed in live mode (currently
## `trauma_presence`), recorded so the mismatch is visible, not swallowed.
var live_ignored_local_channels: Array[String] = []
var _explicit_appraisal_driven: bool = false
var _applying_local_state: bool = false

func _ready() -> void:
	if agent_id.is_empty():
		agent_id = "agent_%d" % get_instance_id()
	if _parent_body == null:
		_parent_body = get_parent()
	_resolve_client()

## Resolved lazily rather than cached in `_ready()`: an agent can be built
## before the FearAIClient autoload is in the tree, and a client cached as null
## would strand the agent in local mode forever.
func _resolve_client() -> Node:
	if _client == null or not is_instance_valid(_client):
		_client = get_node_or_null("/root/FearAIClient")
	if _client != null and not _client.agent_state_received.is_connected(_on_state_received):
		_client.agent_state_received.connect(_on_state_received)
	return _client

## Select the appraisal source. Switching to LIVE_SERVER does not retroactively
## convert anything already evaluated locally.
func set_appraisal_source(mode: int) -> void:
	appraisal_source = mode

func is_live() -> bool:
	return appraisal_source == AppraisalSource.LIVE_SERVER

func _host_position() -> Vector3:
	if _parent_body is Node3D:
		return _parent_body.global_position
	if _parent_body is Node2D:
		return Vector3(_parent_body.global_position.x, _parent_body.global_position.y, 0)
	return Vector3.ZERO

func _physics_process(_delta: float) -> void:
	# An agent whose appraisals are driven explicitly (evaluate_local/appraise)
	# must not also auto-submit here, or it would double-tick against the server.
	if _explicit_appraisal_driven:
		return
	var client := _resolve_client()
	if not client:
		return
	var pos := _host_position()
	var obs = {
		"agent_id": agent_id,
		"x": pos.x,
		"y": pos.y,
		"z": pos.z,
		"threats": _scan_threats()
	}
	client.queue_observation(obs)

func _scan_threats() -> Array[Dictionary]:
	var threats: Array[Dictionary] = []
	# Host game can populate threats from Area3D/Area2D overlap checks
	var threat_nodes = get_tree().get_nodes_in_group("fear_threats")
	for node in threat_nodes:
		if node is Node3D and _parent_body is Node3D:
			var d = _parent_body.global_position.distance_to(node.global_position)
			if d < sight_range:
				threats.append({
					"id": node.name,
					"type": "PREDATOR",
					"distance": d,
					"x": node.global_position.x,
					"y": node.global_position.y,
					"z": node.global_position.z,
					"intensity": 1.0
				})
		elif node is Node2D and _parent_body is Node2D:
			var d = _parent_body.global_position.distance_to(node.global_position)
			if d < sight_range:
				threats.append({
					"id": node.name,
					"type": "PREDATOR",
					"distance": d,
					"x": node.global_position.x,
					"y": node.global_position.y,
					"z": 0.0,
					"intensity": 1.0
				})
	return threats

func _on_state_received(id: String, state: Dictionary) -> void:
	if id != agent_id:
		return

	# `evaluate_local()` funnels through here too (it is how the fallback applies
	# its own result), so only a state arriving from outside counts as a live
	# application. Without this split the counter would report live evidence for
	# a purely local run.
	if not _applying_local_state:
		live_state_applications += 1
	var prev_band = current_fear_band
	# The full advisory is applied here, raw fear included. Reading only the band
	# and intent left `current_raw_fear` pinned at 0 in live mode while the band
	# moved, so the host's fear bar and any host logic keyed on raw fear never
	# saw the server's value.
	var aff = state.get("affective_state", {})
	if aff.has("raw_fear"):
		current_raw_fear = float(aff.get("raw_fear"))
	current_fear_band = state.get("fear_band", "CALM")
	var intent = state.get("action_intent", {})
	current_intent = intent.get("type", "IDLE_VIGILANT")
	current_urgency = intent.get("urgency", 0.0)
	
	var audio = state.get("audio_hints", {})
	current_heartbeat_bpm = audio.get("heartbeat_bpm", 60)
	
	var vec = intent.get("vector_hint", {})
	recommended_vector = Vector3(vec.get("x", 0.0), vec.get("y", 0.0), vec.get("z", 0.0))
	
	if prev_band != current_fear_band:
		fear_band_changed.emit(current_fear_band)
	intent_changed.emit(intent)
	audio_hints_received.emit(audio)

# ==============================================================================
# APPRAISAL ROUTER
# ==============================================================================

## Single entry point for a station, host, or conformance driver.
##
## LOCAL_FALLBACK: runs the canonical fallback locally (see `evaluate_local`).
## LIVE_SERVER: submits the stimulus to the FearServer and applies the advisory
## the server sends back. `ticks` is intentionally ignored in live mode - see
## the class header.
func appraise(threats: Array = [], social_panic_level: float = 0.0, trauma_presence: float = 0.0, ticks: int = 1) -> void:
	_explicit_appraisal_driven = true
	if appraisal_source == AppraisalSource.LIVE_SERVER:
		_submit_live_appraisal(threats, social_panic_level, trauma_presence)
		return
	evaluate_local(threats, social_panic_level, trauma_presence, ticks)

func _trait_payload() -> Dictionary:
	return {
		"neuroticism": neuroticism,
		"resilience": resilience,
		"fear": fear_baseline,
		"leadership": leadership,
		"extraversion": openness
	}

## Translate this agent's PERCEIVED STIMULI into a protocol observation and hand
## it to the client. The server owns appraisal, habituation, contagion and
## dread, so nothing here writes fear state locally.
##
## Only genuinely perceived stimuli cross the wire. `social_panic_level` and
## `trauma_presence` are LOCAL FALLBACK channels - in live mode the server
## derives contagion from registered neighbours' actual fear and derives dread
## from its own trauma zones, so re-injecting those here would double-count
## them. They are recorded in `live_ignored_local_channels` instead.
func _submit_live_appraisal(threats: Array, social_panic_level: float, trauma_presence: float) -> void:
	var client := _resolve_client()
	if client == null:
		live_unavailable = true
		return
	var pos := _host_position()
	client.ensure_registered(agent_id, _trait_payload(), { "x": pos.x, "y": pos.y, "z": pos.z })

	var obs: Dictionary = {
		"agent_id": agent_id,
		"x": pos.x,
		"y": pos.y,
		"z": pos.z,
		"threats": [],
		"sounds": []
	}
	for t in threats:
		var stimulus_type := str(t.get("type", "PREDATOR"))
		var entry := {
			"id": str(t.get("id", "stimulus")),
			"type": stimulus_type,
			"distance": maxf(0.0, float(t.get("distance", 0.0))),
			"intensity": clampf(float(t.get("intensity", 1.0)), 0.0, 1.0)
		}
		if stimulus_type == "SOUND":
			obs["sounds"].append(entry)
		else:
			obs["threats"].append(entry)

	_note_live_ignored("social_panic_level", social_panic_level > 0.0)
	_note_live_ignored("trauma_presence", trauma_presence > 0.0)

	client.queue_observation(obs)
	live_submissions += 1

func _note_live_ignored(channel: String, active: bool) -> void:
	if active and not live_ignored_local_channels.has(channel):
		live_ignored_local_channels.append(channel)

var current_raw_fear: float = 0.0
# Canonical FearCore state (core four bands) and habituation bookkeeping.
var _fear_band: String = "CALM"
var _panic_locked_until: int = -1
var _eval_tick: int = 0
var _exposures: Dictionary = {}

## Mirror of HabituationSystem.getEffectiveFear. Only the exposure bookkeeping
## lives here; the dampening curve itself is generated from the core.
func get_effective_fear(base_fear: float, stimulus_type: String, stimulus_id: String) -> float:
	if base_fear <= 0.0:
		return 0.0
	var key := "%s:%s" % [stimulus_type, stimulus_id]
	var rec: Dictionary = _exposures.get(key, { "count": 0, "level": 0.0, "last_tick": _eval_tick })
	var ticks_since: int = maxi(0, _eval_tick - int(rec["last_tick"]))
	if ticks_since > 0 and float(rec["level"]) > 0.0:
		rec["level"] = maxf(0.0, float(rec["level"]) - float(ticks_since) * Canon.HABITUATION_RECOVERY_PER_TICK)
	var potential := Canon.potential_habituation(int(rec["count"]), stimulus_type)
	var novelty := Canon.novelty_bonus(int(rec["count"]))
	var effective: float = maxf(0.0, potential - novelty)
	var adjusted: float = maxf(0.0, base_fear * (1.0 - effective))
	rec["count"] = int(rec["count"]) + 1
	rec["last_tick"] = _eval_tick
	rec["level"] = effective
	_exposures[key] = rec
	return adjusted

## Habituation ratio currently applied to a stimulus (0..HABITUATION_MAX).
func get_habituation_level(stimulus_type: String, stimulus_id: String) -> float:
	var key := "%s:%s" % [stimulus_type, stimulus_id]
	if _exposures.has(key):
		return float(_exposures[key]["level"])
	return 0.0

func clear_habituation() -> void:
	_exposures.clear()

func _fear_decay_rate() -> float:
	var resilience_mod := (resilience - 0.5) * 0.08
	return clampf(0.92 + neuroticism * 0.05 - resilience_mod, 0.75, 0.98)

func _away_vector(t: Dictionary) -> Vector3:
	if _parent_body is Node2D:
		var diff = Vector2(_parent_body.global_position.x - float(t.get("x", 0.0)), _parent_body.global_position.y - float(t.get("y", 0.0)))
		if diff.length() < 0.0001:
			return Vector3.ZERO
		var n = diff.normalized()
		return Vector3(n.x, n.y, 0.0)
	elif _parent_body is Node3D:
		var diff3 = _parent_body.global_position - Vector3(float(t.get("x", 0.0)), float(t.get("y", 0.0)), float(t.get("z", 0.0)))
		if diff3.length() < 0.0001:
			return Vector3.ZERO
		return diff3.normalized()
	return Vector3.ZERO

func _toward_vector(t: Dictionary) -> Vector3:
	return -_away_vector(t)

## Delegates the canonical core-band transition. The enter/exit hysteresis and
## the panic lock are generated from FearCore.
func _advance_band(scaled_fear: float) -> String:
	var step := Canon.advance_band(_fear_band, scaled_fear, _eval_tick, _panic_locked_until)
	_fear_band = str(step["band"])
	_panic_locked_until = int(step["panic_locked_until"])
	return _fear_band

## One canonical appraisal tick. Returns the vector hints and channel flags.
func _step_fear(threats: Array, social_panic_level: float, trauma_presence: float) -> Dictionary:
	var max_perceived := 0.0
	var flee_vector := Vector3.ZERO
	var sound_vector := Vector3.ZERO
	var best_sound := -1.0
	var has_threat := false
	var has_sound := false
	for t in threats:
		var stimulus_type: String = str(t.get("type", "PREDATOR"))
		var stimulus_id: String = str(t.get("id", ""))
		var d: float = maxf(0.1, float(t.get("distance", 10.0)))
		var intensity: float = clampf(float(t.get("intensity", 1.0)), 0.0, 1.0)
		var hab := get_effective_fear(intensity, stimulus_type, stimulus_id)
		var attenuate: float = (1.0 / (1.0 + d * 0.08)) if stimulus_type == "SOUND" else (1.0 / (1.0 + d * 0.05))
		var perceived: float = hab * attenuate
		if stimulus_type == "SOUND":
			has_sound = true
			if perceived > best_sound:
				best_sound = perceived
				sound_vector = _toward_vector(t)
		else:
			has_threat = true
		if perceived > max_perceived:
			max_perceived = perceived
			flee_vector = _away_vector(t)
	var social := clampf(social_panic_level, 0.0, 1.0) * 0.6
	var dread := clampf(trauma_presence, 0.0, 1.0) * 0.8
	var fear_input := (max_perceived + social + dread) * (0.4 + fear_baseline * 0.8)
	var active := (not threats.is_empty()) or social_panic_level > 0.4 or trauma_presence > 0.4
	if active:
		current_raw_fear = minf(1.0, maxf(current_raw_fear + Canon.FEAR_STEP_UP, fear_input))
	else:
		current_raw_fear = maxf(0.0, current_raw_fear * _fear_decay_rate())
	return { "flee": flee_vector, "sound": sound_vector, "has_threat": has_threat, "has_sound": has_sound }

func _intent(type: String, urgency: float, vec: Vector3) -> Dictionary:
	return { "type": type, "urgency": urgency, "vector_hint": { "x": vec.x, "y": vec.y, "z": vec.z } }

## Delegates the canonical intent + urgency resolution (IntentResolver), then
## attaches the vector hint from this agent's own spatial data.
func _resolve_intent(has_threat: bool, has_sound: bool, flee_vector: Vector3, sound_vector: Vector3) -> Dictionary:
	var resolved := Canon.resolve_intent(_fear_band, current_raw_fear, openness, has_threat, has_sound)
	var itype := str(resolved["type"])
	var urgency := float(resolved["urgency"])
	if itype == Canon.INTENT_FLEE_FROM:
		return _intent(itype, urgency, flee_vector)
	if itype == Canon.INTENT_INVESTIGATE_SOUND:
		return _intent(itype, urgency, sound_vector)
	return _intent(itype, urgency, Vector3.ZERO)

func evaluate_local(threats: Array = [], social_panic_level: float = 0.0, trauma_presence: float = 0.0, ticks: int = 1) -> void:
	_explicit_appraisal_driven = true
	local_evaluations += 1
	if _parent_body == null:
		_parent_body = get_parent()
	var step: Dictionary = { "flee": Vector3.ZERO, "sound": Vector3.ZERO, "has_threat": false, "has_sound": false }
	for _i in range(maxi(1, ticks)):
		_eval_tick += 1
		step = _step_fear(threats, social_panic_level, trauma_presence)
		_fear_band = _advance_band(current_raw_fear * Canon.FEAR_SCALE)
	var flee_vector: Vector3 = step["flee"]
	var intent := _resolve_intent(bool(step["has_threat"]), bool(step["has_sound"]), flee_vector, step["sound"])
	var bpm = int(60.0 + current_raw_fear * 118.0)
	apply_state({
		"agent_id": agent_id,
		"fear_band": _fear_band,
		"affective_state": { "raw_fear": current_raw_fear, "valence": clampf(1.0 - current_raw_fear * 1.8, -1.0, 1.0), "arousal": current_raw_fear, "dominance": 1.0 - current_raw_fear },
		"action_intent": { "type": intent["type"], "urgency": intent["urgency"], "vector_hint": intent["vector_hint"] },
		"audio_hints": { "heartbeat_bpm": bpm }
	})

func apply_state(state: Dictionary) -> void:
	var aff = state.get("affective_state", {})
	if aff.has("raw_fear"):
		current_raw_fear = aff.get("raw_fear")
	_applying_local_state = true
	_on_state_received(agent_id, state)
	_applying_local_state = false

## Host-owned motor should read this and apply velocity / move_and_slide itself.
func get_movement_hint() -> Dictionary:
	var speed_mult := 1.0
	if current_fear_band == "PANIC":
		speed_mult = panic_speed_mult
	return {
		"advisory_only": true,
		"intent": current_intent,
		"urgency": current_urgency,
		"fear_band": current_fear_band,
		"raw_fear": current_raw_fear,
		"vector": recommended_vector,
		"base_speed": base_speed,
		"speed_mult": speed_mult
	}

