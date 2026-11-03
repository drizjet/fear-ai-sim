# Fear AI workspace storage policy (2026-11-02)

**Status: manual preflight, not automatic garbage collection.** Git ignores
`target/`, `node_modules/`, `dist/`, logs and similar generated products, but
`.gitignore` does not free disk space. Fear AI has many private engineering
checkouts; some contain unique local commits, dirty state or off-Git evidence.
No existing universal retention/cleanup daemon has been verified.

## Before any substantial Rust/Node/Godot build or new worktree

From `fear-ai-sim` on Windows, run:

```powershell
pwsh -NoProfile -File tools/maintenance/inspect_storage.ps1
# Strict preflight: return exit 2 on low disk space or excessive workspaces
pwsh -NoProfile -File tools/maintenance/inspect_storage.ps1 -FailOnRisk
# Optional, slower estimates; JSON can be redirected to the operator's own evidence folder
pwsh -NoProfile -File tools/maintenance/inspect_storage.ps1 -DeepMeasure -Json
```

Default alerts: **under 100 GB free** on the workspace drive or **over 12**
named Fear AI workspaces. These are operational early warnings, not universal
capacity requirements. The tool is read-only, does not look into canonical or
protected worktree history, and marks all deletion decisions unauthorized.
Names, ages and size estimates are **not proof that a directory is idle**.
Recheck actual live processes/jobs, worktrees, Git state and ownership before
any later mutation. A warning does not authorize terminating builds.

## Separate the four storage classes

1. **Tracked source and historical archives:** Keep in Git. The dated research
   `archive/` has an explicit provenance purpose. Never delete it merely to
   reduce a file count. Keep negative scientific evidence, claim limitations,
   active source, protocol fixtures, manifests and test provenance.
2. **Local Git checkouts and checkpoint clones:** Preserve whenever active,
   dirty, untracked, holding unique unpushed commits, or used by another owner.
   A *clean* checkout can still contain a commit that exists nowhere else.
   Before retiring one, prove its exact revision survives in a verified
   surviving repository or a SHA-256 checked Git bundle, its manifest and
   failed/successful evidence survive, and no running job uses it. Obtain the
   checkout owner's approval. Never auto-delete by name or age.
3. **Generated caches and build products:** Reuse a stable **owned**
   `CARGO_TARGET_DIR` per isolated Rust workstream instead of allocating a fresh
   multi-hundred-megabyte directory for every probe. Set the variable only for
   commands you own. Keep Node dependencies and other installed/generated
   outputs in their owned workspace; verify `package-lock.json` when copying
   dependencies offline. To reclaim space, inspect process/handle ownership
   and generated-versus-unique evidence first, then remove *only* specifically
   approved, isolated build products. Never run `cargo clean` or purge caches
   in someone else's worktree or shared global Cargo registry.
4. **Logs, verification and backups:** Put dated SHA-256 manifests, execution
   logs, failures, Git hashes and continuation instructions into an explicitly
   named evidence folder. Preserve the independent verification record before
   retiring a checkout. Avoid untracked `copy`, `backup`, `old` trees and
   redundant ZIPs as pseudo-version control. Use source-controlled commits and
   hashed, separately retained Git bundles when needed, not a chain of full
   duplicate folders. Do not overwrite or silently discard old failure logs.

## Safe storage retirement is a separate authorized operation

Use the **read-only retirement triage** to inspect potential old checkouts
without touching them:

```powershell
pwsh -NoProfile -File tools/maintenance/inspect_retirement.ps1
pwsh -NoProfile -File tools/maintenance/inspect_retirement.ps1 -Json
```

This report checks a fixed set of known checkout layouts, records Git HEAD,
tracked/untracked status, linked worktree counts, evidence-manifest name
candidates and process-command-line *hints*. It requests `GIT_OPTIONAL_LOCKS=0`
for the status reads. It does **not** inspect all ignored files, prove unique
commits are retained elsewhere, identify the owner, or validate hashes of
every evidence file. A process command line can omit a workspace even when
it is in use. Therefore every row reports `eligible_for_deletion=false`.

