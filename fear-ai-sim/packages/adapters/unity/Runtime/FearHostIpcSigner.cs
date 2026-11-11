using System;
using System.Security.Cryptography;
using System.Text;

namespace FearAI
{
    /// <summary>
    /// Optional Unity-side primitive JSON signer for the trusted Node child
    /// gateway's HMAC protocol. Not a replacement for FearAIClient's HTTP or
    /// WebSocket signing/transport, and not a Unity IPC receiver.
    /// </summary>
    public sealed class FearHostIpcSigner : IDisposable
    {
        private readonly string _sessionId;
        private readonly byte[] _secret;
        private long _sequence;
        private bool _disposed;
        private readonly object _gate = new object();

        public FearHostIpcSigner(string sessionId, string secret)
        {
            if (sessionId == null || sessionId.Length != 32 || !IsLowerHex(sessionId))
                throw new ArgumentException("Invalid trusted host session", nameof(sessionId));
            if (secret == null || secret.Length != 64 || !IsLowerHex(secret))
                throw new ArgumentException("Invalid trusted host credential", nameof(secret));
            _sessionId = sessionId;
            _secret = new byte[32];
            for (int i = 0; i < 32; i++)
                _secret[i] = Convert.ToByte(secret.Substring(i * 2, 2), 16);
        }

        public string Sign(string frame)
        {
            lock (_gate)
            {
                if (_disposed) throw new ObjectDisposedException(nameof(FearHostIpcSigner));
                if (frame == null || frame.Length == 0 || frame.Length > 262144)
                    throw new ArgumentException("Invalid trusted IPC frame length", nameof(frame));
                if (_sequence >= 9007199254740991L)
                    throw new InvalidOperationException("IPC sequence exhausted; replace session");
                var utf8 = new UTF8Encoding(false, true).GetBytes(frame);
                var base64 = Convert.ToBase64String(utf8).TrimEnd('=').Replace('+', '-').Replace('/', '_');
                string signed = "FEAR-IPC-1." + _sessionId + "." + (_sequence + 1).ToString(
                    System.Globalization.CultureInfo.InvariantCulture) + "." + base64;
                byte[] digest;
                using (var hmac = new HMACSHA256(_secret))
                    digest = hmac.ComputeHash(Encoding.UTF8.GetBytes(signed));
                var hex = new StringBuilder(64);
                foreach (byte b in digest) hex.Append(b.ToString("x2"));
                _sequence++;
                return signed + "." + hex;
            }
        }

        public void Dispose()
        {
            lock (_gate)
            {
                if (_disposed) return;
                Array.Clear(_secret, 0, _secret.Length);
                _disposed = true;
            }
        }

        private static bool IsLowerHex(string value)
        {
            foreach (char c in value)
                if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')))
                    return false;
            return true;
        }
    }
}
