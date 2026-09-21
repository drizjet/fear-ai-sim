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
        /// <summary>Mirrors MAX_BATCH_CONTROL_ITEMS on the server. Oversized
        /// calls are split rather than rejected as a whole.</summary>
        public const int MaxBatchControlItems = 512;

        private readonly HttpClient _httpClient;
        private readonly string _baseUrl;
        private bool _batchUnsupported;

        public event Action<AgentTickResult>? OnAgentStateReceived;

        /// <summary>A host-chosen NAME for this host's crowd. It survives a host
        /// process restart, but it is NOT a credential: anyone can write down a
        /// name they saw.</summary>
        public string SessionId { get; set; }

        /// <summary>The server-issued CREDENTIAL. Persist it if the host should be
        /// recognised on reconnect; a host that loses it can still adopt its own
        /// name once the incumbent is not live.</summary>
        public string? SessionToken { get; set; }

        /// <summary>`join` (default) or `takeover`, which explicitly and visibly
        /// displaces a LIVE owner instead of being refused.</summary>
        public string ClaimMode { get; set; } = "join";

        /// <summary>True once a 404 proved the server predates the batch control
        /// routes; the client then uses the singular routes for the rest of the
        /// session rather than retrying an endpoint that is not there.</summary>
        public bool BatchControlUnsupported => _batchUnsupported;

        /// <summary>Counters a host can log, so "nothing happened" is
        /// distinguishable from "the fallback path was used" and from silence.</summary>
        public int BatchedRegistrationRequests { get; private set; }
        public int IndividualRegistrationRequests { get; private set; }
        public int BatchedUnregistrationRequests { get; private set; }
        public int BatchedTraumaRequests { get; private set; }
        public int RefusedClaims { get; private set; }
        public int RegistrationFailures { get; private set; }
        public int UnregistrationRejections { get; private set; }

        /// <summary>Ids the server refused to remove because a LIVE session owned
        /// them. Distinct from <see cref="UnregistrationRejections"/> (malformed
        /// entries): this host is not the owner, and it needs to know that rather
        /// than assume an agent it asked about is gone.</summary>
        public int UnregistrationRefusals { get; private set; }
        public int TraumaZonesRejected { get; private set; }

        /// <summary>The host's signing key, when request signing is on. Null means
        /// this host proves itself with its token alone.</summary>
        public FearRequestSigner? Signer { get; private set; }

        /// <summary>Whether the server has CONFIRMED this host's key. Until it has,
        /// every claim carries the public key (which is what registers it); after
        /// that there is no reason to send 450 bytes of PEM on every request.</summary>
        public bool SigningKeyRegistered { get; private set; }

        /// <summary>
        /// Turn on request signing, generating a keypair unless one is supplied.
        ///
        /// Off by default and deliberately so: turning it on commits the host to
        /// keeping a private key, and a host that does not need it should not pay
        /// for it. Nothing changes for a host that leaves it alone.
        ///
        /// @param privateKeyText an existing key from
        ///        <see cref="FearRequestSigner.ExportPrivateKeyText"/>, or null to
        ///        generate one. A host that persists this gets restart continuity;
        ///        one that does not can still sign for the life of the process.
        /// </summary>
        public FearAIClient EnableSigning(string? privateKeyText = null)
        {
            Signer = privateKeyText == null
                ? new FearRequestSigner().Generate()
                : new FearRequestSigner().FromPrivateKeyText(privateKeyText);
            return this;
        }

        /// <summary>The public key to register, or null when signing is off or the
        /// server has already confirmed it.</summary>
        private string? PendingSigningKey =>
            Signer != null && !SigningKeyRegistered && !string.IsNullOrEmpty(Signer.PublicKeyPem)
                ? Signer.PublicKeyPem
                : null;

        /// <summary>
        /// Signature headers for one request, or an empty set when signing is not
        /// in play.
        ///
        /// Signing starts only once the server has CONFIRMED the key. Signing the
        /// first claim would be refused as an unknown key - no session exists yet
        /// for it to belong to - and that first claim is the one carrying the
        /// public key, so refusing it would leave this host unable to ever
        /// establish one.
        /// </summary>
        private IEnumerable<KeyValuePair<string, string>> SignatureHeaders(string method, string path, string body)
        {
            if (Signer == null || !SigningKeyRegistered || string.IsNullOrEmpty(SessionId))
            {
                return Array.Empty<KeyValuePair<string, string>>();
            }
            return Signer.SignHeaders(method, path, body, SessionId);
        }

        /// <summary>Read the server's key report off any control response, and
        /// treat a signature refusal as the signal it is.</summary>
        private void NoteSigningOutcome(int status, string? body)
        {
            if (Signer == null) return;
            var keyOutcome = ExtractKeyOutcome(body);
            if (keyOutcome != null)
            {
                if (keyOutcome.EndsWith("REGISTERED", StringComparison.Ordinal) ||
                    keyOutcome.EndsWith("REPLACED", StringComparison.Ordinal))
                {
                    SigningKeyRegistered = true;
                }
                else if (keyOutcome.StartsWith("SIGNING_KEY_REFUSED", StringComparison.Ordinal))
                {
                    Signer.NoteRefusal(keyOutcome);
                }
            }
            // IndexOf rather than Contains: the two-argument `Contains` is not in
            // netstandard2.0, which this project still targets.
            if (status == 401 && body != null && body.IndexOf("\"code\":\"SIGNATURE", StringComparison.Ordinal) >= 0)
            {
                // The server holds a key for this session, so it will insist on a
                // signature from now on. This is the recovery path for a lost
                // response to the request that registered the key.
                Signer.NoteRefusal("SIGNATURE_MISSING");
                SigningKeyRegistered = true;
            }
        }

        private static string? ExtractKeyOutcome(string? body)
        {
            if (string.IsNullOrEmpty(body)) return null;
            const string marker = "\"signing_key\"";
            var at = body.IndexOf(marker, StringComparison.Ordinal);
            if (at < 0) return null;
            const string outcomeMarker = "\"outcome\":\"";
            var from = body.IndexOf(outcomeMarker, at, StringComparison.Ordinal);
            if (from < 0) return null;
            from += outcomeMarker.Length;
            var to = body.IndexOf('"', from);
            return to < 0 ? null : body.Substring(from, to - from);
        }

        public FearAIClient(string host = "127.0.0.1", int port = 8765, HttpClient? httpClient = null, string? sessionId = null)
        {
            _baseUrl = $"http://{host}:{port}";
            _httpClient = httpClient ?? new HttpClient();
            SessionId = sessionId ?? $"csharp_client_{Guid.NewGuid():N}";
        }

        /// <summary>Identity fields attached to every claim, so the server can
        /// attribute ownership. Without them the host has no identity and cannot
        /// be recognised on reconnect, which is the point of the session.</summary>
        private Dictionary<string, object?> ClaimFields()
        {
            var fields = new Dictionary<string, object?>
            {
                ["session_id"] = SessionId,
                ["claim"] = ClaimMode
            };
            if (!string.IsNullOrEmpty(SessionToken)) fields["session_token"] = SessionToken;
            // Offered with the claim, because a claim is the moment the server has
            // a session for the key to belong to. Sent only until it is confirmed.
            var publicKey = PendingSigningKey;
            if (publicKey != null) fields["signing_public_key"] = publicKey;
            return fields;
        }

        /// <summary>Store a token the server just issued. Returns true when one
        /// was already present (an idempotent re-read of the same identity).</summary>
        private bool AdoptSessionToken(string? token)
        {
            if (string.IsNullOrEmpty(token)) return false;
            SessionToken = token;
            return true;
        }

        public async Task<bool> HandshakeAsync(string clientId = "csharp_client", CancellationToken ct = default)
        {
            try
            {
                var payload = new Dictionary<string, object?>
                {
                    ["type"] = "HANDSHAKE_REQUEST",
                    ["protocol_version"] = "1.0.0",
                    ["client_id"] = clientId,
                    ["client_name"] = clientId,
                    ["engine"] = "CSharp",
                    // Naming the session here binds this identity immediately, so
                    // the server sees the host as live from the first message.
                    ["session_id"] = SessionId
                };
                if (!string.IsNullOrEmpty(SessionToken)) payload["session_token"] = SessionToken;

                var json = JsonSerializer.Serialize(payload);
                // The handshake NAMES a session, so under the server's `required`
                // policy it is gated exactly like a claim: a keyed session that
                // skipped signing here would be refused.
                using var request = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/api/v1/handshake");
                request.Content = new StringContent(json, Encoding.UTF8, "application/json");
                foreach (var header in SignatureHeaders("POST", "/api/v1/handshake", json))
                {
                    request.Headers.TryAddWithoutValidation(header.Key, header.Value);
                }
                var response = await _httpClient.SendAsync(request, ct);
                var body = await response.Content.ReadAsStringAsync();
                NoteSigningOutcome((int)response.StatusCode, body);
                if (!response.IsSuccessStatusCode) return false;
                var parsed = JsonSerializer.Deserialize<HandshakeResponse>(body);
                AdoptSessionToken(parsed?.SessionToken);
                return true;
            }
            catch (Exception)
            {
                return false;
            }
        }

        public async Task<bool> RegisterAgentAsync(string agentId, PersonalityTraits traits, CancellationToken ct = default)
        {
            var result = await RegisterAgentsAsync(new List<AgentRegistration>
            {
                new AgentRegistration { AgentId = agentId, Name = agentId, Traits = traits }
            }, ct);
            return result.Registered.Contains(agentId);
        }

        /// <summary>Register many agents in ONE HTTP round trip (chunked at the
        /// server's own cap for larger casts).
        ///
        /// Falls back to per-agent registration when the server predates the
        /// batch route. A `refused` entry means a LIVE session owns that agent
        /// and nothing was mutated; it is reported and counted, never retried,
        /// because retrying would fail identically while looking like progress.
        /// </summary>
        public async Task<BatchRegistrationResult> RegisterAgentsAsync(List<AgentRegistration> agents, CancellationToken ct = default)
        {
            var aggregate = new BatchRegistrationResult { Status = "REGISTERED" };
            if (agents.Count == 0) return aggregate;

            foreach (var chunk in Chunk(agents, MaxBatchControlItems))
            {
                var result = await RegisterChunkAsync(chunk, ct);
                aggregate.Registered.AddRange(result.Registered);
                aggregate.Refused.AddRange(result.Refused);
                aggregate.Rejected.AddRange(result.Rejected);
                if (!string.IsNullOrEmpty(result.SessionToken)) AdoptSessionToken(result.SessionToken);
                if (result.SessionId is not null) SessionId = result.SessionId;
            }
            aggregate.Count = aggregate.Registered.Count;
            if (aggregate.Registered.Count == 0) aggregate.Status = "REFUSED";
            return aggregate;
        }

        private async Task<BatchRegistrationResult> RegisterChunkAsync(List<AgentRegistration> chunk, CancellationToken ct)
        {
            if (!_batchUnsupported)
            {
                var payload = new Dictionary<string, object?> { ["agents"] = chunk };
                foreach (var kv in ClaimFields()) payload[kv.Key] = kv.Value;
                var (status, body) = await PostJsonAsync("/api/v1/register/batch", payload, ct);
                if (status == 404)
                {
                    _batchUnsupported = true;
                }
                else if (status == 200 && body is not null)
                {
                    BatchedRegistrationRequests++;
                    var parsed = JsonSerializer.Deserialize<BatchRegistrationResult>(body) ?? new BatchRegistrationResult();
                    RefusedClaims += parsed.Refused.Count;
                    parsed.Rejected ??= new List<ClaimRefusal>();
                    return parsed;
                }
                else if (status == 409)
                {
                    // The whole request was refused at identity level: nothing
                    // was mutated and every entry is unowned by this caller.
                    var parsed = JsonSerializer.Deserialize<BatchRegistrationResult>(body ?? "{}") ?? new BatchRegistrationResult();
                    RefusedClaims += chunk.Count;
                    parsed.Status = "REFUSED";
                    return parsed;
                }
            }
            return await RegisterChunkIndividuallyAsync(chunk, ct);
        }

        private async Task<BatchRegistrationResult> RegisterChunkIndividuallyAsync(List<AgentRegistration> chunk, CancellationToken ct)
        {
            var result = new BatchRegistrationResult { Status = "REGISTERED" };
            foreach (var entry in chunk)
            {
                var payload = new Dictionary<string, object?>
                {
                    ["type"] = "REGISTER_AGENT",
                    ["agent_id"] = entry.AgentId,
                    ["name"] = entry.Name ?? entry.AgentId,
                    ["traits"] = entry.Traits ?? new PersonalityTraits()
                };
                if (entry.InitialPosition is not null) payload["initial_position"] = entry.InitialPosition;
                foreach (var kv in ClaimFields()) payload[kv.Key] = kv.Value;

                var (status, body) = await PostJsonAsync("/api/v1/register", payload, ct);
                IndividualRegistrationRequests++;
                if (status == 200)
                {
                    if (body is not null)
                    {
                        var parsed = JsonSerializer.Deserialize<BatchRegistrationResult>(body);
                        AdoptSessionToken(parsed?.SessionToken);
                    }
                    result.Registered.Add(entry.AgentId);
                }
                else if (status == 409)
                {
                    RefusedClaims++;
                    result.Refused.Add(new ClaimRefusal
                    {
                        AgentId = entry.AgentId,
                        OwnerSessionId = body is null ? null : JsonSerializer.Deserialize<BatchRegistrationResult>(body)?.SessionId,
                        Reason = "REFUSED_OWNED_BY_LIVE_SESSION"
                    });
                }
                else
                {
                    // Transport-shaped failure. Counted and reported, never
                    // assumed to have succeeded: an unregistered agent reads to
                    // the host as "the middleware returned nothing".
                    RegistrationFailures++;
                    result.Refused.Add(new ClaimRefusal { AgentId = entry.AgentId, Reason = $"http_{status}" });
                }
            }
            result.Count = result.Registered.Count;
            if (result.Registered.Count == 0) result.Status = "REFUSED";
            return result;
        }

        /// <summary>Retire many agents in ONE HTTP round trip. `not_found` is
        /// terminal and not an error - the caller asked for the agent to be gone
        /// and it is gone. Only `rejected` entries were NOT removed.</summary>
        public async Task<BatchUnregisterResult> UnregisterAgentsAsync(List<string> agentIds, CancellationToken ct = default)
        {
            var aggregate = new BatchUnregisterResult { Status = "UNREGISTERED" };
            if (agentIds.Count == 0) return aggregate;

            foreach (var chunk in Chunk(agentIds, MaxBatchControlItems))
            {
                if (!_batchUnsupported)
                {
                    // Teardown is ownership-gated on the server, so the CREDENTIAL
                    // travels with it: a request carrying only the session NAME is
                    // refused as a stranger's, which would lock this host out of
                    // retiring its own crowd.
                    var batchFields = new Dictionary<string, object?>
                    {
                        ["agent_ids"] = chunk,
                        ["session_id"] = SessionId
                    };
                    if (!string.IsNullOrEmpty(SessionToken)) batchFields["session_token"] = SessionToken;
                    var (status, body) = await PostJsonAsync("/api/v1/unregister/batch", batchFields, ct);
                    if (status == 404)
                    {
                        _batchUnsupported = true;
                    }
                    else if (status == 200 && body is not null)
                    {
                        BatchedUnregistrationRequests++;
                        var parsed = JsonSerializer.Deserialize<BatchUnregisterResult>(body);
                        if (parsed is not null)
                        {
                            UnregistrationRejections += parsed.Rejected.Count;
                            UnregistrationRefusals += parsed.Refused.Count;
                            aggregate.Unregistered.AddRange(parsed.Unregistered);
                            aggregate.NotFound.AddRange(parsed.NotFound);
                            aggregate.Rejected.AddRange(parsed.Rejected);
                            aggregate.Refused.AddRange(parsed.Refused);
                            continue;
                        }
                    }
                }
                foreach (var id in chunk)
                {
                    var singleFields = new Dictionary<string, object?>
                    {
                        ["type"] = "UNREGISTER_AGENT",
                        ["agent_id"] = id,
                        ["session_id"] = SessionId
                    };
                    if (!string.IsNullOrEmpty(SessionToken)) singleFields["session_token"] = SessionToken;
                    var (status, _) = await PostJsonAsync("/api/v1/unregister", singleFields, ct);
                    if (status == 200) aggregate.Unregistered.Add(id);
                    else aggregate.NotFound.Add(id);
                }
            }
            aggregate.Count = aggregate.Unregistered.Count;
            return aggregate;
        }

        /// <summary>Author many trauma zones in ONE HTTP round trip. Zones are
        /// world state, so partial application is normal: only explicitly
        /// rejected zones are dropped, and they are counted rather than
        /// retried, because a malformed zone would be malformed again.</summary>
        public async Task<BatchTraumaResult> AddTraumaZonesAsync(List<TraumaZone> zones, CancellationToken ct = default)
        {
            var aggregate = new BatchTraumaResult { Status = "ADDED" };
            if (zones.Count == 0) return aggregate;

            foreach (var chunk in Chunk(zones, MaxBatchControlItems))
            {
                if (!_batchUnsupported)
                {
                    var (status, body) = await PostJsonAsync("/api/v1/trauma/batch", new Dictionary<string, object?> { ["zones"] = chunk }, ct);
                    if (status == 404)
                    {
                        _batchUnsupported = true;
                    }
                    else if (status == 200 && body is not null)
                    {
                        BatchedTraumaRequests++;
                        var parsed = JsonSerializer.Deserialize<BatchTraumaResult>(body);
                        if (parsed is not null)
                        {
                            TraumaZonesRejected += parsed.Rejected.Count;
                            aggregate.Count += parsed.Count;
                            aggregate.ZoneIds.AddRange(parsed.ZoneIds);
                            aggregate.Rejected.AddRange(parsed.Rejected);
                            continue;
                        }
                    }
                }
                foreach (var zone in chunk)
                {
                    var (status, _) = await PostJsonAsync("/api/v1/trauma", new Dictionary<string, object?>
                    {
                        ["x"] = zone.X,
                        ["y"] = zone.Y,
                        ["z"] = zone.Z,
                        ["intensity"] = zone.Intensity,
                        ["radius"] = zone.Radius,
                        ["lifetimeTicks"] = zone.LifetimeTicks
                    }, ct);
                    if (status == 200) aggregate.Count++;
                    else aggregate.Rejected.Add(new ClaimRefusal { Reason = $"http_{status}" });
                }
            }
            return aggregate;
        }

        /// <summary>Read-only ownership summary, as raw JSON.
        ///
        /// Deliberately NOT modelled here: the summary's shape belongs to the
        /// server, and a client-side copy of it would silently drift. Deserialize
        /// what you need.
        /// </summary>
        public async Task<string?> SessionOwnershipJsonAsync(CancellationToken ct = default)
        {
            try
            {
                var response = await _httpClient.GetAsync($"{_baseUrl}/api/v1/sessions", ct);
                if (!response.IsSuccessStatusCode) return null;
                return await response.Content.ReadAsStringAsync();
            }
            catch (Exception)
            {
                return null;
            }
        }

        /// <summary>POST JSON and return `(status, rawBody)`. An HTTP error
        /// status is a NORMAL result, not an exception: 404 means "this server
        /// predates this route" and 409 means "refused", and both are decisions
        /// the caller has to make.</summary>
        private async Task<(int Status, string? Body)> PostJsonAsync(string path, object payload, CancellationToken ct)
        {
            try
            {
                var json = JsonSerializer.Serialize(payload);
                using var request = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}{path}");
                request.Content = new StringContent(json, Encoding.UTF8, "application/json");
                foreach (var header in SignatureHeaders("POST", path, json))
                {
                    request.Headers.TryAddWithoutValidation(header.Key, header.Value);
                }
                var response = await _httpClient.SendAsync(request, ct);
                var body = await response.Content.ReadAsStringAsync();
                NoteSigningOutcome((int)response.StatusCode, body);
                return ((int)response.StatusCode, body);
            }
            catch (Exception)
            {
                return (0, null);
            }
        }

        private static IEnumerable<List<T>> Chunk<T>(List<T> items, int size)
        {
            for (var i = 0; i < items.Count; i += size)
            {
                yield return items.GetRange(i, Math.Min(size, items.Count - i));
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
