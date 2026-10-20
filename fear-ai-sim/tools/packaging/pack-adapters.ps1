param(
    [switch]$AllowDirty
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$GitRoot = (Resolve-Path (Join-Path $RepoRoot "..")).Path
$DistDir = Join-Path $RepoRoot "packages\dist"
$RootLicense = Join-Path $GitRoot "LICENSE"

if (-not (Test-Path -LiteralPath $RootLicense)) {
    throw "Repository LICENSE is missing at $RootLicense"
}

$ScopePath = Join-Path $PSScriptRoot "package-scope.json"
if (-not (Test-Path -LiteralPath $ScopePath)) {
    throw "Package scope file is missing at $ScopePath"
}
$Scope = Get-Content -LiteralPath $ScopePath -Raw | ConvertFrom-Json

New-Item -ItemType Directory -Force -Path $DistDir | Out-Null

$Adapters = @(
    [ordered]@{ Name = "unity";  Display = "Unity UPM adapter";                 License = "MIT" },
    [ordered]@{ Name = "godot";  Display = "Godot 4 plugin adapter";             License = "MIT" },
    [ordered]@{ Name = "unreal"; Display = "Unreal Engine 5 plugin adapter";     License = "MIT" },
    [ordered]@{ Name = "csharp"; Display = "C# / .NET SDK library";              License = "MIT" },
    [ordered]@{ Name = "python"; Display = "Python reference client";            License = "MIT" },
    [ordered]@{ Name = "rust";   Display = "Rust SDK adapter";                   License = "MIT OR Apache-2.0" }
)

$ExcludedArtifactPattern = '(^|/)(bin|obj|target|__pycache__|node_modules|dist|\.vs|\.idea|\.git)(/|$)'
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$SourceCommit = (git -C $GitRoot rev-parse HEAD).Trim()
$SourceCommitShort = (git -C $GitRoot rev-parse --short HEAD).Trim()
$SourceBranch = (git -C $GitRoot rev-parse --abbrev-ref HEAD).Trim()
$CommitDateText = (git -C $GitRoot show -s --format=%cI HEAD).Trim()
$CommitDate = [DateTimeOffset]::Parse($CommitDateText, [System.Globalization.CultureInfo]::InvariantCulture)
$PackagePrefix = (git -C $RepoRoot rev-parse --show-prefix).Trim()
$Dirty = ((git -C $GitRoot status --porcelain) -join "`n").Trim().Length -gt 0

if ($Dirty -and -not $AllowDirty) {
    throw "Working tree is dirty. Commit the release source first, or pass -AllowDirty for a local test build."
}

$Packages = @()

foreach ($Adapter in $Adapters) {
    $Name = $Adapter.Name
    $Source = "packages/adapters/$Name"
    $ZipName = "fear-ai-$Name.zip"
    $ZipPath = Join-Path $DistDir $ZipName
    $Staging = Join-Path ([System.IO.Path]::GetTempPath()) ("fear-ai-pack-" + $Name + "-" + [guid]::NewGuid().ToString("N"))

    Write-Host "[Pack] $($Adapter.Display) from tracked files only..."

    $Tracked = @(git -C $RepoRoot ls-files -- $Source)
    if ($Tracked.Count -eq 0) {
        throw "No tracked files found for $Source"
    }

    $AdapterScope = $Scope.adapters.PSObject.Properties[$Name]
    $Excluded = @()
    if ($AdapterScope) {
        $Excluded = @($AdapterScope.Value.exclude)
    }
    $ExcludedPaths = @($Excluded | ForEach-Object { $_.path })
    foreach ($ExcludedRelative in $ExcludedPaths) {
        if (-not ($Tracked -contains "$Source/$ExcludedRelative")) {
            throw "Package scope excludes a non-tracked file: $Source/$ExcludedRelative"
        }
    }

    New-Item -ItemType Directory -Force -Path $Staging | Out-Null

    foreach ($TrackedPath in $Tracked) {
        if (-not $TrackedPath.StartsWith($Source + "/", [System.StringComparison]::Ordinal)) {
            throw "Tracked path escaped the adapter root: $TrackedPath"
        }
        $Relative = $TrackedPath.Substring($Source.Length + 1)
        if ($Relative -match $ExcludedArtifactPattern) {
            throw "Tracked build artifact is not allowed in a release package: $TrackedPath"
        }
        if ($ExcludedPaths -contains $Relative) {
            continue
        }
        $From = Join-Path $RepoRoot $TrackedPath
        if (-not (Test-Path -LiteralPath $From)) {
            throw "Tracked file is missing from the working tree: $TrackedPath"
        }
        $To = Join-Path $Staging $Relative
        $ToDir = Split-Path -Parent $To
        New-Item -ItemType Directory -Force -Path $ToDir | Out-Null
        Copy-Item -LiteralPath $From -Destination $To -Force
    }

    Copy-Item -LiteralPath $RootLicense -Destination (Join-Path $Staging "LICENSE") -Force

    if ($Name -eq "rust") {
        $LicenseNote = @"
The Rust adapter's Cargo.toml declares `MIT OR Apache-2.0`.
This package includes the repository's MIT license text. You may use this
package under the MIT option; the upstream source remains dual-licensed.
"@
        Set-Content -LiteralPath (Join-Path $Staging "LICENSE-NOTE.txt") -Value $LicenseNote -Encoding utf8NoBOM
    }

    $Files = @()
    foreach ($File in (Get-ChildItem -LiteralPath $Staging -Recurse -File | Sort-Object FullName)) {
        $Rel = [System.IO.Path]::GetRelativePath($Staging, $File.FullName).Replace("\", "/")
        $Files += [ordered]@{
            path = $Rel
            bytes = [int64]$File.Length
            sha256 = (Get-FileHash -LiteralPath $File.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    }

    $Manifest = [ordered]@{
        schema = "fear-ai-adapter-package/v1"
        adapter = $Name
        displayName = $Adapter.Display
        sourceCommit = $SourceCommit
        sourceCommitShort = $SourceCommitShort
        sourceBranch = $SourceBranch
        sourceDirty = $Dirty
        sourceTree = $Source
        repositoryPath = "$PackagePrefix$Source"
        generatedAt = $CommitDate.ToString("o")
        licenseExpression = $Adapter.License
        licenseFile = "LICENSE"
        buildTool = "tools/packaging/pack-adapters.ps1"
        packageScope = "tools/packaging/package-scope.json"
        excludedSourceFiles = @($Excluded)
        fileCount = $Files.Count
        files = $Files
    }
    $ManifestJson = $Manifest | ConvertTo-Json -Depth 8
    [System.IO.File]::WriteAllText((Join-Path $Staging "PACKAGE_MANIFEST.json"), $ManifestJson + "`n", $Utf8NoBom)

    if (Test-Path -LiteralPath $ZipPath) {
        Remove-Item -LiteralPath $ZipPath -Force
    }

    $Archive = [System.IO.Compression.ZipFile]::Open($ZipPath, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        $Entries = @(Get-ChildItem -LiteralPath $Staging -Recurse -File | Sort-Object FullName)
        foreach ($File in $Entries) {
            $Rel = [System.IO.Path]::GetRelativePath($Staging, $File.FullName).Replace("\", "/")
            $Entry = $Archive.CreateEntry($Rel, [System.IO.Compression.CompressionLevel]::Optimal)
            $Entry.LastWriteTime = $CommitDate
            $Stream = $Entry.Open()
            try {
                $Bytes = [System.IO.File]::ReadAllBytes($File.FullName)
                $Stream.Write($Bytes, 0, $Bytes.Length)
            }
            finally {
                $Stream.Dispose()
            }
        }
    }
    finally {
        $Archive.Dispose()
    }

    $ZipHash = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $ZipBytes = (Get-Item -LiteralPath $ZipPath).Length
    $Packages += [ordered]@{
        adapter = $Name
        displayName = $Adapter.Display
        file = $ZipName
        bytes = [int64]$ZipBytes
        sha256 = $ZipHash
        fileCount = $Files.Count
        licenseExpression = $Adapter.License
        packageManifest = "PACKAGE_MANIFEST.json"
    }
    Write-Host ("  {0}  {1} bytes  {2} files" -f $ZipHash, $ZipBytes, $Files.Count)

    Remove-Item -LiteralPath $Staging -Recurse -Force
}

$ChecksumLines = $Packages | ForEach-Object { "$($_.sha256)  $($_.file)" }
$ChecksumPath = Join-Path $DistDir "CHECKSUMS.sha256"
[System.IO.File]::WriteAllText($ChecksumPath, (($ChecksumLines -join "`n") + "`n"), $Utf8NoBom)
$ChecksumHash = (Get-FileHash -LiteralPath $ChecksumPath -Algorithm SHA256).Hash.ToLowerInvariant()

$ReleaseManifest = [ordered]@{
    schema = "fear-ai-release-package/v1"
    sourceCommit = $SourceCommit
    sourceCommitShort = $SourceCommitShort
    sourceBranch = $SourceBranch
    sourceDirty = $Dirty
    generatedAt = $CommitDate.ToString("o")
    packageCount = $Packages.Count
    packages = $Packages
    checksumsFile = "CHECKSUMS.sha256"
    checksumsSha256 = $ChecksumHash
    buildTool = "tools/packaging/pack-adapters.ps1"
    scope = "Built from git-tracked files only; build outputs and local tool paths are excluded by construction."
}
$ReleaseManifestPath = Join-Path $DistDir "RELEASE_MANIFEST.json"
[System.IO.File]::WriteAllText($ReleaseManifestPath, (($ReleaseManifest | ConvertTo-Json -Depth 8) + "`n"), $Utf8NoBom)

Write-Host "[Pack] Wrote $ChecksumPath"
Write-Host "[Pack] Wrote $ReleaseManifestPath"
Write-Host "[Pack] Packed $($Packages.Count) adapters. Run 'npm run verify:adapters-package' to verify contents."
