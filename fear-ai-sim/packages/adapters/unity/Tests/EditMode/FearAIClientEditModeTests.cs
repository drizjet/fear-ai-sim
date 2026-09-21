using System;
using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;
using FearAI;

namespace FearAI.EditorTests
{
    /// <summary>
    /// The adapter's defaults and its JSON surface, as the Editor sees them.
    ///
    /// WHAT THESE TESTS DELIBERATELY DO NOT COVER
    /// `Awake` and `Start` do not run for a component added in edit mode, and that
    /// is not a gap to work around: it is the boundary between this fixture and the
    /// shim harness. The shim harness INVOKES `Awake` by reflection and drives the
    /// component against a live server, so load-on-wake, the control plane and the
    /// connection lifecycle are covered there. What is covered here is what a
    /// designer sees in the Add Component inspector before pressing Play, and the
    /// JSON helpers that any host can call from an Editor tool.
    ///
    /// The defaults matter more than they look. "Signing off by default", "nothing
    /// outlives the process" and "a competing host is refused, not silently
    /// preferred" are claims the ledger makes about this adapter, and a default
    /// flipped during a refactor would be invisible in every other probe.
    /// </summary>
    [TestFixture]
    public class FearAIClientEditModeTests
    {
        private GameObject _gameObject;
        private FearAIClient _client;

        [SetUp]
        public void SetUp()
        {
            _gameObject = new GameObject("fear_ai_editmode_client");
            _client = _gameObject.AddComponent<FearAIClient>();
        }

        [TearDown]
        public void TearDown()
        {
            if (_gameObject != null) UnityEngine.Object.DestroyImmediate(_gameObject);
            _gameObject = null;
            _client = null;
        }

        [Test]
        public void AFreshClientPersistsNothingByDefault()
        {
            Assert.IsFalse(_client.PersistSession,
                "persistence is opt-in: the token is a bearer credential and the default must not write it anywhere");
            Assert.IsInstanceOf<InMemorySessionStore>(_client.SessionStore,
                "the default store must keep nothing across a restart");
            Assert.IsFalse(_client.SessionStore.HasStoredSession);
        }

        [Test]
        public void AFreshClientSignsNothingByDefault()
        {
            Assert.IsNull(_client.Signer, "a host must not generate a private key it did not ask for");
            Assert.IsFalse(_client.SigningKeyRegistered,
                "no key is registered until the SERVER confirms one");
            Assert.AreEqual("", _client.SessionToken, "a fresh client holds no credential");
            Assert.IsFalse(_client.SessionLoaded);
            Assert.IsFalse(_client.SessionPersisted);
            Assert.IsFalse(_client.BatchControlUnsupported,
                "batch control is the default; the singular routes are the fallback for a pre-batch server");
            // Nothing is in flight on a component that has never woken.
            Assert.IsTrue(_client.ControlPlaneIdle);
            Assert.AreEqual(0, _client.BatchedRegistrationRequests);
            Assert.AreEqual(0, _client.RefusedClaims);
        }

        [Test]
        public void ACompetingHostIsRefusedRatherThanSilentlyPreferred()
        {
            // The claim mode defaults to `join`, which REFUSES a live owner's crowd
            // rather than displacing it. A default of `takeover` would silently
            // steal a running host's agents, which is the single most damaging
            // default this adapter could ship.
            Assert.AreEqual("join", _client.ClaimMode);
        }

        [Test]
        public void EnableSigningGeneratesAKeyAndReportsIt()
        {
            _client.EnableSigning();
            Assert.IsNotNull(_client.Signer);
            Assert.IsTrue(_client.Signer.HasKey);
            Assert.AreEqual(16, _client.Signer.KeyId.Length);
            // Still unregistered: the server has not answered yet, and claiming
            // otherwise would make the client sign a claim the server cannot verify.
            Assert.IsFalse(_client.SigningKeyRegistered);
            Assert.AreEqual(0, _client.Signer.RequestsSigned);
        }

        [Test]
        public void EnableSigningCanAdoptAStoredKeySoARestartKeepsItsIdentity()
        {
            var original = new FearRequestSigner().Generate();
            string text = original.ExportPrivateKeyText();

            _client.EnableSigning(text);
            Assert.AreEqual(original.KeyId, _client.Signer.KeyId,
                "adopting a stored key must reproduce the identity the server already knows");
        }

