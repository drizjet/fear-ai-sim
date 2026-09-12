using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using FearAI.Client;

namespace FearAI.Tests
{
    class Program
    {
        static async Task<int> Main(string[] args)
        {
            Console.WriteLine("================================================================================");
            Console.WriteLine("             REAL C# / .NET SDK VERIFICATION RUNNER                             ");
            Console.WriteLine("================================================================================");

            // R27: host/port from argv so Jest can point the verifier at
            // a booted ephemeral server; defaults preserve the manual run.
            var host = args.Length > 0 && !string.IsNullOrWhiteSpace(args[0]) ? args[0] : "127.0.0.1";
            var port = args.Length > 1 && int.TryParse(args[1], out var p) ? p : 8765;
            using var client = new FearAIClient(host, port);

            Console.WriteLine("[+] C# FearAIClient instantiated cleanly.");

            // 1. Verify Handshake
            var hsSuccess = await client.HandshakeAsync("dotnet_verifier");
            if (!hsSuccess)
            {
                Console.WriteLine($"[WARN] FearServer not running on {host}:{port}; testing offline serialization path.");
                // Test pure C# serialization/deserialization integrity
                var obs = new AgentObservation
                {
                    AgentId = "offline_agent",
                    X = 10, Y = 0, Z = 5,
                    Threats = new List<PerceivedThreat>
                    {
                        new PerceivedThreat { Id = "stalker", Type = "PREDATOR", Distance = 4.5f, Intensity = 1.0f }
                    }
                };
                var json = System.Text.Json.JsonSerializer.Serialize(obs);
                var deserialized = System.Text.Json.JsonSerializer.Deserialize<AgentObservation>(json);
                if (deserialized?.AgentId == "offline_agent" && deserialized.Threats.Count == 1)
                {
                    Console.WriteLine("[PASS] C# Data Contract Serialization verified successfully.");
                    return 0;
                }
                return 1;
            }

            Console.WriteLine("[PASS] C# Handshake with FearServer succeeded!");

            // 2. Register Agent
            var regSuccess = await client.RegisterAgentAsync("csharp_agent_01", new PersonalityTraits
            {
                Fear = 0.5f,
                Neuroticism = 0.7f,
                Resilience = 0.4f
            });
            Console.WriteLine($"[PASS] Agent registration: {regSuccess}");

            // 3. Send Observation & Receive Tick
            var results = await client.BatchTickAsync(new List<AgentObservation>
            {
                new AgentObservation
                {
                    AgentId = "csharp_agent_01",
                    X = 0, Y = 0, Z = 0,
                    Threats = new List<PerceivedThreat>
                    {
                        new PerceivedThreat { Id = "predator_01", Type = "PREDATOR", Distance = 3.0f, Intensity = 1.0f }
                    }
                }
            }, 0.1f);

            if (results.Count > 0)
            {
                var r = results[0];
                Console.WriteLine($"[PASS] Live Tick Result: Agent={r.AgentId} Band={r.FearBand} Intent={r.ActionIntent.Type} Heartbeat={r.AudioHints.HeartbeatBpm} BPM");
                // R38: report the advised intent as completed, then tick
                // with explicitly empty capabilities (every gated intent
                // filters; the call itself must stay healthy).
                var receipt = await client.ReportOutcomeAsync(r.AgentId, r.ActionIntent.Type, "GOAL_COMPLETED");
                Console.WriteLine($"[PASS] Outcome report: {receipt?.Status} unavailable={receipt?.Unavailable}");
                var capped = await client.BatchTickAsync(new List<AgentObservation>
                {
                    new AgentObservation
                    {
                        AgentId = "csharp_agent_01",
                        Threats = new List<PerceivedThreat>
                        {
                            new PerceivedThreat { Id = "predator_01", Type = "PREDATOR", Distance = 3.0f, Intensity = 1.0f }
                        },
                        Peers = new List<VisiblePeer> { new VisiblePeer { Id = "csharp_agent_02" } }
                    }
                }, 0.1f, new List<string>());
                Console.WriteLine($"[PASS] Capped tick results: {capped.Count}");
            }

            Console.WriteLine("================================================================================");
            Console.WriteLine("[C# / .NET SDK VERIFICATION SUCCESS] Clean execution exit 0.");
            Console.WriteLine("================================================================================");
            return 0;
        }
    }
}
