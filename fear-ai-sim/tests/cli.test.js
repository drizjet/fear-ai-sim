import { describe, it, expect } from '@jest/globals';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliPath = path.resolve(__dirname, '../bin/fear-ai.js');

function runCli(args = []) {
    return new Promise((resolve, reject) => {
        execFile(process.execPath, [cliPath, ...args], { timeout: 15000 }, (error, stdout, stderr) => {
            resolve({
                code: error ? error.code : 0,
                stdout: stdout || '',
                stderr: stderr || '',
                error
            });
        });
    });
}

describe('Fear AI Unified CLI (bin/fear-ai.js)', () => {
    it('executes "help" and displays banner with available subcommands', async () => {
        const res = await runCli(['help']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('FEAR AI — UNIVERSAL INTELLIGENCE CLI');
        expect(res.stdout).toContain('server');
        expect(res.stdout).toContain('explain');
        expect(res.stdout).toContain('explain-faction');
        expect(res.stdout).toContain('sim');
        expect(res.stdout).toContain('benchmark');
        expect(res.stdout).toContain('dashboard');
        expect(res.stdout).toContain('verify');
    });

    it('executes "verify" pre-flight sanity checks successfully', async () => {
        const res = await runCli(['verify']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Check 1: Resting baseline maintains CALM band: PASS');
        expect(res.stdout).toContain('Check 2: Severe threat triggers Affective escalation: PASS');
        expect(res.stdout).toContain('Check 3: Diagnostic Explainability Inspector loaded: PASS');
        expect(res.stdout).toContain('Check 4: Reference Game integration harness loaded: PASS');
        expect(res.stdout).toContain('All pre-flight verification checks PASS');
    });

    it('executes "explain --json" and returns structured inspector payload', async () => {
        const res = await runCli([
            'explain',
            '--neuroticism', '0.75',
            '--resilience', '0.25',
            '--distance', '12',
            '--intensity', '0.9',
            '--panic-peers', '2',
            '--json'
        ]);
        expect(res.code).toBe(0);
        const parsed = JSON.parse(res.stdout.trim());
        expect(parsed.agent_id).toBe('agent_npc_designer');
        expect(parsed.threat_attribution).toBeDefined();
        expect(parsed.trait_impacts).toBeDefined();
        expect(parsed.rejected_alternatives).toBeDefined();
        expect(parsed.active_intent).toBeDefined();
    });

    it('executes "explain-faction --json" and outputs bilateral diagnostic stance', async () => {
        const res = await runCli([
            'explain-faction',
            '--factionA', 'kingdom_of_sol',
            '--factionB', 'iron_covenant',
            '--incidents', '4',
            '--json'
        ]);
        expect(res.code).toBe(0);
        const parsed = JSON.parse(res.stdout.trim());
        expect(parsed.faction_a).toBe('kingdom_of_sol');
        expect(parsed.faction_b).toBe('iron_covenant');
        expect(parsed.bilateral_metrics).toBeDefined();
        expect(parsed.current_stance).toBeDefined();
        expect(parsed.contributing_factors).toBeDefined();
    });

    it('executes "sim" running authoritative 2D Dungeon Crawler harness', async () => {
        const res = await runCli(['sim', '--turns', '20']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('=== Reference Game Integration Simulation: Dungeon Crawler 2D ===');
        expect(res.stdout).toContain('Simulation completed');
        expect(res.stdout).toContain('Average Frame / Turn Time:');
    });

    it('executes "benchmark" with custom entities and ticks', async () => {
        const res = await runCli(['benchmark', '--entities', '500', '--ticks', '10']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('=== MASSIVE-SCALE BENCHMARK RESULTS ===');
        expect(res.stdout).toContain('Throughput:');
        expect(res.stdout).toContain('Status:                 PASS');
    });

    it('executes "adversarial" running all 11 stress regimes from Section XXV', async () => {
        const res = await runCli(['adversarial']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Running 11 Adversarial Stress Regimes (Section XXV)');
        expect(res.stdout).toContain('ALL 11 STRESS REGIMES PASSED (100%)');
    });

    it('executes "counterfactual" running all 8 causal experiments from Section XL', async () => {
        const res = await runCli(['counterfactual']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Running 8 Causal Counterfactual Experiments (Section XL)');
        expect(res.stdout).toContain('ALL 8 COUNTERFACTUAL EXPERIMENTS PASSED (100%)');
    });

    it('executes "godot --headless --test" running the 7-station showcase conformance runner', async () => {
        const res = await runCli(['godot', '--headless', '--test']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('Launching Godot 4.6 showcase (Headless)');
        expect(res.stdout).toContain('GODOT 4.6 MULTI-STATION SHOWCASE CONFORMANCE: 7 / 7 PASSED (100%)');
    });

    it('executes "situation-strength" and outputs behavioral compression metrics', async () => {
        const res = await runCli(['situation-strength', '--ticks', '10']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('MISCHEL SITUATION STRENGTH & OPPORTUNITY-NORMALIZED PROFILING');
        expect(res.stdout).toContain('Cohort Behavioral Variance:');
        expect(res.stdout).toContain('Compression Ratio:');
        expect(res.stdout).toContain('Reversible Trait Restoration Protocol:');
    });

    it('executes "binary-wire" and outputs sub-millisecond serialization benchmarks', async () => {
        const res = await runCli(['binary-wire', '--entities', '200']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('PROTOCOL V2 ZERO-COPY BINARY WIRE BENCHMARK');
        expect(res.stdout).toContain('Encoding Latency:');
        expect(res.stdout).toContain('Zero-Copy Read:');
        expect(res.stdout).toContain('Throughput:');
    });

    it('executes "governance" and outputs collective deliberation results', async () => {
        const res = await runCli(['governance', '--severity', '0.7']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain('FACTION COLLECTIVE GOVERNANCE & DELIBERATION');
        expect(res.stdout).toContain('MILITARY_JUNTA');
        expect(res.stdout).toContain('MERCHANT_OLIGARCHY');
        expect(res.stdout).toContain('TRIBAL_CONSENSUS');
    });
});
