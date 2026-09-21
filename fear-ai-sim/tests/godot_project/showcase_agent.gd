# showcase_agent.gd
# Fear AI Showcase Agent (CharacterBody2D)
#
# STRICT ARCHITECTURAL INVARIANT:
# Godot owns physics, collisions, transforms, and move_and_slide().
# Fear AI provides affective state, fear band, intent advice, and heartbeat BPM.
#
# APPRAISAL SOURCE:
# The agent never evaluates the affect model itself - it asks its FearAgent
# component, which routes to either the offline canonical fallback or a live
# FearServer session. In live mode the advisory arrives asynchronously from the
# server, so the band/intent read here is always server-authored.
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
## Mirrors `FearAgent.appraisal_source`. Set through `set_appraisal_source()`.
var appraisal_source: int = 0
## Host-authored perception for ONE frame. A station that knows what this agent
## perceives - an escort screening a threat down, a courier's report reaching
## the capital - publishes the stimulus list here instead of an area scan. The
## override is consumed on the next submission, so a station that stops
## publishing immediately returns to the area scan rather than leaving a stale
## stimulus in place.
var perceived_stimuli: Array = []
var _has_perceived_stimuli_override: bool = false
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

## Route this agent's appraisals. Keeps the component and the host mirror in
## sync whichever order they were created in.
func set_appraisal_source(mode: int) -> void:
	appraisal_source = mode
	if fear_component:
		fear_component.set_appraisal_source(mode)

func is_live() -> bool:
	return appraisal_source == FearAgent.AppraisalSource.LIVE_SERVER

## Publish this frame's perception. Replaces the agent's own area scan for the
## next appraisal, in both local and live mode, so a station never has to care
## which appraisal source is active.
func set_perceived_stimuli(stimuli: Array) -> void:
	perceived_stimuli = stimuli
	_has_perceived_stimuli_override = true

func clear_perceived_stimuli() -> void:
	perceived_stimuli = []
	_has_perceived_stimuli_override = false

func _init_fear_component() -> void:
	if fear_component == null:
		fear_component = FearAgent.new()
		fear_component.name = "FearAgent"
		add_child(fear_component)
	# Identity and configuration are synced on EVERY call, outside the null
	# check, because `_init()` already builds the component before a station can
	# assign `agent_name`, traits, or the appraisal source. Syncing only at
	# creation left every showcase agent sharing the placeholder id "agent",
	# which made them all register as one server-side agent and receive each
	# other's advisories.
	if not agent_name.is_empty():
		fear_component.agent_id = agent_name.to_lower().replace(" ", "_")
	fear_component.neuroticism = neuroticism
	fear_component.resilience = resilience
	fear_component.fear_baseline = fear_baseline
	fear_component.leadership = leadership
	fear_component._parent_body = self
	fear_component.set_appraisal_source(appraisal_source)

func _physics_process(delta: float) -> void:
	_pulse_phase += delta * (float(fear_component.current_heartbeat_bpm) / 30.0)
	
	# Appraise through the configured source. In live mode this submits an
	# observation and the advisory arrives on a later frame; in local mode it is
	# the canonical fallback. Either way Godot still owns the motor below, and
	# this is the ONLY appraisal submission for this agent in a frame.
	var threats: Array = fear_component._scan_threats()
	if _has_perceived_stimuli_override:
		threats = perceived_stimuli
		_has_perceived_stimuli_override = false
	fear_component.appraise(threats, social_panic_influence, trauma_zone_influence)
	
	var hint = fear_component.get_movement_hint()
	var advisory_vec = Vector2(hint.vector.x, hint.vector.y)
	
	# Authoritative Godot steering logic
	if manual_directive == "RALLY" and is_leader:
		velocity = velocity.move_toward(Vector2.ZERO, 300.0 * delta)
	elif hint.intent == "FLEE_FROM" and advisory_vec.length() > 0.1:
		velocity = advisory_vec.normalized() * (hint.base_speed * hint.speed_mult)
	elif hint.intent == "INVESTIGATE_SOUND" and advisory_vec.length() > 0.1:
		# Canonical INVESTIGATE_SOUND points toward the sound source.
		velocity = advisory_vec.normalized() * (hint.base_speed * 0.5)
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
	var hint = fear_component.get_movement_hint() if fear_component else { "raw_fear": 0.0, "fear_band": "CALM", "intent": "IDLE_VIGILANT" }
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
	elif band == "ANXIOUS":
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
