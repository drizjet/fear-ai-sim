using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using System.Text;

namespace FearAI
{
    /// <summary>
    /// What a store carries. `SigningKeyText` is the host's private signing key in
    /// <see cref="FearRequestSigner.ExportPrivateKeyText"/> form, or empty.
    /// </summary>
    public sealed class FearStoreRecord
    {
        public string SessionId = "";
        public string SessionToken = "";
        public string SigningKeyText = "";
        public string SigningPublicKeyPem = "";
        public long SavedAtUnix;
    }

    /// <summary>
    /// The encrypted store container: one file, unreadable without a keyring kept
    /// somewhere else, byte-compatible with the Node reference and the Godot
    /// adapter.
    ///
    /// WHY THIS EXISTS
    /// <see cref="FileSessionStore"/> and <see cref="PlayerPrefsSessionStore"/> write
    /// the credential in the clear, and <see cref="FearRequestSigner.ExportPrivateKeyText"/>
    /// is likewise plaintext. Between them that is a complete, copyable identity
    /// sitting in the game's data directory - which is inside every backup, every
    /// synced folder and every support bundle. A private key in the clear does not
    /// merely risk the crowd; it makes the `required` signing policy pointless
    /// against whoever has the file.
    ///
    /// WHAT IT BUYS, WITHOUT EMBELLISHMENT
    ///   1. RELOCATION. A copy of the store is inert without the keyring, and the
    ///      keyring is not in the same directory tree. This is the leak that
    ///      actually happens: not an attacker with a shell, but a folder that gets
    ///      copied somewhere it should not be.
    ///   2. CASUAL INSPECTION. Searching a support bundle finds no credential and
    ///      no PEM banner.
    ///   3. TAMPERING BY EDITING. The envelope is authenticated, so a hand-edited
    ///      store is refused instead of half-honoured.
    /// It does NOT defend against someone who can read BOTH files on the same
    /// machine; that person can decrypt it. There is no hardware backing and no OS
    /// keystore. Any claim stronger than "the file does not travel" would be false.
    ///
    /// WHY THERE IS NO UnityEngine DEPENDENCY HERE
    /// So this file can be compiled and EXECUTED outside the Editor, by the store
    /// interop probe, and byte-compared against the Node and Godot writers. The
    /// Editor is not available on the machine this repository is developed on, so a
    /// container that could only be exercised inside Unity would be a container
    /// nobody could check. The Unity-facing store that implements
    /// <see cref="ISessionStore"/> lives in FearSessionStore.cs; only path defaults
    /// differ, and a host that wants Unity's persistent data path passes it in.
    ///
    /// THE FORMAT (line-based, LF endings, no optional whitespace)
    ///   FEAR-AI-STORE-V1
    ///   kdf=pbkdf2-hmac-sha256
    ///   iter=&lt;integer&gt;
    ///   salt=&lt;base64, 16 bytes&gt;
    ///   cipher=aes-256-cbc
    ///   iv=&lt;base64, 16 bytes&gt;
    ///   name=&lt;the session NAME, deliberately in the clear&gt;
    ///   ct=&lt;base64&gt;
    ///   mac=&lt;base64, 32 bytes&gt;
    ///
    /// The MAC covers every byte from the start of the file through the newline
    /// that ends the `ct=` line - encrypt-then-MAC over the exact text, compared in
    /// constant time. `iter` is READ FROM THE FILE, never assumed.
    ///
    /// `name` IS DELIBERATELY PLAINTEXT: the ownership model already rests on a name
    /// not being a credential, so keeping it readable costs nothing and answers the
    /// first question anyone asks of a stray store - which host is this? It is still
    /// inside the MAC, so it cannot be edited.
    ///
    /// THREE INTEROP TRAPS, ALL FOUND BY RUNNING IT RATHER THAN READING IT
    ///   1. PADDING IS THE CALLER'S JOB. Node pads automatically and Godot does not
    ///      (its AESContext returns ZERO BYTES for a non-block-multiple rather than
    ///      erroring). Here `PaddingMode.None` plus explicit PKCS#7 keeps one source
    ///      of truth for the bytes.
    ///   2. The MAC covers the text AS SENT, not a rebuild of it, so `Encrypt`
    ///      returns the finished text and `Decrypt` hashes the bytes it was handed.
    ///   3. JSON KEY ORDER IS NOT PORTABLE. Godot sorts object keys by default; Node
    ///      emits insertion order. Keys, values and length were all correct and the
    ///      ciphertext still diverged from its second base64 character - which reads
    ///      exactly like "the other side used a different key". So the payload is
    ///      built here in SORTED key order by hand, matching the Node canonicaliser
    ///      and Godot's explicit `sort_keys = true`. Only bytes INSIDE the ciphertext
    ///      are affected, so older containers still open.
    /// </summary>
    public static class FearStoreCryptography
    {
        public const string StoreVersion = "FEAR-AI-STORE-V1";
        public const string KeyringVersion = "FEAR-AI-KEYRING-V1";
        public const string Kdf = "pbkdf2-hmac-sha256";
        public const string Cipher = "aes-256-cbc";

