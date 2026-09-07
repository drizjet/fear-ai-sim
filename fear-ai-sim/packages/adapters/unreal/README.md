# Fear AI - Unreal Engine 5 Plugin

This adapter provides native C++ and Blueprint integration between **Unreal Engine 5 (5.1 - 5.5+)** and the **Fear AI Universal Middleware Server**.

> **Verification Gate Status**: `IMPLEMENTED_NOT_VERIFIED (UNREAL_ENGINE_NOT_INSTALLED)`
> *Note: Unreal Engine 5 Editor is not installed on this host development machine. The plugin structure, C# Build.cs, module interfaces, and ActorComponent adhere strictly to UE5 C++ plugin specifications, but end-to-end binary verification must be executed in an environment with UE5 installed.*

## Installation

### Method 1: As a Project Plugin (Recommended)
1. Create a `Plugins/` directory in your Unreal Engine project root if it does not already exist.
2. Copy the entire `FearAI/` folder into `[YourProjectRoot]/Plugins/FearAI/`.
3. In your project's `.uproject` file or in the Unreal Editor under **Edit -> Plugins**, ensure `FearAI` is enabled.
4. Regenerate project files and build your project in Visual Studio or Rider.

### Method 2: Manual Source Integration
1. In your Unreal Engine C++ project's `Source/[ProjectName]/` folder, copy:
   - `Source/FearAI/Public/FearAgentComponent.h`
   - `Source/FearAI/Private/FearAgentComponent.cpp`
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
   - `OnFearBandChanged`: Fires when agent transitions between emotional states (e.g. `Calm` -> `Alert` -> `Anxious` -> `Panic`).
   - `OnActionIntentReceived`: Delivers `FFearActionIntent` with `Type` (`FLEE_FROM`, `SEEK_COVER`, `FREEZE`), `Urgency`, and `VectorHint`. Wire this directly to your Unreal **AI Controller** / **Move To** / **Gameplay Tasks**.
   - `OnAudioHintsUpdated`: Delivers `FFearAudioHints` (`HeartbeatBpm`, `LowpassCutoffHz`, `ShepardMix`, `VocalizationHint`) to drive MetaSounds or Audio Components.

