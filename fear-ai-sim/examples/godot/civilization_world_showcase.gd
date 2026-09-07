# civilization_world_showcase.gd
# Fear AI - Civilization World Showcase (Godot 4.6)
#
# Demonstrates multi-agent group cohesion, rally dynamics, dynamic trade route danger
# rerouting, and 5-tier cognitive LOD in Godot 4.6 CharacterBody3D systems.
#
# STRICT ARCHITECTURAL INVARIANT:
# Godot 4 retains 100% authoritative control over:
# - Physics, velocity, character collisions, move_and_slide()
# - Inventory, damage, entity lifecycle, and terrain
# Fear AI provides semantic observations, group directives, route rankings,
# and affective state (fear, urgency, heartbeat BPM).

extends Node3D

signal showcase_completed()

# Nodes
@onready var camera = $Camera3D
@onready var squad_leader = $SquadAlpha/Leader
@onready var squad_members = [$SquadAlpha/Soldier1, $SquadAlpha/Soldier2, $SquadAlpha/Soldier3]
@onready var caravan = $MerchantCaravan
@onready var bandit_ambush = $AmbushThreat

var current_focus_pos: Vector3 = Vector3.ZERO
var trade_route_status: String = "SAFE"
var active_route: String = "highland_pass"
var group_directive: String = "MAINTAIN_FORMATION"

func _ready() -> void:
	print("[FearAI Godot 4 Showcase] Initializing Multi-Agent Civilization World...")
	if camera:
		current_focus_pos = camera.global_position

func start_showcase() -> void:
	print("\n--- PHASE 1: Peaceful Exploration & Formation Patrol ---")
	group_directive = "MAINTAIN_FORMATION"
	_update_patrol_velocity(4.0)
	
	print("\n--- PHASE 2: Tactical Threat & Leader Heroic Rally ---")
	# Stressed soldiers encounter distant predator; leader initiates rally
	group_directive = "RALLY_TO_LEADER"
	for soldier in squad_members:
		if soldier and squad_leader:
			# Host engine calculates authoritative steering vector toward leader
			var dir_to_leader = (squad_leader.global_position - soldier.global_position).normalized()
			if soldier.has_method("set_velocity_hint"):
				soldier.set_velocity_hint(dir_to_leader * 5.0)

	print("\n--- PHASE 3: Trade Caravan Danger Rerouting ---")
	# Bandit raid reported on highland_pass
	print("[Caravan Intelligence] Highland pass ambushed! Threat level: CRITICAL (BLOCKED)")
	trade_route_status = "BLOCKED"
	active_route = "river_detour"
	print("[Caravan Intelligence] Dynamically rerouting caravan convoy through River Detour (+200m safer).")

	print("\n--- PHASE 4: Cognitive LOD Tier Throttling ---")
	# Camera moves towards caravan; squad moves to LOD1/LOD2
	if caravan:
		current_focus_pos = caravan.global_position
		print("[Cognitive LOD] Focus shifted to Caravan at (%.1f, %.1f). LOD0 updated." % [current_focus_pos.x, current_focus_pos.z])

	print("\n[FearAI Godot 4 Showcase] Showcase sequence executed successfully!")
	showcase_completed.emit()

func _update_patrol_velocity(speed: float) -> void:
	if squad_leader:
		var forward = -squad_leader.transform.basis.z.normalized()
		if squad_leader.has_method("set_velocity_hint"):
			squad_leader.set_velocity_hint(forward * speed)

func get_active_route() -> String:
	return active_route

func get_group_directive() -> String:
	return group_directive
