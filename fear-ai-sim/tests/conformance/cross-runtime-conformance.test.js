import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FearServer } from '../../packages/runtime/index.js';
import { ProtocolValidator, OPTIONAL_MODULES, MESSAGE_TYPES } from '../../packages/protocol/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

describe('Milestone K: Cross-Runtime Multi-Language SDK Conformance & Protocol Extensibility', () => {
    let server;
    const testPort = 8795;

    beforeAll(async () => {
        server = new FearServer({ port: testPort, host: '127.0.0.1', seed: 1337 });
        await server.start();
    });

    afterAll(async () => {
        if (server) {
            await server.stop();
        }
    });

    it('1. Protocol Forward Compatibility: Unknown optional fields are tolerated defensively', () => {
        const payloadWithFutureFields = {
            type: MESSAGE_TYPES.OBSERVATION_DISPATCH,
            agent_id: 'scout_1',
            threats: [{ id: 'boss', type: 'PREDATOR', distance: 10.0, intensity: 0.8 }],
            // Forward-compatibility future fields from later version
            future_subsystem_tensor: [1, 0, 0, 1],
            quantum_random_entropy: 0.9912,
            meta_designer_tag: 'test_future_v2'
        };

        const result = ProtocolValidator.validateIncomingMessage(payloadWithFutureFields);
        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
        expect(result.value.agent_id).toBe('scout_1');
    });

    it('2. Protocol Module Extensibility: Optional modules enum is defined and verifiable', () => {
        expect(OPTIONAL_MODULES).toBeDefined();
        expect(OPTIONAL_MODULES.AFFECT).toBe('affect');
        expect(OPTIONAL_MODULES.MEMORY).toBe('memory');
        expect(OPTIONAL_MODULES.RELATIONSHIPS).toBe('relationships');
        expect(OPTIONAL_MODULES.GROUPS).toBe('groups');
        expect(OPTIONAL_MODULES.FACTIONS).toBe('factions');
        expect(OPTIONAL_MODULES.CIVILIZATION_LOD).toBe('civilization_lod');
        expect(OPTIONAL_MODULES.WORLD_SIMULATION).toBe('world_simulation');
    });

    it('3. Python 3.14 SDK Client Conformance against FearServer', async () => {
        const pythonScript = path.resolve(rootDir, 'tests/conformance/run_python_conformance.py');
        expect(fs.existsSync(pythonScript)).toBe(true);

        const output = await new Promise((resolve, reject) => {
            const proc = spawn('python', [pythonScript, '--url', `http://127.0.0.1:${testPort}`], {
                cwd: rootDir
            });
            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', (d) => { stdout += d; });
            proc.stderr.on('data', (d) => { stderr += d; });
            proc.on('close', (code) => {
                if (code === 0) resolve(stdout);
                else reject(new Error(`Python conformance failed (code ${code}):\n${stderr}\n${stdout}`));
            });
        });

        expect(output).toContain('[PASS] Health check: status=ok');
        expect(output).toContain('[PASS] Handshake accepted: status=ACCEPTED');
        expect(output).toContain('PYTHON CONFORMANCE SUMMARY: 4/4 FIXTURE TESTS PASSED');
    }, 25000);

    it('4. C# / .NET 8 SDK Client Package Conformance', () => {
        const psScript = path.resolve(rootDir, 'tools/test_clean_csharp_install.ps1');
        expect(fs.existsSync(psScript)).toBe(true);

        const result = execSync(`pwsh -File "${psScript}"`, {
            cwd: rootDir,
            encoding: 'utf-8'
        });

        expect(result).toContain('[PASS] Packaged FearAIClient instantiated cleanly!');
        expect(result).toContain('[PASS] Packaged PersonalityTraits instantiated');
        expect(result).toContain('[PASS] Packaged PerceivedThreat instantiated');
        expect(result).toContain('[Clean C# Install] All packaged C# library tests passed!');
    }, 25000);

    it('5. Godot 4.6 Engine GDScript Conformance', () => {
        const godotScript = path.resolve(rootDir, 'tools/test_godot_civilization_conformance.ps1');
        expect(fs.existsSync(godotScript)).toBe(true);

        const result = execSync(`pwsh -File "${godotScript}"`, {
            cwd: rootDir,
            encoding: 'utf-8'
        });

        expect(result).toContain('3 / 3 CHECKS PASSED (100%)');
        expect(result).toContain('Real Godot 4.6 Engine Civilization & Cognitive LOD Conformance verified successfully!');
    }, 15000);
});

