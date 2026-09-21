using System;
using System.IO;
using UnityEngine;

namespace FearAI
{
    /// <summary>
    /// Where a host keeps its session credential between runs.
    ///
    /// WHY THIS IS AN INTERFACE AND NOT JUST A FILE PATH
    /// The credential is a bearer token: a host that can prove continuity can
    /// claim its own crowd, and a host that cannot gets to adopt it only once the
    /// previous session is not live. That means two hosts with the same job need
    /// opposite answers - a build farm wants an in-memory store so every process
    /// is a fresh arrival, while a single machine that crashed wants the token on
    /// disk - and a shipped game needs its own decision (PlayerPrefs, a save slot)
    /// without forking the client. So storage is an injected strategy, and the
    /// default is the one that cannot leak.
    ///
    /// WHAT THE INTERFACE ITSELF DOES NOT DO
    /// It does not encrypt, and this remains true of <see cref="FileSessionStore"/>
    /// and <see cref="PlayerPrefsSessionStore"/>: both write the credential in the
    /// clear, and their docs say so. Anyone who can read those can impersonate the
    /// session until it is revoked or goes stale. Encryption is a PROPERTY OF THE
    /// IMPLEMENTATION rather than of the interface, which is why
    /// <see cref="FearEncryptedSessionStore"/> exists and why it is the store a host
    /// with anywhere to keep a keyring should choose. The honest default is still
    /// <see cref="InMemorySessionStore"/>: persistence is opt-in, and a host with
    /// nowhere safe to put a credential should not create one.
    /// </summary>
    public interface ISessionStore
    {
        /// <summary>True when a stored identity exists to load.</summary>
        bool HasStoredSession { get; }

        /// <summary>Read the stored identity. Returns false when nothing usable is stored.</summary>
        bool TryLoad(out string sessionId, out string sessionToken);

        /// <summary>Write the identity. Called the moment the server issues or rotates one.</summary>
        void Save(string sessionId, string sessionToken);

        /// <summary>Forget the identity. The host keeps whatever it holds in memory.</summary>
        void Clear();
    }

    /// <summary>
    /// A store that can also carry the host's PRIVATE SIGNING KEY, and say how the
    /// file on disk is actually protected.
    ///
    /// WHY A SEPARATE INTERFACE RATHER THAN MORE PARAMETERS ON ISessionStore
    /// Most hosts persist nothing, and of those that do, most do not sign. Widening
    /// <see cref="ISessionStore"/> would force every existing store - including a
    /// host's own implementations - to carry a key they never use. A store opts in by
    /// implementing this, and <see cref="FearAIClient"/> uses it when present.
    ///
    /// This is the case that matters most, not a nicety: a private key left readable
    /// on disk makes the `required` signing policy pointless against whoever has the
    /// file, and a host that cannot restore its key after a restart can no longer
    /// PROVE itself, only name itself.
    /// </summary>
    public interface ISecretSessionStore : ISessionStore
    {
        /// <summary>
        /// How the file on disk is protected, as this process last observed it.
        /// Reported as a value rather than inferred from "persistence is on", because
        /// a setting says nothing about whether the file is readable:
        ///   ENCRYPTED             credential and key are ciphertext (the default)
        ///   PLAINTEXT_LEGACY      an older build's plaintext file was LOADED; the next
        ///                         save rewrites it encrypted
        ///   PLAINTEXT_BY_REQUEST  the host explicitly opted out
        ///   NONE                  nothing has been read or written this process
        /// </summary>
        string Protection { get; }

        /// <summary>Read the identity AND any stored signing key. Returns false when
        /// nothing usable is stored.</summary>
        bool TryLoadWithSigningKey(out string sessionId, out string sessionToken, out string signingKeyText);

        /// <summary>Write the identity and the signing key together, so the two can
        /// never be persisted half-way.</summary>
        bool SaveWithSigningKey(string sessionId, string sessionToken, string signingKeyText);
    }

