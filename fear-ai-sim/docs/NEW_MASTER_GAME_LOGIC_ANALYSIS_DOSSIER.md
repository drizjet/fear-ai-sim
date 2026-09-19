---
title: "Historical New Master Game (Pixel Pets) Architecture, Logic & Systems Analysis Dossier"
created: 2026-09-16
updated: 2026-09-19
type: research-dossier
status: historical-superseded
superseded_by: "CURRENT_TRUTH_LEDGER.md and RELEASE_CANDIDATE_CERTIFICATION.md"
---

# Historical New Master Game (`pixel-pets`) — Deep Architectural & Logic Analysis

> **Historical record — not current Fear AI release certification.** This dossier describes a dated host-engine architecture snapshot and integration opportunities. Its “complete” status and bridge descriptions do not establish current clean-worktree provenance, universal host adoption, or live wiring of every Fear AI subsystem. Use [`CURRENT_TRUTH_LEDGER.md`](CURRENT_TRUTH_LEDGER.md), [`CLAIM_TO_CODE_AUDIT_2026-09-19.md`](CLAIM_TO_CODE_AUDIT_2026-09-19.md), and [`RELEASE_CANDIDATE_CERTIFICATION.md`](RELEASE_CANDIDATE_CERTIFICATION.md) for current status.

## 1. Executive Summary & Core Identity

**New Master Game** (`C:\tools\03-Projects\lains Tools\New Master Game`, active crate `pixel-pets`) is a multi-layered hybrid architecture:
1. **Desktop Overlay Pet System**: Autonomous pet companion entities traversing desktop boundaries, reacting to cursor velocity, mouse drag, clicks, desktop windows, idle intervals, and inter-pet interactions.
2. **Deep RTS Simulation Engine**: Authoritative macro/micro strategy simulation featuring 6+ symmetrical/asymmetrical factions (`lithodrom`, `terracotta`, `aethermoor`, `coral_wright`, `flesh_weaver`, `gnaw_necromancy`), dynamic building construction, territorial cell ownership, economy & resource harvesting, and three-phase match pacing.
3. **Biological & Environmental Ecosystems**: Dynamic weather (rain, storm, blizzard, heatwave, ash), terrain hazards (quicksand, burning ground, broken ground), fickle wildlife (prey, predators, neutral fauna), and apex boss encounters with phase shifts.
4. **Affective Psychology & Morale Layer**: Built-in fear runtime, panic front waves, chronic trauma imprinting, scar avoidance, morale doctrines, tactical squads, and the validated Fear AI universal intelligence bridge.
5. **Deterministic Perception & UI Pipeline**: Win32 borderless transparency overlay, egui/eframe desktop HUDs, strict procedural sprite pipelines, and Rodio audio dispatching with real-time soundscapes.

---

## 2. Structural Subsystem Deconstruction

### 2.1 The Desktop Pet Brain (`src/engine/pet/behavior_machine.rs`)
- **Action State Machine**: Manages `AutonomousAction` (`Seek`, `Wander`, `Rest`, `Socialize`, `ManeuverFlank`, `ManeuverSuppress`, `Kite`, `SeekCover`, `Flee`).
- **Target Evaluation**: Dynamic targeting between `Cursor`, `Position`, `Pet`, and `ScreenEdge`.
- **Need Integration (`src/engine/needs.rs`)**: Hunger, Energy, Social, and Fun meters driving priority overrides.
- **GOAP Bridge**: Hooks into Goal-Oriented Action Planning (`src/engine/ai/goap.rs`) allowing strategic planning when complex obstacle avoidance or cooperative actions are required.
- **Micro-Behaviors**: Cursor-drag reactions, click combo escalation, panic startle on high-velocity mouse cursor jerks, and ambient ghost pulse phases.

### 2.2 The RTS Simulation & Fixed-Tick Orchestrator (`src/engine/rts/systems/tick_orchestrator/run_fixed_tick.rs`)
- **Fixed Simulation Timestep**: Authoritative $\Delta t = 0.05\text{s}$ (20 Hz fixed tick cycle) decoupled from render framerate via `world.tick_accumulator`.
- **Match Pacing**: Three-phase progression (`Establishment`, `Escalation`, `Climax`) modulating resource trickle, building income multipliers, and unit combat aggression.
- **Territory & Grid System (`src/engine/territory.rs` & `src/engine/grid.rs`)**: Isometric grid partition managing cell ownership, building placement legality, resource saturation, pathing traversal IDs, and environmental hazard tags.
- **Economy Engine (`src/engine/economy.rs`)**: Stockpile management, scarcity pressure calculations, passive building trickle, and harvesting logistics.

