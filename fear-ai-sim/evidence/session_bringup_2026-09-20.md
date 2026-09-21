# Session bring-up measurement — batched vs per-agent control plane

Date: 2026-09-20
Status: `MEASURED`
Command: `npm run measure:session-bringup`
Probe: `tools/verification/measure_session_bringup.mjs`
Source commit at measurement: `1d4902d5a849b8a5a4938f9b06dcd03fec001932`

> Measurement artifact, not a pass/fail gate. One machine, one workload, recorded
> with run metadata so it can be re-taken rather than believed. No host-engine,
> rendering, physics, or cross-machine claim.

## What is measured

Two things, separately:

1. **Registration time** — from "host starts registering" to "every agent is
   registered on the server".
2. **Time to first full advisory** — from "registration finished" to "the first
   tick returned an advisory for every agent in the population".

Their sum is the host-visible number: how long the host waits before the
middleware is useful.

## Method

- Real `FearServer` on a loopback port, one process, Node `v24.19.0`
  (V8 `13.6.233.17-node.51`), Intel Core Ultra 9 285K, Windows 10.0.26340 x64.
- **Same server, same machine, same payloads, same working set** for both
  strategies. The only variable is how many control requests carry the work:
  N sequential round trips versus one batched request. The delta therefore
  isolates control-plane round-trip cost, not per-agent server work.
- The sequential strategy is a faithful model of the pre-batch client, not a
  simulation of one: it issues real HTTP requests, one at a time, awaiting each
  response before starting the next — which is exactly what a single-slot
  `HTTPRequest` control plane does.
- Median of 5 trials per scale; server reset (`clear_agents: true`) before every
  trial as untimed setup; warmup trials discarded.
- HTTP/1.1 over loopback with a fresh connection per request (`agent: false`), so
  no connection pooling flatters either strategy.
- The "first full advisory" tick carries one threat observation per agent and is
  asserted to return exactly N results, so the measurement cannot silently time a
  partial tick.

## Results

| Agents | Per-agent registration | Batched registration | Saved | Speed-up | Requests | To first full advisory | Total bring-up |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 64 | 35.5 ms | 1.1 ms | 34.3 ms | 31.8× | 64 → 1 | 37.5 ms → 2.8 ms | 37.5 ms → **2.8 ms** |
| 256 | 133.9 ms | 1.9 ms | 132.1 ms | 71.0× | 256 → 1 | 138.6 ms → 6.2 ms | 138.6 ms → **6.2 ms** |
| 512 | 289.0 ms | 12.7 ms | 276.3 ms | 22.8× | 512 → 1 | 299.7 ms → 22.2 ms | 299.7 ms → **22.2 ms** |

Per-request cost is stable across scales — **0.554 / 0.523 / 0.565 ms** — which is
what makes the result a round-trip story rather than an algorithmic one: the
per-agent server work barely moves, the *number of round trips* falls from N to 1.

## Reading the result honestly

- **The 512-agent speed-up (22.8×) is lower than 256's (71.0×)** because the
  batched request's own cost grows with payload size (1.9 ms → 12.7 ms) while the
  per-request cost stays flat. Batching still wins decisively, but the win is
  bounded by the batch request's serialization and per-entry work, not just by
  round trips. A population larger than 512 drains in additional batches and
  should not be read as a 1-request case.
- **These are loopback figures.** Round-trip cost dominates precisely because
  loopback round trips are cheap; a real network — or a console/editor process
  whose control plane is serviced once per frame — makes the per-agent strategy
  strictly worse than these numbers, not better. That direction is why the
  batching change was made; the magnitudes are not transferable.
- Values are medians of 5 and vary run to run by roughly ±10%.
- This is a comparison of two request counts, not a claim about the middleware's
  tick cost. Tick performance is a separate artifact
  (`measure_runtime_performance.mjs`).
