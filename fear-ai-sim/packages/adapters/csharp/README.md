> .NET client library (not Unity Editor verification). Start server: `npm run server`. Map: `docs/SYSTEM_MAP.md`.

# Fear AI - C# / .NET 8 Adapter

> [!NOTE]
> **Verification Gate Status**: `VERIFIED (DOTNET_8_SDK / MSBUILD_17_11)`
> *Host Environment Notice: Compiled against the .NET 8 SDK as a library. This is not Unity Editor Play Mode and not Unreal PIE.*

This client library provides high-performance C# integration with the **Fear AI Universal Middleware Server** for .NET standalone applications, custom game engines (Monogame, Stride, Godot C#), and server architectures.

## Features
- **Zero Heavy Dependencies**: Uses .NET standard `System.Net.Http`, `System.Net.WebSockets`, and `System.Text.Json`.
- **Dual Transport**: Supports high-frequency WebSocket streaming (`ws://`) and HTTP REST fallback (`http://`).
- **Strong Typing**: Implements `PersonalityTraits`, `AgentObservation`, `PerceivedThreat`, `PerceivedSound`, `AffectiveState`, `ActionIntent`, and `PsychoacousticHints`.
- **Synchronous & Asynchronous APIs**: Provides non-blocking `async Task` methods alongside blocking helpers for tick loops.

## Usage

```csharp
using FearAI.Client;

using var client = new FearAIClient("http://127.0.0.1:8765");
await client.HandshakeAsync("CSharpConsumerApp");

// Register NPC
await client.RegisterAgentAsync("guard_1", new PersonalityTraits {
    Neuroticism = 0.35f,
    Leadership = 0.80f,
    Resilience = 0.70f
});

// Observation Tick
var response = await client.TickAsync(new[] {
    new AgentObservation {
        AgentId = "guard_1",
        Position = new Vector3(10f, 0f, 5f),
        Threats = new[] {
            new PerceivedThreat {
                Id = "monster_1",
                Type = "PREDATOR",
                Distance = 7.5f,
                Intensity = 0.9f
            }
        }
    }
}, dt: 0.016f);

foreach (var state in response.Results) {
    Console.WriteLine($"Agent {state.AgentId}: Band={state.FearBand}, Intent={state.ActionIntent.Type}");
}
```