        /// <summary>Iteration count this writer uses. A reader always obeys the
        /// file's own `iter`. The default key is 256 random bits, where the count is
        /// not load-bearing; it matters only for a host-supplied passphrase.</summary>
        public const int DefaultIterations = 60000;

        public const int SaltBytes = 16;
        public const int IvBytes = 16;
        public const int KeyringKeyBytes = 32;
        public const int MacBytes = 32;
        private const int BlockBytes = 16;

        // Stable reasons a store can fail, so a host reports WHY and not just "no".
        public const string ReasonMissing = "STORE_MISSING";
        public const string ReasonUnreadable = "STORE_UNREADABLE";
        public const string ReasonMalformed = "STORE_MALFORMED";
        public const string ReasonUnsupportedVersion = "STORE_UNSUPPORTED_VERSION";
        public const string ReasonUnsupportedKdf = "STORE_UNSUPPORTED_KDF";
        public const string ReasonUnsupportedCipher = "STORE_UNSUPPORTED_CIPHER";
        public const string ReasonTampered = "STORE_TAMPERED";
        public const string ReasonWrongKey = "STORE_WRONG_KEY";
        public const string ReasonKeyringMalformed = "KEYRING_MALFORMED";
        public const string ReasonKeyringUnavailable = "KEYRING_UNAVAILABLE";
        public const string ReasonNameNotEncodable = "STORE_NAME_NOT_ENCODABLE";

        /// <summary>Result of a container operation: `Ok`, and either `Text`/`Record`
        /// or `Reason`.</summary>
        public sealed class StoreResult
        {
            public bool Ok;
            public string Reason = "";
            /// <summary>Base64 of the keyring key, for the keyring operations.</summary>
            public string Text = "";
            /// <summary>True when a keyring was CREATED rather than loaded, so a host
            /// can tell "first run" from "the key is already here".</summary>
            public bool Created;
            public FearStoreRecord Record;
        }

        // ------------------------------------------------------------------
        // The container.
        // ------------------------------------------------------------------

        /// <summary>Encrypt a record into the store text.</summary>
        public static StoreResult Encrypt(string name, FearStoreRecord record, byte[] password,
            int iterations = DefaultIterations, byte[] salt = null, byte[] iv = null)
        {
            if (string.IsNullOrEmpty(name) || name.Contains("\n") || name.Contains("\r"))
            {
                // A newline in the name would corrupt a line-based format, and the
                // failure would surface as "the store will not open" with no hint why.
                return new StoreResult { Ok = false, Reason = ReasonNameNotEncodable };
            }
            var actualSalt = salt ?? RandomBytes(SaltBytes);
            var actualIv = iv ?? RandomBytes(IvBytes);
            if (actualSalt.Length != SaltBytes || actualIv.Length != IvBytes)
            {
                return new StoreResult { Ok = false, Reason = ReasonMalformed };
            }

            var keys = DeriveKeys(password, actualSalt, iterations);
            string plaintext = CanonicalPayload(name, record);
            byte[] ciphertext = AesCbc(true, keys.Aes, actualIv,
                Pkcs7Pad(Encoding.UTF8.GetBytes(plaintext)));
            if (ciphertext.Length == 0) return new StoreResult { Ok = false, Reason = ReasonUnreadable };

            var builder = new StringBuilder();
            builder.Append(StoreVersion).Append('\n');
            builder.Append("kdf=").Append(Kdf).Append('\n');
            builder.Append("iter=").Append(iterations.ToString(CultureInfo.InvariantCulture)).Append('\n');
            builder.Append("salt=").Append(Convert.ToBase64String(actualSalt)).Append('\n');
            builder.Append("cipher=").Append(Cipher).Append('\n');
            builder.Append("iv=").Append(Convert.ToBase64String(actualIv)).Append('\n');
            builder.Append("name=").Append(name).Append('\n');
            builder.Append("ct=").Append(Convert.ToBase64String(ciphertext)).Append('\n');
            string header = builder.ToString();

            byte[] mac = Hmac(keys.Mac, Encoding.UTF8.GetBytes(header));
            return new StoreResult
            {
                Ok = true,
                Text = header + "mac=" + Convert.ToBase64String(mac) + "\n"
            };
        }

