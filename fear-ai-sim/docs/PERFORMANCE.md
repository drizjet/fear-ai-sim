---
title: Fear AI Universal Middleware - Performance & Scale Benchmark (V2)
created: 2026-09-06
updated: 2026-09-19
type: benchmark-report
status: historical
---

> Historical headless Node benchmark record. Not in-engine Unity/Unreal/Godot frame time and not the current release baseline. Product map: `SYSTEM_MAP.md`.

> **Current-release boundary:** use `evidence/js_runtime_performance_2026-09-19.md` and `tools/verification/measure_runtime_performance.mjs` for the current JavaScript middleware baseline. The numbers below remain useful as historical workload evidence, but they are not a current universal capacity guarantee or release gate.

# Fear AI Universal Middleware - Performance & Scale Benchmark (V2)

## 1. Executive Summary & Workload Scope

> [!IMPORTANT]
> **Scope Notice**: All benchmarks in this document measure **HEADLESS FEAR AI WORKLOADS** running on Node.js v20+ / Windows 11 (AMD64). These metrics isolate pure affective simulation mathematics, JSON protocol validation, serialization, and loopback socket transport. They **do not include** host game engine overheads such as graphics rendering, physics simulation, audio mixing, or scene scene-graph updates.

- **1,000 Agents Latency**: **8.977 ms** per tick (Target: $< 16.6$ ms for 60Hz budgets).
- **Core Affective Math Latency**: **0.0015 ms** per agent evaluation ($> 650,000$ evaluations/second single-threaded).
- **Protocol Validation**: **0.0001 ms** per payload ($> 6,900,000$ validations/second).
- **Loopback WebSocket Round-Trip**: **0.0452 ms** average latency ($22,100+$ ticks/second).
- **Snapshot Save/Restore**: **0.0886 ms** for 100 full agent states ($11,200+$ snapshots/second).

---

## 2. Test Environment Specification

- **OS**: Windows 11 Pro 64-bit (Build 26100)
- **CPU**: AMD Ryzen / Multi-Core x86_64
- **Runtime**: Node.js v24.19.0 (V8 12.4)
- **Host Engine Toolchains Audited**:
  - Godot 4.6-stable Windows 64-bit official console binary
  - Microsoft .NET 8.0 SDK (MSBuild 17.11)
  - MSVC 14.44 (Visual Studio 2022 Community)
  - Python 3.14.0rc2
- **Network Interface**: Local Loopback (`127.0.0.1` / TCP)

---

## 3. Subsystem Microbenchmarks & Latency Isolation

Each component of the simulation and middleware transport pipeline was microbenchmarked in isolation across 50,000 iterations to measure its exact contribution to tick time:

| Subsystem Component | Avg Latency | p50 Latency | p95 Latency | p99 Latency | Throughput / sec |
|---|---|---|---|---|---|
| **1. Core Affective Math** | `0.0015 ms` | `0.0013 ms` | `0.0021 ms` | `0.0037 ms` | 651,529 agent-ticks/s |
| **2. Protocol Validation** | `0.0001 ms` | `0.0001 ms` | `0.0003 ms` | `0.0005 ms` | 6,973,987 checks/s |
| **3. JSON Ser/Deser** | `0.0020 ms` | `0.0019 ms` | `0.0021 ms` | `0.0029 ms` | 510,496 roundtrips/s |
| **4. WebSocket Transport** | `0.0452 ms` | `0.0348 ms` | `0.0765 ms` | `0.2224 ms` | 22,101 loopback ticks/s |
| **5. Snapshot Save/Load (100 Agents)** | `0.0886 ms` | `0.0702 ms` | `0.1976 ms` | `0.2793 ms` | 11,280 snapshots/s |

### Architectural Takeaway:
95% of execution time in networked configurations is consumed by OS loopback network stack polling and packet serialization, while pure internal simulation evaluation takes less than 2 microseconds per agent.

---

## 4. Headless Scale Latency Matrix (1 to 5,000 Agents)

Measured across 100 consecutive ticks with active sensory changes (threats, sounds, trauma zones, and motion updates):

| Agent Count | Avg Latency | p50 Latency | p95 Latency | p99 Latency | Agent-Ticks / sec | Frame Budget (16.6ms) |
|---|---|---|---|---|---|---|
| **1** | `0.009 ms` | `0.005 ms` | `0.014 ms` | `0.130 ms` | 117,274 | **PASS** ($< 0.1\%$ of budget) |
| **10** | `0.062 ms` | `0.048 ms` | `0.145 ms` | `0.372 ms` | 160,392 | **PASS** ($< 0.5\%$ of budget) |
| **100** | `0.242 ms` | `0.202 ms` | `0.414 ms` | `0.764 ms` | 413,953 | **PASS** ($1.5\%$ of budget) |
| **1,000** | `8.977 ms` | `8.846 ms` | `9.915 ms` | `10.316 ms` | 111,390 | **PASS** ($54\%$ of budget) |
| **5,000** | `197.532 ms` | `201.201 ms` | `222.856 ms` | `228.824 ms` | 25,312 | **BATCH ONLY** (Exceeds 16ms) |

---

## 5. Memory Stability & Heap Footprint

- **100 Agents**: Delta $< 1.2$ MB heap across 1,000 ticks.
- **1,000 Agents**: Delta $< 5.8$ MB heap across 1,000 ticks.
- **Garbage Collection Pressure**: Minimal; zero object allocations in hot inner math loop (`AffectiveAgent.tick()` reuses pre-allocated numeric vectors and clamped scalar state).
