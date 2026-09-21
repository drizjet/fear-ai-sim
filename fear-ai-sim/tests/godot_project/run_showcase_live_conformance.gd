# run_showcase_live_conformance.gd
#
# LIVE-SERVER SHOWCASE CONFORMANCE RUNNER.
#
# Runs the real StationController - the actual showcase scene, all ten stations,
# the actual ShowcaseAgent host logic - against a running FearServer, with every
# agent's appraisal source set to LIVE_SERVER. Nothing falls back to the offline
# canonical core: the band, intent, urgency, vector and heartbeat the stations
# react to are all authored by the server's FearCore/IntentResolver pipeline.
#
# WHY THIS IS SEPARATE FROM run_showcase_conformance.gd
# That runner drives the generated OFFLINE FALLBACK synchronously and needs no
# server, so it can only ever be evidence about the fallback. This one needs a
# server and proves the live path end to end: batched registration under a stable
# session identity, observation batching, server-side habituation, server-side
# contagion, server-side trauma dread authored as a batched zone set, batched
# teardown, and advisory application on the Godot side.
#
# WHAT IT ASSERTS, AND WHAT IT DOES NOT
# It asserts that the advisories the showcase acts on came from the server (the
# per-agent counters make "the fallback was not used" a checkable claim rather
# than an assumption), that the server produced the behaviour the offline
# stations document - escalation, habituation damping, contagion, dread - and
# that the control plane actually batched its work (one request for 28
# registrations, one for three trauma zones, one for a teardown) rather than
# degrading to one round trip per item.
# It does NOT assert rendering, visual fidelity, or host-game equivalence, and
# it does not re-derive the server's numbers: numerical parity between the
# fallback's declared math and FearCore is a separate probe
# (tools/verification/verify_godot_fallback_parity.mjs).
#
# Port: FEAR_AI_PORT wins over the client default, and a non-FearServer process
# answering `{"error":"unauthorised"}` is called out explicitly, because that is
# what a port collision looks like from here.
#
# Hard Rule 9 compliant: standalone deterministic in-engine evidence run, no
# test runner, not wired into `npm test`.

extends SceneTree

const STATION_CONTROLLER = preload("res://station_controller.gd")
const FEAR_AI_CLIENT = preload("res://addons/fear_ai/fear_ai_client.gd")
const FEAR_AGENT_COMPONENT = preload("res://addons/fear_ai/fear_agent.gd")
const SHOWCASE_AGENT = preload("res://showcase_agent.gd")

## Physics frames to wait for one HTTP round trip. Headless unthrottled runs
## make many main-loop iterations per physics tick, so this is generous.
const ROUND_TRIP_FRAMES := 4

var _driver: Node

func _initialize() -> void:
	print("================================================================================")
	print("      REAL GODOT 4.6 ENGINE: LIVE FearServer SHOWCASE PIPELINE CONFORMANCE      ")
	print("================================================================================")
	print("Godot Engine Version: ", Engine.get_version_info()["string"])
	_driver = LivePipelineDriver.new()
	_driver.name = "LivePipelineDriver"
	root.add_child(_driver)