        [Test]
        public void HostCapabilitiesStartEmptyAndAreConfigurable()
        {
            Assert.IsNotNull(_client.HostCapabilities);
            Assert.AreEqual(0, _client.HostCapabilities.Count,
                "a host declares what it supports; the client must not assume any capability");
            _client.HostCapabilities.Add("supports_dialogue");
            CollectionAssert.Contains(_client.HostCapabilities, "supports_dialogue");
        }

        [Test]
        public void SessionNameIsSettableAndIsNotACredential()
        {
            Assert.AreEqual("unity_host", _client.SessionId);
            _client.SessionId = "another_host";
            Assert.AreEqual("another_host", _client.SessionId);
            // The name and the credential are separate fields on purpose: knowing a
            // name must never be sufficient, and this pins that they are not the
            // same storage.
            Assert.AreEqual("", _client.SessionToken);
        }

        [Test]
        public void ClearStoredSessionLeavesARunningHostAlone()
        {
            var store = new InMemorySessionStore();
            store.Save("unity_host", "credential_abc");
            _client.SessionStore = store;
            _client.SessionToken = "credential_abc";
            _client.ClearStoredSession();
            Assert.IsFalse(store.HasStoredSession, "the store must be cleared");
            Assert.AreEqual("credential_abc", _client.SessionToken,
                "but the running host keeps what it holds in memory: clearing the store is not a revocation");
        }
    }

    /// <summary>
    /// The hand-built JSON surface. This is where the escaping defect lived.
    /// </summary>
    [TestFixture]
    public class JsonHelperEditModeTests
    {
        [Test]
        public void NewlinesAreEscapedNotEmittedRaw()
        {
            // A PEM public key has a newline on every line, and a raw LF inside a
            // JSON string is invalid: the server answered 400 and the registration
            // silently failed. The escaping was found by EXECUTING the adapter
            // against a real server, so it is pinned here.
            string pem = "-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----\n";
            string escaped = JsonHelper.Escape(pem);
            Assert.IsFalse(escaped.Contains("\n"), "a raw newline survived escaping");
            StringAssert.Contains("\\n", escaped);
        }

        [Test]
        public void QuotesBackslashesAndControlCharactersAreEscaped()
        {
            Assert.AreEqual("he said \\\"hi\\\"", JsonHelper.Escape("he said \"hi\""));
            Assert.AreEqual("back\\\\slash", JsonHelper.Escape("back\\slash"));
            Assert.AreEqual("tab\\there", JsonHelper.Escape("tab\there"));
            Assert.AreEqual("bell\\u0007", JsonHelper.Escape("bell\u0007"));
            Assert.AreEqual("", JsonHelper.Escape(null));
            Assert.AreEqual("", JsonHelper.Escape(""));
        }

        [Test]
        public void AnUnescapedStringListWouldHaveProducedInvalidJson()
        {
            // The list helper had its own quotes-only copy of the escaper, so a
            // multi-line entry produced invalid JSON through a public API. Both
            // helpers now share one implementation.
            var values = new List<string> { "plain", "two\nlines", "quote\"inside" };
            string json = JsonHelper.ToJsonStringList(values);
            Assert.IsFalse(json.Contains("\n"), "a raw newline reached the JSON array");
            Assert.AreEqual("[\"plain\",\"two\\nlines\",\"quote\\\"inside\"]", json);

            // And it parses, which is the property that actually matters.
            var parsed = JsonUtility.FromJson<Wrapper>(Wrap(json));
            Assert.IsNotNull(parsed);
            Assert.AreEqual(3, parsed.items.Count);
            Assert.AreEqual("two\nlines", parsed.items[1]);
            Assert.AreEqual("quote\"inside", parsed.items[2]);
        }

        [Test]
        public void AnEmptyOrMissingListIsStillAJsonArray()
        {
            Assert.AreEqual("[]", JsonHelper.ToJsonStringList(null));
            Assert.AreEqual("[]", JsonHelper.ToJsonStringList(new List<string>()));
        }

        [Serializable]
        private class Wrapper
        {
            public List<string> items;
        }

        private static string Wrap(string arrayJson) => $"{{\"items\":{arrayJson}}}";
    }
}
