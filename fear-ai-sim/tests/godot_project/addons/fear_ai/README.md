# Fear AI - Godot 4 Integration Guide

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
