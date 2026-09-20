# Pixel Pets Host — Clean Single-Commit Reproduction — 2026-09-20

**Status:** `CLEAN_SINGLE_COMMIT_REPRODUCED`
**Host commit:** `6867da9f4` on `codex/canonical-consolidation-2026-08-12` (parent `b8aabdf83`)
**Companion records:** `evidence/host_union_change_2026-09-20.patch`, `evidence/host_union_reproduction_2026-09-20.md`, `evidence/host_provenance_reconciliation_2026-09-20.md`

This closes the last host-provenance blocker. The single missing file identified
on 2026-09-20 was landed as one reviewed commit, and the Fear AI host diagnostic
was then rebuilt and run from a **clean checkout of that exact commit** — no
union, no untracked dependency, no dirty working tree.

## The landed change

| Property | Value |
|---|---|
| Commit | `6867da9f4` |
| Branch | `codex/canonical-consolidation-2026-08-12` |
| Parent | `b8aabdf83` |
| Diffstat | 1 file changed, 107 insertions(+) |
| File | `pixel-pets/src/overlay/persistence_restore.rs` (new) |
| Content | byte-identical to the blob committed on `reconcile/dirty-canonical-2026-09-16` at `e6b3fa517`, and to the previously untracked live file |
| Commit message | `fix(persistence): commit the missing persistence_restore module so the tree builds` |

The codex lineage already committed the formation-geometry safeguard and every
call site of the module (`main.rs`, `overlay/autosave.rs`,
`overlay/command_dispatch.rs` ×3, `pet_manager/management.rs`). Committing the
module body therefore turned the lineage into a single tree that contains both
halves of the previously split union.

Working-tree scope: only that one path changed state (untracked → committed);
the checkout's other 9,413 uncommitted entries were not staged, committed,
stashed, or discarded.

## Clean-checkout reproduction

```bash
HOST="C:\\tools\\03-Projects\\lains Tools\\New Master Game"
TMP="/c/tmp/fear-host-clean-6867da9f4"
rm -rf "$TMP" && mkdir -p "$TMP"
git -C "$HOST" archive --format=tar 6867da9f4 | tar -x -C "$TMP"
cd "$TMP/pixel-pets"
CARGO_TARGET_DIR="$HOST/pixel-pets/target" cargo check --offline --bin audit_fear_ai_connection
CARGO_TARGET_DIR="$HOST/pixel-pets/target" cargo build --offline --bin audit_fear_ai_connection
CARGO_TARGET_DIR="$HOST/pixel-pets/target" "$HOST/pixel-pets/target/debug/audit_fear_ai_connection.exe"
```

## Observed results (2026-09-20, this host)

- Clean tree contains both committed halves: `overlay/persistence_restore.rs` and `engine/formation_geometry.rs`.
- `cargo check --offline --bin audit_fear_ai_connection`: **PASS** (exit 0, 23.06 s; 41 pre-existing `pixel-pets` lib warnings, all unrelated lint notes).
- `cargo build --offline --bin audit_fear_ai_connection`: **PASS** (exit 0, 50.15 s, `dev` profile).
- Diagnostic run: **exit 0**, `ALL 8 AUDIT SECTIONS PASSED`, no panic, no non-finite state.
- Section 1 (sensory extraction): nearest enemy 40.0 px as expected; allies 1, enemies 2.
- Section 2 (fear math): Calm `FearScore=0.391`, Panic `FearScore=5.000 / Routed`.
- Section 3 (whitelist gate): intent JSON accepted; `fallback_and_recover` bias `0.840`.
- Section 4 (zero mutation): `ΔX=0.000000`, `ΔY=0.000000`, velocity `(0,0)→(0,0)`, HP `100/100→100/100`.
- Section 5: Alpha `veteran_01`, morale damping `2.000 → 1.328`.
- Section 6: Alpha Fall → `DeepRetreat` + `SquadPanicRegroup`.
- Section 7: 1v1/2v2/3v2/4v4/6v6 finite; 2,000-tick skirmish in 29.05 s (tick 2000 reached); 719,600 formation offsets plus 567 live squad-path formation ticks all finite.
- Section 8 (debug micro-benchmark, 1,000 iterations): mean `94.07 µs`, p95 `151 µs`, p99 `188 µs` — advisory p95 < 200 µs met and hard p99 < 1 ms gate met.
- Section 8B (host sim tick scaling, profiling only): ~4.8 ms at 2 units → ~59.3 ms at 60 units; not gated.

## Promotion

The Pixel Pets row moves from
`PARTIAL (UNREPRODUCIBLE_RECORDED_HOST_EVIDENCE)` to
`VERIFIED_CURRENT (HOST_DIAGNOSTIC_CLEAN_COMMIT)`, scoped to the committed host
diagnostic reproduced from a clean checkout of `6867da9f4`. The earlier
reconciliation and union records are retained as the history of how the blocker
was isolated and closed.

Still **not** claimed:

- a universal host-game or multi-engine certification;
- Unity Editor, Unreal, or any adapter beyond the previously proven envelope conformance;
- adoption by any host beyond the Pixel Pets diagnostic path;
- the diagnostic binary's own production-certification banner, which this record explicitly does not adopt.

## Honesty notes

- **Build cache:** the build reused the host's already-compiled dependency cache
  via `CARGO_TARGET_DIR`. The source tree was clean and unmodified from
  `6867da9f4`, but this was not a from-scratch dependency compile.
- **Local-only commit:** `6867da9f4` is a local commit on the codex branch; it is
  not pushed. Reproducibility is established against the committed tree, not a
  remote reference.
- **Sibling lineage:** `reconcile/dirty-canonical-2026-09-16` still carries its
  own copy of the module and still lacks `formation_geometry.rs`; a later merge
  of that lineage should reconcile the now-duplicated module.

## Scope boundary

The dirty host checkout was not modified beyond committing the single prepared
file. This is host provenance and diagnostic evidence, not a Fear AI middleware
certification or a universal engine-integration guarantee.
