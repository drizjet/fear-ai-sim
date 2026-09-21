# fear_encrypted_store.gd
#
# The persisted session credential and the host's private signing key, ENCRYPTED
# AT REST — a Godot implementation of the same container the Node reference
# writes, byte for byte.
#
# WHAT WAS WRONG BEFORE THIS EXISTED
# `FearAIClient.save_session()` wrote `session_id`, `session_token`,
# `signing_private_key` and `signing_public_key` as PLAINTEXT JSON. That file is
# a complete, copyable identity: it sits in `user://`, which is inside the game's
# save tree, so it travels in every backup, every synced folder, every support
# bundle and every crash dump. Losing it did not merely inconvenience the host —
# a full signing key in the clear made the `required` signing policy pointless
# against exactly the party most likely to have the file.
#
# WHAT THIS ACTUALLY BUYS, STATED WITHOUT EMBELLISHMENT
#   1. RELOCATION. The store alone is useless on another machine, in a backup or
#      in a repository, because the key material is not in the file and is not in
#      the same directory tree. This is the common leak path.
#   2. CASUAL INSPECTION. `grep -r` over a support bundle finds no credential.
#   3. TAMPERING BY EDITING. The envelope is authenticated, so a hand-edited store
#      is refused instead of half-honoured.
# It does NOT defend against someone who can read BOTH the store and the keyring
# on the same machine. That person can decrypt it. There is no hardware backing
# and no OS keystore integration, and the keyring's permissions are best-effort
# (`FileAccess` on Windows has no mode to set). Any claim stronger than "the file
# does not travel" would be false.
#
# WHY THE KEYRING IS A SEPARATE FILE IN A SEPARATE TREE
# The requirement is that a host decrypts its own store with NO involvement from
# the game code, which means the key must be readable by any process running as
# the same user. Given that, the only choice left is WHERE it lives, and the
# answer is "not inside the thing that gets backed up". So the keyring goes in the
# user-scoped CONFIGURATION directory (`%APPDATA%/FearAI` on Windows,
# `~/.config/fear-ai` elsewhere) while the store stays in `user://` under the
# game's data directory. A backup of the save tree therefore does not carry it.
# `FEAR_AI_KEYRING` or `session_keyring_path` overrides this; the probes use both.
#
# THE FORMAT IS THE POINT, AND IT IS BYTE-EXACT
# Node, Godot, and the Unity/C# adapter implement this file, so one wrong
# character produces a refusal that looks exactly like a wrong key. The layout is
# line-based with LF endings and no optional whitespace:
#
#   FEAR-AI-STORE-V1
#   kdf=pbkdf2-hmac-sha256
#   iter=<integer>
#   salt=<base64, 16 bytes>
#   cipher=aes-256-cbc
#   iv=<base64, 16 bytes>
#   name=<the session NAME, deliberately in the clear>
#   ct=<base64>
#   mac=<base64, 32 bytes>
#
# The MAC covers every byte from the start of the file through the newline that
# ends the `ct=` line — encrypt-then-MAC over the exact text, so there is no
# canonicalisation step for two languages to disagree about. `iter` is READ FROM
# THE FILE, never assumed, so a writer may choose its own cost.
#
# `name` IS DELIBERATELY PLAINTEXT. The whole ownership model rests on a name NOT
# being a credential (`session_id` is host-chosen and guessable; the token proves
# continuity), so keeping it readable costs nothing real and buys the first
# question anyone asks of a stray store: WHICH host is this? It is still inside
# the MAC, so it cannot be edited.
#
# THREE INTEROP TRAPS, ALL FOUND BY RUNNING IT RATHER THAN READING IT
#   1. PADDING IS THE CALLER'S JOB. Node's `createCipheriv` pads automatically;
#      Godot's `AESContext` does not, and for input that is not a multiple of the
#      block size it returns ZERO BYTES rather than erroring — a silent empty
#      result that would decode as a corrupt store. So PKCS#7 is applied here by
#      hand and Node's automatic padding is disabled on the other side.
#   2. `Marshalls.raw_to_base64` DOES NOT LINE-WRAP and does not use the URL
#      alphabet, which is required: a wrapped `ct=` line would break the
#      line-based container. Verified against Node before this file was written.
#   3. THE ENCRYPTED PAYLOAD IS JSON, AND KEY ORDER IS NOT PORTABLE. Godot's
#      `JSON.stringify` SORTS object keys BY DEFAULT (`sort_keys = true`) while
#      Node emits insertion order, so the keys, the values and the length were all
#      right and the ciphertext still diverged from its second base64 character —
#      which reads exactly like "the other side used a different key" and is
#      nothing of the sort. The default is not wrong; depending on it is. So
#      `sort_keys` is passed EXPLICITLY below and the Node side canonicalises the
#      same way, making the layout a property of the format rather than of a
#      caller's dictionary. Only bytes INSIDE the ciphertext changed, and a reader
#      parses JSON without caring about order, so older containers still open.
#      `full_precision` is likewise left at its default and is safe here ONLY
#      because every value in the payload is a string or an integer; a float would
#      need it set, and that is written down rather than left to be rediscovered.
#
# MEASURED COST, because it is a real hitch and not a detail to leave implicit:
# 60,000 PBKDF2 iterations over `hmac_digest` cost about 216 ms in Godot 4.6 on
# the recorded Windows machine. That happens once while loading and once per
# credential change — never per frame, never on the observation path.

