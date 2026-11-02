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

## Version 1 wire frames

Send a JSON string over an IPC or network transport. On Node, the trusted
parent can receive the child-process `message` event and pass the received
primitive string straight to the simulator:

```js
child.on('message', message => {
  if (typeof message !== 'string') return;
  try {
    const receipt = sim.acceptHostTransferFrame(message);
    // Send a receipt through an authenticated host-owned channel.
  } catch (error) {
    // Reject; do not retry malformed or unauthorized frames blindly.
  }
});
```

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
semantics, so this contract is not a canonical signed JSON format; sender
authentication/replay protection belongs to the trusted transport.

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

Out-of-band direct access to the simulator, ambient global monkeypatching
inside the trusted process, forged authenticated senders, resource exhaustion
outside the bounded parser, and hostile code with host OS privileges remain
outside this boundary. An OS process does not, by itself, provide strong
filesystem/network containment; use platform sandboxing for untrusted plugins.
