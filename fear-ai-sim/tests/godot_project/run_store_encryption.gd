# run_store_encryption.gd
#
# THE ENCRYPTED STORE, IN ENGINE, AGAINST THE NODE REFERENCE.
#
# WHY THIS IS A CROSS-LANGUAGE RUN AND NOT A GODOT UNIT TEST
# The store format exists so that a credential written by one runtime can be read
# by another: a Godot host writes it, a Node tool inspects it, a Unity build reads
# it back. A round trip entirely inside Godot would pass with any self-consistent
# layout — including one that is wrong in exactly the way that matters, such as
# padding applied by the library instead of by the caller. So this script does two
# things that a self-round-trip cannot:
#
#   A. it DECRYPTS a container produced by `EncryptedStore.js`, the Node reference
#      that is the authority for the byte layout; and
#   B. it WRITES a container from a pinned password, salt and IV, which the Node
#      probe then requires to be byte-identical to its own output for the same
#      inputs, and decrypts.
#
# "Byte-identical" is the assertion that matters. A format that only has to be
# self-consistent can be lenient on read (re-serialise, tolerate whitespace, accept
# either padding convention); a format two languages agree on cannot be.
#
# WHAT THE FAILURE CASES PROVE
# A store that cannot be opened must fail for a REPORTED reason. The envelope is
# authenticated before anything is decrypted, so an edited field is TAMPERED
# rather than a plausible half-record, and a wrong password collapses into the same
# answer by design (telling the two apart would confirm which one a caller has).
# A corrupt file is refused and LEFT ALONE.
#
# Hard Rule 9 compliant: a standalone deterministic in-engine run, not an
# automated test runner, and not wired into `npm test`. Driven by
# `tools/verification/verify_store_encryption.mjs`, which supplies the artifacts.
#
# Usage:
#   godot --path . --headless --script run_store_encryption.gd -- \
#     --node-store=<path> --emit=<path> --password=<plain>

extends SceneTree

const FEAR_ENCRYPTED_STORE = preload("res://addons/fear_ai/fear_encrypted_store.gd")

## The vector, fixed on both sides. A random salt would prove only that two
## implementations are both random.
const VECTOR_PASSWORD := "fear-ai-interop-password"
const VECTOR_ITERATIONS := 1000
const VECTOR_NAME := "interop_host"
const VECTOR_TOKEN := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const VECTOR_PRIVATE_KEY := "FAKE-PRIVATE-KEY-MATERIAL"
const VECTOR_PUBLIC_KEY := "-----BEGIN PUBLIC KEY-----"
const VECTOR_SAVED_AT := 1758400000

var _frames := 0
var _passed := 0
var _failed := 0


