using System;
using System.IO;
using NUnit.Framework;
using UnityEngine;
using FearAI;

namespace FearAI.EditorTests
{
    /// <summary>
    /// The credential stores, exercised on the Editor's real file system and real
    /// PlayerPrefs.
    ///
    /// WHY THIS IS AN EDITOR TEST RATHER THAN A SHIM TEST
    /// The shim harness implements a file system and a PlayerPrefs so the adapter
    /// can be executed without an engine, and that is exactly its blind spot: a
    /// shim that writes and reads back its own JSON proves the shim is
    /// self-consistent. `JsonUtility` and `PlayerPrefs` are the Editor's, and the
    /// question a host actually asks - does a credential written in one process
    /// load in the next - is answered here against the real ones.
    ///
    /// The tests also pin the two behaviours that are easy to break and expensive
    /// to notice: a corrupt store must be REPORTED and LEFT ALONE (it may be the
    /// only copy of a credential still valid on the server), and the default store
    /// must keep nothing at all.
    /// </summary>
    [TestFixture]
    public class FearSessionStoreEditModeTests
    {
        private string _directory;
        private readonly System.Collections.Generic.List<string> _playerPrefKeys = new System.Collections.Generic.List<string>();

        [SetUp]
        public void SetUp()
        {
            _directory = Path.Combine(Application.temporaryCachePath, $"fear_ai_editmode_{Guid.NewGuid():N}");
            Directory.CreateDirectory(_directory);
        }

        [TearDown]
        public void TearDown()
        {
            if (Directory.Exists(_directory))
            {
                try { Directory.Delete(_directory, true); } catch { /* best effort */ }
            }
            foreach (var key in _playerPrefKeys)
            {
                PlayerPrefs.DeleteKey($"{key}.session_id");
                PlayerPrefs.DeleteKey($"{key}.session_token");
            }
            _playerPrefKeys.Clear();
            PlayerPrefs.Save();
        }

        // ------------------------------------------------------------------
        // The default: nothing outlives the process.
        // ------------------------------------------------------------------

        [Test]
        public void InMemoryStoreRoundTripsAndStartsEmpty()
        {
            var store = new InMemorySessionStore();
            Assert.IsFalse(store.HasStoredSession, "a fresh in-memory store must hold nothing");
            Assert.IsFalse(store.TryLoad(out var emptyId, out var emptyToken));
            Assert.AreEqual("", emptyId);
            Assert.AreEqual("", emptyToken);

            store.Save("unity_host", "credential_abc");
            Assert.IsTrue(store.HasStoredSession);
            Assert.IsTrue(store.TryLoad(out var id, out var token));
            Assert.AreEqual("unity_host", id);
            Assert.AreEqual("credential_abc", token);

            store.Clear();
            Assert.IsFalse(store.HasStoredSession, "Clear must actually forget the credential");
            Assert.IsFalse(store.TryLoad(out _, out _));
        }

        [Test]
        public void ASeparateInMemoryStoreIsAlwaysAStranger()
        {
            var first = new InMemorySessionStore();
            first.Save("unity_host", "credential_abc");
            var second = new InMemorySessionStore();
            Assert.IsFalse(second.HasStoredSession,
                "a second in-memory store must be empty: this is the whole reason it is the default");
        }

        // ------------------------------------------------------------------
        // The file store.
        // ------------------------------------------------------------------

        [Test]
        public void FileStoreSurvivesANewInstance()
        {
            string path = Path.Combine(_directory, "session.json");
            var writer = new FileSessionStore(path);
            Assert.IsFalse(writer.HasStoredSession);
            writer.Save("unity_host", "credential_abc");
            Assert.AreEqual("", writer.LastError);
            Assert.IsTrue(File.Exists(path), "the store must write on save, not at shutdown");

            // A NEW instance, standing in for a restarted process.
            var reader = new FileSessionStore(path);
            Assert.IsTrue(reader.HasStoredSession);
            Assert.IsTrue(reader.TryLoad(out var id, out var token));
            Assert.AreEqual("unity_host", id);
            Assert.AreEqual("credential_abc", token);
        }

