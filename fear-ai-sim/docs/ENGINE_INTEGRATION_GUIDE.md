---
title: Fear AI Engine Integration Guide - Unity, Unreal, Godot, and Custom Engines
created: 2026-09-06
updated: 2026-09-14
type: guide
status: active
---

# Fear AI Universal Engine Integration Guide

Connect Fear AI **middleware** to a **host game**. Fear AI is not a Godot/Unity/Unreal game.

Host game remains authoritative for movement, pathfinding, physics, combat, inventory, animation, and spawning. Adapters must send observations and receive intents. If an adapter calls `move_and_slide`, `NavMeshAgent.SetDestination`, or applies damage, that is an architectural violation.

Canonical map: `SYSTEM_MAP.md`. Agent rules: `../AGENTS.md`.

**Gates (2026-09-07):** Godot 4.6 headless ran on this host. Unity Editor is not installed. **Unreal is deferred, not dropped** — keep the plugin so Unreal games can connect later. You do not need Unreal installed to plug into Unity. The protocol is the “any game” layer.

---

## 1. Starting the Middleware Server

The Fear AI middleware runs as a lightweight local server on loopback (`127.0.0.1:8765`).

### Option A: Node.js CLI (the real server)

From this repo root (`fear-ai-sim/fear-ai-sim`):

```bash
npm run server
# or
node packages/runtime/bin/fear-ai-server.js --port 8765 --seed 1337
```

`Launch-FearAI.ps1` / `Launch-FearAI.bat` start the **research desktop sim**, not this server. Files named `Launch-FearAI-Server.ps1` / `.bat` are **not** in this tree.

Once running:
- **HTTP Endpoint**: `http://127.0.0.1:8765/health`
- **WebSocket Endpoint**: `ws://127.0.0.1:8765`

---

## 2. Unity Integration (C#)

> [!WARNING]
> **Verification Gate Status**: `IMPLEMENTED_NOT_VERIFIED (UNITY_EDITOR_NOT_INSTALLED)`
> *Host Environment Notice: Unity Editor is not installed on this host development machine. The underlying C# types and client logic compile cleanly under the .NET 8 SDK / Roslyn compiler, but end-to-end Unity Editor playmode and scene verification must be executed in an environment with the Unity Editor installed.*

### Setup
1. Copy `packages/adapters/unity/` to your project's `Assets/FearAI/`.
2. Add an empty GameObject in your scene with the `FearAIClient` component.
3. Attach `FearAgent` to an NPC. Host code (your `NavMeshAgent` / character controller) reads `CurrentIntent` and `RecommendedVector` and moves the actor. FearAgent does not steer navigation.

---

## 3. Godot 4 Integration (GDScript)

> [!NOTE]
> **Verification Gate Status**: `VERIFIED (GODOT_4_6_STABLE_OFFICIAL_HEADLESS)`
> *Host Environment Notice: Tested and verified against official Godot v4.6-stable Windows 64-bit console binary (`Godot_v4.6-stable_win64_console.exe`) on this host with zero errors.*

### Setup
1. Copy `packages/adapters/godot/` to `addons/fear_ai/`.
2. Register `addons/fear_ai/fear_ai_client.gd` as an **Autoload** named `FearAIClient`.
3. Attach `FearAgent` as a child node to your `CharacterBody2D` or `CharacterBody3D` scenes.
4. Add hostile entities or hazards to the Godot group `"fear_threats"`.

### Code Example
```gdscript
extends CharacterBody3D

@onready var fear_agent: FearAgent = $FearAgent

func _ready():
    fear_agent.neuroticism = 0.85
    fear_agent.leadership = 0.10

func _physics_process(_delta: float) -> void:
    # Host owns movement. Adapter is advisory only.
    var hint = fear_agent.get_movement_hint()
    if hint.get("intent") == "FREEZE":
        velocity = Vector3.ZERO
    elif hint.get("vector") is Vector3:
        var v: Vector3 = hint["vector"]
        if v.length() > 0.01:
            velocity = v.normalized() * 4.0 * float(hint.get("speed_mult", 1.0))
    move_and_slide()
```

---

## 4. Unreal Engine 5 Integration (C++ / Blueprints)

