---
title: Fear AI Engine Integration Guide - Unity, Unreal, Godot, and Custom Engines
created: 2026-09-06
updated: 2026-09-06
type: guide
status: active
---

# Fear AI Universal Engine Integration Guide

Connect the Fear AI behavioral & affective simulation system into **any game engine**: Unity, Unreal Engine 5, Godot 4, or custom C++/Python/Rust game engines.

---

## 1. Starting the Middleware Server

The Fear AI middleware runs as a lightweight local server on loopback (`127.0.0.1:8765`).

### Option A: Using Pre-Built Launchers
From the project root:
- **Windows Batch**: Double-click `Launch-FearAI-Server.bat`
- **PowerShell**: Run `./Launch-FearAI-Server.ps1`

### Option B: Using Node.js CLI
From `fear-ai-sim/fear-ai-sim`:
```bash
node packages/runtime/bin/fear-ai-server.js --port 8765 --seed 1337
```

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
3. Attach `FearAgent` to any NPC character GameObject with a `NavMeshAgent`.

### Code Example
```csharp
using UnityEngine;
using FearAI;

public class MonsterEncounter : MonoBehaviour
{
    public FearAgent victimAgent;

    void OnMonsterSpotted(Transform monsterTransform)
    {
        // The FearAgent component automatically scans for colliders on the Threat Layer,
        // evaluates distance and line of sight, streams observations to the server,
        // and steers the NavMeshAgent according to Fear AI intents (FLEE_FROM, SEEK_COVER, etc.).
    }
}
```

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
    # Configure personality
    fear_agent.neuroticism = 0.85 # Highly nervous
    fear_agent.leadership = 0.10  # Low leadership
```

---

## 4. Unreal Engine 5 Integration (C++ / Blueprints)

> [!WARNING]
> **Verification Gate Status**: `IMPLEMENTED_NOT_VERIFIED (UNREAL_ENGINE_NOT_INSTALLED)`
> *Host Environment Notice: Unreal Engine 5 Editor is not installed on this host development machine. The plugin structure (`FearAI.uplugin`, `Source/FearAI/FearAI.Build.cs`, `UFearAgentComponent`), C++ module lifecycle, and ActorComponent adhere strictly to UE5 C++ plugin specifications, but end-to-end binary compilation and editor verification must be executed in an environment with UE5 installed.*

### Setup
1. Copy `packages/adapters/unreal/` into your Unreal project's `Plugins/FearAI/` directory.
2. In your project's `.uproject` file or in the Unreal Editor under **Edit -> Plugins**, ensure `FearAI` is enabled.
3. In Blueprint or C++, attach `UFearAgentComponent` to your character pawn.
4. Bind to `OnFearBandChanged` and `OnActionIntentReceived`.

---

## 5. Custom Engines & Scripting (Python Zero-Dependency & C# / .NET 8)

> [!NOTE]
> **Verification Gate Status**: `VERIFIED (PYTHON_3_14_CONFORMANCE & DOTNET_8_SDK)`
> *Host Environment Notice: Verified with bit-for-bit conformance against canonical fixtures v2 via Python standard library urllib (zero external dependencies) and official .NET 8 MSBuild.*

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
