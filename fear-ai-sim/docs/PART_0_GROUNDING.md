# Part 0 — Grounding and Inheritance Lock

**Status:** `PARTIALLY_COMPLETE`  
**Verified:** 2026-08-26  
**Repository:** `C:/tools/03-Projects/lains Tools/lainself/fear-ai-sim`  
**Application:** `fear-ai-sim/`  
**Branch:** `master`  
**HEAD observed:** `63d76f9`

This is the operational Part 0 record. It does not claim that the entire BadAI target architecture is implemented. It records what was checked, what passed, and what remains before Part 0 can be closed.

## 1. Purpose

Part 0 exists to prevent future work from building on incorrect assumptions. It establishes:

- the real repository/application boundary;
- the current test/build baseline;
- production entry points and static module reachability;
- known wrapper/security differences;
- documented claims that still require runtime verification;
- the exact prerequisites for Part 1 FearCore work.

## 2. Repository grounding

| Item | Current fact | Evidence/status |
|---|---|---|
| Git root | `C:/tools/03-Projects/lains Tools/lainself/fear-ai-sim` | `CODE_VERIFIED` by Git inspection |
| Application root | `fear-ai-sim/` | `CODE_VERIFIED` by repository layout |
| Branch | `master` | `CODE_VERIFIED` |
| HEAD | `63d76f9` | `CODE_VERIFIED` |
| Remote relation | `master` is ahead of `origin/master` by 3 commits | `CODE_VERIFIED` |
| User changes | Untracked `fear-ai-sim/docs/` contains the planning documentation created during this work | preserved; not overwritten or staged |
| Package manager | npm with `package-lock.json` | `CODE_VERIFIED` |
| Node observed | v24.19.0 | `RUNTIME_VERIFIED` in baseline record |
| npm observed | 11.17.0 | `RUNTIME_VERIFIED` in baseline record |

## 3. Baseline verification performed

Run from `fear-ai-sim/`:

```text
npm test
npm run build
node --check <all top-level JavaScript files>
```

### Results

- `npm test`: **514 passed, 12 suites passed**.
- `npm run build`: **passed**, 2047 modules transformed.
- Top-level JavaScript syntax checks: **passed**.
- Build warnings remain for statically and dynamically imported `predator.js`/`learningagent.js` and for the large ~2.6 MB main chunk. These are warnings, not failures.

The baseline is therefore green for the observed environment. It does not prove every historical feature claim or every native packaging target.

## 4. Production entry points

| Surface | Entry point | Current responsibility |
|---|---|---|
| Browser/Vite | `index.html` → `main.js` | frontend, controls, rendering, simulation lifecycle |
| Electron | `electron-main.cjs` | desktop window and loading/security hooks |
| Tauri | `src-tauri/` | native wrapper and Rust command boundary |
| Data library | `index.js` | FearDataGen, collection, export, diagnostic helpers |
| Simulation | `simulation.js` | simulation state and update orchestration |

## 5. Reachability audit

A static first-party import scan was run against top-level application JavaScript. It found:

- `main.js` statically imports `simulation.js` and `mobile.js`, with dynamic imports for learning export paths.
- `simulation.js` statically imports the primary runtime systems, including agents, brains through agent dependencies, perception, trauma, replay, metrics, social, environment, and native bridges.
- `index.js` exposes the data-generation/research surface.
- Core runtime modules such as `agent.js`, `learningagent.js`, `brain.js`, `planner.js`, `agentactions.js`, `behaviortree.js`, `socialdynamics.js`, `traumazone.js`, `replay.js`, and `databridge.js` have static importer paths from these surfaces.
- `hysteresis.js` has no app-side importer in the scanned production graph.
- `habituation.js` has no app-side importer in the scanned production graph.
- `ddasystem.js`, `groupbehaviors.js`, `vrsystem.js`, `biofeedback.js`, `agentmemory.js`, and `masac_predator.js` have no app-side importer in the scanned production graph.

This is **static reachability evidence**, not proof that every imported module is exercised during every run. It does not justify deleting any module without a separate decision record and test review.

