# Fear AI Godot 4 WebSocket & HTTP Client (Autoload Singleton)
# Supports both JSON protocol and high-throughput Binary Wire Protocol v2.
#
# TWO PLANES:
#   control plane - HTTP only, serialized one request at a time. Agent
#     registration and trauma-zone authoring live here. Registration is
#     deliberately not batched with ticks: the server drops observations for
#     unknown agents (`RuntimeSimulation.queueObservation` gates on
#     `agents.has(id)`), so an unregistered client silently produces no
#     advisories at all. Control-plane requests therefore settle before any
#     data-plane batch is sent, and the transport for ticks is still chosen by
#     `use_websocket` independently.
#   data plane    - observation batches, over WebSocket or HTTP.
#
# Port resolution mirrors the conformance runners: FEAR_AI_PORT wins over the
# exported default, so a live run is never pinned to a port another local
# service may already hold.
extends Node

## The container the persisted identity is written in. Kept in its own file
## because the FORMAT is shared with the Node reference and the Unity adapter, and
## a cross-language format living inside one client is a format nobody can verify
## from the outside. Relative preload, so the package works wherever a host drops
## it rather than only under an `addons/fear_ai/` path.
const FEAR_ENCRYPTED_STORE = preload("fear_encrypted_store.gd")

signal connected_to_server
signal disconnected_from_server
signal agent_state_received(agent_id: String, state: Dictionary)
signal agent_registered(agent_id: String)
signal agent_registration_failed(agent_id: String, reason: String)
signal trauma_zone_added(ok: bool)
## Emitted when the server establishes this host's session and issues a token.
## Persist `session_token` here if the host should be recognised across its own
## restarts instead of falling back to adoption.
signal session_established(issued: bool)
signal control_plane_idle_reached

@export var server_host: String = "127.0.0.1"
@export var server_port: int = 8765
@export var use_websocket: bool = true
@export var use_binary_wire: bool = false

# Binary Protocol Constants (Front D / Section 83 & Sections 74-75)
const BINARY_MAGIC = 0x52414546 # "FEAR" in little-endian uint32
const BINARY_PROTOCOL_VERSION = 2
const FRAME_TYPE_OBSERVATION_BATCH = 1
const FRAME_TYPE_INTENT_BATCH = 2
const HEADER_SIZE_BYTES = 16
const RECORD_SIZE_BYTES = 32

const INTENT_MAP = {
	0: "IDLE_VIGILANT",
	1: "CAUTIOUS_EXPLORE",
	2: "INVESTIGATE_SOUND",
	3: "FLEE_FROM",
	4: "SEEK_COVER",
	5: "FREEZE",
	6: "CONFRONT_THREAT",
	7: "APPROACH_ALLY",
	8: "WARN_GROUP",
	9: "DESPERATE_FLAIL",
	10: "COLLAPSE_EXHAUSTED",
	11: "RECOVERING"
}

const BAND_MAP = {
	0: "CALM",
	1: "ALERT",
	2: "ANXIOUS",
	3: "HIDE",
	4: "PANIC",
	5: "FREEZE",
	6: "AGGRESSIVE",
	7: "CRAWLING",
	8: "PRESENCE_BREAK",
	9: "RECOVER"
}

var _socket: WebSocketPeer = WebSocketPeer.new()
var _is_connected: bool = false
var _pending_observations: Array[Dictionary] = []
var _http_request: HTTPRequest
var _control_request: HTTPRequest
var _encrypted_store = FEAR_ENCRYPTED_STORE.new()

# --- Control plane state ----------------------------------------------------
var _registration_queue: Array[Dictionary] = []
var _control_queue: Array[Dictionary] = []
var _control_in_flight: Dictionary = {}
var _registered_agents: Dictionary = {}
## Observations refused by the client because their agent was not yet
## registered. A non-zero value at the end of a live run means the control
## plane did not settle in time and the run is not trustworthy.
var dropped_unregistered_observations: int = 0
var registration_failures: int = 0
var trauma_zones_added: int = 0
var _control_idle_announced: bool = false

## This host's identity for the whole process lifetime. The server uses it to
## tell a reconnecting host apart from a second host claiming the same agents,
## so it must NOT change per connection: a value regenerated on every socket
## would make the host look brand new to the server on reconnect. Left empty it
## is assigned once in `_ready()`; set it before that (or at any time) to share
## an identity deliberately, e.g. across two processes during a host migration.
var session_id: String = ""
## Server-issued proof that this process IS the session it names, returned once
## when the session is established. This is the credential: `session_id` alone is
## a label anyone can write down, so a name-only claim can create a session or
## adopt a dead one but can never displace a live one. Persist it if the host
## should survive its own restart without falling back to adoption via
## `claim: "adopt"`. Never logged: it is a bearer credential for the crowd.
var session_token: String = ""
## What this host may displace when it claims an agent another session owns.
## `join` (the default) never takes an agent from a session that is still live;
## `adopt` claims agents whose owner is gone, which is automatic anyway and is
## kept only for explicitness; `takeover` deliberately displaces a LIVE owner
## and should be set only for a real host migration. Agents owned by a session
## that has died are always adoptable regardless of this value.
var claim_mode: String = "join"

## Persist `session_id` + `session_token` so a restart of THIS host process is a
## reconnect rather than a fresh arrival.
##
## WHY IT IS NOT ON BY DEFAULT
## A token is a bearer credential: a file holding one is exactly as sensitive as
## the live session. A host that wants crash-restart continuity should turn this
## on and treat the store like a keyfile; a host with nowhere safe to put it
## should not, and still recovers by adopting its own name once the previous
## session is not live. Off by default keeps every existing project's behaviour
## unchanged.
@export var persist_session: bool = false
## Where that identity lives. `user://` is per-project and writable on every
## exported platform; an absolute path is accepted too, so a harness can point
## two separate runs at one store deliberately.
@export var session_store_path: String = "user://fear_ai_session.json"
## Opt OUT of encryption and write the credential as PLAINTEXT. Off, and it should
## stay off: the store is a complete, copyable identity, and the default keeps it
## unreadable without the keyring. It exists only for a host that genuinely has
## nowhere to keep a keyring, and a host that sets it reports
## `session_store_protection == "PLAINTEXT_BY_REQUEST"` so that state is never
## something anyone has to infer.
@export var session_store_allow_plaintext: bool = false
## Where the keyring lives. Empty means the platform default — a user-scoped
## CONFIGURATION path, deliberately OUTSIDE `user://` and therefore outside the
## game's save tree, so a backup of the saves does not carry the key. An absolute
## path or `FEAR_AI_KEYRING` overrides it, which is how the probes pin two runs
## to one keyring deliberately.
@export var session_keyring_path: String = ""