        /// <summary>Verify and decrypt store text. The MAC is checked BEFORE
        /// anything is decrypted, so an edited field is refused as TAMPERED rather
        /// than producing plausible garbage.</summary>
        public static StoreResult Decrypt(string text, byte[] password)
        {
            if (string.IsNullOrEmpty(text)) return new StoreResult { Ok = false, Reason = ReasonMalformed };

            // The MAC input is the text up to and including the LF before `mac=`,
            // which is why `mac=` must be the last field: slicing the actual text
            // rather than rebuilding it removes any chance of a whitespace or
            // ordering disagreement between runtimes.
            int marker = text.IndexOf("\nmac=", StringComparison.Ordinal);
            if (marker < 0) return new StoreResult { Ok = false, Reason = ReasonMalformed };
            string macInput = text.Substring(0, marker + 1);

            var lines = text.Split('\n');
            if (lines.Length == 0 || lines[0] != StoreVersion)
            {
                return new StoreResult { Ok = false, Reason = ReasonUnsupportedVersion };
            }

            var fields = new Dictionary<string, string>(StringComparer.Ordinal);
            for (int i = 1; i < lines.Length; i++)
            {
                var line = lines[i];
                if (line.Length == 0) continue;
                if (line.StartsWith("mac=", StringComparison.Ordinal)) break;
                int equals = line.IndexOf('=');
                if (equals <= 0) continue;
                fields[line.Substring(0, equals)] = line.Substring(equals + 1);
            }

            if (Get(fields, "kdf") != Kdf) return new StoreResult { Ok = false, Reason = ReasonUnsupportedKdf };
            if (Get(fields, "cipher") != Cipher) return new StoreResult { Ok = false, Reason = ReasonUnsupportedCipher };
            int iterations;
            if (!int.TryParse(Get(fields, "iter"), NumberStyles.Integer, CultureInfo.InvariantCulture, out iterations)
                || iterations < 1)
            {
                return new StoreResult { Ok = false, Reason = ReasonMalformed };
            }

            byte[] salt, iv, ciphertext, presentedMac;
            try
            {
                salt = Convert.FromBase64String(Get(fields, "salt"));
                iv = Convert.FromBase64String(Get(fields, "iv"));
                ciphertext = Convert.FromBase64String(Get(fields, "ct"));
                presentedMac = Convert.FromBase64String(text.Substring(marker + 5).Trim());
            }
            catch (FormatException)
            {
                return new StoreResult { Ok = false, Reason = ReasonMalformed };
            }
            if (salt.Length != SaltBytes || iv.Length != IvBytes || presentedMac.Length != MacBytes)
            {
                return new StoreResult { Ok = false, Reason = ReasonMalformed };
            }
            if (ciphertext.Length == 0 || ciphertext.Length % BlockBytes != 0)
            {
                return new StoreResult { Ok = false, Reason = ReasonMalformed };
            }

            var keys = DeriveKeys(password, salt, iterations);
            byte[] expectedMac = Hmac(keys.Mac, Encoding.UTF8.GetBytes(macInput));
            if (!ConstantTimeEquals(expectedMac, presentedMac))
            {
                // Deliberately ONE reason for "wrong key" and "edited file": telling
                // them apart would confirm which of the two a caller has, and the MAC
                // is what makes them indistinguishable in the first place.
                return new StoreResult { Ok = false, Reason = ReasonTampered };
            }

            byte[] padded = AesCbc(false, keys.Aes, iv, ciphertext);
            if (padded.Length == 0) return new StoreResult { Ok = false, Reason = ReasonWrongKey };
            byte[] plaintext = Pkcs7Unpad(padded);
            if (plaintext == null) return new StoreResult { Ok = false, Reason = ReasonWrongKey };

            string json = Encoding.UTF8.GetString(plaintext);
            var record = ParseCanonicalPayload(json);
            if (record == null) return new StoreResult { Ok = false, Reason = ReasonWrongKey };
            return new StoreResult { Ok = true, Record = record };
        }

