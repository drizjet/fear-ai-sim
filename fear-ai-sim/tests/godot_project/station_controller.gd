# station_controller.gd
# Orchestrates the 7 behavioral showcase stations in Godot 4.6.
#
# STRICT ARCHITECTURAL INVARIANT:
# Godot owns physics, movement, waypoints, and collision geometry.
# Fear AI evaluates threats, habituation, contagion, memory, routes, and diplomacy.
class_name StationController
extends Node2D

const ShowcaseAgent = preload("res://showcase_agent.gd")

signal telemetry_updated(info: Dictionary)

# Station Positions in 2D World
const STATIONS = {
	1: { "name": "Individual Fear & Threat Appraisal", "pos": Vector2(350, 300) },
	2: { "name": "Ambiguous Sound & Habituation", "pos": Vector2(1050, 300) },
	3: { "name": "Crowd Panic Cascade", "pos": Vector2(1750, 300) },
	4: { "name": "Leader Rally Dynamics", "pos": Vector2(350, 950) },
	5: { "name": "Trauma Zone Re-activation", "pos": Vector2(1050, 950) },
	6: { "name": "Trade Caravan Danger Reroute", "pos": Vector2(1750, 950) },
	7: { "name": "Faction Stance Interaction", "pos": Vector2(1050, 620) }
}

# --- Station 1 Nodes ---
var s1_scout: ShowcaseAgent
var s1_predator: Node2D

# --- Station 2 Nodes ---
var s2_sentry: ShowcaseAgent
var s2_sound_bursts: int = 0
var s2_habituation_level: float = 0.0
var s2_timer: float = 0.0

# --- Station 3 Nodes ---
var s3_civilians: Array[ShowcaseAgent] = []
var s3_panic_active: bool = false

# --- Station 4 Nodes ---
var s4_leader: ShowcaseAgent
var s4_soldiers: Array[ShowcaseAgent] = []
var s4_threat: Node2D
var s4_rally_active: bool = false

# --- Station 5 Nodes ---
var s5_veteran: ShowcaseAgent
var s5_dread_center: Vector2 = Vector2(1050, 950)
var s5_dread_radius: float = 90.0

# --- Station 6 Nodes ---
var s6_caravan: Array[ShowcaseAgent] = []
var s6_highland_danger: float = 0.05
var s6_active_route: String = "HIGHLAND_PASS"
var s6_route_progress: float = 0.0

# --- Station 7 Nodes ---
var s7_blue_patrol: ShowcaseAgent
var s7_red_patrol: ShowcaseAgent
var s7_bilateral_stage: String = "UNAWARE"
var s7_tension: float = 0.15

func _ready() -> void:
	_init_station_1()
	_init_station_2()
	_init_station_3()
	_init_station_4()
	_init_station_5()
	_init_station_6()
	_init_station_7()

func _physics_process(delta: float) -> void:
	_update_station_1(delta)
	_update_station_2(delta)
	_update_station_3(delta)
	_update_station_4(delta)
	_update_station_5(delta)
	_update_station_6(delta)
	_update_station_7(delta)
	queue_redraw()

# ==============================================================================
# STATION 1: Individual Threat Appraisal
# ==============================================================================
func _init_station_1() -> void:
	var center = STATIONS[1]["pos"]
	s1_scout = _create_agent("Scout Alpha", "Scout", Color(0.2, 0.7, 1.0), center + Vector2(-80, 0), 0.7, 0.3, 0.1)
	
	s1_predator = Node2D.new()
	s1_predator.name = "Predator_Stalker"
	s1_predator.add_to_group("fear_threats")
	s1_predator.global_position = center + Vector2(120, 0)
	add_child(s1_predator)

func _update_station_1(delta: float) -> void:
	if not s1_scout or not s1_predator:
		return
	# Predator slowly creeps towards scout
	var dir = (s1_scout.global_position - s1_predator.global_position).normalized()
	var d = s1_scout.global_position.distance_to(s1_predator.global_position)
	if d > 40.0 and d < 180.0:
		s1_predator.global_position += dir * 25.0 * delta

func trigger_station_1_approach() -> void:
	if s1_predator and s1_scout:
		s1_predator.global_position = s1_scout.global_position + Vector2(70, 0)

