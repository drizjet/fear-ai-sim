#!/usr/bin/env node

/**
 * tools/run-godot-inengine-evidence.mjs
 *
 * LIVE IN-ENGINE Godot evidence capture.
 *
 * Runs the Godot conformance scripts inside the real Godot 4.6 binary and
 * records each script's TRUE exit code. This is deliberately a Node runner and
 * not a shell script: the whole flow is "pick a free port, spawn a FearServer,
 * wait for a real handshake, spawn Godot with that port in its environment,
 * tear the server down", and every one of those steps is ragged to express
 * reliably in a shell across platforms.
 *
 * Why a free port at all: `run_canonical_conformance.gd` defaults to
 * 127.0.0.1:8765, a conventional loopback port that on a real workstation is
 * frequently already held by an unrelated local service. That collision used to
 * surface as an unexplained `Handshake rejected: {"error": "unauthorised"}` —
 * a port-contention symptom, not a Fear AI defect. The runner honours
 * FEAR_AI_PORT, and this script always sets it to a port it has verified free.
 *
 * Requires an external Godot binary; it is skipped with a clear message when one
 * is absent (reported as SKIPPED, not PASSED, so the record can never claim
 * in-engine coverage that did not happen).
 *
 * Hard Rule 9 note: this is manual-audit evidence capture, NOT an automated test
 * runner. It is not wired into `npm test`.
 */

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, '..');

const GODOT_PROJECT = path.join(REPO, 'tests', 'godot_project');
const SERVER_SCRIPT = path.join(REPO, 'packages', 'runtime', 'bin', 'fear-ai-server.js');

// Godot binary discovery: explicit override, then the documented local install,
// then PATH.
const GODOT_CANDIDATES = [
    process.env.FEAR_AI_GODOT,
    'C:\\tools\\02-Dev\\godot\\Godot_v4.6-stable_win64_console.exe',
    'C:\\tools\\02-Dev\\godot\\Godot_v4.6-stable_win64.exe',
];

const SUITES = [
    { script: 'run_showcase_conformance.gd', needsServer: false, label: 'Multi-station showcase (offline fallback)' },
    { script: 'run_civilization_godot_conformance.gd', needsServer: false, label: 'Civilization & cognitive LOD' },
    { script: 'run_canonical_conformance.gd', needsServer: true, label: 'Canonical scenarios (live FearServer)' },
    { script: 'run_showcase_live_conformance.gd', needsServer: true, label: 'Showcase on a LIVE FearServer session' },
];

function findGodot() {
    for (const candidate of GODOT_CANDIDATES) {
        if (candidate && fs.existsSync(candidate)) return candidate;
    }
    const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['godot'], { encoding: 'utf8' });
    if (which.status === 0) {
        const first = which.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0];
        if (first && fs.existsSync(first)) return first;
    }
    return null;
}

async function portIsFree(port) {
    return new Promise((resolve) => {
        const probe = net.createServer();
        probe.unref();
        probe.once('error', () => resolve(false));
        probe.listen({ host: '127.0.0.1', port }, () => {
            probe.close(() => resolve(true));
        });
    });
}

async function pickFreePort(start = 8791, end = 8820) {
    for (let p = start; p <= end; p++) {
        // eslint-disable-next-line no-await-in-loop
        if (await portIsFree(p)) return p;
    }
    return null;
}

