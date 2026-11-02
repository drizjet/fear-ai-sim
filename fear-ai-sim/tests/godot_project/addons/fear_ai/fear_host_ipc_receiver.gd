extends RefCounted
class_name FearHostIpcReceiver

## Optional FEAR-IPC-1 receiving verifier for a separately authenticated
## owned Godot transport. It DOES NOT replace FearAIClient HTTP/WebSocket.
## Only emit/apply returned metadata after accepted == true; this receiver
## never moves an actor or changes inventory. Engine execution NOT PROVEN.

const MAX_WIRE := 1400000
const MAX_FRAME_UTF16 := 262144

var _session: String = ""
var _secret: PackedByteArray = PackedByteArray()
var _events: Dictionary = {}
var _entities: Dictionary = {}
var _sequence: int = 0
var _window_start: int = 0
var _attempts: int = 0
var _admitted: int = 0
var _bytes: int = 0
var _closed := true
var max_messages: int = 32
var max_frame_bytes: int = 262144
var max_window_bytes: int = 1048576
var window_ms: int = 1000

func configure(session: String, secret: String,
        allowed_event_types: PackedStringArray = PackedStringArray(),
        allowed_entities: PackedStringArray = PackedStringArray()) -> bool:
    close()
    if session.length() != 32 or secret.length() != 64:
        return false
    if not _lower_hex(session) or not _lower_hex(secret):
        return false
    if max_messages < 1 or max_messages > 1024 or max_frame_bytes < 1:
        return false
    if max_frame_bytes > 1048576 or max_window_bytes < max_frame_bytes:
        return false
    if max_window_bytes > 67108864 or window_ms < 10 or window_ms > 60000:
        return false
    if allowed_event_types.size() > 256 or allowed_entities.size() > 256:
        return false
    _session = session
    _secret = secret.hex_decode()
    if _secret.size() != 32:
        return false
    for event_name in allowed_event_types:
        if event_name.is_empty() or event_name.length() > 256:
            close()
            return false
        _events[event_name] = true
    for entity_name in allowed_entities:
        if entity_name.is_empty() or entity_name.length() > 256:
            close()
            return false
        _entities[entity_name] = true
    _window_start = Time.get_ticks_msec()
    _closed = false
    return true

func close() -> void:
    for i in _secret.size():
        _secret[i] = 0
    _secret.clear()
    _events.clear()
    _entities.clear()
    _session = ""
    _sequence = 0
    _attempts = 0
    _admitted = 0
    _bytes = 0
    _closed = true

func _lower_hex(value: String) -> bool:
    for i in value.length():
        var code := value.unicode_at(i)
        if not ((code >= 48 and code <= 57) or (code >= 97 and code <= 102)):
            return false
    return true

func _deny(reason: String) -> Dictionary:
    return {"accepted": false, "reason": reason}

