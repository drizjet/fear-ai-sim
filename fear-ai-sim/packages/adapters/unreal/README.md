# Fear AI - Unreal Engine 5 Plugin

**Deferred, not abandoned.** This plugin is how an Unreal game would connect to Fear AI (same loopback protocol as Unity/Godot/Python). Keep it.

Do **not** install Unreal Engine unless you have an Unreal host to wire. You do not need Unreal to use Unity or any other engine.

This adapter is **source-only** until a real UE5 Editor run exists. Host pawn owns movement; the component should broadcast intents, not move the actor.

This adapter is intended to connect **Unreal Engine 5** to the **Fear AI middleware server**.

> **Verification Gate Status**: `IMPLEMENTED_NOT_VERIFIED (UNREAL_ENGINE_NOT_INSTALLED)`
> *Note: Unreal Editor is not installed here. `FearAI.Build.cs` is Unreal C++ (not C# game code). End-to-end Editor/PIE verification waits until an Unreal host exists. Status: `DEFERRED_KEEP_ADAPTER`.*

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
   - `HostCapabilities` (e.g. `supports_dialogue`, `supports_cover_points`)
   - `VisiblePeerIds` (array of visible peer agent IDs)
4. In the Event Graph, bind to:
   - `OnFearBandChanged`: Fires when agent transitions between emotional states (e.g. `Calm` -> `Alert` -> `Anxious` -> `Panic`).
   - `OnActionIntentReceived`: Delivers `FFearActionIntent` with `Type` (`FLEE_FROM`, `SEEK_COVER`, `FREEZE`), `Urgency`, and `VectorHint`. Wire this directly to your Unreal **AI Controller** / **Move To** / **Gameplay Tasks**.
   - `OnAudioHintsUpdated`: Delivers `FFearAudioHints` (`HeartbeatBpm`, `LowpassCutoffHz`, `ShepardMix`, `VocalizationHint`) to drive MetaSounds or Audio Components.
5. In your gameplay execution tasks, call:
   - `ReportOutcome`: Call on the component (`IntentType`, `Outcome`, `Reason`, `Tick`) to feed execution success or failure back into Fear AI's adaptive filter.

