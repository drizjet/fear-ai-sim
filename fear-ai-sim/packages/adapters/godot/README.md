# Fear AI - Godot 4 Integration Guide

## Optional authenticated local metadata receiver

The separate `fear_host_ipc_receiver.gd` and opt-in
`FearAIClient.configure_host_metadata_receiver(session, secret,
allowed_events, allowed_entities)` verify **FEAR-IPC-1** HMAC-SHA256
messages with a constant-time tag check, strictly increasing sequence
numbers, per-session rate/byte limits, current-tick checks, and explicit
event/entity allowlists. A trusted owner must provide **fresh credentials
on every child/process restart** and deliver signed packets from a
separately owned authenticated local channel to
`FearAIClient.receive_authenticated_host_metadata(packet, current_tick)`.
On admission the client emits `authenticated_host_metadata_received`;
unauthorized/invalid packets emit `authenticated_host_metadata_rejected`.
Call `close_host_metadata_receiver()` when the owned channel ends;
autoload destruction also closes it.

Do **not** forward the existing middleware WebSocket response messages
into this receiver, or let untrusted scripts access the session secret or
the host's authoritative movement/inventory fields. This is a metadata
receiver, not a general network socket, process sandbox, or replacement
for the normal HTTP/WebSocket host session. The bundled official Godot
4.6 headless runtime parsed the packaged/showcase receiver and client,
and `tests/godot_project/run_host_ipc_conformance.gd` passed **18 in-engine
assertions** of HMAC vector parity, replay, forgery, rate and lifecycle.
This is not a proof of arbitrary external OS transport or complete games.

> **Verification Gate Status**: `HEADLESS_ADAPTER_CONFORMANCE (GODOT_4_6_STABLE_OFFICIAL_HEADLESS)` — headless binary only.
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
- `FearAIClient`: WebSocket / HTTP client. Autoload. Supports `host_capabilities` array for dynamic intent filtering and `report_outcome()` for execution feedback. Registration goes through the server's batch route (`POST /api/v1/register/batch`, up to 512 agents per request), so a populated scene registers in one control round trip rather than one per agent; the individual route remains the fallback for pre-batch servers (detected by a `404`) and for agents a batch did not confirm.
- `FearAgent`: Queues observations (with optional `peer_ids`), receives affective state, recommended **advisory** intents, and capability/affordance downgrades. This packaged adapter is **transport-only**: it reads band and intent from server state and owns no local evaluator. (The standalone showcase build ships a separate offline-fallback variant of this component that mirrors the canonical core.)
- `FearAgentHUD2D`: Reusable floating HUD with zero texture dependencies.
- `FearSteering2D`: Host-authoritative 2D steering controller for `CharacterBody2D`.

## Capabilities & Outcome Feedback (R36/R38/R42)
- Configure `FearAIClient.host_capabilities = ["supports_dialogue", "supports_cover_points"]` in the inspector or in `_ready()`.
- Populate `FearAgent.peer_ids` to enable peer-aware intents (`WARN_GROUP`).
- Call `fear_agent.report_outcome("GOAL_COMPLETED")` or `FearAIClient.report_outcome(id, intent, outcome, reason)` to close the feedback loop.
