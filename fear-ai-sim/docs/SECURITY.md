> Loopback middleware threat model. Not a claim about host-game security. See `SYSTEM_MAP.md`.

# Fear AI Middleware - Security Policy & Local Threat Model

## 1. Threat Model for Local AI Middleware

Fear AI Universal Middleware operates as a local daemon process intended to run on the loopback network (`127.0.0.1`) alongside the host game process.

### Primary Security Objectives
1. **Loopback Confinement**: The server listens exclusively on `127.0.0.1` by default. It explicitly falls back to `127.0.0.1` if `0.0.0.0` or `::` is requested without `allowRemoteAccess=true`.
2. **Denial of Service (DoS) Bounding**:
   - HTTP request bodies are bounded by `maxPayloadBytes` (default 50 MB, configurable). Requests exceeding the limit immediately receive HTTP `413 Payload Too Large` and the socket is destroyed.
   - WebSocket frames are bounded by `maxPayload` on `WebSocketServer`.
3. **Prototype Pollution Immunity**:
   - Keys such as `__proto__`, `constructor`, and `prototype` in JSON payloads are stripped by `ProtocolValidator`.
4. **Memory Injection & Arbitrary Execution Defense**:
   - Snapshots and simulation states are parsed strictly as structured JSON in memory.
   - Snapshots cannot request filesystem writes or execute child processes.
5. **Identifier Length Bounding**:
   - Agent identifiers (`agent_id`), stimulus identifiers, and names are clamped to a maximum of 256 characters.
6. **Numeric Clamping & Sanitization**:
   - All sensory inputs (`x`, `y`, `z`, `dt`, `intensity`, `distance`, `traits`) sanitize `NaN`, `Infinity`, and out-of-range negative numbers to safe fallbacks.
7. **Information Leakage Prevention**:
   - Production HTTP and WebSocket error responses do not echo internal host stack traces.