        /// <summary>The session NAME from store text without needing the key. This is
        /// the affordance the plaintext `name=` line buys, and it deliberately
        /// returns only the name.</summary>
        public static string ReadName(string text)
        {
            if (string.IsNullOrEmpty(text)) return "";
            foreach (var line in text.Split('\n'))
            {
                if (line.StartsWith("name=", StringComparison.Ordinal)) return line.Substring(5);
            }
            return "";
        }

        /// <summary>True when the text is this container rather than a legacy
        /// plaintext store.</summary>
        public static bool LooksEncrypted(string text)
        {
            return !string.IsNullOrEmpty(text) && text.StartsWith(StoreVersion, StringComparison.Ordinal);
        }

        // ------------------------------------------------------------------
        // The keyring.
        // ------------------------------------------------------------------

        /// <summary>
        /// Where the keyring lives when a host does not say.
        ///
        /// A user-scoped CONFIGURATION path, deliberately NOT Unity's
        /// `Application.persistentDataPath` - which is the game's own data tree, and
        /// therefore the thing that gets backed up. Returns "" when the platform
        /// gives no usable directory, and callers then REFUSE to write rather than
        /// falling back to plaintext beside the store: a silent downgrade is worse
        /// than a reported failure.
        /// </summary>
        public static string ResolveKeyringPath(string over = null)
        {
            if (!string.IsNullOrEmpty(over)) return over;
            string fromEnvironment = Environment.GetEnvironmentVariable("FEAR_AI_KEYRING");
            if (!string.IsNullOrEmpty(fromEnvironment)) return fromEnvironment;

            string home = Environment.GetEnvironmentVariable("HOME")
                ?? Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (Path.DirectorySeparatorChar == '\\')
            {
                string appData = Environment.GetEnvironmentVariable("APPDATA")
                    ?? Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                if (string.IsNullOrEmpty(appData)) return "";
                return Path.Combine(appData, "FearAI", "keyring");
            }
            if (Environment.OSVersion.Platform == PlatformID.MacOSX)
            {
                if (string.IsNullOrEmpty(home)) return "";
                return Path.Combine(home, "Library", "Application Support", "FearAI", "keyring");
            }
            string configHome = Environment.GetEnvironmentVariable("XDG_CONFIG_HOME");
            if (!string.IsNullOrEmpty(configHome)) return Path.Combine(configHome, "fear-ai", "keyring");
            if (string.IsNullOrEmpty(home)) return "";
            return Path.Combine(home, ".config", "fear-ai", "keyring");
        }

        /// <summary>
        /// Read a keyring, or create one. A malformed keyring is REPORTED and NOT
        /// overwritten: it may be the only copy of a key that is still valid, and
        /// silently replacing it would destroy the ability to read a store sitting
        /// right there.
        /// </summary>
        public static StoreResult LoadOrCreateKeyring(string keyringPath)
        {
            if (string.IsNullOrEmpty(keyringPath))
            {
                return new StoreResult { Ok = false, Reason = ReasonKeyringUnavailable };
            }
            if (File.Exists(keyringPath))
            {
                byte[] existing;
                try
                {
                    existing = ParseKeyringText(File.ReadAllText(keyringPath));
                }
                catch (IOException)
                {
                    return new StoreResult { Ok = false, Reason = ReasonUnreadable };
                }
                if (existing == null)
                {
                    return new StoreResult { Ok = false, Reason = ReasonKeyringMalformed };
                }
                return new StoreResult { Ok = true, Text = Convert.ToBase64String(existing), Created = false };
            }

            byte[] fresh = RandomBytes(KeyringKeyBytes);
            try
            {
                var directory = Path.GetDirectoryName(keyringPath);
                if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);
                File.WriteAllText(keyringPath, CreateKeyringText(fresh));
            }
            catch (Exception)
            {
                return new StoreResult { Ok = false, Reason = ReasonUnreadable };
            }
            return new StoreResult { Ok = true, Text = Convert.ToBase64String(fresh), Created = true };
        }

