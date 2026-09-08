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
		
	if _parent_body == null:
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

var current_raw_fear: float = 0.0

func evaluate_local(threats: Array = [], social_panic_level: float = 0.0, trauma_presence: float = 0.0, step: float = 1.0) -> void:
	if _parent_body == null:
		_parent_body = get_parent()
	# Deterministic local appraisal fallback
	var max_perceived := 0.0
	var flee_vector := Vector3.ZERO
	for t in threats:
		var d: float = maxf(0.1, t.get("distance", 10.0))
		var intensity: float = t.get("intensity", 1.0)
		var perceived: float = intensity / (1.0 + 0.01 * d)
		if perceived > max_perceived:
			max_perceived = perceived
			if _parent_body is Node2D:
				var diff = Vector2(_parent_body.global_position.x - t.get("x", 0.0), _parent_body.global_position.y - t.get("y", 0.0)).normalized()
				flee_vector = Vector3(diff.x, diff.y, 0.0)
			elif _parent_body is Node3D:
				var diff3 = (_parent_body.global_position - Vector3(t.get("x", 0.0), t.get("y", 0.0), t.get("z", 0.0))).normalized()
				flee_vector = diff3
				
	var target_fear = clampf(fear_baseline + (max_perceived * neuroticism * 1.5) + (social_panic_level * 0.6) + (trauma_presence * 0.8) - (resilience * 0.4), 0.0, 1.0)
	if step >= 1.0:
		current_raw_fear = target_fear
	elif target_fear > current_raw_fear:
		current_raw_fear = move_toward(current_raw_fear, target_fear, step)
	else:
		current_raw_fear = move_toward(current_raw_fear, target_fear, step * (resilience + 0.5))
		
	var band := "CALM"
	var intent_type := "IDLE_VIGILANT"
	if current_raw_fear >= 0.75:
		band = "PANIC"
		intent_type = "FLEE_FROM"
	elif current_raw_fear >= 0.50:
		band = "FEAR"
		intent_type = "SEEK_COVER"
	elif current_raw_fear >= 0.25:
		band = "ALERT"
		intent_type = "INVESTIGATE"
		
	var bpm = int(60.0 + current_raw_fear * 118.0)
	apply_state({
		"agent_id": agent_id,
		"fear_band": band,
		"affective_state": { "raw_fear": current_raw_fear, "valence": -current_raw_fear, "arousal": current_raw_fear, "dominance": 1.0 - current_raw_fear },
		"action_intent": { "type": intent_type, "urgency": current_raw_fear, "vector_hint": { "x": flee_vector.x, "y": flee_vector.y, "z": flee_vector.z } },
		"audio_hints": { "heartbeat_bpm": bpm }
	})

func apply_state(state: Dictionary) -> void:
	var aff = state.get("affective_state", {})
	if aff.has("raw_fear"):
		current_raw_fear = aff.get("raw_fear")
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
		"raw_fear": current_raw_fear,
		"vector": recommended_vector,
		"base_speed": base_speed,
		"speed_mult": speed_mult
	}

