---
title: "Historical Fear AI & New Master Game Integration Specification"
created: 2026-09-15
updated: 2026-09-19
type: specification
status: historical-superseded
superseded_by: "CURRENT_TRUTH_LEDGER.md and RELEASE_CANDIDATE_CERTIFICATION.md"
---

# Historical Fear AI & New Master Game (Pixel Pets) Integration Specification

> **Historical record — not current release certification.** This specification captures a September 15, 2026 integration snapshot and its named host evidence. The current audit found that the sibling host checkout is dirty, several adapter paths are recorded rather than freshly rerun, and optional JavaScript world-simulation modules are not automatic `RuntimeSimulation` services. Use [`CURRENT_TRUTH_LEDGER.md`](CURRENT_TRUTH_LEDGER.md), [`CLAIM_TO_CODE_AUDIT_2026-09-19.md`](CLAIM_TO_CODE_AUDIT_2026-09-19.md), and [`RELEASE_CANDIDATE_CERTIFICATION.md`](RELEASE_CANDIDATE_CERTIFICATION.md) for current status.

## 1. Executive Summary & Verification Policy

This historical specification recorded the intended and observed integration boundary between the **Fear AI Universal Middleware** and the custom game engine **New Master Game** (`C:\tools\03-Projects\lains Tools\New Master Game`), specifically its core Rust RTS and pet engine **`pixel-pets`**. It does not establish the current release as complete or production-certified.

### Absolute Verification Policy (Hard Rule 9)
- **Zero Automated Test Runners**: Under NO circumstances are test runners (`npm test`, `cargo test`, Jest, or automated test harnesses) executed. All 465 legacy test suites were permanently retired (67,524 lines deleted at tag `v-test-retirement-complete`).
- **First-Principles Analytical Certification**: All verification is conducted through direct, line-by-line inspection of mathematical derivations, numerical stability bounds, boundary condition proofs, data contracts, and compiler structural checks (`cargo check`).
- **Confirmation of Practice**: At NO point during this session or recent development were automated tests or test runners executed. All code was verified through line-by-line inspection of invariants and static compiler verification.

---

## 2. Architectural Invariants

### Invariant 1: Host Game Authority (Absolute Hard Invariant)
The host game engine (`pixel-pets`) retains **100% exclusive authority** over:
1. Transforms, $X, Y$ coordinates, velocities, and physics integration (`move_and_slide`, `vel_x`, `vel_y`).
2. Health points (HP), maximum HP, armor, damage resolution, and death processing.
3. Pathfinding, collision, terrain passability, spatial partitioning, and line of sight.
4. Spawning, unit inventories, economy, building placement, and faction allegiance.

Fear AI acts strictly as an **advisory intelligence oracle**. It evaluates sensory stimuli, social context, and psychological state to produce advisory affect, recommended action intents, and causal explanations. It never directly mutates host game state.

### Invariant 2: Whitelist Validation Gate
Every recommendation produced by Fear AI must pass through the host game's `IntentValidator` and `validate_runtime_intent_json` whitelist. Any directive containing an unknown action verb, illegal scope, or out-of-bounds weight is sanitized or rejected before it can influence entity advisory biases.

---

## 3. End-to-End System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FEAR AI UNIVERSAL MIDDLEWARE (Rust SDK)                  │
│                                                                             │
│  - packages/adapters/rust/ (crate: fear-ai)                                │
│    ├── protocol.rs        (Protocol v1/v2 DTOs: FearBand, BrainIntent)     │
│    ├── evaluator.rs       (Zero-allocation hysteresis fear oracle)          │
│    ├── pack.rs            (Swarm dynamics, Alpha leadership, formations)    │
│    ├── psychoacoustics.rs (Cardiac BPM, acute shock arrhythmia)            │
│    └── negotiator.rs      (Host capability negotiation & downgrades)        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                        1. Sensed Unit │ 4. Sanitized BrainIntent
                        Observation    │    JSON Advice
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PIXEL PETS (Rust Host Game Engine)                     │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ 1. Host Runtime Bridge (src/engine/ai/fear_ai_bridge.rs)             │  │
│  │    - Extracts FearAiUnitObservation (allies, enemies, trauma, leader) │  │
│  │    - Evaluates advisory affect & maps to whitelisted actions          │  │
│  │    - Submits via world.submit_brain_intent_json(&json)                │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
│                                      │                                      │
│  ┌───────────────────────────────────▼───────────────────────────────────┐  │
│  │ 2. Tactical Pack Coordinator (src/engine/ai/pack_coordination.rs)     │  │
│  │    - Dynamically scores and maintains AlphaLeader                     │  │
│  │    - Alpha Morale Damping: F_eff = F * (1 - 0.35 * (1 - F_alpha))     │  │
│  │    - Alpha Fall Catastrophe: leader panic -> ScatterDisperse          │  │
│  │    - Wired into squads/update_with_environment.rs                     │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
│                                      │                                      │
│  ┌───────────────────────────────────▼───────────────────────────────────┐  │
│  │ 3. Simulation Orchestrator (systems/tick_orchestrator/run_fixed_tick) │  │
│  │    - Periodic unit advisory evaluation (every 20 ticks)               │  │
│  │    - Updates entity advisory runtime biases without state mutation    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Mathematical Formulations & Derivations

