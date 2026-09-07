$ErrorActionPreference = "Stop"

$GODOT_BIN = "C:\tools\02-Dev\godot\Godot_v4.6-stable_win64_console.exe"
if (-not (Test-Path $GODOT_BIN)) {
    Write-Error "Godot binary not found at $GODOT_BIN"
    exit 1
}

Write-Host "[Godot Conformance] Starting FearServer background daemon on port 8765..."
$serverJob = Start-Process -FilePath "node" -ArgumentList "packages/runtime/bin/fear-ai-server.js --port 8765" -PassThru

# Wait for server ready
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 100
    try {
        $res = Invoke-RestMethod -Uri "http://127.0.0.1:8765/health" -Method Get -TimeoutSec 1
        if ($res.status -eq "ok") {
            $ready = $true
            break
        }
    } catch {
        # Keep waiting
    }
}

if (-not $ready) {
    Write-Error "FearServer failed to become ready on 127.0.0.1:8765"
    if ($serverJob -and -not $serverJob.HasExited) {
        Stop-Process -Id $serverJob.Id -Force
    }
    exit 1
}

Write-Host "[Godot Conformance] FearServer ready. Launching official Godot 4.6 headless binary..."

try {
    $godotProcess = Start-Process -FilePath $GODOT_BIN -ArgumentList "--headless", "--path", "tests/godot_project", "-s", "run_canonical_conformance.gd" -NoNewWindow -Wait -PassThru
    $godotExitCode = $godotProcess.ExitCode
    Write-Host "[Godot Conformance] Godot runner finished with ExitCode: $godotExitCode"
} finally {
    Write-Host "[Godot Conformance] Stopping background FearServer daemon..."
    if ($serverJob -and -not $serverJob.HasExited) {
        Stop-Process -Id $serverJob.Id -Force
    }
}

if ($godotExitCode -ne 0) {
    Write-Error "[FAIL] Godot canonical conformance tests failed with exit code $godotExitCode"
    exit $godotExitCode
}

Write-Host "[PASS] Real Godot 4.6 Engine Canonical Conformance verified successfully!"
exit 0