**For one specific workspace whose structure is unclear**, use the bounded
read-only candidate inspector. It walks existing directories to a limited depth,
does not traverse `node_modules`, Rust `target/`, `.git`, reparse points or other
large/generated directory names, and reports nested Git checkouts, ignored
entries, Git object-store alternates and historical snapshot/evidence folder
hints. The target must be an existing direct child of the declared output root:

```powershell
pwsh -NoProfile -File tools/maintenance/inspect_candidate_retention.ps1 `
  -WorkspacePath 'C:\tools\05-Output\EXACT_EXISTING_WORKSPACE' -Json
```

The report explicitly identifies directory/depth caps and skipped subtrees.
An unrecognized folder is **not** proof of an empty repository or disposable
backup; its nested `game_snapshot`, `sdk_snapshot`, cleanrooms and review
bundles may hold unique source or evidence. Likewise, a *clean* Git checkout
with an `objects/info/alternates` file may depend on another repository's Git
object storage: its independence is **not proven**. Even when it finds no
repository within the bounded scan, the inspector never authorizes deletion,
never validates evidence continuity, and does not change anyone's workspace.

**To quantify old source-snapshot overlap without altering either tree**, run
the bounded SHA-256 comparator with explicitly discovered paths:

```powershell
pwsh -NoProfile -File tools/maintenance/inspect_snapshot_overlap.ps1 `
  -SnapshotRoot 'C:\tools\05-Output\EXACT_WORKSPACE\game_snapshot' `
  -ReferenceRoot 'C:\tools\03-Projects\lains Tools\New Master Game' `
  -MaxHashPairs 40 -MaxHashInputMB 500 -Json
```

This inventories *logical* snapshot sizes and reference-file presence/size,
records up to 500 missing or different-size paths by default, and hashes a
bounded largest-file sample for exact matching. Results include both the
explicit un-hashed file count and exception truncation flag. A file that
matches in size is not necessarily byte-identical; a matching hash against a
**mutable** reference tree is still not proof of independent historical
preservation. The tool cannot certify duplicate physical disk usage, a stable
archive, owner permission or deletion eligibility. Neither tree is edited.

**2026-11-03 Cycle 29 measured example:** The 676.99 MiB `game_snapshot`
contained 13,047 files: 12,909 matched reference sizes, 136 differed in
size, and two Rust historical files were absent from today's canonical game
tree (`cycle21_layout_interpreter_pre_cache_fix.rs` and
`cycle20_movement_original_backup.rs`). The 40 largest hashed same-size
pairs matched SHA-256 (250 MiB of snapshot content), but another 12,869
same-size files remain un-hashed and no historical custody has been proved.
The 138 exception paths and independent source hashes for the two missing
files were saved **outside** the candidate in the auditor's evidence folder.
No workspace or historical file was deleted. C: had roughly 19.49 GiB free
at the initial check, so avoid creating more full clones or costly build
outputs until capacity is managed with explicit owners and survival proof.

**2026-11-03 limited candidate findings:** The current owned foundation checkout
has a Git alternate pointing at the canonical SDK object store and ignored
dependency output; it is not self-contained merely because its worktree can
be clean. The older Cycle 29 `FEAR_AI_CYCLE29_OWNED_20261025` workspace contained
at least 11 snapshot/evidence directory hints in the bounded scan; no `.git`
repository was found *within that depth*, and a deeper scan would be needed
before any completeness claim. Both were inspected read-only; neither is an
approved retirement candidate. C: space had fallen to approximately 23.6 GB
free at the start of this continuation, so avoid new bulky clones/builds.

After an owner reviews one candidate, preserve its unique history with
verified Git references or a checked `git bundle` stored **outside** that
candidate, and separately retain/have another process validate important
evidence hashes. Verify no active job, handle, linked checkout, or unrelated
agent still relies on the target. Only then undertake a separately authorized
exact-path retirement. There is intentionally **no deletion command** here.

Treat low free space as a signal to **stop creating fresh bulky clones**, not
as permission to delete the oldest ones. Inventory candidate size, Git heads,
dirty/untracked/ignored content, linked worktrees, child jobs/process handles,
external references, off-Git manifests and irreplaceable commit objects. Work
with the candidate's owner. Preserve and independently verify any necessary
Git bundle/evidence before an approved, exact-path deletion. Do not use broad
recursive cleanup, shared terminal keyboard input, global `cargo clean`, hook
bypass, force push or `git gc` to conceal or destroy unpushed work.

