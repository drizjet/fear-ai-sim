using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using FearAI.Client;

namespace Conformance
{
    class Program
    {
        static async Task<int> Main(string[] args)
        {
            var targetUrl = args.Length > 0 ? args[0] : "http://127.0.0.1:8765";
            Console.WriteLine($"Running C# adapter live conformance against '{targetUrl}'...");

            using var client = new FearAIClient(targetUrl);
            var checks = 0;

            // 1. Handshake
            var hsOk = await client.HandshakeAsync("CSharpConformanceHost");
            if (!hsOk)
            {
                Console.Error.WriteLine($"FAIL: HandshakeAsync returned false for '{targetUrl}'");
                return 1;
            }
            checks++;
            Console.WriteLine("  * HandshakeAsync: PASS");

            // 2. Register Agent
            var regOk = await client.RegisterAgentAsync("cs_agent_1", new PersonalityTraits
            {
                Fear = 0.2f,
                Neuroticism = 0.3f,
                Resilience = 0.8f,
                Leadership = 0.7f
            });
            if (!regOk)
            {
                Console.Error.WriteLine("FAIL: RegisterAgentAsync failed");
                return 1;
            }
            checks++;
            Console.WriteLine("  * RegisterAgentAsync: PASS");

            // 3. Observation & Batch Tick
            var tickResults = await client.BatchTickAsync(new List<AgentObservation>
            {
                new AgentObservation
                {
                    AgentId = "cs_agent_1",
                    X = 0f,
                    Y = 0f,
                    Z = 0f,
                    Health = 1.0f,
                    Energy = 1.0f,
                    Threats = new List<PerceivedThreat>
                    {
                        new PerceivedThreat
                        {
                            Id = "threat_alpha",
                            Type = "PREDATOR",
                            Distance = 4.0f,
                            Intensity = 0.9f
                        }
                    }
                }
            }, dt: 0.016f);

            if (tickResults == null || tickResults.Count != 1 || tickResults[0].AgentId != "cs_agent_1")
            {
                Console.Error.WriteLine("FAIL: BatchTickAsync did not return expected agent state");
                return 1;
            }
            checks++;
            Console.WriteLine($"  * BatchTickAsync (Band={tickResults[0].FearBand}, Intent={tickResults[0].ActionIntent.Type}): PASS");

            // 4. Report Outcome
            var receipt = await client.ReportOutcomeAsync("cs_agent_1", tickResults[0].ActionIntent.Type, "GOAL_COMPLETED");
            if (receipt == null || receipt.Status != "RECORDED")
            {
                Console.Error.WriteLine("FAIL: ReportOutcomeAsync did not record outcome");
                return 1;
            }
            checks++;
            Console.WriteLine("  * ReportOutcomeAsync: PASS");

            // 5. Add Trauma Zone
            var traumaRes = await client.AddTraumaZonesAsync(new List<TraumaZone>
            {
                new TraumaZone { X = 10f, Y = 0f, Z = 10f, Intensity = 0.8f, Radius = 50f, LifetimeTicks = 600 }
            });
            if (traumaRes == null || traumaRes.Count < 1)
            {
                Console.Error.WriteLine("FAIL: AddTraumaZonesAsync failed");
                return 1;
            }
            checks++;
            Console.WriteLine("  * AddTraumaZonesAsync: PASS");

            // 6. Session Ownership Inspection
            var ownershipJson = await client.SessionOwnershipJsonAsync();
            if (string.IsNullOrEmpty(ownershipJson) || !ownershipJson.Contains("sessions"))
            {
                Console.Error.WriteLine("FAIL: SessionOwnershipJsonAsync returned invalid payload");
                return 1;
            }
            checks++;
            Console.WriteLine("  * SessionOwnershipJsonAsync: PASS");

            // 7. Unregister Agent
            var unregRes = await client.UnregisterAgentsAsync(new List<string> { "cs_agent_1" });
            if (unregRes == null || !unregRes.Unregistered.Contains("cs_agent_1"))
            {
                Console.Error.WriteLine("FAIL: UnregisterAgentsAsync failed");
                return 1;
            }
            checks++;
            Console.WriteLine("  * UnregisterAgentsAsync: PASS");

            Console.WriteLine($"SUCCESS: All {checks} C# client live conformance assertions PASSED.");
            return 0;
        }
    }
}
