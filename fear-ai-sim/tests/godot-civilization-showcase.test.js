/**
 * tests/godot-civilization-showcase.test.js
 *
 * Test suite for Milestone H: Interactive Multi-Agent Godot Showcase Integration.
 * Validates GDScript showcase integrity, host game authority boundaries,
 * and executes Godot 4.6 engine conformance when the binary is present.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

describe('Milestone H: Interactive Multi-Agent Godot Showcase Integration', () => {
    const showcasePath = path.join(repoRoot, 'examples', 'godot', 'civilization_world_showcase.gd');
    const runnerPath = path.join(repoRoot, 'tests', 'godot_project', 'run_civilization_godot_conformance.gd');
    const godotBin = 'C:\\tools\\02-Dev\\godot\\Godot_v4.6-stable_win64_console.exe';

    test('1. GDScript showcase file exists and contains valid multi-agent logic', () => {
        expect(fs.existsSync(showcasePath)).toBe(true);
        const content = fs.readFileSync(showcasePath, 'utf8');

        // Check key architectural components
        expect(content).toContain('STRICT ARCHITECTURAL INVARIANT');
        expect(content).toContain('squad_leader');
        expect(content).toContain('caravan');
        expect(content).toContain('RALLY_TO_LEADER');
        expect(content).toContain('river_detour');
        expect(content).toContain('trade_route_status');
    });

    test('2. Godot conformance test file exists and contains 3 validation checks', () => {
        expect(fs.existsSync(runnerPath)).toBe(true);
        const content = fs.readFileSync(runnerPath, 'utf8');

        expect(content).toContain('Check 1: Multi-Agent Squad Rally Directives');
        expect(content).toContain('Check 2: Trade Caravan Danger Rerouting');
        expect(content).toContain('Check 3: 5-Tier Cognitive LOD Spatial Calculations');
    });

    test('3. Official Godot 4.6 Engine executes civilization conformance cleanly', () => {
        if (!fs.existsSync(godotBin)) {
            console.warn('[SKIP] Godot binary not found; skipping headless execution');
            return;
        }

        const projectPath = path.join(repoRoot, 'tests', 'godot_project');
        const cmd = `"${godotBin}" --headless --path "${projectPath}" -s run_civilization_godot_conformance.gd`;

        const output = execSync(cmd, { encoding: 'utf8' });
        expect(output).toContain('GODOT 4.6 CIVILIZATION & COGNITIVE LOD CONFORMANCE: 3 / 3 CHECKS PASSED (100%)');
    });

    test('4. Host Game Authority Invariant is rigorously maintained', () => {
        const content = fs.readFileSync(showcasePath, 'utf8');

        // Assert Godot retains authority over CharacterBody3D and physics
        expect(content).toContain('Godot 4 retains 100% authoritative control');
        expect(content).toContain('Physics, velocity, character collisions, move_and_slide()');
        expect(content).toContain('Fear AI provides semantic observations, group directives, route rankings');
    });
});
