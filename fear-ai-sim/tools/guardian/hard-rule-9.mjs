#!/usr/bin/env node
/**
 * tools/guardian/hard-rule-9.mjs — the test-retirement tombstone, and its gate.
 *
 * Hard Rule 9 (owner mandate 2026-09-14, executed 2026-09-15): every automated
 * test suite in this repository was permanently retired — 465 suites, 67,524
 * lines deleted at tag `v-test-retirement-complete`. Verification is 100%
 * manual: standalone deterministic probes under `tools/verification/` plus
 * in-engine evidence captures, read line by line.
 *
 * Two modes, deliberately in one file so they cannot drift apart:
 *
 *   node tools/guardian/hard-rule-9.mjs            npm test — REFUSES (exit 9)
 *   node tools/guardian/hard-rule-9.mjs --verify   CI advisory gate (0 ok / 1 drift)
 *
 * Why the refusal exists: `npm test` used to print a compliance banner and
 * exit 0. That made a retired suite look runnable and green — a human and a CI
 * step could both mistake its output for a passing run, which is the one thing
 * a tombstone must never look like. The gate mode then asserts the retirement
 * is still intact, so the reverse failure (a runner quietly reappearing, or CI
 * quietly growing a step that can never pass) is red on a meaningful signal.
 *
 * Not a test runner: nothing here collects or executes suites. It reads the
 * repository's own declaration surface and hashes nothing.
 *
 * It also asserts something no other check here can see: that the files the gate
 * chain needs exist **in the commit**, not only in the working tree. Every check
 * below reads from disk, so all of them can pass on a checkout whose entire
 * toolchain is uncommitted — `npm test` and `npm run verify:probes` resolve
 * locally because the bytes are there, while a fresh clone of the same commit
 * fails at its first step. That is how this check was found.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..'); // fear-ai-sim/
const gitRoot = resolve(repoRoot, '..'); // repository root (where .github lives)

const TOMBSTONE_EXIT_CODE = 9;
const TOMBSTONE_SCRIPT = 'node tools/guardian/hard-rule-9.mjs';
const GATE_SCRIPT = 'node tools/guardian/hard-rule-9.mjs --verify';

// The only commands CI may run. Asserted against an allowlist rather than
// trusted, because the previous workflow kept a Jest matrix and a Codecov
// upload long after the runner and the `test:coverage` script were deleted —
// steps that could never pass, which is how a red CI stops meaning anything.
const CI_RUN_ALLOWLIST = [
    'npm ci',
    'npm run verify:hard-rule-9',
    'npm run guardian:check',
    'pwsh -File tools/ci/fetch_godot.ps1',
    // The Python signing backend the cross-language probe needs. Pinned, because
    // the probe's evidence is a signature this wheel produced.
    'python -m pip install --no-input cryptography==50.0.1',
    'npm run verify:probes -- --json probe_suite_report.json',
    // The nightly determinism job. It repeats every probe, so a probe that agrees
    // with itself is the only thing that counts as a pass there.
    'npm run verify:probe-stability -- --json probe_stability_report.json',
    // The nightly job's second half: the fresh run against the committed
    // recording, plus the ledger entry that makes rare intermittency visible.
    'npm run verify:stability-regression -- --append-history evidence/probe_stability_ledger.jsonl --json probe_stability_comparison.json',
    // The nightly job's third half: tonight's night is proposed as a reviewed pull
    // request, because a record that only grows when a human remembers to download an
    // artifact bounds nothing.
    'pwsh -File tools/ci/open_ledger_night_pr.ps1 -Execute',
    // The Unity Editor gate. It is inert until a runner is provisioned for it —
    // see UNITY_GATE_INERT_MARKER below for why that is asserted rather than
    // trusted.
    'npm run verify:unity-editor'
];

// The Unity job must never run unconditionally. No GitHub-hosted runner has a
// Unity Editor or a license, so a job that ran everywhere would be red on every
// push forever — the precise defect this workflow was rewritten to remove. The
// job is therefore required to be gated on a repository variable, and required
// to set FEAR_AI_UNITY_REQUIRED, so that when it does run a skip is a failure.
const UNITY_GATE_MARKER = "if: vars.UNITY_EDITOR_AVAILABLE == 'true'";
const UNITY_REQUIRED_MARKER = "FEAR_AI_UNITY_REQUIRED: '1'";

// The stability entry point must actually repeat. Without this the nightly job
// would still pass, still upload a report, and prove nothing about determinism —
// the exact shape of rot this gate exists to catch.
const STABILITY_SCRIPT_PATTERN = /run_probe_suite\.mjs --repeat [2-9]\d*/;

// The ledger pull request step must run ONLY on a scheduled run of the default branch.
// It is not decoration: the script dispatches this same workflow on the branch it
// pushes (a GITHUB_TOKEN push triggers nothing, so the pull request would otherwise
// show no checks), and that dispatched run re-enters this job. If the step could also
// fold there, every night would fold a night onto the branch, dispatch again, and
// never stop — a loop that writes into the authority record for intermittency.
const LEDGER_PR_GATE_MARKER = "if: github.event_name == 'schedule' && github.ref == format('refs/heads/{0}', github.event.repository.default_branch)";

