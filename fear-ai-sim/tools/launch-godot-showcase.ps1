# launch-godot-showcase.ps1
# Launches Fear AI Godot 4.6 Multi-Station Interactive Showcase

param(
    [switch]$Headless = $false,
    [switch]$Test = $false,
    [string]$ExtraArgs = ""
)

$ErrorActionPreference = "Stop"

$defaultGodotPath = "C:\tools\02-Dev\godot\Godot_v4.6-stable_win64_console.exe"
$godotExe = $null

if (Test-Path $defaultGodotPath) {
    $godotExe = $defaultGodotPath
} else {
    $found = Get-Command "godot" -ErrorAction SilentlyContinue
    if ($found) {
        $godotExe = $found.Source
    }
}

if (-not $godotExe) {
    Write-Error "Godot 4.6 executable not found at $defaultGodotPath or in PATH."
    exit 1
}

$projectDir = Resolve-Path "$PSScriptRoot\..\tests\godot_project"

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "       FEAR AI: GODOT 4.6 LIVING-WORLD & NPC INTELLIGENCE SHOWCASE             " -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "Godot Binary: $godotExe" -ForegroundColor Gray
Write-Host "Project Directory: $projectDir" -ForegroundColor Gray

$argList = @("--path", "$projectDir")

if ($Headless) {
    $argList += "--headless"
} else {
    $argList += @("-w", "--resolution", "1280x720")
}

if ($Test) {
    $argList += @("--script", "run_showcase_conformance.gd")
}

if ($ExtraArgs) {
    $argList += $ExtraArgs.Split(" ")
}

Write-Host "Executing: $godotExe $($argList -join ' ')" -ForegroundColor Green
& $godotExe @argList
$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
    Write-Host "`n[SUCCESS] Godot showcase execution completed successfully (Exit Code 0)." -ForegroundColor Green
} else {
    Write-Host "`n[FAIL] Godot showcase exited with code $exitCode." -ForegroundColor Red
}

exit $exitCode
