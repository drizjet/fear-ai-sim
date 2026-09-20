# Pixel Pets Host Provenance Reconciliation — 2026-09-20

**Status:** `ROOT_CAUSE_IDENTIFIED / STILL_UNREPRODUCIBLE_FROM_A_SINGLE_COMMIT`
**Supersedes the root-cause paragraph of:** `evidence/host_rebuild_attempt_2026-09-19.md`

This record refines the 2026-09-19 rebuild finding. The earlier record established
that a clean rebuild from the named host commit failed with `E0583` because
`pixel-pets/src/overlay/persistence_restore.rs` was absent. This record explains
*why* it is absent and what that means for the host evidence claim. It is
read-only: it does not modify the sibling host checkout and does not re-run the
host diagnostic.

## The two host lineages

The recorded Pixel Pets evidence was produced from a working tree that combined
sources from **two unmerged host lineages**. Neither lineage alone contains
everything the diagnostic needs.

| Piece the recorded evidence used | Committed on | Named commit |
|---|---|---|
| Fear AI bridge + audit binary (`fear_ai_bridge.rs`, `bin/audit_fear_ai_connection.rs`) | `codex/canonical-consolidation-2026-08-12` | present at `f3f5e8d25` |
| Formation-geometry `square_offset` ring≥1 safeguard (`engine/formation_geometry.rs`) | `codex/canonical-consolidation-2026-08-12` | `91af8f957` (intro `d35715070`) |
| Persistence module (`overlay/persistence_restore.rs`) | `reconcile/dirty-canonical-2026-09-16` | `e6b3fa517` |

The codex lineage's `pixel-pets/src/overlay/mod.rs` **declares**
`pub(crate) mod persistence_restore;` (introduced by `87a6a8a54`) but never
commits the module file. The reconcile lineage commits the module (with the
same `mod.rs` declaration) but has no `formation_geometry.rs`. The current dirty
checkout at `11582382c` happens to contain both, because it is a working tree
that merged the two lineages' content without committing that union.

## Re-derived proof (read-only)

Run from the sibling host repository:

```bash
git log --all --oneline -- pixel-pets/src/overlay/persistence_restore.rs
#   -> only e6b3fa517 "feat(persistence): add rich pet adapters and a shared RTS save boundary"
git branch -a --contains e6b3fa517
#   -> only reconcile/dirty-canonical-2026-09-16
git cat-file -e f3f5e8d25:pixel-pets/src/overlay/persistence_restore.rs   # -> fails (absent)
git show f3f5e8d25:pixel-pets/src/overlay/mod.rs | grep persistence_restore
#   -> "pub(crate) mod persistence_restore;"  (dangling declaration)
git log --all --oneline -- pixel-pets/src/engine/formation_geometry.rs
#   -> d35715070 (intro) and 91af8f957 (ring>=1 safeguard), codex lineage only
git ls-tree -r --name-only reconcile/dirty-canonical-2026-09-16 | grep formation_geometry
#   -> (empty: the reconcile lineage has no formation-geometry module)
```

Conclusions, each reproducible from the commands above:

1. `persistence_restore.rs` is committed **only** on
   `reconcile/dirty-canonical-2026-09-16` (via `e6b3fa517`).
2. `formation_geometry.rs` is committed **only** on
   `codex/canonical-consolidation-2026-08-12` (via `d35715070` / `91af8f957`).
3. No local or remote ref contains both files, so **no single committed tree can
   build the diagnostic**: the union of two unmerged lineages is required.
4. Independently of the missing file, the codex lineage as committed is internally
   inconsistent — its `overlay/mod.rs` references a module that does not exist in
   that history. A clean checkout of the named evidence commit therefore cannot
   compile, regardless of the recorded latency/formation results.

## What this does and does not change

- It **does** sharpen the root cause: the evidence is not merely missing one
  untracked file; it depends on a *cross-branch union* that was never committed.
  Recording the evidence against `f3f5e8d25` alone is therefore a provenance
  error in the evidence trail, not a defect introduced by the audit.
- It **does not** promote the Pixel Pets row. The host row stays
  `PARTIAL (UNREPRODUCIBLE_RECORDED_HOST_EVIDENCE)` because there is still no
  single clean commit that reproduces the diagnostic.
- It **does not** imply the current dirty host implementation is semantically
  broken. It only shows that no committed host tree reproduced the run.

## Path to a clean host certification

Exactly one of the following must happen before the host row can be promoted:

1. **Commit the union.** Land a reviewed host commit that contains both the
   persistence module (from `e6b3fa517`) and the formation-geometry safeguard
   (from `91af8f957`). The change is already prepared: the codex lineage
   (`f3f5e8d25`) holds the safeguard and the call sites, so only the module file
   is needed — `evidence/host_union_change_2026-09-20.patch` adds exactly that
   file, and `evidence/host_union_reproduction_2026-09-20.md` records a clean-tree
   build/run that passes all 8 diagnostic sections. Then rerun
   `cargo run --manifest-path pixel-pets/Cargo.toml --bin audit_fear_ai_connection`
   from that commit with a clean `git status --short`.
2. **Fix the codex lineage declaration.** If the persistence module is genuinely
   not part of the codex lineage, remove the dangling `mod persistence_restore;`
   declaration and rebuild the audit evidence against a tree that does not need it.
3. **Exclude host certification from the release surface.** Record explicitly in
   the ledger and RC dossier that external-host certification is out of scope for
   the current release, leaving the bridge as `PARTIAL (RECORDED)` evidence.

Until one of those is done, host integration remains recorded, bounded, and
non-reproducible by construction.

## Reproducible probe

`tools/verification/verify_host_provenance.mjs` re-derives items 1–4 above when
the sibling host checkout is available, and records a graceful skip (leaving the
host row `PARTIAL (RECORDED)`) when it is not. It is read-only against the host
repository.

```bash
node tools/verification/verify_host_provenance.mjs
```

## Resolution (2026-09-20)

The prepared one-file union was landed as host commit `6867da9f4` on
`codex/canonical-consolidation-2026-08-12`, and the diagnostic was rebuilt and
run from a clean checkout of that commit (offline, exit 0, all 8 sections pass,
zero mutation `ΔX=ΔY=ΔHP=0`). The Pixel Pets row is promoted to
`VERIFIED_CURRENT (HOST_DIAGNOSTIC_CLEAN_COMMIT)`; see
`evidence/host_clean_commit_reproduction_2026-09-20.md`. This record is retained
as the history of how the blocker was isolated.

## Scope boundary

This record is a provenance finding about git history and committed trees. It is
not a host build, not a host runtime result, and not a Fear AI middleware
certification. It does not modify the dirty sibling checkout.