### 4.1 Threat Distance Attenuation
For a sensed enemy at Euclidean distance $d$:
$$T_{\\text{perceived}} = \\frac{I}{1.0 + 0.01 \\cdot \\max(0.1, d)}$$
Where:
- $I \\in [0, 1]$ is the threat intensity.
- At $d = 0$, $T_{\\text{perceived}} \\approx I$.
- At $d = 100\\text{px}$, $T_{\\text{perceived}} = 0.50 \\cdot I$.
- At $d = 280\\text{px}$ (sensor horizon), $T_{\\text{perceived}} \\approx 0.26 \\cdot I$.

### 4.2 Bravery-Scaled Base Fear Ratio
$$B_{\\text{factor}} = 0.25 + 1.50 \\cdot \\text{clamp}(\\text{bravery}, 0.0, 1.0)$$
$$\\text{BaseRatio} = \\frac{T_{\\text{max}} \\cdot 3.5}{B_{\\text{factor}}}$$
- Cowardly scout (bravery $0.10$): $B_{\\text{factor}} = 0.40 \\implies \\text{BaseRatio} = 8.75 \\cdot T_{\\text{max}}$ (extreme sensitivity).
- Stalwart soldier (bravery $0.90$): $B_{\\text{factor}} = 1.60 \\implies \\text{BaseRatio} = 2.18 \\cdot T_{\\text{max}}$ (steady composure).

### 4.3 Numerical Pressure Multiplier
$$N_{\\text{ratio}} = \\frac{\\text{Enemies} + 1}{\\text{Allies} + 1}$$
$$N_{\\text{pressure}} = 0.80 + \\min(2.0, 0.40 \\cdot N_{\\text{ratio}})$$
- Even fight ($1 \\text{ vs } 1$): $N_{\\text{pressure}} = 1.20$.
- Outnumbered ($5 \\text{ vs } 1$): $N_{\\text{pressure}} = 0.80 + 1.20 = 2.00$ ($2\\times$ fear amplification).
- Outnumbering enemy ($1 \\text{ vs } 5$): $N_{\\text{pressure}} = 0.80 + 0.13 = 0.93$ (fear suppression).

### 4.4 Contextual Modifiers
1. **Trauma Proximity**: If entity is within radius of a trauma anchor or $\\text{trauma\\_exposure} > 0.5\\text{s}$, fear is scaled by $1.50\\times$.
2. **Leader Presence**: If a friendly faction leader is within sensor range, fear is halved ($0.50\\times$).

### 4.5 Dual Hysteresis Band Machine
To prevent rapid flip-flopping (limit-cycle chatter) at decision boundaries, enter and exit thresholds are asymmetric:

| Fear Band | Enter Threshold ($F$) | Exit Threshold ($F$) |
| :--- | :--- | :--- |
| **Calm** | Baseline ($< 0.80$) | $F < 0.55$ |
| **Alert** | $F \\ge 0.80$ | $F < 0.55$ |
| **Afraid** | $F \\ge 1.40$ | $F < 0.80$ |
| **Panicked** | $F \\ge 3.80$ | $F < 1.20$ |
| **Routed** | $F \\ge 4.60$ | $F < 3.00$ |
| **BerserkOverride** | Locked by state | Locked by state |

### 4.6 Panic Recovery Lock
Upon entering `Panicked` or `Routed`, a monotonic lock is stamped:
$$\\text{recovery\\_lock\\_until} = \\text{current\\_tick} + 10$$
While $\\text{current\\_tick} < \\text{recovery\\_lock\\_until}$, the unit cannot drop below `Panicked` even if the threat abruptly disappears, modeling physiological adrenaline saturation.