func receive_packet(packet: String, current_tick: int) -> Dictionary:
    if _closed:
        return _deny("closed")
    var now := Time.get_ticks_msec()
    if now - _window_start >= window_ms:
        _window_start = now
        _attempts = 0
        _admitted = 0
        _bytes = 0
    _attempts += 1
    if _attempts > max_messages * 8 + 8:
        return _deny("rate_limited")
    if packet.length() > MAX_WIRE:
        return _deny("invalid_envelope")
    for i in packet.length():
        if packet.unicode_at(i) > 127:
            return _deny("invalid_envelope")
    if packet.count(".") != 4:
        return _deny("invalid_envelope")
    var parts := packet.split(".", false)
    if parts.size() != 5 or parts[0] != "FEAR-IPC-1" or parts[1] != _session:
        return _deny("invalid_envelope")
    var sequence_text: String = parts[2]
    if sequence_text.is_empty() or sequence_text.length() > 16:
        return _deny("invalid_envelope")
    if sequence_text.begins_with("0") or not sequence_text.is_valid_int():
        return _deny("invalid_envelope")
    for i in sequence_text.length():
        var digit := sequence_text.unicode_at(i)
        if digit < 48 or digit > 57:
            return _deny("invalid_envelope")
    if not _lower_hex(parts[4]) or parts[4].length() != 64:
        return _deny("invalid_envelope")
    var signed := ".".join(parts.slice(0, 4))
    var expected: PackedByteArray = Crypto.new().hmac_digest(
        HashingContext.HASH_SHA256, _secret, signed.to_utf8_buffer())
    var provided: PackedByteArray = parts[4].hex_decode()
    if not Crypto.new().constant_time_compare(expected, provided):
        return _deny("unauthenticated")
    var sequence := sequence_text.to_int()
    if sequence < 1 or sequence > 9007199254740991:
        return _deny("invalid_envelope")
    if sequence != _sequence + 1:
        return _deny("replay_or_sequence")
    if _admitted >= max_messages:
        return _deny("rate_limited")
    var encoded: String = parts[3]
    if encoded.length() % 4 == 1:
        _sequence = sequence
        _admitted += 1
        return _deny("invalid_payload")
    for i in encoded.length():
        var c := encoded.unicode_at(i)
        if not ((c >= 48 and c <= 57) or (c >= 65 and c <= 90)
                or (c >= 97 and c <= 122) or c == 45 or c == 95):
            _sequence = sequence
            _admitted += 1
            return _deny("invalid_payload")
    var byte_count := int(encoded.length() * 3 / 4)
    if byte_count > max_frame_bytes:
        _sequence = sequence
        _admitted += 1
        return _deny("frame_too_large")
    if _bytes + byte_count > max_window_bytes:
        return _deny("rate_limited")
    _sequence = sequence
    _admitted += 1
    _bytes += byte_count
    var padded := encoded.replace("-", "+").replace("_", "/")
    while padded.length() % 4 != 0:
        padded += "="
    var raw := Marshalls.base64_to_raw(padded)
    if raw.size() != byte_count:
        return _deny("invalid_payload")
    var json_text := raw.get_string_from_utf8()
    if json_text.to_utf8_buffer() != raw:
        return _deny("invalid_payload")
    if json_text.length() > MAX_FRAME_UTF16:
        return _deny("frame_too_large")
    var frame: Variant = JSON.parse_string(json_text)
    if not _valid_graph(frame):
        return _deny("invalid_payload")
    if not frame is Dictionary or frame.get("version") != 1:
        return _deny("invalid_payload")
    if frame.get("kind") == "event" and _exact_fields(frame,
            ["version", "kind", "type", "tick", "details"]):
        if not frame["type"] is String or frame["type"].is_empty():
            return _deny("invalid_payload")
        if not (frame["tick"] is int or frame["tick"] is float):
            return _deny("invalid_payload")
        if frame["tick"] < 0 or frame["tick"] != current_tick:
            return _deny("tick_mismatch")
        if not frame["details"] is Dictionary:
            return _deny("invalid_payload")
        if not _events.has(frame["type"]):
            return _deny("forbidden_event")
        return {"accepted": true, "frame": frame}
    if frame.get("kind") == "cargo" and _exact_fields(frame,
            ["version", "kind", "entityId", "cargo"]):
        if not frame["entityId"] is String or frame["entityId"].is_empty():
            return _deny("invalid_payload")
        if frame["entityId"].begins_with("trade:") or not _entities.has(frame["entityId"]):
            return _deny("forbidden_entity")
        if not frame["cargo"] is Dictionary:
            return _deny("invalid_payload")
        return {"accepted": true, "frame": frame}
    return _deny("invalid_payload")

func _exact_fields(value: Dictionary, fields: Array) -> bool:
    if value.size() != fields.size():
        return false
    for field_name in value.keys():
        if not fields.has(field_name):
            return false
    return true

func _valid_graph(root: Variant) -> bool:
    var pending: Array = [[root, 0]]
    var nodes := 0
    while not pending.is_empty():
        var item: Array = pending.pop_back()
        var value: Variant = item[0]
        var depth: int = item[1]
        nodes += 1
        if nodes > 4096 or depth > 32:
            return false
        if value is Dictionary:
            if value.size() > 256:
                return false
            for key in value.keys():
                if not key is String or key in ["__proto__", "constructor", "prototype", "toJSON"]:
                    return false
                if key.length() > 16384:
                    return false
                pending.push_back([value[key], depth + 1])
        elif value is Array:
            if value.size() > 2048:
                return false
            for entry in value:
                pending.push_back([entry, depth + 1])
        elif value is String:
            if value.length() > 16384:
                return false
        elif value is float:
            if not is_finite(value):
                return false
        elif value != null and not (value is int or value is bool):
            return false
    return true
