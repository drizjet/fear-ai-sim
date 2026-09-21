# tools/ci/fetch_godot.ps1 — give the CI probe job the engine the probes need.
#
# WHY THIS EXISTS. Three probes have halves that only run in the real engine
# (`verify_store_encryption.mjs`, `verify_host_token_persistence.mjs`,
# `verify_transport_signing.mjs`). Without a Godot binary they report SKIPPED —
# which is honest, but it means a CI job that claims to run the probe suite
# proves the Node halves and nothing in-engine. This fetches the SAME pinned
# version the recorded evidence was captured with, so the in-engine halves run in
# CI rather than being skipped there.
#
# The logic lives here rather than in the workflow on purpose: the workflow's
# `run:` commands are asserted against an allowlist
# (tools/guardian/hard-rule-9.mjs), and a multi-line YAML block would either
# bypass that check or need the check taught about block scalars. One command,
# one reviewable script.
#
# THE DOWNLOAD IS VERIFIED, AGAINST TWO INDEPENDENTLY PUBLISHED DIGESTS. CI
# installs a binary and then executes it, so "we fetched it over HTTPS from the
# right tag" is a weaker claim than it sounds: HTTPS authenticates the transport,
# not the bytes, and a re-uploaded or substituted release asset would arrive
# looking exactly as trustworthy. The pins below were read on 2026-09-20 from
#   - SHA-512: the release's own `SHA512-SUMS.txt`
#              https://github.com/godotengine/godot/releases/download/4.6-stable/SHA512-SUMS.txt
#   - SHA-256: the digest GitHub computes over the uploaded asset, served by the
#              release API for tag `4.6-stable`
# They are recorded together because they corroborate each other: two parties
# (the Godot release process and GitHub's storage layer) published a digest for
# the same bytes, and a download must satisfy both. The size is checked too,
# because it catches a truncated transfer before hashing 79 MB to find out.
#
# A mismatch is not "flaky network" and must not be retried away — it either
# means the release was re-uploaded under the same tag (which invalidates the
# recorded in-engine evidence, since that evidence names this version) or that
# something is wrong with the transfer path. The script deletes the file and
# fails loudly with both hashes printed so the difference is visible.
#
# Usage:
#   pwsh -File tools/ci/fetch_godot.ps1 [-Destination <dir>] [-ProjectDir <dir>]
#       [-Version <tag>] [-Url <mirror>] [-ExpectedSha256 <hex>] [-ExpectedSha512 <hex>]
# The -Url / -Expected* overrides exist for mirrors and for exercising the
# verification branch itself; CI calls this script with no arguments.

[CmdletBinding()]
param(
    [string]$Destination = $(if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }),
    [string]$ProjectDir = (Join-Path $PSScriptRoot '..\..\tests\godot_project'),
    [string]$Version = '4.6-stable',
    [string]$Url = '',
    [string]$ExpectedSha256 = '5c9177625c0dca18c92ba6328203c7b5a9596c85ef9d7c968396f0272d8f10d9',
    [string]$ExpectedSha512 = '3b2f0b4b3c490cb1a78db8fd2afc924412edab996b436c08e38957388976e9dfaf203cb50a8916036bc810f68da3dd6b9f16561e6549062ef225b4a97877081b',
    [long]$ExpectedSize = 79418197
)

$ErrorActionPreference = 'Stop'

$asset = "Godot_v$Version`_win64.exe.zip"
if (-not $Url) {
    $Url = "https://github.com/godotengine/godot/releases/download/$Version/$asset"
}
$godotDir = Join-Path $Destination "godot-$Version"
$consoleExe = Join-Path $godotDir "Godot_v$Version`_win64_console.exe"

