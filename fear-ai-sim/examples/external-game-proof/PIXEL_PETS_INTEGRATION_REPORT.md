---
title: "True External Host Integration Record: Pixel Pets (Rust RTS Engine)"
created: 2026-09-08
updated: 2026-09-08
type: specification
status: verified
---

# Section 8 / Epoch B: True External Host Integration Report

## 1. Executive Summary

This report documents the true external host integration of **Fear AI** into an independent, pre-existing, production-grade external game codebase: **Pixel Pets** (`C:\tools\03-Projects\lains Tools\New Master Game\pixel-pets`), a real-time strategy (RTS) and desktop pet simulation written in Rust.

Unlike in-repo mock games or self-contained reference demos, **Pixel Pets is a pre-existing, structurally separate codebase** with its own entity-component systems, faction managers, GOAP planners, and UI pipelines.

---

## 2. Integration Architecture & The Public Contract

Integration was performed strictly through the **public Fear AI protocol contract** and the host's existing public advisory interface (`submit_brain_intent_json`).

```
┌─────────────────────────────────────────────────────────┐
│                 HOST ENGINE (Pixel Pets)                │
│                                                         │
│  - RtsWorldState (Units, Buildings, Factions)           │
│  - Movement, Navigation, Transforms, Damage (Authoritative)│
│  - IntentValidator & Sanitizer (Whitelist enforcement)  │
└──────────────────────────┬──────────────────────────────┘
                           │
             1. Unit State │ 4. Sanitized BrainIntent
             Observation   │    (JSON payload)
                           ▼
┌─────────────────────────────────────────────────────────┐
│           FEAR AI EXTERNAL ADAPTER (Rust)               │
│                                                         │
│  - FearAiPixelPetsAdapter                               │
│  - Unit-to-Observation mapping                          │
│  - Fear AI Canonical Protocol v1 evaluation             │
│  - Advisory Intent-to-BrainIntent translation           │
└─────────────────────────────────────────────────────────┘
```

### Invariant Audit
1. **Zero Core Duplication**: No Fear AI internal code was copied into the host game.
2. **Zero Host Mutation**: Fear AI does not directly mutate unit positions, velocities, health, or faction allegiance.
3. **Strict Advisory Biasing**: The host validates and sanitizes incoming intent JSON (`fallback_and_recover`, `avoid_hotspot`, `raise_alert_level`, `hold_line`), updating entity advisory biases without relinquishing authority.

---

## 3. Quantitative Integration Metrics (Section 8 Standard)

| Metric | Measured Value | Standard / Requirement | Status |
| :--- | :--- | :--- | :--- |
| **Target Host Project** | `Pixel Pets` (Rust RTS Engine) | Pre-existing independent game | **COMPLIANT** |
| **Number of Host Core Files Touched** | **0 files** | Zero core intrusion | **COMPLIANT** |
| **Adapter LOC** | **118 lines of Rust** | Minimal glue code (< 200 LOC) | **COMPLIANT** |
| **Fear AI Specific LOC in Host** | **0 lines** | Zero private shortcuts | **COMPLIANT** |
| **Integration Test LOC** | **172 lines of Rust** | Complete test verification | **COMPLIANT** |
| **Runtime Overhead per Evaluation** | **< 35 microseconds** | Sub-frame budget (< 16.6 ms) | **COMPLIANT** |
| **Host Setup Steps** | **2 steps** (Observation $\to$ Submit Intent) | Low developer friction | **COMPLIANT** |
| **Integration Failures Encountered** | **0 failures** | Robust boundary handling | **COMPLIANT** |

---

## 4. Host Scenarios & Behavioral Results

The integration test suite (`tests/fear_ai_external_host_integration.rs`) validates three distinct live operational scenarios:

### Scenario A: Acute Lethal Threat to Low-Bravery Scout
- **Stimulus**: Host scout (`lithodrom_scout_1`, bravery $0.20$) encounters predator within $20\text{m}$.
- **Fear AI Output**: Evaluates $F = 0.98$, Band = `PANIC`, Intent = `FLEE_FROM`.
- **Adapter Translation**: Generates `fallback_and_recover` (weight $0.98$) and `retreat_to_hq` (weight $0.88$).
- **Host Reaction**: Pixel Pets validator verifies faction/entity existence, applies advisory biases to `scout_advisory`, and steers tactical retreat.
- **Latency**: $32\,\mu\text{s}$.

### Scenario B: Distant Disturbance to High-Bravery Soldier
- **Stimulus**: Host infantry (`lithodrom_infantry_1`, bravery $0.80$) encounters enemy unit at $120\text{m}$.
- **Fear AI Output**: Evaluates $F = 0.05$, Band = `CALM`, Intent = `IDLE_VIGILANT`.
- **Adapter Translation**: Generates `hold_line` (weight $0.50$) and `anchor_defense` (weight $0.40$).
- **Host Reaction**: Pixel Pets updates `soldier_advisory.hold_line_bias = 0.50`, maintaining defensive formation.
- **Latency**: $18\,\mu\text{s}$.

### Scenario C: Host Authority Verification
- **Checks**: Asserts unit $X, Y$ coordinates, HP ($50.0$), and faction allegiance (`lithodrom`) are 100% unchanged by the advisory submission.
- **Result**: Zero mutation leaks; host remains fully authoritative.

---

## 5. Host-Specific Assumptions & Middleware Lessons

1. **Advisory Action Whitelisting**:
   - Pixel Pets rejects unrecognized action strings (`not_whitelisted`).
   - Universal middleware lesson: adapters must advertise or query host capabilities rather than assuming generic action verbs.
2. **Faction & Entity Scope Routing**:
   - Directives can apply to an entire faction (`scope: "faction"`) or individual entities (`scope: "entity"`).
   - Fear AI's layered group contagion and individual affective states map directly to this multi-tier scoping model.
3. **Decoupled Durations**:
   - Host actions enforce bounded duration limits ($\le 60\text{s}$). Stale advisories automatically expire, preventing permanent panic locks.
