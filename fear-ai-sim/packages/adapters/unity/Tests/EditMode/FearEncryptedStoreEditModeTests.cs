using System;
using System.IO;
using NUnit.Framework;
using UnityEngine;
using FearAI;

namespace FearAI.EditorTests
{
    /// <summary>
    /// The ENCRYPTED store, exercised on the Editor's real file system.
    ///
    /// WHY THESE ASSERTIONS LOOK DIFFERENT FROM THE OTHER STORE TESTS
    /// Every other test in this folder asks "did the value come back". These also ask
    /// "what is readable in the file", because that is the entire point of the store
    /// and it is the claim that is easy to make and easy to be wrong about. A store
    /// that round-trips and leaves the credential in the clear passes a round-trip
    /// test perfectly.
    ///
    /// THE KEYRING IS IN A DIFFERENT DIRECTORY IN EVERY TEST, and that is not
    /// incidental tidiness: both files being in the same folder is exactly the
    /// situation the design exists to avoid, so a test that put them side by side
    /// would be testing the failure mode.
    /// </summary>
    [TestFixture]
    public class FearEncryptedStoreEditModeTests
    {
        private string _storeDir;
        private string _keyringDir;
        private string _keyringPath;
        private string _storePath;

        private const string SessionName = "unity_encrypted_host";
        private const string Token = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        private const string KeyText = "FEAR-AI-RSA1\nmodulus=AQID\n";

        [SetUp]
        public void SetUp()
        {
            _storeDir = Path.Combine(Application.temporaryCachePath, $"fear_store_{Guid.NewGuid():N}");
            _keyringDir = Path.Combine(Application.temporaryCachePath, $"fear_keyring_{Guid.NewGuid():N}");
            Directory.CreateDirectory(_storeDir);
            Directory.CreateDirectory(_keyringDir);
            _storePath = Path.Combine(_storeDir, "session.enc");
            _keyringPath = Path.Combine(_keyringDir, "keyring");
        }

        [TearDown]
        public void TearDown()
        {
            foreach (var directory in new[] { _storeDir, _keyringDir })
            {
                if (Directory.Exists(directory))
                {
                    try { Directory.Delete(directory, true); } catch { /* best effort */ }
                }
            }
        }

        private FearEncryptedSessionStore NewStore()
        {
            return new FearEncryptedSessionStore(_storePath, _keyringPath);
        }

        // ------------------------------------------------------------------
        // The at-rest claim.
        // ------------------------------------------------------------------

        [Test]
        public void TheCredentialAndTheKeyAreNotReadableInTheFile()
        {
            var store = NewStore();
            Assert.IsTrue(store.SaveWithSigningKey(SessionName, Token, KeyText), store.LastError);
            Assert.AreEqual(FearEncryptedSessionStore.ProtectionEncrypted, store.Protection);

            string raw = File.ReadAllText(_storePath);
            Assert.IsFalse(raw.Contains(Token),
                "THE credential must not be readable in the store: this is the claim the store exists to make");
            Assert.IsFalse(raw.Contains(KeyText),
                "the private signing key must not be readable in the store either");
            Assert.IsFalse(raw.Contains("PRIVATE KEY"),
                "not even a private-key PEM banner may survive in the file");

            // Not JSON at all, so nothing that greps a support bundle for a token
            // finds a field to read.
            Assert.IsTrue(raw.StartsWith(FearStoreCryptography.StoreVersion + "\n"),
                $"expected the container version line, got: {raw.Split('\n')[0]}");
            Assert.IsTrue(raw.Contains("\ncipher=aes-256-cbc\n"));
            Assert.IsTrue(raw.Contains("\nkdf=pbkdf2-hmac-sha256\n"));

            // The NAME stays readable on purpose: the ownership model already rests on
            // a name not being a credential, and an operator holding a stray store
            // needs to know which host it belongs to.
            Assert.AreEqual(SessionName, FearStoreCryptography.ReadName(raw),
                "the session name is deliberately kept in the clear");
            Assert.IsTrue(store.FileExposesSecrets(Token, KeyText) == false,
                "the store's own diagnostic must agree with the file itself");
        }

