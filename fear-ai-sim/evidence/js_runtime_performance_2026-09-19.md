# JavaScript Runtime Performance Baseline — 2026-09-19

This is a current, reproducible baseline for the JavaScript `RuntimeSimulation.tick` path. It is intentionally separate from the Pixel Pets Rust host-simulation timings in `host_sim_tick_profiling_2026-09-19.md`.

## Reproduction

```text
node tools/verification/measure_runtime_performance.mjs
```

The measurement script records the full Node version object, OS release, architecture, CPU model/count, memory size, Git commit, warmup count, sample count, timing clock, simulation scale, and memory counters in its JSON output.

## Run metadata

| Field | Value |
|---|---|
| Measured at | 2026-09-19T20:57:06.541Z |
| Fear AI commit | `3edaf171ff9fcbb53e9fdaa9283214e289dfce2d` |
| Node | `v24.19.0` |
| Platform | `win32` / `10.0.26340` / `x64` |
| CPU | `Intel(R) Core(TM) Ultra 9 285K`, 24 logical CPUs |
| Installed memory | 68,053,327,872 bytes |
| Tick dt | `0.0166` seconds |
| Warmup | 10 ticks per scale |
| Measured samples | 100 ticks per scale |
| Timing clock | `node:perf_hooks performance.now()` |

## Results

| Agents | Mean ms/tick | p50 ms | p95 ms | p99 ms | Max ms | Heap before → after |
|---:|---:|---:|---:|---:|---:|---:|
| 32 | 0.108178 | 0.072900 | 0.213999 | 0.430700 | 0.544499 | 12,216,656 → 13,656,888 B |
| 128 | 0.380747 | 0.333800 | 0.706700 | 0.902500 | 0.953100 | 17,591,784 → 18,075,104 B |
| 512 | 2.771648 | 2.667800 | 3.310700 | 3.696200 | 3.885700 | 30,896,392 → 33,899,112 B |

Every measured tick returned the expected number of agent outputs, and the final tick/agent counts were 110/32, 110/128, and 110/512 respectively.

## Clean-audit rerun

A second clean-checkout run was captured after the claim-boundary reconciliation. The runtime code was unchanged from the `3edaf17` measurement baseline; the recorded checkout was its documentation-only descendant `8853b51d1996ac3c33b4651e83573dc26525de13`.

| Field | Value |
|---|---|
| Measured at | 2026-09-19T21:14:13.842Z |
| Fear AI checkout | `8853b51d1996ac3c33b4651e83573dc26525de13` |
| Node | `v24.19.0` |
| Warmup / samples | 10 / 100 per scale |

| Agents | Mean ms/tick | p99 ms | Max ms | Heap before → after |
|---:|---:|---:|---:|---:|
| 32 | 0.101438 | 0.422600 | 0.623800 | 12,220,016 → 13,800,504 B |
| 128 | 0.356958 | 0.807700 | 0.957600 | 17,634,160 → 18,373,416 B |
| 512 | 2.823506 | 4.066400 | 4.157000 | 31,055,576 → 49,318,080 B |

The two runs preserve the same scale relationship while differing modestly in tail latency and heap behavior. This reinforces the interpretation boundary: rerun on the target environment and use distributions, not a single number, for capacity planning.

## Interpretation boundary

These are one-machine JavaScript middleware measurements with the default `RuntimeSimulation` configuration and no host physics, movement, combat, or inventory. They are not a release threshold, not a Rust host benchmark, and not evidence that arbitrary external engines will observe the same latency. Re-run the command on the target release environment before using the numbers for capacity planning.
