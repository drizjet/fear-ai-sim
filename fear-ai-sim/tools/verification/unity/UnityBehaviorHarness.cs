// tools/verification/unity/UnityBehaviorHarness.cs
//
// Runs the REAL Unity adapter's control plane against a REAL FearServer, with the
// engine replaced by UnityEngineShim.cs. Driven by
// tools/verification/verify_unity_adapter_behavior.mjs, once per phase, in
// separate processes, so "the host restarted" is a fact about the process rather
// than a claim about a variable.
//
// WHAT THIS PROVES
//   * the adapter's batched registration actually registers the crowd (one
//     request, not one per agent), and reports it through its own counters
//   * a claim the server refuses is COUNTED and surfaced rather than swallowed
//   * a teardown of another live session's agent is refused and reported
//   * the credential the server issues is written to a real file at the moment it
//     is issued
//   * a NEW process that loads that file is recognised as the same host: it is
//     GRANTED its crowd instead of being refused or forced to adopt
//
// WHAT THIS DOES NOT PROVE (and the ledger says so)
//   * WHEN Unity calls the lifecycle. The six bodies are now DRIVEN rather than
//     declared untestable - `UnityLifecycle` runs Awake then OnEnable, Start once
//     then Update, and OnDisable then OnDestroy on destruction - but construction
//     and waking are separate phases here, `FixedUpdate` (the async control-plane
//     tick) is deliberately not invoked from the frame pump, and an `async void`
//     body is invoked without being awaited. Whether Unity calls these at that
//     point remains an Editor question.
//   * frame scheduling: this shim runs coroutines to completion synchronously
//   * that the shim's UnityWebRequest/JsonUtility behave exactly like Unity's -
//     see the divergences listed in UnityEngineShim.cs
//
// Hard Rule 9 compliant: a standalone deterministic harness, not a test runner.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using FearAI;
using UnityEngine;

internal static class Harness
{
    private static int _passed;
    private static int _failed;
    private static int _phase;
    private static string _storePath = "";
    private static string _keyringPath = "";

    /// <summary>A fixed credential for phase 4, so the probe can search the file for
    /// it. It cannot be an issued one: phase 4 talks to no server on purpose.</summary>
    private const string KnownToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    private const string OwnerSessionId = "unity_host";
    private const string RivalSessionId = "unity_rival";

    private static readonly string[] Crowd =
    {
        "unity_agent_01", "unity_agent_02", "unity_agent_03",
        "unity_agent_04", "unity_agent_05", "unity_agent_06"
    };