func reset_station_1() -> void:
	if s1_scout and s1_predator:
		s1_scout.global_position = STATIONS[1]["pos"] + Vector2(-80, 0)
		s1_predator.global_position = STATIONS[1]["pos"] + Vector2(120, 0)
		s1_scout.fear_component.current_raw_fear = 0.0

# ==============================================================================
# STATION 2: Ambiguous Sound & Habituation
# ==============================================================================
func _init_station_2() -> void:
	var center = STATIONS[2]["pos"]
	s2_sentry = _create_agent("Sentry Bravo", "Guard", Color(0.3, 0.8, 0.4), center, 0.6, 0.7, 0.05)

func _update_station_2(delta: float) -> void:
	s2_timer += delta
	if s2_timer >= 3.0:
		s2_timer = 0.0
		trigger_station_2_sound()

func trigger_station_2_sound() -> void:
	s2_sound_bursts += 1
	# Habituation dampening curve: H(n) = 1.0 / (1.0 + 0.9 * n)
	s2_habituation_level = minf(1.0, float(s2_sound_bursts) * 0.25)
	var initial_urgency = 0.85
	var effective_threat = initial_urgency * (1.0 - s2_habituation_level * 0.85)
	
	if s2_sentry:
		# Synthesize sound threat
		var fake_threat = [{ "id": "sound_pulse", "intensity": effective_threat, "distance": 30.0, "x": s2_sentry.global_position.x + 50, "y": s2_sentry.global_position.y }]
		s2_sentry.fear_component.evaluate_local(fake_threat)

func reset_station_2() -> void:
	s2_sound_bursts = 0
	s2_habituation_level = 0.0
	s2_timer = 0.0
	if s2_sentry:
		s2_sentry.global_position = STATIONS[2]["pos"]
		s2_sentry.fear_component.current_raw_fear = 0.0

# ==============================================================================
# STATION 3: Crowd Panic Cascade
# ==============================================================================
func _init_station_3() -> void:
	var center = STATIONS[3]["pos"]
	s3_civilians.clear()
	var rng = RandomNumberGenerator.new()
	rng.seed = 42
	for i in range(8):
		var offset = Vector2(rng.randf_range(-60, 60), rng.randf_range(-60, 60))
		var civ = _create_agent("Civ %d" % (i + 1), "Citizen", Color(0.8, 0.8, 0.3), center + offset, 0.8, 0.2, 0.1)
		s3_civilians.append(civ)

func _update_station_3(_delta: float) -> void:
	if not s3_panic_active:
		return
	# Social contagion propagation: compute max fear in neighborhood
	var max_fear = 0.0
	for civ in s3_civilians:
		if civ.fear_component.current_raw_fear > max_fear:
			max_fear = civ.fear_component.current_raw_fear
			
	for civ in s3_civilians:
		# Contagion susceptibility beta = 0.75
		civ.social_panic_influence = max_fear * 0.85

func trigger_station_3_panic() -> void:
	s3_panic_active = true
	if s3_civilians.size() > 0:
		# Infect first civilian with sudden acute terror
		s3_civilians[0].fear_component.current_raw_fear = 1.0
		s3_civilians[0].fear_component.current_fear_band = "PANIC"
		s3_civilians[0].fear_component.current_intent = "FLEE_FROM"

func reset_station_3() -> void:
	s3_panic_active = false
	var center = STATIONS[3]["pos"]
	var rng = RandomNumberGenerator.new()
	rng.seed = 42
	for i in range(s3_civilians.size()):
		var civ = s3_civilians[i]
		civ.global_position = center + Vector2(rng.randf_range(-60, 60), rng.randf_range(-60, 60))
		civ.social_panic_influence = 0.0
		civ.fear_component.current_raw_fear = 0.0
		civ.velocity = Vector2.ZERO

