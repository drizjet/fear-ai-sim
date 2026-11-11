> .NET client library (not Unity Editor verification). Start server: `npm run server`. Map: `docs/SYSTEM_MAP.md`.

# Fear AI - C# / .NET 8 Adapter

> [!NOTE]
> **Verification Gate Status**: `BUILD_VERIFIED (DOTNET_8_SDK / MSBUILD_17_11)`
> *Host Environment Notice: The library has recorded .NET 8 compilation evidence. This is not Unity Editor Play Mode, Unreal PIE, or proof of adoption by an external game.*

This client library provides C# integration with the **Fear AI Universal Middleware Server** for .NET standalone applications, custom game engines (Monogame, Stride, Godot C#), and server architectures.

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

## Opt-in trusted child IPC wire signer

`FearHostIpcSigner` creates FEAR-IPC-1 HMAC-SHA256 envelopes from **primitive
JSON strings** for an explicitly configured trusted Node-side child IPC
gateway. Construct with the parent-issued fresh `sessionId` and `secret`,
call `Sign(jsonText)` in sequence, and `Dispose()` on session end to erase
the owned key buffer. It is **not** the regular FearAI middleware request
signer and does not alter the existing HTTP transport. Use the receiving
gateway to enforce peer identity, rate, byte budget and replay protection.
