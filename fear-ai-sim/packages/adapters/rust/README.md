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

## Owned child stdout bridge (opt-in)

`host_ipc_owned_child::HostIpcOwnedChild` now launches **one** trusted local
child through a caller-supplied `std::process::Command`, with only that
child's stdout piped to a bounded, LF-delimited FEAR-IPC-1 intake. The
host must create a new cryptographically random 32-hex session and 64-hex
secret for **each** new launch; the bridge passes them to that child as
`FEAR_HOST_IPC_SESSION` and `FEAR_HOST_IPC_SECRET` and removes their copies
from the reusable `Command` builder immediately after the spawn attempt.
These variables are not a confidentiality boundary against a compromised
same-user process or child descendants, so launch only trusted programs and
use OS sandboxing where the threat model requires it. Do not log credentials.

Example (the child must write correctly signed ASCII envelopes plus `\n`):

```rust,ignore
use fear_ai::{HostIpcOwnedChild, HostIpcQueueLimits, HostIpcPolicy};
use std::process::Command;
let mut command = Command::new("trusted-fear-helper");
let mut child = HostIpcOwnedChild::spawn(&mut command, &fresh_session,
    &fresh_secret, HostIpcPolicy::default(), HostIpcQueueLimits::default())?;
match child.poll(current_simulation_tick) {
    Ok(Some(metadata)) => { /* host explicitly considers advisory metadata */ },
    Ok(None) => {}, // no complete envelope yet; polling never waits on stdout
    Err(error) => { /* record rejection category; never replay a mutation */ },
}
child.close(); // terminates/reaps only the owned child, clears queued bytes
```

`HostIpcQueueLimits` defaults to a 1,400,000-byte maximum signed line,
16 pending frames and 4,200,000 cumulative queued bytes. All maxima are
validated. The dedicated reader bounds a line *before* parsing or queuing,
and a full queue, invalid UTF-8 line, or truncated EOF poisons the transport:
no remaining frames are admitted,
and the next `poll` kills/reaps that owned child and revokes the verifier.
Dropping also closes it. Frame signature, replay, tick and allowlist checks
still happen in `HostIpcReceiver`, not in the stdout reader. Invalid frames
produce typed `Rejected` results. No child stdout content is ever decoded
into executable callbacks or granted inventory, combat, physics or spawn
authority. The caller remains responsible for host-owned accepted-event
delivery, scheduling polls, error telemetry and key custody.

This bridge is **receiving only**. It does not add a TCP listener, cross-user
OS peer authentication, an outbound request/ack queue, a child-process tree
job/sandbox, automatic restart, or a timeout for a silent running child.
The reader thread is not joined on close because inherited stdout handles
from a grandchild could make shutdown hang. No replacement child is spawned
implicitly; the owner must generate **fresh** credentials and create a new
instance. Existing Fear AI HTTP/WebSocket middleware sessions are untouched.