This file describes a **manual discipline with a diagnostic tool**, not a
scheduled task or evidence that any past checkout has been safely removed.

## Recommended ongoing lifecycle (not yet automatically enforced)

**Opening an owned workspace:** Prefer resuming the existing private checkout
and reusing its owned Rust target directory. If isolation truly requires a
new one, assign a unique workspace path, branch, owner/session identifier and
evidence folder first. Record its source HEAD, the exact dependency lockfile,
its build-target path and whether other agents may read it. Never infer ownership
from the current terminal or folder title. Avoid symlinking mutable
`node_modules` or `target` trees across concurrent writers.

**Create a per-workspace ownership receipt once:** An explicitly identified
owner of an already isolated workspace can preview a receipt, then create it
only after supplying the exact Git HEAD. The workspace must be a direct child
of the declared output root with an existing `repo/.git` and `evidence/` folder:

```powershell
$ws = 'C:\tools\05-Output\YOUR_OWN_ISOLATED_WORKSPACE'
$head = git -C "$ws\repo" rev-parse HEAD
# Preview is the default; use only an owner-approved workspace and label.
pwsh -NoProfile -File tools/maintenance/write_workspace_receipt.ps1 `
  -WorkspacePath $ws -OwnerLabel 'your-session-id' -Purpose 'your-task' -ExpectedHead $head
# Opt-in creation: requires the same explicit full HEAD; never overwrites.
pwsh -NoProfile -File tools/maintenance/write_workspace_receipt.ps1 `
  -WorkspacePath $ws -OwnerLabel 'your-session-id' -Purpose 'your-task' `
  -ExpectedHead $head -Write
```

The receipt is `evidence/workspace_owner_receipt.json`, created with
`CreateNew` (no overwrites). It records a self-declared owner label and purpose,
Git branch/HEAD, optional SHA-256 of a separately specified checkpoint
manifest, package-lock digest if present, and proposed owned Rust target. It
**cannot authenticate the agent**, grant exclusive access, establish that
the checkout is idle, or approve deletion. Its recorded HEAD is a creation
snapshot, not a rolling current-state certificate. `inspect_retirement.ps1`
reports matching receipt fields, changes to HEAD, invalid receipts and
checkpoint-hash mismatches as separate states while holding all entries.
Absence of a receipt in earlier workspaces remains an unknown, not permission
to assume their owners are gone. Never fabricate receipts for other agents.

**During work:** Run the preflight before a large build; use a stable
`CARGO_TARGET_DIR` belonging to that workstream, not the machine-wide shared
Cargo `target`. Save failed and successful test logs with their exit status and
SHA-256, and include precise limitations in the engineering register. Do not
create a complete clone for each individual change or checkpoint.

**After a verified local commit:** Prefer preserving Git history and the
minimal off-Git manifest/evidence, not another full checkout. An owner can
mark the workspace `ACTIVE`, `PARKED` or `RETIREMENT_REVIEW` in their own
manifest; this is a *proposal*, not permission for another agent to delete it.

**Weekly and when disk is pressured:** Run both read-only scripts, saving
their JSON output in the current owner's evidence folder with hashes. Review
the largest isolated **generated** targets first, followed by idle duplicate
checkouts. Never run unattended retirement; even a clean repository can hold
unpublished commits and ignored artifacts. If available space remains below
the minimum after documented safe cleanup, pause new costly build work and
investigate other disk consumers rather than declaring Fear AI to be the
whole cause. A future OS scheduler could run these **read-only scans** with
a dedicated account, bounded rotating reports and an alert; no scheduler or
OS-owned inventory registry is installed by this change.

**2026-11-02 initial retirement scan:** 50 named workspace folders were
inspected in read-only mode; 25 reported clean Git snapshots, two reported
tracked/untracked changes, and 23 did not expose a repository at the limited
recognized layouts (they require manual inspection, not classification as
empty). At least one snapshot showed linked worktrees. **Zero folders were
approved for retirement and zero files were removed.** The reported folder
footprint was approximately 25.73 GB of logical file sizes, not a guarantee
of reclaimable physical disk space.