> **Deferred, adapter kept.** Unreal games should be able to connect the same way as anyone else: local server + this plugin. That is the point of keeping `packages/adapters/unreal/`.
>
> Not current work. Do not install UE5 now. Not required for Unity/Godot/Python/C#.
> Status: `DEFERRED_KEEP_ADAPTER` / `IMPLEMENTED_NOT_VERIFIED (UNREAL_ENGINE_NOT_INSTALLED)`.

### Setup
1. Copy `packages/adapters/unreal/` into your Unreal project's `Plugins/FearAI/` directory.
2. In your project's `.uproject` file or in the Unreal Editor under **Edit -> Plugins**, ensure `FearAI` is enabled.
3. In Blueprint or C++, attach `UFearAgentComponent` to your character pawn.
4. Bind to `OnFearBandChanged` and `OnActionIntentReceived`.

---

## 5. Custom Engines & Scripting (Python Zero-Dependency & C# / .NET 8)

> [!NOTE]
> **Verification Gate Status**: `VERIFIED (PYTHON_3_14_CONFORMANCE & DOTNET_8_SDK)`
> *Host Environment Notice: Python 3.14 fixtures and .NET 8 library compile/round-trip were exercised against the local server. That is not a claim that every runtime is bit-identical, and it is not Unity/Unreal Editor verification.*

If you are building in Python (Pygame, Panda3D, Ursina) or custom C++/Rust engines:
Use `packages/adapters/python/fear_ai_client.py` as a reference:

```python
from fear_ai_client import FearAIClient

client = FearAIClient("http://127.0.0.1:8765")
client.handshake("MyCustomGame")

# Register NPC
client.register_agent("guard_1", traits={"neuroticism": 0.3, "leadership": 0.8})

# Game Loop Tick
observations = [
    {
        "agent_id": "guard_1",
        "x": 10.0, "y": 0.0, "z": 5.0,
        "threats": [{"type": "PREDATOR", "distance": 6.0, "intensity": 0.9}]
    }
]

res = client.tick(observations, dt=0.0166)
for agent_state in res["results"]:
    print(f"Agent {agent_state['agent_id']} intent: {agent_state['action_intent']['type']}")
```

## 6. Capability Advertisement & Outcome Feedback (R36)

Hosts that cannot honor every intent should say so. Read
`capability_requirements` from the handshake response, then echo your
subset per tick:

```python
res = client.tick(observations, capabilities=["supports_dialogue"])
for agent_state in res["results"]:
    downgrade = agent_state.get("capability_downgrade")
    if downgrade:
        print("downgraded", downgrade["original_intent"], "->",
              agent_state["action_intent"]["type"], "-", downgrade["reason"])
```

Report back what actually happened so the server stops sending intents
your game cannot execute (three structural failures park an intent
until a completion clears it):

```python
client.report_outcome("guard_1", "SEEK_COVER", "INTENT_REJECTED", reason="NO_PATH")
```

All adapters ship this surface across languages and engines:
- **Python**: `FearAIClient.tick(..., capabilities=...)`, `report_outcome(...)`, `"peers": [{"id": ...}]`
- **Node**: `FearAIClient.tick(..., dt, capabilities)`, `reportOutcome({...})`, `"peers": [{"id": ...}]`
- **C# / .NET 8**: `FearAIClient.BatchTickAsync(..., capabilities)`, `ReportOutcomeAsync(...)`, `AgentObservation.Peers`
- **Unity**: `FearAIClient.HostCapabilities`, `FearAgent.ReportExecutionOutcome(...)`, `FearAgent.PeerIds` / `AgentObservation.peers`
- **Godot 4**: `FearAIClient.host_capabilities`, `FearAgent.report_outcome(...)`, `FearAgent.peer_ids` / `obs["peers"]`
- **Unreal 5**: `UFearAgentComponent.HostCapabilities`, `UFearAgentComponent.ReportOutcome(...)`, `UFearAgentComponent.VisiblePeerIds` / `obs["peers"]`.

Include visible peers in observations to unlock peer-aware intents (`WARN_GROUP`, `APPROACH_ALLY`). When capabilities are advertised, unsupported intents are gracefully downgraded to legal fallbacks (`SEEK_COVER` $\to$ `FLEE_FROM`, `WARN_GROUP` $\to$ `FLEE_FROM`) with metadata attached.