    /// <summary>Serialization shape for the file store. JsonUtility only
    /// serializes public FIELDS on [Serializable] types.</summary>
    [Serializable]
    public class SessionRecord
    {
        public string session_id;
        public string session_token;
        public long saved_at_unix;
    }

    /// <summary>
    /// The default: nothing outlives the process.
    ///
    /// A host using this comes back as a stranger after a restart, which is not a
    /// failure - its agents are still registered, its session name is still its
    /// own, and it reclaims them by adopting once the previous session is not
    /// live. It simply cannot prove it is the same host, and this store is the
    /// honest choice when there is nowhere safe to put a bearer credential.
    /// </summary>
    public class InMemorySessionStore : ISessionStore
    {
        public string SessionId { get; private set; } = "";
        public string SessionToken { get; private set; } = "";

        public bool HasStoredSession => !string.IsNullOrEmpty(SessionToken);

        public bool TryLoad(out string sessionId, out string sessionToken)
        {
            sessionId = SessionId;
            sessionToken = SessionToken;
            return HasStoredSession;
        }

        public void Save(string sessionId, string sessionToken)
        {
            SessionId = sessionId;
            SessionToken = sessionToken;
        }

        public void Clear()
        {
            SessionId = "";
            SessionToken = "";
        }
    }

    /// <summary>
    /// A JSON file, defaulting to <c>Application.persistentDataPath</c>.
    ///
    /// Written on every credential change rather than at shutdown, because the
    /// crash is exactly the event the store exists for, and a corrupt or
    /// unreadable file is REPORTED and left alone rather than overwritten: it may
    /// be the only copy of a credential that is still valid on the server.
    /// </summary>
    public class FileSessionStore : ISessionStore
    {
        public string FilePath { get; }
        public string LastError { get; private set; } = "";

        public FileSessionStore(string filePath = null)
        {
            FilePath = string.IsNullOrEmpty(filePath)
                ? Path.Combine(Application.persistentDataPath, "fear_ai_session.json")
                : filePath;
        }

        public bool HasStoredSession => File.Exists(FilePath);

        public bool TryLoad(out string sessionId, out string sessionToken)
        {
            sessionId = "";
            sessionToken = "";
            if (!File.Exists(FilePath)) return false;
            try
            {
                var record = JsonUtility.FromJson<SessionRecord>(File.ReadAllText(FilePath));
                if (record == null || string.IsNullOrEmpty(record.session_token)) return false;
                sessionId = record.session_id ?? "";
                sessionToken = record.session_token;
                LastError = "";
                return true;
            }
            catch (Exception ex)
            {
                // Reported, not swallowed, and the file is NOT deleted.
                LastError = $"cannot read {FilePath}: {ex.Message}";
                return false;
            }
        }

        public void Save(string sessionId, string sessionToken)
        {
            try
            {
                var record = new SessionRecord
                {
                    session_id = sessionId,
                    session_token = sessionToken,
                    saved_at_unix = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
                };
                File.WriteAllText(FilePath, JsonUtility.ToJson(record));
                LastError = "";
            }
            catch (Exception ex)
            {
                LastError = $"cannot write {FilePath}: {ex.Message}";
            }
        }

        public void Clear()
        {
            try
            {
                if (File.Exists(FilePath)) File.Delete(FilePath);
                LastError = "";
            }
            catch (Exception ex)
            {
                LastError = $"cannot remove {FilePath}: {ex.Message}";
            }
        }
    }

    /// <summary>
    /// PlayerPrefs. Preferable on shipped mobile/desktop builds where a raw file
    /// path is awkward, and equivalent in trust: it is still plaintext on disk.
    ///
    /// Keys are namespaced so a host that wants two identities (a play session and
    /// a soak-test session, say) can keep them apart without a second store type.
    /// </summary>
    public class PlayerPrefsSessionStore : ISessionStore
    {
        private readonly string _idKey;
        private readonly string _tokenKey;

