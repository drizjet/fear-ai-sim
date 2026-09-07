$ErrorActionPreference = "Stop"

$GODOT_BIN = "C:\tools\02-Dev\godot\Godot_v4.6-stable_win64_console.exe"
if (-not (Test-Path $GODOT_BIN)) {
    Write-Error "Godot binary not found at $GODOT_BIN"
    exit 1
}

Write-Host "[Godot Civilization Conformance] Launching Godot 4.6 headless runner..."

$godotProcess = Start-Process -FilePath $GODOT_BIN -ArgumentList "--headless", "--path", "tests/godot_project", "-s", "run_civilization_godot_conformance.gd" -NoNewWindow -Wait -PassThru
$godotExitCode = $godotProcess.ExitCode
Write-Host "[Godot Civilization Conformance] Godot runner finished with ExitCode: $godotExitCode"

if ($godotExitCode -ne 0) {
    Write-Error "[FAIL] Godot civilization conformance tests failed with exit code $godotExitCode"
    exit $godotExitCode
}

Write-Host "[PASS] Real Godot 4.6 Engine Civilization & Cognitive LOD Conformance verified successfully!"
exit 0