# EMPIRICAL CONSTRAINT — found by running this script, 2026-09-20, not by reading
# docs. The engine must not sit under a directory whose path contains a space.
# `Godot_v4.6-stable_win64_console.exe` is a 198 KB wrapper that relaunches the real
# binary, and when one of its ANCESTOR directories has a space in the path that
# relaunch fails with `CreateProcess failed, error 193` ("not a valid Win32
# application") — a message that blames the binary, which is byte-perfect. Verified
# by copying the identical bytes (sha256 63913d01…) to several paths: a space in
# the engine's own leaf directory is survivable, a space in any ancestor is not.
# CI is unaffected — it checks out to `D:\a\fear-ai-sim\fear-ai-sim` — but this
# repository's own working copy lives under `...\lains Tools\...`, so a developer
# following the CI recipe locally would hit it. Hence the check is here, where the
# cause is still one line of output, instead of surfacing as an in-engine probe
# mysteriously failing or timing out three minutes later.
$resolvedDestination = [System.IO.Path]::GetFullPath($Destination)
if ($resolvedDestination -match ' ') {
    $advice = 'Pass -Destination <space-free dir>, e.g. the default ($env:RUNNER_TEMP / $env:TEMP).'
    throw "Destination path contains a space and cannot host the engine: '$resolvedDestination'. $advice"
}

Write-Host "Godot: $Version"
Write-Host "  from: $Url"
Write-Host "  into: $godotDir"

if (-not (Test-Path $consoleExe)) {
    New-Item -ItemType Directory -Force -Path $godotDir | Out-Null
    $zipPath = Join-Path $godotDir $asset
    Invoke-WebRequest -Uri $Url -OutFile $zipPath -UseBasicParsing

    $size = (Get-Item -Path $zipPath).Length
    $sha256 = (Get-FileHash -Path $zipPath -Algorithm SHA256).Hash.ToLower()
    $sha512 = (Get-FileHash -Path $zipPath -Algorithm SHA512).Hash.ToLower()
    Write-Host "  received: $size bytes"
    Write-Host "            sha256 $sha256"
    Write-Host "            sha512 $sha512"

    $problems = @()
    if ($ExpectedSize -gt 0 -and $size -ne $ExpectedSize) {
        $problems += "size        expected $ExpectedSize, received $size"
    }
    if ($ExpectedSha256 -and $sha256 -ne $ExpectedSha256.ToLower()) {
        $problems += "sha256      expected $ExpectedSha256, received $sha256"
    }
    if ($ExpectedSha512 -and $sha512 -ne $ExpectedSha512.ToLower()) {
        $problems += "sha512      expected $ExpectedSha512, received $sha512"
    }
    if ($problems.Count -gt 0) {
        Remove-Item -Path $zipPath -Force
        Write-Host "  del: removed the unverified download" -ForegroundColor Red
        $detail = $problems -join "`n  "
        $message = "Download verification FAILED for '$asset' at tag $Version."
        $message += " The bytes do not match the digests published for that tag, so this is"
        $message += " not the artifact the recorded in-engine evidence describes.`n  $detail"
        throw $message
    }
    Write-Host "  verified: size and both digests match the published values"

    Expand-Archive -Path $zipPath -DestinationPath $godotDir -Force
    Remove-Item $zipPath -Force
} else {
    Write-Host "  already present, skipping download"
    Write-Host "  (not re-verified: the digests above cover the archive, which was deleted after"
    Write-Host "   extraction — a cached extraction from a verified archive is trusted as-is)"
}

if (-not (Test-Path $consoleExe)) {
    throw "Godot console binary not found after extraction at $consoleExe"
}
Write-Host "  engine: $(& $consoleExe --version)"

# A cold checkout has no .godot/ import cache. Without one, the first in-engine
# probe can spend its run importing resources instead of executing the scenario,
# which reads as a timeout rather than as a missing cache.
Write-Host "  warming the import cache in $ProjectDir"
& $consoleExe --headless --path $ProjectDir --import | Out-Host
if ($LASTEXITCODE -ne 0) {
    throw "Godot import warm-up failed with exit code $LASTEXITCODE"
}

if ($env:GITHUB_ENV) {
    "FEAR_AI_GODOT=$consoleExe" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
    Write-Host "  exported FEAR_AI_GODOT for later steps"
} else {
    Write-Host "  FEAR_AI_GODOT would be set to: $consoleExe"
    Write-Host "  (not exported: GITHUB_ENV is absent, so this is a local run)"
}
