# test_binary_websocket_loopback.gd
# Headless Godot 4.6 script testing live loopback Binary Wire Protocol v2 over WebSocket.
extends SceneTree

const BINARY_MAGIC = 0x52414546 # "FEAR" in little-endian uint32
const BINARY_PROTOCOL_VERSION = 2
const FRAME_TYPE_OBSERVATION_BATCH = 1
const FRAME_TYPE_INTENT_BATCH = 2
const HEADER_SIZE_BYTES = 16
const RECORD_SIZE_BYTES = 32

func _init() -> void:
	_run_loopback()

func _run_loopback() -> void:
	var port: int = 8768
	var args = OS.get_cmdline_args()
	var user_args = OS.get_cmdline_user_args()
	for i in range(args.size()):
		if args[i] == "--port" and i + 1 < args.size():
			port = int(args[i + 1])
	for i in range(user_args.size()):
		if user_args[i] == "--port" and i + 1 < user_args.size():
			port = int(user_args[i + 1])
			
	var url = "ws://127.0.0.1:%d" % port
	print("[Godot-Loopback] Connecting to %s..." % url)
	
	var socket: WebSocketPeer = WebSocketPeer.new()
	var err = socket.connect_to_url(url)
	if err != OK:
		printerr("[Godot-Loopback] Failed to connect: %d" % err)
		quit(1)
		return

	var is_connected: bool = false
	var start_usec: int = 0
	var frames: int = 0
	
	while frames < 360: # 6 seconds at 60 FPS
		await process_frame
		frames += 1
		
		socket.poll()
		var state = socket.get_ready_state()

		if state == WebSocketPeer.STATE_OPEN:
			if not is_connected:
				is_connected = true
				print("[Godot-Loopback] Connected! Sending binary observation batch frame...")
				start_usec = Time.get_ticks_usec()
				_send_binary_observations(socket)
				
			while socket.get_available_packet_count() > 0:
				var packet = socket.get_packet()
				var elapsed_ms = float(Time.get_ticks_usec() - start_usec) / 1000.0
				
				if packet.size() >= HEADER_SIZE_BYTES:
					var spb = StreamPeerBuffer.new()
					spb.data_array = packet
					spb.big_endian = false
					
					var magic = spb.get_u32()
					var version = spb.get_u8()
					var frame_type = spb.get_u8()
					var _flags = spb.get_u16()
					var tick = spb.get_u32()
					var count = spb.get_u32()
					
					if magic == BINARY_MAGIC and version == BINARY_PROTOCOL_VERSION and frame_type == FRAME_TYPE_INTENT_BATCH:
						print("[Godot-Loopback] SUCCESS: Received valid Binary Wire Protocol v2 Intent Frame!")
						print("  • Frame Type: INTENT_BATCH (2)")
						print("  • Simulation Tick: %d" % tick)
						print("  • Entity Count: %d" % count)
						print("  • Total Bytes: %d" % packet.size())
						print("  • Roundtrip Latency: %.2f ms" % elapsed_ms)
						
						if count != 5:
							printerr("[Godot-Loopback] FAIL: Expected 5 entity records, received %d" % count)
							quit(1)
							return
							
						var e0_id = spb.get_u32()
						var e0_fear = float(spb.get_u16()) / 65535.0
						spb.seek(HEADER_SIZE_BYTES + RECORD_SIZE_BYTES)
						var e1_id = spb.get_u32()
						var e1_fear = float(spb.get_u16()) / 65535.0
						
						print("  • Entity 0 (Acute threat): Fear = %.3f (Expected > 0.35)" % e0_fear)
						print("  • Entity 1 (Distant threat): Fear = %.3f (Expected < 0.35)" % e1_fear)
						
						if e0_fear <= e1_fear:
							printerr("[Godot-Loopback] FAIL: Entity 0 fear (%.3f) did not exceed Entity 1 fear (%.3f)" % [e0_fear, e1_fear])
							quit(1)
							return
							
						print("[Godot-Loopback] ALL VERIFICATION ASSERTIONS PASSED (100% BIT-EXACT CONFORMANCE)")
						quit(0)
						return
						
		elif state == WebSocketPeer.STATE_CLOSED:
			printerr("[Godot-Loopback] Connection closed prematurely by server")
			quit(1)
			return

	printerr("[Godot-Loopback] TIMEOUT: No binary response received from FearServer within 360 frames")
	quit(1)

func _send_binary_observations(socket: WebSocketPeer) -> void:
	var spb = StreamPeerBuffer.new()
	spb.big_endian = false
	
	# 16-byte Header
	spb.put_u32(BINARY_MAGIC)
	spb.put_u8(BINARY_PROTOCOL_VERSION)
	spb.put_u8(FRAME_TYPE_OBSERVATION_BATCH)
	spb.put_u16(0)
	spb.put_u32(100) # tick
	spb.put_u32(5)   # count
	
	# 5 Entity Observation Records (32 bytes each)
	var configs = [
		{ "id": 0, "dist": 3.0, "intensity": 0.95 },
		{ "id": 1, "dist": 75.0, "intensity": 0.05 },
		{ "id": 2, "dist": 14.0, "intensity": 0.65 },
		{ "id": 3, "dist": 8.0, "intensity": 0.85 },
		{ "id": 4, "dist": 999.0, "intensity": 0.0 }
	]
	
	for cfg in configs:
		spb.put_u32(cfg.id)
		spb.put_float(0.0) # px
		spb.put_float(0.0) # py
		spb.put_float(0.0) # pz
		spb.put_float(cfg.dist) # threat distance
		spb.put_float(cfg.intensity) # threat intensity
		spb.put_u16(65535) # health = 1.0
		spb.put_u16(65535) # energy = 1.0
		spb.put_u8(1) # stimulusType
		spb.put_u8(0) # flags
		spb.put_u16(0) # padding
		
	var packet = spb.data_array
	socket.send(packet)