extends RefCounted

const STORE_VERSION := "FEAR-AI-STORE-V1"
const KEYRING_VERSION := "FEAR-AI-KEYRING-V1"
const STORE_KDF := "pbkdf2-hmac-sha256"
const STORE_CIPHER := "aes-256-cbc"

## Iteration count this writer uses. A reader always obeys the file's own `iter`.
## The default password is 256 random bits from the keyring, where the count is
## not load-bearing (brute-forcing a 256-bit key does not care about 60,000
## iterations); it matters only when a host supplies its own passphrase, which is
## the same code path.
const DEFAULT_ITERATIONS := 60000

const SALT_BYTES := 16
const IV_BYTES := 16
const KEYRING_KEY_BYTES := 32
const MAC_BYTES := 32
const BLOCK_BYTES := 16

## Stable reasons a store can fail. A host reports WHY, not just "no".
const REASON_MISSING := "STORE_MISSING"
const REASON_UNREADABLE := "STORE_UNREADABLE"
const REASON_MALFORMED := "STORE_MALFORMED"
const REASON_UNSUPPORTED_VERSION := "STORE_UNSUPPORTED_VERSION"
const REASON_UNSUPPORTED_KDF := "STORE_UNSUPPORTED_KDF"
const REASON_UNSUPPORTED_CIPHER := "STORE_UNSUPPORTED_CIPHER"
const REASON_TAMPERED := "STORE_TAMPERED"
const REASON_WRONG_KEY := "STORE_WRONG_KEY"
const REASON_KEYRING_MISSING := "KEYRING_MISSING"
const REASON_KEYRING_MALFORMED := "KEYRING_MALFORMED"
const REASON_KEYRING_UNAVAILABLE := "KEYRING_UNAVAILABLE"
const REASON_NAME_NOT_ENCODABLE := "STORE_NAME_NOT_ENCODABLE"

const _AES := 0
const _MAC := 1


# -----------------------------------------------------------------------------
# Primitives. Kept small and independent of Godot's convenience wrappers so a
# mismatch with the other runtimes is traceable to one function.
# -----------------------------------------------------------------------------

func _hmac(key: PackedByteArray, message: PackedByteArray) -> PackedByteArray:
	return Crypto.new().hmac_digest(HashingContext.HASH_SHA256, key, message)


func _xor(a: PackedByteArray, b: PackedByteArray) -> PackedByteArray:
	var out := PackedByteArray()
	out.resize(a.size())
	for i in a.size():
		out[i] = a[i] ^ b[i]
	return out


## PBKDF2-HMAC-SHA256, single 32-byte block — the only shape this format needs.
##
## WHY NOT `Crypto`'s OWN KDF: Godot has HMAC but no PBKDF2, and Node's
## `crypto.pbkdf2Sync` supports any hash, so this is the one primitive that has to
## be hand-rolled on this side. Everything here exists to match it exactly: the
## block index is a BIG-ENDIAN 32-bit 1 (PBKDF2's INT(i)), `U` is the HMAC of
## salt||index, and each subsequent `U` is the HMAC of the previous one with the
## same key. An off-by-one in the loop, or a little-endian index, yields a key
## that is simply wrong — and "wrong key" is indistinguishable from "corrupt
## file" at the other end, which is why the vector is compared against Node
## rather than trusted.
func pbkdf2_sha256_32(password: PackedByteArray, salt: PackedByteArray, iterations: int) -> PackedByteArray:
	var block_index := PackedByteArray([0, 0, 0, 1])
	var u := _hmac(password, salt + block_index)
	var result := u
	for _i in range(1, maxi(1, iterations)):
		u = _hmac(password, u)
		result = _xor(result, u)
	return result


