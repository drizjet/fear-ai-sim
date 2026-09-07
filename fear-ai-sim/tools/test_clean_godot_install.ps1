$ErrorActionPreference = "Stop"
$CleanDir = "tests/clean_godot_install"

if (Test-Path $CleanDir) {
    Remove-Item -Recurse -Force $CleanDir
}

New-Item -ItemType Directory -Force -Path "$CleanDir/addons/fear_ai" | Out-Null
Expand-Archive -Path "packages/dist/fear-ai-godot.zip" -DestinationPath "$CleanDir/addons/fear_ai" -Force

$ProjectGodot = @"
config_version=5

[application]
config/name="CleanGodotInstallTest"
run/main_scene="res://main.tscn"

[autoload]
FearAIClient="*res://addons/fear_ai/fear_ai_client.gd"
"@
$ProjectGodot | Set-Content -Path "$CleanDir/project.godot" -Encoding UTF8

$MainTscn = @"
[gd_scene load_steps=2 format=3]

[ext_resource type="Script" path="res://main.gd" id="1_main"]

[node name="Main" type="Node"]
script = ExtResource("1_main")
"@
$MainTscn | Set-Content -Path "$CleanDir/main.tscn" -Encoding UTF8

$MainGd = @"
extends Node

func _ready():
	print("[Clean Godot Install] Starting packaged addon verification...")
	if not FearAIClient:
		print("[FAIL] FearAIClient autoload missing!")
		get_tree().quit(1)
		return
	print("[PASS] Packaged FearAIClient autoload loaded successfully from zip!")
	
	var script_agent = load("res://addons/fear_ai/fear_agent.gd")
	if not script_agent:
		print("[FAIL] fear_agent.gd could not be loaded!")
		get_tree().quit(1)
		return
	var agent = Node.new()
	agent.set_script(script_agent)
	add_child(agent)
	print("[PASS] Packaged fear_agent.gd attached to node cleanly!")
	print("[Clean Godot Install] All packaged addon tests passed!")
	get_tree().quit(0)
"@
$MainGd | Set-Content -Path "$CleanDir/main.gd" -Encoding UTF8

Write-Host "[Test] Executing real Godot 4 engine against clean project from zip archive..."
$GodotBin = "C:\tools\02-Dev\godot\Godot_v4.6-stable_win64_console.exe"
& $GodotBin --headless --path $CleanDir

$ExitCode = $LASTEXITCODE
Write-Host "[Test] Godot execution exit code: $ExitCode"

# Clean up
Remove-Item -Recurse -Force $CleanDir
exit $ExitCode
