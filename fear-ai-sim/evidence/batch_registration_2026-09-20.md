# Batch agent registration — evidence record

Date: 2026-09-20
Status: `VERIFIED_CURRENT`
Scope: `packages/protocol`, `packages/runtime`, Godot adapter + showcase client, verification probes

## Why this change

The control plane carries **one HTTP request at a time** (`HTTPRequest` has a
single in-flight slot, and the client deliberately keeps the registration queue
serialized so a tick is never sent before its agents are registered). Before
this change, registering N agents cost N round trips, so a large host spent
seconds of dead time registering before its first advisory could arrive — and an
unregistered agent reads to a host as *"the middleware returned nothing."*

## What was added

**Server** — `POST /api/v1/register/batch` on `FearServer`, plus the binary-wire
twin `REGISTER_AGENT_BATCH`.

Semantics, chosen deliberately and asserted:

| Case | Behaviour |
| --- | --- |
| Clean batch | `200 REGISTERED`, `count`, `registered[]`, `rejected: []` |
| Malformed **entry** | Reported per entry with its `index`; valid siblings still register |
| Duplicate ids in one batch | Collapse to one registration, last entry wins |
| Not an object / no `agents` array / empty array | `400 VALIDATION_FAILED` |
| More than `MAX_BATCH_REGISTRATION_AGENTS` (512) | `400`, **rejected not truncated** |

Partial failure is non-fatal because losing a whole crowd to one bad trait is
exactly the failure mode a host cannot recover from; envelope-level failure is
fatal because there is nothing to partially apply.

**Protocol** — `MAX_BATCH_REGISTRATION_AGENTS` (512), `REGISTER_AGENT_BATCH`,
`REGISTER_AGENT_BATCH_RESPONSE`, `validateRegisterBatch`, and
`REGISTER_AGENT_BATCH_SCHEMA`. `AdapterConformance` now checks the verb and
publishes a `registerBatch` canonical sample, so third-party adapters get the
shape from the same source as the rest of the vocabulary.

**Godot client** (both the showcase copy and the packaged adapter) — the pump
sends the whole pending queue in one request up to the cap, keeps the individual
route as the fallback, and:

- only marks ids the server **confirms** as registered, requeuing the rest;
- disables batching permanently on a `404`, so a pre-batch server is not
  retried against a route that is not there;
- counts `batched_registration_requests` and `individual_registration_requests`,
  because "it was batched" has to be measured rather than assumed.

## Evidence

### In-engine, live server — `npm run godot:evidence`

`run_showcase_live_conformance.gd` — **30 / 30 assertions**, exit 0, Godot 4.6
headless against a real `FearServer`:

```
[PASS] Client registered every station agent before the data plane flowed — registered=28 expected=28 failures=0
[PASS] No registration failed — failures=0
[PASS] No observation was dropped for an unregistered agent — dropped=0
[PASS] Registration used the batch route, not one request per agent — batched_requests=1
[PASS] Batch route was supported by this server — batch_unsupported=false
[PASS] Batch registration cut control round trips well below the agent count — requests=1 (batched=1 individual=0) agents=28
```

**28 agents, 1 request, 0 individual round trips** in the real engine.

### Standalone probes

`verify_server_lifecycle.mjs` gained a batch section that runs against a real
`FearServer` instance with no listener, covering: batch == singular
(traits, initial fear, and `initial_position` all applied identically), a
64-agent crowd registering as 64 distinct live agents, singular registration
still working afterwards, per-entry rejection with indices while valid siblings
survive, duplicate-id collapse with last-write-wins, all four envelope-level
`400` cases, that an over-limit batch is **not partially applied**, and both the
binary-wire happy path and its correlation-id-preserving error path.

`verify_godot_live_pipeline.mjs` gained source-level tripwires so the batched
path cannot rot into dead code: the batch route and payload shape, the
individual fallback and requeue, the `404` disable, the 512 cap, both counters,
the increment site, and that only confirmed ids are marked registered.

### Full sweep

```
probes:    18 / 18 passed
in-engine: 4 / 4 suites exit 0 (showcase 13/13, civilization 3/3,
           canonical 4/4, live pipeline 30/30)
codegen:   GENERATED ARTIFACT CURRENT
```

## What this does NOT claim

- No performance guarantee. The claim is bounded and structural: a host
  population of ≤ 512 agents registers in **one** round trip instead of one per
  agent. No throughput or latency figure is asserted here.
- No rendering, Editor, or host-game equivalence claim.
- `FALLBACK_NUMERIC_PARITY`, `STATION_ADVISORY_CONTRACT` and the separate
  station/fallback probes are unchanged by this work.
- The pre-existing `registerAgent` singular semantics are untouched; the batch
  route is additive.
