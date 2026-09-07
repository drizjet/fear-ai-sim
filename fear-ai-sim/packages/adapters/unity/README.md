# Fear AI - Unity Engine Integration Guide

> [!WARNING]
> **Verification Gate Status**: `IMPLEMENTED_NOT_VERIFIED (UNITY_EDITOR_NOT_INSTALLED)`
> *Host Environment Notice: Unity Editor is not installed on this host development machine. The underlying C# types and client logic compile cleanly under the .NET 8 SDK / Roslyn compiler, but end-to-end Unity Editor playmode and scene verification must be executed in an environment with the Unity Editor installed.*

This package provides direct drop-in integration between **Unity (2021.3 LTS / 2022.3 LTS / 6+)** and the **Fear AI Universal Middleware Server**.

## Quick Start (3 Steps)

### 1. Copy Files into Your Unity Project
Copy the `packages/adapters/unity/` directory into your Unity project's `Assets/FearAI/` folder:
```
Assets/
  └── FearAI/
      ├── FearTypes.cs
      ├── FearAIClient.cs
      ├── FearAgent.cs
      └── README.md
```

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
1. In `Update()`, `FearAgent` samples nearby colliders in vision cone and sends sensory observations (`threats`, distances, occlusions) to `FearAIClient`.
2. The local Fear AI server updates the 11-band emotional model, habituation curves, and social panic contagion.
3. `FearAgent.OnFearStateUpdated()` receives affective state and recommended `ActionIntent` (`FLEE_FROM`, `SEEK_COVER`, `FREEZE`, etc.).
4. Unity's `NavMeshAgent` executes movement seamlessly with zero physics stutter.
