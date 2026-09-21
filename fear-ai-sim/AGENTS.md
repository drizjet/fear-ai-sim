# Fear AI — Agent instructions (JS tree)

Read `docs/SYSTEM_MAP.md` before editing, testing, or writing status.

## Goal

The product is **engine-agnostic fear middleware** that a host game can plug into. It is not a Fear AI game, not a Godot title, and not “whatever the last milestone file marked VERIFIED.”

## This checkout

You are in the **JS sim + middleware** tree:

`C:\tools\03-Projects\lains Tools\lainself\fear-ai-sim\fear-ai-sim`

Sibling trees (do not pretend they live here):

- Rust fear core: `C:\tools\03-Projects\lains Tools\New Master Game\pixel-pets\src\engine\ai\fear.rs`
- Elixir + NIF: `C:\tools\03-Projects\lains Tools\lainself\fear-ai-elixir`

## Rules

1. **Host authority.** Do not make adapters move actors, apply damage, change inventory, or spawn entities. Intents and vector hints only.
2. **Engine policy.** Unreal is **deferred, not abandoned.** Keep `packages/adapters/unreal/` so Unreal games can connect later via the same protocol. Do not install UE5 now, do not make Unreal the current workstream, do not treat missing UE as a blocker. Unity is the same: keep the adapter; verify only when a Unity host exists. Godot headless ≠ a Fear AI game. “Any game” is the protocol.
3. **Do not delete negative findings.** Version benchmarks. Keep the N/R entanglement and the cross-scenario Utility-AI win on the record.
4. **Do not chase test-count or file-count.** Evidence and capability only.
5. **Do not treat `evidence/middleware-progress-evidence.json` `VERIFIED` as world-class.** Code + tests + a JSON row is not external adoption.
6. **Parity.** The canonical band/hysteresis/panic-lock model is Rust `fear.rs`. JS `packages/core` is the plug-in port. Changing one without recording the other is a defect.
7. **Stale docs.** Ignore `PROJECT_STATUS.md`, `CONTINUE_PROMPT.md`, and the closed-world novel in `AUTONOMOUS_HANDOFF.md` as product status. See `docs/SYSTEM_MAP.md`.
8. **Attribution.** Do not claim Google DeepMind, bit-for-bit cross-runtime equality, or “universal integration” without the matching measurement.
9. **Mandatory Manual Audits Only (NEVER RUN TESTS).** Do NOT run test runners (`npm test`, Jest, etc.) or rely on green test suites to verify system correctness. `npm test` is a **tombstone**: it prints why the suites were retired and exits 9. A non-zero exit there is the expected result — it is not a suite, and there is nothing to fix. Use `npm run verify:hard-rule-9` to check the retirement itself. All verification and quality audits across `packages/core/src/`, `packages/runtime/`, `packages/protocol/`, and `packages/adapters/` MUST be conducted 100% manually through direct, line-by-line inspection of mathematical formulas, boundary logic, memory life-cycles, and architectural invariants against first principles.

## Commands (this repo)

There is no test command. `npm test` refuses by design (exit 9, Hard Rule 9).

```
npm run server
npm run guardian:check
npm run verify:hard-rule-9     # asserts the test retirement is intact
npm run verify:probes          # all deterministic probes, one summary
npm run verify:probe-stability # every probe repeated 3x; FLAKY counts as a failure
npm run verify:stability-regression # tonight's repeats vs the committed recording + the ledger
npm run fold:stability-ledger -- --from <artifact> [--write]  # fold a nightly artifact in, dry-run first
pwsh -File tools/ci/open_ledger_night_pr.ps1 # what the nightly job runs: propose tonight as a pull request (dry run without -Execute)
npm run verify:release-claims  # doc/claim boundary tripwire
npm run evidence:report        # what the CLOSED evidence ledger still re-proves
```

`npm run lint:evidence` is **retired** and refuses with exit 9: the ledger closed on
2026-09-06 and a green gate could only be faked. Use `npm run evidence:report` instead.

Middleware server: `node packages/runtime/bin/fear-ai-server.js --port 8765`

Desktop **sim** launcher (Electron/Tauri research app, not the SDK): `Launch-FearAI.ps1`

## If the user asks for “best fear AI / plug into any game”

Work the plug-in path: core + protocol + authority-safe adapters. Do not spend the current session installing or verifying Unreal. Do not delete the Unreal adapter. Do not add another civilization mechanic to `closed-world.js` unless they explicitly want the research sim.