        public static string CreateKeyringText(byte[] key)
        {
            return KeyringVersion + "\n"
                + "key=" + Convert.ToBase64String(key) + "\n"
                + "created_unix=" + UnixNow().ToString(CultureInfo.InvariantCulture) + "\n";
        }

        /// <summary>The key from keyring text, or null when it is not usable.
        /// Length-checked, because a truncated keyring would otherwise derive a short
        /// key and fail much later, looking like a wrong passphrase.</summary>
        public static byte[] ParseKeyringText(string text)
        {
            if (string.IsNullOrEmpty(text)) return null;
            var lines = text.Split('\n');
            if (lines.Length == 0 || lines[0] != KeyringVersion) return null;
            for (int i = 1; i < lines.Length; i++)
            {
                if (!lines[i].StartsWith("key=", StringComparison.Ordinal)) continue;
                byte[] key;
                try
                {
                    key = Convert.FromBase64String(lines[i].Substring(4));
                }
                catch (FormatException)
                {
                    return null;
                }
                return key.Length == KeyringKeyBytes ? key : null;
            }
            return null;
        }

        // ------------------------------------------------------------------
        // Primitives.
        // ------------------------------------------------------------------

        internal sealed class StoreKeys
        {
            public byte[] Master;
            public byte[] Aes;
            public byte[] Mac;
        }

        /// <summary>
        /// PBKDF2-HMAC-SHA256, single 32-byte block.
        ///
        /// Hand-rolled on purpose: the `Rfc2898DeriveBytes` constructor that takes a
        /// `HashAlgorithmName` is .NET Standard 2.1, and this adapter compiles against
        /// netstandard2.0 in the standalone client, so the convenient overload is not
        /// available where it needs to run. The block index is a BIG-ENDIAN 32-bit 1
        /// (PBKDF2's INT(i)); a little-endian index or an off-by-one in the loop
        /// produces a key that is simply wrong, and "wrong key" is indistinguishable
        /// from "corrupt file" at the other end.
        /// </summary>
        internal static byte[] Pbkdf2Sha256(byte[] password, byte[] salt, int iterations)
        {
            using (var hmac = new HMACSHA256(password ?? new byte[0]))
            {
                var block = new byte[salt.Length + 4];
                Buffer.BlockCopy(salt, 0, block, 0, salt.Length);
                block[salt.Length + 3] = 1;
                byte[] u = hmac.ComputeHash(block);
                var result = (byte[])u.Clone();
                for (int i = 1; i < Math.Max(1, iterations); i++)
                {
                    u = hmac.ComputeHash(u);
                    for (int j = 0; j < result.Length; j++) result[j] ^= u[j];
                }
                return result;
            }
        }

        /// <summary>One master key, split into two by LABELLED HMACs. Deliberately
        /// not "ask PBKDF2 for 64 bytes": a two-block PBKDF2 output is fiddly to
        /// reproduce by hand in GDScript, and that is exactly where a cross-language
        /// mismatch would hide.</summary>
        internal static StoreKeys DeriveKeys(byte[] password, byte[] salt, int iterations)
        {
            byte[] master = Pbkdf2Sha256(password, salt, iterations);
            return new StoreKeys
            {
                Master = master,
                Aes = Hmac(master, Encoding.UTF8.GetBytes("fear-ai-store/aes")),
                Mac = Hmac(master, Encoding.UTF8.GetBytes("fear-ai-store/mac"))
            };
        }

        internal static byte[] Hmac(byte[] key, byte[] message)
        {
            using (var hmac = new HMACSHA256(key))
            {
                return hmac.ComputeHash(message ?? new byte[0]);
            }
        }

        /// <summary>PKCS#7, applied by hand. Always pads, even for an exact block
        /// multiple: a whole block of 0x10 is unambiguous on removal.</summary>
        internal static byte[] Pkcs7Pad(byte[] bytes)
        {
            int pad = BlockBytes - (bytes.Length % BlockBytes);
            var padded = new byte[bytes.Length + pad];
            Buffer.BlockCopy(bytes, 0, padded, 0, bytes.Length);
            for (int i = bytes.Length; i < padded.Length; i++) padded[i] = (byte)pad;
            return padded;
        }