# ==============================================================================
# STATION 4: Leader Rally Dynamics
# ==============================================================================
func _init_station_4() -> void:
	var center = STATIONS[4]["pos"]
	s4_leader = _create_agent("Captain Vance", "Officer", Color(0.9, 0.7, 0.1), center, 0.2, 0.95, 0.05, 0.95, true)
	s4_soldiers.clear()
	s4_soldiers.append(_create_agent("Soldier 1", "Infantry", Color(0.3, 0.6, 0.9), center + Vector2(-50, 40), 0.6, 0.4, 0.1))
	s4_soldiers.append(_create_agent("Soldier 2", "Infantry", Color(0.3, 0.6, 0.9), center + Vector2(0, 50), 0.7, 0.35, 0.1))
	s4_soldiers.append(_create_agent("Soldier 3", "Infantry", Color(0.3, 0.6, 0.9), center + Vector2(50, 40), 0.65, 0.45, 0.1))
	
	s4_threat = Node2D.new()
	s4_threat.name = "Platoon_Threat"
	s4_threat.add_to_group("fear_threats")
	s4_threat.global_position = center + Vector2(0, -120)
	add_child(s4_threat)

func _update_station_4(_delta: float) -> void:
	if not s4_leader:
		return
	if s4_rally_active:
		s4_leader.manual_directive = "RALLY"
		for soldier in s4_soldiers:
			var dist = soldier.global_position.distance_to(s4_leader.global_position)
			if dist <= 220.0:
				# Leader rally suppresses fear and coordinates formation
				soldier.fear_component.current_raw_fear = maxf(0.0, soldier.fear_component.current_raw_fear - 0.02)
				soldier.manual_directive = "PHALANX"
				soldier.has_patrol_target = true
				var offset_slot = (soldier.global_position - s4_leader.global_position).normalized() * 45.0
				soldier.patrol_target = s4_leader.global_position + offset_slot

func trigger_station_4_threat() -> void:
	# Threat moves in, causing soldier panic
	if s4_threat:
		s4_threat.global_position = STATIONS[4]["pos"] + Vector2(0, -50)
	s4_rally_active = false
	for s in s4_soldiers:
		s.manual_directive = ""
		s.has_patrol_target = false

func trigger_station_4_rally() -> void:
	s4_rally_active = true

func reset_station_4() -> void:
	var center = STATIONS[4]["pos"]
	s4_rally_active = false
	if s4_leader:
		s4_leader.global_position = center
		s4_leader.manual_directive = ""
		s4_leader.fear_component.current_raw_fear = 0.0
	if s4_threat:
		s4_threat.global_position = center + Vector2(0, -120)
	var slots = [Vector2(-50, 40), Vector2(0, 50), Vector2(50, 40)]
	for i in range(s4_soldiers.size()):
		s4_soldiers[i].global_position = center + slots[i]
		s4_soldiers[i].manual_directive = ""
		s4_soldiers[i].has_patrol_target = false
		s4_soldiers[i].fear_component.current_raw_fear = 0.0

# ==============================================================================
# STATION 5: Trauma Zone Re-activation
# ==============================================================================
func _init_station_5() -> void:
	var center = STATIONS[5]["pos"]
	s5_dread_center = center
	s5_veteran = _create_agent("Veteran Echo", "Scout", Color(0.7, 0.4, 0.9), center + Vector2(-120, 0), 0.5, 0.5, 0.05)
	s5_veteran.has_patrol_target = true
	s5_veteran.patrol_target = center + Vector2(120, 0)

func _update_station_5(_delta: float) -> void:
	if not s5_veteran:
		return
	var d = s5_veteran.global_position.distance_to(s5_dread_center)
	if d < s5_dread_radius:
		# Episodic Trauma dread re-activation gradient
		var trauma_intensity = 1.0 - (d / s5_dread_radius)
		s5_veteran.trauma_zone_influence = trauma_intensity * 0.95
		# Avoidance vector away from center
		var repel_dir = (s5_veteran.global_position - s5_dread_center).normalized()
		s5_veteran.fear_component.recommended_vector = Vector3(repel_dir.x, repel_dir.y, 0)
	else:
		s5_veteran.trauma_zone_influence = 0.0

func trigger_station_5_march_into_trauma() -> void:
	if s5_veteran:
		s5_veteran.global_position = s5_dread_center + Vector2(-20, 0)

