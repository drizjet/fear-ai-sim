# Fear AI workspace storage preflight. Read-only; never deletes or mutates a repo.
# Run with -Json for a machine-readable report, -DeepMeasure for slower size
# estimates, or -FailOnRisk to block a new heavy build when limits are exceeded.
param(
    [string]$OutputRoot = 'C:\tools\05-Output',
    [double]$WarnBelowFreeGB = 100,
    [int]$WarnAboveWorkspaceCount = 12,
    [int]$OlderThanDays = 7,
    [switch]$DeepMeasure,
    [switch]$Json,
    [switch]$FailOnRisk
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (!(Test-Path -LiteralPath $OutputRoot -PathType Container)) {
    throw "Workspace root does not exist: $OutputRoot"
}
$root = (Resolve-Path -LiteralPath $OutputRoot).Path
$driveName = [System.IO.Path]::GetPathRoot($root)
$drive = [System.IO.DriveInfo]::new($driveName)
$freeGB = [math]::Round($drive.AvailableFreeSpace / 1GB, 2)
$totalGB = [math]::Round($drive.TotalSize / 1GB, 2)
$cutoff = (Get-Date).AddDays(-$OlderThanDays)

# Entries are named conventions only. Names and timestamps NEVER prove ownership,
# idleness, absence of ignored changes, or that a checkout can be discarded.
$folders = @(Get-ChildItem -LiteralPath $root -Directory -Force |
    Where-Object { $_.Name -match '^(?i:FEAR_|Fear_AI_)' } |
    Sort-Object LastWriteTime -Descending)
$rows = @()
foreach ($folder in $folders) {
    $repoCandidates = @(
        (Join-Path $folder.FullName 'repo'),
        (Join-Path $folder.FullName 'New Master Game'),
        (Join-Path $folder.FullName 'fear-ai-sim')
    )
    $gitRepoVisible = $false
    foreach ($candidate in $repoCandidates) {
        if (Test-Path -LiteralPath (Join-Path $candidate '.git')) {
            $gitRepoVisible = $true
            break
        }
    }
    $nodeModules = Test-Path -LiteralPath (Join-Path $folder.FullName 'repo\fear-ai-sim\node_modules')
    $rustTarget = Test-Path -LiteralPath (Join-Path $folder.FullName 'evidence\rust_target')
    $receiptPresent = Test-Path -LiteralPath (Join-Path $folder.FullName 'evidence\workspace_owner_receipt.json') -PathType Leaf
    $approxMB = $null
    if ($DeepMeasure) {
        # This is a metadata estimate; inaccessible files may be omitted. Do not
        # follow directory symlinks or use the result as a deletion authority.
        $fileLengths = Get-ChildItem -LiteralPath $folder.FullName -File -Force -Recurse -ErrorAction SilentlyContinue |
            Measure-Object -Property Length -Sum
        $approxMB = [math]::Round([double]$fileLengths.Sum / 1MB, 1)
    }
    $rows += [pscustomobject]@{
        name = $folder.Name
        last_write = $folder.LastWriteTime.ToString('o')
        older_than_cutoff = ($folder.LastWriteTime -lt $cutoff)
        repo_detected = $gitRepoVisible
        node_modules_detected = $nodeModules
        rust_target_detected = $rustTarget
        owner_receipt_present = $receiptPresent
        approximate_mb = $approxMB
        deletion_authorized = $false
        owner_and_git_state = 'NOT_CHECKED'
    }
}
$oldCount = @($rows | Where-Object { $_.older_than_cutoff }).Count
$risks = @()
if ($freeGB -lt $WarnBelowFreeGB) {
    $risks += "LOW_FREE_SPACE: ${freeGB}GB below ${WarnBelowFreeGB}GB"
}
if ($rows.Count -gt $WarnAboveWorkspaceCount) {
    $risks += "WORKSPACE_COUNT: $($rows.Count) above $WarnAboveWorkspaceCount"
}
$report = [ordered]@{
    schema = 'fear-ai-storage-inspection-v1'
    generated_at = (Get-Date).ToString('o')
    output_root = $root
    drive_total_gb = $totalGB
    drive_free_gb = $freeGB
    workspace_count = $rows.Count
    workspaces_older_than_days = $oldCount
    age_days_threshold = $OlderThanDays
    deep_measure = [bool]$DeepMeasure
    risks = $risks
    automatic_deletion_enabled = $false
    warning = 'READ ONLY. No folder name, timestamp, git-clean state, or size proves workspace ownership or disposal safety.'
    workspaces = $rows
}
if ($Json) {
    $report | ConvertTo-Json -Depth 7
} else {
    Write-Output 'Fear AI storage inspection (read-only)'
    Write-Output "Drive: $driveName | $freeGB GB free / $totalGB GB total"
    Write-Output "Fear AI workspace folders: $($rows.Count) | older than $OlderThanDays days: $oldCount"
    if ($risks.Count -gt 0) {
        foreach ($risk in $risks) { Write-Output "RISK: $risk" }
    } else {
        Write-Output 'Thresholds: no storage risk triggered by these simple limits'
    }
    $rows | Select-Object -First 12 name,older_than_cutoff,node_modules_detected,rust_target_detected,approximate_mb |
        Format-Table -AutoSize | Out-String -Width 210 | Write-Output
    Write-Output 'No deletion performed. No ownership, clean Git state, active jobs, or checkpoint safety assessed.'
}
if ($FailOnRisk -and $risks.Count -gt 0) { exit 2 }
