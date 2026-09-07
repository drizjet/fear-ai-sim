extends SceneTree

const GODOT_CONFORMANCE_VERSION = "1.0.0"

func _init() -> void:
	print("================================================================================")
	print("       REAL GODOT 4.6 ENGINE: CANONICAL SCENARIO CONFORMANCE RUNNER             ")
	print("================================================================================")
	print("Godot Engine Version: ", Engine.get_version_info()["string"])
	
	var http = HTTPClient.new()
	var err = http.connect_to_host("127.0.0.1", 8765)
	if err != OK:
		print("[FAIL] Could not initiate connection to FearServer: ", err)
		quit(1)
		return
		
	var timeout = 0
	while http.get_status() == HTTPClient.STATUS_CONNECTING or http.get_status() == HTTPClient.STATUS_RESOLVING:
		http.poll()
		OS.delay_msec(10)
		timeout += 1
		if timeout > 300:
			print("[FAIL] Connection timed out waiting for FearServer on 127.0.0.1:8765")
			quit(1)
			return
			
	if http.get_status() != HTTPClient.STATUS_CONNECTED:
		print("[FAIL] HTTPClient failed to connect. Status: ", http.get_status())
		quit(1)
		return
		
	print("[PASS] Godot 4 connected to FearServer on 127.0.0.1:8765")
	
	# Handshake
	var handshake_res = post_json(http, "/api/v1/handshake", {
		"client_name": "Godot4ConformanceRunner",
		"protocol_version": "1.0.0",
		"engine": "Godot4.6"
	})
	if handshake_res.get("status") != "ACCEPTED":
		print("[FAIL] Handshake rejected: ", handshake_res)
		quit(1)
		return
	print("[PASS] Handshake accepted by FearServer.")
	
	var passed = 0
	var total = 0
	
	# --------------------------------------------------------------------------
	# Fixture 1: Calm Baseline (calm.json)
	# --------------------------------------------------------------------------
	total += 1
	print("\n--- Testing Fixture 1: Calm Baseline (calm.json) ---")
	post_json(http, "/api/v1/reset", { "clear_agents": true })
	var fix1 = load_json_file("../../packages/protocol/fixtures/calm.json")
	for ag in fix1["agents"]:
		post_json(http, "/api/v1/register", { "agent_id": ag["id"], "traits": ag["personality"], "initial_position": ag["position"] })
		
	var last_r1 = null
	for t in range(fix1["total_ticks"]):
		var obs_list = []
		for item in fix1["stimuli_timeline"]:
			if t >= item["from_tick"] and t <= item["to_tick"]:
				for ag_id in item["observations"].keys():
					var obs = item["observations"][ag_id].duplicate()
					obs["agent_id"] = ag_id
					obs_list.append(obs)
		var tick_res = post_json(http, "/api/v1/tick", { "dt": fix1["dt"], "observations": obs_list })
		for r in tick_res.get("results", []):
			if r.get("agent_id") == "agent_calm":
				last_r1 = r
				
	if last_r1 == null:
		print("[FAIL] Fixture 1: Missing result for agent_calm")
		quit(1)
		return
	var band1 = last_r1.get("fear_band")
	var arousal1 = last_r1.get("affective_state", {}).get("arousal", 1.0)
	var intent1 = last_r1.get("action_intent", {}).get("type")
	var exp_band1 = fix1["assertions"]["agent_calm"]["fear_band"]
	var max_arousal1 = fix1["assertions"]["agent_calm"]["arousal_max"]
	var exp_intent1 = fix1["assertions"]["agent_calm"]["intent_type"]
	
	if band1 == exp_band1 and arousal1 < max_arousal1 and intent1 == exp_intent1:
		print("[PASS] Fixture 1 calm.json verified: Band=%s, Arousal=%.4f (< %.2f), Intent=%s" % [band1, arousal1, max_arousal1, intent1])
		passed += 1
	else:
		print("[FAIL] Fixture 1 assertion mismatch: Band=%s vs %s, Arousal=%.4f, Intent=%s vs %s" % [band1, exp_band1, arousal1, intent1, exp_intent1])
		quit(1)
		return

	# --------------------------------------------------------------------------
	# Fixture 2: Sudden Threat Escalation (sudden-threat.json)
	# --------------------------------------------------------------------------
	total += 1
	print("\n--- Testing Fixture 2: Sudden Threat Escalation (sudden-threat.json) ---")
	post_json(http, "/api/v1/reset", { "clear_agents": true })
	var fix2 = load_json_file("../../packages/protocol/fixtures/sudden-threat.json")
	for ag in fix2["agents"]:
		post_json(http, "/api/v1/register", { "agent_id": ag["id"], "traits": ag["personality"], "initial_position": ag["position"] })
		
	var last_r2 = null
	for t in range(fix2["total_ticks"]):
		var obs_list = []
		for item in fix2["stimuli_timeline"]:
			if t >= item["from_tick"] and t <= item["to_tick"]:
				for ag_id in item["observations"].keys():
					var obs = item["observations"][ag_id].duplicate()
					obs["agent_id"] = ag_id
					obs_list.append(obs)
		var tick_res = post_json(http, "/api/v1/tick", { "dt": fix2["dt"], "observations": obs_list })
		for r in tick_res.get("results", []):
			if r.get("agent_id") == "agent_escalate":
				last_r2 = r
				
	var band2 = last_r2.get("fear_band")
	var intent2 = last_r2.get("action_intent", {}).get("type")
	var urgency2 = last_r2.get("action_intent", {}).get("urgency", 0.0)
	var bpm2 = last_r2.get("audio_hints", {}).get("heartbeat_bpm", 0)
	var exp_band2 = fix2["assertions"]["agent_escalate"]["fear_band"]
	var exp_intent2 = fix2["assertions"]["agent_escalate"]["intent_type"]
	var min_urgency2 = fix2["assertions"]["agent_escalate"]["urgency_min"]
	var min_bpm2 = fix2["assertions"]["agent_escalate"]["heartbeat_bpm_min"]
	
	if band2 == exp_band2 and intent2 == exp_intent2 and urgency2 > min_urgency2 and bpm2 > min_bpm2:
		print("[PASS] Fixture 2 sudden-threat.json verified: Band=%s, Intent=%s, Urgency=%.2f, Heartbeat=%dBPM" % [band2, intent2, urgency2, bpm2])
		passed += 1
	else:
		print("[FAIL] Fixture 2 assertion mismatch: Band=%s vs %s, Intent=%s, Urgency=%.2f, BPM=%d" % [band2, exp_band2, intent2, urgency2, bpm2])
		quit(1)
		return

	# --------------------------------------------------------------------------
	# Fixture 7: Spatial Trauma Memory Dread (trauma.json)
	# --------------------------------------------------------------------------
	total += 1
	print("\n--- Testing Fixture 7: Spatial Trauma Memory Dread (trauma.json) ---")
	post_json(http, "/api/v1/reset", { "clear_agents": true })
	var fix7 = load_json_file("../../packages/protocol/fixtures/trauma.json")
	for tz in fix7.get("trauma_zones", []):
		post_json(http, "/api/v1/trauma", {
			"x": tz["x"], "y": tz["y"], "z": tz.get("z", 0),
			"intensity": tz["intensity"], "radius": tz["radius"], "lifetimeTicks": tz["decay"]
		})
	for ag in fix7["agents"]:
		post_json(http, "/api/v1/register", { "agent_id": ag["id"], "traits": ag["personality"], "initial_position": ag["position"] })
		
	var last_r7 = null
	for t in range(fix7["total_ticks"]):
		var tick_res = post_json(http, "/api/v1/tick", { "dt": fix7["dt"], "observations": [] })
		for r in tick_res.get("results", []):
			if r.get("agent_id") == "wanderer":
				last_r7 = r
				
	var fear7 = last_r7.get("affective_state", {}).get("raw_fear", 0.0)
	var band7 = last_r7.get("fear_band")
	var min_fear7 = fix7["assertions"]["wanderer"]["fear_min"]
	var valid_bands7 = fix7["assertions"]["wanderer"]["fear_band_options"]
	
	if fear7 > min_fear7 and band7 in valid_bands7:
		print("[PASS] Fixture 7 trauma.json verified: RawFear=%.4f (> %.2f), Band=%s" % [fear7, min_fear7, band7])
		passed += 1
	else:
		print("[FAIL] Fixture 7 assertion mismatch: RawFear=%.4f, Band=%s" % [fear7, band7])
		quit(1)
		return

	# --------------------------------------------------------------------------
	# Fixture 8: Snapshot Save/Load Restoration (save-load.json)
	# --------------------------------------------------------------------------
	total += 1
	print("\n--- Testing Fixture 8: Snapshot Save/Load Continuity (save-load.json) ---")
	post_json(http, "/api/v1/reset", { "clear_agents": true })
	var fix8 = load_json_file("../../packages/protocol/fixtures/save-load.json")
	for ag in fix8["agents"]:
		post_json(http, "/api/v1/register", { "agent_id": ag["id"], "traits": ag["personality"], "initial_position": ag["position"] })
		
	var saved_snap = null
	var res8 = {}
	for t in range(fix8["total_ticks"]):
		var obs_list = []
		for item in fix8["stimuli_timeline"]:
			if t >= item["from_tick"] and t <= item["to_tick"]:
				for ag_id in item["observations"].keys():
					var obs = item["observations"][ag_id].duplicate()
					obs["agent_id"] = ag_id
					obs_list.append(obs)
		res8 = post_json(http, "/api/v1/tick", { "dt": fix8["dt"], "observations": obs_list })
		if t == fix8["save_at_tick"]:
			var save_res = post_json(http, "/api/v1/save", {})
			saved_snap = save_res.get("snapshot")
			
	var baseline_fear = 0.0
	for r in res8.get("results", []):
		if r.get("agent_id") == "surv_01":
			baseline_fear = r.get("affective_state", {}).get("raw_fear", 0.0)
			
	# Restore checkpoint
	post_json(http, "/api/v1/reset", { "clear_agents": true })
	post_json(http, "/api/v1/load", { "snapshot": saved_snap })
	for t in range(fix8["save_at_tick"] + 1, fix8["total_ticks"]):
		var obs_list = []
		for item in fix8["stimuli_timeline"]:
			if t >= item["from_tick"] and t <= item["to_tick"]:
				for ag_id in item["observations"].keys():
					var obs = item["observations"][ag_id].duplicate()
					obs["agent_id"] = ag_id
					obs_list.append(obs)
		res8 = post_json(http, "/api/v1/tick", { "dt": fix8["dt"], "observations": obs_list })
		
	var restored_fear = 0.0
	for r in res8.get("results", []):
		if r.get("agent_id") == "surv_01":
			restored_fear = r.get("affective_state", {}).get("raw_fear", 0.0)
			
	var delta = abs(restored_fear - baseline_fear)
	if delta < 0.001:
		print("[PASS] Fixture 8 save-load.json verified: Baseline=%.6f, Restored=%.6f, Delta=%.6f (< 0.001)" % [baseline_fear, restored_fear, delta])
		passed += 1
	else:
		print("[FAIL] Fixture 8 restore delta exceeded tolerance: Delta=%.6f" % delta)
		quit(1)
		return

	print("\n================================================================================")
	print("GODOT 4 CANONICAL CONFORMANCE SUMMARY: %d / %d FIXTURES PASSED (100%%)" % [passed, total])
	print("================================================================================")
	quit(0)

func load_json_file(rel_path: String) -> Dictionary:
	var f = FileAccess.open(rel_path, FileAccess.READ)
	if f == null:
		return {}
	var text = f.get_as_text()
	var json = JSON.parse_string(text)
	if json is Dictionary:
		return json
	return {}

func post_json(http: HTTPClient, path: String, payload: Dictionary) -> Dictionary:
	var body = JSON.stringify(payload)
	var headers = ["Content-Type: application/json"]
	var err = http.request(HTTPClient.METHOD_POST, path, headers, body)
	if err != OK:
		return {}
	while http.get_status() == HTTPClient.STATUS_REQUESTING:
		http.poll()
		OS.delay_msec(1)
	if not http.has_response():
		return {}
	var response_body = PackedByteArray()
	while http.get_status() == HTTPClient.STATUS_BODY:
		http.poll()
		var chunk = http.read_response_body_chunk()
		if chunk.size() > 0:
			response_body.append_array(chunk)
		OS.delay_msec(1)
	var text = response_body.get_string_from_utf8()
	var parsed = JSON.parse_string(text)
	if parsed is Dictionary:
		return parsed
	return {}
