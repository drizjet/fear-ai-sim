# fear_steering_2d.gd
# Host-Authoritative 2D Steering Controller for Fear AI in Godot 4
# Translates advisory recommended_vector into CharacterBody2D physics with acceleration smoothing.
# Strictly preserves the Host Game Authority Invariant: host engine owns movement and collisions.
class_name FearSteering2D
extends Node

@export var agent_path: NodePath
@export var acceleration: float = 800.0
@export var friction: float = 600.0
@export var enable_obstacle_avoidance: bool = true
@export var ray_length: float = 30.0

var _body: CharacterBody2D = null
var _agent: Node = null
var _desired_velocity: Vector2 = Vector2.ZERO

func _ready() -> void:
	var parent = get_parent()
	if parent is CharacterBody2D:
		_body = parent
	
	if not agent_path.is_empty():
		_agent = get_node_or_null(agent_path)
	
	if not _agent and _body:
		for child in _body.get_children():
			if child.has_signal("intent_changed"):
				_agent = child
				break

func _physics_process(delta: float) -> void:
	if not _body or not _agent:
		return
		
	var speed = _agent.base_speed
	if _agent.current_fear_band == "PANIC" or _agent.current_fear_band == "FEAR":
		speed *= _agent.panic_speed_mult
	
	var rec_vec = Vector2(_agent.recommended_vector.x, _agent.recommended_vector.y)
	
	# Apply advisory intent semantics
	match _agent.current_intent:
		"FLEE_FROM":
			_desired_velocity = rec_vec.normalized() * speed
		"CONFRONT_THREAT", "DEFEND_SELF":
			_desired_velocity = rec_vec.normalized() * (speed * 0.45)
		"APPROACH_ALLY", "RALLY_TO_LEADER":
			_desired_velocity = rec_vec.normalized() * (speed * 0.80)
		"CAUTIOUS_EXPLORE", "PATROL":
			_desired_velocity = rec_vec.normalized() * (speed * 0.50)
		_:
			_desired_velocity = Vector2.ZERO
	
	# Simple 2D obstacle avoidance feelers (left & right)
	if enable_obstacle_avoidance and _desired_velocity.length_squared() > 1.0:
		_desired_velocity = _deflect_obstacles(_desired_velocity)
	
	# Host physics integration: move_toward smooth acceleration
	if _desired_velocity.length_squared() > 1.0:
		_body.velocity = _body.velocity.move_toward(_desired_velocity, acceleration * delta)
	else:
		_body.velocity = _body.velocity.move_toward(Vector2.ZERO, friction * delta)
		
	# Execute host movement if inside active physics tree
	if _body.is_inside_tree():
		_body.move_and_slide()

func _deflect_obstacles(dir: Vector2) -> Vector2:
	if not _body.is_inside_tree():
		return dir
	var world_2d = _body.get_world_2d()
	if not world_2d:
		return dir
	var space = world_2d.direct_space_state
	if not space:
		return dir
		
	var start = _body.global_position
	var forward = dir.normalized()
	
	# Center ray
	var query_center = PhysicsRayQueryParameters2D.create(start, start + forward * ray_length, _body.collision_mask, [_body.get_rid()])
	var hit_center = space.intersect_ray(query_center)
	if hit_center.is_empty():
		return dir
		
	# Left feeler (+35 deg)
	var left_dir = forward.rotated(deg_to_rad(35.0))
	var query_left = PhysicsRayQueryParameters2D.create(start, start + left_dir * ray_length, _body.collision_mask, [_body.get_rid()])
	var hit_left = space.intersect_ray(query_left)
	
	# Right feeler (-35 deg)
	var right_dir = forward.rotated(deg_to_rad(-35.0))
	var query_right = PhysicsRayQueryParameters2D.create(start, start + right_dir * ray_length, _body.collision_mask, [_body.get_rid()])
	var hit_right = space.intersect_ray(query_right)
	
	if hit_left.is_empty() and not hit_right.is_empty():
		return left_dir * dir.length()
	elif hit_right.is_empty() and not hit_left.is_empty():
		return right_dir * dir.length()
	elif hit_left.is_empty() and hit_right.is_empty():
		return left_dir * dir.length()
		
	return -forward * (dir.length() * 0.5) # Dead end fallback