async function handshakeAccepted(port, timeoutMs = 2500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/v1/handshake`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_name: 'inengine-evidence-runner',
                protocol_version: '1.0.0',
                engine: 'evidence-probe',
            }),
            signal: controller.signal,
        });
        const body = await res.json().catch(() => ({}));
        return res.ok && body.status === 'ACCEPTED';
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

function summarise(output) {
    const lines = output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const conformance = lines.filter((l) => /CONFORMANCE.*(PASSED|FAILED)/.test(l)).pop();
    if (conformance) return conformance;
    const summary = lines.filter((l) => /SUMMARY/.test(l)).pop();
    if (summary) return summary;
    const failure = lines.filter((l) => /\[FAIL\]/.test(l)).pop();
    return failure || '(no summary line)';
}

function runSuite(godotExe, suite, port) {
    const env = { ...process.env };
    if (suite.needsServer) env.FEAR_AI_PORT = String(port);
    else delete env.FEAR_AI_PORT;

    const res = spawnSync(godotExe, ['--path', '.', '--headless', '--script', suite.script], {
        cwd: GODOT_PROJECT,
        env,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        timeout: 300_000,
    });

    const output = `${res.stdout || ''}${res.stderr || ''}`;
    const logPath = path.join(os.tmpdir(), `godot_${suite.script.replace(/\.gd$/, '')}.log`);
    fs.writeFileSync(logPath, output);

    return {
        ...suite,
        exit: res.status === null ? 1 : res.status,
        summary: summarise(output),
        logPath,
    };
}

async function main() {
    console.log('================================================================================');
    console.log('        FEAR AI: LIVE IN-ENGINE GODOT 4.6 CONFORMANCE EVIDENCE RUN              ');
    console.log('================================================================================');

    const godotExe = findGodot();
    if (!godotExe) {
        console.log('SKIPPED: no Godot binary found.');
        console.log('Set FEAR_AI_GODOT to the executable, or install Godot 4.6 at');
        console.log('C:\\tools\\02-Dev\\godot\\Godot_v4.6-stable_win64_console.exe.');
        console.log('The in-engine claim is NOT supported by this run — no evidence was captured.');
        process.exit(0);
    }
    console.log(`Godot binary:  ${godotExe}`);
    console.log(`Project:       ${GODOT_PROJECT}`);

    const port = await pickFreePort();
    if (!port) {
        console.error('FAIL: no free port found in 8791-8820 for the evidence FearServer.');
        process.exit(1);
    }
    const alreadyFree = await portIsFree(port);
    if (!alreadyFree) {
        console.error(`FAIL: port ${port} was re-acquired between checks.`);
        process.exit(1);
    }
    console.log(`FearServer:    127.0.0.1:${port} (verified free before spawn)`);

    const serverLog = path.join(os.tmpdir(), 'fear_ai_evidence_server.log');
    const serverLogFd = fs.openSync(serverLog, 'w');
    const server = spawn(process.execPath, [SERVER_SCRIPT, '--port', String(port), '--host', '127.0.0.1'], {
        cwd: REPO,
        stdio: ['ignore', serverLogFd, serverLogFd],
    });

    let serverUp = false;
    for (let attempt = 0; attempt < 80; attempt++) {
        if (server.exitCode !== null) break;
        // eslint-disable-next-line no-await-in-loop
        if (await handshakeAccepted(port)) { serverUp = true; break; }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 250));
    }

    if (!serverUp) {
        console.error(`FAIL: FearServer never accepted a handshake on 127.0.0.1:${port}.`);
        console.error(`Server log: ${serverLog}`);
        try { console.error(fs.readFileSync(serverLog, 'utf8').split(/\r?\n/).slice(-15).join('\n')); } catch { /* ignore */ }
        if (server.exitCode === null) server.kill('SIGKILL');
        process.exit(1);
    }
    console.log(`[OK] FearServer handshaking on 127.0.0.1:${port}`);

    const results = [];
    try {
        for (const suite of SUITES) {
            console.log(`\n--- ${suite.label} (${suite.script}) ---`);
            const result = runSuite(godotExe, suite, port);
            results.push(result);
            console.log(`    exit=${result.exit}  ${result.summary}`);
            console.log(`    log:  ${result.logPath}`);
        }
    } finally {
        if (server.exitCode === null) {
            server.kill('SIGKILL');
            console.log(`\n[OK] FearServer on port ${port} stopped.`);
        }
        fs.closeSync(serverLogFd);
    }

    console.log('\n================================================================================');
    const failed = results.filter((r) => r.exit !== 0);
    console.log(`LIVE IN-ENGINE GODOT EVIDENCE: ${results.length - failed.length} / ${results.length} suites exit 0`);
    for (const r of results) {
        console.log(`  ${r.exit === 0 ? 'PASS' : 'FAIL'}  ${r.script}  ${r.summary}`);
    }
    console.log('================================================================================\n');

    process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('EVIDENCE RUN FAILURE:', err && err.stack ? err.stack : err);
    process.exit(1);
});
