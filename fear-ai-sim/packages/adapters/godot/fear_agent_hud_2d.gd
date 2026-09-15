# fear_agent_hud_2d.gd
# Reusable Overhead HUD Component for Fear AI in Godot 4
# Renders a stylized, self-contained fear meter, action intent badge, and heartbeat indicator.
class_name FearAgentHUD2D
extends Node2D

@export var agent_path: NodePath
@export var bar_width: float = 64.0
@export var bar_height: float = 6.0
@export var vertical_offset: float = -45.0
@export var show_intent_badge: bool = true
@export var show_heartbeat_bpm: bool = true
@export var show_fear_percentage: bool = false

var _agent: Node = null
var _display_fear: float = 0.0
var _target_fear: float = 0.0
var _current_band: String = "CALM"
var _current_intent: String = "IDLE_VIGILANT"
var _bpm: int = 60
var _pulse_phase: float = 0.0

const COLOR_CALM = Color(0.06, 0.72, 0.51, 0.95)     # #10b981
const COLOR_UNEASY = Color(0.52, 0.80, 0.09, 0.95)   # #84cc16
const COLOR_ANXIOUS = Color(0.96, 0.62, 0.04, 0.95)  # #f59e0b
const COLOR_FEAR = Color(0.98, 0.45, 0.09, 0.95)     # #f97316
const COLOR_PANIC = Color(0.94, 0.27, 0.27, 0.95)    # #ef4444
const COLOR_BG = Color(0.08, 0.11, 0.18, 0.85)       # #141c2e
const COLOR_BORDER = Color(0.20, 0.26, 0.36, 0.90)   # #33415c

func _ready() -> void:
	z_index = 100 # Ensure HUD draws above world sprites
	if not agent_path.is_empty():
		_agent = get_node_or_null(agent_path)
	
	if not _agent:
		var parent = get_parent()
		if parent:
			if parent.has_signal("fear_band_changed"):
				_agent = parent
			else:
				for child in parent.get_children():
					if child.has_signal("fear_band_changed"):
						_agent = child
						break
	
	if _agent:
		_bind_agent(_agent)

func _bind_agent(agent: Node) -> void:
	if agent.has_signal("fear_band_changed"):
		agent.connect("fear_band_changed", _on_fear_band_changed)
	if agent.has_signal("intent_changed"):
		agent.connect("intent_changed", _on_intent_changed)
	if agent.has_signal("audio_hints_received"):
		agent.connect("audio_hints_received", _on_audio_hints_received)

func _on_fear_band_changed(band: String) -> void:
	_current_band = band
	queue_redraw()

func _on_intent_changed(intent: Dictionary) -> void:
	if intent.has("type"):
		_current_intent = str(intent["type"])
	elif intent.has("action_intent") and intent["action_intent"] is Dictionary:
		_current_intent = str(intent["action_intent"].get("type", "IDLE_VIGILANT"))
	
	if intent.has("raw_fear"):
		_target_fear = clampf(float(intent["raw_fear"]), 0.0, 1.0)
	elif intent.has("fear"):
		_target_fear = clampf(float(intent["fear"]), 0.0, 1.0)
	queue_redraw()

func _on_audio_hints_received(hints: Dictionary) -> void:
	if hints.has("heartbeat_bpm"):
		_bpm = int(hints["heartbeat_bpm"])
	queue_redraw()

func set_fear_direct(fear_val: float, band: String = "", intent: String = "", bpm_val: int = -1) -> void:
	_target_fear = clampf(fear_val, 0.0, 1.0)
	if not band.is_empty():
		_current_band = band
	if not intent.is_empty():
		_current_intent = intent
	if bpm_val > 0:
		_bpm = bpm_val
	queue_redraw()

func _process(delta: float) -> void:
	_display_fear = lerpf(_display_fear, _target_fear, clampf(delta * 12.0, 0.0, 1.0))
	var bps = float(_bpm) / 60.0
	_pulse_phase += delta * bps * TAU
	if _pulse_phase > TAU:
		_pulse_phase -= TAU
	queue_redraw()

func _get_band_color(band: String) -> Color:
	match band:
		"CALM": return COLOR_CALM
		"UNEASY": return COLOR_UNEASY
		"ANXIOUS": return COLOR_ANXIOUS
		"FEAR": return COLOR_FEAR
		"PANIC": return COLOR_PANIC
		_:
			if _display_fear < 0.2: return COLOR_CALM
			elif _display_fear < 0.4: return COLOR_UNEASY
			elif _display_fear < 0.6: return COLOR_ANXIOUS
			elif _display_fear < 0.8: return COLOR_FEAR
			else: return COLOR_PANIC

func _draw() -> void:
	var center_x = 0.0
	var top_y = vertical_offset
	
	# 1. Background Rect
	var half_w = bar_width * 0.5
	var bg_rect = Rect2(center_x - half_w, top_y, bar_width, bar_height)
	draw_rect(bg_rect, COLOR_BG, true)
	draw_rect(bg_rect, COLOR_BORDER, false, 1.0)
	
	# 2. Filled Fear Bar
	var fill_w = clampf(bar_width * _display_fear, 0.0, bar_width)
	if fill_w > 0.5:
		var fill_rect = Rect2(center_x - half_w, top_y, fill_w, bar_height)
		var fill_color = _get_band_color(_current_band)
		draw_rect(fill_rect, fill_color, true)
	
	# 3. Intent Badge Text
	var font = ThemeDB.fallback_font
	var font_size = 9
	if show_intent_badge and font:
		var badge_text = "[%s]" % _current_intent
		var badge_color = _get_band_color(_current_band)
		var text_size = font.get_string_size(badge_text, HORIZONTAL_ALIGNMENT_CENTER, -1, font_size)
		var text_pos = Vector2(center_x - text_size.x * 0.5, top_y - 3.0)
		draw_string(font, text_pos, badge_text, HORIZONTAL_ALIGNMENT_CENTER, -1, font_size, badge_color)
	
	# 4. Heartbeat BPM / Indicator
	if show_heartbeat_bpm and font:
		var bpm_text = "♥ %d BPM" % _bpm
		var bpm_color = Color(1.0, 0.35, 0.35, 0.85) if _bpm > 100 else Color(0.7, 0.75, 0.85, 0.75)
		var bpm_size = font.get_string_size(bpm_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 8)
		var bpm_pos = Vector2(center_x - bpm_size.x * 0.5, top_y + bar_height + 10.0)
		draw_string(font, bpm_pos, bpm_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 8, bpm_color)
