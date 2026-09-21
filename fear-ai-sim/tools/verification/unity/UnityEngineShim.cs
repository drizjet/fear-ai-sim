// tools/verification/unity/UnityEngineShim.cs
//
// A UnityEngine shim with TEETH: it does not merely let the Unity adapter
// compile, it lets the adapter RUN.
//
// WHY THE SHIM MOVED FROM STUBS TO IMPLEMENTATIONS
// The previous Unity check compiled the adapter against empty method bodies. That
// caught typos, but it could not tell anyone whether the adapter's own logic -
// request building, batched control-plane draining, refusal accounting, session
// identity, credential persistence - actually did what it claims, because a stub
// that returns nothing makes every path look equally fine. This file backs the
// same surface with real behaviour: `UnityWebRequest` performs a real HTTP request
// over HttpClient, `JsonUtility` is a real field-based serializer, `File`/PlayerPrefs
// storage is real storage, and `StartCoroutine` runs the coroutine.
//
// THE DIVERGENCES, STATED PLAINLY - THESE ARE LIMITS, NOT DETAILS
//   1. `StartCoroutine` runs the enumerator to COMPLETION SYNCHRONOUSLY. Unity
//      resumes it on a later frame. So this exercises the adapter's logic and its
//      sequencing within one pump, and says nothing about frame scheduling.
//   2. `SendWebRequest` blocks on the HTTP call and returns an already-completed
//      operation, for the same reason: there is no engine loop to yield to.
//   3. `JsonUtility` is implemented with System.Text.Json over public FIELDS,
//      which matches Unity's own rule (public fields on [Serializable] types,
//      properties ignored). A field only Unity would serialize differently - a
//      [SerializeField] private field - would be missed here.
//   4. `PlayerPrefs` is an in-process dictionary; Unity's is a registry/plist.
//   5. Nothing about MonoBehaviour LIFECYCLE is proven: the harness invokes
//      `Awake` itself rather than letting the engine call it, so "does Unity call
//      this when I think it does" is still an Editor question.
//
// So this narrows the Unity gap to editor behaviour and API fidelity, and it
// closes the part of the gap that was about the adapter's own correctness. The
// ledger entry reflects exactly that split.

using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace UnityEngine
{
    // ---------------------------------------------------------------------
    // Serialization: Unity's rule is public fields on [Serializable] types.
    // ---------------------------------------------------------------------
    public static class JsonUtility
    {
        private static readonly JsonSerializerOptions Options = new JsonSerializerOptions
        {
            IncludeFields = true,
            // Unity omits fields it considers default; emitting them is closer to
            // Unity's output for a populated object and harmless to the server.
            DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.Never
        };

        public static string ToJson(object obj) => obj == null ? "{}" : JsonSerializer.Serialize(obj, obj.GetType(), Options);

        public static T FromJson<T>(string json) => JsonSerializer.Deserialize<T>(json, Options);

        public static object FromJson(string json, Type type) => JsonSerializer.Deserialize(json, type, Options);
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------
    public static class Application
    {
        private static string _persistentDataPath;
        private static string _temporaryCachePath;
        public static string persistentDataPath => _persistentDataPath ??= Path.Combine(Path.GetTempPath(), "fear_ai_unity_shim");
        // Added for the EditMode credential-store tests, which write to a
        // temporary path rather than the persistent one so a run cannot leave a
        // real credential behind on the machine.
        public static string temporaryCachePath => _temporaryCachePath ??= Path.Combine(Path.GetTempPath(), "fear_ai_unity_shim_cache");
    }

    public static class PlayerPrefs
    {
        private static readonly Dictionary<string, string> Store = new Dictionary<string, string>();
        public static bool HasKey(string key) => Store.ContainsKey(key);
        public static string GetString(string key, string defaultValue = "") => Store.TryGetValue(key, out var v) ? v : defaultValue;
        public static void SetString(string key, string value) => Store[key] = value;
        public static void DeleteKey(string key) => Store.Remove(key);
        public static void Save() { }
    }

    // ---------------------------------------------------------------------
    // Runtime primitives
    // ---------------------------------------------------------------------
    public class Object
    {
        public string name { get; set; } = "";
        public static void Destroy(Object o) { }
        public static void DontDestroyOnLoad(Object o) { }
        /// <summary>
        /// Unity's synchronous destroy. Added because the EditMode-style tests
        /// that now compile against this shim tear a component down between
        /// cases, and `Destroy` would be deferred where `DestroyImmediate` is not.
        /// </summary>
        public static void DestroyImmediate(Object o) { }
    }

    public class GameObject : Object
    {
        public GameObject() { }
        public GameObject(string name) { this.name = name; }
        public GameObject(string name, params Type[] components) { this.name = name; }

        /// <summary>
        /// Faithful to Unity's constraint (`where T : Component`, no `new()`), so a
        /// component type without a public parameterless constructor is not
        /// accepted here and rejected there.
        /// </summary>
        public T AddComponent<T>() where T : Component
        {
            var component = Activator.CreateInstance<T>();
            component.gameObject = this;
            return component;
        }
    }

    public class Component : Object
    {
        public GameObject gameObject { get; internal set; } = new GameObject();
    }

    public class Coroutine { }

    /// <summary>
    /// Runs a coroutine to completion. Nested IEnumerators and yielded
    /// UnityWebRequestAsyncOperations are handled; the latter are already complete
    /// when yielded, which is divergence 2 in the file header.
    /// </summary>
    public static class UnityCoroutineRunner
    {
        public static int Executions;

        public static void Run(IEnumerator routine)
        {
            Executions++;
            var stack = new Stack<IEnumerator>();
            stack.Push(routine);
            int guard = 0;
            while (stack.Count > 0)
            {
                if (++guard > 100_000) throw new InvalidOperationException("coroutine did not terminate");
                var current = stack.Peek();
                if (!current.MoveNext())
                {
                    stack.Pop();
                    continue;
                }
                var yielded = current.Current;
                if (yielded is IEnumerator nested) stack.Push(nested);
                else if (yielded is Task task) task.GetAwaiter().GetResult();
                // Anything else (yield return null, a frame-wait object) is treated
                // as "continue now": there is no frame to wait for here.
            }
        }
    }

    public class MonoBehaviour : Component
    {
        public Coroutine StartCoroutine(IEnumerator routine)
        {
            UnityCoroutineRunner.Run(routine);
            return new Coroutine();
        }

        public void StopAllCoroutines() { }
    }

    public class YieldInstruction { }
    public class AsyncOperation : YieldInstruction { }

    public static class Time
    {
        public static float fixedDeltaTime => 1f / 60f;
        public static float deltaTime => 1f / 60f;
    }

    public static class Mathf
    {
        public static int Min(int a, int b) => Math.Min(a, b);
        public static int Max(int a, int b) => Math.Max(a, b);
        public static float Min(float a, float b) => Math.Min(a, b);
        public static float Max(float a, float b) => Math.Max(a, b);
    }

    public static class SystemInfo
    {
        public static string deviceUniqueIdentifier => "shim-device";
    }

    public static class Debug
    {
        public static void Log(object message) => Console.WriteLine($"    [unity.log] {message}");
        public static void LogWarning(object message) => Console.WriteLine($"    [unity.warn] {message}");
        public static void LogError(object message) => Console.WriteLine($"    [unity.error] {message}");
    }

    public struct Vector3
    {
        public float x, y, z;
        public Vector3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; }
    }

    [AttributeUsage(AttributeTargets.Field)] public class SerializeField : Attribute { }
    [AttributeUsage(AttributeTargets.Field)] public class HeaderAttribute : Attribute { public HeaderAttribute(string header) { } }
    [AttributeUsage(AttributeTargets.Field)] public class TooltipAttribute : Attribute { public TooltipAttribute(string tooltip) { } }
    [AttributeUsage(AttributeTargets.Field)] public class RangeAttribute : Attribute { public RangeAttribute(float min, float max) { } }
}

