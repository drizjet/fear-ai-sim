$ErrorActionPreference = "Stop"
$CleanDir = "tests/clean_csharp_install"

if (Test-Path $CleanDir) {
    Remove-Item -Recurse -Force $CleanDir
}

New-Item -ItemType Directory -Force -Path "$CleanDir/FearAI.Client" | Out-Null
Expand-Archive -Path "packages/dist/fear-ai-csharp.zip" -DestinationPath "$CleanDir/FearAI.Client" -Force

# Create consumer app
New-Item -ItemType Directory -Force -Path "$CleanDir/ConsumerApp" | Out-Null

$AppCsproj = @"
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="..\FearAI.Client\FearAI.Client.csproj" />
  </ItemGroup>
</Project>
"@
$AppCsproj | Set-Content -Path "$CleanDir/ConsumerApp/ConsumerApp.csproj" -Encoding UTF8

$ProgramCs = @"
using FearAI.Client;

Console.WriteLine("[Clean C# Install] Testing packaged C# library...");
var client = new FearAIClient("http://127.0.0.1:8765");
Console.WriteLine("[PASS] Packaged FearAIClient instantiated cleanly!");

var traits = new PersonalityTraits { Fear = 0.5f, Neuroticism = 0.8f };
Console.WriteLine($"[PASS] Packaged PersonalityTraits instantiated: Fear={traits.Fear} Neuroticism={traits.Neuroticism}");

var threat = new PerceivedThreat { Id = "stalker", Type = "PREDATOR", Distance = 15f, Intensity = 0.8f };
Console.WriteLine($"[PASS] Packaged PerceivedThreat instantiated: Type={threat.Type} Distance={threat.Distance}");

Console.WriteLine("[Clean C# Install] All packaged C# library tests passed!");
return 0;
"@
$ProgramCs | Set-Content -Path "$CleanDir/ConsumerApp/Program.cs" -Encoding UTF8

Write-Host "[Test] Building consumer app against extracted C# package..."
dotnet build "$CleanDir/ConsumerApp/ConsumerApp.csproj"
if ($LASTEXITCODE -ne 0) {
    throw "dotnet build failed"
}

Write-Host "[Test] Running consumer app..."
dotnet run --project "$CleanDir/ConsumerApp/ConsumerApp.csproj"
$ExitCode = $LASTEXITCODE

# Clean up
Remove-Item -Recurse -Force $CleanDir
exit $ExitCode
