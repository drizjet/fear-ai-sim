---
title: "Part 1 — FearCore Execution Prompt"
created: 2026-08-28
updated: 2026-09-07
type: documentation
status: historical
---

> **Superseded (2026-09-20):** the `npm test` step below is retired under Hard
> Rule 9. `npm test` is now a tombstone that refuses with a non-zero exit
> (code 9) and the suites it refers to no longer exist; its non-zero exit is
> expected, not a regression. Use `npm run verify:hard-rule-9` to check the
> retirement and `node tools/verification/<probe>.mjs` for evidence. See
> `docs/SYSTEM_MAP.md` ("Verification Policy").

> **Historical Part 1 prompt (sim-era FearCore).** Do not paste this as a fresh mission.
> Current product: plug-in fear middleware. Read `AGENTS.md` and `docs/SYSTEM_MAP.md` first.
> Canonical Rust fear model: Pixel Pets `src/engine/ai/fear.rs` (sibling tree). Tauri `src-tauri` in this repo is not that model.

# Part 1 — FearCore Execution Prompt (HISTORICAL)

Copy this prompt only if the user explicitly asked to continue **sim-era Part 1 FearCore ownership**, not the plug-in SDK.

```text
You are the senior engineer implementing Part 1 of the BadAI/Fear AI plan.

READ FIRST:
0. docs/SYSTEM_MAP.md and AGENTS.md (current product shape; outranks this prompt)
1. docs/BADAI_MASTER_PLAN.md (planning index, not implementation fact)
2. docs/BADAI_MASTER_SPEC.md
3. docs/PART_0_GROUNDING.md (dated 2026-08-26, commit 63d76f9)
4. docs/BASELINE.md (same date; rerun tests before trusting counts)
5. docs/ARCHITECTURE.md (sim surface, not packages/core)
6. docs/DECISIONS.md
7. docs/PROVENANCE.md
8. docs/RUST_PARITY.md (corrected 2026-09-07: Rust fear.rs lives in Pixel Pets)

REPOSITORY:
- Git root: C:/tools/03-Projects/lains Tools/lainself/fear-ai-sim
- Application: fear-ai-sim/
- Historical baseline reference: commit 63d76f9 (not HEAD)
- Historical documented baseline: npm test 514/514 — rerun; do not copy this number forward.

MISSION:
Build one authoritative FearCore contract without silently changing unrelated behavior.
FearCore owns fear normalization, state transitions, hysteresis/panic-lock semantics,
habituation ownership, and safe interfaces to existing agent behavior.

TRUTH RULES:
- Current repository code/tests/runtime outrank historical claims.
- Do not invent Rust thresholds. The authoritative Rust source is
  C:/tools/03-Projects/lains Tools/New Master Game/pixel-pets/src/engine/ai/fear.rs
  This JS repo's src-tauri crate is RNG/export, not FearBand. Claim parity only after a cross-language fixture.
- Do not infer a Rust 0–5 to JavaScript 0–1 mapping from prose alone.
- Research-only claims remain RESEARCH_ONLY; designs remain PROPOSED until tested.
- Preserve existing behavior with regression tests before changing it.
- Do not delete hysteresis.js or habituation.js based on filename/import scans alone.
- Do not conflate fear, anger, morale, trauma, or perceived danger.

REQUIRED ORDER:
1. Inspect the actual Rust/reference source and record its path, scale, thresholds,
   transition rules, and panic-lock semantics. If absent, document the evidence gap.
2. Inventory every live fear producer/consumer and its unit/range:
   brain.js, emotions.js, dashboard/replay/metrics, agent movement, trauma,
   perception, and any wrappers.
3. Create/update docs/RUST_PARITY.md with:
   - source availability and provenance;
   - exact source snippets or UNKNOWN markers;
   - scale/unit table;
   - state list and legal transitions;
   - enter/exit thresholds;
   - panic-lock rule;
   - habituation/hysteresis ownership;
   - JavaScript divergence matrix;
   - table-driven test vectors.
4. Add the smallest compatibility-safe FearCore implementation justified by evidence.
5. Add focused tests before changing the live path.
6. Migrate the live path only when tests prove the behavior and update compatibility notes.
7. Run the full relevant test suite, build, syntax checks, and determinism checks.
8. Update docs, decisions, and provenance/worklog records after backing up the knowledge DB.

MINIMUM TEST CATEGORIES:
- exact threshold boundaries;
- band-by-band transitions;
- no accidental skipped states;
- panic lock cannot release early;
- panic lock releases at the documented boundary;
- hysteresis prevents flapping;
- habituation repeated/novel stimuli;
- trauma and mirror-fear interaction;
- zero, missing, null, negative, NaN, Infinity, and oversized inputs;
- no invalid movement/state outputs;
- deterministic fixed-seed transition sequence;
- regression coverage for intentionally retained current behavior.

DONE WHEN:
- docs/RUST_PARITY.md exists and every unknown is explicitly labeled;
- the canonical scale decision is recorded in docs/DECISIONS.md;
- FearCore behavior is covered by focused tests;
- npm test, npm run build, and syntax checks pass;
- no unrelated behavior regresses;
- evidence/worklog records are updated after backup;
- the final report lists files changed, commands run, verified facts, unknowns,
  divergences, and the next phase.

NEVER CLAIM “RUST PARITY” unless the source and matching runtime vectors are available.
```