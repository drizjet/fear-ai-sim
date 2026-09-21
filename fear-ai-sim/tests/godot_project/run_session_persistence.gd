# run_session_persistence.gd
#
# CROSS-PROCESS SESSION CONTINUITY, IN ENGINE.
#
# WHY THIS EXISTS AND WHY IT NEEDS TWO PROCESSES
# The token model was verified from Node probes, which can prove that a token is
# accepted. They cannot prove the thing a HOST actually has to do: keep the
# credential somewhere that outlives its own process, and load it before the first
# claim of the next run. A host that loses its token is not broken - it adopts its
# own name once the previous session is not live - but it comes back as a stranger
# to its crowd, and every claim it makes in that state is an `ADOPTED` rather than
# a `GRANTED`. Only a real second process can tell those apart, so this script is
# designed to be run TWICE, against the same store, by
# `tools/verification/verify_host_token_persistence.mjs`.
#
# FOUR PHASES, ONE PER PROCESS (or per server lifetime)
#   --phase=1  fresh store: claim a crowd, get a token, and write it down. The
#              store must come out ENCRYPTED, must not contain the credential or
#              the private key, and its keyring must not sit in the store's own
#              directory - otherwise a backup of the save tree carries both halves.
#   --phase=2  NEW process, same store, SAME server: the loaded token must produce
#              a GRANTED claim rather than an adoption, and a tokenless rival must
#              still be refused the live owner's agents - a credential that made
#              everyone trust everyone would be worse than no credential.
#   --phase=3  NEW process, same store, server RESTARTED and reloaded from a
#              snapshot: the credential was issued in a previous server process
#              and hashed at rest, and must still prove continuity. The companion
#              assertions are that ownership did NOT get promoted to liveness (a
#              tokenless claim on the unbound restored session is ADOPTED) and
#              that the reset gate refuses an honest host a wipe that would
#              destroy another live session's agent, then allows it once nothing
#              live is in the way.
#   --phase=5  NO server. The SIGNING KEY at rest, which is the half that matters
#              most: a private key left readable on disk makes the `required`
#              signing policy pointless against whoever has the file. The key is
#              written through the encrypted store, must not be readable in it, and
#              must come back VERBATIM in a second client standing for the restart.
#   --phase=4  NO server. The upgrade path: an older build left a PLAINTEXT store,
#              this process reads it (reported as PLAINTEXT_LEGACY, not silently
#              accepted), and the ordinary `save_session()` that runs on the next
#              credential issue rewrites it encrypted in place. In-place is the
#              point - a migration that needed a separate tool would mean real
#              hosts stay readable on disk until they run it.
#
# WHAT IT DOES NOT CLAIM
# Not rendering, not host-game equivalence, and NOT that the store is safe on a
# shared machine. Encryption removes a leaked FILE as a way in; it does not remove
# a leaked MACHINE, because anyone who can read both the store and the keyring can
# decrypt it. What phase 1 asserts is narrower and checkable: the credential and
# the private key are not in the file, and the key is not in the file's tree.
#
# Hard Rule 9 compliant: standalone deterministic in-engine run, no test runner,
# not wired into `npm test`.
#
# Usage:
#   godot --path . --headless --script run_session_persistence.gd -- --phase=1 --store=C:/tmp/session.json
# FEAR_AI_PORT selects the server, exactly as the other runners do.

extends SceneTree

const FEAR_AI_CLIENT = preload("res://addons/fear_ai/fear_ai_client.gd")

## The crowd this host owns. Fixed rather than generated: phase 2 has to claim the
## SAME ids phase 1 left behind, or it would be proving nothing.
const AGENTS := ["persist_alpha", "persist_beta", "persist_gamma"]
const HOST_SESSION_ID := "godot_persist_host"
const RIVAL_SESSION_ID := "godot_persist_rival"

var _driver: Node


func _initialize() -> void:
	print("================================================================================")
	print("     GODOT 4.6 IN-ENGINE: SESSION CONTINUITY ACROSS A HOST PROCESS RESTART      ")
	print("================================================================================")
	print("Godot Engine Version: ", Engine.get_version_info()["string"])

	var phase := 0
	var store := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--phase="):
			phase = int(arg.substr("--phase=".length()))
		elif arg.begins_with("--store="):
			store = arg.substr("--store=".length())

	if phase < 1 or phase > 5:
		print("[FAIL] --phase must be 1, 2, 3, 4 or 5 (got ", phase, ")")
		quit(1)
		return
	if store.strip_edges().is_empty():
		print("[FAIL] --store=<absolute path> is required; the whole run is about one store")
		quit(1)
		return

	_driver = PersistenceDriver.new()
	_driver.name = "PersistenceDriver"
	_driver.phase = phase
	_driver.store_path = store
	root.add_child(_driver)