// It must also actually execute. Without -Execute the step would dry-run, print a plan,
// and exit 0 — a green job that pushes nothing and looks identical to one that did.
const LEDGER_PR_EXECUTE_MARKER = 'tools/ci/open_ledger_night_pr.ps1 -Execute';

// And the job must be allowed to do the three things it does; a missing scope fails at
// push or pull-request time, which is late and confusing.
const LEDGER_PR_PERMISSIONS = ['contents: write', 'pull-requests: write', 'actions: write'];

const RETIRED_RUNNER_PACKAGES = [
    /^jest$/, /^jest-cli$/, /^jest-environment-/, /^babel-jest$/, /^ts-jest$/, /^@jest\//,
    /^vitest$/, /^@vitest\//, /^mocha$/, /^jasmine/, /^ava$/, /^tap$/, /^node-tap$/,
    /^qunit$/, /^karma/, /^nyc$/, /^c8$/, /^istanbul$/, /^@playwright\/test$/, /^cypress$/
];

const RETIRED_CONFIG_FILES = [
    /^jest\.config\./, /^jest\.setup/, /^vitest\.config\./, /^\.mocharc/,
    /^karma\.conf\./, /^\.nycrc/, /^ava\.config\./, /^\.taprc$/
];

const TEST_FILE_PATTERN = /\.(test|spec)\.(js|mjs|cjs|jsx|ts|tsx)$/;

// Operational surfaces a user actually types into. Comments inside
// `tools/verification/*` legitimately say "not wired into `npm test`", so code
// comments are not scanned; user-facing scripts and CLI output are.
const OPERATIONAL_SCAN_ROOTS = ['bin', 'packages'];
const OPERATIONAL_SCAN_EXTENSIONS = /\.(js|mjs|cjs|ps1|bat|sh)$/;

// The manual regime's tooling lives here. Everything under it is something a
// person or CI runs by hand, so none of it may exist only on one machine.
const GATE_TOOLING_DIR = 'tools';

// Record files the nightly chain reads without ever naming them on a command
// line, so no derivation can find them: the comparison reads tonight's run
// against the committed repeated-run recording, and the dossier generator renders
// both recordings into the release candidate whose checked-in text the release
// claim probe asserts. Uncommitted, they are invisible in every local run and
// fatal in a clone — the dossier renders differently there and the probe fails.
// `evidence/heavy-suites.json` is deliberately gitignored and is not part of the
// chain, which is why the whole record tree is not walked here.
const GATE_RECORD_FILES = [
    'evidence/probe_stability_report.json',
    'evidence/probe_suite_report.json'
];

