# Fear AI / BadAI — Current Architecture Map

**Status:** `PARTIALLY_VERIFIED`  
**Part 0 detailed record:** `PART_0_GROUNDING.md`  
**Date:** 2026-08-26  
**Repository version:** `63d76f9`  
**Related documents:** `BASELINE.md`, `PROVENANCE.md`, `mvp-plan.md`

## 1. How to read this document

This is a grounding document, not a claim that the long-term BadAI architecture already exists. Each section identifies what was observed and what remains to verify.

```text
CURRENT CODE PATH
≠
TARGET BADAI ARCHITECTURE
```

The target architecture can guide refactoring, but current behavior must be established from code, imports, tests, and runtime runs.

## 2. System surfaces

```text
Browser / Electron HTML
        ↓
      main.js
        ↓
   Simulation lifecycle
        ↓
Agents + predators + environment
        ↓
Brain / perception / social / trauma / learning systems
        ↓
Metrics / replay / DataBridge / exports
```

Tauri is a separate native wrapper around the built frontend and Rust command boundary. Electron is another desktop wrapper with its own security/runtime behavior.

## 3. Current entry points

### Browser frontend

- `index.html` is the document shell.
- `main.js` is loaded as the application module.
- `vite.config.js` builds the frontend with relative asset paths.

### Electron

- `electron-main.cjs` creates a sandboxed BrowserWindow.
- It loads the built `dist/index.html` when present.
- It disables Node integration and enables context isolation.
- It prevents normal navigation through a `will-navigate` handler.

### Tauri

- `src-tauri/tauri.conf.json` configures the native wrapper.
- It runs the Vite dev/build commands.
- It points the frontend to `../dist`.
- Native permissions and Rust commands require a separate audit.

### Research/data entry

- `index.js` re-exports FearDataGen, collection, validation, export, determinism, headless, and diagnostic helpers.
- `simulation-integration.js` contains integration helpers for starting collection, updating data, and exporting.

## 4. Current runtime domains

| Domain | Main files | Current status |
|---|---|---|
| Simulation orchestration | `simulation.js`, `main.js` | Code exists; baseline tests pass |
| Agent behavior | `agent.js`, `learningagent.js` | Code exists; baseline tests pass |
| Fear/state behavior | `brain.js`, `emotions.js`, `traumazone.js`, related modules | Code exists; exact canonical ownership is unresolved |
| Perception | `fastperception.js`, `fogofwar.js`, `sound.js`, spatial modules | Present in repository; live depth requires call-graph verification |
| Predators | `predator.js`, predator-related learning/RL modules | Present; dynamic/static import overlap is a build warning |
| Planning | `planner.js`, `agentactions.js`, `behaviortree.js` | Present; runtime invocation and ownership need verification |
| Social behavior | `socialdynamics.js`, `tribalmind.js`, group-related modules | Present; macro semantics are not established |
| Trauma/recovery | `traumazone.js`, memory modules | Present and tested in parts of the suite |
| Learning/RL | `masac.js`, `masac_integration*.js`, workers, replay/training modules | Present; training validity and production role are unknown |
| Metrics | `metrics.js`, `databridge.js`, analytics/dashboard modules | Present; schema compatibility needs formal contract |
| Replay | `replay.js` and related files | Present; reproducibility contract needs verification |
| Data generation | `feardatagen.js` and related modules | Present; export and headless workflows need an end-to-end run |
| Native wrappers | `src-tauri/`, `electron-main.cjs` | Configured; packaged release not verified |

## 5. Current versus target pipeline

### Current observed shape

The existing code is organized around a simulation update loop with agent/brain behavior, supporting systems, UI controls, and research instrumentation. Several advanced systems coexist, but their exact runtime ownership and ordering must be mapped before a refactor.

### Target BadAI shape

```text
World state
→ perception
→ beliefs
→ appraisal
→ emotions/needs
→ affordances
→ prerequisites
→ utility
→ intent
→ planning
→ execution
→ consequences
→ memory/social updates
```

The target is an architectural direction. It is not a current implementation statement.

## 6. Required call-graph audit

The next architecture pass must produce, for each important module:

```text
module
exports
static importers
dynamic importers
entry-point reachability
runtime call sites
test-only call sites
side effects
state ownership
known conflicts
status
```

Classify each module as:

```text
LIVE_AND_USED
IMPORTED_BUT_NOT_USED
TEST_ONLY
DEAD_ORPHAN
UNKNOWN
```

Do not delete or revive modules from filename inspection alone.

## 7. Known architecture conflicts

1. The project has browser, Electron, and Tauri surfaces with different security and packaging constraints.
2. The build reports modules that are both dynamically and statically imported.
3. Tauri configuration has a different CSP posture than `index.html`.
4. Existing documents describe broad feature completion that this baseline has not independently re-established.
5. Fear, emotion, hysteresis, habituation, and planning ownership are not yet reduced to one documented contract.
6. The existing test suite covers many systems, but test coverage does not itself establish live-loop integration.
7. Data collection, replay, metrics, and simulation state need explicit versioned schemas.

## 8. Architecture exit criteria

The first Part 0 audit is recorded in `PART_0_GROUNDING.md`. It confirms the main entry surfaces and static importer relationships, while leaving runtime call depth, seeded replay, native packaging, and CI discovery explicitly open.


This document becomes `VERIFIED` for the current baseline only when:

- Every production entry point is listed.
- Every core module has a reachability classification.
- Simulation update order is documented from code.
- State ownership is identified for fear, emotions, agents, metrics, replay, and learning.
- A seeded run and replay are demonstrated.
- Native wrapper differences are documented.
- Unused/dead modules have a decision record rather than an informal verdict.
