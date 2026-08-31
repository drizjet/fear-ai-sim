# Custom Build Environment Setup for Fear-AI Native App (Rust/Tauri)
$ErrorActionPreference = "Continue" # Don't stop on non-critical cleanup errors

# Clear problematic build artifacts
$localTemp = Join-Path (Get-Location) ".tmp_build"
if (Test-Path $localTemp) { Remove-Item -Recurse -Force $localTemp }

# Define Detected Paths (64-bit)
$sdkLib = "C:\Program Files (x86)\Windows Kits\10\Lib\10.0.26100.0\um\x64"
$ucrtLib = "C:\Program Files (x86)\Windows Kits\10\Lib\10.0.26100.0\ucrt\x64"
$msvcLib = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\lib\x64"

# Set Environment Variables
$env:LIB = "$sdkLib;$ucrtLib;$msvcLib;" + $env:LIB
$env:RUST_BACKTRACE = "1"

# DO NOT redirect TMP/TEMP to local folder - this breaks kernel32.lib generation in Rust
Remove-Item -Path env:TMP -ErrorAction SilentlyContinue
Remove-Item -Path env:TEMP -ErrorAction SilentlyContinue

Write-Output "Native environment ironclad. Launching Fear-AI Omniverse..."
npx tauri dev