class LivePipelineDriver:
	extends Node

	var tree: SceneTree
	var client: Node
	var controller: Node2D

	var passed: int = 0
	var failed: int = 0
	var _physics_frames: int = 0
	var _done: bool = false

	## Wall-clock-independent safety net: a coroutine that dies from a script
	## error would otherwise leave the engine running forever and the evidence
	## runner waiting on it.
	const WATCHDOG_PHYSICS_FRAMES := 3000

	func _ready() -> void:
		tree = get_tree()
		# Deferred: `_ready()` runs while the tree is still setting up children,
		# and `add_child()` on the root fails from inside that window.
		_run.call_deferred()

	func _physics_process(_delta: float) -> void:
		_physics_frames += 1
		if not _done and _physics_frames > WATCHDOG_PHYSICS_FRAMES:
			_done = true
			print("[FAIL] Watchdog: live pipeline run exceeded ", WATCHDOG_PHYSICS_FRAMES, " physics frames without finishing.")
			tree.quit(1)

	func _finish(code: int) -> void:
		if _done:
			return
		_done = true
		tree.quit(code)

	func _pump(frames: int) -> void:
		for _i in range(maxi(1, frames)):
			await tree.physics_frame

	func _pump_until(predicate: Callable, budget: int) -> bool:
		for _i in range(budget):
			if predicate.call():
				return true
			await tree.physics_frame
		return predicate.call()

	func check(label: String, condition: bool, detail: String = "") -> void:
		if condition:
			passed += 1
			print("[PASS] ", label, (" — " + detail) if detail != "" else "")
		else:
			failed += 1
			print("[FAIL] ", label, (" — " + detail) if detail != "" else "")

	func _run() -> void:
		# ---------------------------------------------------------------------
		# PHASE 0: bring up the live session
		# ---------------------------------------------------------------------
		print("\n--- Phase 0: live session bring-up ---")

		var env_port := OS.get_environment("FEAR_AI_PORT")
		var port := 8765
		if env_port.is_valid_int():
			port = int(env_port)

		client = get_node_or_null("/root/FearAIClient")
		if client == null:
			client = FEAR_AI_CLIENT.new()
			client.name = "FearAIClient"
			get_tree().root.add_child(client)
			# A freshly added client's _ready() has not run yet at this point in
			# some invocations, so make the target explicit as well.
			client.server_host = "127.0.0.1"
			client.server_port = port

		# Deterministic HTTP request/response for the evidence run. The WebSocket
		# transport stays available to hosts; it just is not what an assertion
		# here should ride on.
		client.use_websocket = false
		client.use_binary_wire = false

		var handshake: Dictionary = await _handshake(port)
		var status := str(handshake.get("status", ""))
		if status != "ACCEPTED":
			print("[FAIL] Could not establish a live FearServer session on 127.0.0.1:", port)
			if str(handshake.get("error", "")) != "":
				print("       server said: ", handshake)
				print("       [HINT] A non-FearServer process may be holding port ", port,
					". Set FEAR_AI_PORT to a free port and start a FearServer there.")
			print("\n============================================================")
			print("LIVE PIPELINE CONFORMANCE: ABORTED — no live session, so no live evidence.")
			print("============================================================")
			_finish(1)
			return
		print("[OK] Live FearServer session established on 127.0.0.1:", port)
		passed += 1

		# Clean session: the server keeps agent state between runs, so a stale
		# registration would carry stale fear into this run's assertions.
		client.reset_server(true)

		# The station controller is the real showcase, constructed exactly as the
		# interactive scene constructs it, with LIVE_SERVER configured before its
		# `_ready()` builds the station agents.
		controller = STATION_CONTROLLER.new()
		controller.name = "StationController"
		controller.configure_appraisal_source(FEAR_AGENT_COMPONENT.AppraisalSource.LIVE_SERVER)
		get_tree().root.add_child(controller)

		# A failed attach would make every later assertion read from `null`,
		# so abort loudly instead of cascading nil errors.
		if not is_instance_valid(controller) or controller.get_parent() == null:
			print("[FAIL] Could not attach the showcase station controller to the scene tree.")
			_finish(1)
			return

		# Give the control plane time to flush the reset and the first
		# registrations before any assertion depends on the data plane.
		await _pump(8)

		var agents: Array = controller._all_agents()
		check("Showcase constructed every station agent in live mode", agents.size() >= 20,
			"%d agents" % agents.size())
		var all_live := true
		for ag in agents:
			if not ag.is_live():
				all_live = false
		check("Every station agent appraises through the live server", all_live)

		# ---------------------------------------------------------------------
		# PHASE 1: registration actually happened
		# ---------------------------------------------------------------------
		print("\n--- Phase 1: client control plane (registration) ---")
		# The server drops observations for unregistered agents, so a registration
		# failure here reads as "the middleware returned nothing" at the far end.
		# Budget: registration goes out in batched control round trips, so a
		# 28-agent showcase needs a few frames per batch plus the reset.
		var registered: bool = await _pump_until(
			func() -> bool: return client.registered_count() >= agents.size() and client.control_plane_idle(),
			300)
		check("Client registered every station agent before the data plane flowed", registered,
			"registered=%d expected=%d failures=%d" % [client.registered_count(), agents.size(), client.registration_failures])
		check("No registration failed", client.registration_failures == 0,
			"failures=%d" % client.registration_failures)
		check("No observation was dropped for an unregistered agent",
			client.dropped_unregistered_observations == 0,
			"dropped=%d" % client.dropped_unregistered_observations)

		# Batching is the point of the /api/v1/register/batch route: a host with
		# dozens of agents must not spend one round trip per agent. Both counters
		# are asserted so "it was batched" is measured, not assumed.
		var individual_calls: int = client.individual_registration_requests
		var batch_calls: int = client.batched_registration_requests
		check("Registration used the batch route, not one request per agent",
			batch_calls >= 1,
			"batched_requests=%d" % batch_calls)
		check("Batch route was supported by this server",
			not client.batch_registration_unsupported,
			"batch_unsupported=%s" % str(client.batch_registration_unsupported))
		check("Batch registration cut control round trips well below the agent count",
			batch_calls + individual_calls < agents.size(),
			"requests=%d (batched=%d individual=%d) agents=%d" % [
				batch_calls + individual_calls, batch_calls, individual_calls, agents.size()])

		# ---------------------------------------------------------------------
		# PHASE 2: station 1 — acute threat appraisal on the server
		# ---------------------------------------------------------------------
		print("\n--- Phase 2: Station 1 acute threat appraisal (server-authored) ---")
		var scout: Node2D = controller.s1_scout
		controller.trigger_station_1_approach()
		var escalated: bool = await _pump_until(
			func() -> bool: return scout.fear_component.current_raw_fear > 0.25 and scout.fear_component.live_state_applications > 0,
			100)
		check("Scout escalated on a server-authored advisory", escalated,
			"applications=%d submissions=%d raw_fear=%.3f" % [scout.fear_component.live_state_applications, scout.fear_component.live_submissions, scout.fear_component.current_raw_fear])
		check("Scout did NOT evaluate the offline fallback",
			scout.fear_component.local_evaluations == 0,
			"local_evaluations=%d" % scout.fear_component.local_evaluations)

		var scout_band: String = scout.fear_component.current_fear_band
		var scout_intent: String = scout.fear_component.current_intent
		var canonical_bands := ["CALM", "ALERT", "ANXIOUS", "PANIC"]
		check("Server band is canonical vocabulary", canonical_bands.has(scout_band),
			"band=%s intent=%s" % [scout_band, scout_intent])
		check("Server band escalated above CALM for an approaching predator",
			scout_band != "CALM", "band=%s raw_fear=%.3f" % [scout_band, scout.fear_component.current_raw_fear])
		check("Server advisory landed on the agent's own advisory surface",
			scout_intent != "" and scout.fear_component.current_urgency >= 0.0,
			"intent=%s urgency=%.3f" % [scout_intent, scout.fear_component.current_urgency])
		check("Agent still reports advisory-only movement",
			bool(scout.fear_component.get_movement_hint().get("advisory_only", false)))

		# ---------------------------------------------------------------------
		# PHASE 3: station 2 — the sound channel, and a MEASURED divergence
		# ---------------------------------------------------------------------
		# A sound-only observation cannot build fear on the server. AffectiveAgent
		# gates a sound-only tick on `fearInput > 0.15` and scales perceived threat
		# by the DDA pacing intensity, which sits at 0.2 in the EXPOSITION phase, so
		# the strongest possible sound (habituated 1.0 x attenuation 1.0 x the 0.6
		# sound weight) still lands far below the gate. The offline fallback has no
		# pacing filter and no 0.6 sound weight, so it reports real fear for the
		# identical stimulus. That is a real behavioural difference, and the honest
		# thing is to MEASURE it in the same run rather than paper over it.
		print("\n--- Phase 3: Station 2 sound channel (server gating vs fallback) ---")
		controller.reset_station_2()
		await _pump(6)
		var sentry: Node2D = controller.s2_sentry
		var sound_stimulus: Array = [{ "id": "sound_pulse", "type": "SOUND", "intensity": 0.85, "distance": 30.0, "x": sentry.global_position.x + 50, "y": sentry.global_position.y }]
		var server_fears: Array[float] = []
		for i in range(4):
			sentry.set_perceived_stimuli(sound_stimulus)
			await _pump(ROUND_TRIP_FRAMES)
			server_fears.append(sentry.fear_component.current_raw_fear)
		check("Sentry appraised through the server for every burst",
			sentry.fear_component.live_submissions >= 4 and sentry.fear_component.local_evaluations == 0,
			"submissions=%d local=%d" % [sentry.fear_component.live_submissions, sentry.fear_component.local_evaluations])
		var server_peak: float = 0.0
		for f in server_fears:
			server_peak = maxf(server_peak, f)
		check("Server keeps a sound-only observation informational (no fear build)",
			server_peak <= 0.05,
			"peak=%.4f over 4 bursts" % server_peak)

		# Same stimulus, same engine, same frame - only the appraisal source differs.
		var probe := SHOWCASE_AGENT.new()
		probe.name = "SoundDivergenceProbe"
		probe.agent_name = "Sound Probe"
		get_tree().root.add_child(probe)
		probe.fear_component.evaluate_local(sound_stimulus, 0.0, 0.0, 1)
		var fallback_fear: float = probe.fear_component.current_raw_fear
		probe.queue_free()
		check("Fallback and server diverge on a sound-only stimulus, and the difference is quantified",
			fallback_fear > server_peak,
			"fallback=%.4f server=%.4f (recorded in the ledger, not silent)" % [fallback_fear, server_peak])

		# ---------------------------------------------------------------------
		# PHASE 4: station 3 — contagion cascade on the server
		# ---------------------------------------------------------------------
		print("\n--- Phase 4: Station 3 crowd panic cascade (server contagion) ---")
		controller.reset_station_3()
		await _pump(6)
		controller.trigger_station_3_panic()
		var civilians: Array = controller.s3_civilians
		# Peak tracking, not the end state: the agitator is only held under the
		# seed while the station keeps publishing it, and server fear decays fast
		# once the stimulus stops. A cascade that happened and then subsided is
		# still a cascade.
		var peaks: Array[float] = []
		for _c in range(civilians.size()):
			peaks.append(0.0)
		for _frame in range(200):
			for ci in range(civilians.size()):
				peaks[ci] = maxf(peaks[ci], civilians[ci].fear_component.current_raw_fear)
			await _pump(1)
		var elevated := 0
		var cascaded_peers := 0
		for ci in range(civilians.size()):
			if peaks[ci] > 0.25:
				elevated += 1
			if ci > 0 and peaks[ci] > 0.25:
				cascaded_peers += 1
		check("Agitator reached PANIC under sustained live stimulus", peaks[0] >= 0.70,
			"agitator peak=%.3f" % peaks[0])
		check("Server contagion dragged neighbours above CALM", cascaded_peers >= 2,
			"peaks=[%s]" % _format_peaks(peaks))
		var civ_local := 0
		var civ_live := 0
		for civ in civilians:
			civ_local += civ.fear_component.local_evaluations
			civ_live += civ.fear_component.live_state_applications
		check("Cascade was computed by the server, not the fallback",
			civ_local == 0 and civ_live > 0,
			"local=%d server_applications=%d" % [civ_local, civ_live])

		# ---------------------------------------------------------------------
		# PHASE 5: station 5 — trauma dread from a server-owned trauma zone
		# ---------------------------------------------------------------------
		print("\n--- Phase 5: Station 5 trauma dread (server-owned zone) ---")
		controller.reset_station_5()
		await _pump(6)
		var center: Vector2 = controller.s5_dread_center
		# Three zones queued in one frame, to prove the batch really carries a set
		# and not just a single zone dressed up as a batch of one.
		client.add_trauma_zones([
			{ "x": center.x, "y": center.y, "intensity": 1.0, "radius": 140.0, "lifetimeTicks": 1800 },
			{ "x": center.x + 24.0, "y": center.y, "intensity": 0.6, "radius": 120.0, "lifetimeTicks": 1800 },
			{ "x": center.x - 24.0, "y": center.y, "intensity": 0.6, "radius": 120.0, "lifetimeTicks": 1800 }
		])
		await _pump(6)
		check("Host authored trauma zones on the server in one batched request",
			client.trauma_zones_added >= 3 and client.batched_trauma_requests >= 1,
			"added=%d batched_requests=%d rejected=%d" % [
				client.trauma_zones_added, client.batched_trauma_requests, client.trauma_zones_rejected])
		controller.trigger_station_5_march_into_trauma()
		var veteran: Node2D = controller.s5_veteran
		var dread: bool = await _pump_until(
			func() -> bool: return veteran.fear_component.current_raw_fear > 0.25,
			120)
		check("Veteran caught dread from the server's trauma memory", dread,
			"raw_fear=%.3f band=%s" % [veteran.fear_component.current_raw_fear, veteran.fear_component.current_fear_band])
		# The fallback's `trauma_presence` term has no observation channel, so a
		# station that publishes it in live mode must show up here rather than
		# having the channel quietly discarded.
		check("Local-only dread channel is recorded, not silently dropped",
			veteran.fear_component.live_ignored_local_channels.has("trauma_presence"),
			"ignored=%s" % [veteran.fear_component.live_ignored_local_channels])

		# ---------------------------------------------------------------------
		# PHASE 6: whole-showcase pipeline integrity
		# ---------------------------------------------------------------------
		print("\n--- Phase 6: whole-showcase pipeline integrity ---")
		await _pump(10)
		var total_local := 0
		var total_live := 0
		var agents_without_server_state: Array[String] = []
		for ag in controller._all_agents():
			total_local += ag.fear_component.local_evaluations
			total_live += ag.fear_component.live_state_applications
			if ag.fear_component.live_state_applications == 0:
				agents_without_server_state.append(str(ag.agent_name))
		check("No agent anywhere in the showcase used the offline fallback",
			total_local == 0,
			"local_evaluations=%d" % total_local)
		check("Every showcase agent received at least one server advisory",
			agents_without_server_state.is_empty(),
			"missing=[%s]" % ", ".join(agents_without_server_state))
		check("Server advisories reached the showcase in volume (>= 100 applications)",
			total_live >= 100, "applications=%d" % total_live)
		check("No agent reported the live session as unavailable",
			not _any_live_unavailable(),
			"live_unavailable agents=[]" if not _any_live_unavailable() else "at least one agent could not reach the client")
		check("Observation drops stayed at zero across the whole run",
			client.dropped_unregistered_observations == 0,
			"dropped=%d" % client.dropped_unregistered_observations)
		check("Registration count matches the showcase's agent count",
			client.registered_count() >= controller._all_agents().size(),
			"registered=%d agents=%d" % [client.registered_count(), controller._all_agents().size()])

		# ---------------------------------------------------------------------
		# PHASE 7: session identity, batched teardown, batched trauma
		# ---------------------------------------------------------------------
		# Runs LAST, and against a throwaway agent, so retiring it cannot disturb
		# the station assertions above or the zero-drop count they measured.
		print("\n--- Phase 7: session identity and batched control plane ---")
		check("Client carries a stable session identity",
			not client.session_id.is_empty(),
			"session_id=%s claim=%s" % [client.session_id, client.claim_mode])
		# The name alone is not a credential; the server-issued token is. If it was
		# never received, this host can only ever claim by name and would be refused
		# against any live session - including its own after a reconnect.
		check("Server issued this host a session token",
			client.session_token_issued and not client.session_token.is_empty(),
			"issued=%s token_len=%d" % [str(client.session_token_issued), client.session_token.length()])
		check("No registration was refused by a competing live session",
			client.refused_claims == 0,
			"refused=%d" % client.refused_claims)
		check("Trauma zones went to the server batched, not one request each",
			client.batched_trauma_requests >= 1,
			"batched_trauma_requests=%d zones_added=%d rejected=%d" % [
				client.batched_trauma_requests, client.trauma_zones_added, client.trauma_zones_rejected])
		check("No legacy control fallback was needed",
			not client.batch_control_unsupported,
			"batch_control_unsupported=%s" % str(client.batch_control_unsupported))

		var probe_id := "teardown_probe"
		client.ensure_registered(probe_id, { "neuroticism": 0.3 })
		var probe_up: bool = await _pump_until(
			func() -> bool: return client.is_agent_registered(probe_id),
			40)
		check("Throwaway agent registered for the teardown check", probe_up, "id=%s" % probe_id)
		client.ensure_unregistered(probe_id)
		var probe_down: bool = await _pump_until(
			func() -> bool: return client.batched_unregistration_requests >= 1 and not client.is_agent_registered(probe_id),
			40)
		check("Batch teardown removed the agent in one request", probe_down,
			"batched_unregistration_requests=%d individual=%d still_registered=%s" % [
				client.batched_unregistration_requests, client.individual_unregistration_requests,
				str(client.is_agent_registered(probe_id))])
		check("Teardown used no individual unregister requests",
			client.individual_unregistration_requests == 0,
			"individual=%d" % client.individual_unregistration_requests)

		_print_agent_table()

		print("\n================================================================================")
		if failed == 0:
			print("GODOT 4.6 LIVE-SERVER SHOWCASE PIPELINE CONFORMANCE: %d / %d ASSERTIONS PASSED (100%%)" % [passed, passed + failed])
			print("Scope: live server-authored advisories only. No rendering claim.")
			_finish(0)
		else:
			print("GODOT 4.6 LIVE-SERVER SHOWCASE PIPELINE CONFORMANCE: %d passed, %d FAILED" % [passed, failed])
			_finish(1)
		print("================================================================================\n")

	func _format_peaks(peaks: Array) -> String:
		var parts: Array[String] = []
		for p in peaks:
			parts.append("%.2f" % float(p))
		return ", ".join(parts)

	func _any_live_unavailable() -> bool:
		for ag in controller._all_agents():
			if ag.fear_component.live_unavailable:
				return true
		return false

	func _print_agent_table() -> void:
		print("\n  Live pipeline per agent (server-applied advisories):")
		for ag in controller._all_agents():
			var fc = ag.fear_component
			print("    %-20s band=%-8s intent=%-18s fear=%.3f applications=%d submissions=%d local=%d" % [
				str(ag.agent_name), fc.current_fear_band, fc.current_intent,
				fc.current_raw_fear, fc.live_state_applications, fc.live_submissions, fc.local_evaluations
			])

	## Blocking HTTP handshake so a wrong port produces a clear diagnostic instead
	## of an ambiguous "no advisories arrived" later.
	func _handshake(port: int) -> Dictionary:
		var http := HTTPClient.new()
		var err := http.connect_to_host("127.0.0.1", port)
		if err != OK:
			return { "error": "connect_error_%d" % err }
		var timeout := 0
		while http.get_status() == HTTPClient.STATUS_CONNECTING or http.get_status() == HTTPClient.STATUS_RESOLVING:
			http.poll()
			OS.delay_msec(10)
			timeout += 1
			if timeout > 300:
				return { "error": "connect_timeout" }
		if http.get_status() != HTTPClient.STATUS_CONNECTED:
			return { "error": "status_%d" % http.get_status() }
		var body := JSON.stringify({
			"client_name": "Godot4LiveShowcaseConformance",
			"protocol_version": "1.0.0",
			"engine": "Godot4.6"
		})
		if http.request(HTTPClient.METHOD_POST, "/api/v1/handshake", ["Content-Type: application/json"], body) != OK:
			return { "error": "request_rejected" }
		while http.get_status() == HTTPClient.STATUS_REQUESTING:
			http.poll()
			OS.delay_msec(1)
		if not http.has_response():
			return { "error": "no_response" }
		var chunks := PackedByteArray()
		while http.get_status() == HTTPClient.STATUS_BODY:
			http.poll()
			var chunk := http.read_response_body_chunk()
			if chunk.size() > 0:
				chunks.append_array(chunk)
			OS.delay_msec(1)
		var parsed = JSON.parse_string(chunks.get_string_from_utf8())
		if parsed is Dictionary:
			return parsed
		return { "error": "unparseable_response" }
