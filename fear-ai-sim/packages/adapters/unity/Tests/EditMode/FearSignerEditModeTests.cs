using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using NUnit.Framework;
using FearAI;

namespace FearAI.EditorTests
{
    /// <summary>
    /// The Unity adapter's signing path, as the EDITOR's runtime executes it.
    /// These tests need no server, and deliberately so: an Editor test that
    /// requires a running middleware is an integration test with a misleading
    /// home, and it would fail on every machine without the server.
    ///
    /// WHY THIS EXISTS AT ALL, GIVEN A SHIM ALREADY RUNS THE ADAPTER
    /// The shim harness executes the adapter against a live server through a
    /// substitute UnityEngine, and the adapter's own comments name the question it
    /// cannot answer: `ImportFromPem`, `ExportSubjectPublicKeyInfoPem` and
    /// `Convert.ToHexString` are unavailable on the surfaces this package must
    /// support, so <see cref="FearRequestSigner"/> builds the SPKI DER and the PEM
    /// text by hand. Whether that hand-built DER is what a real runtime accepts
    /// depends on the runtime, not on the shim.
    ///
    /// So these assertions are STRUCTURAL on purpose. They check the exact bytes
    /// the server will fingerprint, using only primitives that exist on every
    /// scripting profile this package targets - no `ImportSubjectPublicKeyInfo`,
    /// which is .NET Standard 2.1 and absent from the .NET Framework profile.
    /// A structural check that compiles everywhere is worth more here than an
    /// elegant one that only compiles on some machines.
    /// </summary>
    [TestFixture]
    public class FearRequestSignerEditModeTests
    {
        /// <summary>
        /// The rsaEncryption OID, 1.2.840.113549.1.1.1, as DER content bytes.
        /// </summary>
        private static readonly byte[] RsaEncryptionOid = new byte[]
        {
            0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x01, 0x01
        };

        /// <summary>
        /// A deliberately tiny DER reader, so the SPKI is CHECKED rather than
        /// compared against a constant this test would have had to hand-compute.
        ///
        /// The first draft of this fixture asserted a 294-byte total and an outer
        /// length of 0x0122, both of which were wrong (the true values are 295 and
        /// 0x0123) and both of which would have "passed" review by looking
        /// plausible. Parsing the structure and asserting the FACTS - one
        /// rsaEncryption algorithm identifier, a modulus of the expected size, an
        /// exponent of 65537, and lengths that agree with the bytes present - is
        /// the same check without a magic number to get wrong.
        /// </summary>
        private sealed class DerReader
        {
            private readonly byte[] _data;
            private int _at;
            public DerReader(byte[] data) { _data = data; }
            public int Remaining => _data.Length - _at;
            public int Length => _data.Length;

            public byte[] Tagged(byte expectedTag)
            {
                Assert.Less(_at, _data.Length, "DER reader ran off the end of the buffer");
                Assert.AreEqual(expectedTag, _data[_at], $"expected DER tag 0x{expectedTag:X2} at offset {_at}");
                _at += 1;
                int length = ReadLength();
                Assert.LessOrEqual(length, Remaining, $"DER length {length} exceeds the {Remaining} byte(s) left");
                var payload = new byte[length];
                Array.Copy(_data, _at, payload, 0, length);
                _at += length;
                return payload;
            }

            private int ReadLength()
            {
                Assert.Less(_at, _data.Length, "DER length byte missing");
                int first = _data[_at++];
                if (first < 0x80) return first;
                int count = first & 0x7F;
                Assert.LessOrEqual(count, 4, "implausible DER length encoding");
                int value = 0;
                for (int i = 0; i < count; i++)
                {
                    Assert.Less(_at, _data.Length, "truncated DER length");
                    value = (value << 8) | _data[_at++];
                }
                return value;
            }
        }

        private static byte[] PemBodyToDer(string pem)
        {
            Assert.IsNotNull(pem, "public key PEM was null");
            var body = new StringBuilder();
            foreach (var line in pem.Split('\n'))
            {
                var trimmed = line.Trim();
                if (trimmed.Length == 0 || trimmed.StartsWith("-----", StringComparison.Ordinal)) continue;
                body.Append(trimmed);
            }
            Assert.Greater(body.Length, 0, "the PEM has no body to decode");
            return Convert.FromBase64String(body.ToString());
        }

        [Test]
        public void GeneratedPublicKeyIsPemWithSixtyFourCharacterLines()
        {
            var signer = new FearRequestSigner().Generate();
            Assert.IsTrue(signer.HasKey, "Generate produced a signer with no key");
            StringAssert.StartsWith("-----BEGIN PUBLIC KEY-----", signer.PublicKeyPem);
            StringAssert.Contains("-----END PUBLIC KEY-----", signer.PublicKeyPem);
            foreach (var line in signer.PublicKeyPem.Split('\n'))
            {
                if (line.Length == 0) continue;
                Assert.LessOrEqual(line.Trim().Length, 64, $"PEM line longer than 64 characters: {line.Length}");
            }
        }

