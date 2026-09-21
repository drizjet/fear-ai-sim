#!/usr/bin/env node

/**
 * tools/verification/verify_unity_editor_tests.mjs
 *
 * Runs the Unity adapter's EditMode tests inside a REAL Unity Editor, in
 * batchmode, against a throwaway project that references this package.
 *
 * WHY A THROWAWAY PROJECT INSTEAD OF A CHECKED-IN ONE
 * A checked-in Unity project carries a `Library/`, a `ProjectSettings/` and a
 * generated `.csproj` set, none of which belong in this repository, and pinning
 * `ProjectVersion.txt` to one machine's Editor version makes the probe fail on any
 * machine with a different one. So the project is assembled at run time: a
 * manifest that takes `com.fearai.middleware` as a local `file:` dependency, a
 * `ProjectVersion.txt` written from the Editor that was actually found, and the
 * package added to `testables` so its test assemblies are compiled. The adapter
 * sources are used UNMODIFIED, straight from `packages/adapters/unity`.
 *
 * WHY IT IS ALLOWED TO SKIP, AND WHY THAT IS NOT A PASS
 * Unity is a multi-gigabyte install that most machines here do not have. A probe
 * that fails when the Editor is missing would be turned off within a week, and
 * one that silently reports success would be worse. So a missing Editor prints
 * SKIPPED, names what was and was not proven, and exits 0 - and the ledger keeps
 * the Unity row at `IMPLEMENTED_NOT_EDITOR_VERIFIED` until a run actually happens.
 * The exit code can be made strict with FEAR_AI_UNITY_REQUIRED=1, which is what a
 * machine that HAS the Editor should set in CI: there, a skip is a real failure.
 *
 * WHERE TO FIND THE EDITOR
 * `FEAR_AI_UNITY` (explicit), then the usual Hub install roots per platform.
 * `-version` is run to confirm the binary answers before it is trusted, so a stale
 * path produces a skip with a reason instead of a mysterious failure.
 *
 * Hard Rule 9: a standalone probe. It does not use the project's test runner
 * conventions (none exist) and it invokes the Editor's own NUnit runner rather
 * than reimplementing one.
 */

import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const PACKAGE_DIR = path.join(REPO, 'packages', 'adapters', 'unity');
const REQUIRED = process.env.FEAR_AI_UNITY_REQUIRED === '1';

function findUnity() {
    const explicit = process.env.FEAR_AI_UNITY;
    const candidates = [];
    if (explicit) candidates.push(explicit);

    const hubs = {
        win32: [
            'C:\\Program Files\\Unity\\Hub\\Editor',
            path.join(os.homedir(), 'AppData', 'Roaming', 'UnityHub', 'Editor')
        ],
        darwin: ['/Applications/Unity/Hub/Editor'],
        linux: [path.join(os.homedir(), 'Unity', 'Hub', 'Editor')]
    }[process.platform] || [];

    for (const root of hubs) {
        if (!fs.existsSync(root)) continue;
        let entries = [];
        try { entries = fs.readdirSync(root); } catch { continue; }
        // Newest version first, so a machine with several prefers the latest.
        entries
            .filter((name) => /^\d{4}\.\d+/.test(name))
            .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
            .forEach((version) => {
                candidates.push(path.join(root, version, 'Editor', 'Unity'));
                candidates.push(path.join(root, version, 'Editor', 'Unity.exe'));
                candidates.push(path.join(root, version, 'Unity.app', 'Contents', 'MacOS', 'Unity'));
            });
    }

    for (const candidate of candidates) {
        if (candidate && fs.existsSync(candidate)) return candidate;
    }
    return null;
}

function unityVersion(editor) {
    const probe = spawnSync(editor, ['-version'], { encoding: 'utf8', timeout: 120000 });
    const output = `${probe.stdout || ''}${probe.stderr || ''}`.trim();
    // `-version` prints e.g. "6000.0.23f1" or "2022.3.20f1".
    const match = output.match(/\d{4}\.\d+\.\d+[abfp]\d+/);
    return match ? match[0] : null;
}

/** A free port, so two probes on one machine cannot collide on the license pipe. */
async function portIsFree(port) {
    return new Promise((resolve) => {
        const probe = net.createServer();
        probe.unref();
        probe.once('error', () => resolve(false));
        probe.listen({ host: '127.0.0.1', port }, () => probe.close(() => resolve(true)));
    });
}