        public PlayerPrefsSessionStore(string storeKey = "fear_ai_session")
        {
            _idKey = $"{storeKey}.session_id";
            _tokenKey = $"{storeKey}.session_token";
        }

        public bool HasStoredSession => PlayerPrefs.HasKey(_tokenKey);

        public bool TryLoad(out string sessionId, out string sessionToken)
        {
            sessionId = PlayerPrefs.HasKey(_idKey) ? PlayerPrefs.GetString(_idKey, "") : "";
            sessionToken = PlayerPrefs.HasKey(_tokenKey) ? PlayerPrefs.GetString(_tokenKey, "") : "";
            return !string.IsNullOrEmpty(sessionToken);
        }

        public void Save(string sessionId, string sessionToken)
        {
            PlayerPrefs.SetString(_idKey, sessionId ?? "");
            PlayerPrefs.SetString(_tokenKey, sessionToken ?? "");
            // Flushed immediately for the same reason the file store writes
            // immediately: a crash is what this exists for.
            PlayerPrefs.Save();
        }

        public void Clear()
        {
            PlayerPrefs.DeleteKey(_idKey);
            PlayerPrefs.DeleteKey(_tokenKey);
            PlayerPrefs.Save();
        }
    }

    /// <summary>
    /// The credential AND the private signing key, encrypted at rest, in the container
    /// shared with the Node reference and the Godot adapter.
    ///
    /// WHAT THIS BUYS, WITHOUT EMBELLISHMENT
    /// The store alone is useless on another machine, in a backup, in a synced folder
    /// or in a repository, because the key material is not in the file and is not in
    /// the same directory tree. That is the leak that actually happens: not an
    /// attacker with a shell, but a folder copied somewhere it should not be. It is
    /// reported through <see cref="Protection"/>, which is the honest answer to "is this
    /// file readable?" rather than an inference from "persistence is on".
    ///
    /// WHAT IT DOES NOT BUY
    /// Nothing against someone who can read BOTH the store and the keyring on the same
    /// machine; that person can decrypt it. There is no hardware backing and no OS
    /// keystore, and this file sets no file permissions at all - on Windows there is no
    /// mode to set from here, and claiming otherwise is the sort of thing this
    /// repository's ledger exists to prevent.
    ///
    /// WHERE THE TWO FILES LIVE
    /// The store goes wherever the host says - `Application.persistentDataPath` by
    /// default, which is the game's own data directory and therefore inside the thing
    /// that gets backed up. The keyring goes to a user-scoped CONFIGURATION path, or to
    /// `FEAR_AI_KEYRING`; see <see cref="FearStoreCryptography.ResolveKeyringPath"/>.
    /// If no keyring path can be resolved, this store REFUSES to write instead of
    /// falling back to plaintext, because a silent downgrade is invisible and invisible
    /// is exactly what a readable credential must never be. A host that genuinely has
    /// nowhere to keep a keyring sets <see cref="AllowPlaintext"/> and then reads
    /// `PLAINTEXT_BY_REQUEST` back off <see cref="Protection"/>.
    /// </summary>
    public sealed class FearEncryptedSessionStore : ISecretSessionStore
    {
        public const string ProtectionEncrypted = "ENCRYPTED";
        public const string ProtectionPlaintextLegacy = "PLAINTEXT_LEGACY";
        public const string ProtectionPlaintextByRequest = "PLAINTEXT_BY_REQUEST";
        public const string ProtectionNone = "NONE";

        public string FilePath { get; }

        /// <summary>Where the key lives. Resolved on each use so an environment change
        /// is honoured rather than frozen at construction.</summary>
        public string KeyringPathOverride { get; set; }

        /// <summary>Write the credential in the clear when no keyring can be resolved.
        /// Off, and it should stay off.</summary>
        public bool AllowPlaintext { get; set; }

