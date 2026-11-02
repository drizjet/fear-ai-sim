# Fear AI — trusted host data-transfer boundary (opt-in)

## Security contract

**The host extension runs outside the trusted simulation process.** It is not
allowed to pass live JavaScript objects, getters, Proxies, callbacks, native
buffers, or function references into the simulation. The authenticated host
transport delivers a **primitive JSON string** and nothing else. In the
trusted engine process, `CivilizationSimulationSystem.acceptHostTransferFrame`
or `WorldTradeAuthority.acceptHostTransferFrame` parses that string without a
reviver, validates and bounds every JSON value, creates new null-prototype
records, and only then applies one event or nontrade metadata update.

This closes the hostile Proxy `ownKeys` / `getOwnPropertyDescriptor` trap
execution **on this new ingress path**: there is no reflective operation on
an untrusted caller object. A Proxy passed in place of the primitive string is
rejected by `typeof` without inspecting its properties or coercing it.
Custom and inherited `toJSON` callbacks are not invoked by this path because
it never calls `JSON.stringify` on host-origin objects. Host-provided code
running in a separate process may execute its own callbacks there, but cannot
hold a live in-memory reference to the authoritative simulation.

**This is a process/memory data boundary, not a general OS sandbox, network
authentication, or an arbitrary JavaScript serializer.** The containing host
must authenticate its IPC/network peer and isolate untrusted code with the
appropriate OS/user restrictions. Untrusted code executing *inside* the
trusted process could mutate global prototypes or public simulator fields
directly and bypass this API. Legacy direct snapshot and registration APIs
remain intended for trusted, in-process callers and do not promise Proxy
isolation. Do not feed untrusted objects into `getState`,
`setState`, `registerEntity`, or `sim.events` directly.

## Authenticated Node child-process IPC (recommended)

The production Node adapter now supplies
`packages/adapters/node/host_ipc_adapter.mjs` for owned child launch,
fresh parent credential bootstrap, scoped gateway registration, and
revocation on child exit/disconnect. Replacing a terminated child uses the
same sealed gateway but **always a new session/secret**. No automatic retry
of uncertain writes is performed. Gateway configuration now additionally
bounds active registered peers (default 32, maximum 256), decoded bytes
per frame (default 262,144, maximum 1,048,576), and cumulative admitted
decoded bytes per peer/window (default 1,048,576, maximum 67,108,864).
Peer-owned key bytes are zeroed on revocation; copies in JS strings and
the child process cannot be reliably zeroed by the parent.

The Python, C# and Unity SDKs expose optional interoperable FEAR-IPC-1
**sending/signing** helpers for explicit adapter-side IPC bridges. They
do not change or impersonate the existing HTTP/WebSocket clients. The
Node gateway accepts byte-identical Python/C#/Unity envelopes and rejects
cross-language sequence replay. Godot, Unreal and Rust still use their
pre-existing middleware transports and have NOT automatically migrated to
this Node-only child IPC protocol. Those engines need separately authorized
transport integrations, threat models and engine-runtime verification.

Use `AuthenticatedHostIpcGateway.mjs` in the **trusted parent only**. The
gateway seals the simulator against direct unsigned transfer calls. It
authenticates each incoming message using the owned ChildProcess object
reference, a fresh random session ID, HMAC-SHA256 and a strictly increasing
message sequence. Peer IDs or PIDs are not trusted identity.

```js
import { fork } from 'node:child_process';
import { createAuthenticatedHostIpcGateway, createHostIpcCredential } from './packages/core/src/AuthenticatedHostIpcGateway.mjs';

const child = fork('./isolated-host-child.mjs', [], {
  stdio: ['ignore', 'pipe', 'pipe', 'ipc']
});
const credential = createHostIpcCredential(); // fresh on every launch
const gateway = createAuthenticatedHostIpcGateway(sim);
gateway.attachChildProcess(child, {
  peerId: 'neutral-plugin', ...credential,
  allowedEventTypes: ['host_signal'],
  allowedEntityIds: ['neutral'],
  maxMessagesPerWindow: 32, windowMs: 1000
});
child.send(credential); // trusted bootstrap on this exact child handle
```

The authorized child calls `makeAuthenticatedHostMessage({frame,sequence,
sessionId,secret})` with a primitive JSON frame string. It begins at sequence
1 and increments on authenticated admission. Authenticated messages denied
by data/policy validation still consume their sequence to prevent replay.
Rate-limited messages do not, and can be retried when capacity returns.
Both event and cargo allowlists default to **deny-all**.

