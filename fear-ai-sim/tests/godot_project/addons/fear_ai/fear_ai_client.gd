# Fear AI Godot 4 WebSocket & HTTP Client (Autoload Singleton)
extends Node

signal connected_to_server
signal disconnected_from_server
signal agent_state_received(agent_id: String, state: Dictionary)

@export var server_host: String = "127.0.0.1"
@export var server_port: int = 8765
@export var use_websocket: bool = true

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
	
	var payload = {
		"type": "BATCH_TICK_REQUEST",
		"dt": delta,
		"observations": batch
	}
	
	if use_websocket and _is_connected:
		_socket.send_text(JSON.stringify(payload))
	else:
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
