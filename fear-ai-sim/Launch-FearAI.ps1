# Launch-FearAI.ps1

$ErrorActionPreference = "Stop"
# Resolve the project directory relative to this script so it works on any machine.
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

Set-Location $ProjectDir

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "      Fear AI Simulation - Native Software  " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/4] Cleaning up old instances..." -ForegroundColor Yellow
# Stop any running electron processes related to this app
$electronProcesses = Get-Process electron -ErrorAction SilentlyContinue
foreach ($process in $electronProcesses) {
    if ($process.Path -match "fear-ai-sim") {
        Write-Host "Stopping old software instance (PID: $($process.Id))..." -ForegroundColor Gray
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "`n[2/4] Checking dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing missing dependencies. This might take a minute..." -ForegroundColor Gray
    cmd /c "npm install"
} else {
    Write-Host "Dependencies found." -ForegroundColor DarkGray
}

Write-Host "`n[3/4] Compiling software core..." -ForegroundColor Yellow
Write-Host "Building optimized production files..." -ForegroundColor Gray
cmd /c "npm run build"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error compiling the application. Please check the logs." -ForegroundColor Red
    Pause
    exit 1
}

Write-Host "`n[4/4] Launching Fear AI Desktop Software..." -ForegroundColor Green
Write-Host "----------------------------------------------------------------------" -ForegroundColor Gray

# Launch electron directly
cmd /c "npm run start-app"
