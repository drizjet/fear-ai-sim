# Fear AI - Unreal Engine 5 Integration Guide

This adapter provides native C++ and Blueprint integration between **Unreal Engine 5 (5.1 - 5.5+)** and the **Fear AI Universal Middleware Server**.

## Installation

1. In your Unreal Engine C++ project's `Source/[ProjectName]/` folder, copy:
   - `FearAgentComponent.h`
   - `FearAgentComponent.cpp`
2. In your `[ProjectName].Build.cs`, add `"WebSockets"`, `"Json"`, and `"JsonUtilities"` to `PublicDependencyModuleNames`:
   ```csharp
   PublicDependencyModuleNames.AddRange(new string[] {
       "Core", "CoreUObject", "Engine", "InputCore",
       "WebSockets", "Json", "JsonUtilities"
   });
   ```
3. Compile your project in Visual Studio / Rider or Live Coding.

## Blueprint Usage

1. Open your Character / NPC Blueprint.
2. Click **Add Component** -> search for **Fear Agent**.
3. In the Details panel, set:
   - `Neuroticism` (0.0 to 1.0)
   - `Leadership` (0.0 to 1.0)
4. In the Event Graph, bind to:
   - `OnFearBandChanged`: Fires when agent transitions between emotional states (e.g. `Calm` $\to$ `Alert` $\to$ `Anxious` $\to$ `Panic`).
   - `OnActionIntentReceived`: Delivers `FFearActionIntent` with `Type` (`FLEE_FROM`, `SEEK_COVER`, `FREEZE`), `Urgency`, and `VectorHint`. Wire this directly to your Unreal **AI Controller** / **Move To** / **Gameplay Tasks**.
   - `OnAudioHintsUpdated`: Delivers `FFearAudioHints` (`HeartbeatBpm`, `LowpassCutoffHz`, `ShepardMix`, `VocalizationHint`) to drive MetaSounds or Audio Components.
