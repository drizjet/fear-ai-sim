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

                // Send Handshake
                string handshake = JsonUtility.ToJson(new
                {
                    type = "HANDSHAKE_REQUEST",
                    protocol_version = "1.0.0",
                    client_id = $"unity_{SystemInfo.deviceUniqueIdentifier}",
                    engine = "Unity"
                });
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
                sb.Append("\"").Append(list[i].Replace("\"", "\\\"")).Append("\"");
                if (i < list.Count - 1) sb.Append(",");
            }
            sb.Append("]");
            return sb.ToString();
        }
    }
}
