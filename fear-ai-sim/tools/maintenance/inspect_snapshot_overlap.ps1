# Read-only, bounded SHA-256 comparison of historical copied source vs a
# separate reference tree. Matching bytes NEVER authorize archive deletion.
param(
    [Parameter(Mandatory=$true)][string]$SnapshotRoot,
    [Parameter(Mandatory=$true)][string]$ReferenceRoot,
    [int]$MaxHashPairs = 40,
    [int]$MaxHashInputMB = 500,
    [int]$MaxExceptionPaths = 500,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($MaxHashPairs -lt 1 -or $MaxHashPairs -gt 1000 -or
    $MaxHashInputMB -lt 1 -or $MaxHashInputMB -gt 4096 -or
    $MaxExceptionPaths -lt 1 -or $MaxExceptionPaths -gt 5000) {
    throw 'MaxHashPairs must be 1..1000, MaxHashInputMB 1..4096, MaxExceptionPaths 1..5000'
}
if (!(Test-Path -LiteralPath $SnapshotRoot -PathType Container) -or
    !(Test-Path -LiteralPath $ReferenceRoot -PathType Container)) {
    throw 'Both source trees must already exist'
}
$source = (Resolve-Path -LiteralPath $SnapshotRoot).Path.TrimEnd('\')
$reference = (Resolve-Path -LiteralPath $ReferenceRoot).Path.TrimEnd('\')
if ([string]::Equals($source,$reference,[System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Source and reference trees must be different'
}
foreach ($path in @($source,$reference)) {
    if (((Get-Item -LiteralPath $path -Force).Attributes -band
            [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Refusing symlink/junction root $path"
    }
}

# Get-ChildItem without -FollowSymlink never descends directory symlinks.
# The result is a logical-file inventory, not a physical allocated-size audit.
$rawFiles = @(Get-ChildItem -LiteralPath $source -Recurse -File -Force -ErrorAction Stop)
$fileSymlinks = @($rawFiles | Where-Object {
    ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
})
$files = @($rawFiles | Where-Object {
    ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0
})
$directorySymlinks = @(Get-ChildItem -LiteralPath $source -Directory -Recurse -Force -ErrorAction Stop |
    Where-Object { ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 })

$countMatchingSize = 0
$countReferenceMissing = 0
$countDifferentSize = 0
$countReferenceReparse = 0
$bytesMatchingSize = [long]0
$bytesMissing = [long]0
$bytesDifferentSize = [long]0
$eligible = @()
$exceptionRows = @()
foreach ($file in $files) {
    $rel = $file.FullName.Substring($source.Length + 1)
    $refPath = Join-Path $reference $rel
    if (!(Test-Path -LiteralPath $refPath -PathType Leaf)) {
        $countReferenceMissing++
        $bytesMissing += $file.Length
        if ($exceptionRows.Count -lt $MaxExceptionPaths) {
            $exceptionRows += [pscustomobject]@{
                status = 'NO_REFERENCE_FILE'
                relative_path = $rel
                snapshot_bytes = [long]$file.Length
                reference_bytes = $null
            }
        }
        continue
    }
    $refFile = Get-Item -LiteralPath $refPath -Force -ErrorAction Stop
    if (($refFile.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        $countReferenceReparse++
        continue
    }
    if ($refFile.Length -ne $file.Length) {
        $countDifferentSize++
        $bytesDifferentSize += $file.Length
        if ($exceptionRows.Count -lt $MaxExceptionPaths) {
            $exceptionRows += [pscustomobject]@{
                status = 'REFERENCE_DIFFERENT_SIZE'
                relative_path = $rel
                snapshot_bytes = [long]$file.Length
                reference_bytes = [long]$refFile.Length
            }
        }
        continue
    }
    $countMatchingSize++
    $bytesMatchingSize += $file.Length
    $eligible += [pscustomobject]@{
        relative_path = $rel
        bytes = [long]$file.Length
        source_path = $file.FullName
        reference_path = $refFile.FullName
    }
}
$exceptionCount = $countReferenceMissing + $countDifferentSize
$limit = [long]$MaxHashInputMB * 1MB
$inputUsed = [long]0
$sameCount = 0
$differentCount = 0
$bytesVerifiedIdentical = [long]0
$samples = @()
foreach ($pair in @($eligible | Sort-Object -Property @{Expression='bytes';Descending=$true}, @{Expression='relative_path';Descending=$false})) {
    if ($samples.Count -ge $MaxHashPairs -or ($inputUsed + 2*$pair.bytes) -gt $limit) { continue }
    $a = (Get-FileHash -LiteralPath $pair.source_path -Algorithm SHA256 -ErrorAction Stop).Hash
    $b = (Get-FileHash -LiteralPath $pair.reference_path -Algorithm SHA256 -ErrorAction Stop).Hash
    $inputUsed += 2*$pair.bytes
    $same = ($a -ceq $b)
    if ($same) { $sameCount++;$bytesVerifiedIdentical += $pair.bytes }
    else { $differentCount++ }
    $samples += [pscustomobject]@{
        relative_path = $pair.relative_path
        bytes = $pair.bytes
        equal_content_sha256 = $same
        source_sha256 = $a
        reference_sha256 = $b
    }
}
$inventoryBytes = [long](($files|Measure-Object Length -Sum).Sum)
$output = [ordered]@{
    schema = 'fear-ai-snapshot-overlap-readonly-v1'
    inspected_at_utc = (Get-Date).ToUniversalTime().ToString('o')
    snapshot_root = $source
    reference_root = $reference
    source_files_count = $files.Count
    source_logical_bytes = $inventoryBytes
    source_reparse_file_count_excluded = $fileSymlinks.Count
    source_reparse_directory_count_excluded = $directorySymlinks.Count
    reference_same_size_file_count = $countMatchingSize
    reference_same_size_logical_bytes = $bytesMatchingSize
    missing_reference_file_count = $countReferenceMissing
    missing_reference_logical_bytes = $bytesMissing
    different_reference_size_file_count = $countDifferentSize
    different_reference_size_logical_bytes = $bytesDifferentSize
    exception_count = $exceptionCount
    exception_paths_reported = $exceptionRows.Count
    exception_paths_truncated = ($exceptionCount -gt $exceptionRows.Count)
    exception_paths = @($exceptionRows | Sort-Object -Property @{Expression='snapshot_bytes';Descending=$true}, @{Expression='relative_path';Descending=$false})
    reference_reparse_file_count_excluded = $countReferenceReparse
    sha256_pair_sample_count = $samples.Count
    sha256_identical_pair_count = $sameCount
    sha256_different_pair_count = $differentCount
    sha256_identical_sample_logical_bytes = $bytesVerifiedIdentical
    sha256_total_input_bytes = $inputUsed
    sha256_unchecked_same_size_file_count = ($countMatchingSize - $samples.Count)
    sha256_sample = $samples
    complete_hash_comparison = ($countMatchingSize -eq $samples.Count)
    reference_is_mutable = $true
    historical_snapshot_preservation_proven = $false
    evidence_retention_proven = $false
    owner_approval_verified = $false
    deletion_authorized = $false
    note = 'Same size is not the same file; matching SHA-256 at this instant is not immutable preservation evidence. No archive or source removal is authorized.'
}
if ($Json) { $output | ConvertTo-Json -Depth 7 }
else {
    "Read-only snapshot comparison: $source"
    "Files=$($files.Count) logical MB=$([math]::Round($inventoryBytes/1MB,1)); same-size refs=$countMatchingSize; missing refs=$countReferenceMissing; size differences=$countDifferentSize"
    "SHA-256 samples=$($samples.Count) identical=$sameCount different=$differentCount; confirmed identical sample MB=$([math]::Round($bytesVerifiedIdentical/1MB,1))"
    'No files copied or deleted. Even exact matches do not establish archival/ownership approval.'
}
