# showcase_agent.gd
# Fear AI Showcase Agent (CharacterBody2D)
#
# STRICT ARCHITECTURAL INVARIANT:
# Godot owns physics, collisions, transforms, and move_and_slide().
# Fear AI provides affective state, fear band, intent advice, and heartbeat BPM.
class_name ShowcaseAgent
extends CharacterBody2D

const FearAgent = preload("res://addons/fear_ai/fear_agent.gd")

@export var agent_name: String = "Agent"
@export var role_title: String = "Civilian"
@export var agent_color: Color = Color(0.2, 0.6, 1.0)
@export_range(0.0, 1.0) var neuroticism: float = 0.5:
	set(val):
		neuroticism = val
		if fear_component:
			fear_component.neuroticism = val
@export_range(0.0, 1.0) var resilience: float = 0.5:
	set(val):
		resilience = val
		if fear_component:
			fear_component.resilience = val
@export_range(0.0, 1.0) var fear_baseline: float = 0.1:
	set(val):
		fear_baseline = val
		if fear_component:
			fear_component.fear_baseline = val
@export_range(0.0, 1.0) var leadership: float = 0.0:
	set(val):
		leadership = val
		if fear_component:
			fear_component.leadership = val
@export var is_leader: bool = false

var fear_component: FearAgent
var patrol_target: Vector2 = Vector2.ZERO
var has_patrol_target: bool = false
var social_panic_influence: float = 0.0
var trauma_zone_influence: float = 0.0
var manual_directive: String = ""

# Visual nodes
var _body_radius: float = 12.0
var _pulse_phase: float = 0.0

func _init() -> void:
	_init_fear_component()

func _ready() -> void:
	_init_fear_component()

func _init_fear_component() -> void:
	if fear_component == null:
		fear_component = FearAgent.new()
		fear_component.name = "FearAgent"
		fear_component.agent_id = agent_name.to_lower().replace(" ", "_")
		fear_component.neuroticism = neuroticism
		fear_component.resilience = resilience
		fear_component.fear_baseline = fear_baseline
		fear_component.leadership = leadership
		fear_component._parent_body = self
		add_child(fear_component)

func _physics_process(delta: float) -> void:
	_pulse_phase += delta * (float(fear_component.current_heartbeat_bpm) / 30.0)
	
	# Perform local evaluation if not receiving remote network ticks
	var threats = fear_component._scan_threats()
	fear_component.evaluate_local(threats, social_panic_influence, trauma_zone_influence)
	
	var hint = fear_component.get_movement_hint()
	var advisory_vec = Vector2(hint.vector.x, hint.vector.y)
	
	# Authoritative Godot steering logic
	if manual_directive == "RALLY" and is_leader:
		velocity = velocity.move_toward(Vector2.ZERO, 300.0 * delta)
	elif hint.intent == "FLEE_FROM" and advisory_vec.length() > 0.1:
		velocity = advisory_vec.normalized() * (hint.base_speed * hint.speed_mult)
	elif hint.intent == "INVESTIGATE" and advisory_vec.length() > 0.1:
		velocity = -advisory_vec.normalized() * (hint.base_speed * 0.5)
	elif has_patrol_target:
		var diff = patrol_target - global_position
		if diff.length() > 8.0:
			velocity = diff.normalized() * hint.base_speed
		else:
			velocity = Vector2.ZERO
	else:
		velocity = velocity.move_toward(Vector2.ZERO, 200.0 * delta)
		
	move_and_slide()
	queue_redraw()

func _draw() -> void:
	var hint = fear_component.get_movement_hint() if fear_component else { "raw_fear": 0.0, "fear_band": "CALM", "intent": "IDLE" }
	var raw_fear: float = hint.get("raw_fear", 0.0)
	var band: String = hint.get("fear_band", "CALM")
	var intent_str: String = hint.get("intent", "IDLE")
	var bpm: int = fear_component.current_heartbeat_bpm if fear_component else 60

	var pulse_scale = 1.0 + 0.08 * sin(_pulse_phase) * (raw_fear + 0.1)
	var r = _body_radius * pulse_scale

	var fill_color = agent_color
	if is_leader:
		draw_circle(Vector2.ZERO, r + 4.0, Color(1.0, 0.85, 0.2, 0.8))
	draw_circle(Vector2.ZERO, r, fill_color)
	draw_arc(Vector2.ZERO, r, 0, TAU, 24, Color.WHITE, 1.5)
	
	if velocity.length() > 5.0:
		var dir = velocity.normalized() * (r + 6.0)
		draw_line(Vector2.ZERO, dir, Color.WHITE, 2.0)

	var hud_y = -r - 10.0
	
	# Heartbeat & BPM Label
	var bpm_str = "%d BPM" % bpm
	var heart_color = Color.RED.lerp(Color.WHITE, 0.3)
	draw_string(ThemeDB.fallback_font, Vector2(-28, hud_y - 20), bpm_str, HORIZONTAL_ALIGNMENT_CENTER, 56, 9, heart_color)
	
	# Intent Badge Box
	var badge_text = intent_str.replace("_FROM", "").replace("_HAZARD", "").replace("IDLE_", "")
	if manual_directive != "":
		badge_text = manual_directive
	var badge_w = maxf(46.0, float(badge_text.length() * 6 + 10))
	var badge_rect = Rect2(-badge_w * 0.5, hud_y - 18.0, badge_w, 12.0)
	var badge_bg = Color(0.1, 0.1, 0.15, 0.85)
	var badge_border = Color(0.4, 0.7, 1.0)
	if band == "PANIC":
		badge_border = Color(1.0, 0.2, 0.2)
	elif band == "FEAR":
		badge_border = Color(1.0, 0.6, 0.1)
	elif band == "ALERT":
		badge_border = Color(1.0, 0.9, 0.2)
	draw_rect(badge_rect, badge_bg, true)
	draw_rect(badge_rect, badge_border, false, 1.0)
	draw_string(ThemeDB.fallback_font, Vector2(-badge_w * 0.5, hud_y - 9.0), badge_text, HORIZONTAL_ALIGNMENT_CENTER, int(badge_w), 8, Color.WHITE)

	# Fear Bar
	var bar_w = 44.0
	var bar_h = 4.0
	var bar_rect = Rect2(-bar_w * 0.5, hud_y - 4.0, bar_w, bar_h)
	draw_rect(bar_rect, Color(0.15, 0.15, 0.15, 0.9), true)
	
	var bar_color = Color.GREEN.lerp(Color.YELLOW, clampf(raw_fear * 2.0, 0.0, 1.0))
	if raw_fear > 0.5:
		bar_color = Color.YELLOW.lerp(Color.RED, clampf((raw_fear - 0.5) * 2.0, 0.0, 1.0))
	var fill_w = bar_w * clampf(raw_fear, 0.0, 1.0)
	if fill_w > 0.0:
		draw_rect(Rect2(-bar_w * 0.5, hud_y - 4.0, fill_w, bar_h), bar_color, true)
	draw_rect(bar_rect, Color(0.4, 0.4, 0.4, 0.6), false, 1.0)

	# Name & Role
	var label = "%s (%s)" % [agent_name, role_title]
	draw_string(ThemeDB.fallback_font, Vector2(-50, hud_y + 8), label, HORIZONTAL_ALIGNMENT_CENTER, 100, 8, Color(0.85, 0.85, 0.85))
