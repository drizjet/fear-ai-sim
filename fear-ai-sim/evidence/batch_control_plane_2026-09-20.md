# Batch control plane — evidence record

Date: 2026-09-20
Status: `VERIFIED_CURRENT`
Scope: `packages/protocol`, `packages/runtime`, Godot adapter + showcase client, verification probes

## Why this change

The client's control plane carries **one HTTP request at a time** and
deliberately keeps registration serialized ahead of the data plane. Registration
was already batched; teardown and trauma authoring were not, so a host retiring
a crowd or authoring a settlement's shock memory still paid one round trip per
item. The bound is a property of a *request*, not of a verb, so the same
population should cost a bounded number of requests whichever verb carries it.

## Endpoints

| Route | Body | Per-entry failure | Envelope failure |
| --- | --- | --- | --- |
| `POST /api/v1/register/batch` | `{ agents: [...] }` | reported with `index`, siblings register | `400 VALIDATION_FAILED` |
| `POST /api/v1/unregister/batch` | `{ agent_ids: [...] }` | reported with `index` | `400 VALIDATION_FAILED` |
| `POST /api/v1/trauma/batch` | `{ zones: [...] }` | reported with `index`, siblings apply | `400 VALIDATION_FAILED` |

All three are bounded by one constant, `MAX_BATCH_CONTROL_ITEMS` (512).
`MAX_BATCH_REGISTRATION_AGENTS` remains exported as an explicit **alias** of it,
not a second limit, because the registration batch shipped under that name and
the Godot client and its schema both reference it.

Binary-wire twins exist for all three (`REGISTER_AGENT_BATCH`,
`UNREGISTER_AGENT_BATCH`, `TRAUMA_ZONE_BATCH`), so a WebSocket-only client is
never forced back to one round trip per item.

## Three deliberate semantic choices

**1. `not_found` is terminal, not an error.** A caller asking for an agent to be
gone has its intent satisfied whether or not the agent was there. It is still
reported separately, because a client that could not distinguish it would requeue
the id forever waiting for a confirmation that will never come.

**2. Duplicate ids collapse rather than error.** For registration, last-write-wins
(one request cannot register the same agent twice). For unregistration:
idempotent, because unregistering twice cannot mean anything different from once.

**3. Envelope failure and entry failure are different things.** A malformed
*entry* is reported with its index and its valid siblings still proceed; an
unusable *envelope* is a `400`. Reserving `400` for the envelope is what makes
the per-entry report meaningful. A batch whose every entry is malformed is
therefore `200` with `count: 0` and the rejections enumerated.

## Client (`packages/adapters/godot` and the showcase copy)

Registration, teardown and trauma authoring all go out as **one request per
pending set**, up to the cap, with the singular routes kept as the fallback for
pre-batch servers (`404` → permanent degradation) and for the registration tail a
batch did not confirm. Counters `batched_registration_requests`,
`batched_unregistration_requests`, `batched_trauma_requests`,
`individual_registration_requests` and `individual_unregistration_requests` make
"it was batched" a measurement rather than an assumption.

Two silent-failure modes were found and closed while writing this:

- **Rejected teardown ids vanished.** The client popped a batch's ids and never
  revisited them, so a rejected id left an agent live on the server while the
  host believed it was gone. Now counted in `unregistration_rejections` and
  reported through `agent_registration_failed(id, "unregister_rejected")`.
- **Rejected trauma zones were invisible.** `trauma_zones_rejected` is now
  counted, because partial application that looks like complete application is
  exactly what a host cannot debug.

## Evidence

### In-engine, live server — `npm run godot:evidence`

`run_showcase_live_conformance.gd` — **37 / 37 assertions**, exit 0, Godot 4.6
headless against a real `FearServer`:

> **Superseded count (2026-09-20, later the same day):** this suite gained one
> assertion — `Server issued this host a session token`, from the session-identity
> work — so the current run reports **38 / 38**. The passage below is the run as
> recorded at the time and is left unedited.

```
[PASS] Registration used the batch route, not one request per agent — batched_requests=1
[PASS] Batch registration cut control round trips well below the agent count — requests=1 agents=28
[PASS] Host authored trauma zones on the server in one batched request — added=3 batched_requests=1 rejected=0
[PASS] Batch teardown removed the agent in one request — batched_unregistration_requests=1 individual=0
[PASS] Teardown used no individual unregister requests — individual=0
[PASS] No legacy control fallback was needed — batch_control_unsupported=false
```

Three zones authored in one frame cost **one** request. A throwaway agent
registered and torn down costs **one** request to remove, with zero individual
unregister requests.

### Standalone probes

`verify_server_lifecycle.mjs` gained two sections. The batch section covers
teardown equivalence and reporting: 35 of 40 agents removed with the 2 absent ids
reported separately, duplicate ids collapsing, all four envelope `400`s, an
all-malformed batch returning `200 count 0` with every rejection indexed, trauma
zones applying valid siblings while 4 malformed zones are each reported with
their index, authored zones coming back distinct, and both binary-wire paths
including correlation-id preservation on error.

`verify_godot_live_pipeline.mjs` — **99** source-level tripwires (was 67),
pinning the batched routes, the payload shapes, the `404` degradation, the
counters, the rejection reporting and the in-flight batch retention that makes a
failed request requeue exactly what it took.

Both new guards were **drift-tested** rather than assumed: forcing the client's
trauma route back to the singular path fails the probe with
*"zones must be queued and flushed as a set, not sent one per request"*, and the
session-id guard fails with *"a per-socket id would make the host a stranger on
every reconnect"*. Sources were restored and re-verified after each perturbation.

### Measurement — `npm run measure:session-bringup`

See `evidence/session_bringup_2026-09-20.md`. Median of 5 trials per scale, same
server, same machine, only the request count varied:

| Agents | Per-agent registration | Batched | Saved | To first full advisory |
| --- | --- | --- | --- | --- |
| 64 | 35.5 ms / 64 requests | 1.1 ms / 1 request | 31.8× | 37.5 ms → 2.8 ms |
| 256 | 133.9 ms / 256 requests | 1.9 ms / 1 request | 71.0× | 138.6 ms → 6.2 ms |
| 512 | 289.0 ms / 512 requests | 12.7 ms / 1 request | 22.8× | 299.7 ms → 22.2 ms |

## What this does NOT claim

- No throughput or latency guarantee. The structural claim is that a population
  of ≤ 512 items costs **one** control round trip instead of one per item, and
  the measurement above is one machine's numbers for one workload, recorded with
  run metadata so it can be re-taken rather than believed.
- No host-engine, rendering, physics, or cross-machine claim. The measurement is
  headless Node over loopback.
- Singular `registerAgent` / `unregisterAgent` / `addTraumaZone` semantics are
  untouched; every batch route is additive.