## 6. Important current facts and boundaries

### Verified or test-supported

- The existing simulator has a substantial fear/agent/perception/trauma/social/data surface.
- Numeric hardening exists for `LearningAgent` speed and statistics.
- The test suite covers many historical subsystems, including some modules that are not production-reachable.
- Browser and desktop wrappers are configured.
- Production frontend CSP no longer contains `unsafe-eval` in `index.html`.
- Electron DevTools opening is development-only in the current code.

### Not yet closed

- Tauri configuration still contains `unsafe-eval` and requires a deliberate security decision.
- The workflow is located at `fear-ai-sim/.github/workflows/test.yml`; because the Git root is one level above the application, GitHub discovery and its working directory must be verified/fixed before relying on remote CI.
- A seeded simulation smoke run and state-hash artifact have not been captured in this Part 0 session.
- Small/medium/stress performance methodology has not been recorded as a reproducible benchmark artifact.
- Native packaged Electron/Tauri builds have not been verified here.
- The authoritative Rust fear source/reference has not been inspected in this checkout.
- JavaScript fear-scale ownership and mapping remain unresolved.
- Historical chat coverage remains partial where source chats are inaccessible.

## 7. Part 0 decisions and non-decisions

Part 0 does **not** silently decide:

- the canonical fear scale;
- the Rust-to-JavaScript mapping;
- panic-lock semantics;
- whether hysteresis/habituation are revived or replaced;
- whether BadAI is a rename or successor package;
- whether orphaned modules are wired, archived, or deleted.

Those belong in `docs/DECISIONS.md` and must be resolved with evidence before behavior-changing implementation.

## 8. Part 0 exit checklist

| Exit item | Status | Required follow-up |
|---|---|---|
| Repository/application boundary | Complete | none |
| Baseline tests/build/syntax | Complete for observed environment | rerun after any source change |
| Initial runtime surface map | Complete | native packaging remains separate |
| Static module reachability map | Partial | classify dynamic/test-only/runtime call depth |
| CI discovery | Open | move/configure workflow at true Git root and verify |
| Seeded smoke/state hash | Open | capture reproducible artifact |
| Performance baseline | Open | fixed scenarios, median/tail timings, memory |
| Native wrapper verification | Open | document or explicitly defer |
| Knowledge DB writeback | Open | backup first; add evidence/worklog rows only |
| Fear scale/Rust source | Open | input to Part 1, not guessed in Part 0 |

## 9. Entry contract for Part 1

Part 1 may begin only with these statements explicit:

```text
Baseline: GREEN in the recorded environment
Current implementation: JavaScript simulator with browser/Electron/Tauri surfaces
Static reachability: mapped at first pass; runtime depth still partial
Fear scale: UNRESOLVED until authoritative reference is inspected
Rust mapping: UNKNOWN/ASSUMPTION until source evidence exists
CI: NOT YET TRUSTED
Native packaging: NOT YET VERIFIED
```

Part 1 should begin with the Rust/reference inspection and the table-driven parity oracle. It must not infer threshold mappings from research prose or historical summaries.

## 10. Next actions, in order

1. Resolve GitHub workflow placement/working directory.
2. Capture a seeded smoke run and state hash.
3. Record a small/medium/stress performance baseline.
4. Decide whether native wrapper verification is in scope now or explicitly deferred.
5. Back up and update the knowledge database with Part 0 evidence/worklog rows.
6. Start Part 1 with `docs/RUST_PARITY.md` and the canonical fear-scale decision.

## 11. Related records

- `docs/BADAI_MASTER_PLAN.md` — canonical phase index.
- `docs/BADAI_MASTER_SPEC.md` — detailed long-term architecture and epochs.
- `docs/mvp-plan.md` — complete product/build decomposition.
- `docs/BASELINE.md` — prior dated baseline record.
- `docs/ARCHITECTURE.md` — architecture map.
- `docs/DECISIONS.md` — decision register.
- `docs/PROVENANCE.md` — evidence protocol.