### 4.7 Multi-Agent Tactical Pack Dynamics
1. **Alpha Leadership Selection**:
   $$S_\\alpha = 0.40 \\cdot \\text{RoleWeight} + 0.35 \\cdot \\text{Bravery} + 0.25 \\cdot (1 - F_{\\text{norm}}) + \\text{ContinuityBonus}$$
   Where $\\text{ContinuityBonus} = 0.15$ if previously appointed, preventing leader chatter.
2. **Alpha Morale Damping**:
   When Alpha is calm ($F_\\alpha < 1.40$), subordinate fear is buffered:
   $$F_{\\text{eff}} = F \\cdot (1.0 - 0.35 \\cdot (1.0 - F_{\\alpha,\\text{norm}}))$$
3. **Alpha Fall Catastrophe**:
   If $F_\\alpha \\ge 3.80$ (Alpha Panics) or Alpha is killed:
   - Pack drops formations immediately (`active_formations = false`).
   - Squad switches objective to `SquadObjective::DeepRetreat`.
   - All members enter `TacticalIntentTag::SquadPanicRegroup`.
   - Speech barks set to `"Leader panicked! Fall back!"`.

### 4.8 Psychoacoustic Dynamics
1. **Cardiac Rate Scaling**:
   $$\\text{BPM} = \\text{round}\\left(60 + 120 \\cdot \\frac{F}{5.0}\\right) \\in [60, 180]$$
2. **Acute Shock Arrhythmia**:
   $$\\text{ArrhythmiaTriggered} \\iff \\left(\\frac{F}{5.0} \\ge 0.80\\right) \\land (\\Delta F \\ge 2.0)$$
   Fires an irregular skipped heartbeat event on abrupt near-death ambush.

---

## 5. Contract Mapping & Whitelist Validation

| Evaluated Fear Band | Primary Whitelisted Action | Secondary Action | Generated Headline | Host Bias Applied |
| :--- | :--- | :--- | :--- | :--- |
| **Calm** | `hold_line` | `anchor_defense` | Unit Composed | Defensive line hold |
| **Alert** | `raise_alert_level` | `hold_line` | Contact Detected | Alert scanning |
| **Afraid** | `avoid_hotspot` | `controlled_withdrawal` | Hazard Proximity High | Hotspot avoidance |
| **Panicked** | `fallback_and_recover` | `retreat_to_hq` | Unit Panicked - Fallback Ordered | Tactical retreat |
| **Routed** | `fallback_and_recover` | `retreat_to_hq` | Unit Panicked - Fallback Ordered | Emergency route |

All actions pass through `advisory_validation::IntentValidator` without rejection.

---

## 6. Historical Adapter Distribution Snapshot (Not Current Verification)

The historical snapshot listed six packaged adapter artifacts. Their hashes are retained for provenance only; current verification gates and integration status are documented in the current release dossier and adapter READMEs:
1. `fear-ai-rust.zip` (SHA256: `126825b4460c82eeba216cd7eb8ff779b46b352241096a8376d9e063d17c9926`)
2. `fear-ai-godot.zip` (SHA256: `6a356a15f35350d7d21112465c9e108ed9c6d65239b255170db0d63824802a36`)
3. `fear-ai-unity.zip` (SHA256: `fa568045c18e5729ea5cdee785b52e81185fa16c88228ab1c88418992e32fd4f`)
4. `fear-ai-csharp.zip` (SHA256: `4f453fb584ab519a613c06cd8ed3713c2ea37a5832f30e386709ea93b8767c4c`)
5. `fear-ai-python.zip` (SHA256: `2f5538aaa77b39be84d6db0880a0c450bab8c47f24a10b6c182ae16af6064444`)
6. `fear-ai-unreal.zip` (SHA256: `5ec025b7dab00223d7769057ec4c2dea37a0be6c926b40737cf0d5011ae43c06`)

---

## 7. Historical Sign-Off (Superseded)

- **Host Game Codebase**: `C:\tools\03-Projects\lains Tools\New Master Game` (`pixel-pets`)
- **Universal Middleware Codebase**: `C:\tools\03-Projects\lains Tools\lainself\fear-ai-sim\fear-ai-sim`
- **Historical compiler status**: `cargo check` was recorded as passing with 0 errors across the named targets; this is not a current clean-worktree result.
- **Historical host-authority result**: named runs recorded zero host physics or state mutations; this is not a current host certification.
- **Historical Hard Rule 9 record**: the snapshot recorded zero automated test runners; current release evidence is governed by the provisional RC dossier and its standalone-proof policy.
