# Session ownership and the reconnect contract — evidence record

Date: 2026-09-20
Status: `VERIFIED_CURRENT`
Scope: `packages/runtime/src/ClaimArbitration.js`, `FearServer`, both Godot clients, `verify_server_reconnect.mjs`

## The gap this closes

The truth ledger carried this as an open host/session contract:

> WebSocket disconnect does not automatically unregister agents. Explicit
> unregister cleanup is proven, but reconnect identity ownership is still an open
> host/session contract.

State continuity was already proven: a dropped socket preserves server-scoped
agent state and a reconnect can keep ticking. What the server could **not**
answer was *who an agent belongs to*. Without that, "my host reconnected" and "a
second host is claiming my crowd" produce identical wire traffic, and neither had
a defined outcome.

## The contract

One rule, applied per agent id:

| Owner | Claimant | Outcome |
| --- | --- | --- |
| none | anyone | `GRANTED` — ownership recorded if the claimant named a session |
| session X | session X | `GRANTED` — same session; state preserved |
| session X, not live | session Y | `ADOPTED` — ownership transfers |
| session X, live | session Y, `claim: "join"` | **refused**, nothing mutated |
| session X, live | session Y, `claim: "takeover"` | `TAKEN_OVER` — deliberate migration |

A session is **live** while it holds an OPEN connection **or** has been heard
from within `sessionStalenessMs` (default 30 s). Both are checked because an
HTTP-only host has no socket to observe, and because a host that is actively
ticking is a live owner even between registrations — any message carrying
`session_id` refreshes liveness, not just registration.

### What happens to the abandoned connection's state

This is recorded rather than assumed:

- **Agents survive.** A dropped socket is not a host decision to retire a crowd,
  and the state is exactly what a reconnect needs.
- **Ownership survives.** The session stays credited with its agents.
- **The session is marked detached.** `GET /api/v1/sessions` shows
  `attached: false` and a `detached_at` timestamp, with the agent count intact.
- **Detached is not immediately adoptable.** A rival is still refused while the
  owner is inside its liveness window, so a brief drop is not an invitation. The
  owner's own reconnect is unaffected, because rule 2 does not depend on the
  window at all.
- **Once not live, the agents become adoptable** by whoever asks — which is how
  a restarted process that lost its in-memory session list recovers its crowd.

### Refusals are not mutations

A refused claim changes nothing: no trait merge, no ownership change, no shadow
or duplicate agent, and the owner keeps exactly what it had. The singular route
returns **409** with `code: "OWNED_BY_LIVE_SESSION"` and a hint that
`claim: "takeover"` is the deliberate alternative, rather than a `200` that
implies success. The batch route reports it per entry in `refused[]` with
`index`, `agent_id`, `reason` and `owner_session_id`.

### Backward compatibility is total

A caller that names **no** session is granted unconditionally *and records no
ownership*. With nothing ever owned, arbitration has nothing to arbitrate — so
every host that shipped before sessions existed behaves byte-identically, and
`ClaimArbitration.active` stays `false` for them. Ownership becomes a real
contract only once a host opts in.

### Cost

`RuntimeSimulation` never consults `ClaimArbitration`. Ownership gates *claims*,
not observations or ticks, so the per-tick hot path is untouched and the host
keeps authority over its agents. The server consults it on registration,
unregistration and reset only.

## Client side

Both Godot clients carry `session_id`, assigned **once** in `_ready()` and sent on
the handshake and on every registration (singular and batch). A per-socket value
would make the host a stranger on every reconnect, which is why the wiring probe
asserts the assignment site rather than the field's existence. `claim_mode`
defaults to `"join"` so a host never displaces a live owner by accident.
Registrations a live session refused are counted in `refused_claims` and reported
**once**, never requeued — a retry loop would fail identically while looking like
progress.

## Evidence

### Real sockets — `verify_server_reconnect.mjs`

The contract is proven over actual loopback WebSockets, with two live sockets and
two session ids competing for one crowd:

```
--- registration and first tick: PASS
--- close/reconnect state continuity: PASS
--- real-socket validation and explicit retirement: PASS
--- rival host over a real socket is refused: PASS
--- abandoned connection preserves state and ownership: PASS
--- reconnect re-adopts the same crowd without duplication: PASS
--- explicit takeover, teardown, and ownership release: PASS
```

Specifically asserted: the claiming session is bound to the *server-side* socket
identity; the same session re-claiming its own agent is never a conflict; a rival
registers the unowned agents and only those, with the owned agent refused and
named against its live owner; the refused agent's traits are unchanged
(`fear` stays `0.42`, not the rival's `0.99`) and no duplicate agent is created;
after the owner's socket closes its agents *and* ownership survive, the session
reads detached, and a rival is **still** refused while the owner is warm; the
owner returning on a **new** socket with the same session id re-adopts both
agents with state preserved and receives a working tick; `takeover` transfers
ownership and is counted; and batch teardown releases ownership so the freed id
is normally claimable again.

Detachment is *awaited*, not assumed, because the server's own `close` handler
runs independently of the client's close event.

### No listener — `verify_server_lifecycle.mjs`

The same rules without a socket, plus the anonymous-caller compatibility case and
reset semantics: clearing agents clears ownership with them, so a fresh session
can claim an id a reset freed and is recorded as a fresh `GRANTED` rather than
inheriting a stale owner.

### Wiring — `verify_godot_live_pipeline.mjs`

Tripwires pin that the client's session id is assigned once (not per connection),
travels on singular and batch registrations, is named on the handshake, that
`claim_mode` defaults to `join`, that refusals are reported rather than requeued,
and that the live suite asserts `refused_claims == 0`. The session-id guard was
drift-tested: regenerating it per `_ready()` fails the probe with *"a per-socket
id would make the host a stranger on every reconnect"*.

The in-engine live suite independently asserts the client's session identity and
`refused_claims == 0` against a real server (`37 / 37`, exit 0).

## What this does NOT claim

- **No authorization layer.** Ownership governs claims, not reads. A tick for an
  agent is served whether or not the caller owns it: the middleware stays
  advisory and the host keeps authority. This is a session bookkeeping contract,
  not a security boundary.
- **No cryptographic identity.** A `session_id` is a caller-declared string. A
  hostile client that guesses a live session's id can act as it. This is a
  duplicate-host and reconnect contract for cooperating processes, not
  authentication.
- **No session persistence.** Sessions live in server memory. A server restart
  loses them, and the agents a snapshot restores from `save`/`load` come back
  unowned until a host claims them, which it then does as a fresh `GRANTED`.
- `sessionStalenessMs` is a liveness *heuristic*, not a heartbeat protocol; a
  host that goes silent for longer than the window while still running can have
  its agents adopted.
