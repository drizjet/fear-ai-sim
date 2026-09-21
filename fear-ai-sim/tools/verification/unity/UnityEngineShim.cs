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
//   5. MonoBehaviour LIFECYCLE is modelled, not proven. `UnityLifecycle` runs the
//      methods in Unity's ORDER (Awake, OnEnable, Start once, Update; OnDisable,
//      OnDestroy on destruction) and finds them BY NAME including private ones,
//      which is how Unity finds them. What is NOT modelled is WHEN Unity calls any
//      of them relative to `AddComponent`, a scene load or a frame boundary; script
//      execution order; `Reset`/`OnValidate`/`OnApplicationPause`/`LateUpdate`;
//      domain reload; and any player-loop timing. So a lifecycle body that could
//      never work is now caught here, and "does Unity call this when I think it
//      does" is still an Editor question.
//
// So this narrows the Unity gap to editor behaviour and API fidelity, and it
// closes the part of the gap that was about the adapter's own correctness. The
// ledger entry reflects exactly that split.

using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Reflection;
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
        /// Unity's synchronous destroy, and now the DESTRUCTION half of the lifecycle:
        /// `OnDisable` then `OnDestroy`, in that order, on the object itself and - for a
        /// `GameObject` - on every component attached to it.
        ///
        /// It used to be an empty body, which meant `OnDestroy` and `OnDisable` on every
        /// adapter component had never been executed by anything in this repository: a
        /// teardown body that cannot work and one that works perfectly looked exactly
        /// alike. That is the defect class this shim exists to stop producing.
        /// </summary>
        public static void DestroyImmediate(Object o)
        {
            if (o == null) return;
            if (o is GameObject gameObject)
            {
                // A copy, because End() detaches and the list would be mutated while
                // walked. Copied by hand rather than with Linq: this file is compiled
                // into the adapter's own scratch projects, which pull in no packages.
                foreach (var attached in new List<Component>(gameObject.Attached))
                {
                    gameObject.Detach(attached);
                    UnityLifecycle.End(attached);
                }
                return;
            }
            if (o is Component component) component.gameObject?.Detach(component);
            UnityLifecycle.End(o);
        }
    }

    public class GameObject : Object
    {
        private readonly List<Component> _components = new List<Component>();

        /// <summary>
        /// Which components are attached. Tracked so `DestroyImmediate` on a GameObject
        /// can run the destruction half of each component's lifecycle, the way Unity
        /// does; nothing else reads it.
        /// </summary>
        internal IReadOnlyList<Component> Attached => _components;
        internal void Detach(Component component) => _components.Remove(component);

        public GameObject() { }
        public GameObject(string name) { this.name = name; }
        public GameObject(string name, params Type[] components) { this.name = name; }

        /// <summary>
        /// Constructs and attaches a component, exactly as Unity's constraint reads
        /// (`where T : Component`, no `new()`, so a component type without a public
        /// parameterless constructor is rejected here as it would be there).
        ///
        /// It deliberately does NOT run `Awake`. Unity does, for a component added to an
        /// active GameObject from code - and for that case there are no serialized values
        /// to apply first. The harness needs the OTHER case, which is the one every host
        /// actually ships: a component that arrives WITH its values, as a scene or prefab
        /// component does. So construction and waking are separate phases here, the
        /// harness says which order it means, and `UnityLifecycle` below states the
        /// difference rather than hiding it.
        /// </summary>
        public T AddComponent<T>() where T : Component
        {
            var component = Activator.CreateInstance<T>();
            component.gameObject = this;
            _components.Add(component);
            return component;
        }
    }

    /// <summary>
    /// The MonoBehaviour lifecycle, executed in Unity's order.
    ///
    /// This exists because "Unity calls Awake and Start" was the one sentence keeping
    /// every lifecycle body out of every probe: before it, the harness invoked `Awake`
    /// by reflection for itself and nothing ever invoked `Start`, `OnEnable`, `Update`,
    /// `OnDisable` or `OnDestroy` at all - so five of the six lifecycle bodies on
    /// `FearAIClient` were shipped unexecuted.
    ///
    /// THE ORDER IS THE POINT, and it is what the harness asserts on an instrumented
    /// component: `Awake` then `OnEnable`; `Start` ONCE per component on the first frame,
    /// then `Update` on every frame; `OnDisable` then `OnDestroy` on destruction. Methods
    /// are found BY NAME through reflection, including private ones, because that is how
    /// Unity finds them - `MonoBehaviour` declares none of the six.
    ///
    /// WHAT IS NOT MODELLED, and is therefore still an Editor question: WHEN Unity calls
    /// any of these relative to `AddComponent`, a scene load or a frame boundary; script
    /// execution order between components; `Reset`, `OnValidate`, `OnApplicationPause`,
    /// `OnApplicationFocus`, `LateUpdate`; domain reload; and any player-loop timing.
    ///
    /// `FixedUpdate` is deliberately NOT invoked. Unity runs it between zero and several
    /// times per frame before `Update`, and on this adapter it is the async control-plane
    /// tick that then awaits HTTP. Invoking it from a synchronous frame pump would start
    /// real requests beside the ones the harness deliberately pumps by hand, which makes
    /// the run racy rather than more faithful; so the tick path stays pumped explicitly
    /// by the harness and this class says so.
    ///
    /// An `async void` lifecycle body is invoked and NOT awaited. Unity does not await it
    /// either, but Unity also keeps ticking frames afterwards, and there is no frame loop
    /// here - so what a call proves is that the body's synchronous prologue ran without
    /// throwing, not that the continuations it started ever completed.
    /// </summary>
    public static class UnityLifecycle
    {
        private static readonly HashSet<Component> Started = new HashSet<Component>();

        /// <summary>`Awake`, then `OnEnable` - Unity's order for a component being woken.</summary>
        public static void Wake(Component component)
        {
            Invoke(component, "Awake");
            Invoke(component, "OnEnable");
        }

        /// <summary>
        /// One frame: `Start` on every component that has not started yet, then `Update`.
        /// `Start` running exactly once is the property a second call is asserted not to
        /// repeat, and it is tracked by component identity rather than by a flag the
        /// component would have to know about.
        /// </summary>
        public static void Frame(params Component[] components)
        {
            foreach (var component in components)
            {
                if (Started.Add(component)) Invoke(component, "Start");
            }
            foreach (var component in components) Invoke(component, "Update");
        }

        /// <summary>`OnDisable`, then `OnDestroy` - the destruction half, in Unity's order.</summary>
        internal static void End(Object target)
        {
            if (target == null) return;
            Invoke(target, "OnDisable");
            Invoke(target, "OnDestroy");
            if (target is Component component) Started.Remove(component);
        }

        /// <summary>
        /// Invokes every `methodName` found on the target's type - including private ones,
        /// and including ones inherited from a base component, which is Unity's rule - and
        /// does nothing when there is none, because most components implement only one or
        /// two of the six. An overload that takes parameters is ignored rather than
        /// guessed at: Unity's six lifecycle entry points take none.
        /// </summary>
        private static void Invoke(object target, string methodName)
        {
            foreach (var method in target.GetType().GetMethods(
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic))
            {
                if (method.Name != methodName || method.GetParameters().Length != 0) continue;
                if (method.IsAbstract) continue;
                method.Invoke(target, null);
            }
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