class PersistenceDriver:
	extends Node

	## Generous: headless unthrottled runs take many main-loop iterations per
	## physics tick, and every step here is an HTTP round trip.
	const ROUND_TRIP_FRAMES := 8
	## Wall-clock-independent safety net: a coroutine killed by a script error
	## would otherwise leave the engine running and the evidence runner waiting.
	const WATCHDOG_PHYSICS_FRAMES := 6000

	var phase: int = 1
	var store_path: String = ""
	var tree: SceneTree
	var client: Node
	var rival: Node
	var passed: int = 0
	var failed: int = 0
	var _physics_frames: int = 0
	var _done: bool = false

	func _ready() -> void:
		tree = get_tree()
		# Deferred: `_ready()` runs while the tree is still setting up children.
		_run.call_deferred()

	func _physics_process(_delta: float) -> void:
		_physics_frames += 1
		if not _done and _physics_frames > WATCHDOG_PHYSICS_FRAMES:
			_done = true
			print("[FAIL] Watchdog: phase ", phase, " exceeded ", WATCHDOG_PHYSICS_FRAMES, " physics frames.")
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

	## A client that is NOT an autoload: built, configured and added by hand, so a
	## single phase can run an owner and a rival side by side in one process.
	func _make_client(session_id: String, persisted: bool, suffix: String = "") -> Node:
		var c = FEAR_AI_CLIENT.new()
		# A distinct node name, or two clients standing for the SAME host in one
		# process collide in the tree and Godot silently renames the second one.
		c.name = "FearAIClient_" + session_id + suffix
		c.server_host = "127.0.0.1"
		# The data plane is not under test here: the control plane is HTTP either
		# way, so a socket would only add scheduling noise to a deterministic run.
		c.use_websocket = false
		c.session_id = session_id
		c.persist_session = persisted
		c.session_store_path = store_path
		return c

	func _settle(node: Node, extra: int = 0) -> void:
		await _pump_until(func(): return node.control_plane_idle(), 300)
		if extra > 0:
			await _pump(extra)

	func check(label: String, condition: bool, detail: String = "") -> void:
		if condition:
			passed += 1
			print("  [PASS] ", label)
		else:
			failed += 1
			print("  [FAIL] ", label, (" — " + detail) if not detail.is_empty() else "")

	func _report() -> void:
		print("--------------------------------------------------------------------------------")
		print("PHASE ", phase, " SUMMARY: ", passed, " passed, ", failed, " failed")
		if failed == 0:
			print("PERSIST_PHASE_", phase, "=PASSED")
			_finish(0)
		else:
			print("PERSIST_PHASE_", phase, "=FAILED")
			_finish(1)

	func _run() -> void:
		match phase:
			1:
				await _phase_first_claim()
			2:
				await _phase_reclaim()
			3:
				await _phase_after_server_restart()
			4:
				await _phase_legacy_upgrade()
			5:
				await _phase_signing_key_at_rest()
		_report()

	# -------------------------------------------------------------------------
	# Phase 1 — a brand new host: claim, receive a credential, write it down.
	# -------------------------------------------------------------------------
	func _phase_first_claim() -> void:
		print("\n[phase 1] fresh store: establish a crowd and persist the credential")
		client = _make_client(HOST_SESSION_ID, true)
		add_child(client)
		await _pump(ROUND_TRIP_FRAMES)

		check("a store that does not exist yet loads nothing", client.session_loaded == false,
			client.session_store_error)
		check("no credential was written before the server issued one", client.session_persisted == false)

		for agent_id in AGENTS:
			client.ensure_registered(agent_id)
		await _settle(client, ROUND_TRIP_FRAMES)

		check("the whole crowd registered in one batched request",
			client.batched_registration_requests == 1 and client.individual_registration_requests == 0,
			"batched=%d individual=%d" % [client.batched_registration_requests, client.individual_registration_requests])
		check("every agent is registered on the server", client.registered_count() == AGENTS.size(),
			"registered=%d of %d" % [client.registered_count(), AGENTS.size()])
		check("the server issued this host a credential",
			client.session_token_issued and not client.session_token.is_empty())
		check("the credential was written to the store at the moment it existed",
			client.session_persisted, client.session_store_error)
		check("the store is actually on disk", FileAccess.file_exists(store_path), store_path)
		# THE AT-REST CLAIM, made from inside the engine that wrote the file. What
		# matters is the BYTES, so `store_exposes_secrets` reads the file back and
		# searches for the two things that must never be readable in it.
		check("the store is the ENCRYPTED container, not plaintext JSON",
			client.session_store_protection == "ENCRYPTED", client.session_store_protection)
		check("the credential and the private key are NOT in the file",
			client.store_exposes_secrets() == false)
		# Relocation, which is the leak that actually happens: a folder copied into a
		# backup, a support bundle or a repository. That only stays inert if the key
		# is not carried along with it.
		check("a keyring was used, and it is NOT in the store's directory",
			not client.session_keyring_path_resolved.is_empty()
				and client.session_keyring_path_resolved.get_base_dir() != store_path.get_base_dir(),
			client.session_keyring_path_resolved)
		check("a first claim is GRANTED, not ADOPTED", client.last_claim_outcome == "GRANTED",
			client.last_claim_outcome)
		check("nothing was adopted or taken over on a first claim",
			client.claims_adopted == 0 and client.claims_taken_over == 0)

	# -------------------------------------------------------------------------
	# Phase 2 — a SECOND process against the SAME live server.
	# -------------------------------------------------------------------------
	func _phase_reclaim() -> void:
		print("\n[phase 2] new host process, same store, same server")
		client = _make_client(HOST_SESSION_ID, true)
		add_child(client)
		await _pump(ROUND_TRIP_FRAMES)

		check("the identity was LOADED from the store rather than regenerated", client.session_loaded,
			client.session_store_error)
		check("the loaded name is the one that was persisted", client.session_id == HOST_SESSION_ID,
			client.session_id)
		check("the loaded credential is non-empty", not client.session_token.is_empty())
		check("the store that was read is the ENCRYPTED container",
			client.session_store_protection == "ENCRYPTED", client.session_store_protection)
		check("a credential loaded and used without being exposed on disk",
			client.store_exposes_secrets() == false)

		for agent_id in AGENTS:
			client.ensure_registered(agent_id)
		await _settle(client, ROUND_TRIP_FRAMES)

		# The whole point: a restarted host is RECOGNISED, not merely tolerated.
		check("the restarted host reclaims its crowd as GRANTED", client.last_claim_outcome == "GRANTED",
			client.last_claim_outcome)
		check("the restarted host did not have to adopt its own agents", client.claims_adopted == 0,
			"adopted=%d" % client.claims_adopted)
		check("no claim was refused for the owner", client.refused_claims == 0)
		check("the crowd is intact after the restart", client.registered_count() == AGENTS.size())

		# Now the other half of the contract: the credential identifies ONE host.
		print("\n[phase 2] a tokenless rival names the same session")
		rival = _make_client(RIVAL_SESSION_ID, false)
		add_child(rival)
		await _pump(ROUND_TRIP_FRAMES)
		rival.ensure_registered(AGENTS[0])
		await _settle(rival, ROUND_TRIP_FRAMES)

		check("a rival with no credential is refused the live owner's agent",
			rival.refused_claims == 1, "refused=%d" % rival.refused_claims)
		check("the rival does not own the agent it asked for", rival.is_agent_registered(AGENTS[0]) == false)
		check("the owner still has its crowd", client.is_agent_registered(AGENTS[0]))

		# And the same rule on the destructive verb: a rival cannot retire what it
		# does not own, and the refusal is REPORTED rather than silently dropped.
		rival.ensure_unregistered(AGENTS[0])
		await _settle(rival, ROUND_TRIP_FRAMES)
		check("a rival's teardown of the owner's agent is refused and reported",
			rival.unregistration_refusals == 1, "refusals=%d" % rival.unregistration_refusals)
		check("the agent survives the rival's teardown attempt", client.is_agent_registered(AGENTS[0]))
		check("the owner is not told it lost an agent it still has",
			client.unregistration_refusals == 0)

	# -------------------------------------------------------------------------
	# Phase 3 — a THIRD process, after the MIDDLEWARE was restarted from a snapshot.
	# -------------------------------------------------------------------------
	func _phase_after_server_restart() -> void:
		print("\n[phase 3] new host process, same store, server restarted from a snapshot")
		client = _make_client(HOST_SESSION_ID, true)
		add_child(client)
		await _pump(ROUND_TRIP_FRAMES)

		check("the credential survived the middleware restart", client.session_loaded
			and not client.session_token.is_empty(), client.session_store_error)
		check("and survived it still unreadable at rest",
			client.session_store_protection == "ENCRYPTED" and client.store_exposes_secrets() == false,
			client.session_store_protection)

		# ORDER MATTERS HERE, and getting it wrong is how this phase first failed.
		# A restored session is unbound, so it is NOT live - but the moment the
		# token holder claims anything it becomes live again, and a tokenless rival
		# is then (correctly) refused instead of adopting. So the rival is run
		# FIRST, while the restored session still has no proof of life, and the
		# token holder's own claim follows.
		print("\n[phase 3] what a restored session is NOT: a live one")
		rival = _make_client(RIVAL_SESSION_ID, false)
		add_child(rival)
		await _pump(ROUND_TRIP_FRAMES)
		rival.ensure_registered(AGENTS[1])
		await _settle(rival, ROUND_TRIP_FRAMES)
		check("a tokenless claim on a restored (unbound) session is ADOPTED",
			rival.last_claim_outcome == "ADOPTED", rival.last_claim_outcome)
		check("the restored owner was not treated as live",
			rival.refused_claims == 0, "refused=%d" % rival.refused_claims)
		check("the rival now owns the agent it adopted", rival.is_agent_registered(AGENTS[1]))

		# THE credential assertion of this phase. It must be made while the
		# snapshot's ownership is still in place, because a reset would clear it and
		# a later GRANTED would then prove nothing: the session would not exist at
		# all, so a claim on it is a fresh grant whatever the credential says.
		# If the stored credential did not match the restored hash, the session
		# would be unbound and this claim would come back ADOPTED.
		for agent_id in [AGENTS[0], AGENTS[2], "persist_delta"]:
			client.ensure_registered(agent_id)
		await _settle(client, ROUND_TRIP_FRAMES)
		check("a credential hashed in a PREVIOUS server process still proves continuity",
			client.last_claim_outcome == "GRANTED", client.last_claim_outcome)
		check("the returned host did not have to adopt its own agents", client.claims_adopted == 0,
			"adopted=%d" % client.claims_adopted)
		check("no claim was refused for the token holder", client.refused_claims == 0,
			"refused=%d" % client.refused_claims)

		# Now the rival IS live and owns an agent, so the reset gate has something
		# to protect and this is where an in-engine run can show it working. An
		# honest host is refused its OWN global wipe when it would destroy another
		# live session's agent - which is the difference between gating the reset
		# and breaking it.
		print("\n[phase 3] the reset gate, from a real host")
		var before_reset: int = client.registered_count()
		client.reset_server(true)
		await _settle(client, ROUND_TRIP_FRAMES)
		check("a reset that would destroy another live session's agent is refused",
			client.reset_refusals == 1, "refusals=%d" % client.reset_refusals)
		check("a refused reset does not clear the client's belief about the server",
			client.registered_count() == before_reset,
			"before=%d after=%d" % [before_reset, client.registered_count()])

		# Once the rival retires the agent it adopted, nothing live blocks the wipe,
		# and the same host that was refused a moment ago is allowed.
		rival.ensure_unregistered(AGENTS[1])
		await _settle(rival, ROUND_TRIP_FRAMES)
		check("the rival may retire the agent it adopted",
			rival.unregistration_refusals == 0 and rival.is_agent_registered(AGENTS[1]) == false,
			"refusals=%d" % rival.unregistration_refusals)
		client.reset_server(true)
		await _settle(client, ROUND_TRIP_FRAMES)
		check("with nothing live in the way, the same host may clear the world",
			client.reset_refusals == 1, "refusals=%d (expected exactly one, from the blocked attempt)" % client.reset_refusals)
		check("the permitted reset cleared the agents", client.registered_count() == 0,
			"registered=%d" % client.registered_count())

	# -------------------------------------------------------------------------
	# Phase 4 — the upgrade path. NO SERVER: this phase is about the FILE, and a
	# round trip would only add scheduling noise to something entirely local.
	# -------------------------------------------------------------------------
	const LEGACY_TOKEN := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

	func _phase_legacy_upgrade() -> void:
		print("\n[phase 4] an older build's PLAINTEXT store is read, then upgraded in place")
		# A DIFFERENT file from the one phases 1-3 use, because those need a store
		# that does not exist yet and this one needs a store that already does.
		store_path = "%s.legacy" % store_path
		var writer := FileAccess.open(store_path, FileAccess.WRITE)
		if writer == null:
			check("the legacy store could be written", false, store_path)
			return
		writer.store_string(JSON.stringify({
			"session_id": HOST_SESSION_ID,
			"session_token": LEGACY_TOKEN,
			"signing_private_key": "",
			"signing_public_key": "",
			"saved_at_unix": 1758400000
		}))
		writer.close()

		client = _make_client(HOST_SESSION_ID, true)
		add_child(client)
		await _pump(ROUND_TRIP_FRAMES)

		check("the legacy store was read rather than ignored", client.session_loaded,
			client.session_store_error)
		check("the credential it held is the one this process now uses",
			client.session_token == LEGACY_TOKEN)
		# Reported, not silently accepted. A host has to be able to TELL that its
		# store is still readable on disk, or the upgrade never gets noticed.
		check("the format is REPORTED as legacy plaintext",
			client.session_store_protection == "PLAINTEXT_LEGACY", client.session_store_protection)
		check("and the diagnostic agrees: the plaintext file DOES expose the credential",
			client.store_exposes_secrets())

		# THE upgrade. `save_session` is the ordinary call the client makes the
		# moment the server issues or rotates a credential, so this is the real path
		# and not a migration routine that only this run ever exercises.
		check("the store is rewritten", client.save_session(), client.session_store_error)
		check("and it is now the ENCRYPTED container",
			client.session_store_protection == "ENCRYPTED", client.session_store_protection)
		check("the rewritten file exposes neither secret", client.store_exposes_secrets() == false)

		# Same file, same credential, new container: the upgrade must not cost the
		# host the session it was upgrading.
		var reloaded := _make_client(HOST_SESSION_ID, true)
		add_child(reloaded)
		await _pump(ROUND_TRIP_FRAMES)
		check("a fresh process reads the upgraded store", reloaded.session_loaded,
			reloaded.session_store_error)
		check("the upgraded store still carries the SAME credential",
			reloaded.session_token == LEGACY_TOKEN, "len=%d" % reloaded.session_token.length())
		check("and reports itself as encrypted",
			reloaded.session_store_protection == "ENCRYPTED", reloaded.session_store_protection)

	# -------------------------------------------------------------------------
	# Phase 5 — the SIGNING KEY at rest. Still no server: this is about one file
	# holding a credential AND a private key, and about that key surviving a
	# restart. A host that cannot restore its key can no longer PROVE itself, only
	# name itself, which is exactly what request signing exists to stop.
	# -------------------------------------------------------------------------
	func _phase_signing_key_at_rest() -> void:
		print("\n[phase 5] the private signing key: unreadable in the file, intact after a restart")
		store_path = "%s.signing" % store_path

		client = _make_client(HOST_SESSION_ID, true)
		# Signing is off by default in the client and stays off for most hosts, so it
		# is turned on HERE rather than assumed: a store with no private key in it
		# would make every assertion below vacuous.
		client.signing_enabled = true
		add_child(client)
		await _pump(ROUND_TRIP_FRAMES)

		check("this process has a signing key", not client.signing_public_key_pem.is_empty(),
			client.signing_store_error)
		check("the store is written", client.save_session(), client.session_store_error)
		check("it is the ENCRYPTED container",
			client.session_store_protection == "ENCRYPTED", client.session_store_protection)
		check("the credential and the PRIVATE KEY are both unreadable in it",
			client.store_exposes_secrets() == false)
		check("and the file does not even carry a private-key PEM banner",
			not _file_text(store_path).contains("PRIVATE KEY"))

		# A second client over the SAME file, standing for the restart.
		var restarted := _make_client(HOST_SESSION_ID, true, "_restarted")
		restarted.signing_enabled = true
		add_child(restarted)
		await _pump(ROUND_TRIP_FRAMES)

		check("the restarted process read the store", restarted.session_loaded,
			restarted.session_store_error)
		# If the private key had failed to load, `_ensure_signing_key` would have
		# silently generated a NEW one - which is why the error string is asserted
		# and not just the public half.
		check("the stored private key loaded rather than being regenerated",
			restarted.signing_store_error.is_empty(), restarted.signing_store_error)
		check("the restored key is the SAME key the first process used",
			restarted.signing_key_id == client.signing_key_id,
			"restored=%s original=%s" % [restarted.signing_key_id, client.signing_key_id])
		check("the restored public half matches",
			restarted.signing_public_key_pem == client.signing_public_key_pem)
		check("the credential came back with it", restarted.session_token == client.session_token)

	func _file_text(path: String) -> String:
		if not FileAccess.file_exists(path):
			return ""
		var handle := FileAccess.open(path, FileAccess.READ)
		if handle == null:
			return ""
		var text := handle.get_as_text()
		handle.close()
		return text
