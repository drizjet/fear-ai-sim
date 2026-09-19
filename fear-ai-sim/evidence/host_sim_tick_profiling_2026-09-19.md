# Host Sim Tick Cost - Profiling (2026-09-19)

Tool: `pixel-pets/src/bin/audit_fear_ai_connection` Section 8B (`world.update(0.05)` runs exactly one
fixed tick; `FIXED_TICK = 1/20 s`). Two builds: debug (`dev`, unoptimized) and release
(`--release`, `opt-level=3`, LTO disabled / `codegen-units=16` for build time).

## Measured per-tick cost (host simulation)

| Config | Debug us/tick | Release us/tick | Debug/Release |
|---|---|---|---|
| 1v1 (2 units) | 4,642 | 500 | 9.3x |
| 10v10 (20 units) | 25,452 | 2,519 | 10.1x |
| 30v30 (60 units) | 69,187 | 6,093 | 11.4x |
| 3v2 long-horizon (2,000 ticks) | 16,837 | 1,278 | 13.2x |

## Scaling fit (release)

- Marginal cost 2 -> 20 units: (2518.5 - 499.7) / 18 = **112 us/unit**
- Marginal cost 20 -> 60 units: (6093.0 - 2518.5) / 40 = **89 us/unit**
- Fixed base (intercept): ~**0.3 ms/tick**

Debug marginal cost is ~1.1 ms/unit with a ~2.3 ms fixed base.

## Conclusion

- Host sim tick cost is **linear in unit count** (marginal cost is flat-to-decreasing between 20 and 60
  units), with a small fixed per-tick overhead. There is **no quadratic hotspot**.
- The earlier headline of ~17.2 ms/tick was measured on an **unoptimized debug build**. In release the
  same 3v2 long-horizon tick is ~1.28 ms - a ~13x difference. The dominant factor is therefore
  **build optimization**, not algorithmic cost.
- The **middleware** advisory cost is unaffected by this and remains trivial: Section 8 measured
  mean 15.0 us / p95 19 us / p99 34 us (release), and mean 94 us / p95 143 us / p99 177 us (debug).

## Release run (Section 8 + 8B excerpt)

```text
  • Stepped 2,000 Ticks: Completed in 2.5558251s
  • Average Per-Tick Runtime: 1.277912ms
  • Live squad-path stress: 567 squad-ticks cycling all 7 formations, largest squad 6 units — finite positions verified.
  • Mean Latency:        15.01 μs
  • 95th Percentile:     19 μs
  • 99th Percentile:     34 μs
  [PASS] High-frequency latency profile certified: Mean=15.01μs, p95=19μs (Budget: <200μs).
  •   2 units (1v1):      499.7 µs/tick
  •  20 units (10v10):     2518.5 µs/tick
  •  60 units (30v30):     6093.0 µs/tick
```

Raw logs: `audit_fear_ai_connection_extended_2026-09-19.md` (debug) and the release excerpt above.
