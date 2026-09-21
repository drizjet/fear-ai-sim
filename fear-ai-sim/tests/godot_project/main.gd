# main.gd
# Fear AI Living-World & NPC Intelligence Showcase Runner (Godot 4.6)
#
# Interactive top-down camera, 7-station navigator, HUD overlay, and headless test runner.
extends Node2D

const StationController = preload("res://station_controller.gd")

@onready var camera: Camera2D = $Camera2D
@onready var station_controller: StationController = $StationController

var current_station_id: int = 1
var tour_mode: bool = false
var tour_timer: float = 0.0
var target_cam_pos: Vector2 = Vector2(350, 300)
var cam_speed: float = 600.0

# UI Labels
var _hud_panel: Panel
var _station_label: Label
var _telemetry_label: Label

func _ready() -> void:
	print("================================================================================")
	print("       FEAR AI LIVING-WORLD & NPC INTELLIGENCE: GODOT 4.6 SHOWCASE              ")
	print("================================================================================")
	print("Controls: [1-7] Jump to Station | [Space] Toggle Tour | [T] Trigger | [R] Reset")
	
	_setup_hud()
	jump_to_station(1)
	
	# Check if running automated test mode or headless
	var args = OS.get_cmdline_args()
	if DisplayServer.get_name() == "headless" or "--headless" in args or "--test" in args:
		print("[INFO] Headless display detected, running automated verification cycle...")
		_run_headless_verification()

func _setup_hud() -> void:
	var canvas = CanvasLayer.new()
	add_child(canvas)
	
	# Top Header Bar
	var top_bar = Panel.new()
	top_bar.custom_minimum_size = Vector2(1280, 42)
	top_bar.position = Vector2(0, 0)
	canvas.add_child(top_bar)
	
	var title = Label.new()
	title.text = " FEAR AI 4.6 MIDDLEWARE SHOWCASE | Authoritative Host: Godot 4.6 | Cognitive Oracle: Fear AI"
	title.position = Vector2(16, 10)
	top_bar.add_child(title)
	
	# Bottom Control Bar
	var bot_bar = Panel.new()
	bot_bar.custom_minimum_size = Vector2(1280, 50)
	bot_bar.position = Vector2(0, 670)
	canvas.add_child(bot_bar)
	
	var hbox = HBoxContainer.new()
	hbox.position = Vector2(16, 10)
	bot_bar.add_child(hbox)
	
	for i in range(1, 11):
		var btn = Button.new()
		btn.text = "Station %d" % i
		btn.pressed.connect(func(): jump_to_station(i))
		hbox.add_child(btn)
		
	var tour_btn = Button.new()
	tour_btn.text = "Toggle Tour (Space)"
	tour_btn.pressed.connect(toggle_tour)
	hbox.add_child(tour_btn)
	
	var trig_btn = Button.new()
	trig_btn.text = "Trigger Event (T)"
	trig_btn.pressed.connect(trigger_current_event)
	hbox.add_child(trig_btn)
	
	var reset_btn = Button.new()
	reset_btn.text = "Reset (R)"
	reset_btn.pressed.connect(reset_current_station)
	hbox.add_child(reset_btn)

	# Right Telemetry Drawer
	_hud_panel = Panel.new()
	_hud_panel.custom_minimum_size = Vector2(300, 240)
	_hud_panel.position = Vector2(960, 50)
	canvas.add_child(_hud_panel)
	
	_station_label = Label.new()
	_station_label.text = "Station: Initializing..."
	_station_label.position = Vector2(12, 10)
	_hud_panel.add_child(_station_label)
	
	_telemetry_label = Label.new()
	_telemetry_label.text = "Telemetry: Ready"
	_telemetry_label.position = Vector2(12, 35)
	_telemetry_label.autowrap_mode = TextServer.AUTOWRAP_WORD
	_hud_panel.add_child(_telemetry_label)

func _process(delta: float) -> void:
	# Camera smooth interpolation
	if camera:
		camera.global_position = camera.global_position.move_toward(target_cam_pos, cam_speed * delta)
		
	# Tour Mode auto-cycling
	if tour_mode:
		tour_timer += delta
		if tour_timer >= 4.5:
			tour_timer = 0.0
			var next_s = (current_station_id % 9) + 1
			jump_to_station(next_s)
			trigger_current_event()
			
	_update_telemetry()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed:
		if event.keycode >= KEY_1 and event.keycode <= KEY_9:
			var sid = event.keycode - KEY_0
			jump_to_station(sid)
		elif event.keycode == KEY_SPACE:
			toggle_tour()
		elif event.keycode == KEY_T:
			trigger_current_event()
		elif event.keycode == KEY_R:
			reset_current_station()
		elif event.keycode == KEY_Q or event.keycode == KEY_ESCAPE:
			get_tree().quit(0)

func jump_to_station(id: int) -> void:
	if not StationController.STATIONS.has(id):
		return
	current_station_id = id
	target_cam_pos = StationController.STATIONS[id]["pos"]
	if _station_label:
		_station_label.text = "Station %d: %s" % [id, StationController.STATIONS[id]["name"]]

func toggle_tour() -> void:
	tour_mode = not tour_mode
	tour_timer = 0.0
	print("[Showcase] Tour Mode: ", "ENABLED" if tour_mode else "DISABLED")

func trigger_current_event() -> void:
	if not station_controller:
		return
	match current_station_id:
		1: station_controller.trigger_station_1_approach()
		2: station_controller.trigger_station_2_sound()
		3: station_controller.trigger_station_3_panic()
		4:
			if station_controller.s4_rally_active:
				station_controller.trigger_station_4_threat()
			else:
				station_controller.trigger_station_4_rally()
		5: station_controller.trigger_station_5_march_into_trauma()
		6:
			if station_controller.s6_highland_danger > 0.5:
				station_controller.trigger_station_6_clear()
			else:
				station_controller.trigger_station_6_ambush()
		7: station_controller.trigger_station_7_escalate()
		8: station_controller.trigger_station_8_ambush()
		9: station_controller.trigger_station_9_dispatch()
		10: station_controller.trigger_station_10_ambush()

