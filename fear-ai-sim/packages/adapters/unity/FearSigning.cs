using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;

namespace FearAI
{
    /// <summary>
    /// The host side of request signing: RS256 over a canonical string, with the
    /// private key generated and kept HERE.
    ///
    /// WHY A KEY INSTEAD OF JUST THE TOKEN
    /// A session token is a bearer credential - whoever holds the string can act
    /// as this host. That is fine for a cooperating host on loopback and not fine
    /// the moment the string escapes into a log, a crash dump, a backup or another
    /// process. With a registered public key the server can require proof only the
    /// private half can produce, so a lifted token stops being sufficient.
    ///
    /// WHAT THIS IS NOT
    /// Not TLS. Payloads stay plaintext on the wire; this authenticates requests
    /// and makes them non-replayable, and it encrypts nothing.
    ///
    /// THE CANONICAL STRING (must match RequestSigning.js byte for byte)
    ///   FEAR-AI-SIGN-V1
    ///   HTTP
    ///   &lt;METHOD&gt;
    ///   &lt;request target, path only&gt;
    ///   &lt;sha256 hex of the exact body bytes&gt;
    ///   &lt;session_id&gt;
    ///   &lt;issued_at, an INTEGER in milliseconds&gt;
    ///   &lt;nonce&gt;
    ///
    /// Every line ends with a single LF, including the last. The body covered is
    /// the EXACT text being sent, so a caller must sign the string it is about to
    /// send rather than re-serialize the object.
    ///
    /// WHY THE API SURFACE LOOKS OLD-FASHIONED
    /// Because it has to, and for the same reason as the standalone client: none
    /// of the convenient modern members are safe to assume here.
    /// `ImportFromPem`, `ExportSubjectPublicKeyInfoPem` and `Convert.ToHexString`
    /// are .NET 5+, and `ExportSubjectPublicKeyInfo` is .NET Standard 2.1. The
    /// compile gate caught exactly that on the first run against the standalone
    /// client's netstandard2.0 target, which is the whole point of compiling an
    /// adapter rather than reading it. So this builds the SPKI DER and the PEM
    /// text by hand from `RSAParameters`, uses an instance
    /// `RandomNumberGenerator`, and settles hex with a loop. WITHOUT the Unity
    /// Editor available, "does the player profile accept this" is exactly the
    /// question this file cannot answer - which is why it stays on the oldest
    /// surface in the repository and why the Unity row keeps
    /// `IMPLEMENTED_NOT_EDITOR_VERIFIED`.
    ///
    /// KEY STORAGE
    /// A host that wants restart continuity persists the key with
    /// <see cref="ExportPrivateKeyText"/>, which is a small line-based text format
    /// (no JSON dependency, so it works in every runtime here) and unencrypted:
    /// whoever can read it can act as this host, exactly like the token. Storing
    /// it is therefore a host decision, and signing is off unless a host asks.
    /// </summary>
    public sealed class FearRequestSigner
    {
        public const string SigningVersion = "FEAR-AI-SIGN-V1";
        public const string Algorithm = "RS256";

        /// <summary>Format tag for <see cref="ExportPrivateKeyText"/>. Bumped only
        /// with a deliberate, documented change to the layout.</summary>
        public const string PrivateKeyFormat = "FEAR-AI-RSA1";

        private RSA? _key;

        public FearRequestSigner()
        {
            PublicKeyPem = "";
            KeyId = "";
            RefusalReason = "";
        }

        /// <summary>SPKI PEM of the public key, which is what the server stores and
        /// fingerprints. Not a secret.</summary>
        public string PublicKeyPem { get; private set; }

        /// <summary>Fingerprint of the public key's DER, derived the same way the
        /// server derives it from the same PEM. Diagnostic only: it names the key
        /// the server holds without being usable as one.</summary>
        public string KeyId { get; private set; }

        public bool HasKey => _key != null;

        /// <summary>Requests signed, and refusals the server reported. A host that
        /// signs and is never refused is the healthy case; a non-zero refusal count
        /// means this client and the server disagree about the canonical input.</summary>
        public int RequestsSigned { get; private set; }
        public int Refusals { get; private set; }
        public string RefusalReason { get; private set; }

        /// <summary>Generate a fresh keypair (RSA-2048 by default).</summary>
        public FearRequestSigner Generate(int keySizeBits = 2048)
        {
            var rsa = RSA.Create();
            rsa.KeySize = keySizeBits;
            Adopt(rsa);
            return this;
        }

        /// <summary>Adopt an existing private key from
        /// <see cref="ExportPrivateKeyText"/>.</summary>
        public FearRequestSigner FromPrivateKeyText(string text)
        {
            var rsa = RSA.Create();
            rsa.ImportParameters(ParsePrivateKeyText(text));
            Adopt(rsa);
            return this;
        }