func reset_station_5() -> void:
	if s5_veteran:
		s5_veteran.global_position = STATIONS[5]["pos"] + Vector2(-120, 0)
		s5_veteran.has_patrol_target = true
		s5_veteran.patrol_target = STATIONS[5]["pos"] + Vector2(120, 0)
		s5_veteran.trauma_zone_influence = 0.0
		s5_veteran.fear_component.current_raw_fear = 0.0

# ==============================================================================
# STATION 6: Trade Caravan Danger Reroute
# ==============================================================================
func _init_station_6() -> void:
	var center = STATIONS[6]["pos"]
	s6_caravan.clear()
	var leader = _create_agent("Caravan Master", "Merchant", Color(0.9, 0.5, 0.2), center + Vector2(-150, -50), 0.4, 0.6, 0.05)
	var mule1 = _create_agent("Pack Mule 1", "Cargo", Color(0.7, 0.4, 0.2), center + Vector2(-180, -50), 0.2, 0.8, 0.0)
	var mule2 = _create_agent("Pack Mule 2", "Cargo", Color(0.7, 0.4, 0.2), center + Vector2(-210, -50), 0.2, 0.8, 0.0)
	s6_caravan.append(leader)
	s6_caravan.append(mule1)
	s6_caravan.append(mule2)
	s6_highland_danger = 0.05
	s6_active_route = "HIGHLAND_PASS"

func _update_station_6(delta: float) -> void:
	s6_route_progress += delta * 30.0
	var center = STATIONS[6]["pos"]
	
	# Cognitive LOD and Route Decision
	if s6_highland_danger >= 0.70:
		s6_active_route = "RIVER_DETOUR"
	else:
		s6_active_route = "HIGHLAND_PASS"
		
	# Follow route waypoints
	var target_y = -50.0 if s6_active_route == "HIGHLAND_PASS" else 60.0
	var x_pos = -150.0 + fmod(s6_route_progress, 300.0)
	
	if s6_caravan.size() >= 3:
		s6_caravan[0].has_patrol_target = true
		s6_caravan[0].patrol_target = center + Vector2(x_pos, target_y)
		s6_caravan[1].has_patrol_target = true
		s6_caravan[1].patrol_target = center + Vector2(x_pos - 30.0, target_y)
		s6_caravan[2].has_patrol_target = true
		s6_caravan[2].patrol_target = center + Vector2(x_pos - 60.0, target_y)

func trigger_station_6_ambush() -> void:
	s6_highland_danger = 0.85

func trigger_station_6_clear() -> void:
	s6_highland_danger = 0.05

func reset_station_6() -> void:
	s6_highland_danger = 0.05
	s6_active_route = "HIGHLAND_PASS"
	s6_route_progress = 0.0

# ==============================================================================
# STATION 7: Faction Stance Interaction
# ==============================================================================
func _init_station_7() -> void:
	var center = STATIONS[7]["pos"]
	s7_blue_patrol = _create_agent("Blue Vanguard", "Honorable Faction", Color(0.2, 0.4, 0.9), center + Vector2(-120, 0), 0.3, 0.8, 0.05)
	s7_red_patrol = _create_agent("Red Cohort", "Militaristic Faction", Color(0.9, 0.2, 0.2), center + Vector2(120, 0), 0.5, 0.7, 0.1)

func _update_station_7(_delta: float) -> void:
	if not s7_blue_patrol or not s7_red_patrol:
		return
	var d = s7_blue_patrol.global_position.distance_to(s7_red_patrol.global_position)
	# 14-Stage Faction Bilateral Matrix evaluation
	if d > 220.0:
		s7_bilateral_stage = "UNAWARE"
	elif d > 140.0:
		s7_bilateral_stage = "OBSERVE"
	elif d > 70.0:
		s7_bilateral_stage = "WARN" if s7_tension < 0.5 else "POSTURE"
	else:
		s7_bilateral_stage = "SKIRMISH" if s7_tension >= 0.5 else "NEGOTIATE"
		
	s7_blue_patrol.manual_directive = s7_bilateral_stage
	s7_red_patrol.manual_directive = s7_bilateral_stage

func trigger_station_7_escalate() -> void:
	s7_tension = 0.85
	if s7_blue_patrol and s7_red_patrol:
		s7_blue_patrol.global_position = STATIONS[7]["pos"] + Vector2(-35, 0)
		s7_red_patrol.global_position = STATIONS[7]["pos"] + Vector2(35, 0)