async function pickFreePort(start, end) {
    for (let p = start; p <= end; p++) {
        // eslint-disable-next-line no-await-in-loop
        if (await portIsFree(p)) return p;
    }
    return null;
}

/**
 * Assemble the throwaway project.
 *
 * `testables` is the part that is easy to miss: a package's test assemblies are
 * NOT compiled into a project unless the package name is listed there, and the
 * failure mode is silence - Unity runs zero tests and reports success, which is
 * exactly the kind of green result this repository keeps having to distrust.
 */
function writeProject(projectDir) {
    const manifestDir = path.join(projectDir, 'Packages');
    fs.mkdirSync(manifestDir, { recursive: true });
    const packagePath = PACKAGE_DIR.replace(/\\/g, '/');
    fs.writeFileSync(path.join(manifestDir, 'manifest.json'), JSON.stringify({
        dependencies: {
            'com.fearai.middleware': `file:${packagePath}`,
            'com.unity.test-framework': '1.4.5',
            'com.unity.ide.rider': '3.0.31',
            'com.unity.modules.jsonserialize': '1.0.0'
        },
        testables: ['com.fearai.middleware']
    }, null, 2));

    fs.mkdirSync(path.join(projectDir, 'ProjectSettings'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'Assets'), { recursive: true });
    return projectDir;
}

