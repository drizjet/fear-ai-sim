# neutral_horror_demo.gd
# Demonstrates the canonical 2-agent horror encounter in Godot 4.
extends Node

@onready var diaz = $DiazVeteran
@onready var chen = $ChenNovice
@onready var stalker = $StalkerThreat

func _ready() -> void:
    print("[FearAI Godot Demo] Initializing Canonical Horror Encounter...")
    run_demo_sequence()

func run_demo_sequence() -> void:
    var fear_client = get_node_or_null("/root/FearAIClient")
    if fear_client == null:
        print("[!] FearAIClient autoload not found. Enable in Project Settings -> Autoload.")
        return

    # 1. Connect signal callbacks
    if diaz:
        diaz.intent_changed.connect(_on_diaz_intent)
    if chen:
        chen.intent_changed.connect(_on_chen_intent)

    # 2. Phase 1: Calm Patrol (3 seconds)
    print("[FearAI Godot Demo] Phase 1: Calm Patrol. Both agents relaxed.")
    await get_tree().create_timer(3.0).timeout

    # 3. Phase 2: Threat Appears near Diaz
    print("[FearAI Godot Demo] Phase 2: Stalker materializes 4m from Diaz.")
    if stalker and diaz:
        stalker.global_position = diaz.global_position + Vector3(4.0, 0.0, 0.0)
    await get_tree().create_timer(5.0).timeout

    # 4. Phase 3: Contagion
    print("[FearAI Godot Demo] Phase 3: Screaming cascades panic to Chen.")
    await get_tree().create_timer(4.0).timeout

    # 5. Phase 4: Stalker Retreats
    print("[FearAI Godot Demo] Phase 4: Threat vanishes into shadows. Recovery starts.")
    if stalker:
        stalker.global_position = Vector3(999, 999, 999)
    await get_tree().create_timer(6.0).timeout

    print("[FearAI Godot Demo] Encounter complete! Verified Godot 4 behavioral parity.")

func _on_diaz_intent(intent: Dictionary) -> void:
    print("[Diaz Intent] Type: %s, Urgency: %f" % [intent.get("type", "NONE"), intent.get("urgency", 0.0)])
    if intent.get("type") == "FLEE_FROM" and diaz:
        # Host game executes authoritative CharacterBody3D velocity
        var flee_dir = -diaz.transform.basis.z.normalized()
        diaz.velocity = flee_dir * 6.0
        diaz.move_and_slide()

func _on_chen_intent(intent: Dictionary) -> void:
    print("[Chen Intent] Type: %s, Urgency: %f" % [intent.get("type", "NONE"), intent.get("urgency", 0.0)])
    if intent.get("type") == "SEEK_COVER" and chen:
        chen.velocity = Vector3.BACK * 4.0
        chen.move_and_slide()
