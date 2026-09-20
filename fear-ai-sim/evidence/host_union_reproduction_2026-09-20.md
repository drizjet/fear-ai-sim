# Pixel Pets Host Union — Fresh Clean-Tree Reproduction — 2026-09-20

**Status:** `UNION_REPRODUCED_FROM_A_CLEAN_SOURCE_TREE`
**Host change:** `evidence/host_union_change_2026-09-20.patch` (one file, 107 lines)
**Companion records:** `evidence/host_provenance_reconciliation_2026-09-20.md`, `evidence/host_rebuild_attempt_2026-09-19.md`

This record supplies the missing reproduction that the 2026-09-19 rebuild
attempt could not produce. It does **not** modify the user's dirty host
checkout, and it does **not** promote the Pixel Pets row to a single-commit
certification on its own — see "What this does and does not prove" below.

## The reviewed host-side change

The two host lineages identified on 2026-09-20 differ by exactly one needed
file. The codex lineage (`codex/canonical-consolidation-2026-08-12`, which owns
the named evidence commit `f3f5e8d25` and the committed formation-geometry
safeguard) already:

- declares `pub(crate) mod persistence_restore;` in `pixel-pets/src/overlay/mod.rs`, and
- **calls** that module from `main.rs`, `overlay/autosave.rs`, `overlay/command_dispatch.rs` (3 sites), and `pet_manager/management.rs`.

It simply never commits the module body. Landing that one file makes the codex
lineage a tree whose clean checkout builds the diagnostic:

| Property | Value |
|---|---|
| File added | `pixel-pets/src/overlay/persistence_restore.rs` |
| Content | byte-identical to the blob committed on `reconcile/dirty-canonical-2026-09-16` at `e6b3fa517` |
| Also byte-identical to | the untracked live file in the dirty checkout |
| Patch | `evidence/host_union_change_2026-09-20.patch` |
| `git apply --numstat` | `107 0 pixel-pets/src/overlay/persistence_restore.rs` |
| Apply check | clean against a fresh `git archive f3f5e8d25` tree |

The module is self-contained against the codex lineage. Verified present at
`f3f5e8d25`: `config::SavedState` (with `overlay.desktop_rts_mode` and
`rts_world`), `engine::RtsWorldState` (re-exported at `engine/mod.rs:109`, with
`unit_to_pet`/`building_to_pet` and a `Default` impl), `pet_manager::GlobalSettings`
(exactly the five fields the module's tests use), and `OverlayRuntimeSettings`
(public, `Default`).

## Reproduction (read-only against the dirty checkout)

```bash
HOST="C:\\tools\\03-Projects\\lains Tools\\New Master Game"
TMP="/c/tmp/fear-host-union-f3f5e8d25"
rm -rf "$TMP" && mkdir -p "$TMP"

# 1. Extract the committed evidence tree without touching the checkout.
git -C "$HOST" archive --format=tar f3f5e8d25 | tar -x -C "$TMP"

# 2. Apply the reviewed one-file union change.
git -C "$TMP" apply /c/tools/03-Projects/lains\\ Tools/lainself/fear-ai-sim/fear-ai-sim/evidence/host_union_change_2026-09-20.patch

# 3. Build and run the diagnostic from the clean source tree.
cd "$TMP/pixel-pets"
CARGO_TARGET_DIR="$HOST/pixel-pets/target" cargo build --offline --bin audit_fear_ai_connection
CARGO_TARGET_DIR="$HOST/pixel-pets/target" cargo run  --offline --bin audit_fear_ai_connection
```

## Observed results (2026-09-20, this host)

- `cargo check --offline --bin audit_fear_ai_connection`: **PASS** (exit 0, 28.6 s; 41 pre-existing `pixel-pets` lib warnings, all unrelated `egui`/`f32` lint notes).
- `cargo build --offline --bin audit_fear_ai_connection`: **PASS** (exit 0, 48.7 s, `dev` profile).
- Diagnostic run: **exit 0**, `ALL 8 AUDIT SECTIONS PASSED`, no panic, no non-finite state.
- Section 1 (sensory extraction): nearest enemy 40.0 px as expected; allies 1, enemies 2.
- Section 2 (fear math): Calm `FearScore=0.391 / BPM 69 / hold_line`; Panic `FearScore=5.000 / Routed / BPM 180 / arrhythmia`.
- Section 3 (whitelist gate): intent JSON accepted by the host `IntentValidator`; `fallback_and_recover` bias `0.840`.
- Section 4 (zero mutation): `ΔX=0.0`, `ΔY=0.0`, velocity and HP unchanged.
- Sections 5–6: Alpha election `veteran_01` with morale damping `2.000 → 1.328`; Alpha Fall → `DeepRetreat` + `SquadPanicRegroup`.
- Section 7: 1v1/2v2/3v2/4v4/6v6 finite; 2,000-tick multi-faction skirmish reached tick 2000; 719,600 formation offsets and 567 live squad-path formation ticks all finite.
- Section 8 (debug micro-benchmark, 1,000 iterations): two consecutive runs measured mean `115.26 µs` / p95 `138 µs` / p99 `151 µs` and mean `105.26 µs` / p95 `145 µs` / p99 `177 µs`. Both meet the advisory p95 < 200 µs target and the hard p99 < 1 ms gate; the spread is consistent with the ledger's note that debug p95 is noisy.
- Section 8B (host sim tick scaling, profiling only): ~5.1 ms at 2 units → ~64.4 ms at 60 units; diagnostic-only, not gated.

## What this does and does not prove

- **Does prove:** the recorded Pixel Pets diagnostic is reproducible from a clean
  source tree once the one documented file is present. The 2026-09-19 build
  failure (`E0583`, missing module) is fully explained and has a one-file fix.
- **Does not prove:** a single-commit host certification. Until the patch lands
  on the codex lineage, the reproduction still depends on source from outside
  the named commit — exactly the condition the ledger's
  `PARTIAL (UNREPRODUCIBLE_RECORDED_HOST_EVIDENCE)` qualifier describes.
- **Does not adopt** the diagnostic binary's own production-certification
  banner. That banner is the host diagnostic's marketing footer; the Fear AI
  release dossier remains `PROVISIONAL / NOT CERTIFIED` and does not inherit it.
- **Build caveat (disclosed):** the build reused the host's already-compiled
  dependency cache via `CARGO_TARGET_DIR` to stay within budget. The *source*
  tree is clean and unmodified from `f3f5e8d25` plus the one patch, but this was
  not a from-scratch dependency compile.

## Path to promoting the row

1. Land `evidence/host_union_change_2026-09-20.patch` on
   `codex/canonical-consolidation-2026-08-12` as a single reviewed commit.
2. Re-run the diagnostic from a clean checkout of that commit.
3. Then, and only then, promote the Pixel Pets row from
   `PARTIAL (UNREPRODUCIBLE_RECORDED_HOST_EVIDENCE)` to a reproducible
   single-commit host certification.

## Resolution (2026-09-20)

The patch was landed as host commit `6867da9f4` on
`codex/canonical-consolidation-2026-08-12`, and the diagnostic was rebuilt and run
from a clean checkout of that commit (offline, exit 0, all 8 sections pass). See
`evidence/host_clean_commit_reproduction_2026-09-20.md`.

## Scope boundary

Read-only against the dirty host checkout (no file was created, staged,
committed, or deleted there). This is host provenance and diagnostic evidence,
not a Fear AI middleware certification, and it does not touch the dirty
checkout's 9,414 changed entries.