        public string Protection { get; private set; } = ProtectionNone;
        public string LastError { get; private set; } = "";
        public string KeyringUsed { get; private set; } = "";
        public bool KeyringCreated { get; private set; }

        public FearEncryptedSessionStore(string filePath, string keyringPath = null)
        {
            FilePath = string.IsNullOrEmpty(filePath)
                ? Path.Combine(Application.persistentDataPath, "fear_ai_session.enc")
                : filePath;
            KeyringPathOverride = keyringPath;
        }

        public bool HasStoredSession => File.Exists(FilePath);

        public bool TryLoad(out string sessionId, out string sessionToken)
        {
            string signingKeyText;
            return TryLoadWithSigningKey(out sessionId, out sessionToken, out signingKeyText);
        }

        /// <summary>
        /// Read the identity, and the signing key if one was stored.
        ///
        /// TWO FORMATS ARE READ, deliberately rather than tidily. A host upgrading into
        /// this build already HAS a plaintext file holding a live credential, and
        /// refusing it would cost that host its crowd for no security benefit - the
        /// credential is already exposed, and a file is not made safer by being
        /// unreadable to its owner. So the old form is read, REPORTED as
        /// PLAINTEXT_LEGACY, and rewritten encrypted on the next save, which the server
        /// triggers by itself the next time it issues or rotates a credential.
        /// </summary>
        public bool TryLoadWithSigningKey(out string sessionId, out string sessionToken, out string signingKeyText)
        {
            sessionId = "";
            sessionToken = "";
            signingKeyText = "";
            if (!File.Exists(FilePath))
            {
                LastError = FearStoreCryptography.ReasonMissing;
                return false;
            }

            string text;
            try
            {
                text = File.ReadAllText(FilePath);
            }
            catch (Exception ex)
            {
                LastError = $"{FearStoreCryptography.ReasonUnreadable}: {ex.Message}";
                return false;
            }

            FearStoreRecord record;
            if (FearStoreCryptography.LooksEncrypted(text))
            {
                var keyring = FearStoreCryptography.LoadOrCreateKeyring(EffectiveKeyringPath());
                if (!keyring.Ok)
                {
                    LastError = keyring.Reason;
                    return false;
                }
                KeyringUsed = EffectiveKeyringPath();
                KeyringCreated = keyring.Created;
                var opened = FearStoreCryptography.Decrypt(text, Convert.FromBase64String(keyring.Text));
                if (!opened.Ok)
                {
                    // Reported and LEFT ALONE. It may be the only copy of a credential
                    // still valid on the server, and a keyring that is temporarily
                    // unavailable must not turn into a destroyed store.
                    LastError = opened.Reason;
                    return false;
                }
                record = opened.Record;
                Protection = ProtectionEncrypted;
            }
            else
            {
                record = FearStoreCryptography.ParseLegacyJson(text);
                if (record == null)
                {
                    LastError = FearStoreCryptography.ReasonMalformed;
                    return false;
                }
                Protection = ProtectionPlaintextLegacy;
            }

            if (string.IsNullOrEmpty(record.SessionToken)) return false;
            sessionId = record.SessionId;
            sessionToken = record.SessionToken;
            signingKeyText = record.SigningKeyText;
            LastError = "";
            return true;
        }

        public void Save(string sessionId, string sessionToken)
        {
            SaveWithSigningKey(sessionId, sessionToken, "");
        }

