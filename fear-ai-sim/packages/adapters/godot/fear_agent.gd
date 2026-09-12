# Fear AI Godot 4 Character Agent Component
class_name FearAgent
extends Node

signal fear_band_changed(band: String)
signal intent_changed(intent: Dictionary)
signal audio_hints_received(hints: Dictionary)

@export var agent_id: String = ""
@export var sight_range: float = 20.0
@export var base_speed: float = 200.0
@export var panic_speed_mult: float = 1.6

@export_group("OCEAN Traits")
@export_range(0.0, 1.0) var neuroticism: float = 0.5
@export_range(0.0, 1.0) var leadership: float = 0.5
@export_range(0.0, 1.0) var fear_baseline: float = 0.5
@export_range(0.0, 1.0) var resilience: float = 0.5

@export_group("Sensor Quality (opt-in, R4)")
## Visual channel intensity. Negative = channel absent (legacy shape).
@export var visual_intensity: float = -1.0
## Audio channel loudness. Negative = channel absent (legacy shape).
@export var audio_loudness: float = -1.0
## Per-source reliability in [0,1]. Negative = absent (fully trusted).
@export_range(-1.0, 1.0) var sensor_reliability: float = -1.0
## Observation age in ticks. Negative = absent (fresh).
@export var observation_age_ticks: int = -1

var current_fear_band: String = "CALM"
var current_intent: String = "IDLE_VIGILANT"
var current_urgency: float = 0.0
var current_heartbeat_bpm: int = 60
var recommended_vector: Vector3 = Vector3.ZERO

var _parent_body: Node
var _client: Node

func _ready() -> void:
	if agent_id.is_empty():
		agent_id = "agent_%d" % get_instance_id()
		
	_parent_body = get_parent()
	_client = get_node_or_null("/root/FearAIClient")
	
	if _client:
		_client.agent_state_received.connect(_on_state_received)

func _physics_process(_delta: float) -> void:
	if not _client:
		return
		
	var pos = Vector3.ZERO
	if _parent_body is Node3D:
		pos = _parent_body.global_position
	elif _parent_body is Node2D:
		pos = Vector3(_parent_body.global_position.x, _parent_body.global_position.y, 0)
		
	var obs = {
		"agent_id": agent_id,
		"x": pos.x,
		"y": pos.y,
		"z": pos.z,
		"threats": _scan_threats()
	}
	# R4: opt-in perception channels. Absent by default so legacy hosts
	# emit byte-identical observations; configured sensors ride through
	# the JSON protocol to the validator's visual/audio sanitizers.
	if visual_intensity >= 0.0:
		var visual = { "intensity": visual_intensity }
		if sensor_reliability >= 0.0:
			visual["reliability"] = sensor_reliability
		if observation_age_ticks >= 0:
			visual["ageTicks"] = observation_age_ticks
		obs["visual"] = visual
	if audio_loudness >= 0.0:
		var audio = { "loudness": audio_loudness }
		if sensor_reliability >= 0.0:
			audio["reliability"] = sensor_reliability
		if observation_age_ticks >= 0:
			audio["ageTicks"] = observation_age_ticks
		obs["audio"] = audio
	_client.queue_observation(obs)

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
	return threats

func _on_state_received(id: String, state: Dictionary) -> void:
	if id != agent_id:
		return
		
	var prev_band = current_fear_band
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

func apply_state(state: Dictionary) -> void:
	_on_state_received(agent_id, state)

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
		"vector": recommended_vector,
		"base_speed": base_speed,
		"speed_mult": speed_mult
	}