The default rate is 32 admitted messages per 1,000 ms per peer (configurable
and bounded), plus a bound on pre-authentication attempts. Counters use a
trusted monotonic clock, never a timestamp supplied by the sender. Peer
registration is revoked on exit/disconnect, and all credentials must be
replaced on restart. Do not log or echo shared session secrets.

Signatures cover exact base64url-encoded UTF-8 frame bytes, session ID and
sequence; well-formed digests are compared constant-time. Holding a key grants
only the specified event/entity permissions, not movement or inventory.
Unknown peer handles, altered MACs, old sessions, duplicated/gapped
sequences and unauthorized event/entity requests fail closed.

**This is an opt-in Node child-process integration, not an automatic
retrofit of browser, Unity, Godot or Unreal adapters.** Keep the simulator,
authority, gateway and opaque ingress capability inside trusted parent code.
Hostile code already executing in the trusted process can mutate public
simulator fields independently of this gateway. A child with session
credentials can sign messages in its limited permitted scope, and must be
isolated further using OS permissions. HMAC does not create an OS sandbox.

## Version 1 wire frames

These are **inner JSON payloads**, not authenticated envelopes. After
installing the gateway, they must be signed and sent through its owned
child-process channel, not passed directly to `sim.acceptHostTransferFrame`.
An unsealed simulator retains the old trusted in-process primitive API.

Host event metadata, at the *current* simulation tick:

```json
{"version":1,"kind":"event","type":"host_signal","tick":0,"details":{"risk":0.2}}
```

Host-owned **nontrade** entity cargo metadata (the entity must already exist):

```json
{"version":1,"kind":"cargo","entityId":"neutral","cargo":{"host":{"note":"seen"}}}
```

The receipt contains only kind/tick or kind/entityId; it contains no references
to transferred metadata. The transport does not grant permission to move,
spawn, apply damage, or alter shipment escrow. Cargo IDs starting with
`trade:` are refused. Unknown entities, future/past event ticks, unknown frame
versions or fields, malformed JSON, forbidden keys (`__proto__`,
`constructor`, `prototype`, `toJSON`), nonfinite numbers, excessive
depth/breadth and oversized frames are refused **before any mutation**.

The frame limit is 262,144 UTF-16 code units, depth 32, at most 4,096 JSON
value nodes, 256 fields per record, 2,048 array entries, and 16,384 code
units per string. The native JSON parser uses normal last-wins duplicate-key
semantics, so this contract is not a canonical signed JSON format. The
optional Node gateway authenticates exact encoded bytes and maintains
replay protection for each registered peer.

JSON intentionally has **value semantics**: Map/Set, cycles, typed arrays,
Buffer subclasses, shared backing references and executable metadata are not
preserved by this wire boundary. Trusted in-process direct snapshots have a
separate, explicitly different native metadata contract. This transfer path
does not change LOD, fear, tick formulas, road graph trust, manually blocked
routes, neutral unknown-LOD fallback, deterministic shipment conservation or
host authority over physics/combat/spawning/inventory.

## Evidence and remaining risks

The named `verify_world_trade_authority.mjs` standalone probe validates the
primitive-only ingress, zero Proxy trap and `toJSON` calls during rejection,
inherited callback exclusion during transfer, nested fail-closed admission,
event/cargo restore and 40-tick deterministic replay. The separate off-Git
`evidence/isolated_host_ipc.mjs` reproduces an actual Node child process that
executes a hostile callback in the child, while its trusted parent accepts only
primitive frames and retains unchanged fear/morale state.

The authenticated gateway's named probes cover forged signatures, peer
impersonation, sequence replay/gaps, rate throttling and refill, allowlist
denial, revoked handles, raw ingress bypass rejection, and identical 40-tick
trade replay/conservation. Off-Git `authenticated_child_ipc.mjs` verifies a
real owned child process with signed, replayed, forged, over-limit and
nonstring messages.

Out-of-band direct access to the simulator, ambient global monkeypatching
inside the trusted process, leaked authorized credentials, resource exhaustion
outside the bounded parser, and hostile code with host OS privileges remain
outside this boundary. An OS process does not, by itself, provide strong
filesystem/network containment; use platform sandboxing for untrusted plugins.
