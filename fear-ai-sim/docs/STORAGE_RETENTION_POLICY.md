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