func _init() -> void:
	print("==================================================================================")
	print("     GODOT 4.6 IN-ENGINE: ENCRYPTED STORE INTEROP WITH THE NODE REFERENCE        ")
	print("==================================================================================")
	print("Godot Engine Version: ", Engine.get_version_info()["string"])

	var node_store := ""
	var emit_path := ""
	var password := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--node-store="):
			node_store = arg.substr("--node-store=".length())
		elif arg.begins_with("--emit="):
			emit_path = arg.substr("--emit=".length())
		elif arg.begins_with("--password="):
			password = arg.substr("--password=".length())

	var store = FEAR_ENCRYPTED_STORE.new()

	if node_store.strip_edges().is_empty() or emit_path.strip_edges().is_empty():
		# Nothing to do without the other side's artifacts, and reporting a pass
		# here would be the exact dishonesty this run exists to rule out.
		print("[SKIP] --node-store= and --emit= are both required; this run is an INTEROP run")
		print("STORE_ENCRYPTION=SKIPPED")
		quit(0)
		return
	if password.strip_edges().is_empty():
		print("[FAIL] --password= is required; the two sides must agree on the passphrase")
		print("STORE_ENCRYPTION=FAILED")
		quit(1)
		return

	var password_bytes := password.to_utf8_buffer()

	# -------------------------------------------------------------------------
	# A. Read what Node wrote, using only the passphrase.
	# -------------------------------------------------------------------------
	print("\n[A] decrypt a container produced by EncryptedStore.js")
	var handle := FileAccess.open(node_store, FileAccess.READ)
	if handle == null:
		print("[FAIL] cannot read ", node_store)
		print("STORE_ENCRYPTION=FAILED")
		quit(1)
		return
	var node_text := handle.get_as_text()
	handle.close()

	_check("the container is recognised by its version line", store.looks_encrypted(node_text))
	_check("the session NAME is readable WITHOUT the passphrase",
		store.read_name(node_text) == VECTOR_NAME, "got '%s'" % store.read_name(node_text))
	_check("the credential is NOT readable in the file text",
		not node_text.contains(VECTOR_TOKEN))
	_check("the private key is NOT readable in the file text",
		not node_text.contains(VECTOR_PRIVATE_KEY))

	var opened := store.decrypt(node_text, password_bytes)
	if opened["ok"]:
		_passed += 1
		print("  [PASS] the container opens with the reference passphrase")
		var record: Dictionary = opened["record"]
		_check("the recovered name matches", record["session_id"] == VECTOR_NAME, str(record["session_id"]))
		_check("the recovered credential matches", record["session_token"] == VECTOR_TOKEN,
			"len=%d" % str(record["session_token"]).length())
		_check("the recovered private key matches", record["signing_private_key"] == VECTOR_PRIVATE_KEY)
		_check("the recovered public key matches", record["signing_public_key"] == VECTOR_PUBLIC_KEY)
		_check("the recovered timestamp matches", record["saved_at_unix"] == VECTOR_SAVED_AT,
			str(record["saved_at_unix"]))
	else:
		_failed += 1
		print("  [FAIL] the container would not open: ", str(opened["reason"]))

	# -------------------------------------------------------------------------
	# B. The failure surface. Each one must be a REPORTED refusal.
	# -------------------------------------------------------------------------
	print("\n[B] refusals are reported, not guessed at")
	var wrong := store.decrypt(node_text, "not-the-passphrase".to_utf8_buffer())
	_check("a wrong passphrase is refused as TAMPERED, the same answer as an edit",
		wrong["ok"] == false and str(wrong["reason"]) == store.REASON_TAMPERED, str(wrong["reason"]))

	var edited := node_text.replace("name=%s" % VECTOR_NAME, "name=someone_elses_host")
	_check("editing the plaintext name is refused by the MAC",
		store.decrypt(edited, password_bytes)["reason"] == store.REASON_TAMPERED)

	# Flip one character of the ciphertext to another VALID base64 character, so
	# this exercises the MAC rather than a decoding error.
	var ct_marker := node_text.find("\nct=")
	if ct_marker >= 0:
		var ct_start := ct_marker + 4
		var original_char := node_text[ct_start]
		var replacement := "A" if original_char != "A" else "B"
		var flipped := node_text.substr(0, ct_start) + replacement + node_text.substr(ct_start + 1)
		_check("a single flipped ciphertext character is refused by the MAC",
			store.decrypt(flipped, password_bytes)["reason"] == store.REASON_TAMPERED)
		_check("the flip was a real change", flipped != node_text)

	var truncated := node_text.substr(0, int(node_text.length() / 2))
	_check("a truncated container is refused rather than partially honoured",
		store.decrypt(truncated, password_bytes)["ok"] == false)

	_check("an empty file is refused", store.decrypt("", password_bytes)["ok"] == false)
	_check("a foreign version line is refused as unsupported",
		store.decrypt(node_text.replace("FEAR-AI-STORE-V1", "FEAR-AI-STORE-V2"), password_bytes)["reason"]
			== store.REASON_UNSUPPORTED_VERSION)
	_check("a downgraded cipher is refused rather than attempted",
		store.decrypt(node_text.replace("cipher=aes-256-cbc", "cipher=aes-128-ecb"), password_bytes)["reason"]
			== store.REASON_UNSUPPORTED_CIPHER)

	# -------------------------------------------------------------------------
	# C. Write our own, from the SAME pinned vector, for Node to compare.
	# -------------------------------------------------------------------------
	print("\n[C] write a container from the pinned vector")
	var salt := PackedByteArray()
	var iv := PackedByteArray()
	for i in 16:
		salt.append(i)
		iv.append(i)

	var built := store.encrypt_with(VECTOR_NAME, {
		"session_token": VECTOR_TOKEN,
		"signing_private_key": VECTOR_PRIVATE_KEY,
		"signing_public_key": VECTOR_PUBLIC_KEY,
		"saved_at_unix": VECTOR_SAVED_AT
	}, password_bytes, VECTOR_ITERATIONS, salt, iv)

	if not built["ok"]:
		_failed += 1
		print("  [FAIL] could not build a container: ", str(built["reason"]))
	else:
		_passed += 1
		var text := str(built["text"])
		print("  [PASS] built a container")
		_check("the container declares the version the others expect",
			text.begins_with("FEAR-AI-STORE-V1\n"))
		_check("the declared iteration count is the one that was used",
			text.contains("\niter=%d\n" % VECTOR_ITERATIONS))
		_check("the name is present in the clear", text.contains("\nname=%s\n" % VECTOR_NAME))
		_check("our own container does NOT leak the credential", not text.contains(VECTOR_TOKEN))
		_check("our own container does NOT leak the private key", not text.contains(VECTOR_PRIVATE_KEY))
		_check("the envelope INVERTS: our own container still opens", store.decrypt(text, password_bytes)["ok"])
		_check("our own container is refused under a wrong passphrase",
			store.decrypt(text, "nope".to_utf8_buffer())["reason"] == store.REASON_TAMPERED)

		var writer := FileAccess.open(emit_path, FileAccess.WRITE)
		if writer == null:
			_failed += 1
			print("  [FAIL] cannot write ", emit_path)
		else:
			writer.store_string(text)
			writer.close()
			_passed += 1
			print("  [PASS] wrote it for the Node side at ", emit_path)

	# -------------------------------------------------------------------------
	# D. The keyring file, which is the half that must NOT travel with the store.
	# -------------------------------------------------------------------------
	print("\n[D] the keyring")
	var keyring_path := "%s.keyring" % emit_path
	var keyring := store.load_or_create_keyring(keyring_path)
	_check("a keyring is created on demand", keyring["ok"] and keyring["created"])
	_check("the keyring holds a 256-bit key", keyring["key"].size() == 32, "size=%d" % keyring["key"].size())
	var again := store.load_or_create_keyring(keyring_path)
	_check("the SAME keyring is returned on the next load, not a new one",
		again["ok"] and again["created"] == false and again["key"] == keyring["key"])
	var keyring_handle := FileAccess.open(keyring_path, FileAccess.READ)
	_check("the keyring is on disk", keyring_handle != null)
	if keyring_handle != null:
		var keyring_text := keyring_handle.get_as_text()
		keyring_handle.close()
		_check("the keyring is not the store", not keyring_text.contains(VECTOR_TOKEN))
		_check("its version line is the one this format expects",
			keyring_text.begins_with("FEAR-AI-KEYRING-V1\n"))
	var malformed := store.parse_keyring_text("FEAR-AI-KEYRING-V1\nkey=short\n")
	_check("a truncated keyring is refused rather than deriving a short key", malformed.is_empty())
	_check("a foreign keyring version is refused",
		store.parse_keyring_text("SOMETHING-ELSE\nkey=AAAA\n").is_empty())

	# And the platform resolution rule that keeps the key out of the save tree.
	print("\n[E] the keyring's default location is OUTSIDE the save tree")
	var resolved := store.resolve_keyring_path("")
	print("  resolved keyring path: ", ("(none)" if resolved.is_empty() else resolved))
	_check("a default keyring path is resolvable on this platform", not resolved.is_empty())
	_check("an explicit override wins", store.resolve_keyring_path("/tmp/explicit") == "/tmp/explicit")

	print("\n----------------------------------------------------------------------------------")
	print("STORE ENCRYPTION SUMMARY: ", _passed, " passed, ", _failed, " failed")
	if _failed == 0:
		print("STORE_ENCRYPTION=PASSED")
		quit(0)
	else:
		print("STORE_ENCRYPTION=FAILED")
		quit(1)


func _check(label: String, condition: bool, detail: String = "") -> void:
	if condition:
		_passed += 1
		print("  [PASS] ", label)
	else:
		_failed += 1
		print("  [FAIL] ", label, (" — " + detail) if not detail.is_empty() else "")


func _process(_delta: float) -> bool:
	_frames += 1
	if _frames > 600:
		print("[FAIL] Watchdog: the run never reached its summary.")
		print("STORE_ENCRYPTION=FAILED")
		quit(3)
		return true
	return false