namespace UnityEngine.Networking
{
    /// <summary>
    /// A real HTTP request. `result` follows Unity's rule: `Success` only for a
    /// 2xx response, `ProtocolError` for an HTTP status, `ConnectionError` when
    /// nothing answered. The adapter depends on that distinction in
    /// `SendBatchHttp` (Success) and on `responseCode` in `PostControl`.
    /// </summary>
    public class UnityWebRequest : IDisposable
    {
        private static readonly HttpClient Client = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };

        public enum Result { InProgress, Success, ConnectionError, ProtocolError, DataProcessingError }

        private readonly List<KeyValuePair<string, string>> _headers = new List<KeyValuePair<string, string>>();

        public string url { get; }
        public string method { get; }
        public Result result { get; private set; } = Result.InProgress;
        public long responseCode { get; private set; }
        public string error { get; private set; }
        public DownloadHandler downloadHandler { get; set; }
        public UploadHandler uploadHandler { get; set; }

        public UnityWebRequest(string url, string method)
        {
            this.url = url;
            this.method = method;
        }

        public void SetRequestHeader(string name, string value) => _headers.Add(new KeyValuePair<string, string>(name, value));

        public UnityWebRequestAsyncOperation SendWebRequest()
        {
            try
            {
                using var request = new HttpRequestMessage(new HttpMethod(method), url);
                if (uploadHandler?.data != null) request.Content = new ByteArrayContent(uploadHandler.data);
                foreach (var header in _headers)
                {
                    if (request.Content != null && header.Key.Equals("Content-Type", StringComparison.OrdinalIgnoreCase))
                    {
                        request.Content.Headers.TryAddWithoutValidation(header.Key, header.Value);
                    }
                    else
                    {
                        request.Headers.TryAddWithoutValidation(header.Key, header.Value);
                    }
                }

                using var response = Client.Send(request);
                responseCode = (long)response.StatusCode;
                var bytes = response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult();
                if (downloadHandler != null) downloadHandler.Populate(bytes);
                if (response.IsSuccessStatusCode)
                {
                    result = Result.Success;
                    error = null;
                }
                else
                {
                    result = Result.ProtocolError;
                    error = $"HTTP/{responseCode}";
                }
            }
            catch (Exception ex)
            {
                result = Result.ConnectionError;
                responseCode = 0;
                error = ex.Message;
            }
            return new UnityWebRequestAsyncOperation();
        }

        public void Dispose() { }
    }

    public class UnityWebRequestAsyncOperation : AsyncOperation { }

    public abstract class DownloadHandler
    {
        public abstract string text { get; }
        internal abstract void Populate(byte[] bytes);
    }

    public class DownloadHandlerBuffer : DownloadHandler
    {
        private string _text = "";
        public override string text => _text;
        public byte[] data { get; private set; } = Array.Empty<byte>();
        internal override void Populate(byte[] bytes)
        {
            data = bytes;
            _text = Encoding.UTF8.GetString(bytes);
        }
    }

    public abstract class UploadHandler
    {
        internal abstract byte[] data { get; }
    }

    public class UploadHandlerRaw : UploadHandler
    {
        private readonly byte[] _bytes;
        public UploadHandlerRaw(byte[] bytes) { _bytes = bytes; }
        internal override byte[] data => _bytes;
    }
}