        /// <summary>Remove PKCS#7 padding, or null when it is not well formed.</summary>
        internal static byte[] Pkcs7Unpad(byte[] bytes)
        {
            if (bytes.Length == 0 || bytes.Length % BlockBytes != 0) return null;
            int pad = bytes[bytes.Length - 1];
            if (pad < 1 || pad > BlockBytes) return null;
            for (int i = bytes.Length - pad; i < bytes.Length; i++)
            {
                if (bytes[i] != pad) return null;
            }
            var result = new byte[bytes.Length - pad];
            Buffer.BlockCopy(bytes, 0, result, 0, result.Length);
            return result;
        }

        /// <summary>AES-256-CBC with NO library padding, so the padding convention
        /// cannot differ between runtimes.</summary>
        internal static byte[] AesCbc(bool encrypt, byte[] key, byte[] iv, byte[] input)
        {
            try
            {
                using (var aes = Aes.Create())
                {
                    aes.Key = key;
                    aes.IV = iv;
                    aes.Mode = CipherMode.CBC;
                    aes.Padding = PaddingMode.None;
                    using (var transform = encrypt ? aes.CreateEncryptor() : (ICryptoTransform)aes.CreateDecryptor())
                    {
                        return transform.TransformFinalBlock(input, 0, input.Length);
                    }
                }
            }
            catch (CryptographicException)
            {
                return new byte[0];
            }
        }

        /// <summary>Length-independent comparison, so a MAC cannot be probed byte by
        /// byte.</summary>
        internal static bool ConstantTimeEquals(byte[] a, byte[] b)
        {
            if (a == null || b == null || a.Length != b.Length) return false;
            int diff = 0;
            for (int i = 0; i < a.Length; i++) diff |= a[i] ^ b[i];
            return diff == 0;
        }

        /// <summary>Random bytes from an INSTANCE generator: the static
        /// `RandomNumberGenerator.GetBytes(int)` is .NET Core 3.0+.</summary>
        internal static byte[] RandomBytes(int count)
        {
            var buffer = new byte[count];
            using (var rng = RandomNumberGenerator.Create())
            {
                rng.GetBytes(buffer);
            }
            return buffer;
        }

        internal static long UnixNow()
        {
            return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalSeconds;
        }

        private static string Get(Dictionary<string, string> fields, string key)
        {
            string value;
            return fields.TryGetValue(key, out value) ? value : "";
        }

        // ------------------------------------------------------------------
        // The encrypted payload, canonicalised.
        // ------------------------------------------------------------------

        /// <summary>
        /// The JSON inside the ciphertext, built with keys in SORTED order.
        ///
        /// See trap 3: Godot's `JSON.stringify` sorts by default and Node emits
        /// insertion order, which produced two different ciphertexts from identical
        /// plaintext maps. Sorting is chosen as the canonical form because insertion
        /// order is a property of a caller's dictionary, not of the format.
        ///
        /// Built by hand rather than with a serializer for the same reason the
        /// signing key format is: `JsonUtility` cannot order keys, and a dependency
        /// on a JSON library in a file that has to compile in the standalone client
        /// would be a new dependency for six string fields.
        /// </summary>
        internal static string CanonicalPayload(string name, FearStoreRecord record)
        {
            var builder = new StringBuilder();
            builder.Append('{');
            builder.Append("\"saved_at_unix\":")
                .Append((record.SavedAtUnix != 0 ? record.SavedAtUnix : UnixNow())
                    .ToString(CultureInfo.InvariantCulture));
            builder.Append(",\"session_id\":").Append(JsonString(name ?? ""));
            builder.Append(",\"session_token\":").Append(JsonString(record.SessionToken ?? ""));
            builder.Append(",\"signing_private_key\":").Append(JsonString(record.SigningKeyText ?? ""));
            builder.Append(",\"signing_public_key\":").Append(JsonString(record.SigningPublicKeyPem ?? ""));
            builder.Append(",\"v\":1}");
            return builder.ToString();
        }

