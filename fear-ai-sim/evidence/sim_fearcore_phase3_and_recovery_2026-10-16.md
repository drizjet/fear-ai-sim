# The Sim FearCore's RECOVER Band Was Shadowed, and the Fallback Behind It Was Dead — 2026-10-16

**Scope:** `fear-ai-sim/fearcore.js`, the simulation's own FearCore. The §260
extended-band stay guard returned for *every* extended state, including RECOVER —
so the band that is defined as transitional could never complete, and the
`FORCE_*` fallback sitting behind the guard could never run. This record fixes
both, verifies the result against the `packages/core` port's identical guard and
a focused harness, and states what none of that proves.

## The shadowed band

- `EXTENDED_BANDS` (`fearcore.js:52`) holds the seven non-core states, including
  **RECOVER**. RECOVER is transitional and owned by its own branch
  (`fearcore.js:276-293`): `recoveryProgress += 0.1` per tick, exit to CALM via
  `RECOVER_COMPLETE` when `fear < extended.RECOVER.exitFear` (0.2) and
  `recoveryProgress >= extended.RECOVER.exitRecovery` (0.8) — the recovery
  contract as documented in `docs/PROVENANCE.md` (L1120).
- Phase 2.5, the §260 stay contract (`fearcore.js:236`), returned
  `EXTENDED_BAND_STAY` for any extended state whose evaluator returned null —
  RECOVER included. The guard returns before RECOVER's own branch, so
  `recoveryProgress` never incremented and `RECOVER_COMPLETE` was unreachable
  through that path: once RECOVER with a null evaluator, the band was terminal
  and nothing in the recovery contract could ever fire.
- The fix carves RECOVER out of the guard —
  `if (this.state !== 'RECOVER' && EXTENDED_BANDS.includes(this.state))` — so
  RECOVER falls through to the branch that owns it while every other extended
  band keeps the §260 stay. This matches the `packages/core` port exactly
  (`packages/core/src/FearCore.js:260`, identical carve-out).

## The dead fallback behind it

- The removed `else if (EXTENDED_BANDS.includes(this.state))` chain (old
  `fearcore.js:289-311`) produced `FORCE_PANIC` / `FORCE_ANXIOUS` /
  `FORCE_ALERT` / `FORCE_CALM`. It sat behind the stay guard, which already
  returned for every extended state, so no input could reach it: dead code
  carrying a second, contradictory transition policy for content already inside
  the extended bands.
- Removal is behaviorless by construction, and the port's comment on its own
  earlier sweep (`packages/core/src/FearCore.js:306-308`, "sat unreachable
  behind the Phase-2.5 hold above … removed in the 2026-10-15 dead-branch
  sweep") records the same conclusion.

## Verification

- `sim_core_recovery_probe.mjs` (standalone harness, run from this machine):
  **12/12 PASS** —
  - RECOVER now emits `RECOVER_PROGRESS` (previously shadowed) and completes to
    CALM via `RECOVER_COMPLETE` once progress reaches 0.8 at low fear;
  - high fear keeps RECOVER progressing without completing, then it completes
    when fear drops;
  - HIDE → RECOVER → CALM and PRESENCE_BREAK → RECOVER → CALM hold end to end;
  - a broad state × fatigue × context sweep surfaces **zero `FORCE_*` reasons**
    while non-RECOVER extended bands still receive the §260 stay;
  - the panic lock still holds during its window.
- `npm run verify:probes` → 52 probes: 51 passed, 1 declared skip, 0 failed,
  exit 0 (includes the dead-code sweep over the removal).
- `node --check fearcore.js` clean.

## What this record does not claim

- It does not touch `brain.js`, whose inline state machine keeps its own RECOVER
  accounting (`brain.js:587-588`, `+= 0.02` per tick). That divergence and its
  single-owner migration are documented in `docs/PROVENANCE.md` (L802-806,
  L1098-1123) and are out of scope here.
- It does not copy the port's newer NOW-20 behavior (renewed lethal threat
  escalates RECOVER → PANIC, `packages/core/src/FearCore.js:303-311`). The sim
  deliberately keeps its panic-lock precedence: the two cores agree on the
  guard and differ, on purpose, on escalation.
- It certifies nothing beyond the probes. No test runner was used; the harness
  is a standalone probe, and its transcript lives in this session's temp
  workspace, not in the repository.