# -----------------------------------------------------------------------------
# Request signing (RS256)
# -----------------------------------------------------------------------------
#
# A session token is a BEARER credential: whoever holds the string can act as
# this host. Request signing replaces that with proof of a private key, which
# never leaves this process. The server stores only the public half, so a token
# lifted from a store, a log or a backup stops being enough on its own.
#
# WHY IT IS OFF BY DEFAULT
# Same reason persistence is: turning it on commits a host to keeping a private
# key, and a host that does not need it should not pay for it. Nothing here
# changes the behaviour of a host that leaves it alone.
#
# WHAT THE SIGNATURE COVERS (byte for byte, matching RequestSigning.js)
#   FEAR-AI-SIGN-V1
#   HTTP
#   <METHOD>
#   <request target, path only>
#   <sha256 hex of the exact body bytes>
#   <session_id>
#   <issued_at, an INTEGER in milliseconds>   <-- see the trap below
#   <nonce>
#
# THE TRAP THAT COST A DEBUG CYCLE: `issued_at` must render as an integer.
# Godot's JSON parser returns numbers as floats, so a timestamp read back out of
# JSON and passed straight to `str()` becomes "1758400000000.0" and the server
# refuses the signature as INVALID -- which looks exactly like a broken key.
# `_now_ms()` returns an int, and anything read from JSON is converted with
# `int()` first. The same trap exists in every language here; the interop probe
# covers it in all of them.
@export var signing_enabled: bool = false
## The public half of this host's key, as registered with the server.
var signing_public_key_pem: String = ""
## Fingerprint of the public key. Diagnostic only: it names the key the server
## holds without being usable as one, and both sides derive it from the PEM.
var signing_key_id: String = ""
var signing_store_error: String = ""
## Whether the server has confirmed this host's key. Until it has, every claim
## carries the public key so the session gets one; after it has, carrying 450
## bytes of PEM on every registration would be pure noise.
var signing_key_registered: bool = false
## Requests this process signed, and signature refusals it was told about. A
## host that signs and is never refused is the healthy case; a non-zero refusal
## count means this client and the server disagree about the canonical input.
var signing_requests_signed: int = 0
var signing_refusals: int = 0
## The challenge this socket was last asked to answer, and whether the server
## accepted an answer. One signature per CONNECTION, not one per message, so the
## observation hot path never pays for RSA.
var signing_challenge: String = ""
var ws_authenticated: bool = false
## The refusal code the server last returned for a signature, if any.
var signing_refusal_reason: String = ""
var _signing_key: CryptoKey = null

## True when this process WROTE the store, so "persistence is on" is never
## inferred from the setting alone.
var session_persisted: bool = false
## True when this process READ an identity out of the store. A cross-process
## test asserts this: a restart that silently regenerated its identity looks
## identical to one that loaded a stale file, and only this flag separates them.
var session_loaded: bool = false
var session_store_error: String = ""
## How the store on disk is ACTUALLY protected, as this process last observed it.
## Reported as a value rather than inferred from `persist_session`, because
## "persistence is on" says nothing about whether the file is readable without the
## keyring:
##   ENCRYPTED             credential and private key are ciphertext (the default)
##   PLAINTEXT_LEGACY      an older build's plaintext JSON was LOADED; the next
##                         save rewrites it encrypted, so the upgrade completes on
##                         the next credential issue or rotation
##   PLAINTEXT_BY_REQUEST  the host explicitly opted out via
##                         `session_store_allow_plaintext`
##   NONE                  nothing has been read or written this process
var session_store_protection: String = "NONE"
## The keyring actually used, and whether this process created it. Both reported
## so an operator can answer "where is the key" without guessing at the platform.
var session_keyring_path_resolved: String = ""
var session_keyring_created: bool = false
## Request-level claim outcome of the last registration batch, as reported by the
## server. After a host restart the value that matters is `GRANTED`: an `ADOPTED`
## here means the host came back as a stranger to its own crowd, which is exactly
## the failure persistence exists to prevent.
var last_claim_outcome: String = ""
var claims_granted: int = 0
var claims_adopted: int = 0
var claims_taken_over: int = 0
## Credentials the server replaced because they had expired, and credentials this
## host asked it to rotate. Counted, because an unnoticed rotation is a host that
## is one crash away from losing its crowd.
var session_token_expiries: int = 0
var session_token_rotations: int = 0
## Teardown ids the server refused because a LIVE session owned them. Distinct
## from `registration_failures`: nothing failed here, this host simply is not
## allowed to remove another session's agents.
var unregistration_refusals: int = 0
## `clear_agents` resets the server refused because a live session owned agents.
var reset_refusals: int = 0
## True between asking for a `clear_agents` reset and the server CONFIRMING it.
## The local view of "which agents are registered" is only cleared on that
## confirmation, because a refused reset that wiped it would leave the host
## believing a crowd is gone while the server still simulates it - the exact
## silent divergence the rest of this control plane exists to prevent.
var _reset_pending_clear: bool = false

## Registrations, unregistrations and trauma zones per batch request, matching
## the server's MAX_BATCH_CONTROL_ITEMS. One request carries a whole host
## population instead of one round trip per item.
const BATCH_REGISTRATION_LIMIT: int = 512
## Bounded individual retries for an agent a batch did not confirm.
const MAX_REGISTRATION_ATTEMPTS: int = 3
var batched_registration_requests: int = 0
## Individual `/api/v1/register` requests dispatched. Batched registration only
## pays off if this stays near zero for a large host, so it is counted and
## asserted rather than assumed.
var individual_registration_requests: int = 0
## Batch teardown and batch trauma authoring, counted for the same reason, and
## their singular counterparts so the legacy degradation is visible too.
var batched_unregistration_requests: int = 0
var batched_trauma_requests: int = 0
var individual_unregistration_requests: int = 0
## Ids the server refused to remove (malformed entries). Counted and reported:
## an unregister that silently does nothing leaves an agent live on the server
## while the host believes it is gone, which is the exact silent-failure class
## the rest of this control plane exists to avoid.
var unregistration_rejections: int = 0
## Trauma zones the server explicitly refused (malformed entries). Counted so a
## partial application can never be mistaken for a complete one.
var trauma_zones_rejected: int = 0
## True once a 404 on a batch control route told us this server predates it; the
## client then sends the same work one item at a time for the rest of the session.
var batch_control_unsupported: bool = false
var _batch_control_supported: bool = true
## Registrations the server refused because a LIVE session already owned the
## agent. A non-zero value means this host is competing with another one for
## the same crowd, which is a host/session problem, not a middleware one.
var refused_claims: int = 0
## True once the server has issued this host a session token, i.e. once the host
## can prove continuity rather than only name a session. Emitted through
## `session_established` so a host can persist the token at the moment it exists.
var session_token_issued: bool = false
var _unregister_queue: Array[String] = []
var _trauma_queue: Array[Dictionary] = []
## True once a 404 on the batch route told us this server predates it; the
## client then registers individually for the rest of the session.
var batch_registration_unsupported: bool = false
var _batch_registration_supported: bool = true

func _ready() -> void:
	# Identity FIRST: the store is the only thing that can tell this process it
	# already has a crowd, and both the fallback name below and the handshake
	# token depend on which identity this process turns out to be.
	if persist_session:
		load_session()

	# One identity for this process, assigned once. `_ready()` runs once per
	# autoload instance, so a socket drop and reconnect keeps the same id and the
	# server recognises the host instead of seeing a stranger. A name loaded from
	# the store is deliberately NOT overwritten here.
	if session_id.is_empty():
		session_id = "godot_%d" % Time.get_ticks_msec()

	# The key is made AFTER the store is read, so a restart REUSES the key the
	# server already knows instead of replacing it with a stranger's.
	_ensure_signing_key()

	var env_port := OS.get_environment("FEAR_AI_PORT")
	if env_port.is_valid_int():
		var parsed := int(env_port)
		if parsed > 0 and parsed < 65536:
			server_port = parsed

	_http_request = HTTPRequest.new()
	add_child(_http_request)
	_http_request.request_completed.connect(_on_http_response)

	_control_request = HTTPRequest.new()
	add_child(_control_request)
	_control_request.request_completed.connect(_on_control_response)
	
	if use_websocket:
		var url = "ws://%s:%d" % [server_host, server_port]
		var err = _socket.connect_to_url(url)
		if err != OK:
			push_warning("[FearAI] WebSocket connect error: %d. Using HTTP." % err)