        /// <summary>
        /// Read a LEGACY plaintext record, which is what an older build of this
        /// adapter left behind (`JsonUtility.ToJson` of a
        /// `SessionRecord`).
        ///
        /// Read rather than rejected, because refusing it would cost a real host the
        /// credential it already has for no security benefit - the file is already
        /// exposed, and a file is not made safer by being unreadable to its owner.
        /// The caller reports the format and rewrites it encrypted on the next save.
        /// Returns null when the text is not an object at all.
        /// </summary>
        internal static FearStoreRecord ParseLegacyJson(string text)
        {
            if (string.IsNullOrEmpty(text)) return null;
            string trimmed = text.TrimStart();
            if (trimmed.Length == 0 || trimmed[0] != '{') return null;
            return ParseCanonicalPayload(trimmed);
        }

        /// <summary>Read the payload back. Order-independent, because a reader is
        /// allowed to be: only the writer's canonical form is fixed.</summary>
        internal static FearStoreRecord ParseCanonicalPayload(string json)
        {
            if (string.IsNullOrEmpty(json) || json[0] != '{') return null;
            return new FearStoreRecord
            {
                SessionId = JsonField(json, "session_id"),
                SessionToken = JsonField(json, "session_token"),
                SigningKeyText = JsonField(json, "signing_private_key"),
                SigningPublicKeyPem = JsonField(json, "signing_public_key"),
                SavedAtUnix = ParseLong(JsonField(json, "saved_at_unix"))
            };
        }

        /// <summary>
        /// Escape a string exactly as `JSON.stringify` and Godot's encoder do, because
        /// the bytes go inside a MAC: a different escaping is a different ciphertext.
        ///
        /// Deliberately NOT escaped: `/` and everything above 0x1F, which both other
        /// runtimes emit raw. This is the same class of defect that the Unity
        /// behavioural harness already caught once, where an escaper that ignored
        /// newlines turned a multi-line PEM into invalid JSON - so the control
        /// characters are handled explicitly rather than assumed away.
        /// </summary>
        internal static string JsonString(string value)
        {
            var builder = new StringBuilder(value.Length + 2);
            builder.Append('"');
            foreach (char c in value)
            {
                switch (c)
                {
                    case '"': builder.Append("\\\""); break;
                    case '\\': builder.Append("\\\\"); break;
                    case '\b': builder.Append("\\b"); break;
                    case '\f': builder.Append("\\f"); break;
                    case '\n': builder.Append("\\n"); break;
                    case '\r': builder.Append("\\r"); break;
                    case '\t': builder.Append("\\t"); break;
                    default:
                        if (c < 0x20)
                        {
                            builder.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        }
                        else
                        {
                            builder.Append(c);
                        }
                        break;
                }
            }
            builder.Append('"');
            return builder.ToString();
        }

        /// <summary>
        /// Pull one top-level string field out of the payload.
        ///
        /// A deliberately small scanner rather than a JSON parser: the payload is
        /// produced by this repository in three languages, always flat, and always
        /// with string or integer values. Anything else is refused by returning "",
        /// which the caller treats as an unusable store.
        /// </summary>
        private static string JsonField(string json, string name)
        {
            string needle = "\"" + name + "\":";
            int at = json.IndexOf(needle, StringComparison.Ordinal);
            if (at < 0) return "";
            at += needle.Length;
            if (at >= json.Length) return "";
            if (json[at] == '"')
            {
                var builder = new StringBuilder();
                for (int i = at + 1; i < json.Length; i++)
                {
                    char c = json[i];
                    if (c == '\\' && i + 1 < json.Length)
                    {
                        char next = json[++i];
                        switch (next)
                        {
                            case 'n': builder.Append('\n'); break;
                            case 'r': builder.Append('\r'); break;
                            case 't': builder.Append('\t'); break;
                            case 'b': builder.Append('\b'); break;
                            case 'f': builder.Append('\f'); break;
                            case 'u':
                                if (i + 4 < json.Length
                                    && int.TryParse(json.Substring(i + 1, 4), NumberStyles.HexNumber,
                                        CultureInfo.InvariantCulture, out int code))
                                {
                                    builder.Append((char)code);
                                    i += 4;
                                }
                                break;
                            default: builder.Append(next); break;
                        }
                        continue;
                    }
                    if (c == '"') break;
                    builder.Append(c);
                }
                return builder.ToString();
            }
            int end = at;
            while (end < json.Length && json[end] != ',' && json[end] != '}') end++;
            return json.Substring(at, end - at);
        }

        private static long ParseLong(string value)
        {
            long parsed;
            return long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out parsed) ? parsed : 0;
        }
    }
}