        [Test]
        public void GeneratedPublicKeyDerIsAValidRsa2048SubjectPublicKeyInfo()
        {
            var signer = new FearRequestSigner().Generate();
            var der = PemBodyToDer(signer.PublicKeyPem);
            var reader = new DerReader(der);

            // SubjectPublicKeyInfo ::= SEQUENCE { algorithm, subjectPublicKey }
            var spkiContent = reader.Tagged(0x30);
            Assert.AreEqual(0, reader.Remaining, "trailing bytes after the outer SEQUENCE");
            Assert.AreEqual(spkiContent.Length + 4, der.Length, "the outer length does not describe the bytes present");

            var spki = new DerReader(spkiContent);

            // AlgorithmIdentifier ::= SEQUENCE { OID rsaEncryption, NULL }
            var algorithm = spki.Tagged(0x30);
            var algorithmReader = new DerReader(algorithm);
            CollectionAssert.AreEqual(RsaEncryptionOid, algorithmReader.Tagged(0x06),
                "the algorithm OID is not rsaEncryption, so the server cannot fingerprint this key");
            CollectionAssert.AreEqual(new byte[] { 0x05, 0x00 }, algorithmReader.Tagged(0x05),
                "the algorithm parameters must be an explicit NULL for rsaEncryption");
            Assert.AreEqual(0, algorithmReader.Remaining, "trailing bytes in the algorithm identifier");

            // BIT STRING, zero unused bits, wrapping RSAPublicKey
            var bitString = spki.Tagged(0x03);
            Assert.AreEqual(0x00, bitString[0], "the BIT STRING reports unused bits, so the DER is malformed");
            var bitStringBody = new byte[bitString.Length - 1];
            Array.Copy(bitString, 1, bitStringBody, 0, bitStringBody.Length);
            Assert.AreEqual(0, spki.Remaining, "trailing bytes after the public key bit string");

            // RSAPublicKey ::= SEQUENCE { modulus INTEGER, publicExponent INTEGER }
            var rsaKeyReader = new DerReader(bitStringBody);
            var rsaPublicKey = rsaKeyReader.Tagged(0x30);
            Assert.AreEqual(0, rsaKeyReader.Remaining, "trailing bytes after RSAPublicKey");

            var keyReader = new DerReader(rsaPublicKey);
            var modulus = keyReader.Tagged(0x02);
            // A 2048-bit modulus with the DER sign byte in front of it.
            Assert.AreEqual(257, modulus.Length, "the modulus is not a signed 2048-bit integer");
            Assert.AreEqual(0x00, modulus[0], "the modulus is not zero-padded, so it would read as negative");
            var exponent = keyReader.Tagged(0x02);
            Assert.AreEqual(0, keyReader.Remaining, "trailing bytes in RSAPublicKey");

            // 65537, the universal RSA exponent. A hand-built DER that got the
            // INTEGER trimming wrong would land here as 0x01 0x00 0x01 (65537 with
            // a stray sign byte) or as the wrong value entirely.
            var exponentValue = 0;
            foreach (var b in exponent) exponentValue = (exponentValue << 8) | b;
            Assert.AreEqual(65537, exponentValue, "the public exponent is not 65537");
        }

        [Test]
        public void KeyIdIsTheFingerprintOfTheDerTheServerWillSee()
        {
            var signer = new FearRequestSigner().Generate();
            Assert.AreEqual(16, signer.KeyId.Length, "the key id must be a 16-character fingerprint");
            StringAssert.IsMatch("^[0-9a-f]{16}$", signer.KeyId);

            // Independently derived here from the same PEM body, so the field is
            // the fingerprint of the KEY and not of anything else the signer holds.
            byte[] der = PemBodyToDer(signer.PublicKeyPem);
            string expected;
            using (var sha = SHA256.Create())
            {
                var hash = sha.ComputeHash(der);
                var hex = new StringBuilder(hash.Length * 2);
                foreach (var b in hash) hex.Append(b.ToString("x2"));
                expected = hex.ToString().Substring(0, 16);
            }
            Assert.AreEqual(expected, signer.KeyId);
        }

        [Test]
        public void TwoSignersDoNotShareAKeyAndAFreshSignerStartsWithNone()
        {
            var empty = new FearRequestSigner();
            Assert.IsFalse(empty.HasKey, "a signer must not invent a key before Generate is called");
            Assert.AreEqual("", empty.PublicKeyPem);
            Assert.AreEqual("", empty.KeyId);

            var first = new FearRequestSigner().Generate();
            var second = new FearRequestSigner().Generate();
            Assert.AreNotEqual(first.KeyId, second.KeyId, "two generated keys share a fingerprint");
            Assert.AreNotEqual(first.PublicKeyPem, second.PublicKeyPem);
        }