        private void Adopt(RSA rsa)
        {
            _key = rsa;
            var parameters = rsa.ExportParameters(false);
            byte[] spki = BuildSubjectPublicKeyInfo(parameters);
            PublicKeyPem = DerToPem(spki, "PUBLIC KEY");
            KeyId = ToHex(Sha256(spki)).Substring(0, 16);
        }

        /// <summary>The private key as portable text, for a host that chooses to
        /// store one. Unencrypted, and therefore exactly as sensitive as the
        /// token.</summary>
        public string ExportPrivateKeyText()
        {
            if (_key == null) throw new InvalidOperationException("No signing key has been generated or loaded.");
            var p = _key.ExportParameters(true);
            var builder = new StringBuilder();
            builder.AppendLine(PrivateKeyFormat);
            AppendPart(builder, "modulus", p.Modulus);
            AppendPart(builder, "exponent", p.Exponent);
            AppendPart(builder, "d", p.D);
            AppendPart(builder, "p", p.P);
            AppendPart(builder, "q", p.Q);
            AppendPart(builder, "dp", p.DP);
            AppendPart(builder, "dq", p.DQ);
            AppendPart(builder, "inverseq", p.InverseQ);
            return builder.ToString();
        }

        /// <summary>Sign one request and return the headers to send with it.
        ///
        /// `body` must be the exact text that will be sent: the signature covers
        /// those bytes, so re-serializing on the way out would produce a different
        /// string (key order, number formatting) and every signature would fail.
        /// </summary>
        public Dictionary<string, string> SignHeaders(string method, string path, string body, string sessionId)
        {
            long issuedAt = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
            string nonce = NewNonce();
            string canonical = CanonicalHttp(method, path, body, sessionId, issuedAt, nonce);
            byte[] signature = _key!.SignData(
                Encoding.UTF8.GetBytes(canonical), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            RequestsSigned++;
            var headers = new Dictionary<string, string>
            {
                ["x-fear-signature-session"] = sessionId,
                ["x-fear-signature-issued-at"] = issuedAt.ToString(),
                ["x-fear-signature-nonce"] = nonce,
                ["x-fear-signature"] = Convert.ToBase64String(signature),
                ["x-fear-signature-algorithm"] = Algorithm
            };
            if (!string.IsNullOrEmpty(KeyId)) headers["x-fear-signature-key-id"] = KeyId;
            return headers;
        }

        /// <summary>Record a refusal the server reported. This is information, not
        /// just a failure: it means the server holds a key for this session, which
        /// is the recovery path when the response that registered the key was
        /// lost.</summary>
        public void NoteRefusal(string? code)
        {
            Refusals++;
            RefusalReason = code ?? "";
        }

        private static string CanonicalHttp(string method, string path, string body, string sessionId, long issuedAt, string nonce)
        {
            var builder = new StringBuilder();
            builder.Append(SigningVersion).Append('\n');
            builder.Append("HTTP").Append('\n');
            builder.Append(method.ToUpperInvariant()).Append('\n');
            builder.Append(path).Append('\n');
            builder.Append(ToHex(Sha256(Encoding.UTF8.GetBytes(body ?? "")))).Append('\n');
            builder.Append(sessionId).Append('\n');
            builder.Append(issuedAt.ToString()).Append('\n');
            builder.Append(nonce).Append('\n');
            return builder.ToString();
        }

        private static byte[] Sha256(byte[] data)
        {
            using var sha = SHA256.Create();
            return sha.ComputeHash(data ?? Array.Empty<byte>());
        }

        /// <summary>Lowercase hex. `Convert.ToHexString` is .NET 5+.</summary>
        private static string ToHex(byte[] bytes)
        {
            const string digits = "0123456789abcdef";
            var chars = new char[bytes.Length * 2];
            for (int i = 0; i < bytes.Length; i++)
            {
                chars[i * 2] = digits[bytes[i] >> 4];
                chars[i * 2 + 1] = digits[bytes[i] & 0x0F];
            }
            return new string(chars);
        }

        /// <summary>128 bits of randomness from an INSTANCE generator, because the
        /// static `RandomNumberGenerator.GetBytes(int)` is .NET Core 3.0+.</summary>
        private static string NewNonce()
        {
            var buffer = new byte[16];
            using (var rng = RandomNumberGenerator.Create())
            {
                rng.GetBytes(buffer);
            }
            return ToHex(buffer);
        }

        private static void AppendPart(StringBuilder builder, string name, byte[]? value)
        {
            builder.Append(name).Append('=').Append(Convert.ToBase64String(value ?? Array.Empty<byte>())).Append('\n');
        }

        private static RSAParameters ParsePrivateKeyText(string text)
        {
            if (string.IsNullOrEmpty(text)) throw new ArgumentException("Empty signing key.", nameof(text));
            var lines = text.Replace("\r\n", "\n").Split('\n');
            if (lines.Length == 0 || lines[0].Trim() != PrivateKeyFormat)
            {
                throw new ArgumentException($"Signing key is not in {PrivateKeyFormat} format.", nameof(text));
            }
            var parts = new Dictionary<string, byte[]>();
            for (int i = 1; i < lines.Length; i++)
            {
                var line = lines[i].Trim();
                if (line.Length == 0) continue;
                int equals = line.IndexOf('=');
                if (equals <= 0) continue;
                parts[line.Substring(0, equals)] = Convert.FromBase64String(line.Substring(equals + 1));
            }
            return new RSAParameters
            {
                Modulus = parts["modulus"],
                Exponent = parts["exponent"],
                D = parts["d"],
                P = parts["p"],
                Q = parts["q"],
                DP = parts["dp"],
                DQ = parts["dq"],
                InverseQ = parts["inverseq"]
            };
        }

        // ------------------------------------------------------------------
        // Minimal DER, because the platform helpers are not available here.
        // ------------------------------------------------------------------

        /// <summary>
        /// The SubjectPublicKeyInfo encoding of an RSA public key: what a PEM
        /// "PUBLIC KEY" block contains, and what the server fingerprints.
        ///
        ///   SEQUENCE
        ///     SEQUENCE
        ///       OID 1.2.840.113549.1.1.1 (rsaEncryption) + NULL
        ///     BIT STRING (unused bits = 0)
        ///       SEQUENCE
        ///         INTEGER modulus
        ///         INTEGER exponent
        /// </summary>
        private static byte[] BuildSubjectPublicKeyInfo(RSAParameters parameters)
        {
            byte[] rsaPublicKey = DerSequence(
                DerInteger(parameters.Modulus!),
                DerInteger(parameters.Exponent!));
            byte[] algorithm = DerSequence(
                DerOid(new byte[] { 0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x01, 0x01 }),
                new byte[] { 0x05, 0x00 });
            return DerSequence(algorithm, DerBitString(rsaPublicKey));
        }

        private static byte[] DerSequence(params byte[][] parts)
        {
            return DerTagged(0x30, Concat(parts));
        }

        /// <summary>AN INTEGER with a leading zero byte when the high bit is set,
        /// otherwise the value reads as negative.</summary>
        private static byte[] DerInteger(byte[] value)
        {
            int start = 0;
            while (start < value.Length - 1 && value[start] == 0) start++;
            byte[] trimmed = new byte[value.Length - start];
            Array.Copy(value, start, trimmed, 0, trimmed.Length);
            if ((trimmed[0] & 0x80) != 0)
            {
                var padded = new byte[trimmed.Length + 1];
                Array.Copy(trimmed, 0, padded, 1, trimmed.Length);
                trimmed = padded;
            }
            return DerTagged(0x02, trimmed);
        }

        private static byte[] DerOid(byte[] oidValue)
        {
            return DerTagged(0x06, oidValue);
        }

        /// <summary>A BIT STRING whose payload fills every bit, i.e. unused-bits
        /// count 0.</summary>
        private static byte[] DerBitString(byte[] payload)
        {
            return DerTagged(0x03, Concat(new[] { new byte[] { 0x00 }, payload }));
        }

        private static byte[] DerTagged(byte tag, byte[] payload)
        {
            byte[] length = DerLength(payload.Length);
            byte[] result = new byte[1 + length.Length + payload.Length];
            result[0] = tag;
            Array.Copy(length, 0, result, 1, length.Length);
            Array.Copy(payload, 0, result, 1 + length.Length, payload.Length);
            return result;
        }

        private static byte[] DerLength(int length)
        {
            if (length < 0x80)
            {
                return new[] { (byte)length };
            }
            var bytes = new List<byte>();
            int remaining = length;
            while (remaining > 0)
            {
                bytes.Insert(0, (byte)(remaining & 0xFF));
                remaining >>= 8;
            }
            var result = new byte[bytes.Count + 1];
            result[0] = (byte)(0x80 | bytes.Count);
            bytes.CopyTo(result, 1);
            return result;
        }

        private static byte[] Concat(byte[][] parts)
        {
            int total = 0;
            foreach (var part in parts) total += part.Length;
            var result = new byte[total];
            int at = 0;
            foreach (var part in parts)
            {
                Array.Copy(part, 0, result, at, part.Length);
                at += part.Length;
            }
            return result;
        }

        /// <summary>Wrap DER as PEM text with 64-character lines.</summary>
        private static string DerToPem(byte[] der, string label)
        {
            string base64 = Convert.ToBase64String(der);
            var builder = new StringBuilder();
            builder.Append("-----BEGIN ").Append(label).Append("-----\n");
            for (int i = 0; i < base64.Length; i += 64)
            {
                builder.Append(base64.Substring(i, Math.Min(64, base64.Length - i))).Append('\n');
            }
            builder.Append("-----END ").Append(label).Append("-----\n");
            return builder.ToString();
        }
    }
}
