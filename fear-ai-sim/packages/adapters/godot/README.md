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

## Architecture
- `FearAIClient`: WebSocket / HTTP client. Autoload.
- `FearAgent`: Queues observations, receives affective state and **advisory** intents. Host applies movement.