## One master key, split into two by LABELLED HMACs.
##
## Deliberately not "ask PBKDF2 for 64 bytes": the block function of a two-block
## PBKDF2 output is fiddly to reproduce by hand in GDScript, and a hand-rolled
## block function is exactly where a cross-language mismatch would hide. Two
## labelled HMACs are trivially reproducible anywhere.
func derive_keys(password: PackedByteArray, salt: PackedByteArray, iterations: int) -> Dictionary:
	var master := pbkdf2_sha256_32(password, salt, iterations)
	return {
		"master": master,
		"aes": _hmac(master, "fear-ai-store/aes".to_utf8_buffer()),
		"mac": _hmac(master, "fear-ai-store/mac".to_utf8_buffer())
	}


## PKCS#7, applied by hand. Always pads, even for an exact block multiple: a whole
## block of 0x10 is unambiguous on removal, whereas "pad nothing when it fits"
## leaves the trailing bytes of the last block indistinguishable from padding.
func pkcs7_pad(bytes: PackedByteArray) -> PackedByteArray:
	var pad_length := BLOCK_BYTES - (bytes.size() % BLOCK_BYTES)
	var padded := bytes.duplicate()
	for _i in pad_length:
		padded.append(pad_length)
	return padded


## Remove PKCS#7 padding, or an empty marked result when it is not well formed.
func pkcs7_unpad(bytes: PackedByteArray) -> Dictionary:
	if bytes.is_empty() or bytes.size() % BLOCK_BYTES != 0:
		return {"ok": false}
	var pad_length := bytes[bytes.size() - 1]
	if pad_length < 1 or pad_length > BLOCK_BYTES:
		return {"ok": false}
	for i in range(bytes.size() - pad_length, bytes.size()):
		if bytes[i] != pad_length:
			return {"ok": false}
	return {"ok": true, "bytes": bytes.slice(0, bytes.size() - pad_length)}


func _aes_cbc(mode: int, key: PackedByteArray, iv: PackedByteArray, input: PackedByteArray) -> PackedByteArray:
	var aes := AESContext.new()
	var started := aes.start(mode, key, iv)
	if started != OK:
		return PackedByteArray()
	var output := aes.update(input)
	aes.finish()
	return output


## Length-independent comparison, so a MAC cannot be probed byte by byte.
func constant_time_equals(a: PackedByteArray, b: PackedByteArray) -> bool:
	if a.size() != b.size():
		return false
	var diff := 0
	for i in a.size():
		diff |= a[i] ^ b[i]
	return diff == 0


# -----------------------------------------------------------------------------
# The container.
# -----------------------------------------------------------------------------

## Encrypt a record into the store text.
##
## Returns `{"ok": true, "text": ...}` or `{"ok": false, "reason": ...}`.
func encrypt(name: String, record: Dictionary, password: PackedByteArray, iterations: int = DEFAULT_ITERATIONS) -> Dictionary:
	# A newline or carriage return in the name would corrupt a line-based format,
	# and the failure would surface as "the store will not load" with no hint why.
	# Refused at the only point where it can still be explained.
	if name.contains("\n") or name.contains("\r"):
		return {"ok": false, "reason": REASON_NAME_NOT_ENCODABLE}

	var salt := Crypto.new().generate_random_bytes(SALT_BYTES)
	var iv := Crypto.new().generate_random_bytes(IV_BYTES)
	return encrypt_with(name, record, password, iterations, salt, iv)


## The deterministic half, split out so a probe can pin salt and IV and compare
## the resulting bytes against the other runtimes. Using a vector with a random
## salt would prove only that two implementations are both random.
func encrypt_with(name: String, record: Dictionary, password: PackedByteArray, iterations: int, salt: PackedByteArray, iv: PackedByteArray) -> Dictionary:
	if name.contains("\n") or name.contains("\r"):
		return {"ok": false, "reason": REASON_NAME_NOT_ENCODABLE}
	if salt.size() != SALT_BYTES or iv.size() != IV_BYTES:
		return {"ok": false, "reason": REASON_MALFORMED}

	var keys := derive_keys(password, salt, iterations)
	var payload := {
		"v": 1,
		"session_id": name,
		"session_token": str(record.get("session_token", "")),
		"signing_private_key": str(record.get("signing_private_key", "")),
		"signing_public_key": str(record.get("signing_public_key", "")),
		"saved_at_unix": int(record.get("saved_at_unix", int(Time.get_unix_time_from_system())))
	}
	# Trap 3: `sort_keys = true` is Godot's default, but it is passed explicitly
	# because the format now DEPENDS on it and a default is not a contract.
	var plaintext := JSON.stringify(payload, "", true).to_utf8_buffer()
	var ciphertext := _aes_cbc(AESContext.MODE_CBC_ENCRYPT, keys["aes"], iv, pkcs7_pad(plaintext))
	if ciphertext.is_empty():
		return {"ok": false, "reason": REASON_UNREADABLE}

	var header := "\n".join([
		STORE_VERSION,
		"kdf=%s" % STORE_KDF,
		"iter=%d" % iterations,
		"salt=%s" % Marshalls.raw_to_base64(salt),
		"cipher=%s" % STORE_CIPHER,
		"iv=%s" % Marshalls.raw_to_base64(iv),
		"name=%s" % name,
		"ct=%s" % Marshalls.raw_to_base64(ciphertext)
	]) + "\n"

	var mac := _hmac(keys["mac"], header.to_utf8_buffer())
	return {"ok": true, "text": "%smac=%s\n" % [header, Marshalls.raw_to_base64(mac)]}


