#!/usr/bin/env node
/**
 * tools/verification/verify_night_fold_rehearsal.mjs — the nightly fold, rehearsed in a
 * throwaway repository whose shape is this repository's: the project nested one level
 * below the git root.
 *
 * WHY THIS EXISTS. On 2026-09-22 and 2026-09-23 the nightly ledger fold was refused by
 * its own preconditions in CI and both nights were lost from the record. The cause was
 * not git: `git status --porcelain`, `git show --name-only` and `<rev>:<path>` object
 * specs all speak in REPOSITORY-root-relative paths, while `tools/ci/open_ledger_night_pr.ps1`
 * compared them against PROJECT-relative ones — identical strings only when the project
 * directory is the repository root. Nesting `fear-ai-sim/` one level down made the
 * dirty-check list the two files the fold is *for* as foreign, made the committed-files
 * check unable to recognize its own commit, and made the `HEAD:evidence/...` existence
 * check fail silently, disabling the append-only guard behind it. A fix in path
 * arithmetic cannot be reviewed by reading it: it either survives the real nested layout
 * or it does not, so this probe executes the REAL script against a REAL git repository
 * with a REAL nested project directory and pins what each refusal and push actually did.
 *
 * WHAT IT RUNS, AND WHAT IT NEVER TOUCHES. It builds a temporary repository containing
 * a fixture ledger (one committed night), a fixture recording, a fixture dossier and a
 * fixture README; copies the script and its two helpers from this checkout; adds a bare
 * `origin` beside it; and runs the script with `-Execute -NoPullRequest
 * -SkipDocumentGates`. The branch mechanics and the push are real and land in the
 * throwaway bare repository. Before every scenario the checkout returns to the
 * default-branch commit, because the nightly job gets a fresh clone every night — a
 * rehearsal that kept an earlier scenario's local commits would be grading a
 * different workflow. The document gates are skipped BY DESIGN (the rehearsal
 * says nothing about the documents, and CI still asserts the real job never skips
 * them); no pull request is opened; no network is contacted. The real repository is
 * only ever read from.
 *
 * WHAT IT PINS, SCENARIO BY SCENARIO.
 *   1. first night: exit 0, `ci/stability-ledger` created on the bare remote, its
 *      ledger holding exactly the committed night plus tonight's, and the pushed
 *      commit changing exactly that one file — and the preview counting ONE night,
 *      which is the `cat-file` coordinate check answering correctly;
 *   2. next night: exit 0, tonight's night folds onto the nights the branch already
 *      carries, and the pre-existing lines survive byte-for-byte;
 *   3. the same nights folded twice: the fold tool writes nothing new and the record
 *      never inflates; and a checkout carrying nothing the default branch lacks stops
 *      with "nothing new to review" before anything is folded;
 *   4. a modified tracked file that is neither the ledger nor the dossier: exit 2, the
 *      refusal names that file, and the refusal does NOT list the ledger itself — the
 *      assertion every night of the 2026-09-22/23 outage would have failed;
 *   5. a working ledger that rewrites a recorded night: exit 2. A fold appends.
 *
 * WHAT IT DOES NOT CLAIM. Not the document gates (skipped by design, mirrored in the
 * pull request body as a rehearsal note), not GitHub, not the pull request path, and
 * nothing about the real ledger's contents — every fixture night is marked as a fixture.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

let assertions = 0;
function assert(condition, message) {
    assertions += 1;
    if (!condition) throw new Error(`assertion failed: ${message}`);
    console.log(`  * ${message}`);
}

const lines = text => text.split(/\r?\n/).filter(line => line.trim() !== '');

const pwsh = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.Major'], {
    encoding: 'utf8', timeout: 60_000
});
if (pwsh.error || pwsh.status !== 0) {
    console.log('SKIPPED — pwsh is not on PATH, so the nightly fold cannot be rehearsed on this machine.');
    process.exit(0);
}

const work = mkdtempSync(join(tmpdir(), 'night-fold-rehearsal-'));
const root = join(work, 'root');
const proj = join(root, 'fear-ai-sim');
const bare = join(work, 'origin.git');

const git = (args, cwd = root) => spawnSync('git', args, {
    encoding: 'utf8', cwd, timeout: 120_000, maxBuffer: 16 * 1024 * 1024
});
const bareGit = args => spawnSync('git', ['--git-dir', bare, ...args], {
    encoding: 'utf8', timeout: 60_000, maxBuffer: 16 * 1024 * 1024
});

const NIGHT_A = '2026-09-21T00:00:00.000Z';
const NIGHT_B = '2026-09-22T00:00:00.000Z';
const NIGHT_C = '2026-09-23T00:00:00.000Z';
const FIXTURE_PROBE = 'verify_fixture_probe.mjs';

function nightLine(recordedAt) {
    return JSON.stringify({
        recordedAt,
        node: 'v24.19.0',
        platform: 'win32',
        repeat: 3,
        engine: 'rehearsal fixture — not a probe run',
        probes: {
            [FIXTURE_PROBE]: { verdicts: ['PASSED', 'PASSED', 'PASSED'], durationsMs: [100, 101, 99] }
        }
    });
}
const ledgerText = nights => nights.map(nightLine).join('\n') + '\n';
const writeLedger = nights => writeFileSync(join(proj, 'evidence', 'probe_stability_ledger.jsonl'), ledgerText(nights));

const README = '# Fixture project\n\nThe rehearsal modifies this file to prove the foreign-change refusal names it.\n';
const DOSSIER = '# Rehearsal fixture dossier\n\nThe nightly fold only scaffolds this file; nothing in it is quoted by the rehearsal.\n';

const childEnv = { ...process.env };
delete childEnv.GITHUB_SHA;
delete childEnv.GITHUB_STEP_SUMMARY;
delete childEnv.GH_TOKEN;

function runFold() {
    const result = spawnSync('pwsh', [
        '-NoProfile', '-NonInteractive', '-File', join(proj, 'tools', 'ci', 'open_ledger_night_pr.ps1'),
        '-Execute', '-NoPullRequest', '-SkipDocumentGates'
    ], { cwd: proj, encoding: 'utf8', timeout: 300_000, maxBuffer: 32 * 1024 * 1024, env: childEnv });
    let output = (result.stdout || '') + (result.stderr || '');
    if (result.error) output += `\nspawn error: ${result.error.message}`;
    return { status: result.status, output };
}

try {
    console.log('--- Fixture: the repository shape that made the 2026-09-22/23 nights un-foldable ---');

    mkdirSync(join(proj, 'evidence'), { recursive: true });
    mkdirSync(join(proj, 'docs'), { recursive: true });
    mkdirSync(join(proj, 'tools', 'ci'), { recursive: true });
    mkdirSync(join(proj, 'tools', 'verification'), { recursive: true });
    mkdirSync(bare, { recursive: true });

    for (const rel of [
        'tools/ci/open_ledger_night_pr.ps1',
        'tools/verification/fold_stability_ledger.mjs',
        'tools/verification/stability_regression.mjs'
    ]) {
        cpSync(join(repoRoot, rel), join(proj, rel));
    }
    writeFileSync(join(proj, 'evidence', 'probe_stability_report.json'),
        JSON.stringify({ probes: [{ name: FIXTURE_PROBE }] }, null, 2) + '\n');
    writeFileSync(join(proj, 'README.md'), README);
    writeFileSync(join(proj, 'docs', 'RELEASE_CANDIDATE_CERTIFICATION.md'), DOSSIER);
    writeLedger([NIGHT_A]);

    assert(git(['init', '-q', '-b', 'master']).status === 0, 'the fixture repository initializes');
    for (const [key, value] of [
        ['user.name', 'Rehearsal Fixture'], ['user.email', 'rehearsal@example.invalid'],
        ['commit.gpgsign', 'false'], ['tag.gpgsign', 'false'], ['core.hooksPath', '.no-hooks-installed']
    ]) {
        git(['config', key, value]);
    }
    git(['add', '-A']);
    assert(git(['commit', '-q', '-m', 'fixture base: night A is recorded']).status === 0,
        'the fixture commits night A as the recorded history');
    assert(git(['init', '-q', '--bare'], bare).status === 0, 'the bare origin exists');
    assert(git(['remote', 'add', 'origin', bare]).status === 0, 'the fixture project has an origin');
    const prefix = git(['rev-parse', '--show-prefix'], proj).stdout.trim();
    assert(prefix === 'fear-ai-sim/', `the fixture project is nested exactly one level (--show-prefix = ${JSON.stringify(prefix)})`);
    const baseSha = git(['rev-parse', 'HEAD']).stdout.trim();
    function resetCheckout() {
        const reset = git(['reset', '--hard', '--quiet', baseSha]);
        if (reset.status !== 0) throw new Error(`fixture checkout could not return to the default-branch commit: ${reset.stderr.trim()}`);
    }

    console.log('\n--- 1. First night: the branch is created from HEAD and pushed ---');
    writeLedger([NIGHT_A, NIGHT_B]);
    const s1 = runFold();
    assert(s1.status === 0, `the first night folds (exit 0, got ${s1.status})`);
    assert(s1.output.includes('1 night(s) not in HEAD'),
        'the preview counts exactly tonight — the cat-file coordinate check found the ledger in HEAD');
    assert(!s1.output.includes('not tracked in HEAD yet'),
        'the banner does not mislabel a tracked ledger as untracked');
    assert(s1.output.includes('-NoPullRequest: the branch was pushed and no pull request was opened.'),
        `the pushed branch ends the run without a pull request (tail: ${lines(s1.output).slice(-4).join(' | ')})`);
    const s1Subject = bareGit(['log', '-1', '--format=%s', 'refs/heads/ci/stability-ledger']).stdout.trim();
    assert(s1Subject === 'ci(stability): fold 1 nightly stability-ledger night(s)',
        `the folded commit reports exactly one night awaiting review (got: ${JSON.stringify(s1Subject)})`);
    const s1Body = bareGit(['log', '-1', '--format=%B', 'refs/heads/ci/stability-ledger']).stdout;
    assert(s1Body.includes('Nights: 2026-09-22T00:00:00'),
        'the folded commit names tonight and only tonight');
    assert(bareGit(['rev-parse', '--verify', '--quiet', 'refs/heads/ci/stability-ledger']).status === 0,
        'ci/stability-ledger exists on the remote');
    const changed1 = lines(bareGit(['show', '--name-only', '--format=', 'refs/heads/ci/stability-ledger']).stdout);
    assert(changed1.length === 1 && changed1[0] === 'fear-ai-sim/evidence/probe_stability_ledger.jsonl',
        `the pushed commit changes exactly the ledger (got: ${changed1.join(', ') || 'nothing'})`);
    const b1 = lines(bareGit(['show', 'refs/heads/ci/stability-ledger:fear-ai-sim/evidence/probe_stability_ledger.jsonl']).stdout);
    assert(b1.length === 2 && b1[0].includes(NIGHT_A) && b1[1].includes(NIGHT_B),
        'the branch ledger holds exactly the committed night and tonight');

    console.log('\n--- 2. Next night: the fold accumulates onto the branch ---');
    resetCheckout();
    writeLedger([NIGHT_A, NIGHT_B, NIGHT_C]);
    const s2 = runFold();
    assert(s2.status === 0, `the next night folds (exit 0, got ${s2.status})`);
    assert(s2.output.includes('-NoPullRequest: the branch was pushed and no pull request was opened.'),
        'the second night also ends as a pushed branch with no pull request');
    assert(s2.output.includes('2 -> 3 night(s), 1 added tonight'),
        'the fold tool merges tonight onto the two nights the branch already carried');
    const s2Subject = bareGit(['log', '-1', '--format=%s', 'refs/heads/ci/stability-ledger']).stdout.trim();
    assert(s2Subject === 'ci(stability): fold 2 nightly stability-ledger night(s)',
        `the second commit reports both nights this checkout carries that HEAD does not (got: ${JSON.stringify(s2Subject)})`);
    const b2 = lines(bareGit(['show', 'refs/heads/ci/stability-ledger:fear-ai-sim/evidence/probe_stability_ledger.jsonl']).stdout);
    assert(b2.length === 3 && b2[2].includes(NIGHT_C),
        'the branch ledger now holds three nights');
    assert(b2[0] === b1[0] && b2[1] === b1[1],
        'the pre-existing nights survived the fold byte-for-byte');

    console.log('\n--- 3. The same nights folded twice: the record never inflates ---');
    resetCheckout();
    writeLedger([NIGHT_A, NIGHT_B, NIGHT_C]);
    const s3 = runFold();
    assert(s3.status === 0, `refolding the same nights stops cleanly (exit 0, got ${s3.status})`);
    assert(s3.output.includes('NOTHING WRITTEN — the ledger already holds every night in this artifact.'),
        'the fold tool reports there was nothing new to write');

    console.log('\n--- 3b. A checkout with nothing beyond the default branch: stopped before folding ---');
    resetCheckout();
    writeLedger([NIGHT_A]);
    const s3b = runFold();
    assert(s3b.status === 0, `a checkout with nothing new stops cleanly (exit 0, got ${s3b.status})`);
    assert(s3b.output.includes('The ledger holds no night that HEAD does not already have, so this checkout has nothing new to review.'),
        `the stop says this checkout has nothing new to review (tail: ${lines(s3b.output).slice(-8).join(' | ')})`);

    console.log('\n--- 4. A foreign modified file: refused, and the ledger is not blamed ---');
    resetCheckout();
    writeLedger([NIGHT_A, NIGHT_B]);
    writeFileSync(join(proj, 'README.md'), README + 'modified by the rehearsal\n');
    const s4 = runFold();
    assert(s4.status === 2, `the foreign change is refused (exit 2, got ${s4.status})`);
    const refusal = lines(s4.output).find(line => line.includes('sweep them up'));
    assert(Boolean(refusal) && refusal.includes('README.md'),
        'the refusal names the file it refuses to sweep up');
    assert(Boolean(refusal) && !refusal.includes('probe_stability_ledger'),
        'the refusal does NOT list the ledger itself — the assertion that failed every night of the outage');
    writeFileSync(join(proj, 'README.md'), README);

    console.log('\n--- 5. A rewritten ledger: refused, because a fold appends ---');
    resetCheckout();
    writeLedger([NIGHT_B]);
    const s5 = runFold();
    assert(s5.status === 2, `the rewrite is refused (exit 2, got ${s5.status})`);
    assert(s5.output.includes('removes or alters'),
        'the refusal says the record is append-only');
    writeLedger([NIGHT_A, NIGHT_B, NIGHT_C]);

    console.log(`\nSUCCESS: All ${assertions} night-fold-rehearsal assertions passed.`);
    process.exitCode = 0;
} catch (error) {
    console.error(`FAILED: ${error.message}`);
    console.error(`FAILED after ${assertions} night-fold-rehearsal assertion(s).`);
    process.exitCode = 1;
} finally {
    rmSync(work, { recursive: true, force: true });
}
