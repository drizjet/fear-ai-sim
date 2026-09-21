# Transport Signing, the Identity Audit Timeline, Adversarial Fuzzing, and the EditMode Gate — 2026-09-20

**Scope:** four additions to the ownership and transport layer, with the evidence
for each. Request signing makes a leaked session token insufficient; a bounded
identity timeline makes "what happened to my session" answerable; a seeded fuzzer
attacks the ownership layer on purpose; and the Unity adapter finally has EditMode
tests that a machine with an Editor can run. Middleware contracts only — this is
**not** a TLS, confidentiality, authorization, or host-integration claim.

## 1. The honest limitation this closes

Every previous ownership probe ended with the same sentence: *a session token is a
bearer credential, so whoever holds the string can act*. That was true and it was
the sharpest remaining edge in the layer, because the token is exactly the thing
that escapes — into a snapshot, a log line, a crash dump, a backup, another
process on the machine, or anyone reading the wire.

Request signing adds a second factor the wire never carries: a host-generated
RSA-2048 keypair, with only the public half given to the server. A signature
covers the exact request bytes, so a captured request cannot be re-sent; the
private key never travels, so a lifted token is no longer enough.

## 2. Why RS256 and not the nicer primitive

RS256 (RSA-2048, SHA-256, PKCS#1 v1.5) is the one asymmetric primitive every
language in this repository already has without shipping a dependency: Node's
`crypto`, Godot's `Crypto.generate_rsa`/`sign`, .NET's `RSA.SignData`, Python's
`cryptography`. Ed25519 is smaller and would have been the better choice, but
Godot's `Crypto` does not expose it and the .NET 8 BCL does not either — and an
adapter that cannot sign is an adapter that silently falls back to a bearer token,
which is the failure this exists to prevent.

Interoperability was **verified before the design was committed to**: a signature
produced by the real Godot 4.6 binary verifies in Node against the PEM Godot
exported.

## 3. The canonical input, and the trap in it

A signature is only as meaningful as the byte string it covers, so the string is
defined explicitly:

```
FEAR-AI-SIGN-V1
HTTP
<METHOD, uppercase>
<request target exactly as sent>
<sha256 of the raw body, lowercase hex; sha256("") when empty>
<session_id>
<issued_at, decimal milliseconds since the Unix epoch>
<nonce, hex>
```

Every line ends with a single LF, including the last. Method, target and body hash
are all covered, so a signature cannot be lifted from a GET and reused as a POST,
repointed at another route, or survive an edited body.

**The trap, found by failing:** `issued_at` must render as a decimal **integer**.
Godot's JSON parser returns numbers as floats, so `str(issued_at)` produced
`1758400000000.0` and the server refused the signature as `SIGNATURE_INVALID` —
which looks exactly like a broken key. A client that reads the timestamp out of
JSON must `str(int(x))` it. This cost one debugging cycle and is now covered in
every language.

## 4. WebSocket authenticates once, against a fresh challenge

Signing every WebSocket frame would put an RSA signature on every simulation
step, which no host should pay. So a connection authenticates **once**, against a
challenge the server generates and has not used before. That is strictly stronger
than a client-chosen nonce — there is nothing to capture and re-send, and no clock
to trust — it costs one signature per connection, and it composes with the
existing model, because the connection is what `bind`/`bindIfProven` already
attach to a session. The challenge is retired on use, so a captured response
answers a question that has already been thrown away.

## 5. The policy, and why the default is not `required`

| Policy | Meaning |
| --- | --- |
| `off` | Signatures are ignored entirely. Every pre-signing client, probe and adapter keeps working untouched. |
| `preferred` (**default**) | A caller that **presents** a signature must present a valid one. A malformed, stale, replayed or forged signature is refused and **never** silently downgraded to the bearer path. A caller that presents none is judged by the token rules as before. |
| `required` | A request or connection that **names** a session which has a registered signing key must sign. The token alone is then insufficient — the entire point. |

`preferred` is safe to leave on everywhere because it cannot break a host that
does not sign, and it cannot be used to bypass anything. `required` is scoped to
sessions that have a key on purpose: a host that never registered one cannot be
locked out of its own crowd by a policy flag it did not ask for, and an anonymous
caller owns nothing, so the pre-session behaviour is unchanged.

## 6. Two design decisions that took a failure to get right

**The first claim cannot be signed.** No session exists yet for a signature to
belong to, so signing it would be refused as an unknown key — and that claim is
the one carrying the public key, so refusing it would leave the host unable to
ever establish one. Signing starts only after the server **confirms** the key.

**Rotation needs two proofs.** A caller holding the token alone must not be able
to install its own key; if it could, stealing the token would upgrade into a
permanent takeover — install a key, and the legitimate host is locked out by the
feature meant to protect it. So under `required` the gate refuses an unsigned
rotation before arbitration sees it, and the token holder can only rotate while
also proving the **current** key. Both directions are asserted.

## 7. What each language now does

| Client | Shape |
| --- | --- |
| Node (`RequestSigner.js`) | `signHttpRequest`, `signChallengeResponse`, `generateSigningKeyPair` |
| Godot (`packages/adapters/godot/fear_ai_client.gd` and the addon copy) | `Crypto.generate_rsa(2048)`, an SPKI PEM built by the client, `_canonical_http`, `_rsa_sign`, the key persisted with the credential so a restart keeps its identity |
| Python (`fear_ai_client.py`) | `enable_signing()`, the key generated and kept host-side, headers on every control-plane request |
| C# standalone (`FearSigning.cs`) | deliberately written on the **oldest** surface that ships: no `ImportFromPem`, no `ExportSubjectPublicKeyInfoPem`, no `Convert.ToHexString`, an instance `RandomNumberGenerator`, and a hand-built SPKI DER |
| Unity (`Runtime/FearSigning.cs`) | the same conservative implementation, so the Editor does not depend on .NET 5+ members |

The C# rewrite was forced by the compile gate: the first version used
`ImportFromPem`/`Convert.ToHexString`, which do not exist on the `netstandard2.0`
target the standalone client builds for. That is exactly the defect a compile gate
exists to find.

## 8. The server-side gate

Verification is a **pure decision**, taken at one choke point before any route
runs, so nothing is mutated on a refusal. Failures are counted by reason and land
in the same refusal log the dashboard already explains:

| Reason | Meaning |
| --- | --- |
| `SIGNATURE_MISSING` | the named session has a key and `required` is on |
| `SIGNATURE_MALFORMED` | an incomplete header set, or a non-integer timestamp, or a signature that is not base64 at all |
| `SIGNATURE_UNSUPPORTED_ALG` | an algorithm this version does not define — refused, never ignored |
| `SIGNATURE_UNKNOWN_KEY` | no key for this session, or a key id that names a key the server does not hold |
| `SIGNATURE_STALE` | outside the two-minute skew |
| `SIGNATURE_REPLAY` | a nonce already accepted |
| `SIGNATURE_INVALID` | legal base64 that simply does not verify |
| `SIGNATURE_UNKNOWN_CHALLENGE` / `SIGNATURE_EXPIRED_CHALLENGE` | WebSocket handshake |

Ordering is deliberate: the replay check runs **before** the signature is decoded
or verified, so a capture-and-resend loop is cheap to refuse. A consequence worth
stating: a malformed signature sent with an already-accepted nonce reports
`SIGNATURE_REPLAY`, not `SIGNATURE_MALFORMED`. The probe asserts the classification
that actually occurs rather than the one that reads better.

`_nonces` is swept on insert and capped, and a nonce is remembered **only after**
a valid signature, so a flood of junk cannot fill the cache and evict the nonce of
a request an attacker wants to replay.

## 9. Evidence: `tools/verification/verify_transport_signing.mjs` — 61 assertions

- **The decision matrix (15)** — a correct signature is accepted; the same
  signature a second time is `REPLAY`; an edited body, a repointed route and a
  changed method all fail; a stale timestamp is `STALE`; the attacker's own key
  labelled with the victim's key id is `INVALID`; an unknown key id is
  `UNKNOWN_KEY`; `HS256` is `UNSUPPORTED_ALG`; an incomplete header set is
  `MALFORMED` and **never** downgraded to the token path; a signature that is not
  base64 is `MALFORMED`; a session with no registered key cannot be signed for;
  50 junk signatures do not grow the replay cache; every refusal is counted by
  reason; `rejected` is not derived as `accepted - verified` (that derivation was
  a real defect: every *unsigned* legacy request was being reported as a
  rejection).
- **Policy semantics against a live server (22)** — `off` ignores a key, `preferred`
  keeps token-only hosts working while refusing both a well-formed-but-wrong and
  an unreadable signature (and mutating nothing in either case), `required` refuses
  a **leaked token alone** with nothing mutated, accepts the same request signed,
  refuses the replay, gates a signed **read**, leaves an anonymous caller
  untouched, refuses a stranger's key swap, refuses a leaked token's attempt to
  install a new key, allows the token holder to rotate only while proving the
  current key, retires the old key immediately, and accepts the new one with no
  restart in between.
- **The WebSocket handshake (7)** — a per-connection challenge of ≥32 characters
  naming `RS256`, an acknowledged signed response, a challenge that cannot be
  answered twice, a token-only envelope on a keyed session refused with
  `SIGNATURE_MISSING`, and nothing torn down by it.
- **Restart continuity (6)** — the snapshot carries the public key and **no private
  material and no token**; the restored session still holds the key; a signature
  made for the old process verifies in the new one.
- **Cost, measured not asserted (1 + a number)** — **0.62 ms per request** for an
  RS256 verify over 200 samples, on this machine, on the **control plane only**.
  Ticks, observations and advisories are never signed, so the simulation hot path
  is untouched.
- **Cross-language interop against a real server (10)** — the Python client
  generates and registers a key, signs its teardown and is never refused, and the
  server holds the fingerprint the client built; the **Godot adapter does the same
  in-engine inside the real 4.6 binary**, including the fingerprint check.

## 10. What signing does NOT do

It is not TLS. Payloads remain plaintext and a wire reader still sees every
observation, advisory and agent id — it still learns the public key, which is
harmless. What it can no longer do is *act as* the host: it cannot mint a new
signed request, and it cannot re-send one it captured. Confidentiality is a
transport problem this does not pretend to solve.

The **binary wire carries no session identity at all**, so a key cannot gate it.
That is stated rather than implied, and it is why the signing work does not make
the binary path authenticated.

The private key is stored **unencrypted** when a host chooses to persist it, which
makes it exactly as sensitive as the token it supplements. Persistence of the key
is therefore a host decision, and signing is off by default.

## 11. The identity audit timeline

The refusal log answers *"why was my NPC not registered"*. It cannot answer *"what
happened to my session"*, because that answer usually begins with a **grant** the
host did not expect. So `ClaimArbitration` now carries a second, bounded ring:

| Field | Meaning |
| --- | --- |
| `timeline[]` | newest-first, bounded to 100 (`EVENT_LOG_LIMIT`) |
| `events_recorded` | a monotone counter that keeps rising past the ring, so "the last 100" is honest rather than "all there were" |
| `timeline_scope` | `THIS_PROCESS`, stating that the ring is **not** part of a snapshot, so an empty timeline after a restart is not read as "nothing happened" |

Each row is a name, an id, an outcome and a timestamp — no token, no signature, no
key body — so it rides on the same token-free surface as the rest of the ownership
view. Rows are recorded at the four places that matter:

- `identity` — a claim resolved, with the **proof** that held: `new_credential_issued`
  or `presented_valid_token`, the outcome (`GRANTED` / `ADOPTED` / `TAKEN_OVER`),
  and whether the credential was rotated because it had expired;
- `claim` — a **per-agent** grant. A batch of 512 is one identity decision and 512
  ownership decisions, and "which NPC did I lose" needs the second kind;
- `signing_key` — registered or replaced, with the **fingerprint only**;
- `revoke` — with the number of agents released.

Refusals are recorded **inside `_recordRefusal`**, which is the single method every
refusal path already funnels through. Hooked there rather than at each call site,
so a new refusal path cannot forget to be on the timeline.

`GET /api/ownership` renders it as `timeline[]` with a `meaning` per row
(`info` / `granted` / `recovered` / `handover` / `refused`) and a one-line
`headline`, and the Sessions tab gained an **Audit Timeline** button. A refused row
is rendered by the *same* explainer the drill-down uses, so the two descriptions
cannot drift.

## 12. Evidence: `verify_dashboard_endpoints.mjs` — 13 endpoints, 11 tabs

Added on top of the existing refusal drill-down coverage:

- 7 ordered decisions with grants and refusals on one stream, verified newest-first;
- the **oldest** granted identity row is the one under test (`.pop()` on a
  newest-first list, not `.find()` — the first draft asserted the wrong end);
- a credential-proven grant is distinguishable from a fresh name claim, and does
  **not** report a newly issued token;
- one granted **per-agent** claim, at agent granularity;
- a refused claim's timeline headline is **byte-identical** to the drill-down's;
- every row has a headline and a renderable `meaning`;
- no token-keyed **string** field anywhere in the timeline;
- 204 decisions in a separate arbitration object leave the ring at exactly 100
  rows, with the oldest evicted, the newest kept, and the counter still rising.

## 13. Adversarial fuzzing: `verify_fuzz_arbitration.mjs` — 16 assertions

Every other ownership probe drives a hand-written scenario, and hand-written
scenarios test the cases their author thought of. The interesting bugs in this
layer have all been of the other kind: refreshing the incumbent's liveness on a
**refusal** turned name-spamming into a denial of service that no happy-path probe
would have noticed.

So the fuzzer is **seeded and replayable** (mulberry32; the seed is printed, and
section 2 proves the same seed reproduces the identical trace and a different seed
does not). It runs 4,500 operations across three seeds against the arbitration
object with an **injected clock** — because staleness and adoption are only
reachable by moving time — and 240 more operations across the live HTTP control
plane.

| Invariant | Checked |
| --- | --- |
| **I1** a refusal is inert | a denied claim, teardown, reset or revoke leaves ownership byte-identical |
| **I2** a stranger cannot reach a live crowd | an unproven caller may not take, remove or wipe a **live** session's agent, and may only remove one from a session that has gone quiet |
| **I3** a credential is not a name | a grant not accompanied by a fresh credential had to be proven with the **current** one |
| **I4** conservation | owned agents == sum of per-session counts == agents with a recorded owner, after every single operation |
| **I5** a revoked credential is worthless | re-submitting it proves nothing |

Two findings from building it are worth recording, both of which were the probe
being wrong rather than the code:

1. The first world fingerprint included the set of **session names**, so the fuzz
   "failed" immediately on a legitimate case: a claim refused at the per-agent step
   still **creates** the claimant's session row with zero agents — which the
   dashboard probe asserts is the *correct* behaviour. The invariant is about who
   owns what, not about which names have been heard.
2. A blanket "this verb reduced ownership" check was scoped, wrongly, to every verb.
   Tearing down, revoking and resetting are *supposed* to release agents; the check
   now applies to `claim`, which may only ever add.

Section 4 drift-tests the fuzzer itself, because a probe that cannot fail proves
nothing: it drives a deliberately **broken** arbitration (a refusal that mutates)
and requires the inertness check to fire, then drives a **half-applied** release
and requires the conservation check to fire. The first version of that second check
claimed conservation was sensitive to a *consistent* release — it is not, and the
claim was wrong rather than the check.

## 14. Live-tier assertions

Across the wire the fuzzer additionally checks that no request produced a 5xx or an
undeclared status, that the server's own summary stayed self-consistent
(per-session counts summing to `owned_agents`), and the sharpest form of the liveness
rule: **a name-only caller knocking 40 times was never handed a credential for the
live session**, gained no agent, and left the owner's own teardown working.

## 15. Unity EditMode tests and the Editor gate

The standing Unity limit was `IMPLEMENTED_NOT_EDITOR_VERIFIED`. This does **not**
remove it — there is no Unity Editor on this machine — but it changes what the
limit costs and makes the gap closable in one command on a machine that has one.

**A real EditMode test project** now lives in the package
(`packages/adapters/unity/Tests/EditMode/`, with `FearAI.EditModeTests.asmdef`):
Editor-only, guarded by `UNITY_INCLUDE_TESTS` so it cannot leak into a player
build, referencing `FearAI.Runtime` plus both test-runner assemblies. Four
fixtures, ~24 tests:

- **The signer** — the generated PEM is well-formed with 64-character lines; the
  hand-built SPKI DER is **parsed** and asserted structurally (one rsaEncryption
  algorithm identifier with an explicit NULL, a zero-unused-bits BIT STRING, a
  2048-bit zero-padded modulus, an exponent of exactly 65537); the key id is
  independently re-derived here as the SHA-256 fingerprint of that same DER;
  exported private-key text restores the *same* identity; signatures are complete,
  single-line, `issued-at` is a decimal **integer** in milliseconds, the nonce is
  128 bits of hex, and the signature is exactly 256 bytes.
- **The credential stores** — in-memory round trip and a second instance always
  being a stranger; file store round trip across a *new instance*; loading does not
  consume the store; `Clear` removes the file; a **corrupt** store is reported and
  **left alone**; a name with no token is not a usable identity; PlayerPrefs round
  trip and two namespaced keys not colliding.
- **The client defaults** — persistence off, `InMemorySessionStore` by default,
  signing off with no key, no credential, `claimMode == "join"` (a default of
  `takeover` would silently steal a running host's agents), capabilities empty and
  configurable, and `ClearStoredSession` not touching what the running host holds
  in memory.
- **The JSON surface** — newlines escaped rather than emitted raw (the defect found
  by executing the adapter against a real server), quotes/backslashes/control
  characters, and a **round trip through `JsonUtility`** to prove the emitted array
  actually parses.

**A runner that can be run anywhere and lies nowhere**:
`tools/verification/verify_unity_editor_tests.mjs` (`npm run verify:unity-editor`)
finds the Editor (`FEAR_AI_UNITY`, then the Hub install roots, verified with
`-version`), assembles a **throwaway project** in a temp directory whose manifest
takes `com.fearai.middleware` as a local `file:` dependency and lists it in
`testables`, then runs `-batchmode -runTests -testPlatform EditMode`. It fails on a
red test, on **zero tests executed** (what happens when the package is not in
`testables` — a green result for the wrong reason), and on a missing results file.
Without an Editor it prints `SKIPPED`, states exactly what was and was not proven,
and exits 0 — unless `FEAR_AI_UNITY_REQUIRED=1`, which is what a machine that
*has* an Editor should set, where a skip is a real failure.

**The tests are compiled here even though they cannot be executed here.** A
minimal NUnit surface (`tools/verification/unity/NUnitShim.cs`, with **real**
assertion implementations rather than no-ops) plus the existing UnityEngine shim
let `verify_dotnet_adapters_compile.mjs` compile the EditMode tests on this
machine. Without it the tests would be neither run **nor** compiled — shipped
unread by a compiler, which is the exact weakness that probe exists to remove. The
probe's own report says, on the way out, that these tests are **compiled and not
executed**.

`FearRequestSigner`'s file header asks whether the Editor's scripting profile
accepts the hand-built SPKI DER. The structural assertions answer the part of that
question that can be answered without an Editor, and the EditMode run answers the
rest — on a machine that has one.

## 16. The same-class escaping defect, found and closed

While writing the EditMode tests, `JsonHelper.ToJsonStringList` turned out to have
its **own** copy of the old two-case escaper — quotes only. A list entry containing
a newline produced invalid JSON through a public API, which is the identical
defect `EscapeJson` had already been fixed for, one call site over. There is now
one escaper (`JsonHelper.Escape`), and both call sites use it. Two implementations
of an escaper is how a fix like that comes back.

## 17. One tripwire that was measuring itself

`verify_godot_live_pipeline.mjs` asserted that the Godot client saves its
credential at issue time using a fixed character window
(`/func _adopt_session_token[\s\S]{0,900}?…/`). The signing work legitimately grew
that function — the key report now lands at the top of it — and the check failed
for a reason unrelated to what it was checking. The tempting repair is to widen the
number until it passes, after which the check no longer asserts what it was written
to assert. It now slices the **real function body** up to the next `func`, which has
no tolerance to tune.

## 18. Final state

- **24 / 24 standalone probes green** (`tools/verification/verify_*.mjs`), including
  the new `verify_transport_signing.mjs` (61), `verify_fuzz_arbitration.mjs` (16),
  and `verify_unity_editor_tests.mjs` (SKIPPED, exit 0, by design).
- **In-engine Godot: 4 / 4 suites exit 0** — `run_showcase_conformance.gd` 13/13,
  `run_civilization_godot_conformance.gd` 3/3, `run_canonical_conformance.gd` 4/4,
  `run_showcase_live_conformance.gd` 38/38.
- **Host token persistence: 19 assertions across 3 Godot processes.**
- **Unity: 21 behavioural assertions across 3 OS processes**, plus 17 compile-gate
  checks that now include the EditMode tests.

## 19. Scope boundary — what this is not

- **Not TLS and not confidentiality.** Payloads are plaintext and a wire reader
  sees everything. This authenticates requests and makes them non-replayable.
- **Not binary-wire authentication.** That transport carries no session identity,
  so it cannot be gated by a key.
- **Not a security certification.** Bounded protocol defenses on a loopback
  transport, with no per-route scoping and no distributed-system story.
- **Not live Editor Unity evidence.** The EditMode tests exist, are compiled, and
  have a runner; no Editor has executed them here, so the Unity row keeps its
  qualifier.
- **The timeline is a per-process diagnostic ring**, not a durable audit log: it is
  empty after a restart by design and says so.
- **The fuzz is single-threaded and sequential** — one decision at a time, the way
  the server drives arbitration. It says nothing about concurrency or timing.
- **Nothing here generalizes to Unreal**, and no universal multi-engine claim is
  made.
