# Monorepo reconciliation proposal — `main` vs `master`

Status: **proposal only — no destructive git action taken.** Written 2026-09-23 during
RESP-REPUTATION-PUBLIC-PRIVATE-001 work; recorded durably because the repository carries two
disjoint projects under one name and the repo owner should decide the merge strategy.

## The facts (measured, not assumed)

- Remote `origin` = `https://github.com/drizjet/fear-ai-sim.git`.
- `master` head: `1e72d61` (2026-09-21, daily monorepo ops: CI/nightly/godot/unity/security
  commits). Its layout is a monorepo whose `fear-ai-sim/` subdirectory is a **legacy JS tree**
  ("Fear AI (JS tree)", README: "one of three live trees", entry point `docs/SYSTEM_MAP.md`,
  plus root `.github/workflows/test.yml`).
- `main` head: `3476613` (2026-09-23) — **this checkout** (the V8 society sim) pushed as an
  orphan root, because our checkout *is* the content of that subtree, restructured: git found
  no relation to `master`'s history (our repo was initialized fresh on 2026-09-22 after the
  workspace root `.git` purge — see `ROOT-RESIDUE-NOTES.md` outside this directory).
- Tree comparison, `HEAD` vs `origin/master:fear-ai-sim`:
  - shared paths: **4** — `.gitignore`, `README.md`, `package.json`, `package-lock.json`
  - only in ours: **164** files (8 production modules, 150 test suites, docs, ledger, CI)
  - only in theirs: **653** files (legacy runtime: `agent.js`, `brain.js`, `behaviortree.js`,
    `biofeedback.js`, `beliefs.js`, MASAC/Tauri/desktop assets, benchmarks, bin…)
  - `societycore.js` (the entire V8 core) **never existed on the remote** — `git show
    origin/master:fear-ai-sim/societycore.js` is empty.
- Conclusion: the two trees are **disjoint projects sharing a repository name**, not ancestor
  and descendant. There is no merge-base to preserve; "reconciling history" is really a
  *content layout* decision.

## Side discovery: the `SOURCE_ABSENT` sources are sitting on `master`

Seven completion-ledger rows are `SOURCE_ABSENT` because their cited files are absent **from
this checkout** ("re-open only with the files present"). The legacy tree visibly contains at
least `brain.js` and `biofeedback.js` (and likely `fearcore.js`-class files — unverified until
each row is checked). This is what makes the declared next responsibility
`RESP-SOURCE-ABSENT-RECONCILIATION-001`: verify each of the seven citations against
`origin/master:fear-ai-sim/`, then either (a) extract the specific file(s) with provenance
into this checkout and re-open the row, or (b) formally supersede the row citing the V8
design — both legal under the evidence rule, neither taken yet.

## Options (owner decision required)

1. **Status quo, dual branch (recommended until decided)** — `main` = V8 sim at root with its
   own green CI (runs `35874405000`, `35874679330`, both success); `master` = untouched
   legacy monorepo. Zero destructive operations. Cost: the repo *root* looks different per
   branch, and GitHub's default branch (`master`) does not show the V8 sim.
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

No force-push, no push to `master`, no history rewrite, no subtree deletion, no default-branch
change. Both pushes to `main` were plain fast-forward updates of a branch that did not exist
before 2026-09-23.
