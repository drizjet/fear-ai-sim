# Fear AI - Godot 4 Integration Guide

> [!NOTE]
> **Verification Gate Status**: `VERIFIED (GODOT_4_6_STABLE_OFFICIAL_HEADLESS)`
> *Host Environment Notice: Tested and verified against official Godot v4.6-stable Windows 64-bit console binary (`Godot_v4.6-stable_win64_console.exe`) on this host with zero errors.*

This addon provides direct integration between **Godot 4.x (GDScript)** and the **Fear AI Universal Middleware Server**.

## Installation

1. Copy `packages/adapters/godot/` into your Godot project's `addons/fear_ai/` directory.
2. In your Project Settings -> Autoload, add `fear_ai_client.gd` as an Autoload named `FearAIClient`.
3. Add `FearAgent` as a child node to any `CharacterBody2D` or `CharacterBody3D` character.
4. Add monster or hazard nodes to the group `"fear_threats"`.
5. Run the Fear AI server locally: `npx fear-ai-server` or `Launch-FearAI-Server.bat`.

## Architecture
- `FearAIClient`: Handles non-blocking WebSocket polling via `WebSocketPeer` or fallback HTTP.
- `FearAgent`: Gathers local positions and hazards, queues observations, receives affective states, and applies `FLEE_FROM`, `SEEK_COVER`, `FREEZE` intents to character physics via `move_and_slide()`.