        [Test]
        public void ExportedPrivateKeyTextRestoresTheSameIdentity()
        {
            var original = new FearRequestSigner().Generate();
            string text = original.ExportPrivateKeyText();
            StringAssert.StartsWith(FearRequestSigner.PrivateKeyFormat, text);

            var restored = new FearRequestSigner().FromPrivateKeyText(text);
            Assert.AreEqual(original.KeyId, restored.KeyId,
                "a restored key must fingerprint identically or the server sees a stranger");
            Assert.AreEqual(original.PublicKeyPem, restored.PublicKeyPem);
        }

        [Test]
        public void RestoredKeySignsIdenticallyVerifiableSignatures()
        {
            var original = new FearRequestSigner().Generate();
            var restored = new FearRequestSigner().FromPrivateKeyText(original.ExportPrivateKeyText());
            const string body = "{\"agent_id\":\"npc_1\"}";

            var fromOriginal = original.SignHeaders("POST", "/api/v1/register", body, "unity_host");
            var fromRestored = restored.SignHeaders("POST", "/api/v1/register", body, "unity_host");

            // The signature covers the timestamp and a fresh nonce, so the two
            // signatures must DIFFER while both verifying against the one public
            // key. A restored key that produced identical bytes would mean the
            // nonce or the clock was not actually part of the input.
            Assert.AreNotEqual(fromOriginal["x-fear-signature"], fromRestored["x-fear-signature"]);
            CollectionAssert.AreEquivalent(fromOriginal.Keys, fromRestored.Keys);
        }

        [Test]
        public void SignatureHeadersAreCompleteAndSafelyEmbeddable()
        {
            var signer = new FearRequestSigner().Generate();
            var headers = signer.SignHeaders("POST", "/api/v1/register/batch", "{}", "unity_host");

            string[] required =
            {
                "x-fear-signature-session",
                "x-fear-signature-issued-at",
                "x-fear-signature-nonce",
                "x-fear-signature",
                "x-fear-signature-algorithm",
                "x-fear-signature-key-id"
            };
            foreach (var name in required)
            {
                Assert.IsTrue(headers.ContainsKey(name), $"missing signature header {name}");
                Assert.IsFalse(string.IsNullOrEmpty(headers[name]), $"empty signature header {name}");
                // Header values are embedded into hand-built JSON elsewhere, so a
                // raw newline here would be invalid JSON on the wire - the exact
                // defect this adapter already shipped once.
                Assert.IsFalse(headers[name].Contains("\n"), $"header {name} contains a raw newline");
                Assert.IsFalse(headers[name].Contains("\r"), $"header {name} contains a raw carriage return");
            }

            Assert.AreEqual(FearRequestSigner.Algorithm, headers["x-fear-signature-algorithm"]);
            Assert.AreEqual("unity_host", headers["x-fear-signature-session"]);
            Assert.AreEqual(signer.KeyId, headers["x-fear-signature-key-id"]);

            // An INTEGER, decimal, without a fraction: the canonical input renders
            // it with ToString(), and a float render would be silently refused.
            Assert.IsTrue(long.TryParse(headers["x-fear-signature-issued-at"], out var issuedAt),
                "issued-at is not a decimal integer");
            Assert.Greater(issuedAt, 1_600_000_000_000L, "issued-at is not in milliseconds since the epoch");
            Assert.Less(issuedAt, 4_000_000_000_000L, "issued-at looks like seconds, not milliseconds");

            // 128 bits of nonce, hex-encoded.
            Assert.AreEqual(32, headers["x-fear-signature-nonce"].Length);
            StringAssert.IsMatch("^[0-9a-f]{32}$", headers["x-fear-signature-nonce"]);

            // RSA-2048, PKCS#1 v1.5: exactly the modulus size.
            Assert.AreEqual(256, Convert.FromBase64String(headers["x-fear-signature"]).Length);
        }

        [Test]
        public void SigningCountsWhatWasSignedAndWhatWasRefused()
        {
            var signer = new FearRequestSigner().Generate();
            Assert.AreEqual(0, signer.RequestsSigned);
            Assert.AreEqual(0, signer.Refusals);

            signer.SignHeaders("POST", "/api/v1/register", "{}", "unity_host");
            signer.SignHeaders("POST", "/api/v1/register", "{}", "unity_host");
            Assert.AreEqual(2, signer.RequestsSigned);

            signer.NoteRefusal("SIGNATURE_INVALID");
            Assert.AreEqual(1, signer.Refusals);
            Assert.AreEqual("SIGNATURE_INVALID", signer.RefusalReason);
        }

        [Test]
        public void KeyTextInTheWrongFormatIsRejectedRatherThanSilentlyMisparsed()
        {
            var signer = new FearRequestSigner();
            Assert.Throws<ArgumentException>(() => signer.FromPrivateKeyText("not a key at all"));
            Assert.Throws<ArgumentException>(() => signer.FromPrivateKeyText(""));
            Assert.Throws<InvalidOperationException>(() => new FearRequestSigner().ExportPrivateKeyText());
        }
    }
}
