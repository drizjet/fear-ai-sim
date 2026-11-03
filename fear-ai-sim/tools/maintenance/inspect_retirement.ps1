# Read-only retirement triage. No workspace is EVER declared deletion-safe.
# This is a snapshot of a multi-agent machine, not a substitute for owner approval.
param(
    [string]$OutputRoot = 'C:\tools\05-Output',
    [int]$MaxWorkspaces = 100,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($MaxWorkspaces -lt 1 -or $MaxWorkspaces -gt 1000) { throw 'MaxWorkspaces must be 1..1000' }
if (!(Test-Path -LiteralPath $OutputRoot -PathType Container)) { throw 'OutputRoot does not exist' }
$root = (Resolve-Path -LiteralPath $OutputRoot).Path
$folders = @(Get-ChildItem -LiteralPath $root -Directory -Force |
    Where-Object { $_.Name -match '^(?i:FEAR_|Fear_AI_)' } |
    Sort-Object LastWriteTime -Descending | Select-Object -First $MaxWorkspaces)

$processes = @()
$processScan = 'UNAVAILABLE'
try {
    $processes = @(Get-CimInstance Win32_Process -ErrorAction Stop |
        Where-Object { $_.CommandLine -and $_.Name -match 'cargo|rustc|node|godot|pwsh|powershell|git|dotnet' })
    $processScan = 'COMMAND_LINE_HINTS_ONLY'
} catch {
    # Absence of a visible matching process must never authorize cleanup.
    $processScan = 'UNAVAILABLE'
}

$oldOptionalLocks = [Environment]::GetEnvironmentVariable('GIT_OPTIONAL_LOCKS', 'Process')
$rows = @()
try {
    [Environment]::SetEnvironmentVariable('GIT_OPTIONAL_LOCKS', '0', 'Process')
    foreach ($folder in $folders) {
        $candidates = @(
            $folder.FullName,
            (Join-Path $folder.FullName 'repo'),
            (Join-Path $folder.FullName 'New Master Game'),
            (Join-Path $folder.FullName 'fear-ai-sim')
        )
        $gitPath = $null
        foreach ($candidate in $candidates) {
            if (Test-Path -LiteralPath (Join-Path $candidate '.git')) {
                $gitPath = $candidate
                break
            }
        }
        $head = $null
        $gitState = 'NO_REPO_AT_KNOWN_LAYOUT'
        $trackedChanges = $null
        $untracked = $null
        $worktrees = $null
        if ($null -ne $gitPath) {
            # Do not refresh foreign Git indexes or let Git acquire optional locks.
            $headLines = @(& git -C $gitPath -c gc.auto=0 rev-parse HEAD 2>$null)
            $headExit = $LASTEXITCODE
            if ($headExit -eq 0 -and $headLines.Count -gt 0) {
                $head = [string]$headLines[-1]
                $statusLines = @(& git -C $gitPath -c gc.auto=0 status --porcelain=v1 --untracked-files=normal 2>$null)
                if ($LASTEXITCODE -eq 0) {
                    $trackedChanges = @($statusLines | Where-Object { $_ -notmatch '^\?\?' }).Count
                    $untracked = @($statusLines | Where-Object { $_ -match '^\?\?' }).Count
                    $gitState = if ($trackedChanges + $untracked -eq 0) { 'CLEAN_SNAPSHOT_ONLY' } else { 'DIRTY_OR_UNTRACKED_HOLD' }
                } else {
                    $gitState = 'GIT_STATUS_UNREADABLE_HOLD'
                }
                $linked = @(& git -C $gitPath -c gc.auto=0 worktree list --porcelain 2>$null)
                if ($LASTEXITCODE -eq 0) {
                    $worktrees = @($linked | Where-Object { $_ -match '^worktree ' }).Count
                }
            } else {
                $gitState = 'GIT_HEAD_UNREADABLE_HOLD'
            }
        }
        $evidencePath = Join-Path $folder.FullName 'evidence'
        $evidenceFiles = if (Test-Path -LiteralPath $evidencePath -PathType Container) {
            @(Get-ChildItem -LiteralPath $evidencePath -File -Force -ErrorAction SilentlyContinue).Count
        } else { 0 }
        $evidenceManifests = if (Test-Path -LiteralPath $evidencePath -PathType Container) {
            @(Get-ChildItem -LiteralPath $evidencePath -File -Force -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -match 'manifest|checkpoint' }).Count
        } else { 0 }
        $hints = @()
        if ($processScan -eq 'COMMAND_LINE_HINTS_ONLY') {
            $hints = @($processes | Where-Object { $_.CommandLine.Contains($folder.FullName) } |
                ForEach-Object { [pscustomobject]@{name=$_.Name;pid=$_.ProcessId} })
        }
        $receiptPath = Join-Path $evidencePath 'workspace_owner_receipt.json'
        $receiptState = 'MISSING'
        $receiptOwnerClaim = $null
        $receiptRegisteredHead = $null
        $receiptSha256 = $null
        if (Test-Path -LiteralPath $receiptPath -PathType Leaf) {
            try {
                $receipt = Get-Content -LiteralPath $receiptPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
                $receiptSha256 = (Get-FileHash -LiteralPath $receiptPath -Algorithm SHA256 -ErrorAction Stop).Hash
                if ($receipt.schema -ne 'fear-ai-workspace-owner-receipt-v1' -or
                    $receipt.owner_authentication -ne 'SELF_DECLARED_NOT_VERIFIED' -or
                    $receipt.deletion_authorized -ne $false -or
                    $receipt.retention_proven -ne $false -or
                    $receipt.owner_label -isnot [string] -or
                    [string]::IsNullOrWhiteSpace($receipt.owner_label) -or
                    $receipt.git_head_at_registration -notmatch '^[0-9a-f]{40}$' -or
                    ![string]::Equals([string]$receipt.workspace_path, $folder.FullName,
                        [System.StringComparison]::OrdinalIgnoreCase) -or
                    $null -eq $gitPath -or
                    ![string]::Equals([string]$receipt.git_path, [string]$gitPath,
                        [System.StringComparison]::OrdinalIgnoreCase)) {
                    $receiptState = 'INVALID_OR_MISMATCHED_HOLD'
                } else {
                    $receiptOwnerClaim = [string]$receipt.owner_label
                    $receiptRegisteredHead = [string]$receipt.git_head_at_registration
                    $checkpointValid = $true
                    if ($null -ne $receipt.checkpoint_manifest_name) {
                        $name = [string]$receipt.checkpoint_manifest_name
                        if ($name -notmatch '^[a-zA-Z0-9_.-]+\.json$' -or
                            $receipt.checkpoint_manifest_sha256 -notmatch '^[A-F0-9]{64}$') {
                            $checkpointValid = $false
                        } else {
                            $checkpointPath = Join-Path $evidencePath $name
                            if (!(Test-Path -LiteralPath $checkpointPath -PathType Leaf) -or
                                ((Get-FileHash -LiteralPath $checkpointPath -Algorithm SHA256).Hash -cne
                                 [string]$receipt.checkpoint_manifest_sha256)) {
                                $checkpointValid = $false
                            }
                        }
                    }
                    $receiptState = if (!$checkpointValid) { 'CHECKPOINT_DIGEST_MISMATCH_HOLD' }
                        elseif ($receiptRegisteredHead -ne $head) { 'HEAD_CHANGED_SINCE_RECEIPT_HOLD' }
                        else { 'SELF_DECLARED_MATCHES_HEAD_UNVERIFIED' }
                }
            } catch {
                $receiptState = 'INVALID_OR_UNREADABLE_HOLD'
            }
        }
        $reasons = @('OWNER_NOT_VERIFIED', 'UNPUSHED_OR_UNREFERENCED_COMMITS_NOT_VERIFIED',
            'IGNORED_FILES_AND_OPEN_HANDLES_NOT_VERIFIED', 'EVIDENCE_NOT_RETAINED_OR_REHASHED')
        if ($receiptState -ne 'SELF_DECLARED_MATCHES_HEAD_UNVERIFIED') { $reasons += "OWNER_RECEIPT_$receiptState" }
        else { $reasons += 'RECEIPT_IS_SELF_DECLARED_NOT_OWNERSHIP_PROOF' }
        if ($gitState -ne 'CLEAN_SNAPSHOT_ONLY') { $reasons += $gitState }
        if ($null -ne $worktrees -and $worktrees -gt 1) { $reasons += 'MULTIPLE_LINKED_WORKTREES' }
        if ($hints.Count -gt 0) { $reasons += 'MATCHING_RUNNING_COMMAND_LINE_HINT' }
        $rows += [pscustomobject]@{
            name = $folder.Name
            path = $folder.FullName
            modified = $folder.LastWriteTime.ToString('o')
            git_path = $gitPath
            git_head = $head
            git_state = $gitState
            tracked_changes = $trackedChanges
            untracked_paths_reported = $untracked
            linked_worktree_count = $worktrees
            evidence_top_level_files = $evidenceFiles
            evidence_manifest_name_candidates = $evidenceManifests
            owner_receipt_state = $receiptState
            owner_receipt_self_declared_label = $receiptOwnerClaim
            owner_receipt_registered_head = $receiptRegisteredHead
            owner_receipt_sha256 = $receiptSha256
            running_command_line_hints = $hints
            unique_commit_verified_elsewhere = $false
            owner_approval_verified = $false
            eligible_for_deletion = $false
            hold_reasons = $reasons
        }
    }
} finally {
    [Environment]::SetEnvironmentVariable('GIT_OPTIONAL_LOCKS', $oldOptionalLocks, 'Process')
}

$out = [ordered]@{
    schema = 'fear-ai-retirement-triage-readonly-v1'
    generated_at = (Get-Date).ToString('o')
    output_root = $root
    inspected = $rows.Count
    process_scan = $processScan
    any_deletions_authorized = $false
    warning = 'All candidates require owner approval, proof of preserved unique commits/evidence, job and ignored-file review. A clean Git snapshot is insufficient.'
    candidates = $rows
}
if ($Json) {
    $out | ConvertTo-Json -Depth 7
} else {
    "Read-only retirement triage: $($rows.Count) Fear AI folders, 0 authorized for deletion"
    "Process inspection: $processScan (presence is a hint, absence proves nothing)"
    $rows | Select-Object -First 15 name,git_state,tracked_changes,untracked_paths_reported,evidence_manifest_name_candidates,eligible_for_deletion |
        Format-Table -AutoSize | Out-String -Width 220
    'No directory, Git metadata, cache, evidence, or process modified.'
}
