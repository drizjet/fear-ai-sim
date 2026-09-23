# Monorepo reconciliation proposal — `main` vs `master`

Status: **option 1 EXECUTED 2026-09-23** — repository default branch flipped to `main` via
`gh repo edit --default-branch main` (a reversible setting; no force-push, no push to `master`,
no history rewrite). Options 2–4 remain owner decisions. Written 2026-09-23 during
RESP-REPUTATION-PUBLIC-PRIVATE-001 work; recorded durably because the repository carries two
disjoint projects under one name.

## The facts (measured, not assumed)

- Remote `origin` = `https://github.com/drizjet/fear-ai-sim.git`.
- `master` head: `1e72d61` (2026-09-21, daily monorepo ops: CI/nightly/godot/unity/security
  commits). Its layout is a monorepo whose `fear-ai-sim/` subdirectory is a **legacy JS tree**
  ("Fear AI (JS tree)", README: "one of three live trees", entry point `docs/SYSTEM_MAP.md`,
  plus root `.github/workflows/test.yml`).
- `main` head at measurement time: `3476613` (2026-09-23, reputation wave; the branch advances with every push — head at the end-of-day audit was `72e3a4d`) — **this checkout** (the V8 society sim) pushed as an
  orphan root, because our checkout *is* the content of that subtree, restructured: git found
  no relation to `master`'s history (our repo was initialized fresh on 2026-09-22 after the
  workspace root `.git` purge — see `ROOT-RESIDUE-NOTES.md` outside this directory).
- Tree comparison, `HEAD` vs `origin/master:fear-ai-sim`:
  - shared paths: **4** — `.gitignore`, `README.md`, `package.json`, `package-lock.json`
  - only in ours: **164** files at that head (8 production modules, 150 test suites at measurement — 159 suites by the end of 2026-09-23, docs, ledger, CI)
  - only in theirs: **653** files (legacy runtime: `agent.js`, `brain.js`, `behaviortree.js`,
    `biofeedback.js`, `beliefs.js`, MASAC/Tauri/desktop assets, benchmarks, bin…)
  - `societycore.js` (the entire V8 core) **never existed on the remote** — `git show
    origin/master:fear-ai-sim/societycore.js` is empty.
- Conclusion: the two trees are **disjoint projects sharing a repository name**, not ancestor
  and descendant. There is no merge-base to preserve; "reconciling history" is really a
  *content layout* decision.

## Side discovery: the `SOURCE_ABSENT` sources are sitting on `master`

Seven completion-ledger rows are `SOURCE_ABSENT` because their cited files are absent **from
this checkout** ("re-open only with the files present"). **Executed as
`RESP-SOURCE-ABSENT-RECONCILIATION-001` (2026-09-23):** all 11 cited files were located on
`origin/master:fear-ai-sim/` (blob + sha256 pinned) except `tests/fearcore.test.js` (in neither
tree), FearBand Rust has 0 upstream paths, and every row received a disposition — supersede,
open-by-absence, or deferred — in `docs/SOURCE_ABSENT_RECONCILIATION.md`, guarded by
`tests/source-absent-reconciliation.test.js`. Nothing was extracted; extraction stays an
explicit re-open procedure.

## Options (owner decision required)1. **Status quo, dual branch — EXECUTED 2026-09-23 (recommended)** — `main` = V8 sim at root
with its own green CI (runs `35874405000`, `35874679330`, `35879709609`, all success);
`master` = untouched legacy monorepo. Default branch flipped to `main` with
`gh repo edit --default-branch main` (reversible: `--default-branch master`). Cost: the repo
*root* looks different per branch; `master` no longer defaults but is fully intact.
2. **Unrelated-history subtree merge** — branch off `master`, move our tree under a new
   top-level directory (e.g. `fear-ai-sim-v8/`) or replace the `fear-ai-sim/` subtree, commit
   with `--allow-unrelated-histories`, open a PR. Preserves both histories; requires CI
   `working-directory` updates; replacing the subtree removes legacy files from the branch
   *tip* (still recoverable from history). Nothing done without explicit approval.
3. **Make V8 the subtree replacement** — same as (2) but the legacy tree leaves `master`'s
   tip entirely. Effectively destructive to anyone using `master` as their working copy;
   only ever with explicit approval and a backup tag.
4. **Split repositories** — publish the V8 sim as its own repo and keep this one for the
   legacy tree (or archive it). Cleanest long-term separation; requires creating/moving a
   repository (owner decision).

## What was deliberately NOT done

No force-push, no push to `master`, no history rewrite, no subtree deletion. The only settings
ever touched: remote (`origin` added) and the default-branch pointer (`master` → `main`,
reversible). Both pushes to `main` were plain fast-forward updates of a branch that did not
exist before 2026-09-23.
