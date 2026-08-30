# Fear AI / BadAI — Part 0 Baseline

**Status:** `RUNTIME_VERIFIED` for the checks listed below  
**Date:** 2026-08-26  
**Repository:** `C:/tools/03-Projects/lains Tools/lainself/fear-ai-sim`  
**Application:** `fear-ai-sim/`  
**Branch:** `master`  
**HEAD at verification:** `63d76f9`

## 1. Repository grounding

| Check | Result | Evidence |
|---|---|---|
| Git root | `C:/tools/03-Projects/lains Tools/lainself/fear-ai-sim` | `git rev-parse --show-toplevel` |
| Application directory | `fear-ai-sim/` | repository listing |
| Branch | `master` | `git status --short --branch` |
| Ahead/behind | `master...origin/master [ahead 3]` | status output |
| Working tree | Existing untracked `fear-ai-sim/docs/` documentation directory; no source changes made in Part 0 | status output |
| Recent commit | `63d76f9 Hardening: numeric getStats...` | `git log -5 --oneline` |
| Package manager | npm, lockfile present | `package.json`, `package-lock.json` |
| Node | v24.19.0 | command output |
| npm | 11.17.0 | command output |

## 2. Reproducible verification

Commands run from the application directory:

```text
npm test
npm run build
node --version
npm --version
node --check brain.js
node --check simulation.js
node --check learningagent.js
```

### Test result

`npm test` passed:

```text
Test Suites: 12 passed, 12 total
Tests:       514 passed, 514 total
Snapshots:   0 total
Time:        ~2.5 seconds
```

This proves the current Jest suite passes in the recorded environment. It does not prove that every documented feature is implemented or that all platform targets are healthy.

### Build result

`npm run build` passed:

```text
vite v5.4.21
2047 modules transformed
built in ~6.9 seconds
main bundle: ~2.60 MB
main bundle gzip: ~523 KB
```

Build warnings remain:

- `predator.js` and `learningagent.js` are both dynamically and statically imported, so dynamic imports do not create separate chunks.
- A chunk exceeds the 500 kB warning threshold.

These are not build failures, but they are recorded technical debt.

### Syntax result

The checked files passed `node --check`:

```text
brain.js
simulation.js
learningagent.js
```

A future baseline should check all first-party JavaScript files, not only the core three.

## 3. Current runtime surfaces

### Browser/Vite

- `index.html` loads `main.js` as an ES module.
- `vite.config.js` uses relative base paths for file-based desktop loading.
- `package.json` provides `dev`, `build`, and `preview` scripts.

### Electron

- `electron-main.cjs` creates a 1400×900 window.
- Node integration is disabled.
- Context isolation and sandboxing are enabled.
- Production DevTools opening is guarded by `!app.isPackaged`.
- Navigation is blocked through `will-navigate`.
- The app loads `dist/index.html` when available and otherwise source HTML.

### Tauri

- `src-tauri/tauri.conf.json` defines a Tauri application and frontend build commands.
- Tauri configuration still declares a CSP containing `unsafe-eval`; this differs from the HTML CSP and must be reviewed before a production security claim.
- Native packaging targets are configured, but a successful packaged build has not been established by this baseline.

## 4. Entry-point map

| Surface | Entry | Observed responsibility |
|---|---|---|
| Browser/Electron HTML | `index.html` | DOM, controls, import map, CSP, `main.js` module |
| Main browser module | `main.js` | UI wiring, simulation lifecycle, rendering, controls, exports |
| Electron shell | `electron-main.cjs` | Window, file loading, navigation/security hooks |
| Tauri shell | `src-tauri/` | Native wrapper and Rust command boundary |
| Data library entry | `index.js` | FearDataGen exports and integration helpers |
| Simulation | `simulation.js` | Simulation state, population, update orchestration |
| Agent | `agent.js`, `learningagent.js` | Agent state, movement, learning-agent behavior |
| Brain | `brain.js` | Fear/emotion/state/action logic for the primary agent path |
| Data/replay | `databridge.js`, `replay.js`, `metrics.js`, exporter modules | Sampling, replay, metrics, export |

This is a first-pass map. Exact call graphs and import reachability for every module remain a follow-up audit.

## 5. Current verification boundary

Verified by this baseline:

- The repository and application locations.
- The current branch/commit and environment.
- The current Jest suite passing.
- The Vite build passing.
- Syntax for three core files.
- The existence and broad configuration of browser, Electron, and Tauri surfaces.

Not verified by this baseline:

- All features listed in `PROJECT_STATUS.md` are live.
- All modules are reachable from a production entry point.
- Tauri packaged builds work on every configured target.
- Electron release behavior is fully tested.
- Rust and JavaScript fear behavior are equivalent.
- The Rust reference source is available or authoritative for current requirements.
- Historical claims about performance, MASAC quality, research novelty, or publication readiness.
- That any proposed BadAI macro systems exist in the current repository.

## 6. Initial Part 0 risks and follow-ups

| Risk | Priority | Next action |
|---|---:|---|
| CI workflow location/working directory may not match Git root | P0 | Verify GitHub discovery and relocate/configure workflow if needed |
| Tauri CSP still allows `unsafe-eval` | P0/P1 | Review Tauri CSP and test required runtime features |
| Multiple fear scales/threshold systems | P0 | Build the FearCore parity/source matrix |
| Dynamic/static import overlap | P2 | Decide whether code splitting is needed |
| Large production bundle | P2 | Measure startup and decide on chunking |
| Baseline only checks three source files | P2 | Add repository-wide syntax/static check |
| Historical status report conflicts with current 514-test baseline | P1 | Mark historical report dated and update current status |
| Module reachability is incomplete | P1 | Produce import graph and live-loop map |

## 7. Part 0 exit status

Part 0 is **partially complete**.

Completed:

- Repository grounding.
- Baseline test/build/syntax verification.
- Initial runtime surface map.
- Initial risks and unknowns.

Still required before calling Part 0 fully complete:

1. Full first-party import/reachability map.
2. CI discovery verification and correction plan.
3. Seeded smoke-run/state-hash evidence.
4. Small/medium/stress performance baseline with methodology.
5. Tauri/Electron release-path verification.
6. Evidence rows/worklog update in the knowledge database, after a backup.

The next implementation decision should not be made from historical “complete” labels. It should use this baseline plus the missing verification items above.