func _process(_delta: float) -> void:
	# The control plane is pumped from both frame callbacks: HTTPRequest can only
	# carry one request at a time, so registration throughput is bounded by how
	# often it can be advanced. A showcase with dozens of agents otherwise spends
	# seconds registering before the first advisory can come back.
	_pump_control_plane()

	if use_websocket:
		_socket.poll()
		var state = _socket.get_ready_state()
		
		if state == WebSocketPeer.STATE_OPEN:
			if not _is_connected:
				_is_connected = true
				connected_to_server.emit()
				_send_handshake()
			
			while _socket.get_available_packet_count() > 0:
				var packet = _socket.get_packet()
				if packet.size() >= 16 and packet[0] == 0x46 and packet[1] == 0x45 and packet[2] == 0x41 and packet[3] == 0x52:
					_process_binary_message(packet)
				else:
					var text = packet.get_string_from_utf8()
					_process_message(text)
				
		elif state == WebSocketPeer.STATE_CLOSED and _is_connected:
			_is_connected = false
			disconnected_from_server.emit()

func _physics_process(delta: float) -> void:
	_pump_control_plane()

	# Data plane waits on the control plane: sending an observation for an
	# agent the server has not registered is a silent no-op, so it is better to
	# hold the batch one frame than to lose the tick.
	if not control_plane_idle():
		return

	if _pending_observations.size() == 0:
		return

	var batch: Array[Dictionary] = []
	for obs in _pending_observations:
		if _registered_agents.has(str(obs.get("agent_id", ""))):
			batch.append(obs)
		else:
			dropped_unregistered_observations += 1
	_pending_observations.clear()
	if batch.is_empty():
		return
	
	if use_websocket and _is_connected and use_binary_wire:
		var binary_frame = _encode_binary_observations(batch, delta)
		_socket.send(binary_frame)
	elif use_websocket and _is_connected:
		var payload = {
			"type": "BATCH_TICK_REQUEST",
			"dt": delta,
			"observations": batch
		}
		_socket.send_text(JSON.stringify(payload))
	else:
		var payload = {
			"type": "BATCH_TICK_REQUEST",
			"dt": delta,
			"observations": batch
		}
		_send_http_batch(payload)

func queue_observation(obs: Dictionary) -> void:
	_pending_observations.append(obs)

# ==============================================================================
# CONTROL PLANE (HTTP, serialized)
# ==============================================================================

## True when no control request is queued or in flight.
func control_plane_idle() -> bool:
	return _registration_queue.is_empty() and _control_queue.is_empty() and _control_in_flight.is_empty()

func registered_count() -> int:
	return _registered_agents.size()

func is_agent_registered(agent_id: String) -> bool:
	return _registered_agents.has(agent_id)

func registered_agent_ids() -> Array:
	return _registered_agents.keys()

## Queue an agent registration. Idempotent: a second call for a registered or
## already-queued agent is a no-op. Returns true only if this agent is already
## registered at call time.
func ensure_registered(agent_id: String, traits: Dictionary = {}, initial_position: Dictionary = {}) -> bool:
	if agent_id.is_empty() or _registered_agents.has(agent_id):
		return _registered_agents.has(agent_id)
	for queued in _registration_queue:
		if str(queued.get("agent_id", "")) == agent_id:
			return false
	var payload: Dictionary = { "agent_id": agent_id }
	if not traits.is_empty():
		payload["traits"] = traits
	if not initial_position.is_empty():
		payload["initial_position"] = initial_position
	# The claim travels with every registration so the server can attribute
	# ownership; without it the host has no identity and cannot be recognised
	# on reconnect, which is the whole point of the session.
	if not session_id.is_empty():
		payload["session_id"] = session_id
		payload["claim"] = claim_mode
		if not session_token.is_empty():
			payload["session_token"] = session_token
		# Offered with the claim, because a claim is the moment the server has a
		# session for the key to belong to. Sent only until it is confirmed.
		if signing_enabled and not signing_key_registered and not signing_public_key_pem.is_empty():
			payload["signing_public_key"] = signing_public_key_pem
	_registration_queue.append({ "agent_id": agent_id, "payload": payload, "attempts": 0 })
	return false

## Queue an agent for removal from the server session, without touching the
## agent's state locally. Batched: retiring a crowd costs one request.
func ensure_unregistered(agent_id: String) -> void:
	if agent_id.is_empty():
		return
	if _unregister_queue.has(agent_id):
		return
	_unregister_queue.append(agent_id)
	# The host no longer considers it registered the moment it asks, so the data
	# plane stops sending observations for it rather than producing drops.
	_registered_agents.erase(agent_id)

## Retry unconfirmed registrations individually, bounded so a permanently
## rejected agent fails loudly instead of looping forever.
func _requeue_registrations(entries: Array) -> void:
	var retry: Array[Dictionary] = []
	for entry in entries:
		var attempts := int(entry.get("attempts", 0)) + 1
		if attempts > MAX_REGISTRATION_ATTEMPTS:
			registration_failures += 1
			agent_registration_failed.emit(str(entry.get("agent_id", "")), "unconfirmed_after_%d_attempts" % MAX_REGISTRATION_ATTEMPTS)
			continue
		var copy: Dictionary = entry.duplicate(true)
		copy["attempts"] = attempts
		retry.append(copy)
	var merged: Array[Dictionary] = []
	merged.append_array(retry)
	merged.append_array(_registration_queue)
	_registration_queue = merged

## Author a host-side trauma zone on the server (the middleware owns the dread
## memory; the host owns where and how strong the shock was).
##
## Zones are QUEUED and sent as one batch on the next control-plane pump, so a
## scene that authors forty of them at load costs one round trip, not forty.
## A single call still costs one request, because a batch of one is a batch.
func add_trauma_zone(x: float, y: float, z: float = 0.0, intensity: float = 1.0, radius: float = 150.0, lifetime_ticks: int = 1800) -> void:
	_trauma_queue.append({
		"x": x, "y": y, "z": z, "intensity": intensity,
		"radius": radius, "lifetimeTicks": lifetime_ticks
	})

## Queue several trauma zones at once; identical in effect to calling
## `add_trauma_zone` repeatedly, and clearer at a call site that has a list.
func add_trauma_zones(zones: Array) -> void:
	for zone in zones:
		if zone is Dictionary:
			add_trauma_zone(
				float(zone.get("x", 0.0)), float(zone.get("y", 0.0)), float(zone.get("z", 0.0)),
				float(zone.get("intensity", 1.0)), float(zone.get("radius", 150.0)),
				int(zone.get("lifetimeTicks", 1800)))

## Ask the server to forget every agent (session hygiene between live runs).
func reset_server(clear_agents: bool = true) -> void:
	# A reset that clears agents is ownership-gated on the server, and this host
	# IS the owning session, so the request carries its proof or it would refuse
	# itself. A caller with no identity still works when nothing is owned.
	var payload: Dictionary = { "clear_agents": clear_agents }
	if not session_id.is_empty():
		payload["session_id"] = session_id
		if not session_token.is_empty():
			payload["session_token"] = session_token
	_control_queue.append({
		"kind": "reset",
		"path": "/api/v1/reset",
		"payload": payload
	})
	if clear_agents:
		_reset_pending_clear = true

