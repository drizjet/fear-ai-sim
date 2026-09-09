# test_server_failure_drill.gd
# CXIV: client-side failsafe drill. Connects to a FearServer port that has
# NO server listening (or a killed one). The host game must hold its last
# advisory and keep running — never crash, never freeze, never invent state.
extends SceneTree

func _init() -> void:
	_run_drill()

func _run_drill() -> void:
	var port: int = 8779
	var args = OS.get_cmdline_args()
	var user_args = OS.get_cmdline_user_args()
	for i in range(args.size()):
		if args[i] == "--port" and i + 1 < args.size():
			port = int(args[i + 1])
	for i in range(user_args.size()):
		if user_args[i] == "--port" and i + 1 < user_args.size():
			port = int(user_args[i + 1])

	var url = "ws://127.0.0.1:%d" % port
	print("[Godot-Failsafe] Attempting advisory link to %s..." % url)

	# Last known advisory (host-owned hold buffer; Fear AI never writes it).
	var held_fear: float = 0.42
	var held_intent: int = 3

	var socket: WebSocketPeer = WebSocketPeer.new()
	var err = socket.connect_to_url(url)
	if err != OK:
		print("[Godot-Failsafe] FAILSAFE_HOLD_LAST_ADVISORY fear=%.2f intent=%d (connect refused, host continues)" % [held_fear, held_intent])
		quit(0)
		return

	var frames: int = 0
	var saw_open: bool = false
	while frames < 240: # 4 seconds at 60 FPS
		await process_frame
		frames += 1
		socket.poll()
		var state = socket.get_ready_state()
		if state == WebSocketPeer.STATE_OPEN:
			saw_open = true
		elif state == WebSocketPeer.STATE_CLOSED or state == WebSocketPeer.STATE_CLOSING:
			if saw_open:
				print("[Godot-Failsafe] FAILSAFE_HOLD_LAST_ADVISORY fear=%.2f intent=%d (link dropped mid-run, host continues)" % [held_fear, held_intent])
			else:
				print("[Godot-Failsafe] FAILSAFE_HOLD_LAST_ADVISORY fear=%.2f intent=%d (no link, host continues)" % [held_fear, held_intent])
			quit(0)
			return

	if saw_open:
		print("[Godot-Failsafe] LINK_ALIVE fear=%.2f intent=%d" % [held_fear, held_intent])
	else:
		print("[Godot-Failsafe] FAILSAFE_HOLD_LAST_ADVISORY fear=%.2f intent=%d (silent port, host continues)" % [held_fear, held_intent])
	quit(0)