        /// <summary>
        /// Write the identity and the signing key TOGETHER, so they can never be
        /// persisted half-way, and write them encrypted.
        ///
        /// The failure mode matters more than the happy path: with no usable keyring this
        /// REFUSES and reports why, rather than quietly writing plaintext. Written to a
        /// temporary file and replaced into place, because a half-written store is
        /// precisely the loss persistence exists to prevent: the crash that motivates it
        /// is also the crash that can truncate it.
        /// </summary>
        public bool SaveWithSigningKey(string sessionId, string sessionToken, string signingKeyText)
        {
            var record = new FearStoreRecord
            {
                SessionId = sessionId ?? "",
                SessionToken = sessionToken ?? "",
                SigningKeyText = signingKeyText ?? "",
                SavedAtUnix = FearStoreCryptographyUnixNow()
            };

            var keyring = FearStoreCryptography.LoadOrCreateKeyring(EffectiveKeyringPath());
            string text = null;
            if (keyring.Ok)
            {
                KeyringUsed = EffectiveKeyringPath();
                KeyringCreated = keyring.Created;
                var built = FearStoreCryptography.Encrypt(record.SessionId, record,
                    Convert.FromBase64String(keyring.Text));
                if (built.Ok)
                {
                    text = built.Text;
                    Protection = ProtectionEncrypted;
                }
                else
                {
                    LastError = built.Reason;
                    return false;
                }
            }
            else if (AllowPlaintext && keyring.Reason == FearStoreCryptography.ReasonKeyringUnavailable)
            {
                // Narrow on purpose: only an environment with no keyring path at all
                // reaches here. A keyring that exists but will not parse is refused,
                // because that one may be recoverable.
                text = LegacyJson(record);
                Protection = ProtectionPlaintextByRequest;
            }
            else
            {
                LastError = keyring.Reason;
                return false;
            }

            try
            {
                var directory = Path.GetDirectoryName(FilePath);
                if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);
                var staging = FilePath + ".tmp";
                File.WriteAllText(staging, text);
                if (File.Exists(FilePath)) File.Delete(FilePath);
                File.Move(staging, FilePath);
            }
            catch (Exception ex)
            {
                LastError = $"{FearStoreCryptography.ReasonUnreadable}: {ex.Message}";
                return false;
            }
            LastError = "";
            return true;
        }

        public void Clear()
        {
            try
            {
                if (File.Exists(FilePath)) File.Delete(FilePath);
                LastError = "";
            }
            catch (Exception ex)
            {
                LastError = $"cannot remove {FilePath}: {ex.Message}";
            }
            Protection = ProtectionNone;
        }

        /// <summary>
        /// True when the store on disk exposes the credential or the signing key.
        ///
        /// A HOST-FACING DIAGNOSTIC rather than a test hook: it is the one question an
        /// operator actually has about a persisted credential, and answering it here
        /// means the answer cannot drift from the bytes this store actually writes.
        /// </summary>
        public bool FileExposesSecrets(string sessionToken, string signingKeyText)
        {
            if (!File.Exists(FilePath)) return false;
            string text;
            try
            {
                text = File.ReadAllText(FilePath);
            }
            catch (Exception)
            {
                return false;
            }
            if (!string.IsNullOrEmpty(sessionToken) && text.Contains(sessionToken)) return true;
            if (!string.IsNullOrEmpty(signingKeyText) && text.Contains(signingKeyText)) return true;
            // The PEM banner, so a store that kept the key in some other plainly
            // labelled form is caught too.
            return text.Contains("PRIVATE KEY");
        }

        private string EffectiveKeyringPath()
        {
            return FearStoreCryptography.ResolveKeyringPath(KeyringPathOverride);
        }

        private static long FearStoreCryptographyUnixNow()
        {
            return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalSeconds;
        }

        /// <summary>The shape an older build of `FileSessionStore` wrote, kept only so
        /// that the opted-out path produces something that build could still read.</summary>
        private static string LegacyJson(FearStoreRecord record)
        {
            return "{"
                + "\"session_id\":" + FearStoreCryptography.JsonString(record.SessionId)
                + ",\"session_token\":" + FearStoreCryptography.JsonString(record.SessionToken)
                + ",\"signing_private_key\":" + FearStoreCryptography.JsonString(record.SigningKeyText)
                + ",\"saved_at_unix\":" + record.SavedAtUnix.ToString()
                + "}";
        }
    }
}
