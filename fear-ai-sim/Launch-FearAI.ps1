# Launch-FearAI.ps1
# Starts the Fear AI research desktop sim (Tauri). This is NOT the middleware
# server; for that use Launch-FearAI-Server.ps1 in the repository root.
#
#   .\Launch-FearAI.ps1            build once if needed, then launch
#   .\Launch-FearAI.ps1 -Rebuild   force a fresh frontend + native build
param([switch]$Rebuild)

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ProjectDir

$Exe = Join-Path $ProjectDir "src-tauri\target\release\fear-ai-omniverse.exe"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "      Fear AI Simulation - Desktop (Tauri)  " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

Write-Host "`n[1/3] Closing old instances of this app..." -ForegroundColor Yellow
Get-Process fear-ai-omniverse -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq $Exe } |
    ForEach-Object {
        Write-Host "Stopping PID $($_.Id)" -ForegroundColor Gray
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }

Write-Host "`n[2/3] Checking dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies (npm ci)..." -ForegroundColor Gray
    cmd /c "npm ci"
    if ($LASTEXITCODE -ne 0) { Write-Host "npm ci failed." -ForegroundColor Red; exit 1 }
}

if ($Rebuild -or -not (Test-Path $Exe)) {
    Write-Host "`n[3/3] Building the desktop app (first run takes a few minutes)..." -ForegroundColor Yellow
    # --no-bundle: compile the exe only; installers (MSI/NSIS) are not needed to run it.
    cmd /c "npm run tauri:build -- --no-bundle"
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $Exe)) {
        Write-Host "Desktop build failed. See the output above." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "`n[3/3] Using existing build (pass -Rebuild after code changes)." -ForegroundColor DarkGray
}

Write-Host "`nLaunching Fear AI..." -ForegroundColor Green
Start-Process -FilePath $Exe -WorkingDirectory (Split-Path $Exe)