function parseTestResults(resultsPath) {
    if (!fs.existsSync(resultsPath)) return null;
    const xml = fs.readFileSync(resultsPath, 'utf8');
    const attr = (name) => {
        const match = xml.match(new RegExp(`${name}="([^"]*)"`));
        return match ? match[1] : null;
    };
    // The root element carries the totals; individual <test-case> elements carry
    // the per-test outcome.
    const cases = [...xml.matchAll(/<test-case\b[^>]*>/g)].map((m) => m[0]);
    return {
        total: Number(attr('total')) || 0,
        passed: Number(attr('passed')) || 0,
        failed: Number(attr('failed')) || 0,
        skipped: Number(attr('skipped')) || 0,
        inconclusive: Number(attr('inconclusive')) || 0,
        result: attr('result'),
        failures: cases
            .filter((tag) => /result="Failed"/.test(tag))
            .map((tag) => (tag.match(/name="([^"]*)"/) || [])[1] || 'unknown test')
    };
}

async function main() {
    console.log('============================================================');
    console.log('VERIFY UNITY ADAPTER EditMode TESTS IN A REAL UNITY EDITOR');
    console.log('============================================================\n');

    const editor = findUnity();
    if (!editor) {
        console.log('SKIPPED: no Unity Editor found on this machine.');
        console.log('');
        console.log('  WHAT THIS MEANS, stated rather than implied:');
        console.log('    * the EditMode tests in packages/adapters/unity/Tests/EditMode were NOT compiled or run;');
        console.log('    * the adapter\'s behaviour is still covered, without an engine, by');
        console.log('      `npm run verify:unity-behavior` (executed against a live FearServer through a');
        console.log('      UnityEngine shim) and `npm run verify:dotnet` (compiled against the shim);');
        console.log('    * the Unity row therefore stays IMPLEMENTED_NOT_EDITOR_VERIFIED in the ledger.');
        console.log('');
        console.log('  To run it: set FEAR_AI_UNITY to the Editor binary, or set');
        console.log('  FEAR_AI_UNITY_REQUIRED=1 to make this probe FAIL instead of skipping.');
        process.exit(REQUIRED ? 1 : 0);
    }

    console.log(`Editor binary: ${editor}`);
    const version = unityVersion(editor);
    if (!version) {
        console.log('SKIPPED: the Editor binary did not answer `-version`, so it is not usable here.');
        console.log('  (A stale path or a partial install is a skip, not a failure - but nothing was proven.)');
        process.exit(REQUIRED ? 1 : 0);
    }
    console.log(`Editor version: ${version}`);

    for (const required of [
        path.join(PACKAGE_DIR, 'Tests', 'EditMode', 'FearAI.EditModeTests.asmdef'),
        path.join(PACKAGE_DIR, 'Tests', 'EditMode', 'FearSignerEditModeTests.cs'),
        path.join(PACKAGE_DIR, 'Tests', 'EditMode', 'FearSessionStoreEditModeTests.cs'),
        path.join(PACKAGE_DIR, 'Tests', 'EditMode', 'FearAIClientEditModeTests.cs')
    ]) {
        if (!fs.existsSync(required)) {
            console.error(`FAIL: the test project is incomplete, missing ${path.relative(REPO, required)}`);
            process.exit(1);
        }
    }

    const projectDir = path.join(os.tmpdir(), `fear-ai-unity-editor-${process.pid}`);
    fs.rmSync(projectDir, { recursive: true, force: true });
    writeProject(projectDir);

    const resultsPath = path.join(projectDir, 'editmode-results.xml');
    const logPath = path.join(projectDir, 'editor.log');
    const licensePort = await pickFreePort(9700, 9799);

    const args = [
        '-batchmode',
        '-nographics',
        '-projectPath', projectDir,
        '-runTests',
        '-testPlatform', 'EditMode',
        '-testResults', resultsPath,
        '-logFile', logPath,
        '-quit'
    ];

    console.log(`Project: ${projectDir}`);
    console.log(`Results: ${resultsPath}\n`);
    console.log('Running the EditMode suite (this imports the package and compiles the adapter on first run)...\n');

    const run = spawnSync(editor, args, {
        encoding: 'utf8',
        timeout: 45 * 60 * 1000,
        env: { ...process.env, UNITY_LICENSE_PORT: String(licensePort) }
    });

    const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
    const results = parseTestResults(resultsPath);

    if (!results) {
        // No results file at all: the Editor never got as far as the test runner.
        // That is a failure of the harness, not of the adapter, and it is reported
        // as such instead of being folded into a pass.
        const tail = log.split('\n').filter((line) => /error|Error|Exception|licen/i.test(line)).slice(-12).join('\n');
        console.error('FAIL: the Editor produced no test results XML.');
        console.error(`  exit code: ${run.status}`);
        console.error(`  log tail:\n${tail || '(no matching log lines)'}`);
        console.error(`  full log: ${logPath}`);
        process.exit(1);
    }

    console.log(`EditMode results: ${results.result} — ${results.total} test(s)`);
    console.log(`  passed ${results.passed}, failed ${results.failed}, skipped ${results.skipped}, inconclusive ${results.inconclusive}`);

    if (results.failed > 0) {
        console.error('\nFAILED TESTS:');
        for (const name of results.failures) console.error(`  * ${name}`);
        console.error(`\nFull log: ${logPath}`);
        process.exit(1);
    }

    // A run that executes ZERO tests is the specific failure this guards against:
    // it happens when the package is not in `testables`, and it reports success.
    if (results.total === 0) {
        console.error('\nFAIL: the Editor ran but executed NO tests.');
        console.error('  A package\'s test assemblies are only compiled when the package name is listed');
        console.error('  in the project manifest\'s `testables`. Zero tests is not a pass.');
        process.exit(1);
    }

    const EXPECTED_FIXTURES = [
        'FearRequestSignerEditModeTests',
        'FearSessionStoreEditModeTests',
        'FearAIClientEditModeTests',
        'JsonHelperEditModeTests'
    ];
    const missing = EXPECTED_FIXTURES.filter((name) => !log.includes(name) && !fs.readFileSync(resultsPath, 'utf8').includes(name));
    if (missing.length > 0) {
        console.error(`FAIL: the results do not mention these fixtures, so they were not compiled: ${missing.join(', ')}`);
        process.exit(1);
    }

    console.log('\n============================================================');
    console.log(`SUCCESS: ${results.passed} EditMode test(s) passed inside Unity ${version}.`);
    console.log('Scope: the adapter\'s signing, credential stores and JSON surface as the');
    console.log('EDITOR runtime executes them. NOT a player build (a different scripting');
    console.log('profile), NOT frame scheduling, NOT MonoBehaviour lifecycle, and NOT');
    console.log('anything rendered.');
    console.log('============================================================');

    if (process.env.FEAR_AI_UNITY_KEEP_PROJECT !== '1') {
        fs.rmSync(projectDir, { recursive: true, force: true });
    } else {
        console.log(`Project kept at ${projectDir} (FEAR_AI_UNITY_KEEP_PROJECT=1).`);
    }
}

main().catch((error) => {
    console.error('\nVERIFICATION FAILURE:', error.message);
    process.exit(1);
});
