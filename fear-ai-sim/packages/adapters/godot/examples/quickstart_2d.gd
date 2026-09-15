# quickstart_2d.gd
# Demonstrates Fear AI 5-minute drop-in integration in Godot 4.
# Controls:
#   [WASD / Arrow Keys] Move Player (acts as perceived threat)
#   [Space] Stomp / Shout (triggers acoustic startle)
#   [R] Reset Player & NPC positions
extends Node2D

const FearAgent = preload("res://addons/fear_ai/fear_agent.gd")

@onready var player: CharacterBody2D = $Player
@onready var npc: CharacterBody2D = $NPC
@onready var npc_agent: FearAgent = $NPC/FearAgent
@onready var status_label: Label = $CanvasLayer/StatusLabel

var _player_initial_pos: Vector2
var _npc_initial_pos: Vector2

func _ready() -> void:
	_player_initial_pos = player.position
	_npc_initial_pos = npc.position
	print("[Quickstart2D] Fear AI Drop-In Quickstart Ready!")

func _process(_delta: float) -> void:
	var dist = player.global_position.distance_to(npc.global_position)
	status_label.text = "Distance to NPC: %.1f px | NPC Fear: %.2f (%s) | Intent: %s" % [
		dist,
		npc_agent.current_urgency,
		npc_agent.current_fear_band,
		npc_agent.current_intent
	]
	
	if Input.is_action_just_pressed("ui_cancel") or Input.is_key_pressed(KEY_R):
		player.position = _player_initial_pos
		npc.position = _npc_initial_pos
		player.velocity = Vector2.ZERO
		npc.velocity = Vector2.ZERO

var _shout_decay: float = 0.0

func _physics_process(delta: float) -> void:
	# Simple Player input movement
	var input_dir = Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	player.velocity = input_dir * 250.0
	player.move_and_slide()
	
	# Acoustic shout trigger
	if Input.is_action_just_pressed("ui_accept"):
		print("[Quickstart2D] Player shouted! Acoustic startle emitted.")
		_shout_decay = 2.0
	elif _shout_decay > 0.0:
		_shout_decay = move_toward(_shout_decay, 0.0, delta * 3.0)
	
	# Autonomous local threat evaluation for immediate out-of-the-box demonstration
	var dist = player.global_position.distance_to(npc.global_position)
	var threats: Array[Dictionary] = []
	if dist < 450.0 or _shout_decay > 0.0:
		var intensity = 1.0 + _shout_decay
		threats.append({
			"id": "PlayerThreat",
			"distance": dist,
			"intensity": intensity,
			"x": player.global_position.x,
			"y": player.global_position.y
		})
	npc_agent.evaluate_local(threats, 0.0, 0.0, delta * 3.5)