## Verify and decrypt store text.
##
## The MAC is checked BEFORE anything is decrypted, and it covers the exact text,
## so an edited field is refused as TAMPERED instead of producing plausible
## garbage or a padding error that reads like a wrong key.
func decrypt(text: String, password: PackedByteArray) -> Dictionary:
	if text.strip_edges().is_empty():
		return {"ok": false, "reason": REASON_MALFORMED}
	# The MAC input is the file text up to and including the LF before `mac=`,
	# which is why `mac=` must be the LAST field: slicing the actual text rather
	# than rebuilding it from fields removes any chance of the two languages
	# disagreeing about whitespace or ordering.
	var marker := text.find("\nmac=")
	if marker < 0:
		return {"ok": false, "reason": REASON_MALFORMED}
	var mac_input := text.substr(0, marker + 1)

	var lines := text.split("\n")
	if lines[0] != STORE_VERSION:
		return {"ok": false, "reason": REASON_UNSUPPORTED_VERSION}

	var fields := {}
	for i in range(1, lines.size()):
		var line: String = lines[i]
		if line.is_empty():
			continue
		if line.begins_with("mac="):
			break
		var equals := line.find("=")
		if equals <= 0:
			continue
		fields[line.substr(0, equals)] = line.substr(equals + 1)

	if str(fields.get("kdf", "")) != STORE_KDF:
		return {"ok": false, "reason": REASON_UNSUPPORTED_KDF}
	if str(fields.get("cipher", "")) != STORE_CIPHER:
		return {"ok": false, "reason": REASON_UNSUPPORTED_CIPHER}
	var iterations := int(str(fields.get("iter", "")))
	if iterations < 1:
		return {"ok": false, "reason": REASON_MALFORMED}

	var salt := Marshalls.base64_to_raw(str(fields.get("salt", "")))
	var iv := Marshalls.base64_to_raw(str(fields.get("iv", "")))
	var ciphertext := Marshalls.base64_to_raw(str(fields.get("ct", "")))
	var presented_mac := Marshalls.base64_to_raw(text.substr(marker + 5).strip_edges())
	if salt.size() != SALT_BYTES or iv.size() != IV_BYTES or presented_mac.size() != MAC_BYTES:
		return {"ok": false, "reason": REASON_MALFORMED}
	if ciphertext.is_empty() or ciphertext.size() % BLOCK_BYTES != 0:
		return {"ok": false, "reason": REASON_MALFORMED}

	var keys := derive_keys(password, salt, iterations)
	var expected_mac := _hmac(keys["mac"], mac_input.to_utf8_buffer())
	if not constant_time_equals(expected_mac, presented_mac):
		# Deliberately ONE reason for "wrong key" and "edited file": telling them
		# apart would confirm which of the two a caller has, and the MAC is what
		# makes them indistinguishable in the first place.
		return {"ok": false, "reason": REASON_TAMPERED}

	var padded := _aes_cbc(AESContext.MODE_CBC_DECRYPT, keys["aes"], iv, ciphertext)
	if padded.is_empty():
		return {"ok": false, "reason": REASON_WRONG_KEY}
	var unpadded := pkcs7_unpad(padded)
	if not unpadded["ok"]:
		return {"ok": false, "reason": REASON_WRONG_KEY}

	var parsed = JSON.parse_string(unpadded["bytes"].get_string_from_utf8())
	if not (parsed is Dictionary):
		return {"ok": false, "reason": REASON_WRONG_KEY}

	return {
		"ok": true,
		"name": str(parsed.get("session_id", "")),
		"record": {
			"session_id": str(parsed.get("session_id", "")),
			"session_token": str(parsed.get("session_token", "")),
			"signing_private_key": str(parsed.get("signing_private_key", "")),
			"signing_public_key": str(parsed.get("signing_public_key", "")),
			"saved_at_unix": int(parsed.get("saved_at_unix", 0))
		}
	}


