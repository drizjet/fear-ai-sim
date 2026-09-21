extends SceneTree

## In-engine proof that the Godot adapter can PROVE itself with a key instead of
## only naming itself with a token.
##
## Driven by tools/verification/verify_transport_signing.mjs against a real
## `FearServer` started with `--signature-policy=required`, which is the only
## setting under which a session's own token stops being enough.
##
## WHAT THIS IS FOR
## The canonical signing input is a byte string shared by five languages, and the
## failure mode of getting it wrong is not a crash: it is a server that answers 401
## and looks exactly like a broken key. This script is the Godot half of the
## evidence that the string matches, checked against the REAL server rather than
## against a copy of the format.
##
## It also covers the interop trap that cost a debugging cycle: Godot's JSON parser
## returns numbers as floats, so a timestamp read back out of JSON renders as
## "1758400000000.0" and every signature is refused. `_now_ms()` returns an int,
## and the adapter never round-trips the timestamp through JSON.
##
## WHY THE FIRST ASSERTIONS ARE NOT IN `_init`
## They were, and they failed for a reason that had nothing to do with signing:
## `root.add_child()` called from `SceneTree._init()` does not run the child's
## `_ready()` yet, so the adapter had not generated its key at the moment the check
## looked for it. Three assertions reported a missing key and a null fingerprint,
## which reads exactly like a broken keypair. The checks now wait for the node to
## actually be ready, which is also what a real host does before it claims
## anything, so the assertion order mirrors the lifecycle instead of fighting it.
##
## Hard Rule 9: a standalone deterministic script, not a test runner. Reads
## FEAR_AI_PORT from the environment; exits non-zero when an assertion fails.

var _client
var _frames := 0
var _phase := 0
var _passed := 0
var _failed := 0

const CROWD := ["godot_signing_01", "godot_signing_02", "godot_signing_03"]

func _check(label: String, condition: bool, detail: String = "") -> void:
	if condition:
		_passed += 1
		print("  [PASS] ", label)
	else:
		_failed += 1
		print("  [FAIL] ", label, (" — " + detail) if not detail.is_empty() else "")

func _init() -> void:
	print("================================================================================")
	print("  GODOT REQUEST SIGNING (RS256) vs A LIVE FearServer                              ")
	print("================================================================================")

	var port := int(OS.get_environment("FEAR_AI_PORT"))
	if port <= 0:
		print("[FAIL] FEAR_AI_PORT is not set; this script needs a running FearServer.")
		quit(2)
		return

	_client = preload("res://addons/fear_ai/fear_ai_client.gd").new()
	# Set BEFORE the node enters the tree: the key is generated in `_ready`, and a
	# host that turns signing on after its first claim sends that claim unsigned.
	_client.signing_enabled = true
	_client.server_host = "127.0.0.1"
	_client.server_port = port
	# The control plane is what is under test; a socket would add an async path to
	# a deterministic run.
	_client.use_websocket = false
	root.add_child(_client)

## The preflight, run once the client's `_ready` has actually executed.
func _preflight() -> void:
	_check("the adapter generated a signing key", _client._signing_key != null)
	_check("the public key is PEM the server can parse",
		_client.signing_public_key_pem.begins_with("-----BEGIN PUBLIC KEY-----") and
		_client.signing_public_key_pem.contains("-----END PUBLIC KEY-----"),
		_client.signing_public_key_pem.substr(0, 26))
	_check("the key id is a 16-character fingerprint of the key itself",
		_client.signing_key_id.length() == 16, _client.signing_key_id)
	_check("the canonical input renders the timestamp as an INTEGER",
		_client._canonical_http("POST", "/api/v1/reset", "{}", 1758400000000, "abcd").contains("\n1758400000000\n"),
		"a float here would be refused by the server as an invalid signature")
	_check("the canonical input ends with a newline and names the version first",
		_client._canonical_http("POST", "/api/v1/reset", "{}", 1758400000000, "abcd").begins_with("FEAR-AI-SIGN-V1\n"),
		_client._canonical_http("POST", "/api/v1/reset", "{}", 1758400000000, "abcd").substr(0, 18))

	_client.ensure_registered(CROWD[0])
	_client.ensure_registered(CROWD[1])
	_client.ensure_registered(CROWD[2])

func _process(_delta: float) -> bool:
	_frames += 1
	if _frames > 40000:
		print("[FAIL] timed out in phase ", _phase)
		_finish()
		return true

	# Wait for the real lifecycle rather than assuming `add_child` completed it.
	# A node that is ready but keyless with signing on fails the preflight below
	# on its own merits, so there is no second branch to keep in sync here.
	if not _client.is_node_ready() or _client._signing_key == null:
		return false

	match _phase:
		0:
			_preflight()
			_phase = 1
		1:
			if _client.registered_count() == CROWD.size() and _client.control_plane_idle():
				_check("the crowd registered while the key was being offered",
					_client.registration_failures == 0, "failures=%d" % _client.registration_failures)
				_check("the server CONFIRMED the key", _client.signing_key_registered)
				# The claim carrying the public key CANNOT be signed: no session
				# exists yet for it to belong to, so signing it would be refused as
				# an unknown key and the key would never be registered at all.
				_check("no request was signed before the server knew the key",
					_client.signing_requests_signed == 0, "signed=%d" % _client.signing_requests_signed)
				_client.ensure_unregistered(CROWD[2])
				_phase = 2
		2:
			if _client.registered_count() == CROWD.size() - 1 and _client.control_plane_idle():
				_check("a teardown AFTER key confirmation is signed",
					_client.signing_requests_signed >= 1, "signed=%d" % _client.signing_requests_signed)
				_check("the signed teardown was accepted, not refused",
					_client.signing_refusals == 0, "refusals=%d reason=%s" % [_client.signing_refusals, _client.signing_refusal_reason])
				_check("the adapter remembers which crowd it holds",
					_client.registered_count() == CROWD.size() - 1, "agents=%d" % _client.registered_count())
				_client.ensure_registered(CROWD[2])
				_phase = 3
		3:
			if _client.registered_count() == CROWD.size() and _client.control_plane_idle():
				_check("a signed registration after the key is confirmed also succeeds",
					_client.signing_refusals == 0 and _client.registration_failures == 0,
					"refusals=%d failures=%d" % [_client.signing_refusals, _client.registration_failures])
				_finish()
				return true
	return false

func _finish() -> void:
	print("--------------------------------------------------------------------------------")
	print("GODOT_SIGNING_KEY_ID=", _client.signing_key_id)
	print("GODOT_SIGNING_SIGNED=", _client.signing_requests_signed)
	print("GODOT_SIGNING_REFUSALS=", _client.signing_refusals)
	print("GODOT_SIGNING_AGENTS=", _client.registered_count())
	print("GODOT_SIGNING_SUMMARY: %d passed, %d failed" % [_passed, _failed])
	print("GODOT_SIGNING=%s" % ("PASSED" if _failed == 0 else "FAILED"))
	quit(0 if _failed == 0 else 1)
