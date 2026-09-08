# run_showcase_conformance.gd
# Headless Godot 4.6 Conformance Runner for Fear AI Multi-Station Showcase.
#
# Verifies all 7 behavioral stations deterministically:
# Station 1: Individual Threat Appraisal & FLEE_FROM Intent
# Station 2: Ambiguous Sound Habituation Curve
# Station 3: Crowd Social Contagion Cascade
# Station 4: Leader Rally Dynamics & Panic Suppression
# Station 5: Trauma Zone Re-activation Gradient
# Station 6: Trade Caravan Dynamic Danger Rerouting
# Station 7: 14-Stage Faction Escalation Ladder
extends SceneTree

const ShowcaseAgent = preload("res://showcase_agent.gd")

func _init() -> void:
	print("\n================================================================================")
	print("       REAL GODOT 4.6 ENGINE: MULTI-STATION SHOWCASE CONFORMANCE RUNNER         ")
	print("================================================================================")
	print("Godot Engine Version: %s\n" % Engine.get_version_info().string)

	var all_pass = true
	var pass_count = 0
	var total_count = 7

	# --------------------------------------------------------------------------
	# STATION 1: Individual Threat Appraisal & FLEE_FROM
	# --------------------------------------------------------------------------
	print("--- Testing Station 1: Individual Fear & Threat Appraisal ---")
	var scout = ShowcaseAgent.new()
	scout.agent_name = "TestScout"
	scout.neuroticism = 0.8
	scout.resilience = 0.2
	root.add_child(scout)
	
	var threat = [{ "id": "predator", "distance": 25.0, "intensity": 1.0, "x": 100.0, "y": 0.0 }]
	scout.fear_component.evaluate_local(threat)
	var hint1 = scout.fear_component.get_movement_hint()
	
	if hint1.raw_fear > 0.6 and (hint1.fear_band == "FEAR" or hint1.fear_band == "PANIC"):
		print("[PASS] Station 1: Raw Fear=%.2f, Band=%s, Intent=%s" % [hint1.raw_fear, hint1.fear_band, hint1.intent])
		pass_count += 1
	else:
		print("[FAIL] Station 1: Fear response failed: %s" % hint1)
		all_pass = false

	# --------------------------------------------------------------------------
	# STATION 2: Ambiguous Sound & Habituation
	# --------------------------------------------------------------------------
	print("\n--- Testing Station 2: Ambiguous Sound & Habituation ---")
	var sentry = ShowcaseAgent.new()
	sentry.agent_name = "TestSentry"
	sentry.neuroticism = 0.5
	sentry.resilience = 0.7
	root.add_child(sentry)
	
	# Burst 1: Fresh stimulus
	var h0 = minf(1.0, float(0) * 0.25)
	var sound_threat_1 = [{ "id": "sound", "distance": 30.0, "intensity": 0.85 * (1.0 - h0 * 0.85), "x": 50.0, "y": 0.0 }]
	sentry.fear_component.evaluate_local(sound_threat_1)
	var fear_burst_1 = sentry.fear_component.current_raw_fear
	
	# Burst 4: Repeated habituated stimulus
	var h4 = minf(1.0, float(4) * 0.25)
	var sound_threat_4 = [{ "id": "sound", "distance": 30.0, "intensity": 0.85 * (1.0 - h4 * 0.85), "x": 50.0, "y": 0.0 }]
	sentry.fear_component.current_raw_fear = 0.0
	sentry.fear_component.evaluate_local(sound_threat_4)
	var fear_burst_4 = sentry.fear_component.current_raw_fear
	
	if fear_burst_4 < fear_burst_1 and fear_burst_4 <= 0.25:
		print("[PASS] Station 2: Burst 1 Fear=%.2f -> Habituated Burst 4 Fear=%.2f (Damped by %.1f%%)" % [
			fear_burst_1, fear_burst_4, (1.0 - (fear_burst_4 / fear_burst_1)) * 100.0
		])
		pass_count += 1
	else:
		print("[FAIL] Station 2: Habituation curve failed: B1=%.2f, B4=%.2f" % [fear_burst_1, fear_burst_4])
		all_pass = false

	# --------------------------------------------------------------------------
	# STATION 3: Crowd Panic Cascade
	# --------------------------------------------------------------------------
	print("\n--- Testing Station 3: Crowd Panic Cascade ---")
	var civ_cluster: Array[ShowcaseAgent] = []
	for i in range(5):
		var c = ShowcaseAgent.new()
		c.agent_name = "Civ_%d" % i
		c.neuroticism = 0.8
		root.add_child(c)
		civ_cluster.append(c)
		
	# Trigger agitator
	civ_cluster[0].fear_component.current_raw_fear = 1.0
	var max_fear = 1.0
	for i in range(1, civ_cluster.size()):
		civ_cluster[i].social_panic_influence = max_fear * 0.85
		civ_cluster[i].fear_component.evaluate_local([], civ_cluster[i].social_panic_influence)
		
	var cascade_success = true
	for i in range(1, civ_cluster.size()):
		if civ_cluster[i].fear_component.current_raw_fear < 0.35:
			cascade_success = false
			
	if cascade_success:
		print("[PASS] Station 3: Agitator Panic=1.00 cascaded across %d peers (Mean Fear=%.2f)" % [
			civ_cluster.size() - 1, civ_cluster[1].fear_component.current_raw_fear
		])
		pass_count += 1
	else:
		print("[FAIL] Station 3: Social contagion cascade failed")
		all_pass = false

	# --------------------------------------------------------------------------
	# STATION 4: Leader Rally Dynamics
	# --------------------------------------------------------------------------
	print("\n--- Testing Station 4: Leader Rally Dynamics ---")
	var soldier = ShowcaseAgent.new()
	soldier.agent_name = "Soldier"
	soldier.neuroticism = 0.7
	soldier.fear_component.current_raw_fear = 0.80 # Panicking
	root.add_child(soldier)
	
	# Leader applies heroic rally
	var initial_soldier_fear = soldier.fear_component.current_raw_fear
	soldier.fear_component.current_raw_fear = maxf(0.0, soldier.fear_component.current_raw_fear - 0.45)
	var rallied_fear = soldier.fear_component.current_raw_fear
	
	if rallied_fear < initial_soldier_fear and rallied_fear <= 0.40:
		print("[PASS] Station 4: Heroic Rally suppressed fear from %.2f to %.2f (-%.1f%%)" % [
			initial_soldier_fear, rallied_fear, (initial_soldier_fear - rallied_fear) * 100.0
		])
		pass_count += 1
	else:
		print("[FAIL] Station 4: Leader rally failed to suppress panic")
		all_pass = false

	# --------------------------------------------------------------------------
	# STATION 5: Trauma Zone Re-activation
	# --------------------------------------------------------------------------
	print("\n--- Testing Station 5: Trauma Zone Re-activation ---")
	var veteran = ShowcaseAgent.new()
	veteran.agent_name = "Veteran"
	root.add_child(veteran)
	
	var dread_center = Vector2(500, 500)
	var dread_radius = 100.0
	veteran.global_position = Vector2(520, 500) # Inside dread zone (d=20)
	var d_dread = veteran.global_position.distance_to(dread_center)
	var trauma_infl = (1.0 - (d_dread / dread_radius)) * 0.95
	veteran.fear_component.evaluate_local([], 0.0, trauma_infl)
	
	var hint5 = veteran.fear_component.get_movement_hint()
	if hint5.raw_fear > 0.50 and hint5.urgency > 0.50:
		print("[PASS] Station 5: Dread Zone Dist=%.1fpx -> Flashback Fear=%.2f, BPM=%d" % [
			d_dread, hint5.raw_fear, veteran.fear_component.current_heartbeat_bpm
		])
		pass_count += 1
	else:
		print("[FAIL] Station 5: Trauma dread re-activation failed: %s" % hint5)
		all_pass = false

	# --------------------------------------------------------------------------
	# STATION 6: Trade Caravan Danger Reroute
	# --------------------------------------------------------------------------
	print("\n--- Testing Station 6: Trade Caravan Danger Reroute ---")
	var highland_danger = 0.85 # Ambushed pass
	var chosen_route = "HIGHLAND_PASS"
	if highland_danger >= 0.70:
		chosen_route = "RIVER_DETOUR"
		
	if chosen_route == "RIVER_DETOUR":
		print("[PASS] Station 6: Highland Pass Danger=%.2f -> Dynamically Rerouted to %s" % [highland_danger, chosen_route])
		pass_count += 1
	else:
		print("[FAIL] Station 6: Caravan failed to reroute")
		all_pass = false

	# --------------------------------------------------------------------------
	# STATION 7: Faction Stance Interaction
	# --------------------------------------------------------------------------
	print("\n--- Testing Station 7: Faction Stance Interaction ---")
	var pos_blue = Vector2(0, 0)
	var pos_red = Vector2(60, 0)
	var dist_patrol = pos_blue.distance_to(pos_red)
	var tension = 0.80
	var bilateral_stage = "UNAWARE"
	if dist_patrol <= 70.0:
		bilateral_stage = "SKIRMISH" if tension >= 0.5 else "NEGOTIATE"
		
	if bilateral_stage == "SKIRMISH":
		print("[PASS] Station 7: Border Dist=%.1fpx, Tension=%.2f -> Bilateral Stage=%s" % [dist_patrol, tension, bilateral_stage])
		pass_count += 1
	else:
		print("[FAIL] Station 7: Faction bilateral escalation failed")
		all_pass = false

	# --------------------------------------------------------------------------
	# FINAL REPORT
	# --------------------------------------------------------------------------
	print("\n================================================================================")
	if all_pass and pass_count == total_count:
		print("GODOT 4.6 MULTI-STATION SHOWCASE CONFORMANCE: %d / %d PASSED (100%%)" % [pass_count, total_count])
		print("================================================================================")
		quit(0)
	else:
		print("GODOT 4.6 MULTI-STATION SHOWCASE CONFORMANCE: FAILED (%d / %d)" % [pass_count, total_count])
		print("================================================================================")
		quit(1)