        [Test]
        public void FileStoreKeepsTheFileUsableAfterASecondProcessLoadsIt()
        {
            string path = Path.Combine(_directory, "session.json");
            new FileSessionStore(path).Save("unity_host", "credential_abc");
            // Loading must not consume or rewrite the store: a process that starts,
            // reads and crashes must leave the credential for the next one.
            var first = new FileSessionStore(path);
            Assert.IsTrue(first.TryLoad(out _, out _));
            Assert.IsTrue(new FileSessionStore(path).TryLoad(out var id, out var token));
            Assert.AreEqual("unity_host", id);
            Assert.AreEqual("credential_abc", token);
        }

        [Test]
        public void FileStoreClearRemovesTheIdentity()
        {
            string path = Path.Combine(_directory, "session.json");
            var store = new FileSessionStore(path);
            store.Save("unity_host", "credential_abc");
            store.Clear();
            Assert.IsFalse(File.Exists(path), "Clear must remove the file, not just empty the fields");
            Assert.IsFalse(store.HasStoredSession);
        }

        [Test]
        public void ACorruptStoreIsReportedAndLeftAlone()
        {
            string path = Path.Combine(_directory, "session.json");
            File.WriteAllText(path, "{ this is not the JSON anyone intended ");
            var store = new FileSessionStore(path);
            Assert.IsFalse(store.TryLoad(out _, out _), "a corrupt store must not report a loadable identity");
            Assert.IsFalse(string.IsNullOrEmpty(store.LastError), "a corrupt store must be REPORTED, not swallowed");
            Assert.IsTrue(File.Exists(path),
                "the corrupt file must be left alone: it may be the only copy of a credential that is still valid");
        }

        [Test]
        public void AStoreWithNoTokenIsNotAUsableIdentity()
        {
            string path = Path.Combine(_directory, "session.json");
            File.WriteAllText(path, "{\"session_id\":\"unity_host\",\"session_token\":\"\",\"saved_at_unix\":0}");
            var store = new FileSessionStore(path);
            Assert.IsFalse(store.TryLoad(out _, out _),
                "a name without a credential is not a session this host can prove; treating it as one would report a false reconnect");
        }

        // ------------------------------------------------------------------
        // PlayerPrefs.
        // ------------------------------------------------------------------

        [Test]
        public void PlayerPrefsStoreSurvivesANewInstance()
        {
            string key = $"fear_ai_test_{Guid.NewGuid():N}";
            _playerPrefKeys.Add(key);
            new PlayerPrefsSessionStore(key).Save("unity_host", "credential_abc");

            var reader = new PlayerPrefsSessionStore(key);
            Assert.IsTrue(reader.HasStoredSession);
            Assert.IsTrue(reader.TryLoad(out var id, out var token));
            Assert.AreEqual("unity_host", id);
            Assert.AreEqual("credential_abc", token);

            reader.Clear();
            Assert.IsFalse(new PlayerPrefsSessionStore(key).HasStoredSession);
        }

        [Test]
        public void TwoPlayerPrefsKeysDoNotCollide()
        {
            string soak = $"fear_ai_soak_{Guid.NewGuid():N}";
            string play = $"fear_ai_play_{Guid.NewGuid():N}";
            _playerPrefKeys.Add(soak);
            _playerPrefKeys.Add(play);

            // Namespaced keys exist so one host can hold two identities, e.g. a
            // play session and a soak-test session.
            new PlayerPrefsSessionStore(soak).Save("soak_host", "soak_credential");
            new PlayerPrefsSessionStore(play).Save("play_host", "play_credential");

            Assert.IsTrue(new PlayerPrefsSessionStore(soak).TryLoad(out var soakId, out var soakToken));
            Assert.IsTrue(new PlayerPrefsSessionStore(play).TryLoad(out var playId, out var playToken));
            Assert.AreEqual("soak_host", soakId);
            Assert.AreEqual("soak_credential", soakToken);
            Assert.AreEqual("play_host", playId);
            Assert.AreEqual("play_credential", playToken);
        }
    }
}
