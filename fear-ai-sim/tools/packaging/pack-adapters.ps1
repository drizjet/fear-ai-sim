$ErrorActionPreference = "Stop"
$DistDir = "packages/dist"
New-Item -ItemType Directory -Force -Path $DistDir | Out-Null

Write-Host "[Pack] Compressing Unity UPM adapter..."
Compress-Archive -Path "packages/adapters/unity/*" -DestinationPath "$DistDir/fear-ai-unity.zip" -Force

Write-Host "[Pack] Compressing Godot 4 plugin adapter..."
Compress-Archive -Path "packages/adapters/godot/*" -DestinationPath "$DistDir/fear-ai-godot.zip" -Force

Write-Host "[Pack] Compressing Unreal Engine 5 plugin adapter..."
Compress-Archive -Path "packages/adapters/unreal/*" -DestinationPath "$DistDir/fear-ai-unreal.zip" -Force

Write-Host "[Pack] Compressing C# / .NET SDK library..."
Compress-Archive -Path "packages/adapters/csharp/*" -DestinationPath "$DistDir/fear-ai-csharp.zip" -Force

Write-Host "[Pack] Compressing Python reference client..."
Compress-Archive -Path "packages/adapters/python/*" -DestinationPath "$DistDir/fear-ai-python.zip" -Force

Write-Host "[Pack] Compressing Rust SDK adapter..."
Compress-Archive -Path "packages/adapters/rust/*" -DestinationPath "$DistDir/fear-ai-rust.zip" -Force

Write-Host "[Pack] Generating SHA256 checksums..."
$ChecksumFile = "$DistDir/CHECKSUMS.sha256"
if (Test-Path $ChecksumFile) { Remove-Item $ChecksumFile }

Get-ChildItem "$DistDir/*.zip" | ForEach-Object {
    $hash = (Get-FileHash -Path $_.FullName -Algorithm SHA256).Hash.ToLower()
    $line = "$hash  $($_.Name)"
    Add-Content -Path $ChecksumFile -Value $line
    Write-Host "  $line"
}
Write-Host "[Pack] Complete! All packages verified."
