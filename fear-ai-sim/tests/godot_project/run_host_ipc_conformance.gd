extends SceneTree

## Actual Godot 4.6 runtime verifier for FEAR-IPC-1 metadata only.
## No server, process, socket or game motor is started.
const RECEIVER = preload("res://addons/fear_ai/fear_host_ipc_receiver.gd")
const CLIENT = preload("res://addons/fear_ai/fear_ai_client.gd")
const SESSION := "abababababababababababababababab"
const SECRET := "cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd"
const EVENT := """{"version":1,"kind":"event","type":"host_signal","tick":0,"details":{"note":"cross-language"}}"""
const KNOWN_FIRST := "FEAR-IPC-1.abababababababababababababababab.1.eyJ2ZXJzaW9uIjoxLCJraW5kIjoiZXZlbnQiLCJ0eXBlIjoiaG9zdF9zaWduYWwiLCJ0aWNrIjowLCJkZXRhaWxzIjp7Im5vdGUiOiJjcm9zcy1sYW5ndWFnZSJ9fQ.ba1abb27860cd4cdb0882bc5a776e74872bad31f349dc6a669801089a9f6f523"

var passed := 0
var failed := 0

func _check(label: String, ok: bool) -> void:
    if ok:
        passed += 1
    else:
        failed += 1
        push_error("GODOT_IPC_FAIL " + label)

func _signed(seq: int, frame: String, secret: String = SECRET) -> String:
    var encoded := Marshalls.raw_to_base64(frame.to_utf8_buffer())
    encoded = encoded.replace("+", "-").replace("/", "_")
    while encoded.ends_with("="):
        encoded = encoded.substr(0, encoded.length() - 1)
    var source := "FEAR-IPC-1." + SESSION + "." + str(seq) + "." + encoded
    var mac := Crypto.new().hmac_digest(HashingContext.HASH_SHA256,
        secret.hex_decode(), source.to_utf8_buffer())
    return source + "." + mac.hex_encode()

func _init() -> void:
    var recv = RECEIVER.new()
    _check("configure", recv.configure(SESSION, SECRET,
        PackedStringArray(["host_signal"]), PackedStringArray(["neutral"])))
    _check("Node/Python/C#/Unity known vector", _signed(1, EVENT) == KNOWN_FIRST)
    _check("first accepted", recv.receive_packet(KNOWN_FIRST, 0).get("accepted", false))
    _check("replay denied", recv.receive_packet(KNOWN_FIRST, 0).get("reason") == "replay_or_sequence")
    _check("wrong key denied", recv.receive_packet(_signed(2, EVENT,
        "ef".repeat(32)), 0).get("reason") == "unauthenticated")
    _check("out of order denied", recv.receive_packet(_signed(3, EVENT), 0).get("reason") == "replay_or_sequence")
    _check("valid second accepted", recv.receive_packet(_signed(2, EVENT), 0).get("accepted", false))
    var forbidden := """{"version":1,"kind":"cargo","entityId":"trade:shipment","cargo":{}}"""
    _check("trade escrow refused", recv.receive_packet(_signed(3, forbidden), 0).get("reason") == "forbidden_entity")
    _check("denied signed request consumes seq", recv.receive_packet(_signed(3, forbidden), 0).get("reason") == "replay_or_sequence")
    var bad_key := """{"version":1,"kind":"event","type":"host_signal","tick":0,"details":{"toJSON":1}}"""
    _check("callback key refused", recv.receive_packet(_signed(4, bad_key), 0).get("reason") == "invalid_payload")
    _check("wrong event tick denied", recv.receive_packet(_signed(5, EVENT), 1).get("reason") == "tick_mismatch")
    recv.close()
    _check("closed receiver denies", recv.receive_packet(_signed(6, EVENT), 0).get("reason") == "closed")

    var limited = RECEIVER.new()
    limited.max_messages = 1
    _check("rate configured", limited.configure(SESSION, SECRET,
        PackedStringArray(["host_signal"])))
    _check("rate first accepted", limited.receive_packet(_signed(1, EVENT), 0).get("accepted", false))
    _check("rate second denied", limited.receive_packet(_signed(2, EVENT), 0).get("reason") == "rate_limited")
    limited.close()

    var client = CLIENT.new()
    _check("autoload opt-in", client.configure_host_metadata_receiver(SESSION, SECRET,
        PackedStringArray(["host_signal"])))
    _check("autoload approved metadata", client.receive_authenticated_host_metadata(
        KNOWN_FIRST, 0).get("accepted", false))
    client.close_host_metadata_receiver()
    _check("autoload closed", client.receive_authenticated_host_metadata(
        _signed(2, EVENT), 0).get("reason") == "not_configured")
    client.free()

    print("GODOT_HOST_IPC_ASSERTIONS=" + str(passed))
    if failed == 0:
        print("GODOT_HOST_IPC=PASSED")
    else:
        print("GODOT_HOST_IPC=FAILED count=" + str(failed))
    quit(0 if failed == 0 else 1)
