> Python client. Start server with `npm run server` in the JS repo. Map: `docs/SYSTEM_MAP.md`.

# Fear AI - Python Client Adapter

> [!NOTE]
> **Verification Gate Status**: `VERIFIED (PYTHON_3_14_CONFORMANCE)`
> *Host Environment Notice: Python 3.14 client ran canonical fixtures against the local server (reported fixture delta 0.000000 on that suite). That is not a claim that every runtime is bit-identical.*

This client library provides zero-dependency Python integration with the **Fear AI Universal Middleware Server** for Pygame, Panda3D, Ursina, Raylib, simulation harnesses, and headless test runners.

## Features
- **Zero External Dependencies**: Uses only standard library modules `urllib.request` and `json`.
- **Fast HTTP REST Loopback**: Queries complete in 1.0 - 2.5 ms per batch.
- **Convenient High-Level API**: Includes `handshake()`, `register_agent()`, `tick()`, `unregister_agent()`, `save_snapshot()`, and `load_snapshot()`.

## Usage

```python
from fear_ai_client import FearAIClient

client = FearAIClient("http://127.0.0.1:8765")
client.handshake("SurvivalGame")

# Register NPC
client.register_agent("civilian_1", traits={"neuroticism": 0.8, "resilience": 0.2})

# Game Loop Tick
observations = [
    {
        "agent_id": "civilian_1",
        "x": 10.0, "y": 0.0, "z": 5.0,
        "threats": [{"type": "PREDATOR", "distance": 6.0, "intensity": 0.9}]
    }
]

response = client.tick(observations, dt=0.016)
for res in response["results"]:
    print(f"Agent {res['agent_id']}: Band={res['fear_band']}, Intent={res['action_intent']['type']}")
```