func _pump_control_plane() -> void:
	if not _control_in_flight.is_empty():
		return

	# Legacy server: a 404 on a batch control route means this server predates
	# batching, so the queued work is converted into the singular requests every
	# server version has and sent through the ordinary control path instead.
	if not _batch_control_supported:
		_drain_to_legacy_control_queue()

	# Control commands first: a queued session reset has to land BEFORE the
	# registrations that follow it, or it would immediately wipe them.
	if not _control_queue.is_empty():
		var item: Dictionary = _control_queue[0]
		var url2 := "http://%s:%d%s" % [server_host, server_port, str(item.get("path", "/"))]
		var err2 := _signed_request(_control_request, url2, item.get("payload", {}))
		# A request that HTTPRequest cannot start yet (ERR_BUSY while the previous
		# response is still settling) stays at the FRONT of its queue and is
		# retried next frame. Dropping it would leave agents unregistered, and an
		# unregistered agent reads as "the middleware returned nothing".
		if err2 != OK:
			return
		_control_queue.pop_front()
		_control_in_flight = { "kind": str(item.get("kind", "control")) }
		return

	# One request for the whole pending queue, up to the server's cap.
	if not _registration_queue.is_empty() and _batch_registration_supported:
		var take: int = mini(_registration_queue.size(), BATCH_REGISTRATION_LIMIT)
		var payloads: Array = []
		var ids: Array = []
		for i in range(take):
			payloads.append(_registration_queue[i].get("payload", {}))
			ids.append(str(_registration_queue[i].get("agent_id", "")))
		var url_b := "http://%s:%d/api/v1/register/batch" % [server_host, server_port]
		var batch_body: Dictionary = { "agents": payloads }
		if not session_id.is_empty():
			batch_body["session_id"] = session_id
			batch_body["claim"] = claim_mode
			if not session_token.is_empty():
				batch_body["session_token"] = session_token
			if signing_enabled and not signing_key_registered and not signing_public_key_pem.is_empty():
				batch_body["signing_public_key"] = signing_public_key_pem
		var err_b := _signed_request(_control_request, url_b, batch_body)
		if err_b != OK:
			return
		_control_in_flight = { "kind": "register_batch", "agent_ids": ids }
		return

	# Batch teardown, one request for the whole retiring set.
	if not _unregister_queue.is_empty():
		var take_u: int = mini(_unregister_queue.size(), BATCH_REGISTRATION_LIMIT)
		var ids_u: Array = []
		for i in range(take_u):
			ids_u.append(_unregister_queue[i])
		var url_u := "http://%s:%d/api/v1/unregister/batch" % [server_host, server_port]
		var ubody: Dictionary = { "agent_ids": ids_u }
		# The CREDENTIAL travels with the teardown too. Teardown is ownership-gated
		# on the server, so a request carrying only the session NAME is refused as a
		# stranger's - which would leave this host unable to retire its own crowd.
		if not session_id.is_empty():
			ubody["session_id"] = session_id
			if not session_token.is_empty():
				ubody["session_token"] = session_token
		var err_u := _signed_request(_control_request, url_u, ubody)
		if err_u != OK:
			return
		_control_in_flight = { "kind": "unregister_batch", "agent_ids": ids_u }
		return

	# Batch trauma authoring, likewise one request per authored set.
	if not _trauma_queue.is_empty():
		var take_t: int = mini(_trauma_queue.size(), BATCH_REGISTRATION_LIMIT)
		var zones: Array = []
		for i in range(take_t):
			zones.append(_trauma_queue[i])
		var url_t := "http://%s:%d/api/v1/trauma/batch" % [server_host, server_port]
		var err_t := _signed_request(_control_request, url_t, { "zones": zones })
		if err_t != OK:
			return
		# The sent zones ride along in the in-flight record so a failed request
		# can put back exactly what it took, with no reconstruction guesswork.
		_control_in_flight = { "kind": "trauma_batch", "zones": zones }
		return

	# Individual fallback: used when the batch route is unavailable, and for the
	# tail the batch route could not confirm.
	if not _registration_queue.is_empty():
		var req: Dictionary = _registration_queue[0]
		var url := "http://%s:%d/api/v1/register" % [server_host, server_port]
		var err := _signed_request(_control_request, url, req.get("payload", {}))
		if err != OK:
			return
		_registration_queue.pop_front()
		individual_registration_requests += 1
		_control_in_flight = { "kind": "register", "agent_id": req.get("agent_id", "") }
		return

	if control_plane_idle() and not _control_idle_announced:
		_control_idle_announced = true
		control_plane_idle_reached.emit()

## A 401 whose code names a signature failure is information, not just a failure:
## it means the server holds a key for this session and will insist on a signature
## from now on. This is the recovery path for the worst case -- the request that
## registered the key succeeded and its response was lost, leaving the host
## believing it has no key while the server refuses everything it says.
func _handle_signature_refusal(body: PackedByteArray) -> void:
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if not (parsed is Dictionary):
		return
	var code := str(parsed.get("code", ""))
	if not code.begins_with("SIGNATURE"):
		return
	signing_refusals += 1
	signing_refusal_reason = code
	signing_key_registered = true