func reset_station_7() -> void:
	s7_tension = 0.15
	s7_bilateral_stage = "UNAWARE"
	if s7_blue_patrol and s7_red_patrol:
		s7_blue_patrol.global_position = STATIONS[7]["pos"] + Vector2(-120, 0)
		s7_red_patrol.global_position = STATIONS[7]["pos"] + Vector2(120, 0)

# ==============================================================================
# HELPER & DRAWING
# ==============================================================================
func _create_agent(aname: String, role: String, color: Color, pos: Vector2, n: float, r: float, b: float, l: float = 0.0, is_lead: bool = false) -> ShowcaseAgent:
	var ag = ShowcaseAgent.new()
	ag.agent_name = aname
	ag.role_title = role
	ag.agent_color = color
	ag.global_position = pos
	ag.neuroticism = n
	ag.resilience = r
	ag.fear_baseline = b
	ag.leadership = l
	ag.is_leader = is_lead
	add_child(ag)
	return ag

func _draw() -> void:
	# Draw background grid and station boundaries
	for id in STATIONS.keys():
		var s = STATIONS[id]
		var p: Vector2 = s["pos"]
		var box = Rect2(p.x - 170, p.y - 120, 340, 240)
		
		# Station outline and background tint
		draw_rect(box, Color(0.08, 0.09, 0.12, 0.6), true)
		draw_rect(box, Color(0.25, 0.35, 0.5, 0.5), false, 1.5)
		
		# Station header title
		var title = "STATION %d: %s" % [id, s["name"]]
		draw_string(ThemeDB.fallback_font, Vector2(p.x - 160, p.y - 100), title, HORIZONTAL_ALIGNMENT_LEFT, 320, 11, Color(0.4, 0.8, 1.0))
		
	# Station 5 Dread Zone Visuals
	draw_circle(s5_dread_center, s5_dread_radius, Color(0.6, 0.1, 0.1, 0.15))
	draw_arc(s5_dread_center, s5_dread_radius, 0, TAU, 32, Color(1.0, 0.2, 0.2, 0.6), 1.5)
	draw_string(ThemeDB.fallback_font, s5_dread_center + Vector2(-45, 4), "TRAUMA ZONE", HORIZONTAL_ALIGNMENT_CENTER, 90, 9, Color(1.0, 0.4, 0.4, 0.8))

	# Station 6 Route Lines
	var c6 = STATIONS[6]["pos"]
	var p_start = c6 + Vector2(-150, 0)
	var p_end = c6 + Vector2(150, 0)
	# Highland Pass (Top)
	var hl_color = Color(1.0, 0.2, 0.2, 0.8) if s6_highland_danger >= 0.7 else Color(0.4, 0.8, 0.4, 0.8)
	draw_line(p_start + Vector2(0, -50), p_end + Vector2(0, -50), hl_color, 3.0)
	draw_string(ThemeDB.fallback_font, c6 + Vector2(-70, -55), "Highland Pass (Danger: %.2f)" % s6_highland_danger, HORIZONTAL_ALIGNMENT_CENTER, 140, 8, hl_color)
	
	# River Detour (Bottom)
	var rv_color = Color(0.3, 0.7, 1.0, 0.8)
	draw_line(p_start + Vector2(0, 60), p_end + Vector2(0, 60), rv_color, 3.0)
	draw_string(ThemeDB.fallback_font, c6 + Vector2(-70, 75), "River Detour (Safe Waypoint)", HORIZONTAL_ALIGNMENT_CENTER, 140, 8, rv_color)

	# Station 7 Border Post Line
	var c7 = STATIONS[7]["pos"]
	draw_line(c7 + Vector2(0, -80), c7 + Vector2(0, 80), Color(0.8, 0.8, 0.2, 0.6), 2.0)
	draw_string(ThemeDB.fallback_font, c7 + Vector2(-50, -85), "BORDER LADDER: %s" % s7_bilateral_stage, HORIZONTAL_ALIGNMENT_CENTER, 100, 9, Color.YELLOW)