## The session NAME from store text without needing the key.
##
## This is the affordance the plaintext `name=` line buys: an operator holding a
## stray store can tell which host it belongs to. It deliberately returns only the
## name, because that is all that is readable without the keyring.
func read_name(text: String) -> String:
	for line in text.split("\n"):
		if line.begins_with("name="):
			return line.substr(5)
	return ""


## True when the text is this container rather than a legacy plaintext store.
func looks_encrypted(text: String) -> bool:
	return text.begins_with(STORE_VERSION)


# -----------------------------------------------------------------------------
# The keyring.
# -----------------------------------------------------------------------------

## Where the keyring lives when a host does not say.
##
## A user-scoped CONFIGURATION path — deliberately NOT `user://`, which is inside
## the game's data directory and therefore inside the thing that gets backed up.
## Returns "" when the platform gives no usable directory, and the caller then
## REFUSES to write rather than silently falling back to plaintext next to the
## store: a quiet downgrade is worse than a reported failure.
func resolve_keyring_path(override: String = "") -> String:
	if not override.strip_edges().is_empty():
		return override
	var from_env := OS.get_environment("FEAR_AI_KEYRING")
	if not from_env.strip_edges().is_empty():
		return from_env

	var platform := OS.get_name()
	if platform == "Windows":
		var appdata := OS.get_environment("APPDATA")
		if not appdata.strip_edges().is_empty():
			return "%s/FearAI/keyring" % appdata.replace("\\", "/")
		return ""
	if platform == "macOS":
		var home := OS.get_environment("HOME")
		if not home.strip_edges().is_empty():
			return "%s/Library/Application Support/FearAI/keyring" % home
		return ""
	var config_home := OS.get_environment("XDG_CONFIG_HOME")
	if not config_home.strip_edges().is_empty():
		return "%s/fear-ai/keyring" % config_home
	var home_dir := OS.get_environment("HOME")
	if not home_dir.strip_edges().is_empty():
		return "%s/.config/fear-ai/keyring" % home_dir
	return ""


## Read a keyring, or create one.
##
## A malformed keyring is REPORTED and NOT overwritten: like a corrupt store, it
## may be the only copy of a key that is still valid, and silently replacing it
## would destroy the host's ability to read a store sitting right there.
func load_or_create_keyring(keyring_path: String) -> Dictionary:
	if keyring_path.strip_edges().is_empty():
		return {"ok": false, "reason": REASON_KEYRING_UNAVAILABLE}

	if FileAccess.file_exists(keyring_path):
		var reader := FileAccess.open(keyring_path, FileAccess.READ)
		if reader == null:
			return {"ok": false, "reason": REASON_UNREADABLE}
		var existing := reader.get_as_text()
		reader.close()
		var key := parse_keyring_text(existing)
		if key.is_empty():
			return {"ok": false, "reason": REASON_KEYRING_MALFORMED}
		return {"ok": true, "key": key, "created": false, "path": keyring_path}

	var fresh := Crypto.new().generate_random_bytes(KEYRING_KEY_BYTES)
	var directory := keyring_path.get_base_dir()
	if not directory.is_empty():
		DirAccess.make_dir_recursive_absolute(directory)
	var writer := FileAccess.open(keyring_path, FileAccess.WRITE)
	if writer == null:
		return {"ok": false, "reason": REASON_UNREADABLE}
	writer.store_string(create_keyring_text(fresh))
	writer.close()
	return {"ok": true, "key": fresh, "created": true, "path": keyring_path}


func create_keyring_text(key: PackedByteArray) -> String:
	return "\n".join([
		KEYRING_VERSION,
		"key=%s" % Marshalls.raw_to_base64(key),
		"created_unix=%d" % int(Time.get_unix_time_from_system())
	]) + "\n"


## The key from keyring text, or an empty array when it is not a usable keyring.
##
## Length-checked, because a truncated keyring would otherwise derive a short key
## and fail much later, looking like a wrong passphrase.
func parse_keyring_text(text: String) -> PackedByteArray:
	var lines := text.split("\n")
	if lines.is_empty() or lines[0] != KEYRING_VERSION:
		return PackedByteArray()
	for i in range(1, lines.size()):
		var line: String = lines[i]
		if not line.begins_with("key="):
			continue
		var key := Marshalls.base64_to_raw(line.substr(4))
		return key if key.size() == KEYRING_KEY_BYTES else PackedByteArray()
	return PackedByteArray()
