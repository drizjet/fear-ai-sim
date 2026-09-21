using System;
using System.Collections;
using System.Collections.Generic;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace FearAI
{
    public class FearAIClient : MonoBehaviour
    {
        public static FearAIClient Instance { get; private set; }

        [Header("Connection Settings")]
        [SerializeField] private string serverHost = "127.0.0.1";
        [SerializeField] private int serverPort = 8765;
        [SerializeField] private bool useWebSocket = true;
        [SerializeField] private float reconnectInterval = 3.0f;

        [Header("Host Capabilities (R36/R38)")]
        [SerializeField] private List<string> hostCapabilities = new List<string>();
        public List<string> HostCapabilities => hostCapabilities;

        [Header("Session Identity")]
        [Tooltip("Host-chosen NAME for this host's crowd. It survives a host restart but is NOT a credential: anyone can write down a name they saw.")]
        [SerializeField] private string sessionId = "unity_host";
        /// <summary>Explicit, counted displacement of a LIVE owner. Left at the
        /// default a competing host is refused rather than silently winning.</summary>
        [Tooltip("`join` (default) or `takeover`, which explicitly and visibly displaces a live owner.")]
        [SerializeField] private string claimMode = "join";

        /// <summary>Host-chosen NAME for this crowd (see the tooltip above).</summary>
        public string SessionId { get => sessionId; set => sessionId = value; }

        /// <summary>Server-issued CREDENTIAL. Persist this if the host should be
        /// recognised on reconnect; a host that loses it can still adopt its own
        /// name once the incumbent is not live.</summary>
        public string SessionToken { get; set; } = "";

        [Header("Credential Persistence")]
        [Tooltip("Keep the credential in SessionStore so a restart of THIS process is a reconnect instead of an arrival. Off by default: the token is a bearer credential, and a host with nowhere safe to put it is better off adopting its own name once the previous session is not live.")]
        [SerializeField] private bool persistSession = false;

        /// <summary>Where the credential lives between runs. Defaults to an
        /// in-memory store, i.e. nothing outlives this process; assign a
        /// <see cref="FearEncryptedSessionStore"/> to persist it UNREADABLE AT REST,
        /// or a <see cref="FileSessionStore"/> / <see cref="PlayerPrefsSessionStore"/> to
        /// persist it in the clear. Assign it BEFORE the component wakes.</summary>
        public ISessionStore SessionStore { get; set; } = new InMemorySessionStore();

        /// <summary>Turns on load-on-wake and save-on-issue.</summary>
        public bool PersistSession { get => persistSession; set => persistSession = value; }

        /// <summary>
        /// How the store on disk is ACTUALLY protected, as the store reports it.
        ///
        /// "Persistence is on" says nothing about whether the file is readable, so
        /// this is not inferred from <see cref="PersistSession"/>: it is whatever the
        /// store last observed (ENCRYPTED, PLAINTEXT_LEGACY, PLAINTEXT_BY_REQUEST),
        /// or NONE when the configured store does not report a protection level at
        /// all - which is itself useful information, because it means the host picked
        /// one of the plaintext stores.
        /// </summary>
        public string SessionStoreProtection =>
            SessionStore is ISecretSessionStore secret ? secret.Protection : "NONE";

        /// <summary>Why the last store operation failed. Empty on success.</summary>
        public string SessionStoreError { get; private set; } = "";

        /// <summary>
        /// A signing key that was READ BACK from the store, held until signing is
        /// turned on.
        ///
        /// The ordering is forced: the store is read in `Awake` and the host calls
        /// <see cref="EnableSigning()"/> afterwards. Without this, a restarted host
        /// would generate a NEW key and present it to a server that still holds the
        /// old one, which is refused - i.e. persistence would appear to work and
        /// leave the host unable to sign at all. So the stored key WINS.
        /// </summary>
        public string StoredSigningKeyText { get; private set; } = "";

        [Header("Request Signing")]
        [Tooltip("Prove this host with a private key instead of only a bearer token. Off by default: turning it on commits the host to keeping a private key, and a host that does not need it should not pay for it.")]
        [SerializeField] private bool signingEnabled = false;

        /// <summary>The host's signing key, when signing is on.</summary>
        public FearRequestSigner Signer { get; private set; }

        /// <summary>Whether the server has CONFIRMED this host's key. Until it has,
        /// every claim carries the public key (which is what registers it); after
        /// that there is no reason to send 450 bytes of PEM on every request.</summary>
        public bool SigningKeyRegistered { get; private set; }

        /// <summary>Turns on request signing. Called before the first claim so the
        /// key rides along with the registration that creates the session.</summary>
        public void EnableSigning()
        {
            if (Signer == null)
            {
                // A key restored from the store wins over a fresh one; see
                // <see cref="StoredSigningKeyText"/> for why the order is forced.
                Signer = string.IsNullOrEmpty(StoredSigningKeyText)
                    ? new FearRequestSigner().Generate()
                    : new FearRequestSigner().FromPrivateKeyText(StoredSigningKeyText);
            }
            signingEnabled = true;
        }

        /// <summary>Adopt an existing key (see
        /// <see cref="FearRequestSigner.ExportPrivateKeyText"/>), for a host that
        /// stores one and wants to keep proving itself across its own restarts.</summary>
        public void EnableSigning(string privateKeyText)
        {
            Signer = new FearRequestSigner().FromPrivateKeyText(privateKeyText);
            signingEnabled = true;
        }

        /// <summary>Signature headers for one control-plane request, or an empty
        /// set when signing is not in play.
        ///
        /// Signing starts only once the server has CONFIRMED the key. Signing the
        /// first claim would be refused as an unknown key - no session exists yet
        /// for it to belong to - and that first claim is the one carrying the
        /// public key, so refusing it would leave this host unable to ever
        /// establish one.</summary>
        private Dictionary<string, string> SignatureHeaders(string path, string body)
        {
            if (!signingEnabled || Signer == null || !SigningKeyRegistered || string.IsNullOrEmpty(sessionId))
            {
                return null;
            }
            return Signer.SignHeaders("POST", path, body, sessionId);
        }

        /// <summary>Read the server's key report off a control response, and treat
        /// a signature refusal as the signal it is.</summary>
        private void NoteSigningOutcome(int status, string body)
        {
            if (!signingEnabled || Signer == null) return;
            string outcome = ExtractKeyOutcome(body);
            if (!string.IsNullOrEmpty(outcome))
            {
                if (outcome.EndsWith("REGISTERED", StringComparison.Ordinal) || outcome.EndsWith("REPLACED", StringComparison.Ordinal))
                {
                    SigningKeyRegistered = true;
                }
                else if (outcome.StartsWith("SIGNING_KEY_REFUSED", StringComparison.Ordinal))
                {
                    Signer.NoteRefusal(outcome);
                }
            }
            if (status == 401 && !string.IsNullOrEmpty(body) && body.Contains("\"SIGNATURE"))
            {
                Signer.NoteRefusal("SIGNATURE_MISSING");
                SigningKeyRegistered = true;
            }
        }

        private static string ExtractKeyOutcome(string body)
        {
            if (string.IsNullOrEmpty(body)) return null;
            int at = body.IndexOf("\"signing_key\"", StringComparison.Ordinal);
            if (at < 0) return null;
            const string outcomeMarker = "\"outcome\":\"";
            int from = body.IndexOf(outcomeMarker, at, StringComparison.Ordinal);
            if (from < 0) return null;
            from += outcomeMarker.Length;
            int to = body.IndexOf('"', from);
            return to < 0 ? null : body.Substring(from, to - from);
        }

        /// <summary>True when this process READ an identity from the store. A
        /// restart that quietly regenerated its identity looks identical to one
        /// that loaded a stale file, and only this flag separates them.</summary>
        public bool SessionLoaded { get; private set; }

        /// <summary>True when this process WROTE the store.</summary>
        public bool SessionPersisted { get; private set; }

        /// <summary>Credentials the server replaced, and how many of those
        /// replacements were forced by expiry rather than requested.</summary>
        public int SessionTokenRotations { get; private set; }
        public int SessionTokenExpiries { get; private set; }

        /// <summary>Request-level claim outcome of the last registration batch,
        /// as reported by the server. GRANTED after a restart is the whole point of
        /// persistence; ADOPTED means the host came back as a stranger.</summary>
        public string LastClaimOutcome { get; private set; } = "";

        public string ClaimMode { get => claimMode; set => claimMode = value; }

        // Counters a host can log, so "nothing happened" is distinguishable from
        // "the legacy fallback was used" and from silence.
        public int BatchedRegistrationRequests { get; private set; }
        public int IndividualRegistrationRequests { get; private set; }
        public int RefusedClaims { get; private set; }
        public int RegistrationFailures { get; private set; }
        public int UnregistrationRejections { get; private set; }

        /// <summary>Ids the server refused to remove because a LIVE session owned
        /// them. Distinct from <see cref="UnregistrationRejections"/> (malformed
        /// entries): this host is not the owner, and it needs to know that rather
        /// than assume an agent it asked about is gone.</summary>
        public int UnregistrationRefusals { get; private set; }

        public int TraumaZonesRejected { get; private set; }

        /// <summary>True once a 404 proved this server predates the batch control
        /// routes, so the client uses singular requests for the rest of the
        /// session instead of retrying an endpoint that is not there.</summary>
        public bool BatchControlUnsupported { get; private set; }

        public event Action<string> OnAgentRegistered;
        public event Action<string, string> OnAgentRegistrationRefused;

        private const int MaxBatchControlItems = 512;
        private readonly List<AgentRegistration> pendingRegistrations = new List<AgentRegistration>();
        private readonly List<string> pendingUnregistrations = new List<string>();
        private readonly List<TraumaZone> pendingTraumaZones = new List<TraumaZone>();
        private bool controlPlaneBusy;

        private ClientWebSocket webSocket;
        private CancellationTokenSource cts;
        private readonly List<AgentObservation> pendingObservations = new List<AgentObservation>();
        private readonly Dictionary<string, Action<AgentStateOutput>> agentCallbacks = new Dictionary<string, Action<AgentStateOutput>>();
        private SynchronizationContext mainThreadContext;

        public bool IsConnected => webSocket != null && webSocket.State == WebSocketState.Open;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);
            mainThreadContext = SynchronizationContext.Current;
            // Identity before anything connects: the handshake token depends on
            // whether this process already has a crowd, so the store is read
            // first and a loaded name is never overwritten.
            if (persistSession) LoadSession();
        }

        /// <summary>
        /// Load this host's identity from <see cref="SessionStore"/>.
        ///
        /// Returns true when an identity was read. A stored session is adopted as
        /// both the name and the credential, because a token without its name
        /// proves nothing: the name is what the token is checked against.
        /// </summary>
        public bool LoadSession()
        {
            string storedId;
            string storedToken;
            string storedKey;
            bool loaded;
            if (SessionStore is ISecretSessionStore secret)
            {
                // The key-restoring path. A store that can carry the signing key is
                // asked for it in the SAME read, so the credential and the key that
                // proves it can never come from two different runs of the file.
                loaded = secret.TryLoadWithSigningKey(out storedId, out storedToken, out storedKey);
                // A failure here is NOT swallowed, but it is not this property's job
                // to narrate it either: a store that implements the interface carries
                // its own reason (`FearEncryptedSessionStore.LastError`), and a store
                // that does not is a host's own implementation.
                StoredSigningKeyText = loaded ? storedKey : "";
            }
            else
            {
                loaded = SessionStore.TryLoad(out storedId, out storedToken);
            }
            if (!loaded) return false;
            if (!string.IsNullOrEmpty(storedId)) sessionId = storedId;
            SessionToken = storedToken;
            SessionLoaded = true;
            SessionStoreError = "";
            return true;
        }

        /// <summary>Write the current identity to the store. Returns true when it
        /// was written.</summary>
        ///
        /// The signing key rides along when there is one, so a restart can PROVE
        /// itself rather than merely name itself. A store with nowhere safe to put
        /// either half is not asked to: <see cref="SessionStore"/> decides, and the
        /// encrypted store refuses the write rather than downgrading to plaintext.
        /// </summary>
        public bool SaveSession()
        {
            var signingKeyText = Signer != null && Signer.HasKey ? Signer.ExportPrivateKeyText() : "";
            if (SessionStore is ISecretSessionStore secret)
            {
                var written = secret.SaveWithSigningKey(sessionId, SessionToken, signingKeyText);
                SessionStoreError = written ? "" : "store write refused or failed";
                SessionPersisted = written && !string.IsNullOrEmpty(SessionToken);
                return SessionPersisted;
            }
            SessionStore.Save(sessionId, SessionToken);
            SessionPersisted = !string.IsNullOrEmpty(SessionToken);
            return SessionPersisted;
        }

        /// <summary>Forget the stored identity. The component keeps whatever it
        /// holds in memory and the next process starts as a stranger, which is the
        /// honest counterpart to revoking the session on the server.</summary>
        public void ClearStoredSession()
        {
            SessionStore.Clear();
            SessionPersisted = false;
            SessionLoaded = false;
            StoredSigningKeyText = "";
        }

        private async void Start()
        {
            if (useWebSocket)
            {
                await ConnectWebSocketAsync();
            }
        }

        private void OnDestroy()
        {
            cts?.Cancel();
            webSocket?.Dispose();
        }

        public void RegisterAgentCallback(string agentId, Action<AgentStateOutput> onStateUpdate)
        {
            agentCallbacks[agentId] = onStateUpdate;
        }

        public void UnregisterAgentCallback(string agentId)
        {
            agentCallbacks.Remove(agentId);
        }

        public void QueueObservation(AgentObservation observation)
        {
            lock (pendingObservations)
            {
                pendingObservations.Add(observation);
            }
        }

        private async void FixedUpdate()
        {
            // Control commands are pumped BEFORE the data plane: a queued session
            // reset or registration has to land before the observations that
            // follow it, or the first frames of a session read as unanswered.
            PumpControlPlane();

            List<AgentObservation> batch;
            lock (pendingObservations)
            {
                if (pendingObservations.Count == 0) return;
                batch = new List<AgentObservation>(pendingObservations);
                pendingObservations.Clear();
            }

            if (useWebSocket && IsConnected)
            {
                await SendBatchWsAsync(batch, Time.fixedDeltaTime);
            }
            else
            {
                StartCoroutine(SendBatchHttp(batch, Time.fixedDeltaTime));
            }
        }

        private async Task ConnectWebSocketAsync()
        {
            cts = new CancellationTokenSource();
            webSocket = new ClientWebSocket();
            var uri = new Uri($"ws://{serverHost}:{serverPort}");

            try
            {
                await webSocket.ConnectAsync(uri, cts.Token);
                Debug.Log($"[FearAI] Connected to Fear AI Server at {uri}");

                // Send Handshake. Naming the session here binds this identity
                // immediately, so the server sees the host as live from the first
                // message rather than only once it registers an agent. Built as
                // text rather than through JsonUtility because JsonUtility does
                // not reliably serialize anonymous types.
                string handshake = "{\"type\":\"HANDSHAKE_REQUEST\""
                    + ",\"protocol_version\":\"1.0.0\""
                    + ",\"client_id\":\"unity_" + EscapeJson(SystemInfo.deviceUniqueIdentifier) + "\""
                    + ",\"session_id\":\"" + EscapeJson(sessionId) + "\""
                    + ",\"engine\":\"Unity\"";
                if (!string.IsNullOrEmpty(SessionToken))
                {
                    handshake += ",\"session_token\":\"" + EscapeJson(SessionToken) + "\"";
                }
                handshake += "}";
                await SendRawWsAsync(handshake);

                _ = ReceiveLoopAsync(webSocket, cts.Token);
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[FearAI] WebSocket connection failed: {ex.Message}. Falling back to HTTP.");
            }
        }

        private async Task SendBatchWsAsync(List<AgentObservation> batch, float dt, List<string> capabilities = null)
        {
            try
            {
                var caps = capabilities ?? hostCapabilities;
                string capJson = "";
                if (caps != null && caps.Count > 0)
                {
                    capJson = ",\"capabilities\":" + JsonHelper.ToJsonStringList(caps);
                }
                string json = "{\"type\":\"BATCH_TICK_REQUEST\",\"dt\":" + dt.ToString("F4", System.Globalization.CultureInfo.InvariantCulture) + ",\"observations\":" + JsonHelper.ToJson(batch) + capJson + "}";
                await SendRawWsAsync(json);
            }
            catch (Exception ex)
            {
                Debug.LogError($"[FearAI] Error sending batch tick: {ex.Message}");
            }
        }

        private async Task SendRawWsAsync(string message)
        {
            if (webSocket == null || webSocket.State != WebSocketState.Open) return;
            byte[] bytes = Encoding.UTF8.GetBytes(message);
            await webSocket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, cts.Token);
        }

        private async Task ReceiveLoopAsync(ClientWebSocket ws, CancellationToken token)
        {
            byte[] buffer = new byte[65536];
            while (!token.IsCancellationRequested && ws.State == WebSocketState.Open)
            {
                try
                {
                    var result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), token);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", token);
                        break;
                    }

                    string message = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    ProcessServerMessage(message);
                }
                catch (OperationCanceledException) { break; }
                catch (Exception ex)
                {
                    Debug.LogWarning($"[FearAI] WebSocket receive error: {ex.Message}");
                    break;
                }
            }
        }

        private void ProcessServerMessage(string json)
        {
            // A handshake or control response may carry a freshly-issued session
            // token. It is adopted before anything else is parsed, because it is
            // what proves this host's identity on every later claim.
            if (json.Contains("session_token")) AdoptSessionToken(json);

            try
            {
                var response = JsonUtility.FromJson<BatchTickResponse>(json);
                if (response != null && response.results != null)
                {
                    mainThreadContext?.Post(_ =>
                    {
                        foreach (var agentOutput in response.results)
                        {
                            if (agentCallbacks.TryGetValue(agentOutput.agent_id, out var callback))
                            {
                                callback?.Invoke(agentOutput);
                            }
                        }
                    }, null);
                }
            }
            catch { /* non-critical message parsing */ }
        }

        private IEnumerator SendBatchHttp(List<AgentObservation> batch, float dt, List<string> capabilities = null)
        {
            string url = $"http://{serverHost}:{serverPort}/api/v1/tick";
            var caps = capabilities ?? hostCapabilities;
            string capJson = "";
            if (caps != null && caps.Count > 0)
            {
                capJson = ",\"capabilities\":" + JsonHelper.ToJsonStringList(caps);
            }
            string json = "{\"type\":\"BATCH_TICK_REQUEST\",\"dt\":" + dt.ToString("F4", System.Globalization.CultureInfo.InvariantCulture) + ",\"observations\":" + JsonHelper.ToJson(batch) + capJson + "}";

            using (var request = new UnityWebRequest(url, "POST"))
            {
                byte[] bodyRaw = Encoding.UTF8.GetBytes(json);
                request.uploadHandler = new UploadHandlerRaw(bodyRaw);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");

                yield return request.SendWebRequest();

                if (request.result == UnityWebRequest.Result.Success)
                {
                    ProcessServerMessage(request.downloadHandler.text);
                }
            }
        }

        // ------------------------------------------------------------------
        // Control plane: registration, teardown, trauma authoring
        // ------------------------------------------------------------------

        /// <summary>Queue one agent for registration. The queue is drained by
        /// the control-plane pump, so a scene that registers forty agents at
        /// load needs one request, not forty.</summary>
        public void RegisterAgent(string agentId, PersonalityTraits traits = null, Vector3Hint initialPosition = default)
        {
            RegisterAgents(new List<AgentRegistration>
            {
                new AgentRegistration { agent_id = agentId, name = agentId, traits = traits, initial_position = initialPosition }
            });
        }

        public void RegisterAgents(IEnumerable<AgentRegistration> registrations)
        {
            if (registrations == null) return;
            foreach (var registration in registrations)
            {
                if (registration == null || string.IsNullOrEmpty(registration.agent_id)) continue;
                if (string.IsNullOrEmpty(registration.name)) registration.name = registration.agent_id;
                if (registration.traits == null) registration.traits = new PersonalityTraits();
                pendingRegistrations.Add(registration);
            }
        }

        /// <summary>Queue agents for teardown. The host no longer considers them
        /// registered the moment it asks.</summary>
        public void UnregisterAgents(IEnumerable<string> agentIds)
        {
            if (agentIds == null) return;
            foreach (var agentId in agentIds)
            {
                if (!string.IsNullOrEmpty(agentId) && !pendingUnregistrations.Contains(agentId))
                {
                    pendingUnregistrations.Add(agentId);
                }
            }
        }

        /// <summary>Queue trauma zones. The middleware owns the dread memory; the
        /// host owns where and how strong the shock was.</summary>
        public void AddTraumaZones(IEnumerable<TraumaZone> zones)
        {
            if (zones == null) return;
            foreach (var zone in zones)
            {
                if (zone != null) pendingTraumaZones.Add(zone);
            }
        }

        /// <summary>True when no control work is queued or in flight.</summary>
        public bool ControlPlaneIdle => !controlPlaneBusy
            && pendingRegistrations.Count == 0
            && pendingUnregistrations.Count == 0
            && pendingTraumaZones.Count == 0;

        private void PumpControlPlane()
        {
            // One request at a time: the control plane is deliberately serial, so
            // a response can never be attributed to the wrong request.
            if (controlPlaneBusy) return;
            if (pendingRegistrations.Count > 0) { StartCoroutine(SendRegistrationBatch()); return; }
            if (pendingUnregistrations.Count > 0) { StartCoroutine(SendUnregistrationBatch()); return; }
            if (pendingTraumaZones.Count > 0) { StartCoroutine(SendTraumaBatch()); }
        }

        private IEnumerator SendRegistrationBatch()
        {
            int take = Mathf.Min(pendingRegistrations.Count, MaxBatchControlItems);
            var batch = pendingRegistrations.GetRange(0, take);
            pendingRegistrations.RemoveRange(0, take);

            bool useBatch = !BatchControlUnsupported;
            string url = useBatch
                ? $"http://{serverHost}:{serverPort}/api/v1/register/batch"
                : $"http://{serverHost}:{serverPort}/api/v1/register";
            string json = useBatch ? RegistrationBatchJson(batch) : RegistrationJson(batch[0]);

            controlPlaneBusy = true;
            yield return PostControl(url, json);

            int status = lastControlStatus;
            string body = lastControlBody;
            controlPlaneBusy = false;

            if (status == 404 && useBatch)
            {
                // This server predates the batch route. Put the batch back and use
                // the singular route for the rest of the session.
                BatchControlUnsupported = true;
                pendingRegistrations.InsertRange(0, batch);
                yield break;
            }
            if (status != 200)
            {
                // Counted and reported, never assumed: an unregistered agent
                // reads to the host as "the middleware returned nothing".
                RegistrationFailures++;
                foreach (var entry in batch)
                {
                    OnAgentRegistrationRefused?.Invoke(entry.agent_id, $"http_{status}");
                }
                yield break;
            }

            if (useBatch) BatchedRegistrationRequests++;
            else IndividualRegistrationRequests++;

            var envelope = ParseControlEnvelope(body);
            AdoptSessionToken(body);
            // How the SERVER received this host, not how many entries happened to
            // succeed: GRANTED is a recognised host, ADOPTED one that arrived as a
            // stranger to its own crowd.
            if (envelope != null && !string.IsNullOrEmpty(envelope.claim)) LastClaimOutcome = envelope.claim;

            foreach (var entry in batch)
            {
                string refusal = RefusalReason(envelope, entry.agent_id);
                if (!string.IsNullOrEmpty(refusal))
                {
                    // A live session owns this agent. Retrying would fail
                    // identically, so it is reported once and NOT requeued.
                    RefusedClaims++;
                    OnAgentRegistrationRefused?.Invoke(entry.agent_id, refusal);
                }
                else if (ConfirmedRegistration(envelope, entry.agent_id, useBatch))
                {
                    OnAgentRegistered?.Invoke(entry.agent_id);
                }
                else
                {
                    // The server neither confirmed nor refused it, so it is
                    // reported as unconfirmed rather than assumed present: a host
                    // that believes an agent is registered while the middleware
                    // returned nothing has nothing to debug.
                    RegistrationFailures++;
                    OnAgentRegistrationRefused?.Invoke(entry.agent_id, "unconfirmed");
                }
            }
        }

        /// <summary>Whether the server explicitly acknowledged this agent.</summary>
        private static bool ConfirmedRegistration(ControlEnvelope envelope, string agentId, bool usedBatch)
        {
            if (envelope == null) return false;
            if (envelope.registered != null)
            {
                foreach (var id in envelope.registered)
                {
                    if (id == agentId) return true;
                }
            }
            // The singular route confirms with status REGISTERED and no list.
            return !usedBatch && envelope.status == "REGISTERED";
        }

        private IEnumerator SendUnregistrationBatch()
        {
            int take = Mathf.Min(pendingUnregistrations.Count, MaxBatchControlItems);
            var ids = pendingUnregistrations.GetRange(0, take);
            pendingUnregistrations.RemoveRange(0, take);

            bool useBatch = !BatchControlUnsupported;
            controlPlaneBusy = true;
            if (useBatch)
            {
                yield return PostControl(
                    $"http://{serverHost}:{serverPort}/api/v1/unregister/batch",
                    UnregistrationBatchJson(ids));
            }
            else
            {
                for (int i = 0; i < ids.Count; i++)
                {
                    yield return PostControl(
                        $"http://{serverHost}:{serverPort}/api/v1/unregister",
                        UnregistrationJson(ids[i]));
                    if (lastControlStatus != 200)
                    {
                        // Put the remainder (including this id) back: nothing is
                        // assumed to have been removed.
                        pendingUnregistrations.InsertRange(0, ids.GetRange(i, ids.Count - i));
                        controlPlaneBusy = false;
                        yield break;
                    }
                }
            }
            int status = lastControlStatus;
            string body = lastControlBody;
            controlPlaneBusy = false;

            if (status == 404 && useBatch)
            {
                BatchControlUnsupported = true;
                pendingUnregistrations.InsertRange(0, ids);
                yield break;
            }
            if (status != 200)
            {
                // Both `unregistered` and `not_found` are terminal, so a failed
                // request is the only case that puts ids back.
                pendingUnregistrations.InsertRange(0, ids);
                yield break;
            }

            // A `rejected` id was NOT removed and is not requeued either: it is
            // reported once rather than disappearing, because a host that
            // believes an agent is gone while the middleware still holds it
            // cannot debug what happens next.
            var envelope = ParseControlEnvelope(body);
            if (envelope != null && envelope.rejected != null)
            {
                UnregistrationRejections += envelope.rejected.Count;
                foreach (var rejection in envelope.rejected)
                {
                    OnAgentRegistrationRefused?.Invoke(rejection.agent_id, "unregister_rejected");
                }
            }
            // REFUSED is a different outcome from rejected: the entry was
            // well-formed but a LIVE session owns the agent, so this host may not
            // remove it. Counted and reported per id for the same reason as
            // rejected - an id the host believes it retired while the server
            // still simulates it has nothing to debug.
            if (envelope != null && envelope.refused != null)
            {
                UnregistrationRefusals += envelope.refused.Count;
                foreach (var refusal in envelope.refused)
                {
                    OnAgentRegistrationRefused?.Invoke(refusal.agent_id, "unregister_refused_not_owner");
                }
            }
        }

        private IEnumerator SendTraumaBatch()
        {
            int take = Mathf.Min(pendingTraumaZones.Count, MaxBatchControlItems);
            var zones = pendingTraumaZones.GetRange(0, take);
            pendingTraumaZones.RemoveRange(0, take);

            bool useBatch = !BatchControlUnsupported;
            controlPlaneBusy = true;
            if (useBatch)
            {
                yield return PostControl(
                    $"http://{serverHost}:{serverPort}/api/v1/trauma/batch",
                    TraumaBatchJson(zones));
            }
            else
            {
                for (int i = 0; i < zones.Count; i++)
                {
                    yield return PostControl($"http://{serverHost}:{serverPort}/api/v1/trauma", JsonUtility.ToJson(zones[i]));
                    if (lastControlStatus != 200)
                    {
                        pendingTraumaZones.InsertRange(0, zones.GetRange(i, zones.Count - i));
                        controlPlaneBusy = false;
                        yield break;
                    }
                }
            }
            int status = lastControlStatus;
            string body = lastControlBody;
            controlPlaneBusy = false;

            if (status == 404 && useBatch)
            {
                BatchControlUnsupported = true;
                pendingTraumaZones.InsertRange(0, zones);
                yield break;
            }
            if (status != 200)
            {
                pendingTraumaZones.InsertRange(0, zones);
                yield break;
            }

            // Zones are world state, so partial application is normal: rejected
            // entries are counted, never retried, because a malformed zone would
            // be malformed again.
            var envelope = ParseControlEnvelope(body);
            if (envelope != null && envelope.rejected != null)
            {
                TraumaZonesRejected += envelope.rejected.Count;
            }
        }

        private int lastControlStatus;
        private string lastControlBody;

        private IEnumerator PostControl(string url, string json)
        {
            using (var request = new UnityWebRequest(url, "POST"))
            {
                byte[] bodyRaw = Encoding.UTF8.GetBytes(json);
                request.uploadHandler = new UploadHandlerRaw(bodyRaw);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");

                // The signature covers the EXACT text being uploaded, which is why
                // the JSON is built once and passed in rather than re-serialized.
                var headers = SignatureHeaders(TargetPath(url), json);
                if (headers != null)
                {
                    foreach (var header in headers)
                    {
                        request.SetRequestHeader(header.Key, header.Value);
                    }
                }

                yield return request.SendWebRequest();

                // The HTTP status is kept for BOTH outcomes: a 404 means "this
                // server predates this route" and a 409 means "refused", and
                // both are decisions the caller has to make rather than errors.
                // A request that never reached the server reports 0.
                lastControlStatus = (int)request.responseCode;
                lastControlBody = request.downloadHandler != null ? request.downloadHandler.text : null;
            }
            // After the request settles, not before: this is where a key
            // registration is confirmed, and where a refusal is recognised.
            NoteSigningOutcome(lastControlStatus, lastControlBody);
        }

        /// <summary>The request target as the server sees it: path only, no scheme
        /// or host, because that is what the canonical signing input covers.</summary>
        private static string TargetPath(string url)
        {
            if (string.IsNullOrEmpty(url)) return "/";
            int scheme = url.IndexOf("://", StringComparison.Ordinal);
            if (scheme < 0) return url;
            int slash = url.IndexOf('/', scheme + 3);
            return slash < 0 ? "/" : url.Substring(slash);
        }

        private string RegistrationBatchJson(List<AgentRegistration> batch)
        {
            var sb = new StringBuilder("{\"agents\":[");
            for (int i = 0; i < batch.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append(JsonUtility.ToJson(batch[i]));
            }
            sb.Append(']');
            AppendClaimFields(sb);
            sb.Append('}');
            return sb.ToString();
        }

        private string RegistrationJson(AgentRegistration registration)
        {
            var sb = new StringBuilder("{\"type\":\"REGISTER_AGENT\"");
            sb.Append(",\"agent_id\":\"").Append(EscapeJson(registration.agent_id)).Append('"');
            sb.Append(",\"name\":\"").Append(EscapeJson(registration.name)).Append('"');
            sb.Append(",\"traits\":").Append(JsonUtility.ToJson(registration.traits));
            sb.Append(",\"initial_position\":").Append(JsonUtility.ToJson(registration.initial_position));
            AppendClaimFields(sb);
            sb.Append('}');
            return sb.ToString();
        }

        private string UnregistrationBatchJson(List<string> ids)
        {
            var sb = new StringBuilder("{\"agent_ids\":[");
            for (int i = 0; i < ids.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append('"').Append(EscapeJson(ids[i])).Append('"');
            }
            sb.Append(']');
            sb.Append(",\"session_id\":\"").Append(EscapeJson(sessionId)).Append('"');
            // The CREDENTIAL travels with the teardown too. Teardown is
            // ownership-gated on the server, so a request carrying only the
            // session NAME is refused as a stranger's - the host would be locked
            // out of retiring its own crowd.
            if (!string.IsNullOrEmpty(SessionToken))
            {
                sb.Append(",\"session_token\":\"").Append(EscapeJson(SessionToken)).Append('"');
            }
            sb.Append('}');
            return sb.ToString();
        }

        private string UnregistrationJson(string agentId)
        {
            var sb = new StringBuilder("{\"type\":\"UNREGISTER_AGENT\"");
            sb.Append(",\"agent_id\":\"").Append(EscapeJson(agentId)).Append('"');
            sb.Append(",\"session_id\":\"").Append(EscapeJson(sessionId)).Append('"');
            if (!string.IsNullOrEmpty(SessionToken))
            {
                sb.Append(",\"session_token\":\"").Append(EscapeJson(SessionToken)).Append('"');
            }
            sb.Append('}');
            return sb.ToString();
        }

        private string TraumaBatchJson(List<TraumaZone> zones)
        {
            var sb = new StringBuilder("{\"zones\":[");
            for (int i = 0; i < zones.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append(JsonUtility.ToJson(zones[i]));
            }
            sb.Append("]}");
            return sb.ToString();
        }

        /// <summary>The claim travels with every registration so the server can
        /// attribute ownership; without it the host cannot be recognised on
        /// reconnect, which is the whole point of the session.</summary>
        private void AppendClaimFields(StringBuilder sb)
        {
            sb.Append(",\"session_id\":\"").Append(EscapeJson(sessionId)).Append('"');
            sb.Append(",\"claim\":\"").Append(EscapeJson(claimMode)).Append('"');
            if (!string.IsNullOrEmpty(SessionToken))
            {
                sb.Append(",\"session_token\":\"").Append(EscapeJson(SessionToken)).Append('"');
            }
            // Offered with the claim, because a claim is the moment the server has
            // a session for the key to belong to. Sent only until it is confirmed.
            if (signingEnabled && !SigningKeyRegistered && Signer != null && !string.IsNullOrEmpty(Signer.PublicKeyPem))
            {
                sb.Append(",\"signing_public_key\":\"").Append(EscapeJson(Signer.PublicKeyPem)).Append('"');
            }
        }

        private ControlEnvelope ParseControlEnvelope(string body)
        {
            if (string.IsNullOrEmpty(body)) return null;
            try
            {
                return JsonUtility.FromJson<ControlEnvelope>(body);
            }
            catch
            {
                return null;
            }
        }

        private static string RefusalReason(ControlEnvelope envelope, string agentId)
        {
            if (envelope == null || envelope.refused == null) return "";
            foreach (var refusal in envelope.refused)
            {
                if (refusal != null && refusal.agent_id == agentId)
                {
                    return string.IsNullOrEmpty(refusal.reason) ? "REFUSED" : refusal.reason;
                }
            }
            return "";
        }

        /// <summary>Adopt a server-issued session token, if the body carries one.
        /// It is returned exactly once, when the session is established, so
        /// storing it is what lets this host prove continuity later.</summary>
        private void AdoptSessionToken(string body)
        {
            if (string.IsNullOrEmpty(body)) return;
            bool mentionsCredentialField = body.Contains("session_token")
                || body.Contains("token_rotated") || body.Contains("token_expired");
            if (!mentionsCredentialField) return;
            try
            {
                var envelope = JsonUtility.FromJson<ControlEnvelope>(body);
                if (envelope == null) return;
                // Rotation and expiry are counted even when no token rides in this
                // response, because a credential replaced for a reason the host did
                // not ask for is exactly what it must not discover by failing later.
                if (envelope.token_expired) SessionTokenExpiries++;
                if (envelope.token_rotated) SessionTokenRotations++;
                if (string.IsNullOrEmpty(envelope.session_token)) return;
                bool changed = envelope.session_token != SessionToken;
                SessionToken = envelope.session_token;
                // Saved the moment it exists, not at shutdown: waiting would mean a
                // crash loses precisely the thing that makes a restart continuous.
                if (persistSession && changed) SaveSession();
            }
            catch
            {
                // An unparsable control response is not a credential; ignore it.
            }
        }

        /// <summary>
        /// Escape a string for embedding in hand-built JSON.
        ///
        /// This used to escape only backslashes and quotes, which was enough while
        /// every field was a session id or an agent name and quietly wrong the
        /// moment a field could contain a newline: a PEM public key has one on
        /// every line, and a raw LF inside a JSON string is invalid. The server
        /// answered 400 and the registration failed, which is how this was found -
        /// by EXECUTING the adapter against a live server, not by reading it.
        /// Control characters are escaped properly now, including the general
        /// \u form, so this cannot be reintroduced by the next multi-line field.
        /// </summary>
        /// <summary>
        /// The one escaper in this adapter, shared with <see cref="JsonHelper"/>.
        ///
        /// It lives there rather than here because `JsonHelper.ToJsonStringList`
        /// is public and had its OWN copy of the old two-case escape - quotes only.
        /// That is the same defect this method was just fixed for, one call site
        /// over: a list entry containing a newline produced invalid JSON, and a
        /// private method in another class could not be reused. Two implementations
        /// of an escaper is how a fix like that comes back.
        /// </summary>
        private static string EscapeJson(string value) => JsonHelper.Escape(value);

        public void ReportOutcome(string agentId, string intentType, string outcome, string reason = null, int tick = 0, Action<OutcomeReceipt> onReceipt = null)
        {
            StartCoroutine(SendOutcomeHttp(agentId, intentType, outcome, reason, tick, onReceipt));
        }

        private IEnumerator SendOutcomeHttp(string agentId, string intentType, string outcome, string reason, int tick, Action<OutcomeReceipt> onReceipt)
        {
            string url = $"http://{serverHost}:{serverPort}/api/v1/outcome";
            string reasonField = string.IsNullOrEmpty(reason) ? "" : $",\"reason\":\"{reason.Replace("\"", "\\\"")}\"";
            string json = $"{{\"agent_id\":\"{agentId}\",\"intent_type\":\"{intentType}\",\"outcome\":\"{outcome}\",\"tick\":{tick}{reasonField}}}";

            using (var request = new UnityWebRequest(url, "POST"))
            {
                byte[] bodyRaw = Encoding.UTF8.GetBytes(json);
                request.uploadHandler = new UploadHandlerRaw(bodyRaw);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");

                yield return request.SendWebRequest();

                if (request.result == UnityWebRequest.Result.Success)
                {
                    try
                    {
                        var receipt = JsonUtility.FromJson<OutcomeReceipt>(request.downloadHandler.text);
                        onReceipt?.Invoke(receipt);
                    }
                    catch { /* non-critical outcome parsing */ }
                }
            }
        }
    }

    public static class JsonHelper
    {
        /// <summary>
        /// Escape a string for embedding in hand-built JSON: quotes, backslash,
        /// the named control escapes, and a general <c>\u</c> form for anything
        /// below U+0020. A raw LF inside a JSON string is invalid and the server
        /// answers 400, which is how the original two-case version was found - by
        /// executing the adapter, not by reading it.
        /// </summary>
        public static string Escape(string value)
        {
            if (string.IsNullOrEmpty(value)) return "";
            var builder = new StringBuilder(value.Length + 8);
            foreach (char c in value)
            {
                switch (c)
                {
                    case '\\': builder.Append("\\\\"); break;
                    case '"': builder.Append("\\\""); break;
                    case '\n': builder.Append("\\n"); break;
                    case '\r': builder.Append("\\r"); break;
                    case '\t': builder.Append("\\t"); break;
                    case '\b': builder.Append("\\b"); break;
                    case '\f': builder.Append("\\f"); break;
                    default:
                        if (c < ' ')
                        {
                            builder.Append("\\u").Append(((int)c).ToString("x4"));
                        }
                        else
                        {
                            builder.Append(c);
                        }
                        break;
                }
            }
            return builder.ToString();
        }

        public static string ToJson<T>(List<T> list)
        {
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < list.Count; i++)
            {
                sb.Append(JsonUtility.ToJson(list[i]));
                if (i < list.Count - 1) sb.Append(",");
            }
            sb.Append("]");
            return sb.ToString();
        }

        public static string ToJsonStringList(List<string> list)
        {
            if (list == null) return "[]";
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < list.Count; i++)
            {
                // Escaped through the shared implementation: this used to inline a
                // quotes-only replacement, which is the two-case bug again.
                sb.Append("\"").Append(Escape(list[i])).Append("\"");
                if (i < list.Count - 1) sb.Append(",");
            }
            sb.Append("]");
            return sb.ToString();
        }
    }
}
