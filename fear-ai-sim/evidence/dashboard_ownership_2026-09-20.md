# Dashboard Live Ownership Surface — 2026-09-20

**Scope:** the designer dashboard's read-only view of server session ownership
(`GET /api/ownership`), the CLI attach path that makes it real, and the
credential-sanitising rule that keeps it safe to render. Observability evidence
only — this is **not** a security, authorization, host-integration, or
performance claim.

## Why it exists

Session ownership landed server-side (`packages/runtime/src/ClaimArbitration.js`,
`GET /api/v1/sessions`) with a token identity model, but a designer could not see
any of it: the dashboard attached a `RuntimeSimulation` and nothing else, so
"who owns this crowd, and can they *prove* it?" was only answerable by hand with
`curl`. The dashboard is the tool people actually sit in front of, so ownership
that is invisible there is ownership nobody checks.

## What was added

| Piece | Shape |
| --- | --- |
| `DesignerDashboardServer.attachOwnership(arbitration)` | attaches a live `ClaimArbitration` **separately** from the simulation, because ownership is server-level state rather than simulation state, and a dashboard can legitimately hold one without the other |
| `GET /api/ownership` | `ATTACHED_READ_ONLY` with `scope: SERVER_SESSION_STATE`, `readOnly: true`, `simAttached`, an explicit `note` that ownership gates claims and not ticks, and the arbitration summary — or `NO_OWNERSHIP_SOURCE_ATTACHED` when there is nothing to read |
| `fear-ai dashboard --middleware [--middleware-port <port>]` | starts a `FearServer` in-process and attaches **both** its simulation and its claims |
| Dashboard tab 11 ("Sessions & Ownership") | per-session table: agents owned, liveness, provenance (`seen this process` vs `restored, unproven`), credential status (`can prove continuity` vs `name only`), and claim/adoption/takeover/refusal counts |

`/api/status` now advertises `SESSION_OWNERSHIP` alongside its other features.

## Two states, not one

`attached: false` and `sessions: []` are different facts, and rendering the
second for the first would tell a designer "nobody owns anything" when the truth
is "this dashboard is not looking at a server". The endpoint therefore mirrors
`/api/sim/inspect`'s existing convention and refuses to render an empty view for
an unattached server.

## Read-only by construction

`POST /api/ownership` is a `404`. The display layer has no claim, release or
reset path at all, so a designer watching the view cannot change who owns a
crowd — the boundary is a missing route rather than a permission check that could
be forgotten.

## Token-free, and over-stripping is treated as a defect

`ClaimArbitration.summary()` already omits token hashes. `_stripTokenMaterial`
is defence in depth so a future field rename cannot quietly turn the dashboard
into a credential display.

Writing it produced a real defect that this work's own probe then caught: the
first version stripped **any** token-keyed field, which removed `has_token` — the
single most informative field in the view, since it answers "can this host prove
continuity, or does it only know a name?". A designer would have read the missing
field as "no credential". The rule is now "a credential is token-keyed **string
or container** material", so derived booleans and counters (`has_token`,
`token_mismatches`, `tokenized_sessions`) survive while `token_hash`,
`session_token` and `api_token` do not.

The probe drift-tests the sanitiser **both ways**: three credential strings must
be absent, and six ordinary view fields must survive.

## Verification

```
node tools/verification/verify_dashboard_endpoints.mjs
```

`ALL 13 DASHBOARD ENDPOINTS, 11 TABS, ATTACHED INSPECTION & LIVE OWNERSHIP PASSED CLEANLY`

New assertions, all passing:

- unattached ownership is `NO_OWNERSHIP_SOURCE_ATTACHED` and reports `simAttached: true` (proving the two attachments are genuinely independent);
- `POST /api/ownership` returns `404`;
- with a live tokenized owner and a refused name-only rival: the owner is listed `live: true`, `has_token: true`, `agent_count: 1`; the refusal total is visible; and the **refused rival is listed with zero agents rather than hidden**;
- no token-keyed field in the rendered JSON holds a string;
- the sanitiser strips credentials and preserves flags/counters.

### End-to-end through the CLI

`fear-ai dashboard --middleware --port 8799 --middleware-port 8798` (both ports
verified free first), then two agents registered through the real middleware:

```
POST /api/v1/register/batch  {"session_id":"cli_probe","agents":[{"agent_id":"npc_1"},{"agent_id":"npc_2"}]}
  -> {"status":"REGISTERED","count":2,"registered":["npc_1","npc_2"],
      "claims":[{"agent_id":"npc_1","claim":"GRANTED"},{"agent_id":"npc_2","claim":"GRANTED"}],
      "session_id":"cli_probe","session_token":"fe255ba3…"}

GET http://127.0.0.1:8799/api/ownership
  -> {"attached":true,"status":"ATTACHED_READ_ONLY","simAttached":true,
      "scope":"SERVER_SESSION_STATE","readOnly":true,
      "summary":{"owned_agents":2,"session_count":1,"tokenized_sessions":1,
                 "sessions":[{"session_id":"cli_probe","agent_count":2,"live":true,…}]}}
```

The dashboard read the live middleware's ownership over its own port, with the
token never present in the response. The listeners were killed afterwards; no
stray process was left bound.

## Limits (unchanged by this work)

- The dashboard remains **observability only**. It cannot claim, release or
  arbitrate; it cannot tick; it has no authority over agents.
- Two of the eleven tabs are live reference simulations, seven are deterministic
  vignettes, and two (`/api/sim/inspect`, `/api/ownership`) are attached live
  state. The other tabs are not live middleware views, and this record does not
  change that.
- Ownership is session bookkeeping for cooperating processes, not authentication:
  the transport is plain loopback, and the ownership summary being token-free
  says nothing about the transport being safe.
- An ownership snapshot is not liveness: restored sessions are deliberately
  unbound, so "present in the snapshot" must never be read as "host is alive".
- Liveness, staleness and adoption semantics are the server's
  (`sessionStalenessMs` heuristic); the dashboard only reports them.