func _on_control_response(_result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var in_flight: Dictionary = _control_in_flight
	_control_in_flight = {}
	if in_flight.is_empty():
		return
	if response_code == 401:
		_handle_signature_refusal(body)
	var kind := str(in_flight.get("kind", ""))
	var ok := response_code == 200
	if kind == "register":
		var agent_id := str(in_flight.get("agent_id", ""))
		if ok:
			_adopt_session_token(JSON.parse_string(body.get_string_from_utf8()))
			_registered_agents[agent_id] = true
			_control_idle_announced = false
			agent_registered.emit(agent_id)
		else:
			registration_failures += 1
			agent_registration_failed.emit(agent_id, "http_%d" % response_code)
	elif kind == "register_batch":
		_handle_batch_registration(in_flight, ok, response_code, body)
	elif kind == "unregister_batch":
		_handle_batch_unregistration(in_flight, ok, response_code, body)
	elif kind == "trauma_batch":
		_handle_batch_trauma(in_flight, ok, response_code, body)
	elif kind == "unregister":
		if not ok:
			registration_failures += 1
	elif kind == "trauma":
		if ok:
			trauma_zones_added += 1
		trauma_zone_added.emit(ok)
	elif kind == "reset":
		if response_code == 200:
			# Only NOW does the local view forget the crowd. Clearing it when the
			# request was merely SENT would make a refused reset look applied.
			if _reset_pending_clear:
				_reset_pending_clear = false
				_registered_agents.clear()
				_unregister_queue.clear()
		elif response_code == 409:
			# A refused reset is reported, never swallowed: the host asked for a clean
			# world and did not get one, and the reason is another live session owning
			# agents, not a transport problem.
			_reset_pending_clear = false
			reset_refusals += 1
			push_warning("[FearAI] reset refused: a live session owns agents (present that session's token, or unregister first)")

## Consume a batch response. Only the ids the server CONFIRMS are marked
## registered; everything else goes back on the queue as an individual attempt,
## so a partial or rejected response can never be mistaken for success.
func _handle_batch_registration(in_flight: Dictionary, ok: bool, response_code: int, body: PackedByteArray) -> void:
	var sent: Array = in_flight.get("agent_ids", [])
	# The first `sent.size()` queue entries are exactly what was sent.
	var consumed: Array = []
	for i in range(mini(sent.size(), _registration_queue.size())):
		consumed.append(_registration_queue[i])
	var remaining: Array[Dictionary] = []
	for i in range(consumed.size(), _registration_queue.size()):
		remaining.append(_registration_queue[i])
	_registration_queue = remaining

	if response_code == 404:
		# This server predates the batch route. Stop using it for the rest of the
		# session rather than retrying an endpoint that is not there.
		_batch_registration_supported = false
		batch_registration_unsupported = true
		_requeue_registrations(consumed)
		return

	if not ok:
		_requeue_registrations(consumed)
		return

	var parsed = JSON.parse_string(body.get_string_from_utf8())
	var confirmed: Array = []
	var refused: Array = []
	if parsed is Dictionary:
		if parsed.get("registered") is Array:
			confirmed = parsed["registered"]
		if parsed.get("refused") is Array:
			refused = parsed["refused"]
		# The request-level claim says how this host was received: `GRANTED` is a
		# recognised host, `ADOPTED` is one that arrived as a stranger to its own
		# crowd, `TAKEN_OVER` is a deliberate displacement. Tallied rather than
		# logged, so a run can assert on it.
		var claim_outcome := str(parsed.get("claim", ""))
		if not claim_outcome.is_empty():
			last_claim_outcome = claim_outcome
			if claim_outcome == "GRANTED":
				claims_granted += 1
			elif claim_outcome == "ADOPTED":
				claims_adopted += 1
			elif claim_outcome == "TAKEN_OVER":
				claims_taken_over += 1
		# A token is returned only when the session was just established. Storing
		# it is what lets this host prove continuity on every later claim and
		# after its own restart.
		_adopt_session_token(parsed)
	batched_registration_requests += 1
	var unconfirmed: Array = []
	for entry in consumed:
		var id := str(entry.get("agent_id", ""))
		if confirmed.has(id):
			_registered_agents[id] = true
			_control_idle_announced = false
			agent_registered.emit(id)
		elif _refusal_for(refused, id) != "":
			# A live session owns this agent. Retrying would fail identically,
			# so it is reported once and NOT requeued - a retry loop here would
			# just burn frames while looking like progress.
			refused_claims += 1
			agent_registration_failed.emit(id, _refusal_for(refused, id))
		else:
			unconfirmed.append(entry)
	_requeue_registrations(unconfirmed)

## Adopt a session token from a server response, if one was issued.
##
## Kept as a helper rather than one long inline condition, because that is how
## this was first written and it did not parse. The trigger was narrow and worth
## recording: a PARENTHESIS-LESS builtin call whose argument is a member access,
## e.g. `typeof single.get("session_token")`, inside a compound `if`. Godot 4.6
## reports it as `Parse Error: Expected ":" after "if" condition`, which points
## at the whole line rather than the real cause. `typeof(single.get(...))`
## parses, as does the `is ... and ...` form the other guards use. Splitting the
## condition into steps removes the trap entirely.
func _adopt_session_token(parsed) -> void:
	if not (parsed is Dictionary):
		return
	# The key report is handled FIRST, because a response that replaced an
	# already-known key carries no new token at all and the token path below
	# returns before reaching it.
	var key_report = parsed.get("signing_key")
	if key_report is Dictionary:
		var key_outcome := str(key_report.get("outcome", ""))
		if key_outcome.ends_with("REGISTERED") or key_outcome.ends_with("REPLACED"):
			signing_key_registered = true
		elif key_outcome.begins_with("SIGNING_KEY_REFUSED"):
			# Reported, never retried blindly: a refused key means the server
			# believes someone else's key is already registered for this name.
			signing_refusals += 1
			signing_store_error = key_outcome
	# Rotation and expiry are counted even when no token rides in this response,
	# because a credential replaced for a reason the host did not ask for is
	# exactly what it must not discover by failing later.
	if parsed.get("token_expired") == true:
		session_token_expiries += 1
	if parsed.get("token_rotated") == true:
		session_token_rotations += 1
	var raw = parsed.get("session_token")
	if typeof(raw) != TYPE_STRING:
		return
	var value := str(raw)
	if value.is_empty():
		return
	var changed := value != session_token
	session_token = value
	session_token_issued = true
	# Persisted the moment it exists, not at shutdown: waiting would mean a
	# crash loses precisely the thing that makes a restart continuous.
	if persist_session and changed:
		save_session()
	session_established.emit(true)

## Load this host's identity from the store. Returns true when one was read.
##
## Called from `_ready()` before a fallback name is generated and before the
## socket handshake, since both depend on which identity this process is.
func load_session() -> bool:
	if session_store_path.is_empty() or not FileAccess.file_exists(session_store_path):
		session_loaded = false
		return false
	var file := FileAccess.open(session_store_path, FileAccess.READ)
	if file == null:
		session_store_error = "cannot read %s (err %d)" % [session_store_path, FileAccess.get_open_error()]
		return false
	var raw := file.get_as_text()
	file.close()

	# TWO FORMATS ARE READ, and that is deliberate rather than transitional
	# tidiness. A host upgrading into this build already HAS a plaintext store
	# holding a live credential, and refusing to read it would cost that host its
	# crowd for no security benefit: the credential is already exposed, and a file
	# is not made safer by being unreadable to its owner. So the old form is read,
	# REPORTED as PLAINTEXT_LEGACY, and rewritten encrypted on the next save —
	# which the server triggers by itself the next time it issues or rotates a
	# credential, so the upgrade completes without the host doing anything.
	var parsed = null
	if _encrypted_store.looks_encrypted(raw):
		var keyring := _encrypted_store.load_or_create_keyring(_resolve_keyring_path())
		if not keyring["ok"]:
			session_store_error = str(keyring["reason"])
			return false
		session_keyring_path_resolved = str(keyring["path"])
		session_keyring_created = bool(keyring["created"])
		var opened := _encrypted_store.decrypt(raw, keyring["key"])
		if not opened["ok"]:
			# Reported and left ALONE, for the same reason as the corrupt-JSON case
			# below: it may be the only copy of a credential still valid on the
			# server, and a keyring that is temporarily unavailable must not turn
			# into a destroyed store.
			session_store_error = "store at %s would not open (%s)" % [session_store_path, str(opened["reason"])]
			return false
		parsed = opened["record"]
		session_store_protection = "ENCRYPTED"
	else:
		parsed = JSON.parse_string(raw)
		session_store_protection = "PLAINTEXT_LEGACY"
	if not (parsed is Dictionary):
		# A corrupt store is reported and left ALONE. It is not a reason to fail a
		# host boot, and overwriting it would destroy the only copy of a credential
		# that may still be valid on the server.
		session_store_error = "store at %s is not a JSON object" % session_store_path
		return false
	var stored_id = parsed.get("session_id")
	var stored_token = parsed.get("session_token")
	if typeof(stored_id) == TYPE_STRING and not str(stored_id).is_empty():
		session_id = str(stored_id)
	if typeof(stored_token) == TYPE_STRING and not str(stored_token).is_empty():
		session_token = str(stored_token)
		session_token_issued = true
	# A key that will not load is reported and IGNORED: an unusable private key
	# must not stop the session from resuming, and it is not a reason to
	# overwrite the store. `_ensure_signing_key` generates a fresh one later if
	# signing is on, which costs this host its old proof but not its crowd.
	var stored_priv = parsed.get("signing_private_key")
	if signing_enabled and typeof(stored_priv) == TYPE_STRING and not str(stored_priv).is_empty():
		var restored := CryptoKey.new()
		if restored.load_from_string(str(stored_priv), false) == OK:
			_signing_key = restored
			signing_public_key_pem = restored.save_to_string(true)
			var stored_pub = parsed.get("signing_public_key")
			if typeof(stored_pub) == TYPE_STRING and not str(stored_pub).is_empty():
				signing_public_key_pem = str(stored_pub)
			signing_key_id = _sha256_hex(_pem_body_bytes(signing_public_key_pem)).substr(0, 16)
		else:
			signing_store_error = "stored signing key could not be loaded"
	session_loaded = true
	session_store_error = ""
	return true

## Resolve where the keyring lives for this process.
func _resolve_keyring_path() -> String:
	return _encrypted_store.resolve_keyring_path(session_keyring_path)

## Build the encrypted container for the current identity, creating the keyring
## on first use. Split out because `save_session` needs to know WHY it failed: a
## missing keyring directory and a corrupted one call for different answers.
func _build_encrypted_store_text(record: Dictionary) -> Dictionary:
	var keyring := _encrypted_store.load_or_create_keyring(_resolve_keyring_path())
	if not keyring["ok"]:
		return {"ok": false, "reason": str(keyring["reason"])}
	session_keyring_path_resolved = str(keyring["path"])
	session_keyring_created = bool(keyring["created"])
	return _encrypted_store.encrypt(session_id, record, keyring["key"])

## The record that goes into the store. One place, so the encrypted and the
## opted-out plaintext path cannot drift into storing different things.
func _session_record() -> Dictionary:
	return {
		"session_token": session_token,
		# The private key is written too, and this is the whole point of the
		# feature: a host that loses its private key across a restart can no longer
		# PROVE itself, only name itself.
		"signing_private_key": _signing_key.save_to_string(false) if not (_signing_key == null) else "",
		"signing_public_key": signing_public_key_pem,
		"saved_at_unix": int(Time.get_unix_time_from_system())
	}

## Write this host's identity to the store. Returns true when it was written.
##
## ENCRYPTED BY DEFAULT, and the failure mode matters more than the happy path: if
## the keyring cannot be used, this REFUSES and reports why instead of quietly
## writing a plaintext credential. A silent downgrade would be invisible, and the
## whole reason this file changed is that a readable credential on disk is the
## leak that actually happens — a backup, a support bundle, a synced folder.
func save_session() -> bool:
	if session_store_path.is_empty():
		session_store_error = "persist_session is on but session_store_path is empty"
		return false

	var record := _session_record()
	var encryption := _build_encrypted_store_text(record)
	var text := ""
	if encryption["ok"]:
		text = str(encryption["text"])
		session_store_protection = "ENCRYPTED"
	elif session_store_allow_plaintext and str(encryption["reason"]) == _encrypted_store.REASON_KEYRING_UNAVAILABLE:
		# The host asked for this, and `session_store_protection` says so. Kept
		# NARROW on purpose: only an environment with no keyring directory at all
		# reaches here. A keyring that exists but will not parse is refused below,
		# because that one may be recoverable and abandoning it silently would cost
		# the host a store it can still read.
		text = JSON.stringify({
			"session_id": session_id,
			"session_token": record["session_token"],
			"signing_private_key": record["signing_private_key"],
			"signing_public_key": record["signing_public_key"],
			"saved_at_unix": record["saved_at_unix"]
		})
		session_store_protection = "PLAINTEXT_BY_REQUEST"
	else:
		session_store_error = str(encryption["reason"])
		return false

	var directory := session_store_path.get_base_dir()
	if not directory.is_empty():
		DirAccess.make_dir_recursive_absolute(directory)
	# Written to a temporary file and RENAMED into place, because a half-written
	# store is precisely the loss persistence exists to prevent: the crash that
	# motivates it is also the crash that can truncate it.
	var staging := "%s.tmp" % session_store_path
	var file := FileAccess.open(staging, FileAccess.WRITE)
	if file == null:
		session_store_error = "cannot write %s (err %d)" % [staging, FileAccess.get_open_error()]
		return false
	file.store_string(text)
	file.close()
	var moved := DirAccess.rename_absolute(staging, session_store_path)
	if moved != OK:
		session_store_error = "cannot replace %s (err %d)" % [session_store_path, moved]
		return false
	session_persisted = true
	session_store_error = ""
	return true

## True when the store ON DISK exposes this host's credential or private key.
##
## A HOST-FACING DIAGNOSTIC rather than a test hook: it is the one question an
## operator actually has about a persisted credential, and answering it from
## inside the client means the answer cannot drift from the format the client
## actually writes. Reads the file, so it is called deliberately and not per frame.
func store_exposes_secrets() -> bool:
	if not FileAccess.file_exists(session_store_path):
		return false
	var file := FileAccess.open(session_store_path, FileAccess.READ)
	if file == null:
		return false
	var raw := file.get_as_text()
	file.close()
	if not session_token.is_empty() and raw.contains(session_token):
		return true
	if not (_signing_key == null):
		var private_key := _signing_key.save_to_string(false)
		if not private_key.is_empty() and raw.contains(private_key):
			return true
	return false

## Forget the stored identity. The host keeps running with whatever it holds in
## memory and the next process starts as a stranger, which is the honest
## counterpart to revoking the session on the server.
func clear_session() -> void:
	if not session_store_path.is_empty() and FileAccess.file_exists(session_store_path):
		var err := DirAccess.remove_absolute(session_store_path)
		if err != OK:
			session_store_error = "cannot remove %s (err %d)" % [session_store_path, err]
	session_persisted = false
	session_loaded = false
	session_token_issued = false
	session_token = ""
	# The key goes with the identity it belongs to: a host that has forgotten
	# which session it was has no session left for the key to prove.
	_signing_key = null
	signing_public_key_pem = ""
	signing_key_id = ""
	signing_key_registered = false
	ws_authenticated = false

# -----------------------------------------------------------------------------
# Request signing helpers
# -----------------------------------------------------------------------------

func _now_ms() -> int:
	return int(Time.get_unix_time_from_system() * 1000.0)

func _new_nonce() -> String:
	return Crypto.new().generate_random_bytes(16).hex_encode()

## The decoded base64 body of a PEM, which IS the SPKI DER. Its SHA-256 is the
## fingerprint the server computes from the same PEM, so both sides agree on the
## key id without either sharing anything secret.
func _pem_body_bytes(pem: String) -> PackedByteArray:
	var body := ""
	for line in pem.split("\n"):
		var trimmed := line.strip_edges()
		if trimmed.is_empty() or trimmed.begins_with("-----"):
			continue
		body += trimmed
	if body.is_empty():
		return PackedByteArray()
	return Marshalls.base64_to_raw(body)

func _sha256_hex(data: PackedByteArray) -> String:
	var ctx := HashingContext.new()
	ctx.start(HashingContext.HASH_SHA256)
	ctx.update(data)
	return ctx.finish().hex_encode()

## Generate this host's keypair. Called once from `_ready`, because RSA-2048
## generation is slow enough to be visible if it happened mid-frame.
func _ensure_signing_key() -> bool:
	if not signing_enabled:
		return false
	if not (_signing_key == null):
		return true
	var fresh := Crypto.new().generate_rsa(2048)
	if fresh == null:
		signing_store_error = "could not generate an RSA key for request signing"
		return false
	_signing_key = fresh
	signing_public_key_pem = fresh.save_to_string(true)
	signing_key_id = _sha256_hex(_pem_body_bytes(signing_public_key_pem)).substr(0, 16)
	return true

func _rsa_sign(message: String) -> String:
	if _signing_key == null:
		return ""
	var crypto := Crypto.new()
	var ctx := HashingContext.new()
	ctx.start(HashingContext.HASH_SHA256)
	ctx.update(message.to_utf8_buffer())
	var digest := ctx.finish()
	return Marshalls.raw_to_base64(crypto.sign(HashingContext.HASH_SHA256, digest, _signing_key))

## The exact bytes RequestSigning.js verifies (see the format note above).
func _canonical_http(method: String, target: String, body: String, issued_at: int, nonce: String) -> String:
	return "FEAR-AI-SIGN-V1\nHTTP\n%s\n%s\n%s\n%s\n%d\n%s\n" % [
		method.to_upper(), target, _sha256_hex(body.to_utf8_buffer()), session_id, issued_at, nonce
	]

func _canonical_ws(challenge: String) -> String:
	return "FEAR-AI-SIGN-V1\nWS\n%s\n%s\n" % [challenge, session_id]

## The request target as the server sees it: path only, no scheme or host.
func _target_from_url(url: String) -> String:
	var marker := url.find("://")
	if marker < 0:
		return url
	var slash := url.find("/", marker + 3)
	return "/" if slash < 0 else url.substr(slash)

## Sign and send one control-plane request.
##
## The body is stringified ONCE and both signed and sent: the signature covers
## those exact bytes, so re-stringifying it on the way out (key order, float
## rendering) would make every signature fail as invalid.
func _signed_request(http: HTTPRequest, url: String, payload: Dictionary) -> int:
	var body := JSON.stringify(payload)
	var headers := PackedStringArray(["Content-Type: application/json"])
	# Signing starts only once the server has CONFIRMED the key. Signing the very
	# first claim would be refused as an unknown key (no session exists yet for the
	# key to belong to), which does not merely waste a request: the claim that
	# carries the public key is the one that registers it, so refusing it would
	# leave the host unable to ever establish one.
	if signing_enabled and signing_key_registered and not (_signing_key == null) and not session_id.is_empty():
		var issued_at := _now_ms()
		var nonce := _new_nonce()
		var signature := _rsa_sign(_canonical_http("POST", _target_from_url(url), body, issued_at, nonce))
		if not signature.is_empty():
			headers.append("x-fear-signature-session: %s" % session_id)
			headers.append("x-fear-signature-issued-at: %d" % issued_at)
			headers.append("x-fear-signature-nonce: %s" % nonce)
			headers.append("x-fear-signature: %s" % signature)
			headers.append("x-fear-signature-algorithm: RS256")
			if not signing_key_id.is_empty():
				headers.append("x-fear-signature-key-id: %s" % signing_key_id)
			signing_requests_signed += 1
	return http.request(url, headers, HTTPClient.METHOD_POST, body)

## Answer the server's per-connection challenge.
##
## This is what makes a stolen token insufficient on the WebSocket: the question
## is generated by the server, used once and thrown away, so there is nothing on
## the wire worth capturing and replaying.
func _answer_auth_challenge(data: Dictionary) -> void:
	signing_challenge = str(data.get("challenge", ""))
	if not signing_enabled or _signing_key == null or signing_challenge.is_empty():
		return
	if session_id.is_empty() or not is_instance_valid(_socket):
		return
	var signature := _rsa_sign(_canonical_ws(signing_challenge))
	if signature.is_empty():
		return
	_socket.send_text(JSON.stringify({
		"type": "AUTH_RESPONSE",
		"challenge": signing_challenge,
		"session_id": session_id,
		"signature": signature
	}))

## Find the refusal reason for an id, or "" when the server did not refuse it.
func _refusal_for(refused: Array, agent_id: String) -> String:
	for entry in refused:
		if entry is Dictionary and str(entry.get("agent_id", "")) == agent_id:
			return str(entry.get("reason", "REFUSED"))
	return ""

## Consume an unregister-batch response. Both `unregistered` and `not_found`
## are terminal: the caller asked for the agent to be gone and it is gone. Only
## a failed or unparsable response puts ids back.
func _handle_batch_unregistration(in_flight: Dictionary, ok: bool, response_code: int, body: PackedByteArray) -> void:
	var sent: Array = in_flight.get("agent_ids", [])
	var consumed: Array[String] = []
	for i in range(mini(sent.size(), _unregister_queue.size())):
		consumed.append(_unregister_queue[i])
	var remaining: Array[String] = []
	for i in range(consumed.size(), _unregister_queue.size()):
		remaining.append(_unregister_queue[i])
	_unregister_queue = remaining

	if response_code == 404:
		# This server predates the batch route. Degrade to single requests for
		# the rest of the session rather than retrying an endpoint that is not
		# there, and keep the ids that were already taken off the queue.
		_batch_control_supported = false
		batch_control_unsupported = true
		_requeue_unregistrations(consumed)
		return

	if not ok:
		_requeue_unregistrations(consumed)
		return

	batched_unregistration_requests += 1
	# Both `unregistered` and `not_found` are terminal, so a removed id needs no
	# further handling. A REJECTED id is different: the server did not remove it,
	# and it is not going back on the queue either, so it is reported once to the
	# host rather than disappearing.
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	var rejected: Array = []
	if parsed is Dictionary and parsed.get("rejected") is Array:
		rejected = parsed["rejected"]
	unregistration_rejections += rejected.size()
	for entry in rejected:
		if not (entry is Dictionary):
			continue
		var rid := str(entry.get("agent_id", ""))
		var idx := int(entry.get("index", -1))
		if rid.strip_edges().is_empty() and idx >= 0 and idx < consumed.size():
			rid = consumed[idx]
		agent_registration_failed.emit(rid, "unregister_rejected")
	# REFUSED is a different outcome from rejected: the entry was well-formed but
	# a LIVE session owns the agent, so this host may not remove it. Counted and
	# reported per id for the same reason as rejected - an id the host believes it
	# retired while the server still holds it has nothing to debug.
	var refused_teardown: Array = []
	if parsed is Dictionary and parsed.get("refused") is Array:
		refused_teardown = parsed["refused"]
	unregistration_refusals += refused_teardown.size()
	for entry in refused_teardown:
		if not (entry is Dictionary):
			continue
		agent_registration_failed.emit(str(entry.get("agent_id", "")), "unregister_refused_not_owner")

func _requeue_unregistrations(ids: Array[String]) -> void:
	var merged: Array[String] = []
	merged.append_array(ids)
	merged.append_array(_unregister_queue)
	_unregister_queue = merged

## Move queued batch work onto the singular control path. Used only after a 404
## proved the batch routes absent, so its cost never lands on a current server.
func _drain_to_legacy_control_queue() -> void:
	while not _unregister_queue.is_empty():
		var id: String = _unregister_queue.pop_front()
		individual_unregistration_requests += 1
		var unreg_payload: Dictionary = { "agent_id": id }
		if not session_id.is_empty():
			unreg_payload["session_id"] = session_id
			if not session_token.is_empty():
				unreg_payload["session_token"] = session_token
		_control_queue.append({
			"kind": "unregister",
			"path": "/api/v1/unregister",
			"payload": unreg_payload
		})
	while not _trauma_queue.is_empty():
		var zone: Dictionary = _trauma_queue.pop_front()
		_control_queue.append({
			"kind": "trauma",
			"path": "/api/v1/trauma",
			"payload": zone
		})

## Consume a trauma-batch response. Zones are world state, so partial
## application is a normal outcome: only the entries the server explicitly
## rejected are dropped, and they are counted rather than retried, because a
## malformed zone will be malformed on the next attempt too.
func _handle_batch_trauma(in_flight: Dictionary, ok: bool, response_code: int, body: PackedByteArray) -> void:
	var sent: Array = in_flight.get("zones", [])
	var consumed: int = mini(sent.size(), _trauma_queue.size())
	var remaining: Array[Dictionary] = []
	for i in range(consumed, _trauma_queue.size()):
		remaining.append(_trauma_queue[i])
	_trauma_queue = remaining

	if response_code == 404:
		_batch_control_supported = false
		batch_control_unsupported = true
		_requeue_trauma(sent)
		return

	if not ok:
		_requeue_trauma(sent)
		return

	var applied: int = 0
	var rejected: Array = []
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if parsed is Dictionary:
		applied = int(parsed.get("count", 0))
		if parsed.get("rejected") is Array:
			rejected = parsed["rejected"]
	batched_trauma_requests += 1
	trauma_zones_added += applied
	# Entries the server refused are counted, never retried: a malformed zone
	# would be malformed again, and a silent drop would look like success.
	trauma_zones_rejected += rejected.size()
	trauma_zone_added.emit(applied > 0)

func _requeue_trauma(zones: Array) -> void:
	if zones.is_empty():
		return
	var restored: Array[Dictionary] = []
	for zone in zones:
		if zone is Dictionary:
			restored.append(zone)
	restored.append_array(_trauma_queue)
	_trauma_queue = restored

func _send_handshake() -> void:
	var handshake = {
		"type": "HANDSHAKE_REQUEST",
		"protocol_version": "1.0.0",
		"client_id": "godot_%d" % Time.get_ticks_msec(),
		# Naming the session on the handshake binds this socket to the host's
		# identity immediately, so the server sees the host as live from the
		# first message rather than only once it registers an agent.
		"session_id": session_id,
		"engine": "Godot4"
	}
	# The token lets the server bind this socket to the session on proof rather
	# than on a name, which is what stops a rival from attaching to it.
	if not session_token.is_empty():
		handshake["session_token"] = session_token
	_socket.send_text(JSON.stringify(handshake))

func _encode_binary_observations(observations: Array[Dictionary], _dt: float) -> PackedByteArray:
	var spb = StreamPeerBuffer.new()
	spb.big_endian = false
	
	# Header (16 bytes)
	spb.put_u32(BINARY_MAGIC)
	spb.put_u8(BINARY_PROTOCOL_VERSION)
	spb.put_u8(FRAME_TYPE_OBSERVATION_BATCH)
	spb.put_u16(0)
	spb.put_u32(Engine.get_physics_frames())
	spb.put_u32(observations.size())
	
	# Records (32 bytes each)
	for i in range(observations.size()):
		var obs = observations[i]
		var entity_id: int = i
		if obs.has("entity_id"):
			entity_id = int(obs["entity_id"])
		elif obs.has("agent_id"):
			var clean_id = str(obs["agent_id"]).replace("agent_", "")
			if clean_id.is_valid_int():
				entity_id = clean_id.to_int()
		
		var px: float = 0.0
		var py: float = 0.0
		var pz: float = 0.0
		if obs.has("position"):
			var pos = obs["position"]
			px = float(pos.get("x", 0.0))
			py = float(pos.get("y", 0.0))
			pz = float(pos.get("z", 0.0))
		elif obs.has("x"):
			px = float(obs.get("x", 0.0))
			py = float(obs.get("y", 0.0))
			pz = float(obs.get("z", 0.0))
			
		var threat_dist: float = float(obs.get("threat_distance", obs.get("threatDistance", 999.0)))
		var threat_int: float = float(obs.get("threat_intensity", obs.get("threatIntensity", 0.0)))
		var health_u16: int = int(clamp(float(obs.get("health", 1.0)), 0.0, 1.0) * 65535.0)
		var energy_u16: int = int(clamp(float(obs.get("energy", 1.0)), 0.0, 1.0) * 65535.0)
		var stimulus_type: int = int(obs.get("stimulus_type", 0))
		var flags: int = 0
		if obs.get("in_combat", false) or obs.get("inCombat", false):
			flags |= 0x01
		if obs.get("provoked", false):
			flags |= 0x02
			
		spb.put_u32(entity_id)
		spb.put_float(px)
		spb.put_float(py)
		spb.put_float(pz)
		spb.put_float(threat_dist)
		spb.put_float(threat_int)
		spb.put_u16(health_u16)
		spb.put_u16(energy_u16)
		spb.put_u8(stimulus_type)
		spb.put_u8(flags)
		spb.put_u16(0) # padding
		
	return spb.data_array

func _process_binary_message(packet: PackedByteArray) -> void:
	if packet.size() < HEADER_SIZE_BYTES:
		return
		
	var spb = StreamPeerBuffer.new()
	spb.data_array = packet
	spb.big_endian = false
	
	var magic = spb.get_u32()
	if magic != BINARY_MAGIC:
		return
	var _version = spb.get_u8()
	var frame_type = spb.get_u8()
	var _flags = spb.get_u16()
	var tick = spb.get_u32()
	var count = spb.get_u32()
	
	if frame_type != FRAME_TYPE_INTENT_BATCH:
		return
		
	for i in range(count):
		if spb.get_position() + RECORD_SIZE_BYTES > packet.size():
			break
			
		var entity_id = spb.get_u32()
		var fear_u16 = spb.get_u16()
		var anger_u16 = spb.get_u16()
		var dominance_u16 = spb.get_u16()
		var urgency_u16 = spb.get_u16()
		
		var intent_code = spb.get_u8()
		var _posture_code = spb.get_u8()
		var band_code = spb.get_u8()
		var rec_flags = spb.get_u8()
		
		var vx = spb.get_float()
		var vy = spb.get_float()
		var vz = spb.get_float()
		var _pad = spb.get_u32()
		
		var fear = float(fear_u16) / 65535.0
		var anger = float(anger_u16) / 65535.0
		var dominance = float(dominance_u16) / 65535.0
		var urgency = float(urgency_u16) / 65535.0
		var intent_str = INTENT_MAP.get(intent_code, "IDLE_VIGILANT")
		var band_str = BAND_MAP.get(band_code, "CALM")
		
		var agent_id = "agent_%d" % entity_id
		var agent_output = {
			"agent_id": agent_id,
			"tick": tick,
			"state": {
				"fear": fear,
				"anger": anger,
				"dominance": dominance,
				"urgency": urgency,
				"primary_intent": intent_str,
				"fear_band": band_str,
				"is_panicking": (rec_flags & 0x01) != 0,
				"in_combat": (rec_flags & 0x02) != 0,
				"vector_hint": Vector3(vx, vy, vz)
			}
		}
		
		agent_state_received.emit(agent_id, agent_output)

var _is_http_in_flight: bool = false

func _send_http_batch(payload: Dictionary) -> void:
	if _is_http_in_flight or not is_instance_valid(_http_request):
		return
	_is_http_in_flight = true
	var url = "http://%s:%d/api/v1/tick" % [server_host, server_port]
	var headers = ["Content-Type: application/json"]
	var err = _http_request.request(url, headers, HTTPClient.METHOD_POST, JSON.stringify(payload))
	if err != OK:
		_is_http_in_flight = false

func _on_http_response(_result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	_is_http_in_flight = false
	if response_code == 200:
		var text = body.get_string_from_utf8()
		_process_message(text)

func _process_message(json_str: String) -> void:
	var json = JSON.new()
	if json.parse(json_str) == OK:
		var data = json.get_data()
		if data is Dictionary and data.has("results"):
			for agent_output in data["results"]:
				if agent_output.has("agent_id"):
					agent_state_received.emit(agent_output["agent_id"], agent_output)
		# Request signing: answer the challenge this server issued on this
		# connection, and note when an answer was accepted or refused.
		if data is Dictionary and data.get("type") == "AUTH_CHALLENGE":
			_answer_auth_challenge(data)
		elif data is Dictionary and data.get("type") == "AUTH_ACK":
			ws_authenticated = true
		elif data is Dictionary and str(data.get("code", "")).begins_with("SIGNATURE"):
			signing_refusals += 1
