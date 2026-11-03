# Single-workspace read-only retention discovery. Never authorizes deletion.
# Bounded recursion avoids traversing huge node_modules, Rust target or .git trees.
param(
    [Parameter(Mandatory = $true)][string]$WorkspacePath,
    [string]$OutputRoot = 'C:\tools\05-Output',
    [int]$MaxDepth = 4,
    [int]$MaxDirectories = 600,
    [int]$MaxRepositories = 32,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($MaxDepth -lt 1 -or $MaxDepth -gt 8 -or
    $MaxDirectories -lt 1 -or $MaxDirectories -gt 5000 -or
    $MaxRepositories -lt 1 -or $MaxRepositories -gt 100) {
    throw 'Limits must satisfy depth 1..8, directories 1..5000, repositories 1..100'
}
if (!(Test-Path -LiteralPath $OutputRoot -PathType Container) -or
    !(Test-Path -LiteralPath $WorkspacePath -PathType Container)) {
    throw 'Existing OutputRoot and WorkspacePath directories required'
}
$root = (Resolve-Path -LiteralPath $OutputRoot).Path.TrimEnd('\')
$workspace = (Resolve-Path -LiteralPath $WorkspacePath).Path.TrimEnd('\')
if (![string]::Equals([System.IO.Directory]::GetParent($workspace).FullName.TrimEnd('\'),
        $root, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'WorkspacePath must be a direct child of OutputRoot'
}
foreach ($path in @($root, $workspace)) {
    if (((Get-Item -LiteralPath $path -Force).Attributes -band
            [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Refusing reparse-point path: $path"
    }
}

$blockedNames = @('.git', 'node_modules', 'target', 'dist', 'dist-electron',
    '.godot', '.next', 'obj', 'bin', '.venv', 'venv', '__pycache__')
$queue = [System.Collections.Generic.Queue[object]]::new()
$queue.Enqueue([pscustomobject]@{path=$workspace;depth=0})
$visited = 0
$discovered = @()
$snapshotHints = @()
$skipped = @()
$unreadable = @()
$reparse = @()
$truncated = $false
$depthLimitReached = $false
while ($queue.Count -gt 0) {
    if ($visited -ge $MaxDirectories) { $truncated = $true; break }
    $entry = $queue.Dequeue()
    $visited++
    $folder = [string]$entry.path
    $depth = [int]$entry.depth
    $gitMarker = Join-Path $folder '.git'
    if (Test-Path -LiteralPath $gitMarker) {
        if ($discovered.Count -ge $MaxRepositories) { $truncated = $true; break }
        $discovered += $folder
    }
    if ($depth -ge $MaxDepth) { $depthLimitReached = $true; continue }
    try {
        $children = @(Get-ChildItem -LiteralPath $folder -Directory -Force -ErrorAction Stop)
    } catch {
        $unreadable += $folder
        continue
    }
    foreach ($child in $children) {
        if (($child.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            $reparse += $child.FullName
            continue
        }
        if ($blockedNames -contains $child.Name) {
            $skipped += [pscustomobject]@{path=$child.FullName;reason='GENERATED_OR_GIT_INTERNALS_NOT_TRAVERSED'}
            continue
        }
        if ($child.Name -match '(?i)(snapshot|cleanroom|review_bundle|archive|backup|evidence)') {
            $snapshotHints += $child.FullName
        }
        $queue.Enqueue([pscustomobject]@{path=$child.FullName;depth=$depth+1})
    }
}

$oldLocks = [Environment]::GetEnvironmentVariable('GIT_OPTIONAL_LOCKS', 'Process')
$repos = @()
try {
    [Environment]::SetEnvironmentVariable('GIT_OPTIONAL_LOCKS', '0', 'Process')
    foreach ($repoPath in $discovered) {
        $gitStatus = 'UNREADABLE_HOLD'
        $head = $null
        $branch = $null
        $trackedChanges = $null
        $untrackedNames = $null
        $ignoredNames = @()
        $alternatePaths = @()
        $toplevel = $null
        $headOutput = @(& git -C $repoPath -c gc.auto=0 -c core.fsmonitor=false rev-parse HEAD 2>$null)
        if ($LASTEXITCODE -eq 0 -and $headOutput.Count -eq 1) {
            $head = [string]$headOutput[0]
            $topOutput = @(& git -C $repoPath -c gc.auto=0 -c core.fsmonitor=false rev-parse --show-toplevel 2>$null)
            if ($LASTEXITCODE -eq 0 -and $topOutput.Count -eq 1) {
                $toplevel = [string]$topOutput[0]
                $resolvedTop = [System.IO.Path]::GetFullPath($toplevel.Replace('/', '\')).TrimEnd('\')
                if (![string]::Equals($resolvedTop, $repoPath.TrimEnd('\'),
                        [System.StringComparison]::OrdinalIgnoreCase)) {
                    $gitStatus = 'TOPLEVEL_MISMATCH_HOLD'
                } else {
                    $statusLines = @(& git -C $repoPath -c gc.auto=0 -c core.fsmonitor=false status --porcelain=v1 --untracked-files=normal 2>$null)
                    if ($LASTEXITCODE -eq 0) {
                        $trackedChanges = @($statusLines | Where-Object { $_ -notmatch '^\?\?' }).Count
                        $untrackedNames = @($statusLines | Where-Object { $_ -match '^\?\?' }).Count
                        $gitStatus = if (($trackedChanges + $untrackedNames) -eq 0) {
                            'CLEAN_SNAPSHOT_NOT_RETENTION_PROOF'
                        } else { 'DIRTY_OR_UNTRACKED_HOLD' }
                    }
                    $branchOutput = @(& git -C $repoPath -c gc.auto=0 -c core.fsmonitor=false branch --show-current 2>$null)
                    if ($LASTEXITCODE -eq 0 -and $branchOutput.Count -gt 0) { $branch = [string]$branchOutput[0] }
                    # With --directory, ignored build trees are listed as paths,
                    # not recursively expanded into hundreds of thousands of files.
                    $ignoredOutput = @(& git -C $repoPath -c gc.auto=0 -c core.fsmonitor=false ls-files --others --ignored --exclude-standard --directory 2>$null)
                    if ($LASTEXITCODE -eq 0) { $ignoredNames = @($ignoredOutput) }
                }
            }
        }
        $alternateFileOutput = @(& git -C $repoPath -c gc.auto=0 -c core.fsmonitor=false rev-parse --path-format=absolute --git-path objects/info/alternates 2>$null)
        if ($LASTEXITCODE -eq 0 -and $alternateFileOutput.Count -eq 1 -and
            (Test-Path -LiteralPath ([string]$alternateFileOutput[0]) -PathType Leaf)) {
            $alternatePaths = @(Get-Content -LiteralPath ([string]$alternateFileOutput[0]) -ErrorAction SilentlyContinue |
                Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
        }
        $repos += [pscustomobject]@{
            path = $repoPath
            git_toplevel = $toplevel
            git_status = $gitStatus
            git_head = $head
            branch = $branch
            tracked_changes = $trackedChanges
            untracked_entries = $untrackedNames
            ignored_entry_count = $ignoredNames.Count
            ignored_path_samples = @($ignoredNames | Select-Object -First 12)
            alternate_object_store_refs = $alternatePaths
            alternate_object_store_ref_count = $alternatePaths.Count
            independent_object_survival_proven = $false
            unpushed_commits_verified_elsewhere = $false
            deletion_authorized = $false
        }
    }
} finally {
    [Environment]::SetEnvironmentVariable('GIT_OPTIONAL_LOCKS', $oldLocks, 'Process')
}
$receiptFile = Join-Path $workspace 'evidence\workspace_owner_receipt.json'
$receiptHash = if (Test-Path -LiteralPath $receiptFile -PathType Leaf) {
    (Get-FileHash -LiteralPath $receiptFile -Algorithm SHA256).Hash
} else { $null }
$output = [ordered]@{
    schema = 'fear-ai-single-candidate-retention-discovery-v1'
    created_utc = (Get-Date).ToUniversalTime().ToString('o')
    workspace = $workspace
    read_only = $true
    deletion_authorized = $false
    owner_approval_verified = $false
    unique_commit_survival_verified = $false
    evidence_retention_verified = $false
    max_depth = $MaxDepth
    max_directories = $MaxDirectories
    directory_count_scanned = $visited
    depth_limit_reached = $depthLimitReached
    truncated_by_limits = $truncated
    unreadable_paths = $unreadable
    reparse_points_skipped = $reparse
    subtree_skips = $skipped
    snapshot_or_evidence_directory_hints = $snapshotHints
    repository_count_discovered = $repos.Count
    repositories = $repos
    owner_receipt_present = ($null -ne $receiptHash)
    owner_receipt_sha256 = $receiptHash
    note = 'Bounded discovery only. A non-Git snapshot may preserve unique evidence. Ignored contents, alternate dependencies, owners and unpublished history require separate checks; no deletion decision follows from this report.'
}
if ($Json) {
    $output | ConvertTo-Json -Depth 8
} else {
    "Read-only retention candidate: $workspace"
    "Visited=$visited discovered-Git=$($repos.Count) snapshot/evidence hints=$($snapshotHints.Count) skipped-trees=$($skipped.Count) truncated=$truncated"
    foreach ($r in $repos) {
        "Git: $($r.path) status=$($r.git_status) alternates=$($r.alternate_object_store_ref_count) ignored=$($r.ignored_entry_count)"
    }
    'Every source, archive and repository remains ineligible for deletion.'
}