    /// <summary>Reflection into the adapter's serialized fields, failing loudly if
    /// one is renamed. A silent no-op here would make the harness unable to
    /// configure the component it is testing, and every assertion after it would
    /// be measuring the wrong thing.</summary>
    private static void SetField(object target, string fieldName, object value)
    {
        var field = target.GetType().GetField(fieldName, BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
        if (field == null) throw new InvalidOperationException($"adapter field '{fieldName}' not found; the harness needs updating");
        field.SetValue(target, value);
    }

    private static void Invoke(object target, string methodName)
    {
        var method = target.GetType().GetMethod(methodName, BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
        if (method == null) throw new InvalidOperationException($"adapter method '{methodName}' not found; the harness needs updating");
        method.Invoke(target, null);
    }

    /// <summary>
    /// Clear the adapter's static singleton before waking an instance, which is
    /// what a process restart does to static state. Without this the adapter's own
    /// duplicate-instance guard would short-circuit `Awake` for the second client
    /// and the "restart" would be testing an object that never initialised.
    /// </summary>
    private static void ClearSingleton()
    {
        var property = typeof(FearAIClient).GetProperty("Instance", BindingFlags.Public | BindingFlags.Static);
        var setter = property?.GetSetMethod(true);
        if (setter == null) throw new InvalidOperationException("FearAIClient.Instance is not settable; the singleton contract changed");
        setter.Invoke(null, new object[] { null });
    }

    private static FearAIClient BuildClient(string sessionId, bool persist, ISessionStore store, int port)
    {
        ClearSingleton();
        // Constructed through the shim's GameObject rather than `new FearAIClient()`, so
        // the component is attached to a real GameObject before it is woken - which is
        // the shape `Awake` is written against (DontDestroyOnLoad, the singleton guard).
        var client = new GameObject($"fear_ai_harness_{sessionId}").AddComponent<FearAIClient>();
        // Serialized values FIRST, then wake. That is the scene/prefab case, which is the
        // one the adapter is written for, and it is the order `UnityLifecycle.Wake` says
        // it models; `Awake` reads `persistSession` and nothing happens between here and
        // the wake that the adapter can observe as a frame.
        SetField(client, "serverHost", "127.0.0.1");
        SetField(client, "serverPort", port);
        // The data plane is not under test: the control plane is HTTP either way,
        // and a socket would add an unawaited async path to a deterministic run.
        SetField(client, "useWebSocket", false);
        SetField(client, "sessionId", sessionId);
        SetField(client, "claimMode", "join");
        SetField(client, "persistSession", persist);
        client.SessionStore = store;
        UnityLifecycle.Wake(client);
        return client;
    }

    /// <summary>
    /// Records the lifecycle order it is driven in.
    ///
    /// This exists so the assertions about "the engine's order" are about something the
    /// shim is OBSERVED to do rather than about a comment, and so the once-only rule for
    /// `Start` is checked on a component that can actually be asked. It records the six
    /// bodies in the order Unity documents them, and nothing else.
    /// </summary>
    private sealed class LifecycleOrderProbe : MonoBehaviour
    {
        internal static readonly List<string> Observed = new List<string>();
        private void Awake() => Observed.Add("Awake");
        private void OnEnable() => Observed.Add("OnEnable");
        private void Start() => Observed.Add("Start");
        private void Update() => Observed.Add("Update");
        private void OnDisable() => Observed.Add("OnDisable");
        private void OnDestroy() => Observed.Add("OnDestroy");
    }

    /// <summary>
    /// The shim's lifecycle model, asserted rather than assumed. Every claim below is
    /// about a component this harness can interrogate, so the model cannot be quietly
    /// changed into something that would make the adapter's lifecycle assertions vacuous.
    /// </summary>
    private static void CheckLifecycleModel()
    {
        Console.WriteLine("\n[phase 1] the shim runs the lifecycle in Unity's order");
        LifecycleOrderProbe.Observed.Clear();
        var host = new GameObject("lifecycle_probe");
        var probe = host.AddComponent<LifecycleOrderProbe>();
        Check("AddComponent attaches without waking, so a component can arrive with its values",
            string.Join(",", LifecycleOrderProbe.Observed) == "",
            string.Join(",", LifecycleOrderProbe.Observed));

        UnityLifecycle.Wake(probe);
        Check("waking runs Awake then OnEnable, in that order",
            string.Join(",", LifecycleOrderProbe.Observed) == "Awake,OnEnable",
            string.Join(",", LifecycleOrderProbe.Observed));

        UnityLifecycle.Frame(probe);
        Check("the first frame runs Start then Update",
            string.Join(",", LifecycleOrderProbe.Observed) == "Awake,OnEnable,Start,Update",
            string.Join(",", LifecycleOrderProbe.Observed));

        UnityLifecycle.Frame(probe);
        Check("Start runs ONCE while Update runs every frame",
            string.Join(",", LifecycleOrderProbe.Observed) == "Awake,OnEnable,Start,Update,Update",
            string.Join(",", LifecycleOrderProbe.Observed));

        UnityEngine.Object.DestroyImmediate(host);
        Check("destroying the GameObject runs OnDisable then OnDestroy on its components",
            string.Join(",", LifecycleOrderProbe.Observed)
                == "Awake,OnEnable,Start,Update,Update,OnDisable,OnDestroy",
            string.Join(",", LifecycleOrderProbe.Observed));
        Check("and the GameObject no longer holds it", host.Attached.Count == 0,
            $"{host.Attached.Count} component(s) still attached");
    }

    /// <summary>Drain the adapter's control queue by pumping it, exactly as its
    /// own FixedUpdate would. The shim runs each coroutine to completion, so a
    /// single pump can finish a whole request.</summary>
    private static void Pump(FearAIClient client, int budget = 40)
    {
        for (int i = 0; i < budget; i++)
        {
            Invoke(client, "PumpControlPlane");
            if (client.ControlPlaneIdle) return;
        }
        throw new InvalidOperationException("control plane never went idle");
    }

    private static List<AgentRegistration> Registrations(params string[] ids) =>
        ids.Select(id => new AgentRegistration
        {
            agent_id = id,
            name = id,
            traits = new PersonalityTraits(),
            initial_position = new Vector3Hint { x = 1, y = 0, z = 2 }
        }).ToList();

    private static void Check(string label, bool condition, string detail = "")
    {
        if (condition)
        {
            _passed++;
            Console.WriteLine($"  [PASS] {label}");
        }
        else
        {
            _failed++;
            Console.WriteLine($"  [FAIL] {label}{(string.IsNullOrEmpty(detail) ? "" : $" — {detail}")}");
        }
    }

    private static int Main(string[] args)
    {
        int port = 0;
        foreach (var arg in args)
        {
            if (arg.StartsWith("--phase=")) _phase = int.Parse(arg.Substring("--phase=".Length));
            else if (arg.StartsWith("--store=")) _storePath = arg.Substring("--store=".Length);
            else if (arg.StartsWith("--port=")) port = int.Parse(arg.Substring("--port=".Length));
            else if (arg.StartsWith("--keyring=")) _keyringPath = arg.Substring("--keyring=".Length);
        }

        Console.WriteLine("================================================================================");
        Console.WriteLine("   REAL UNITY ADAPTER LOGIC vs A LIVE FearServer (no Editor, engine shimmed)      ");
        Console.WriteLine("================================================================================");

        if (port == 0 || _storePath.Length == 0 || (_phase != 1 && _phase != 2 && _phase != 3 && _phase != 4))
        {
            Console.WriteLine("[FAIL] usage: --phase=1|2|3|4 --store=<path> --port=<n> [--keyring=<path>]");
            return 2;
        }
        Console.WriteLine($"server=127.0.0.1:{port}  store={_storePath}  phase={_phase}");

        try
        {
            if (_phase == 1) PhaseOne(port);
            else if (_phase == 2) PhaseTwo(port);
            else if (_phase == 3) PhaseThree(port);
            else PhaseFour(port);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[FAIL] harness threw: {ex.GetType().Name}: {ex.Message}");
            _failed++;
        }

        Console.WriteLine("--------------------------------------------------------------------------------");
        Console.WriteLine($"PHASE {_phase} SUMMARY: {_passed} passed, {_failed} failed");
        if (_failed == 0)
        {
            Console.WriteLine($"UNITY_HARNESS_PHASE_{_phase}=PASSED");
            return 0;
        }
        Console.WriteLine($"UNITY_HARNESS_PHASE_{_phase}=FAILED");
        return 1;
    }

    // -------------------------------------------------------------------------
    // Phase 1 — a fresh Unity host: claim a crowd, be issued a credential, keep it.
    // -------------------------------------------------------------------------
    private static void PhaseOne(int port)
    {
        Console.WriteLine("\n[phase 1] a fresh Unity host establishes a crowd");
        // Before anything uses the lifecycle, establish that the model does what it says.
        // If this ever drifts, the adapter assertions below would still pass while proving
        // nothing about the order they claim to.
        CheckLifecycleModel();
        var store = new FileSessionStore(_storePath);
        var owner = BuildClient(OwnerSessionId, true, store, port);
        // Asserted HERE rather than at the end of the phase, because a rival client is
        // built later in this phase and it takes the singleton for itself. `Awake` is the
        // only thing that sets it, so `Instance` being this client is the observable
        // proof that the body ran - and the shim's wake is the only thing that ran it.
        Check("the shim's wake ran the adapter's Awake (it set the singleton)",
            ReferenceEquals(FearAIClient.Instance, owner));
        Check("a fresh store loads nothing", owner.SessionLoaded == false);

        owner.RegisterAgents(Registrations(Crowd));
        Pump(owner);

        Check("the whole crowd went out as ONE batched request",
            owner.BatchedRegistrationRequests == 1 && owner.IndividualRegistrationRequests == 0,
            $"batched={owner.BatchedRegistrationRequests} individual={owner.IndividualRegistrationRequests}");
        Check("the host registered successfully", owner.RegistrationFailures == 0,
            $"failures={owner.RegistrationFailures}");
        Check("no claim was refused for a first claim", owner.RefusedClaims == 0,
            $"refused={owner.RefusedClaims}");
        Check("the server reported the claim as GRANTED", owner.LastClaimOutcome == "GRANTED", owner.LastClaimOutcome);
        Check("the server issued a 256-bit credential", owner.SessionToken.Length == 64, $"length={owner.SessionToken.Length}");
        Check("the adapter persisted the credential", owner.SessionPersisted);
        Check("the credential is on disk", File.Exists(_storePath), _storePath);
        Console.WriteLine($"    [unity.log] credential written to {_storePath}");

        // The other half of the contract: a credential that trusts everyone would
        // be worse than none.
        Console.WriteLine("\n[phase 1] a tokenless rival names the same session");
        var rival = BuildClient(RivalSessionId, false, new InMemorySessionStore(), port);
        rival.RegisterAgents(Registrations(Crowd[0]));
        Pump(rival);
        Check("a rival with no credential is refused the live owner's agent",
            rival.RefusedClaims == 1, $"refused={rival.RefusedClaims}");
        Check("a rival's claim does not silently succeed as an adoption",
            rival.LastClaimOutcome != "ADOPTED", rival.LastClaimOutcome);
        Check("the owner is told nothing about a claim it did not make", owner.RefusedClaims == 0);

        rival.UnregisterAgents(new List<string> { Crowd[0] });
        Pump(rival);
        Check("a rival's teardown of the owner's agent is refused AND reported",
            rival.UnregistrationRefusals == 1, $"refusals={rival.UnregistrationRefusals}");

        // Teardown and trauma authored by the owner must still work, or gating
        // would have broken the host it protects.
        owner.AddTraumaZones(new List<TraumaZone>
        {
            new TraumaZone { x = 4, y = 0, z = 4, intensity = 0.9f, radius = 40, lifetimeTicks = 300 },
            new TraumaZone { x = -9, y = 0, z = 1, intensity = 0.4f, radius = 20, lifetimeTicks = 120 }
        });
        owner.UnregisterAgents(new List<string> { Crowd[5] });
        Pump(owner);
        Check("the owner's own teardown is not refused", owner.UnregistrationRefusals == 0,
            $"refusals={owner.UnregistrationRefusals}");
        Check("the owner's trauma zones were applied",
            owner.TraumaZonesRejected == 0, $"rejected={owner.TraumaZonesRejected}");
        Check("nothing was counted as a registration failure on the way",
            owner.RegistrationFailures == 0, $"failures={owner.RegistrationFailures}");

        // ------------------------------------------------------------------
        // The adapter's OWN lifecycle bodies, driven by the shim rather than invoked
        // by hand. Before `UnityLifecycle` existed, `Awake` was called by reflection
        // here and `Start` and `OnDestroy` were called by nothing at all: two of the
        // four bodies this adapter has had never been executed anywhere. Placed last
        // so that none of it can perturb the control-plane assertions above, and
        // destroying the client is the point of the last two.
        // ------------------------------------------------------------------
        Console.WriteLine("\n[phase 1] the adapter's own lifecycle bodies");

        var frameError = "";
        try { UnityLifecycle.Frame(owner); }
        catch (Exception ex) { frameError = $"{ex.GetType().Name}: {ex.Message}"; }
        Check("a frame runs the adapter's async Start without throwing", frameError == "", frameError);

        var destroyError = "";
        try { UnityEngine.Object.DestroyImmediate(owner); }
        catch (Exception ex) { destroyError = $"{ex.GetType().Name}: {ex.Message}"; }
        Check("destroying the host runs the adapter's OnDestroy without throwing",
            destroyError == "", destroyError);
        Check("teardown did NOT take the persisted credential with it",
            File.Exists(_storePath),
            "clearing memory is not a revocation, and the file is what the next process proves itself with");
    }

    // -------------------------------------------------------------------------
    // Phase 2 — a NEW process, same store, same live server.
    // -------------------------------------------------------------------------
    private static void PhaseTwo(int port)
    {
        Console.WriteLine("\n[phase 2] a new Unity host process, same store, same server");
        var store = new FileSessionStore(_storePath);
        var owner = BuildClient(OwnerSessionId, true, store, port);

        Check("the identity was LOADED from the store rather than defaulted", owner.SessionLoaded);
        Check("the loaded credential is non-empty", owner.SessionToken.Length == 64,
            $"length={owner.SessionToken.Length}");

        owner.RegisterAgents(Registrations(Crowd[0], Crowd[1], Crowd[2]));
        Pump(owner);

        // This is the assertion phase 2 exists for. The previous process is gone
        // but its session is still LIVE on the server, so a claim carrying only the
        // name would be REFUSED (refused=3). GRANTED with no refusals means the
        // credential loaded from disk is what proved the identity.
        Check("the restarted host is GRANTED its crowd, not refused or adopted",
            owner.LastClaimOutcome == "GRANTED", owner.LastClaimOutcome);
        Check("no claim was refused for the restarted host", owner.RefusedClaims == 0,
            $"refused={owner.RefusedClaims}");
        Check("the restarted host did not adopt its own agents",
            owner.LastClaimOutcome != "ADOPTED", owner.LastClaimOutcome);
        Check("the restarted host still batches", owner.IndividualRegistrationRequests == 0,
            $"individual={owner.IndividualRegistrationRequests}");
        Check("the restarted host re-issued no registration failures", owner.RegistrationFailures == 0,
            $"failures={owner.RegistrationFailures}");
    }

    // -------------------------------------------------------------------------
    // Phase 3 — the same adapter, proving itself with a KEY instead of only a token.
    //
    // Run against a server whose signature policy is `required`, which is the one
    // setting that makes a session's own token insufficient. Everything this phase
    // asserts is about the difference between "the server recognised the name" and
    // "the server verified a private key the wire never carried".
    // -------------------------------------------------------------------------
    private const string SigningSessionId = "unity_signing_host";

    private static void PhaseThree(int port)
    {
        Console.WriteLine("\n[phase 3] a Unity host that signs its requests");
        var store = new FileSessionStore(_storePath);
        var owner = BuildClient(SigningSessionId, false, store, port);
        owner.EnableSigning();

        Check("the adapter generated a signing key", owner.Signer != null && owner.Signer.HasKey);
        Check("the public key is PEM the server can parse",
            owner.Signer.PublicKeyPem.StartsWith("-----BEGIN PUBLIC KEY-----", StringComparison.Ordinal)
            && owner.Signer.PublicKeyPem.IndexOf("-----END PUBLIC KEY-----", StringComparison.Ordinal) > 0,
            owner.Signer.PublicKeyPem.Split('\n')[0]);
        Check("the key id is a 16-character fingerprint of the key itself",
            owner.Signer.KeyId.Length == 16, owner.Signer.KeyId);
        Check("a generated key can be exported and re-imported", CanRoundTripKey(owner));

        owner.RegisterAgents(Registrations("signing_agent_01", "signing_agent_02"));
        Pump(owner);

        Check("the crowd registered while the key was being offered", owner.RegistrationFailures == 0,
            $"failures={owner.RegistrationFailures}");
        Check("the server CONFIRMED the key", owner.SigningKeyRegistered);
        // The claim that carries the public key cannot be signed: no session exists
        // yet for the key to belong to, so the server would refuse it as an unknown
        // key and the key would never be registered at all.
        Check("no request was signed before the server knew the key",
            owner.Signer.RequestsSigned == 0, $"signed={owner.Signer.RequestsSigned}");

        // Now that the key is confirmed, every control request must be signed - and
        // the server, which is running the `required` policy, would refuse it
        // otherwise. A successful teardown here is evidence that the whole chain
        // works: canonical string, hand-built SPKI DER, signature, verification.
        owner.UnregisterAgents(new List<string> { "signing_agent_01" });
        Pump(owner);
        Check("a teardown AFTER key confirmation is signed",
            owner.Signer.RequestsSigned >= 1, $"signed={owner.Signer.RequestsSigned}");
        Check("the signed teardown was accepted, not refused",
            owner.UnregistrationRefusals == 0 && owner.Signer.Refusals == 0,
            $"refusals={owner.UnregistrationRefusals} signingRefusals={owner.Signer.Refusals}/{owner.Signer.RefusalReason}");

        // Printed for the probe, which asserts the server's side of the same facts:
        // that it holds this exact fingerprint, and that the SESSION TOKEN ALONE is
        // no longer enough to act as this host.
        Console.WriteLine($"SIGNING_KEY_ID={owner.Signer.KeyId}");
        Console.WriteLine($"SIGNING_SESSION_ID={owner.SessionId}");
        Console.WriteLine($"SIGNING_SESSION_TOKEN={owner.SessionToken}");
        Console.WriteLine($"SIGNING_BATCHED_REQUESTS={owner.BatchedRegistrationRequests}");
    }

    // -------------------------------------------------------------------------
    // Phase 4 — the CREDENTIAL and the PRIVATE KEY, encrypted at rest.
    //
    // NO SERVER, deliberately: this phase is about one file and the adapter's own
    // read-back, and an HTTP round trip would only add an unawaited async path to
    // something entirely local. The signing key is the half that matters most, since
    // a host that cannot restore it after a restart can no longer PROVE itself, only
    // name itself - which is exactly what request signing exists to stop.
    //
    // The keyring is passed in and lives OUTSIDE the store's directory, mirroring the
    // rule the design depends on: a backup of the save tree must carry nothing usable.
    // -------------------------------------------------------------------------
    private static void PhaseFour(int port)
    {
        Console.WriteLine("\n[phase 4] the credential and the private signing key, encrypted at rest");

        var writer = BuildClient(OwnerSessionId, true,
            new FearEncryptedSessionStore(_storePath, _keyringPath), port);
        writer.SessionToken = KnownToken;
        writer.EnableSigning();

        Check("the adapter has a signing key", writer.Signer != null && writer.Signer.HasKey);
        Check("both halves are written", writer.SaveSession(), writer.SessionStoreError);
        Check("the store reports itself ENCRYPTED",
            writer.SessionStoreProtection == FearEncryptedSessionStore.ProtectionEncrypted,
            writer.SessionStoreProtection);

        var raw = File.ReadAllText(_storePath);
        Check("the file is the container, not JSON",
            raw.StartsWith(FearStoreCryptography.StoreVersion + "\n", StringComparison.Ordinal),
            raw.Split('\n')[0]);
        Check("THE CREDENTIAL IS NOT READABLE IN THE FILE", !raw.Contains(KnownToken));
        Check("THE PRIVATE KEY IS NOT READABLE IN THE FILE", !raw.Contains("PRIVATE KEY"));
        Check("the session NAME is readable without the key, deliberately",
            FearStoreCryptography.ReadName(raw) == OwnerSessionId, FearStoreCryptography.ReadName(raw));
        Check("the keyring landed OUTSIDE the store's directory",
            File.Exists(_keyringPath)
            && Path.GetDirectoryName(_keyringPath) != Path.GetDirectoryName(_storePath),
            _keyringPath);

        // A NEW client over the SAME file, standing in for a restarted host. The
        // singleton is cleared first, which is what a process restart does to it.
        var restartedStore = new FearEncryptedSessionStore(_storePath, _keyringPath);
        var restarted = BuildClient(OwnerSessionId, true, restartedStore, port);
        Check("the restarted host loaded the store", restarted.SessionLoaded, restarted.SessionStoreError);
        Check("the credential came back", restarted.SessionToken == KnownToken);
        Check("the signing key was read back BEFORE signing was turned on",
            !string.IsNullOrEmpty(restarted.StoredSigningKeyText));

        restarted.EnableSigning();
        // THE assertion of this phase. Without the stored-key preference, this call
        // would generate a fresh key and present it to a server that still holds the
        // old one - so persistence would look like it worked and leave the host
        // unable to sign at all.
        Check("turning signing on ADOPTED the stored key rather than generating a new one",
            restarted.Signer.KeyId == writer.Signer.KeyId,
            $"restored={restarted.Signer.KeyId} original={writer.Signer.KeyId}");
        Check("the restored public half matches the original",
            restarted.Signer.PublicKeyPem == writer.Signer.PublicKeyPem);
        Check("the restored key really signs",
            restarted.Signer.SignHeaders("POST", "/api/v1/register", "{}", OwnerSessionId).Count > 0);
        // The store's own diagnostic, not the file text: it is the answer a host
        // actually has to be able to get about a persisted credential.
        Check("and the file still exposes nothing after the restart",
            !restartedStore.FileExposesSecrets(KnownToken, restarted.StoredSigningKeyText));

        // Printed for the probe, which checks the same facts from OUTSIDE the adapter -
        // including that the Node reference can open the file with the keyring alone.
        Console.WriteLine($"UNITY_STORE_TOKEN={writer.SessionToken}");
        Console.WriteLine($"UNITY_STORE_KEY_ID={writer.Signer.KeyId}");
        Console.WriteLine($"UNITY_STORE_KEYRING={_keyringPath}");
    }

    /// <summary>A key that cannot be written and read back is a key that cannot
    /// survive the host's own restart.</summary>
    private static bool CanRoundTripKey(FearAIClient client)
    {
        var exported = client.Signer.ExportPrivateKeyText();
        if (string.IsNullOrEmpty(exported)) return false;
        var reloaded = new FearRequestSigner().FromPrivateKeyText(exported);
        return reloaded.PublicKeyPem == client.Signer.PublicKeyPem;
    }
}