        [Test]
        public void TheKeyringIsASeparateFileOutsideTheStoresDirectory()
        {
            var store = NewStore();
            Assert.IsTrue(store.SaveWithSigningKey(SessionName, Token, KeyText), store.LastError);
            Assert.IsTrue(File.Exists(_keyringPath), "a keyring must have been created");
            Assert.AreEqual(_keyringPath, store.KeyringUsed);
            Assert.AreNotEqual(Path.GetDirectoryName(_storePath), Path.GetDirectoryName(store.KeyringUsed),
                "the key must NOT sit in the store's own directory, or one backup carries both halves");

            string keyringText = File.ReadAllText(_keyringPath);
            Assert.IsTrue(keyringText.StartsWith(FearStoreCryptography.KeyringVersion + "\n"));
            Assert.IsFalse(keyringText.Contains(Token));
        }

        [Test]
        public void AStoreCopiedWithoutItsKeyringIsInert()
        {
            var store = NewStore();
            Assert.IsTrue(store.SaveWithSigningKey(SessionName, Token, KeyText), store.LastError);
            string movedCopy = Path.Combine(_storeDir, "copied_into_a_backup.enc");
            File.Copy(_storePath, movedCopy);

            // A DIFFERENT keyring, standing in for "the file travelled without its key".
            string strangerKeyring = Path.Combine(_keyringDir, "stranger_keyring");
            var stranger = new FearEncryptedSessionStore(movedCopy, strangerKeyring);
            Assert.IsFalse(stranger.TryLoad(out _, out _),
                "A COPY OF THE STORE WITHOUT ITS KEYRING MUST BE INERT, which is the leak this design is for");
            Assert.AreEqual(FearStoreCryptography.ReasonTampered, stranger.LastError,
                "a wrong key and an edited file collapse into one reported reason by design");

            // The original still opens, with its own keyring.
            Assert.IsTrue(NewStore().TryLoadWithSigningKey(out var id, out var token, out var key));
            Assert.AreEqual(SessionName, id);
            Assert.AreEqual(Token, token);
            Assert.AreEqual(KeyText, key);
        }

        // ------------------------------------------------------------------
        // The round trip that has to keep working.
        // ------------------------------------------------------------------

        [Test]
        public void ASeparateStoreInstanceReclaimsTheIdentityAndTheKey()
        {
            Assert.IsTrue(NewStore().SaveWithSigningKey(SessionName, Token, KeyText));

            // A NEW instance, standing in for a restarted process. The credential AND
            // the signing key must both come back: a host that restores only its name
            // can no longer PROVE itself.
            var restarted = NewStore();
            Assert.IsTrue(restarted.HasStoredSession);
            Assert.IsTrue(restarted.TryLoadWithSigningKey(out var id, out var token, out var key));
            Assert.AreEqual(SessionName, id);
            Assert.AreEqual(Token, token);
            Assert.AreEqual(KeyText, key);
            Assert.AreEqual(FearEncryptedSessionStore.ProtectionEncrypted, restarted.Protection);
            Assert.AreEqual("", restarted.LastError);
            Assert.AreEqual(_keyringPath, restarted.KeyringUsed);
            Assert.IsFalse(restarted.KeyringCreated, "the keyring already existed, so it must be REUSED, not replaced");
        }

        [Test]
        public void ThePlainInterfaceStillWorksOnTheEncryptedStore()
        {
            // A host that only knows the ISessionStore half must still be able to use
            // the encrypted store; the signing key is an addition, not a precondition.
            ISessionStore store = NewStore();
            store.Save(SessionName, Token);
            Assert.IsTrue(store.HasStoredSession);
            Assert.IsTrue(store.TryLoad(out var id, out var token));
            Assert.AreEqual(SessionName, id);
            Assert.AreEqual(Token, token);
        }

        // ------------------------------------------------------------------
        // The refusal surface.
        // ------------------------------------------------------------------

        [Test]
        public void AnEditedStoreIsRefusedRatherThanHalfHonoured()
        {
            Assert.IsTrue(NewStore().SaveWithSigningKey(SessionName, Token, KeyText));
            string raw = File.ReadAllText(_storePath);
            File.WriteAllText(_storePath, raw.Replace($"name={SessionName}", "name=someone_else"));

            var store = NewStore();
            Assert.IsFalse(store.TryLoad(out _, out _), "an edited store must not report an identity");
            Assert.AreEqual(FearStoreCryptography.ReasonTampered, store.LastError);
            Assert.IsTrue(File.Exists(_storePath), "and it must be LEFT ALONE, not overwritten");
        }

