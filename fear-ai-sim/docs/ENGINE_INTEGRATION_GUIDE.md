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

### Setup
1. Copy `packages/adapters/unreal/FearAgentComponent.h` and `.cpp` into your project's `Source/[ProjectName]/`.
2. Add `"WebSockets"`, `"Json"`, and `"JsonUtilities"` to your `[ProjectName].Build.cs`.
3. In Blueprint or C++, attach `UFearAgentComponent` to your character pawn.
4. Bind to `OnFearBandChanged` and `OnActionIntentReceived`.

---

## 5. Custom Engines & Scripting (Python Zero-Dependency)

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
