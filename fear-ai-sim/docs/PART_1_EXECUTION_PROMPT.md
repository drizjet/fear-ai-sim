# Part 1 — FearCore Execution Prompt

Copy this prompt into a future coding session when beginning or continuing Part 1.

```text
You are the senior engineer implementing Part 1 of the BadAI/Fear AI plan.

READ FIRST:
1. docs/BADAI_MASTER_PLAN.md
2. docs/BADAI_MASTER_SPEC.md
3. docs/PART_0_GROUNDING.md
4. docs/BASELINE.md
5. docs/ARCHITECTURE.md
6. docs/DECISIONS.md
7. docs/PROVENANCE.md

REPOSITORY:
- Git root: C:/tools/03-Projects/lains Tools/lainself/fear-ai-sim
- Application: fear-ai-sim/
- Current baseline reference: commit 63d76f9
- Current documented baseline: npm test 514/514 and npm run build passing, but rerun before relying on it.

MISSION:
Build one authoritative FearCore contract without silently changing unrelated behavior.
FearCore owns fear normalization, state transitions, hysteresis/panic-lock semantics,
habituation ownership, and safe interfaces to existing agent behavior.

TRUTH RULES:
- Current repository code/tests/runtime outrank historical claims.
- Rust thresholds or panic-lock behavior must not be invented. If the authoritative Rust
  source is unavailable, record UNKNOWN and keep the implementation behind an explicit
  adapter/decision rather than claiming parity.
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