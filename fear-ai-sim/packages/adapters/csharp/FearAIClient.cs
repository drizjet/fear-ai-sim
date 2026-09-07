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
                    client_name = clientId
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

        public async Task<List<AgentTickResult>> BatchTickAsync(List<AgentObservation> observations, float dt = 0.0166f, CancellationToken ct = default)
        {
            try
            {
                var payload = new
                {
                    type = "BATCH_TICK_REQUEST",
                    dt,
                    observations
                };

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

        public void Dispose()
        {
            _httpClient.Dispose();
        }
    }
}
