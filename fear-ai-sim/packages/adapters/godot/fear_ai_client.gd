# Fear AI Godot 4 WebSocket & HTTP Client (Autoload Singleton)
# Supports both JSON protocol and high-throughput Binary Wire Protocol v2.
extends Node

signal connected_to_server
signal disconnected_from_server
signal agent_state_received(agent_id: String, state: Dictionary)
signal outcome_reported(receipt: Dictionary)

@export var server_host: String = "127.0.0.1"
@export var server_port: int = 8765
@export var use_websocket: bool = true
@export var use_binary_wire: bool = false
@export var host_capabilities: Array[String] = []

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

func _ready() -> void:
	_http_request = HTTPRequest.new()
	add_child(_http_request)
	_http_request.request_completed.connect(_on_http_response)
	
	if use_websocket:
		var url = "ws://%s:%d" % [server_host, server_port]
		var err = _socket.connect_to_url(url)
		if err != OK:
			push_warning("[FearAI] WebSocket connect error: %d. Using HTTP." % err)

func _process(_delta: float) -> void:
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
	if _pending_observations.size() == 0:
		return
		
	var batch = _pending_observations.duplicate()
	_pending_observations.clear()
	
	if use_websocket and _is_connected and use_binary_wire:
		var binary_frame = _encode_binary_observations(batch, delta)
		_socket.send(binary_frame)
	elif use_websocket and _is_connected:
		var payload = {
			"type": "BATCH_TICK_REQUEST",
			"dt": delta,
			"observations": batch
		}
		if host_capabilities.size() > 0:
			payload["capabilities"] = host_capabilities
		_socket.send_text(JSON.stringify(payload))
	else:
		var payload = {
			"type": "BATCH_TICK_REQUEST",
			"dt": delta,
			"observations": batch
		}
		if host_capabilities.size() > 0:
			payload["capabilities"] = host_capabilities
		_send_http_batch(payload)

func queue_observation(obs: Dictionary) -> void:
	_pending_observations.append(obs)

func _send_handshake() -> void:
	var handshake = {
		"type": "HANDSHAKE_REQUEST",
		"protocol_version": "1.0.0",
		"client_id": "godot_%d" % Time.get_ticks_msec(),
		"engine": "Godot4"
	}
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
		if data is Dictionary:
			if data.has("results"):
				for agent_output in data["results"]:
					if agent_output.has("agent_id"):
						agent_state_received.emit(agent_output["agent_id"], agent_output)
			elif data.get("type") == "INTENT_OUTCOME_ACK":
				outcome_reported.emit(data)

## Report what the host did with an advised intent (R36/R38).
func report_outcome(agent_id: String, intent_type: String, outcome: String, reason: String = "", tick: int = 0) -> void:
	var payload = {
		"type": "INTENT_OUTCOME_REPORT",
		"agent_id": agent_id,
		"intent_type": intent_type,
		"outcome": outcome,
		"tick": tick
	}
	if not reason.is_empty():
		payload["reason"] = reason

	if use_websocket and _is_connected:
		_socket.send_text(JSON.stringify(payload))
	else:
		_send_http_outcome(payload)

var _outcome_http_request: HTTPRequest

func _send_http_outcome(payload: Dictionary) -> void:
	if not is_instance_valid(_outcome_http_request):
		_outcome_http_request = HTTPRequest.new()
		add_child(_outcome_http_request)
		_outcome_http_request.request_completed.connect(_on_outcome_http_response)

	var url = "http://%s:%d/api/v1/outcome" % [server_host, server_port]
	var headers = ["Content-Type: application/json"]
	_outcome_http_request.request(url, headers, HTTPClient.METHOD_POST, JSON.stringify(payload))

func _on_outcome_http_response(_result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if response_code == 200:
		var json = JSON.new()
		if json.parse(body.get_string_from_utf8()) == OK:
			var data = json.get_data()
			if data is Dictionary:
				outcome_reported.emit(data)