// Paths a CI command may name, in a command line or inside the npm script that
// command invokes. Restricted to the repository's own trees so that a bare
// filename (a report written by a step) is not mistaken for a gate input.
const CI_INPUT_PATTERN = /(?:^|[\s"'=])((?:tools|packages|bin|docs|evidence|\.github)\/[A-Za-z0-9_./-]+)/g;
const CI_NPM_RUN_PATTERN = /^npm run ([\w:.-]+)/;

// ---------------------------------------------------------------------------
// Mode 1: the tombstone (this is what `npm test` runs)
// ---------------------------------------------------------------------------

function tombstone() {
    const line = '!'.repeat(74);
    console.error('');
    console.error(line);
    console.error('  `npm test` IS RETIRED — HARD RULE 9 (OWNER MANDATE 2026-09-14)');
    console.error(line);
    console.error('');
    console.error('  This repository has zero automated test runners. `npm test` used to');
    console.error('  print a compliance banner and exit 0, which made a retired suite look');
    console.error('  runnable and green. It now REFUSES, so that neither a human nor a CI');
    console.error('  step can mistake its output for a passing suite.');
    console.error('');
    console.error('  Retired: all 465 suites / 67,524 lines, deleted 2026-09-15 at tag');
    console.error('  `v-test-retirement-complete`. Recovery, if it is ever wanted, is the');
    console.error('  backed-up branches `audit-tests-backup` and `backup/test-retirement-complete`.');
    console.error('');
    console.error('  Do this instead:');
    console.error('    - read the verification policy:  docs/SYSTEM_MAP.md ("Verification Policy")');
    console.error('    - run a standalone probe:        node tools/verification/<probe>.mjs');
    console.error('    - in-engine evidence capture:    npm run godot:evidence');
    console.error('    - check the retirement itself:   npm run verify:hard-rule-9');
    console.error('');
    console.error(`  Exit code ${TOMBSTONE_EXIT_CODE} means exactly one thing: Hard Rule 9 refusal.`);
    console.error('  It does not mean a suite failed, and there is no suite to fix.');
    console.error('');
    process.exit(TOMBSTONE_EXIT_CODE);
}

// ---------------------------------------------------------------------------
// Mode 2: the gate (`npm run verify:hard-rule-9`, what CI runs)
// ---------------------------------------------------------------------------

function readText(path) {
    return readFileSync(path, 'utf8');
}

function readJson(path) {
    return JSON.parse(readText(path));
}

function walk(dir, out = []) {
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (entry.isFile()) out.push(full);
    }
    return out;
}

function workflowFiles() {
    const dir = join(gitRoot, '.github', 'workflows');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter(name => /\.ya?ml$/.test(name))
        .map(name => join(dir, name));
}

// Comments are stripped before scanning: the workflow is *supposed* to explain
// which retired surface it dropped and why. What must never come back is a
// command, an action, or a reference that executes or re-enables one.
function stripYamlComments(text) {
    return text
        .split('\n')
        .filter(line => !/^\s*#/.test(line))
        .map(line => line.replace(/\s#[^'"\n]*$/, ''))
        .join('\n');
}

function runCommandsIn(text) {
    const commands = [];
    for (const match of text.matchAll(/^\s*(?:-\s+)?run:\s*(.+?)\s*$/gm)) {
        commands.push(match[1].replace(/^['"]|['"]$/g, ''));
    }
    return commands;
}

// The trigger block for one event, from the comment-stripped workflow. This is what
// decides whether a pull request is checked at all — and unlike every other part of
// CI, a filter here removes checks rather than failing them, so it has to be read
// rather than trusted. `bare` records whether the event key carries no inline value:
// `pull_request:` is the unfiltered form, anything after the colon is a narrowing.
function eventTriggerKeys(text, event) {
    const lines = text.split('\n');
    const onIndex = lines.findIndex(line => /^on:\s*$/.test(line));
    if (onIndex === -1) return null;
    let onEnd = lines.length;
    for (let i = onIndex + 1; i < lines.length; i += 1) {
        if (/^\S/.test(lines[i])) { onEnd = i; break; }
    }
    const block = lines.slice(onIndex + 1, onEnd);
    const start = block.findIndex(line => line.startsWith(`  ${event}:`));
    if (start === -1) return null;
    if (block[start].trim() !== `${event}:`) return { bare: false, keys: [] };
    let stop = block.length;
    for (let i = start + 1; i < block.length; i += 1) {
        if (/^ {2}\S/.test(block[i])) { stop = i; break; }
    }
    return {
        bare: true,
        keys: block.slice(start + 1, stop)
            // A list item such as `- cron: '0 4 * * *'` is a value, not a key of this
            // event, so it is dropped before the keys are read.
            .filter(line => line.trim() !== '' && !/^\s*-\s/.test(line))
            .map(line => line.trim().split(':')[0])
    };
}

// Every path a CI step names, plus every path inside the npm script that step runs.
function ciInputPaths(commands, scripts) {
    const paths = new Set();
    const add = text => {
        for (const match of text.matchAll(CI_INPUT_PATTERN)) {
            paths.add(match[1].replace(/[.,;]+$/, ''));
        }
    };
    for (const command of commands) {
        add(command);
        const npmRun = command.match(CI_NPM_RUN_PATTERN);
        if (npmRun && scripts[npmRun[1]]) add(scripts[npmRun[1]]);
    }
    return [...paths].sort();
}

// The paths committed at HEAD. `null` means there is no HEAD to compare against
// (an exported tarball), which is reported rather than read as a pass.
function headPaths() {
    const result = spawnSync('git', ['-C', gitRoot, 'ls-tree', '-r', '--name-only', 'HEAD'], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024
    });
    if (result.error || result.status !== 0) return null;
    return new Set(result.stdout.split('\n').map(line => line.trim()).filter(Boolean));
}

// A file that is untracked *and* gitignored is the same hazard as an untracked
// one, and worth naming separately: the fix is a .gitignore edit, not a `git add`.
function isIgnored(gitRelative) {
    const result = spawnSync('git', ['-C', gitRoot, 'check-ignore', '--quiet', gitRelative], { encoding: 'utf8' });
    return result.status === 0;
}

function gate() {
    const failures = [];
    let checks = 0;

    function record(id, passed, detail) {
        checks += 1;
        if (passed) {
            console.log(`  PASS  ${id}`);
        } else {
            console.log(`  FAIL  ${id}`);
            failures.push(`${id} — ${detail}`);
        }
    }

    console.log('============================================================');
    console.log('VERIFY HARD RULE 9 — TEST RETIREMENT INTEGRITY');
    console.log('============================================================');
    console.log(`  repo: ${repoRoot}`);
    console.log('');

    const pkg = readJson(join(repoRoot, 'package.json'));
    const scripts = pkg.scripts || {};

    // 1. `npm test` is wired to the tombstone, not to a no-op that exits 0.
    record(
        'npm-test-is-the-tombstone',
        scripts.test === TOMBSTONE_SCRIPT,
        `scripts.test is ${JSON.stringify(scripts.test)}, expected ${JSON.stringify(TOMBSTONE_SCRIPT)}`
    );
    record(
        'gate-script-is-wired',
        scripts['verify:hard-rule-9'] === GATE_SCRIPT,
        `scripts["verify:hard-rule-9"] is ${JSON.stringify(scripts['verify:hard-rule-9'])}, expected ${JSON.stringify(GATE_SCRIPT)}`
    );
    record(
        'probe-suite-is-wired',
        scripts['verify:probes'] === 'node tools/verification/run_probe_suite.mjs',
        `scripts["verify:probes"] is ${JSON.stringify(scripts['verify:probes'])}; CI cannot run the probes without it`
    );
    record(
        'stability-comparison-is-wired',
        scripts['verify:stability-regression'] === 'node tools/verification/stability_regression.mjs',
        `scripts["verify:stability-regression"] is ${JSON.stringify(scripts['verify:stability-regression'])}; `
            + 'without it the nightly job cannot say what changed since the recording'
    );
    record(
        'probe-stability-is-wired-and-repeats',
        STABILITY_SCRIPT_PATTERN.test(scripts['verify:probe-stability'] || ''),
        `scripts["verify:probe-stability"] is ${JSON.stringify(scripts['verify:probe-stability'])}; `
            + `it must repeat (expected ${STABILITY_SCRIPT_PATTERN}), or the nightly job proves no determinism`
    );

    // 2. The tombstone really refuses: run it and require a loud non-zero exit.
    const spawned = spawnSync(process.execPath, [join(repoRoot, 'tools/guardian/hard-rule-9.mjs')], {
        encoding: 'utf8',
        cwd: repoRoot
    });
    record(
        'tombstone-exits-non-zero',
        spawned.status === TOMBSTONE_EXIT_CODE,
        `tombstone exited ${spawned.status}, expected ${TOMBSTONE_EXIT_CODE}`
    );
    record(
        'tombstone-says-retired',
        /RETIRED/.test(spawned.stderr || ''),
        'tombstone stderr does not name the retirement, so a reader cannot tell why it failed'
    );

    // 3. No runner or coverage tooling in the manifest or on disk.
    const declared = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
    const runnerPackages = declared.filter(name => RETIRED_RUNNER_PACKAGES.some(p => p.test(name)));
    record(
        'no-runner-dependencies',
        runnerPackages.length === 0,
        `manifest re-declares retired runner packages: ${runnerPackages.join(', ')}`
    );

    const manifestScripts = Object.keys(scripts).filter(name => /^(test|coverage|test:coverage|lint:test)$/.test(name) && name !== 'test');
    record(
        'no-coverage-scripts',
        manifestScripts.length === 0,
        `manifest re-declares retired runner scripts: ${manifestScripts.join(', ')}`
    );

    const topLevel = readdirSync(repoRoot, { withFileTypes: true })
        .filter(e => e.isFile())
        .map(e => e.name);
    const runnerConfigs = topLevel.filter(name => RETIRED_CONFIG_FILES.some(p => p.test(name)));
    record(
        'no-runner-config-files',
        runnerConfigs.length === 0,
        `runner config re-appeared: ${runnerConfigs.join(', ')}`
    );

    const straySuites = walk(repoRoot)
        .filter(path => TEST_FILE_PATTERN.test(path))
        .map(path => relative(repoRoot, path).replace(/\\/g, '/'));
    record(
        'no-test-or-spec-files',
        straySuites.length === 0,
        `test/spec files re-appeared (${straySuites.length}): ${straySuites.slice(0, 5).join(', ')}`
    );

    // 4. One live workflow, in the only place GitHub reads, and no inert twin.
    //    An unreachable workflow file is worse than a missing one: it reads as
    //    CI that exists while the live file says something else entirely.
    const inertDir = join(repoRoot, '.github');
    record(
        'no-inert-workflow-inside-the-subtree',
        !existsSync(inertDir),
        `${relative(gitRoot, inertDir).replace(/\\/g, '/')} exists; GitHub never reads it, so it can only mislead`
    );

    const workflows = workflowFiles();
    const workflowText = workflows.map(path => readText(path)).join('\n');
    record(
        'ci-workflow-present',
        workflows.length > 0,
        `no workflow found under ${relative(gitRoot, join(gitRoot, '.github', 'workflows')).replace(/\\/g, '/')}`
    );

    // 5. CI runs exactly what the doc claims, and nothing that cannot pass.
    const executableCiText = stripYamlComments(workflowText);
    const commands = workflowText ? runCommandsIn(executableCiText) : [];
    const unexpected = commands.filter(cmd => !CI_RUN_ALLOWLIST.includes(cmd));
    const missing = CI_RUN_ALLOWLIST.filter(cmd => !commands.includes(cmd));
    record(
        'ci-runs-exactly-the-allowlist',
        commands.length > 0 && unexpected.length === 0 && missing.length === 0,
        `unexpected CI commands: ${unexpected.join(' | ') || 'none'}; missing: ${missing.join(' | ') || 'none'}`
    );

    const deadPaths = [];
    for (const marker of ['npm test', 'test:coverage', 'codecov', 'Codecov', 'jest', 'Jest']) {
        if (executableCiText.includes(marker)) deadPaths.push(marker);
    }
    record(
        'ci-free-of-retired-paths',
        deadPaths.length === 0,
        `workflow still references retired runner surface: ${deadPaths.join(', ')}`
    );

    record(
        'ci-installs-nothing-it-cannot-run',
        workflowText.includes('working-directory: fear-ai-sim'),
        'CI steps do not declare working-directory: fear-ai-sim, so the npm scripts cannot resolve'
    );

    // The nightly fold must be gated, must execute, and must be allowed to push.
    // Asserted against the comment-stripped workflow, not the raw file: the header above
    // explains this step in prose that names the same gate, the same -Execute and the same
    // scopes, and a check satisfied by a comment is a check that can never fail. (Found by
    // mutating each of them and requiring the gate to fire.)
    record(
        'ledger-pr-step-cannot-feed-itself',
        executableCiText.includes(LEDGER_PR_GATE_MARKER),
        'the nightly ledger pull request step must be gated on a scheduled run of the default '
            + `branch (${JSON.stringify(LEDGER_PR_GATE_MARKER)}); the script dispatches this workflow on the branch it `
            + 'pushes, so an ungated step would fold a night each time it was dispatched and never stop'
    );
    record(
        'ledger-pr-step-executes',
        executableCiText.includes(LEDGER_PR_EXECUTE_MARKER),
        `the ledger pull request step must pass -Execute (${JSON.stringify(LEDGER_PR_EXECUTE_MARKER)}); `
            + 'the script defaults to a dry run, so without it the step would report success and push nothing'
    );
    const missingPermissions = LEDGER_PR_PERMISSIONS.filter(permission => !executableCiText.includes(permission));
    record(
        'ledger-pr-job-has-the-scopes-it-needs',
        missingPermissions.length === 0,
        `the workflow does not grant: ${missingPermissions.join(', ')}; pushing the review branch, opening `
            + 'its pull request and dispatching CI on it each need their own write scope'
    );

    // A Unity job that ran on every push would be permanently red: no GitHub-hosted
    // runner has an Editor or a license. So it must be gated, and once it runs it
    // must refuse to accept a skip as a pass.
    record(
        'unity-editor-gate-is-inert-until-configured',
        workflowText.includes(UNITY_GATE_MARKER) && workflowText.includes(UNITY_REQUIRED_MARKER),
        'the Unity Editor job must be gated on a repository variable '
            + `(${JSON.stringify(UNITY_GATE_MARKER)}) and must set ${JSON.stringify(UNITY_REQUIRED_MARKER)}; `
            + 'without both, it is either permanently red or silently lenient'
    );

    // 6. The gate's own inputs exist in the commit, not only on this machine.
    //    Every check above reads the working tree, which is why all of them can be
    //    green on a checkout whose toolchain was never committed — the state this
    //    repository was actually in when the check was written: 25 files under
    //    tools/ untracked, `npm test` and the probe suite resolving anyway because
    //    the bytes were on disk, and a fresh clone of the same commit failing at its
    //    first step. A local pass that no clone can reproduce is not evidence.
    const committedAtHead = headPaths();
    const gitPrefix = relative(gitRoot, repoRoot).replace(/\\/g, '/');
    const notCommitted = [];
    const ignoredInputs = [];

    if (committedAtHead === null) {
        record(
            'gate-inputs-are-committed',
            false,
            'this tree has no HEAD to compare against (not a git checkout), so whether a clone could '
                + 'run these gates was not checked — export the repository from a commit to check it'
        );
    } else {
        const requireCommitted = relPath => {
            const fromGitRoot = `${gitPrefix}/${relPath}`;
            if (committedAtHead.has(fromGitRoot)) return;
            // A path CI names but no file backs is a different defect (the step fails
            // loudly on its own); this check is about files that exist only here.
            if (!existsSync(join(repoRoot, relPath))) return;
            notCommitted.push(relPath);
            if (isIgnored(fromGitRoot)) ignoredInputs.push(relPath);
        };

        for (const file of walk(join(repoRoot, GATE_TOOLING_DIR))) {
            requireCommitted(relative(repoRoot, file).replace(/\\/g, '/'));
        }
        for (const input of ciInputPaths(commands, scripts)) requireCommitted(input);
        for (const record of GATE_RECORD_FILES) requireCommitted(record);

        // A CI-named path and a walked file can be the same file; the list is a
        // list of files, so it is deduplicated before it is counted.
        const uniqueNotCommitted = [...new Set(notCommitted)].sort();
        notCommitted.length = 0;
        notCommitted.push(...uniqueNotCommitted);
        const uniqueIgnored = [...new Set(ignoredInputs)];
        record(
            'gate-inputs-are-committed',
            notCommitted.length === 0,
            `${notCommitted.length} file(s) the gate chain needs exist only in the working tree, so a fresh `
                + `checkout of this commit cannot reproduce this run: ${notCommitted.slice(0, 6).join(', ')}`
                + (notCommitted.length > 6 ? ` (+${notCommitted.length - 6} more)` : '')
                + (uniqueIgnored.length > 0
                    ? `; ${uniqueIgnored.length} of them are gitignored, which needs a .gitignore change rather than a git add: ${uniqueIgnored.slice(0, 3).join(', ')}`
                    : '')
        );
        // The summary line truncates; the list does not. Fixing this means
        // committing a specific set of files, so the whole set is printed rather
        // than a count a reader would have to reproduce by hand.
        if (notCommitted.length > 0) {
            console.log(`        ${notCommitted.length} file(s) present here but not at HEAD:`);
            for (const relPath of notCommitted) console.log(`          ${relPath}`);
        }
    }

    // A job can DECLARE a runtime it does not install. The first real CI run failed
    // exactly there: the probe job declared `transport_signing` proven, the runner
    // ships python but not the `cryptography` wheel the Python adapter needs, and the
    // probe failed with `SIGNED 0 REFUSALS 0 REASON` — a claim failure whose cause the
    // log never named. The requirement is derived from the declarations themselves
    // rather than written down twice, so a job that starts declaring this runtime
    // without installing the backend fails here instead of on the runner.
    const declaringJobs = (executableCiText.match(/FEAR_AI_EXPECT_PROVEN:[^\n]*transport_signing/g) || []).length;
    const pinnedBackends = (executableCiText.match(/python -m pip install[^\n]*cryptography==\d+\.\d+\.\d+/g) || []).length;
    record(
        'python-signing-backend-is-pinned-where-it-is-declared',
        declaringJobs > 0 && pinnedBackends >= declaringJobs,
        `${declaringJobs} job(s) declare transport_signing proven but ${pinnedBackends} install a pinned cryptography wheel; `
            + 'a declared runtime that is not installed fails on the runner for a reason no local run shows'
    );

    // A declaration that a runtime is PROVEN is only as good as its match. The probe
    // runner promotes a SKIPPED line to a failure when the probe's FILENAME contains a
    // name from FEAR_AI_EXPECT_PROVEN, so a renamed probe, a typo or a stale entry
    // silently turns the declaration back into decoration — the gate keeps passing,
    // and the thing it was declared to prove is no longer checked anywhere. Naming
    // only probes that exist is the one check that can tell a live expectation from a
    // dead one, and it is derived rather than written down, so adding a declaration
    // for a fifth runtime needs no edit here.
    const declaredRuntimeNames = [...new Set(
        [...executableCiText.matchAll(/FEAR_AI_EXPECT_PROVEN:([^\n]*)/g)]
            .flatMap(match => match[1].split(',').map(name => name.trim()).filter(Boolean))
    )];
    const probeFilenames = readdirSync(join(repoRoot, 'tools', 'verification')).filter(name => /^verify_.*\.mjs$/.test(name));
    const deadExpectations = declaredRuntimeNames.filter(name => !probeFilenames.some(probe => probe.includes(name)));
    record(
        'expect-proven-names-match-a-real-probe',
        declaredRuntimeNames.length > 0 && deadExpectations.length === 0,
        declaredRuntimeNames.length === 0
            ? 'the workflow declares no FEAR_AI_EXPECT_PROVEN runtimes, so no SKIPPED probe is ever promoted to a failure'
            : `FEAR_AI_EXPECT_PROVEN names ${deadExpectations.join(', ')}, which match no probe under `
                + 'tools/verification; a declaration that matches nothing is silently inert'
    );

    // A command in the allowlist can still name a script that does not exist — the
    // allowlist compares command text, so it cannot tell `verify:probes` from a typo
    // of it. That step would then fail at runtime, on the runner, for a reason no
    // local run of this gate would ever show.
    const unresolvedScripts = commands
        .map(command => command.match(CI_NPM_RUN_PATTERN))
        .filter(match => match && !scripts[match[1]])
        .map(match => match[1]);
    record(
        'ci-npm-scripts-resolve',
        unresolvedScripts.length === 0,
        `CI runs npm scripts that package.json does not declare: ${unresolvedScripts.join(', ')}`
    );

    // 7. No operational surface tells a user to run the tombstone.
    const operationalHits = [];
    for (const rootName of OPERATIONAL_SCAN_ROOTS) {
        for (const file of walk(join(repoRoot, rootName))) {
            if (!OPERATIONAL_SCAN_EXTENSIONS.test(file)) continue;
            const text = readText(file);
            if (text.includes('npm test')) {
                operationalHits.push(relative(repoRoot, file).replace(/\\/g, '/'));
            }
        }
    }
    for (const file of topLevel.filter(name => /\.(ps1|bat|sh)$/.test(name))) {
        const text = readText(join(repoRoot, file));
        if (text.includes('npm test')) operationalHits.push(file);
    }
    record(
        'no-operational-surface-advertises-npm-test',
        operationalHits.length === 0,
        `these still tell a user to run the retired entry point: ${operationalHits.join(', ')}`
    );

    // 8. The map that governs the repo states this same contract. Asserting the
    //    prose is deliberate: the last CI rot happened because the workflow and
    //    the map disagreed and nothing compared them.
    const systemMap = readText(join(repoRoot, 'docs', 'SYSTEM_MAP.md'));
    const mapStates = [
        'verify:hard-rule-9', 'guardian:check', 'verify:probes', 'verify:probe-stability',
        'verify:unity-editor', 'inert until', 'verify:stability-regression', 'advisory', 'non-zero exit code',
        'ci/stability-ledger', 'exist in the commit, not only in the working tree', 'cryptography==',
        'every base branch', 'no run at all', 'audit:remote-state', 'at least one check run',
        'required status context that no job produces'
    ];
    const mapMissing = mapStates.filter(needle => !systemMap.includes(needle));
    record(
        'system-map-states-the-same-ci-contract',
        mapMissing.length === 0,
        `docs/SYSTEM_MAP.md no longer states: ${mapMissing.join(', ')}`
    );

    // 9. Every pull request must get a run. This is the one CI defect that cannot
    //    announce itself: `pull_request.branches` is matched against a pull request's
    //    BASE branch, so a filter here means a pull request based on another branch
    //    receives no jobs at all — no failure, no skip, no check run, and a page that
    //    reads exactly like one whose checks are slow. This workflow declared
    //    `branches: [main, master]` until 2026-09-21, and it was found by opening a
    //    pull request on a feature branch and noticing the absence, which is not a
    //    detection mechanism — the whole reason the check exists rather than the fix
    //    alone. `paths`, `paths-ignore` and `types` narrow the same way and are
    //    rejected with it; the push half is asserted too, because the pull request
    //    half of the fix is only free while a feature-branch push is not also built.
    //    Every workflow file is inspected, not the first `on:` block that can be found:
    //    a second file is exactly how this defect would arrive unnoticed, since the run
    //    for a pull request is the union of what every workflow decides — and the
    //    mutation matrix caught the first version of this check reading only one.
    const narrowingKeys = ['branches', 'branches-ignore', 'paths', 'paths-ignore', 'types'];
    const triggerProblems = [];
    let declaresPullRequest = false;
    for (const path of workflows) {
        const name = relative(gitRoot, path).replace(/\\/g, '/');
        const text = stripYamlComments(readText(path));
        const pr = eventTriggerKeys(text, 'pull_request');
        const push = eventTriggerKeys(text, 'push');
        if (pr !== null) declaresPullRequest = true;
        if (pr !== null && !pr.bare) {
            triggerProblems.push(`${name}: the \`pull_request:\` key carries an inline value; it must be a bare, unfiltered trigger`);
        } else if (pr !== null) {
            const narrowing = narrowingKeys.filter(key => pr.keys.includes(key));
            if (narrowing.length > 0) {
                triggerProblems.push(`${name}: \`pull_request\` is narrowed by ${narrowing.join(', ')}, so a pull request `
                    + 'outside it receives NO RUN — not a failure, not a skip, an empty checks list');
            }
        }
        if (push !== null && (!push.bare || !push.keys.includes('branches'))) {
            triggerProblems.push(`${name}: \`push\` no longer restricts to the default branches, so the unfiltered `
                + 'pull request trigger would also build every feature-branch push');
        }
    }
    if (!declaresPullRequest) {
        triggerProblems.push('no workflow declares a `pull_request` trigger, so no pull request is checked at all');
    }
    record('every-pull-request-gets-a-run', triggerProblems.length === 0, triggerProblems.join('; ') || 'unreachable');

    // Every check above asks whether a SENTENCE still exists, so not one of them can
    // see a NUMBER that has drifted — and the numbers do drift: the gate's own total
    // was written down as 19, then 22, then 24; the probe roster was stated as 24 while
    // it was 25; and the release surface enumerated five categories that summed to 27
    // and called the total 24. Each was found by reading, never by a failing check.
    // So derive the two counts that move — the roster from the files, the gate total
    // from this run — and require the places that speak about NOW to agree.
    //
    // The claim sites are bounded rather than "every number under docs/": the ledger
    // header is the one place that speaks about the current state and it ends at an
    // explicit boundary sentence, so history below that line may keep stating the
    // count that was true of the state it describes. The other two sites are the two
    // release documents' current-claim lines. A count outside those sites is not
    // checked — that is the trade, and it is why this check says which sites it reads
    // instead of implying it polices every number in the repository.
    const rosterSize = probeFilenames.length;
    const gateTotal = checks + 1; // this check is recorded last (asserted below)
    const selfSource = readText(join(__dirname, 'hard-rule-9.mjs'));
    const ownId = 'documented-counts-match-the-derived-counts';
    const ownIndex = selfSource.indexOf(ownId);
    const recordsAfterThisOne = ownIndex === -1
        ? -1
        : (selfSource.slice(ownIndex).match(/^\s*record\(/gm) || []).length;
    const ledgerText = readText(join(repoRoot, 'docs', 'CURRENT_TRUTH_LEDGER.md'));
    const headerBoundary = 'The earlier anchors below are retained';
    const headerStart = ledgerText.indexOf('**Current audit state**');
    const headerEnd = ledgerText.indexOf(headerBoundary);
    // Emphasis is stripped before the numbers are read, because it was hiding one: the
    // header said `reports **27** integrity checks` while the run was 28/28, and both
    // patterns below missed it — the `N/N` form because the number was written bare, and
    // a bare form because `**` sat between the digits and `integrity checks`. A count this
    // check cannot see is the exact drift it exists to catch, so the two shapes the
    // documents actually use are matched on the de-emphasised text.
    const liveHeaderRaw = headerStart === -1 || headerEnd < headerStart ? '' : ledgerText.slice(headerStart, headerEnd);
    const liveHeader = liveHeaderRaw.replace(/[*`]/g, '');
    const liveProbeClaims = [...liveHeader.matchAll(/(\d+)\s+probes\b/g)].map(match => Number(match[1]));
    const liveGateClaims = [
        ...[...liveHeader.matchAll(/(\d+)\/(\d+)\b/g)]
            .map(match => ({ display: match[0], left: Number(match[1]), right: Number(match[2]) })),
        ...[...liveHeader.matchAll(/(\d+)\s+integrity checks\b/g)]
            .map(match => ({ display: `${match[1]} integrity checks`, left: Number(match[1]), right: Number(match[1]) }))
    ];
    const strayProbeClaims = liveProbeClaims.filter(value => value !== rosterSize);
    const strayGateClaims = liveGateClaims.filter(claim => claim.left !== gateTotal || claim.right !== gateTotal);

    // The two enumerations must also ADD UP, which is a different failure from quoting
    // the wrong total: a list that sums to 24 beside a claim of 25 is self-contradictory
    // rather than merely stale, and that is the version that actually shipped.
    const enumerationProblems = [];
    for (const [file, pattern] of [
        ['docs/RELEASE_SURFACE.md', /^\| Verification \|.*$/m],
        ['docs/RELEASE_CANDIDATE_CERTIFICATION.md', /^Current JS evidence:.*$/m]
    ]) {
        const line = (readText(join(repoRoot, file)).match(pattern) || [''])[0];
        const claim = line.match(/(\d+)\s+(?:`verify_\*\.mjs`|standalone verification)?\s*probes\b/);
        if (!claim) {
            enumerationProblems.push(`${file}: no roster claim found, so its enumeration is unchecked`);
            continue;
        }
        if (Number(claim[1]) !== rosterSize) {
            enumerationProblems.push(`${file}: claims ${claim[1]} probes, the roster is ${rosterSize}`);
        }
        const rest = line.slice(claim.index + claim[0].length);
        const firstDash = rest.indexOf(' — ');
        const secondDash = rest.indexOf(' — ', firstDash + 3);
        const parts = (rest.slice(firstDash + 3, secondDash).match(/\b\d+\b/g)) || [];
        if (firstDash === -1 || secondDash === -1 || parts.length < 2) {
            enumerationProblems.push(`${file}: its roster claim is not followed by a bounded list of counts, so it cannot be summed`);
            continue;
        }
        const sum = parts.reduce((total, value) => total + Number(value), 0);
        if (sum !== rosterSize) {
            enumerationProblems.push(`${file}: its categories sum to ${sum}, the roster is ${rosterSize}`);
        }
    }

    record(
        ownId,
        headerStart !== -1
            && headerEnd !== -1
            && recordsAfterThisOne === 1
            && strayProbeClaims.length === 0
            && strayGateClaims.length === 0
            && enumerationProblems.length === 0,
        [
            headerStart === -1 ? 'docs/CURRENT_TRUTH_LEDGER.md no longer carries the **Current audit state** marker' : null,
            headerEnd === -1 ? `docs/CURRENT_TRUTH_LEDGER.md no longer carries the boundary sentence "${headerBoundary}"` : null,
            recordsAfterThisOne === -1 ? 'this check cannot find its own id in its own source, so it cannot tell whether it is last' : null,
            recordsAfterThisOne > 1 ? `${recordsAfterThisOne} record() calls follow this one; move it back to last so its derived total is the final total` : null,
            strayProbeClaims.length > 0 ? `the ledger header claims ${strayProbeClaims.join(', ')} probes and the roster is ${rosterSize}` : null,
            strayGateClaims.length > 0 ? `the ledger header claims ${strayGateClaims.map(claim => claim.display).join(', ')} and this run has ${gateTotal}` : null,
            ...enumerationProblems
        ].filter(Boolean).join('; ')
    );

    console.log('');
    if (failures.length > 0) {
        console.log(`FAILED — ${failures.length} of ${checks} Hard Rule 9 integrity checks.`);
        for (const failure of failures) console.log(`  - ${failure}`);
        console.log('');
        process.exit(1);
    }
    console.log(`PASSED — ${checks}/${checks} Hard Rule 9 integrity checks. The retirement is intact.`);
    console.log('');
}

if (process.argv.includes('--verify')) gate();
else tombstone();