        [Test]
        public void AStoreWithNoUsableKeyringRefusesRatherThanDowngradingToPlaintext()
        {
            // A keyring path whose parent is a FILE cannot be created. This is the
            // environmental failure the design has to answer for, and the answer is
            // to refuse: a credential written in the clear because a directory was
            // missing is invisible, and invisible is what a readable credential must
            // never be.
            string blocker = Path.Combine(_keyringDir, "not_a_directory");
            File.WriteAllText(blocker, "occupied");
            var store = new FearEncryptedSessionStore(_storePath, Path.Combine(blocker, "keyring"));

            Assert.IsFalse(store.SaveWithSigningKey(SessionName, Token, KeyText),
                "the write must be REFUSED when the keyring cannot be used");
            Assert.IsFalse(string.IsNullOrEmpty(store.LastError), "and it must say why");
            Assert.IsFalse(File.Exists(_storePath),
                "NO PLAINTEXT FALLBACK: the store file must not exist at all");
        }

        [Test]
        public void ThePlaintextOptOutCannotBeReachedThroughAMalformedKeyring()
        {
            // The opt-out is deliberately NARROW - only "no keyring path at all" - so
            // a keyring that exists but will not parse must still refuse, because that
            // one may be recoverable and abandoning it silently would cost the host a
            // store it can still read.
            File.WriteAllText(_keyringPath, "FEAR-AI-KEYRING-V1\nkey=tooshort\n");
            var store = NewStore();
            store.AllowPlaintext = true;
            Assert.IsFalse(store.SaveWithSigningKey(SessionName, Token, KeyText),
                "a malformed keyring must not be a route to writing plaintext");
            Assert.AreEqual(FearStoreCryptography.ReasonKeyringMalformed, store.LastError);
            Assert.IsFalse(File.Exists(_storePath));
        }

        [Test]
        public void ANameThatWouldCorruptTheFormatIsRefused()
        {
            var store = NewStore();
            Assert.IsFalse(store.SaveWithSigningKey("host\nwith_newlines", Token, KeyText));
            Assert.IsFalse(File.Exists(_storePath));
            Assert.IsNull(FearStoreCryptography.ParseKeyringText("FEAR-AI-KEYRING-V1\nkey=AAAA\n"),
                "a truncated keyring must be refused rather than deriving a short key");
        }

        // ------------------------------------------------------------------
        // The upgrade path a real host takes.
        // ------------------------------------------------------------------

        [Test]
        public void ALegacyPlaintextStoreIsReadReportedAndUpgradedInPlace()
        {
            // What an older build of `FileSessionStore` left behind.
            File.WriteAllText(_storePath,
                "{\"session_id\":\"" + SessionName + "\",\"session_token\":\"" + Token + "\",\"saved_at_unix\":1758400000}");

            var store = NewStore();
            Assert.IsTrue(store.TryLoad(out var id, out var token),
                "a credential that is already exposed is not made safer by being unreadable to its owner");
            Assert.AreEqual(SessionName, id);
            Assert.AreEqual(Token, token);
            Assert.AreEqual(FearEncryptedSessionStore.ProtectionPlaintextLegacy, store.Protection,
                "the format must be REPORTED, or a host never notices its store is readable on disk");
            Assert.IsTrue(store.FileExposesSecrets(Token, ""),
                "the diagnostic must agree that the legacy file DOES expose the credential");

            // THE upgrade, through the same call the client makes on the next
            // credential issue: no separate migration step for a host to remember.
            var fresh = NewStore();
            Assert.IsTrue(fresh.TryLoad(out _, out _));
            Assert.IsTrue(fresh.SaveWithSigningKey(SessionName, Token, KeyText), fresh.LastError);
            Assert.AreEqual(FearEncryptedSessionStore.ProtectionEncrypted, fresh.Protection);
            Assert.IsFalse(fresh.FileExposesSecrets(Token, KeyText), "after the upgrade the file exposes nothing");

            // And the upgrade costs the host nothing.
            Assert.IsTrue(NewStore().TryLoadWithSigningKey(out var againId, out var againToken, out var againKey));
            Assert.AreEqual(SessionName, againId);
            Assert.AreEqual(Token, againToken);
            Assert.AreEqual(KeyText, againKey);
        }

        [Test]
        public void ClearRemovesTheStoreAndNotTheKeyring()
        {
            var store = NewStore();
            Assert.IsTrue(store.SaveWithSigningKey(SessionName, Token, KeyText));
            store.Clear();
            Assert.IsFalse(File.Exists(_storePath));
            Assert.IsFalse(store.HasStoredSession);
            Assert.AreEqual(FearEncryptedSessionStore.ProtectionNone, store.Protection);
            // The keyring is deliberately NOT deleted: other sessions on this machine
            // may still need it, and a host that wants it gone can remove it itself.
            Assert.IsTrue(File.Exists(_keyringPath));
        }
    }
}
