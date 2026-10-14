# Fear AI Archive — Historical & Speculative Research Artifacts

**Archive Date**: 2026-10-13  
**Status**: READ-ONLY / HISTORICAL  
**Governance**: Preserved for provenance and research continuity under Git custody. These modules are explicitly retired from the root working directory and are NOT part of the shippable middleware runtime (`packages/core/`, `packages/protocol/`, `packages/runtime/`, `packages/adapters/`).

---

## 1. Directory Contents

### `legacy-research-prototypes/`
Early research experiments, toy algorithms, and unintegrated hardware mocks created during Phases 2–4:

| File | Historical Purpose | Why Archived |
| :--- | :--- | :--- |
| `biofeedback.js` | Simulated multi-modal biofeedback framework (EEG, Polar H10 HRV, GSR, facial webcam) | Complete mock implementation using unseeded `Math.random()`. Zero production callers. |
| `quantuminspired.js` | "Quantum-Inspired" state superposition, quantum annealing, and Grover threat search | Classical random walk using unseeded `Math.random()`. Completely unintegrated into middleware agent loop. |
| `truerl.js` | Handwritten 2-layer matrix Q-learning implementation | Toy Q-learning experiment with random actions. Disconnected from agent state machine. |
| `vrsystem.js` | VR head tracking and presence break detection | Dormant kinematic heuristics with no VR runtime driver or active caller. |
| `ddasystem.js` | Dynamic Difficulty Adjustment prototype (T3.5) | Superseded in production middleware by `PacingDirector.js` (`packages/core/src/PacingDirector.js`). |
| `groupbehaviors.js` | Group mourning, search parties, and tribal relations (T3.8) | Superseded in production by `GroupContagionSystem.js` and `PackCoordinationEngine.js`. |
| `masac_integration_v2.js`, `masac_predator.js`, `masac_prey.js`, `verify_masac.js` | Legacy multi-agent Soft Actor-Critic (MASAC) training wrappers | Obsolete v2 prototypes superseded by v3 (`masac_integration_v3.js`). |
| `abtesting.js` | Simulation configuration A/B comparison harness | Historical test utility for retired test runners. |
| `agentmemory.js` | Agent memory prototype | Superseded by `LayeredMemorySystem.js` and `MemoryConsolidationEngine.js`. |
| `causal-ledger.js` | Causal event graph linter | Built for retired test suites; superseded by `CausalEventGraph.js`. |
| `closed-world-counterfactual.js` | Counterfactual scenario runner for closed world | Built for retired test suites; superseded by `WorldCounterfactualEngine.js`. |
| `long_horizon_cooldown.mjs` | Ad-hoc raid cooldown verification script | One-off standalone verification script from August 2026. |

### `scratchpad/`
One-off diagnostic and audit scripts from August 2026 (`audit-200tick-multiseed.mjs`, `audit-500tick.mjs`, `audit-impossibility.mjs`, etc.).

### `scripts/`
Legacy analysis scripts (`breadth-slice-long-horizon.mjs`, `closed-world-relationship-trace.mjs`, etc.).
