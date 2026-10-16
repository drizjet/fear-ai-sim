# Audit Dossier Accuracy — 2026-10-15

**Scope:** Two module rows of `evidence/manual-source-code-audit-dossier.md`
(lines 63 and 163) re-checked against the complete git history of the two
described modules — `packages/core/src/RouteMemory.js` and
`packages/core/src/AdaptiveBudgetBackpressureController.js` — plus a
whole-tree grep for the algorithm both rows name. This is a
documentation-accuracy record; no product code, probe, or count changed.

**What this record does not claim.** It does not re-audit the dossier's other
rows and does not assert that the rest are correct or incorrect. It does not
change the dossier's status: it is already `status: historical-superseded`,
listed as non-authoritative in `docs/README.md`,
`docs/RELEASE_CANDIDATE_CERTIFICATION.md`, and `docs/SYSTEM_MAP.md`, and
guarded as such by `tools/verification/verify_release_claim_boundaries.mjs`
(`supersededRecords`). It does not claim the two modules are defective — both
modules exist and behave; what never matched any revision are the specific
internals named below. No release statement changes.

---

## 1. The finding

The two rows were sampled by their common marker — both describe an "EWMA"
update — and both descriptions turned out to have **never been true of any
revision**, not merely stale.

### Row 163 — `AdaptiveBudgetBackpressureController.js`

Claimed: `310` lines; "EWMA frame-time tracking:
T_ewma = 0.9*T_prev + 0.1*T_sample"; "three degradation tiers (NORMAL,
REDUCED, CRITICAL)".

Actual (git-verified):

- The file's complete commit history is two commits: `7d8a4e2` (created
  2026-09-08, **215 lines**) and `3b5edd5` (this campaign's failure-telemetry
  fix). Current: 230 lines. It was never 310 lines.
- The audit commit itself (`c30ca52`, 2026-09-14) does not touch this file, so
  the described code existed in the tree — at 215 lines — when the row was
  written.
- No revision contains an EWMA, a frame-time average, or `T_ewma`; no
  `0.9 / 0.1` weighting exists anywhere. The controller's time logic is a
  per-item budget check (`elapsed >= budgetMs`), not smoothing.
- Degradation modes were `FULL_FIDELITY` / `SELECTIVE_DECIMATION` /
  `EMERGENCY_THROTTLING` from the creation commit; `NORMAL / REDUCED /
  CRITICAL` appear nowhere at any revision.
- What the row got right: queue coalescing exists; the host-authority posture
  is accurate.

### Row 63 — `RouteMemory.js`

Claimed: `210` lines; "perceived danger EWMA update";
"F = 1 - (1 - F_0)*0.95"; "bounded by maxRoutes (50)".

Actual (git-verified):

- `RouteMemory.js` has exactly one commit in its entire history (`db8db4a`)
  and has been **176 lines** since creation, including at `c30ca52`. It was
  never 210 lines.
- The danger update is not an EWMA: a safe traversal applies geometric decay
  (`perceivedDanger * 0.92`), an incident raises a floor
  (`max(perceivedDanger, 0.65*(0.5+severity))`), and `tick()` relaxes toward
  the 0.5 prior (`0.5 + (p-0.5)*(1-0.002)^dt`). No new-sample mixing term
  exists anywhere.
- The familiarity gain is `0.12` per safe traversal (`F += 0.12*(1-F)`), so
  the claimed `*0.95` per-step retention matches no constant in the file.
- The bound is `maxEntries: 40`, and the key name `maxRoutes` appears nowhere
  in the file.

**Sampling note, recorded rather than generalized:** these two rows were
selected precisely because they share the "EWMA" marker; both failed that
check. The failure rate on the sample is part of the finding. It is not a
claim about the other rows.

## 2. Why it matters

- The dossier is already barred from current release claims, so no release
  statement is affected. The finding is about the historical record's internal
  accuracy: a document titled "100% manual, line-by-line inspection" contains
  rows describing algorithms that never existed in any revision of their
  modules. Future archaeology must not trust these rows' specifics.
- Rule 3 ("do not delete negative findings"): this record keeps the finding on
  file instead of quietly editing the dossier.

## 3. Disposition

- The dossier's table rows are preserved verbatim — the historical record is
  not rewritten. A dated accuracy errata note was added to the dossier's
  header, below its existing scope banner, pointing at this record.
- `docs/REMAINING_WORK.md` is superseded and remains untouched (same precedent
  as the FearCore extended-scale tranche).
- No gate is affected: `verify_release_claim_boundaries.mjs` checks the
  dossier only for `status: historical-superseded`, `Historical record`,
  `superseded_by:`, and the absence of re-certification status lines; all four
  remain satisfied.

## 4. Verification

- `npm run verify:release-claims` — **SUCCESS** after the errata note: all 11
  boundary groups PASS, including "Superseded records are explicitly
  historical and non-authoritative (10): PASS".
- `npm run guardian:check` — **CLEAN**.
- Exact git evidence, re-runnable:
  - `git log --oneline --follow -- fear-ai-sim/packages/core/src/AdaptiveBudgetBackpressureController.js`
    → 2 commits (`7d8a4e2`, `3b5edd5`)
  - `git log --oneline --follow -- fear-ai-sim/packages/core/src/RouteMemory.js`
    → 1 commit (`db8db4a`)
  - `git cat-file -p "7d8a4e2:<controller path>"` → 215 lines;
    `git cat-file -p "c30ca52:<RouteMemory path>"` → 176 lines
  - Tree-wide grep for `EWMA|T_ewma` → only the dossier's own two rows
  - Path-scoped pickaxe `git log -S "T_ewma" -- <controller path>` → empty

## 5. Boundaries

- Only the two enumerated rows were re-checked. "Never true in any revision"
  is asserted only for the enumerated claims, each backed by the module's
  complete commit history above.
- The errata note deliberately does not claim the other rows were verified,
  and does not claim they are wrong.
- The probe suite count stays 50 in this tranche; nothing in the probe,
  dossier-roster, or codegen surfaces was touched.
