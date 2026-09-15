# Fear AI - Unity Engine Integration Guide

> [!WARNING]
> **Verification Gate Status**: `IMPLEMENTED_NOT_VERIFIED (UNITY_EDITOR_NOT_INSTALLED)`
> *Host Environment Notice: Unity Editor is not installed on this host development machine. The underlying C# types and client logic compile cleanly under the .NET 8 SDK / Roslyn compiler, but end-to-end Unity Editor playmode and scene verification must be executed in an environment with the Unity Editor installed.*

This package is a **source adapter**, not a verified Unity product. Unity Editor is not installed on the development host.

Adapter is advisory only: read `CurrentIntent`, `RecommendedVector`, `SuggestedSpeed()`. Host owns `NavMeshAgent`. See `examples/unity/NeutralHorrorDemoScene.cs`.

This package is intended to connect **Unity** to the **Fear AI middleware server** (`npm run server` in the JS tree).

## Quick Start (3 Steps)

### 1. Copy Files into Your Unity Project
Copy the `packages/adapters/unity/` directory into your Unity project's `Assets/FearAI/` folder:
```
Assets/
  └── FearAI/
      ├── FearTypes.cs
      ├── FearAIClient.cs
      ├── FearAgent.cs
      ├── FearAgentHUD.cs
      └── README.md
```

### 1.1 (Optional) Instant Floating HUD
Attach `FearAgentHUD` to any GameObject that has `FearAgent` to render floating fear meters, action intent labels, and heartbeat BPM in OnGUI / Screen-space with zero texture dependencies.

### 2. Add `FearAIClient` to Your Scene
1. Create an empty GameObject in your initial scene named `FearAI_Manager`.
2. Attach the `FearAIClient` component.
3. Configure the **Server Host** (`127.0.0.1`) and **Server Port** (`8765`).

### 3. Attach `FearAgent` to Your NPCs
1. Attach `FearAgent` to any NPC GameObject with a `NavMeshAgent`.
2. Configure perception layers:
   - **Threat Layer**: Set to layer containing Monsters/Predators/Horror objects.
   - **Obstacle Layer**: Set to layer containing Environment geometry (walls, cover).
3. Tune personality in the Inspector:
   - `neuroticism` (0.8 = terrified civilian, 0.1 = hardened commando)
   - `leadership` (0.9 = calm leader whose proximity calms panicking allies)
   - `fear` (base susceptibility)

## How It Works: The Host Authority Invariant
1. In `Update()`, `FearAgent` samples nearby colliders in vision cone and sends sensory observations (`threats`, distances, occlusions, and optional `peers`) to `FearAIClient`.
2. The local Fear AI server updates the 11-band emotional model, habituation curves, and social panic contagion.
3. `FearAgent.OnFearStateUpdated()` receives affective state and recommended `ActionIntent` (`FLEE_FROM`, `SEEK_COVER`, `FREEZE`, etc.), plus any `CapabilityDowngrade` or `AffordanceDowngrade` annotations.
4. Unity's `NavMeshAgent` executes movement seamlessly with zero physics stutter.
5. Host reports execution feedback via `FearAgent.ReportExecutionOutcome("GOAL_COMPLETED")` or `ReportOutcome("INTENT_REJECTED", "NO_PATH")` to close the adaptive advisory loop.

## Advanced Features (R36/R38/R42)
- **Host Capabilities**: Set `FearAIClient.HostCapabilities` (e.g. `["supports_dialogue", "supports_cover_points"]`) to dynamically filter unsupported intents.
- **Social Awareness**: Populate `FearAgent.PeerIds` with visible companion IDs to enable peer-directed intents (`WARN_GROUP`, `APPROACH_ALLY`).
- **Outcome Feedback**: Call `FearAgent.ReportExecutionOutcome(outcome, reason)` to let the server learn structural execution limits.