### 2.3 Combat & Tactical Resolution Engine (`src/engine/rts/combat_runtime_*.rs`)
- **Damage Pipeline**: Damage profiles (`Physical`, `Aether`, `Corrosive`, `Necrotic`, `True`), armor absorption curves, status effect procs, and hit callbacks.
- **Combat Posture & Tactics**: Units cycle through `Engaging`, `Flanking`, `Suppressing`, `Bracing`, and `Kiting`.
- **Squad Dynamics (`src/engine/rts/squads.rs` & `pack_coordination.rs`)**: Units group into tactical squads with designated Alpha leaders, analytical formation geometry (`CircularPincer`, `VFormation`), Alpha Morale Damping, and Catastrophic Scatter on leader elimination.

### 2.4 Affective Runtime & Fear Architecture (`src/engine/ai/fear.rs` & `src/engine/rts/fear_runtime.rs`)
- **Affective State**: Tracks discrete `FearBand` (`Calm`, `Alert`, `Afraid`, `Panicked`, `Routed`), numeric score ($0.0 \dots 5.0$), and trend derivative (Rising, Stable, Falling).
- **Spatial Memory & Trauma**: Stores `trauma_exposure_s`, `fear_memory_long`, `scar_avoidance_01`, and spatial `trauma_anchors: Vec<(f32, f32, f32, f32)>`. Units remember past massacre sites and route around them.
- **Panic Waves**: Periodic fear spikes broadcast across territory cells whenever high-intensity hazard events, building collapses, or mass routs occur.
- **Panic Recovery Lock**: 10-tick hysteresis gate preventing flip-flopping between fear states.

### 2.5 The Brain Director & Advisory Whitelist Pipeline (`src/engine/ai/advisory_validation.rs`)
- **Strict Host Game Authority Invariant**: External or high-level AI never writes directly to physical positions, velocities, HP, or game state.
- **Validation Gate (`IntentValidator`)**: All high-level intents pass through an explicit whitelist checking `intent_type` (`morale_response`, `event_response`), `scope` (`entity`, `faction`, `world`), and whitelisted action verbs (`hold_line`, `fallback_and_recover`, `avoid_hotspot`, `retreat_to_hq`, `raise_alert_level`, etc.).
- **Director Runtime (`director_runtime_advisories.rs`)**: Clamps and translates accepted advice into directional bias variables consumed during unit motion and combat steering.

### 2.6 Audio & Telemetry Engine (`src/overlay_audio.rs`)
- **Rodio Windows Thread**: Background audio dispatching playing WAV sound effects, environmental loops, and telemetry beeps.
- **Dynamic Sonics**: Faction-specific sonic palettes (`src/engine/faction_sonic_palette.rs`), ambient volume ducking, and acute shock audio hooks.

---

## 3. High-Value Integration Opportunities with Fear AI

1. **Desktop Pet Affective Synchronization**: Connect `behavior_machine.rs` to evaluate Fear AI affect for desktop pets. High cursor speed or aggressive neighboring pets trigger genuine fear responses (cowering, darting under desktop icons, seeking owner cursor cover).
2. **Visual Speech & Emotion Bubbles**: The preview pipeline already packages `advisory_fallback_and_recover_01`, `fear_band_label`, and `fear_top_causes`. We can render reactive overhead floating speech bubbles using `ui_text.headline` and `ui_text.subtext` from the Fear AI bridge.
3. **Audio Cardiac Pulse**: Wire `cardiac_bpm` and `arrhythmia_shock` directly into `overlay_audio.rs` to generate subtle acoustic heartbeat pulses when an inspected pet or squad leader experiences extreme dread.
4. **Trauma Anchor Synchronization**: Feed Fear AI's episodic trauma zones directly into New Master Game's `world.trauma_anchors`, creating permanent battle scars on the desktop arena.

---

## 4. Verification & Quality Safeguards (Hard Rule 9)

- All development on New Master Game and Fear AI follows **Hard Rule 9 (Zero Automated Test Runners)**.
- Verification is conducted via the standalone diagnostic binary:
  `cargo run --bin audit_fear_ai_connection` (or `npm run audit:newmaster` from `fear-ai-sim`).
- Compiler integrity checked with `cargo check --bin pixel-pets`.
