# Fear AI - Godot 4 Integration Guide

> Copy of `packages/adapters/godot/README.md`. Keep these in sync.
> Headless Godot 4.6 only. Not a Fear AI game. Host owns physics.
> Adapter is advisory only (`get_movement_hint()`). Host applies `move_and_slide()`.

This addon talks to the Fear AI middleware server (`npm run server` in the JS repo).

## Installation

1. This test project already vendors the addon at `res://addons/fear_ai/`.
2. Autoload: `FearAIClient` = `res://addons/fear_ai/fear_ai_client.gd`.
3. Start the JS middleware server on `127.0.0.1:8765`.
