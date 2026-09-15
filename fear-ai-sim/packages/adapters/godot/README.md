# Fear AI - Godot 4 Integration Guide

> **Verification Gate Status**: `VERIFIED (GODOT_4_6_STABLE_OFFICIAL_HEADLESS)` — headless binary only.
> This is **not** a Fear AI Godot game. The host Godot project owns physics.
>
> Adapter is advisory only: `FearAgent.get_movement_hint()`. Host calls `move_and_slide()`.

This addon talks to the **Fear AI middleware server**.

## Installation

1. Copy `packages/adapters/godot/` into your Godot project's `addons/fear_ai/` directory.
2. In Project Settings -> Autoload, add `fear_ai_client.gd` as an Autoload named `FearAIClient`.
3. Add `FearAgent` as a child of a `CharacterBody2D` / `CharacterBody3D`.
4. Put hazards in the `"fear_threats"` group.
5. Start the server from the JS repo: `npm run server` (loopback `:8765`). There is no `npx fear-ai-server` package and no `Launch-FearAI-Server.bat` in tree.

## Drop-In Components & Quickstart
- **`FearAgentHUD2D`**: Add as child of NPC to immediately render stylized floating fear meters (green -> red), current intent badge, and pulsating heartbeat indicator.
- **`FearSteering2D`**: Add as child of `CharacterBody2D` to autonomously smooth advisory vectors into host physics `move_and_slide()` with automatic obstacle deflection.
- **`examples/quickstart_2d.tscn`**: Out-of-the-box 5-minute interactive demo scene. Move Player with arrow keys/WASD, press `[Space]` to emit acoustic startle shouts, and watch NPC flee and slide around walls.

## Architecture
- `FearAIClient`: WebSocket / HTTP client. Autoload. Supports `host_capabilities` array for dynamic intent filtering and `report_outcome()` for execution feedback.
- `FearAgent`: Queues observations (with optional `peer_ids`), receives affective state, recommended **advisory** intents, and capability/affordance downgrades. Supports offline `evaluate_local()` fallback.
- `FearAgentHUD2D`: Reusable floating HUD with zero texture dependencies.
- `FearSteering2D`: Host-authoritative 2D steering controller for `CharacterBody2D`.

## Capabilities & Outcome Feedback (R36/R38/R42)
- Configure `FearAIClient.host_capabilities = ["supports_dialogue", "supports_cover_points"]` in the inspector or in `_ready()`.
- Populate `FearAgent.peer_ids` to enable peer-aware intents (`WARN_GROUP`).
- Call `fear_agent.report_outcome("GOAL_COMPLETED")` or `FearAIClient.report_outcome(id, intent, outcome, reason)` to close the feedback loop.
