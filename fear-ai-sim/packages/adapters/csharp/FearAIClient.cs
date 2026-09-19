using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace FearAI.Client
{
    public class FearAIClient : IDisposable
    {
        private readonly HttpClient _httpClient;
        private readonly string _baseUrl;

        public event Action<AgentTickResult>? OnAgentStateReceived;

        public FearAIClient(string host = "127.0.0.1", int port = 8765, HttpClient? httpClient = null)
        {
            _baseUrl = $"http://{host}:{port}";
            _httpClient = httpClient ?? new HttpClient();
        }

        public async Task<bool> HandshakeAsync(string clientId = "csharp_client", CancellationToken ct = default)
        {
            try
            {
                var payload = new
                {
                    type = "HANDSHAKE_REQUEST",
                    protocol_version = "1.0.0",
                    client_id = clientId,
                    client_name = clientId,
                    engine = "CSharp"
                };

                var json = JsonSerializer.Serialize(payload);
                using var content = new StringContent(json, Encoding.UTF8, "application/json");
                var response = await _httpClient.PostAsync($"{_baseUrl}/api/v1/handshake", content, ct);
                return response.IsSuccessStatusCode;
            }
            catch (Exception)
            {
                return false;
            }
        }

        public async Task<bool> RegisterAgentAsync(string agentId, PersonalityTraits traits, CancellationToken ct = default)
        {
            try
            {
                var payload = new
                {
                    type = "REGISTER_AGENT",
                    agent_id = agentId,
                    name = agentId,
                    traits
                };

                var json = JsonSerializer.Serialize(payload);
                using var content = new StringContent(json, Encoding.UTF8, "application/json");
                var response = await _httpClient.PostAsync($"{_baseUrl}/api/v1/register", content, ct);
                return response.IsSuccessStatusCode;
            }
            catch (Exception)
            {
                return false;
            }
        }

        public async Task<List<AgentTickResult>> BatchTickAsync(List<AgentObservation> observations, float dt = 0.0166f, List<string>? capabilities = null, CancellationToken ct = default)
        {
            try
            {
                // R36: capabilities omitted entirely when null (legacy
                // unfiltered output); an explicitly empty list filters
                // every gated intent. Anonymous types cannot omit keys,
                // so build the payload as a dictionary.
                var payload = new Dictionary<string, object?>
                {
                    ["type"] = "BATCH_TICK_REQUEST",
                    ["dt"] = dt,
                    ["observations"] = observations
                };
                if (capabilities is not null) payload["capabilities"] = capabilities;

                var json = JsonSerializer.Serialize(payload);
                using var content = new StringContent(json, Encoding.UTF8, "application/json");
                var response = await _httpClient.PostAsync($"{_baseUrl}/api/v1/tick", content, ct);

                if (!response.IsSuccessStatusCode)
                    return new List<AgentTickResult>();

                var respString = await response.Content.ReadAsStringAsync();
                var batchResp = JsonSerializer.Deserialize<BatchTickResponse>(respString);
                var results = batchResp?.Results ?? new List<AgentTickResult>();

                foreach (var result in results)
                {
                    OnAgentStateReceived?.Invoke(result);
                }

                return results;
            }
            catch (Exception)
            {
                return new List<AgentTickResult>();
            }
        }

        /// <summary>R36: report what the host did with an advised intent.
        /// Returns null on transport failure or rejection.</summary>
        public async Task<OutcomeReceipt?> ReportOutcomeAsync(string agentId, string intentType, string outcome, string? reason = null, int tick = 0, CancellationToken ct = default)
        {
            try
            {
                var payload = new Dictionary<string, object?>
                {
                    ["agent_id"] = agentId,
                    ["intent_type"] = intentType,
                    ["outcome"] = outcome,
                    ["tick"] = tick
                };
                if (reason is not null) payload["reason"] = reason;

                var json = JsonSerializer.Serialize(payload);
                using var content = new StringContent(json, Encoding.UTF8, "application/json");
                var response = await _httpClient.PostAsync($"{_baseUrl}/api/v1/outcome", content, ct);
                if (!response.IsSuccessStatusCode) return null;
                var respString = await response.Content.ReadAsStringAsync();
                return JsonSerializer.Deserialize<OutcomeReceipt>(respString);
            }
            catch (Exception)
            {
                return null;
            }
        }

        public void Dispose()
        {
            _httpClient.Dispose();
        }
    }
}
