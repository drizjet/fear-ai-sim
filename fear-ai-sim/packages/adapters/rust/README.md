# Fear AI Rust adapter

The Rust SDK retains its preexisting advisory middleware and local
evaluation interfaces.

## Opt-in FEAR-IPC-1 receiving metadata

`host_ipc_receiver::HostIpcReceiver` is a **receiving** HMAC-SHA256
verifier for a trusted local host-owned IPC channel, independent of HTTP
or WebSocket middleware sessions. Construct it with a new 32-hex
`session`, 64-hex `secret` delivered by an authenticated owner, and a
`HostIpcPolicy` with explicitly allowlisted event types/nontrade entity
IDs. The receiver defaults to deny-all and bounds bytes, message counts,
frame schema/depth, and value nodes. It verifies signatures in constant
time, demands exactly consecutive sequence numbers, checks the event tick,
and refuses trade-prefixed cargo IDs.

Call `receive(envelope, current_tick)` only from a transport already
bound to the correct owned child/peer. On success it returns
`HostIpcFrame::Event` or `HostIpcFrame::Cargo` with validated JSON
metadata; **the host still decides whether and how to apply it**, with
inventory, movement, physics, combat, and spawning remaining host-owned.
Call `close()` or drop the receiver on disconnection to zero the local
native key and refuse subsequent messages. Never persist a key after a
process restart or retry a mutation with ambiguous transport outcome.
Use a new authenticated session/key on reconnect.

Verified by offline `cargo test` against the exact Node/Python/C#/Unity
signed wire vector, wrong-MAC and replay negatives, authority denial and
frame/byte quotas. This is an SDK receiving verifier, **not** an
automatically installed TCP/IPC listener, and it cannot sandbox hostile
code in the same process.
