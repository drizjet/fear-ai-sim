# Opt-in, create-once receipt for a workspace you actually own.
# This declaration is NOT OS-authenticated ownership or permission to delete.
# Without -Write, prints the JSON preview and changes nothing.
param(
    [Parameter(Mandatory = $true)][string]$WorkspacePath,
    [Parameter(Mandatory = $true)][string]$OwnerLabel,
    [Parameter(Mandatory = $true)][string]$Purpose,
    [string]$OutputRoot = 'C:\tools\05-Output',
    [string]$RepoSubdirectory = 'repo',
    [string]$ExpectedHead,
    [string]$CheckpointManifestName,
    [switch]$Write
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (!(Test-Path -LiteralPath $OutputRoot -PathType Container)) { throw 'OutputRoot does not exist' }
if (!(Test-Path -LiteralPath $WorkspacePath -PathType Container)) { throw 'WorkspacePath does not exist' }
$root = (Resolve-Path -LiteralPath $OutputRoot).Path.TrimEnd('\')
$workspace = (Resolve-Path -LiteralPath $WorkspacePath).Path.TrimEnd('\')
$parent = [System.IO.Directory]::GetParent($workspace).FullName.TrimEnd('\')
if (![string]::Equals($parent, $root, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'WorkspacePath must be an existing direct child of OutputRoot'
}
if ($RepoSubdirectory -notmatch '^[a-zA-Z0-9 _.-]+$' -or $RepoSubdirectory -in @('.', '..')) {
    throw 'RepoSubdirectory must be a single existing folder name'
}
if ([string]::IsNullOrWhiteSpace($OwnerLabel) -or $OwnerLabel.Length -gt 96 -or $OwnerLabel -match '[\x00-\x1f]') {
    throw 'OwnerLabel must be a nonempty single-line label of at most 96 characters'
}
if ([string]::IsNullOrWhiteSpace($Purpose) -or $Purpose.Length -gt 300 -or $Purpose -match '[\x00-\x1f]') {
    throw 'Purpose must be a nonempty single-line description of at most 300 characters'
}
if ($null -ne $ExpectedHead -and $ExpectedHead -ne '' -and $ExpectedHead -notmatch '^[0-9a-fA-F]{40}$') {
    throw 'ExpectedHead must be the full 40-character Git commit ID'
}
if ($Write -and [string]::IsNullOrWhiteSpace($ExpectedHead)) {
    throw '-Write requires an explicit full ExpectedHead to prevent stale-worktree receipts'
}
foreach ($p in @($root, $workspace)) {
    if (((Get-Item -LiteralPath $p -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Refusing reparse-point directory: $p"
    }
}
$gitPath = Join-Path $workspace $RepoSubdirectory
if (!(Test-Path -LiteralPath $gitPath -PathType Container) -or
    !(Test-Path -LiteralPath (Join-Path $gitPath '.git'))) {
    throw 'Expected Git checkout is not present at RepoSubdirectory'
}
if (((Get-Item -LiteralPath $gitPath -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'Git checkout path cannot be a reparse point'
}
$oldLocks = [Environment]::GetEnvironmentVariable('GIT_OPTIONAL_LOCKS', 'Process')
try {
    [Environment]::SetEnvironmentVariable('GIT_OPTIONAL_LOCKS', '0', 'Process')
    $headLines = @(& git -C $gitPath -c gc.auto=0 rev-parse HEAD)
    if ($LASTEXITCODE -ne 0 -or $headLines.Count -ne 1) { throw 'Failed to read Git HEAD' }
    $head = [string]$headLines[0]
    $top = @(& git -C $gitPath -c gc.auto=0 rev-parse --show-toplevel)
    if ($LASTEXITCODE -ne 0 -or $top.Count -ne 1) { throw 'Failed to read Git root' }
    $topPath = [System.IO.Path]::GetFullPath(([string]$top[0]).Replace('/', '\')).TrimEnd('\')
    $gitPath = (Resolve-Path -LiteralPath $gitPath).Path.TrimEnd('\')
    if (![string]::Equals($topPath, $gitPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'Git toplevel does not match the explicit workspace checkout'
    }
    $branchLines = @(& git -C $gitPath -c gc.auto=0 branch --show-current)
    $branch = if ($LASTEXITCODE -eq 0 -and $branchLines.Count -gt 0) { [string]$branchLines[0] } else { '(detached)' }
} finally {
    [Environment]::SetEnvironmentVariable('GIT_OPTIONAL_LOCKS', $oldLocks, 'Process')
}
if ($ExpectedHead -and $head -cne $ExpectedHead.ToLowerInvariant()) { throw 'Git HEAD differs from ExpectedHead' }

$evidence = Join-Path $workspace 'evidence'
if (!(Test-Path -LiteralPath $evidence -PathType Container)) { throw 'Existing workspace evidence directory required' }
if (((Get-Item -LiteralPath $evidence -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'Evidence folder cannot be a reparse point'
}
$checkpointSha = $null
if ($CheckpointManifestName) {
    if ($CheckpointManifestName -notmatch '^[a-zA-Z0-9_.-]+\.json$' -or $CheckpointManifestName -in @('.', '..')) {
        throw 'CheckpointManifestName must be a single .json file name'
    }
    $checkpoint = Join-Path $evidence $CheckpointManifestName
    if (!(Test-Path -LiteralPath $checkpoint -PathType Leaf)) { throw 'Checkpoint manifest not present' }
    if (((Get-Item -LiteralPath $checkpoint -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Checkpoint manifest cannot be a reparse point'
    }
    $checkpointSha = (Get-FileHash -LiteralPath $checkpoint -Algorithm SHA256).Hash
}
$lockSha = $null
$lockfile = Join-Path $gitPath 'fear-ai-sim\package-lock.json'
if (Test-Path -LiteralPath $lockfile -PathType Leaf) {
    $lockSha = (Get-FileHash -LiteralPath $lockfile -Algorithm SHA256).Hash
}
$receiptPath = Join-Path $evidence 'workspace_owner_receipt.json'
$receipt = [ordered]@{
    schema = 'fear-ai-workspace-owner-receipt-v1'
    created_utc = (Get-Date).ToUniversalTime().ToString('o')
    workspace_path = $workspace
    git_path = $gitPath
    git_head_at_registration = $head
    git_branch_at_registration = $branch
    owner_label = $OwnerLabel.Trim()
    owner_authentication = 'SELF_DECLARED_NOT_VERIFIED'
    purpose = $Purpose.Trim()
    workspace_status = 'ACTIVE'
    checkpoint_manifest_name = $(if ($CheckpointManifestName) { $CheckpointManifestName } else { $null })
    checkpoint_manifest_sha256 = $checkpointSha
    package_lock_sha256 = $lockSha
    proposed_owned_rust_target = (Join-Path $evidence 'rust_target')
    evidence_path = $evidence
    deletion_authorized = $false
    retention_proven = $false
    note = 'Receipt is owner-supplied metadata only; current head, active jobs, unique commits and evidence retention require independent rechecks.'
}
$json = $receipt | ConvertTo-Json -Depth 5
if (!$Write) {
    'PREVIEW_ONLY: no files written'
    $json
    exit 0
}
# CreateNew is atomic, refuses overwrite and never mutates a shared registry.
# A partial write failure must be investigated; do not retry blindly.
$content = [System.Text.UTF8Encoding]::new($false).GetBytes($json + [Environment]::NewLine)
$stream = [System.IO.FileStream]::new($receiptPath,[System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
try {
    $stream.Write($content, 0, $content.Length)
    $stream.Flush($true)
} finally {
    $stream.Dispose()
}
$sha = (Get-FileHash -LiteralPath $receiptPath -Algorithm SHA256).Hash
"CREATED=$receiptPath"
"RECEIPT_SHA256=$sha"
"AUTHORITY=SELF_DECLARED_NOT_VERIFIED; DELETION_AUTHORIZED=false"
