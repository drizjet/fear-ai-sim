"""Optional Fear AI local-child IPC HMAC envelope sender.

Independent of the Python HTTP middleware client. Transport/bootstrap/peer
identity belong to the trusted Node parent and must not be inferred from a
host-provided PID or session name. Only primitive JSON text enters sign().
"""
import base64
import hashlib
import hmac
import re

_HEX32 = re.compile(r"[a-f0-9]{32}\Z")
_HEX64 = re.compile(r"[a-f0-9]{64}\Z")
MAX_CODE_UNITS = 262144
MAX_SEQUENCE = 9007199254740991


class FearHostIpcSigner:
    def __init__(self, session_id: str, secret: str):
        if not isinstance(session_id, str) or not _HEX32.fullmatch(session_id):
            raise ValueError("invalid trusted host session")
        if not isinstance(secret, str) or not _HEX64.fullmatch(secret):
            raise ValueError("invalid trusted host credential")
        self._session = session_id
        self._key = bytearray.fromhex(secret)
        self._sequence = 0
        self._closed = False

    def sign(self, frame: str) -> str:
        if self._closed:
            raise ValueError("host session closed")
        if not isinstance(frame, str):
            raise TypeError("primitive JSON text required")
        if not frame or len(frame.encode("utf-16-le")) // 2 > MAX_CODE_UNITS:
            raise ValueError("invalid trusted IPC frame length")
        if self._sequence >= MAX_SEQUENCE:
            raise ValueError("host sequence exhausted; establish new session")
        encoded = base64.urlsafe_b64encode(frame.encode("utf-8")).rstrip(b"=").decode("ascii")
        next_seq = self._sequence + 1
        signed = f"FEAR-IPC-1.{self._session}.{next_seq}.{encoded}"
        mac = hmac.new(self._key, signed.encode("utf-8"), hashlib.sha256).hexdigest()
        self._sequence = next_seq
        return f"{signed}.{mac}"

    def close(self):
        for i in range(len(self._key)):
            self._key[i] = 0
        self._closed = True
