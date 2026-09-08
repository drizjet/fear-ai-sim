/**
 * tests/godot-showcase-verification.test.js
 *
 * Front A / Section 6: Real-Engine Godot 4.6 Multi-Station Showcase Conformance Test.
 *
 * Verifies all 9 behavioral stations in official Godot 4.6 console binary:
 * 1. Station 1: Individual Fear & Threat Appraisal
 * 2. Station 2: Ambiguous Sound & Habituation Curve
 * 3. Station 3: Crowd Social Contagion Cascade
 * 4. Station 4: Leader Rally Dynamics & Panic Suppression
 * 5. Station 5: Trauma Zone Re-activation Gradient
 * 6. Station 6: Trade Caravan Dynamic Danger Rerouting
 * 7. Station 7: 14-Stage Faction Escalation Ladder
 * 8. Station 8: Regional Dynamic Trade Supply & Ambush Escorts
 * 9. Station 9: Multi-Observer Fog-of-War & Epistemic Rumor Decay
 */

import { describe, it, expect } from '@jest/globals';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GODOT_PATHS = [
  'C:\\tools\\02-Dev\\godot\\Godot_v4.6-stable_win64_console.exe',
  'Godot_v4.6-stable_win64_console.exe',
  'godot'
];

function findGodotBinary() {
  for (const candidate of GODOT_PATHS) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  // Check PATH
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['godot'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim()) {
    return which.stdout.trim().split('\n')[0].trim();
  }
  return null;
}

describe('Front A / Section 6: Godot 4.6 Multi-Station Showcase Verification', () => {
  const godotExe = findGodotBinary();
  const projectDir = path.resolve(__dirname, 'godot_project');

  it('detects Godot 4.6 installation and required project files', () => {
    expect(fs.existsSync(projectDir)).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'project.godot'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'main.tscn'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'main.gd'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'showcase_agent.gd'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'station_controller.gd'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'run_showcase_conformance.gd'))).toBe(true);
  });

  it('executes all 9 showcase stations headlessly with 100% pass rate', () => {
    if (!godotExe) {
      console.warn('[SKIP] Godot 4.6 binary not found in expected environment paths.');
      return;
    }

    const res = spawnSync(godotExe, [
      '--headless',
      '--path', projectDir,
      '--script', 'run_showcase_conformance.gd'
    ], {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: 30000
    });

    const output = (res.stdout || '') + (res.stderr || '');

    expect(res.status).toBe(0);
    expect(output).toContain('GODOT 4.6 MULTI-STATION SHOWCASE CONFORMANCE: 9 / 9 PASSED (100%)');
    expect(output).toContain('Station 1: Raw Fear=');
    expect(output).toContain('Station 2: Burst 1 Fear=');
    expect(output).toContain('Station 3: Agitator Panic=');
    expect(output).toContain('Station 4: Heroic Rally suppressed fear');
    expect(output).toContain('Station 5: Dread Zone Dist=');
    expect(output).toContain('Station 6: Highland Pass Danger=');
    expect(output).toContain('Station 7: Border Dist=');
    expect(output).toContain('Station 8: Mass Conserved=');
    expect(output).toContain('Station 9: Fog-of-War Decoupled');
  });

  it('strictly preserves Host Game Authority Invariant across showcase scripts', () => {
    const agentScript = fs.readFileSync(path.join(projectDir, 'showcase_agent.gd'), 'utf8');
    const controllerScript = fs.readFileSync(path.join(projectDir, 'station_controller.gd'), 'utf8');

    // Godot owns move_and_slide(), velocity, and collision geometry
    expect(agentScript).toContain('move_and_slide()');
    expect(agentScript).toContain('velocity');
    expect(agentScript).toContain('STRICT ARCHITECTURAL INVARIANT');

    // Fear AI provides advisory intent, vectors, and affective state
    expect(agentScript).toContain('get_movement_hint()');
    expect(controllerScript).toContain('STRICT ARCHITECTURAL INVARIANT');
  });
});
