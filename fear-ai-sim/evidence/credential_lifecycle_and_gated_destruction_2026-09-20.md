# Credential Lifecycle, Gated Destruction, and the Refusal Drill-Down — 2026-09-20

**Scope:** the server-side session credential (expiry, rotation, revocation), the
ownership gate on the destructive verbs (`unregister`, `reset`), the removal of a
liveness-refresh path an unproven caller could drive, and the dashboard's
per-refusal explanation. Evidence for server and middleware contracts only — this
is **not** a transport-security, authorization, or host-integration claim.

## Why it exists

Three separate holes were open at once, and each one was open because the
ownership model had only been applied to *registration*:

1. **Teardown was unauthenticated.** `POST /api/v1/unregister`,
   `/unregister/batch` and the WebSocket twin removed any agent for any caller.
   Registration was carefully arbitrated while destruction was free, which made
   every claim rule beside the point: an attacker who could not steal a crowd
   could simply delete it.
2. **`reset` was unauthenticated.** `{clear_agents: true}` wiped every agent on
   the server, and a bystander could do it while a host was live.
3. **A stranger could pin a session.** `_settleIdentity` refreshed the
   incumbent's `lastSeen` on a refusal, on the reasoning that an incumbent whose
   name had just been spoken was probably still around. That reasoning was
   wrong: nothing a stranger sends can *shorten* the window (the window is a
   function of the incumbent's own silence), so the refresh could only ever
   *extend* it — a denial of service where repeating a name keeps a crowd locked
   to a credential nobody, including an owner that lost its token, can produce.
   Removed. Liveness now moves on proven traffic only.

The credential itself was also unbounded: a token issued once was valid forever,
there was no way to rotate it on suspicion, and no way for a host to end a
session it was done with.

## What changed

| Change | Shape |
| --- | --- |
| `authorizeTeardown(agentId, {sessionId, token})` | pure decision, never mutates. Unowned → allowed; owned by the caller's **proven** session → allowed; owned by a session that is **no longer live** → allowed and reported as `RELEASED_OWNER_STALE`; owned by a **live** session → refused, and the refusal is recorded |
| `authorizeReset({sessionId, token})` | refused while another live session owns agents, with the blocking sessions named; a middleware restart is the deliberate escape hatch, because restored sessions are unbound and therefore not live |
| Gated routes | HTTP `/unregister`, `/unregister/batch`, `/reset`, WebSocket `UNREGISTER_AGENT`, `UNREGISTER_AGENT_BATCH` — the wire a request arrives on does not change who may make it |
| `tokenTtlMs` (default 7 days, `0` disables) | an expired credential is honoured **once** and replaced in the same response. Refusing it outright would turn a long absence into a lockout against the session's own host |
| `rotate_token: true` on any claim | honoured only for an identity that already matched, so it cannot rotate a credential the caller does not hold |
| `POST /api/v1/session/revoke` | ends a session on the host's instruction: the record goes, the name becomes free, and its agents are **released but stay registered**. 404 for an unknown name, 403 for a wrong credential, 400 for a missing one |
| `refusalLog` (bounded to 25, newest first) + `refusals_by_reason` | each record carries the verb, the agent, who asked, who blocked it, and a `retry_after_ms` |
| `_blockerRetryAfter` / `retryAfterFor` | `null` when the blocker holds an open connection (no deadline), a real countdown otherwise — the two are different answers and are reported differently |
| Dashboard `Sessions & Ownership` drill-down | `GET /api/ownership` now returns `refusals[]` with a one-line `headline` and a `resolution` sentence; a second button renders it |

`GET /api/ownership` remains **read-only by construction**: `POST` is a `404`, so
the display layer has no arbitration path at all.

## The teardown-credential bug this exposed

Making teardown ownership-gated immediately broke an honest host: every adapter
sent `session_id` when retiring agents and **none of them sent the token**, so a
name-only teardown was correctly refused as a stranger's request. The Godot
in-engine run found it (the rival could not retire an agent it had adopted), and
the same gap was then fixed in Unity, C# and Python. That is the failure mode
worth recording: the gate was right and four clients were wrong, and only running
a real client could tell the difference.

Unrelated but found in the same pass: the Godot client cleared its local
"registered agents" view when a `clear_agents` reset was *sent*, not when it was
confirmed. A refused reset would therefore have left the host believing a crowd
was gone while the server still simulated it. It now clears on confirmation only.

## Evidence

`node tools/verification/verify_server_lifecycle.mjs` — three new sections
alongside the existing seven:

* **Destructive verbs are ownership-gated** — a stranger's singular teardown is
  `409` with the owner named and a `retry_after_ms`; naming the owner *without*
  the token is still a stranger; a batch teardown reports each refused id
  individually and mutates nothing; the WebSocket batch is gated identically; the
  owning session retires its own crowd; and an agent whose owner has gone quiet
  is *cleanup*, reported as `RELEASED_OWNER_STALE` rather than refused.
* **Credential lifetime** — a requested rotation retires the old token
  immediately (`409 SESSION_TOKEN_MISMATCH` on reuse) while the new one works; a
  wrong token cannot rotate the real credential; an expired credential is
  honoured and replaced in one response (`token_expired: true` + a new token); a
  revocation without the credential is `403` and changes nothing; an unknown
  session is `404`; a proven revocation releases its agents, ends ownership via
  `active === false`, keeps the agents registered, and leaves the name free for a
  fresh claim.
* **Refusal drill-down** — a refused claim and a refused teardown are both
  present, each naming the agent, the caller and the blocker with a bounded
  countdown; the two are tallied under different reasons; and 60 further refusals
  cannot grow the log past its 25-entry bound.

`node tools/verification/verify_protocol_abuse.mjs` — a new section runs the
**hostile host** over a real socket: a client that knows a live session's NAME and
nothing else. It must not claim that session's agents, tear one down, wipe the
world, revoke the session, or rotate the credential; the owner's own credential
must survive it untouched, and no agent or ownership record may move. A second
half proves the liveness fix on the clock: naming an idle session repeatedly does
not keep it live, and once the spam stops the name lapses on schedule (`ADOPTED`).

`node tools/verification/verify_dashboard_endpoints.mjs` — the drift-down is
asserted end to end: verb, agent, caller, blocker, a countdown within the
staleness window, a headline that names the agent, a separately-explained
teardown refusal, both refusal reasons tallied, and the `null`-vs-`0` countdown
distinction (a blocker holding a socket reads as "no deadline", a zero countdown
reads as "this will succeed now").

`node tools/verification/verify_adapter_conformance.mjs` — Suite 7 (24 new
assertions, 210 total) pins the credential-on-teardown contract for all four
adapters with bounded source windows, and is drift-tested: stripping the token
line out of the Unity or Godot teardown body makes the tripwire fail.

## Limits

* Ownership is **continuity, not access control**. It protects a live session's
  agents from other sessions, and it protects nothing else. There is no transport
  security and no user authentication: if the wire can be read, the token can be
  read with it.
* Expiry is a bound on the useful life of a leaked credential, not revocation.
  A stolen token stays usable until it expires, is rotated, or is revoked.
* A stolen token **can** revoke. That is inherent to revocation-by-credential and
  is stated rather than mitigated.
* The refusal log is a diagnostic (25 entries), not an audit trail.
* `RELEASED_OWNER_STALE` deliberately lets anyone clean up a dead owner's agents.
  That is the same window in which those agents are already adoptable, so it
  grants an attacker nothing adoption did not, but it is a real property of the
  model rather than an oversight.
