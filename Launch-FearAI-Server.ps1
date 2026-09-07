# Fear AI Universal Middleware Server Launcher
$Host.UI.RawUI.WindowTitle = "Fear AI Universal Middleware Server"
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "       Fear AI Universal Engine-Agnostic Middleware         " -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Cyan

$simDir = Join-Path $PSScriptRoot "fear-ai-sim"
Set-Location $simDir

node packages/runtime/bin/fear-ai-server.js --port 8765 --seed 1337