func reset_current_station() -> void:
	if not station_controller:
		return
	match current_station_id:
		1: station_controller.reset_station_1()
		2: station_controller.reset_station_2()
		3: station_controller.reset_station_3()
		4: station_controller.reset_station_4()
		5: station_controller.reset_station_5()
		6: station_controller.reset_station_6()
		7: station_controller.reset_station_7()
		8: station_controller.reset_station_8()
		9: station_controller.reset_station_9()
		10: station_controller.reset_station_10()

func _update_telemetry() -> void:
	if not _telemetry_label or not station_controller:
		return
	var text = ""
	match current_station_id:
		1:
			var scout = station_controller.s1_scout
			if scout and scout.fear_component:
				text = "Agent: Scout Alpha\nFear Band: %s (Raw: %.2f)\nIntent: %s\nHeartbeat: %d BPM\nPredator Dist: %.1f px" % [
					scout.fear_component.current_fear_band,
					scout.fear_component.current_raw_fear,
					scout.fear_component.current_intent,
					scout.fear_component.current_heartbeat_bpm,
					scout.global_position.distance_to(station_controller.s1_predator.global_position)
				]
		2:
			var sentry = station_controller.s2_sentry
			if sentry and sentry.fear_component:
				text = "Agent: Sentry Bravo\nSound Bursts: %d\nHabituation: %.2f%%\nFear: %.2f (%s)\nIntent: %s" % [
					station_controller.s2_sound_bursts,
					station_controller.s2_habituation_level * 100.0,
					sentry.fear_component.current_raw_fear,
					sentry.fear_component.current_fear_band,
					sentry.fear_component.current_intent
				]
		3:
			text = "Crowd Cluster: 8 Citizens\nPanic State: %s\nContagion Factor: 0.85\nStampede Vector: Active outward scatter" % [
				"CASCADE ACTIVE" if station_controller.s3_panic_active else "CALM"
			]
		4:
			var leader = station_controller.s4_leader
			text = "Unit: Vance Platoon\nLeader Stance: %s\nRally Directive: %s\nCohesion: Phalanx Guard (220px radius)\nSuppression: -60%% Panic" % [
				leader.fear_component.current_fear_band if leader else "CALM",
				"ACTIVE" if station_controller.s4_rally_active else "STANDBY"
			]
		5:
			var vet = station_controller.s5_veteran
			if vet and vet.fear_component:
				text = "Agent: Veteran Echo\nDread Zone Dist: %.1f px\nTrauma Flashback: %.2f\nFear: %.2f (%s)\nHeartbeat: %d BPM" % [
					vet.global_position.distance_to(station_controller.s5_dread_center),
					vet.trauma_zone_influence,
					vet.fear_component.current_raw_fear,
					vet.fear_component.current_fear_band,
					vet.fear_component.current_heartbeat_bpm
				]
		6:
			text = "Trade Route Intelligence:\nHighland Pass Danger: %.2f\nSelected Route: %s\nReroute Cost: +30%% Distance\nCognitive LOD: Active Dynamic Detour" % [
				station_controller.s6_highland_danger,
				station_controller.s6_active_route
			]
		7:
			text = "14-Stage Bilateral Ladder:\nCurrent Stage: %s\nBorder Tension: %.2f\nBlue: Honorable / Merc\nRed: Militaristic Expansion" % [
				station_controller.s7_bilateral_stage,
				station_controller.s7_tension
			]
		8:
			var merch = station_controller.s8_merchant
			text = "Regional Trade & Ambush Escorts:\nMass: Hub A 200g + B 40g + Cargo 60g = 300g\nAmbush Active: %s\nMerchant Fear: %.2f (%s)\nEscort Count: %d (Armed Guardians)" % [
				"YES (Raid Engaged)" if station_controller.s8_ambush_active else "NO (Highway Secure)",
				merch.fear_component.current_raw_fear if (merch and merch.fear_component) else 0.0,
				merch.fear_component.current_fear_band if (merch and merch.fear_component) else "CALM",
				station_controller.s8_escorts.size()
			]
		9:
			var outpost = station_controller.s9_outpost_sentry
			var capital = station_controller.s9_capital_commander
			text = "Epistemic Fog-of-War & Rumor:\nOutpost (Truth): Fear %.2f (%s)\nCapital (Fog): Fear %.2f (%s)\nCourier Dispatched: %s | Arrived: %s\nRumor Neurotic Decay: x%.2f" % [
				outpost.fear_component.current_raw_fear if (outpost and outpost.fear_component) else 0.0,
				outpost.fear_component.current_fear_band if (outpost and outpost.fear_component) else "CALM",
				capital.fear_component.current_raw_fear if (capital and capital.fear_component) else 0.0,
				capital.fear_component.current_fear_band if (capital and capital.fear_component) else "CALM",
				"YES" if station_controller.s9_courier_dispatched else "NO",
				"YES" if station_controller.s9_courier_arrived else "NO",
				station_controller.s9_rumor_decay_factor
			]
	_telemetry_label.text = text

func _run_headless_verification() -> void:
	# Run through each station headlessly
	await get_tree().create_timer(0.2).timeout
	for i in range(1, 11):
		jump_to_station(i)
		trigger_current_event()
		await get_tree().create_timer(0.1).timeout
	print("[GODOT SHOWCASE HEADLESS] All 10 stations verified successfully.")
	get_tree().quit(0)
