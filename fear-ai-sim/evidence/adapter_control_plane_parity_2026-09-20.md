# Engine-Adapter Control-Plane Parity — 2026-09-20

**Scope:** bringing Python, the standalone C# client and the Unity adapter up to
the control-plane contract the Godot client already carried, and the per-adapter
verification that backs each claim. Claims are stated **per adapter**, because the
strength of the evidence differs sharply between them.

## Why it exists

The middleware gained session identity and a batched control plane, and the Godot
client used all of it. The other three clients did not: they registered agents one
round trip at a time and never presented an identity, so a host on those engines
could not be recognised on reconnect at all. An adapter that cannot say *who it
is* makes the server treat every one of its hosts as anonymous, and an adapter
that registers a crowd one request at a time pays the exact cost the batch routes
were built to remove.

Worse, the Unity client had **no registration path whatsoever** — `FearAIClient`
only shipped observations for agent ids that had never been registered. Parity was
therefore substantive, not cosmetic.

## The parity contract

Each client now carries, and each is checked for:

1. **Session identity** — a host-chosen `session_id` plus a server-issued
   `session_token`, echoed on **every** claim (registration, handshake).
2. **Batched control** — `POST /api/v1/register/batch`, `/unregister/batch`,
   `/trauma/batch`, with the singular routes retained.
3. **A `404` legacy fallback** — a server that predates batching is detected once
   and the client uses the singular routes for the rest of the session instead of
   retrying an endpoint that is not there.
4. **Refusal/rejection reporting** — a refused claim is counted, a rejected
   teardown id is counted rather than vanishing, and a rejected trauma zone is
   counted rather than looking like success. Partial application that looks like
   complete application is the failure mode a host cannot debug.
5. **The shared bound** — 512 items per request, matching the server's
   `MAX_BATCH_CONTROL_ITEMS`.

`409` (refused, nothing mutated) is distinguished from a transport failure
(python, C#) because one is a decision and the other is a retry.

## What each adapter gained

| Adapter | Gained |
| --- | --- |
| **Python** (`fear_ai_client.py`) | `register_agents` / `unregister_agents` / `add_trauma_zones` (one round trip each), `session_id`/`session_token`/`claim`, `_claim_fields` attached to every claim, `404` fallback, refusal/rejection counters, `session_ownership()` read-only, and a runnable `--self-check` mode |
| **C#** (`FearAIClient.cs`, `FearTypes.cs`) | `RegisterAgentsAsync` (chunked at the cap), `UnregisterAgentsAsync`, `AddTraumaZonesAsync`, `SessionOwnershipJsonAsync`, `SessionId`/`SessionToken`/`ClaimMode`, `ClaimFields()`, `404` fallback, `409` handling, counters, and response models |
| **Unity** (`Runtime/FearAIClient.cs`, `Runtime/FearTypes.cs`) | registration itself (single + `RegisterAgents`), a serialized control-plane pump in `FixedUpdate` running *ahead of* the data plane, `UnregisterAgents`, `AddTraumaZones`, `SessionId`/`SessionToken`/`ClaimMode`, `AppendClaimFields`, `404` fallback, counters, and events for registered/refused |

`SessionOwnershipJsonAsync` returns **raw JSON on purpose**: the summary's shape
belongs to the server, and a client-side copy of it would silently drift.

## Verification, per adapter

### Python — live-verified against a real server

```
node bin/fear-ai.js server --port 8771
python packages/adapters/python/fear_ai_client.py --self-check http://127.0.0.1:8771
```

17/17 checks pass, counters `batched_registration_requests: 1`,
`individual_registration_requests: 0`, `refused_claims: 0`,
`registration_failures: 0`:

- 8 agents register in **one** round trip, every one confirmed, none needing the individual path;
- ownership is readable, reports all 8, and **exposes no token material**;
- a rival that knows the session **name but not the token** is refused, the refusal names the owner, and ownership does **not** transfer;
- a client **presenting the token** reconnects and registers as a plain grant;
- 2 trauma zones apply in one round trip; 8 agents tear down in one round trip;
- nothing silently dropped, and the legacy fallback was never triggered.

### C# — compile-verified and statically conformance-checked

`dotnet build packages/adapters/csharp/FearAI.Client.csproj -t:Rebuild` — **0 warnings, 0 errors**.
There is no live C# runner in this repository, so its runtime behaviour is *not*
exercised here; the claim is compilation plus the static parity assertions below.

### Unity — stub-compile-verified only

`node tools/verification/verify_dotnet_adapters_compile.mjs` compiles
`Runtime/FearAIClient.cs` and `Runtime/FearTypes.cs` outside the editor against
minimal UnityEngine stubs — **0 errors**. This is a strictly stronger check than
reading the file and a strictly weaker one than running it in an editor:

- a stub signature that differs from Unity's real API would compile here and fail in the editor;
- `FearAgent.cs` and `FearAgentHUD.cs` are deliberately outside the stub scope (NavMesh, Physics, GUI, Texture2D and audio stubs would be a second implementation to maintain);
- no MonoBehaviour lifecycle, scene wiring, serialization or rendering is asserted.

The probe reports `SKIPPED`, never `PASS`, when `dotnet` is absent, so a missing
toolchain cannot read as a green result.

## Static parity assertions

```
node tools/verification/verify_adapter_conformance.mjs
```

`SUCCESS: All 186 adapter conformance assertions PASSED.` — Suite 6 holds all four
clients (Godot, Unity, C#, Python) to the parity contract, including:

- each adapter's **declared batch cap is parsed out of its own source and compared against the server's constant**, so bumping the limit on the server cannot leave a client silently sending a different number;
- identity is asserted **at the claim site**, not merely as a stored field — because a client that holds a token but never sends it is still anonymous to the server on every reconnect. Godot inlines its identity rather than funnelling it through a helper, so the assertion names its two payload sites; an earlier version of this check asserted a *helper name* and failed on correct code, which is the difference between testing behaviour and testing shape.

## Limits

- **Per adapter, not in aggregate:** Python is live-verified; C# is compile- and static-verified; Unity is stub-compile-verified only. Reporting these as "all adapters verified" would be false.
- The Python self-check creates and removes its own agents under its own session name, but it is still a **loopback** check of one machine's behaviour — no throughput, latency, or cross-machine claim is made.
- Unity remains `PARTIAL (COMPILES_OUTSIDE_EDITOR_AGAINST_STUBS, IMPLEMENTED_NOT_EDITOR_VERIFIED)`; its editor gap is narrowed, not closed.
- The stubs are this repository's own description of Unity's API surface; they are not a Unity SDK.
- Nothing here changes the authority boundary: every adapter's output is advisory, and the host keeps movement, physics, combat, damage and inventory.
