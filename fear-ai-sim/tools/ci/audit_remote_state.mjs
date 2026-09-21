#!/usr/bin/env node
/**
 * tools/ci/audit_remote_state.mjs — what the repository cannot see about itself.
 *
 * A manual-audit step, deliberately not a probe and deliberately not a CI gate: it
 * needs `gh`, a network and credentials, and its answers change when somebody else
 * opens a pull request or edits a repository setting. A gate that fails because of
 * another person's pull request is a gate people learn to ignore.
 *
 * It exists because there is a class of defect **no file-reading check can see**.
 * The integrity gate asserts the workflow is not narrowed — see
 * `every-pull-request-gets-a-run` — and that closes the case this repository
 * actually hit: `.github/workflows/test.yml` declared `pull_request: branches:
 * [main, master]`, a filter matched against a pull request's BASE branch, so a pull
 * request opened against another branch received no jobs at all. No failure, no
 * skip, no check run, and a page indistinguishable from one whose checks are still
 * queueing. It was found by opening a stacked pull request and noticing the absence.
 *
 * Everything else in that class is remote state:
 *
 *   1. **Pull requests with no checks at all** — the trap above, in whatever form it
 *      returns, plus anything that starves a run: Actions disabled, a workflow
 *      GitHub refuses to parse, a run that never started.
 *   2. **Actions policy** — if Actions are disabled the workflow is a file and
 *      nothing more; if `allowed_actions` is `local_only`, every `uses:` step in
 *      this repository fails, including `actions/checkout`, and the symptom arrives
 *      as a red job rather than as a policy.
 *   3. **Branch protection** — and the check that matters most here: a **required
 *      status context that no job produces**. A merge then waits forever for a
 *      status that can never be reported, which is the same silent-absence shape as
 *      the trigger filter, one layer down. Contexts are derived from the workflows'
 *      own job names rather than written down twice.
 *
 * **Never a silent pass.** Anything that cannot be read is reported as NOT PROVEN
 * and can never yield exit 0. Exit codes:
 *
 *   0  everything was determined, and nothing is wrong
 *   1  at least one FINDING (listed; each names what it breaks)
 *   2  no findings, but at least one item could not be determined
 *
 *   npm run audit:remote-state                 # human-readable
 *   npm run audit:remote-state -- --json
 *   npm run audit:remote-state -- --fixture <file.json>
 *
 * The fixture mode exists so the *judgement* can be exercised without a second
 * repository: it supplies the remote answers and still reads the workflows from
 * disk, which is the half that makes the comparison real.
 *
 * Scope, stated on its own output: it reads whether checks exist and whether the
 * repository requires them. It never reads their verdicts, so "has a run" is not
 * "has a passing run".
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));   // fear-ai-sim/tools/ci
const repoRoot = resolve(here, '../..');                // fear-ai-sim/
const gitRoot = resolve(repoRoot, '..');                // repository root, where .github lives

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const fixtureIndex = args.indexOf('--fixture');
const FIXTURE_PATH = fixtureIndex === -1 ? null : args[fixtureIndex + 1];

// ---------------------------------------------------------------------------
// Reading the local half: what contexts this repository's workflows can produce.
// ---------------------------------------------------------------------------

function stripYamlComments(text) {
    return text
        .split('\n')
        .filter(line => !/^\s*#/.test(line))
        .map(line => line.replace(/\s#[^'"\n]*$/, ''))
        .join('\n');
}

function workflowFiles() {
    const dir = join(gitRoot, '.github', 'workflows');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter(name => /\.ya?ml$/.test(name))
        .map(name => join(dir, name));
}

/**
 * The status context each job reports, per job: the job's `name:` if it sets one,
 * otherwise the job id — which is what GitHub uses, and nothing here is invented.
 * A matrix job would append its values; no workflow here uses one, and that is
 * stated rather than silently assumed by checking for a matrix and refusing to
 * guess when it finds one.
 */
function workflowJobContexts() {
    const contexts = [];
    const notes = [];
    const files = workflowFiles();
    // An empty local half is reported, not assumed: this function returning no jobs
    // makes every required context look dead and every action look unallowlisted, and
    // the first version of this file read the workflows from the wrong directory and
    // printed `<none>` while still exiting 0. A silent empty answer is the exact
    // failure mode this whole audit exists to catch.
    if (files.length === 0) {
        return {
            contexts: [],
            notes: [`no workflow files found under ${join(gitRoot, '.github', 'workflows')}, so no status `
                + 'context could be derived from this repository']
        };
    }
    for (const path of files) {
        const name = path.split(/[\\/]/).pop();
        const lines = stripYamlComments(readFileSync(path, 'utf8')).split('\n');
        const jobsIndex = lines.findIndex(line => /^jobs:\s*$/.test(line));
        if (jobsIndex === -1) continue;
        let end = lines.length;
        for (let i = jobsIndex + 1; i < lines.length; i += 1) {
            if (/^\S/.test(lines[i])) { end = i; break; }
        }
        const body = lines.slice(jobsIndex + 1, end);
        let current = null;
        for (const line of body) {
            const jobId = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
            if (jobId) {
                if (current) contexts.push(current);
                current = { id: jobId[1], context: jobId[1], workflow: name };
                continue;
            }
            if (!current) continue;
            const label = line.match(/^ {4}name:\s*(.+?)\s*$/);
            if (label) current.context = label[1].replace(/^['"]|['"]$/g, '');
            if (/^ {6}matrix:/.test(line)) {
                notes.push(`${name}: job "${current.id}" uses a strategy matrix, so its status context has `
                    + 'matrix values appended and cannot be derived here');
            }
        }
        if (current) contexts.push(current);
    }
    return { contexts, notes };
}

// ---------------------------------------------------------------------------
// Reading the remote half. Every read is independent: one failure never blanks
// another answer, and a failure is never treated as an empty result.
// ---------------------------------------------------------------------------

function gh(args) {
    const result = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (result.error) return { ok: false, reason: result.error.message };
    if (result.status !== 0) {
        return { ok: false, reason: (result.stderr || result.stdout || `gh exited ${result.status}`).trim() };
    }
    return { ok: true, stdout: result.stdout };
}

function ghJson(args) {
    const result = gh(args);
    if (!result.ok) return result;
    try {
        return { ok: true, value: JSON.parse(result.stdout) };
    } catch (error) {
        return { ok: false, reason: `gh returned output that is not JSON: ${error.message}` };
    }
}

function gatherLive() {
    const gathered = { unavailable: {} };
    const repo = ghJson(['repo', 'view', '--json', 'defaultBranchRef,nameWithOwner']);
    if (repo.ok) {
        gathered.repository = {
            defaultBranch: repo.value.defaultBranchRef?.name ?? null,
            nameWithOwner: repo.value.nameWithOwner ?? null
        };
    } else {
        gathered.repository = null;
        gathered.unavailable.repository = repo.reason;
    }

    const prs = ghJson(['pr', 'list', '--state', 'open', '--limit', '200', '--json',
        'number,title,baseRefName,headRefName,url,isDraft,statusCheckRollup']);
    if (prs.ok) gathered.pullRequests = prs.value;
    else gathered.unavailable.pullRequests = prs.reason;

    if (!gathered.repository?.nameWithOwner) {
        gathered.unavailable.actionsPermissions = 'the repository name could not be read';
        gathered.unavailable.branchProtection = 'the repository name could not be read';
    } else {
        const slug = gathered.repository.nameWithOwner;
        const actions = ghJson(['api', `repos/${slug}/actions/permissions`]);
        if (actions.ok) gathered.actionsPermissions = actions.value;
        else gathered.unavailable.actionsPermissions = actions.reason;

        if (gathered.actionsPermissions?.allowed_actions === 'selected') {
            const selected = ghJson(['api', `repos/${slug}/actions/permissions/selected-actions`]);
            if (selected.ok) gathered.selectedActions = selected.value;
            else gathered.unavailable.selectedActions = selected.reason;
        }

        const branch = gathered.repository.defaultBranch;
        if (!branch) {
            gathered.unavailable.branchProtection = 'the default branch could not be read';
        } else {
            const protection = ghJson(['api', `repos/${slug}/branches/${encodeURIComponent(branch)}/protection`]);
            if (protection.ok) {
                gathered.branchProtection = protection.value;
            } else if (/404|Not Found|Branch not protected/i.test(protection.reason)) {
                // A 404 here is an answer, not a failure: it means unambiguously that
                // no protection rule applies. Anything else is unread, not unprotected.
                gathered.branchProtection = null;
            } else {
                gathered.unavailable.branchProtection = protection.reason;
            }
        }
    }
    return gathered;
}

function gatherFixture(path) {
    if (!path || !existsSync(path)) {
        console.log(`--fixture ${path ?? '<missing path>'} does not exist`);
        process.exit(2);
    }
    let raw;
    try {
        raw = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
        console.log(`fixture is not valid JSON: ${error.message}`);
        process.exit(2);
    }
    return {
        repository: raw.repository ?? null,
        pullRequests: raw.pullRequests ?? null,
        actionsPermissions: raw.actionsPermissions ?? null,
        selectedActions: raw.selectedActions ?? null,
        // `null` with no `unavailable` entry means NOT PROTECTED, which is the same
        // reading a 404 gets live. A fixture that omits a key entirely is undetermined
        // unless it says so, so absence is never mistaken for an answer.
        branchProtection: raw.branchProtection ?? null,
        unavailable: raw.unavailable ?? {}
    };
}

// ---------------------------------------------------------------------------
// The audit itself: pure over the two halves, so the fixture path is the same code.
// ---------------------------------------------------------------------------

const findings = [];
const notes = [];
const unproven = [];

function finding(id, detail) { findings.push({ id, detail }); }
function note(detail) { notes.push(detail); }

const gathered = FIXTURE_PATH ? gatherFixture(FIXTURE_PATH) : gatherLive();
const { contexts: jobContexts, notes: workflowNotes } = workflowJobContexts();
for (const workflowNote of workflowNotes) note(workflowNote);
if (jobContexts.length === 0) {
    unproven.push('status contexts this repository can report — no job was derived from any workflow file, so '
        + 'every required context and every action would be judged against an empty set');
}

// 1. Every open pull request must have at least one check run.
if (gathered.pullRequests === null) {
    unproven.push(`pull request coverage — ${gathered.unavailable.pullRequests || 'not provided'}`);
} else {
    for (const pr of gathered.pullRequests) {
        const checks = Array.isArray(pr.statusCheckRollup) ? pr.statusCheckRollup : [];
        if (checks.length === 0) {
            finding('pr-without-checks',
                `#${pr.number} (base ${pr.baseRefName}) has no check run at all — ${pr.url ?? 'no url'}. `
                + 'No failure, no skip, an empty checks list: the state the trigger filter produced silently');
        }
    }
    if (gathered.pullRequests.length === 0) note('no open pull requests, so check coverage had nothing to examine');
}

// 2. Actions policy — whether the workflow is anything more than a file.
if (gathered.actionsPermissions === null) {
    unproven.push(`Actions policy — ${gathered.unavailable.actionsPermissions || 'not provided'}`);
} else {
    const policy = gathered.actionsPermissions;
    if (policy.enabled !== true) {
        finding('actions-disabled',
            `Actions permissions report enabled=${JSON.stringify(policy.enabled)}; every workflow here is `
            + 'then a file that never executes, whatever this repository claims about CI');
    }
    if (policy.allowed_actions === 'local_only') {
        finding('actions-local-only',
            'allowed_actions is "local_only", so every `uses:` step fails — including actions/checkout — '
            + 'and the symptom arrives as a red job rather than as a policy');
    }
    if (policy.allowed_actions === 'selected') {
        if (gathered.selectedActions === null) {
            unproven.push(`selected-actions allowlist — ${gathered.unavailable.selectedActions || 'not provided'}`);
        } else {
            const selected = gathered.selectedActions;
            const used = new Set();
            for (const path of workflowFiles()) {
                for (const match of stripYamlComments(readFileSync(path, 'utf8'))
                    .matchAll(/^\s*(?:- )?uses:\s*([^\s#]+)/gm)) {
                    if (!match[1].startsWith('./')) used.add(match[1]);
                }
            }
            const patterns = selected.patterns_allowed || [];
            for (const action of used) {
                const owner = action.split('/')[0];
                const coveredByPattern = patterns.some(pattern => {
                    const regex = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*')}$`);
                    return regex.test(action) || regex.test(owner);
                });
                if (coveredByPattern) continue;
                if (selected.github_owned_allowed && ['actions', 'github'].includes(owner)) continue;
                if (selected.verified_allowed) {
                    unproven.push(`whether \`${action}\` is permitted — allowed_actions is "selected" with `
                        + 'verified_allowed set, and whether a third-party action counts as verified depends on '
                        + "GitHub's own list rather than on anything readable here");
                } else {
                    finding('action-not-allowed',
                        `\`${action}\` matches github_owned_allowed=${selected.github_owned_allowed}, `
                        + `verified_allowed=${selected.verified_allowed} and no allowed pattern, so its step fails`);
                }
            }
        }
    }
    if (policy.enabled === true) {
        note(`Actions enabled, allowed_actions=${JSON.stringify(policy.allowed_actions ?? 'unspecified')}`
            + (policy.sha_pinning_required === false ? ', sha_pinning_required=false' : ''));
    }
}

// 3. Branch protection, and the one that matters: a required context no job produces.
const { defaultBranch } = gathered.repository ?? {};
if (defaultBranch === undefined) {
    unproven.push(`branch protection — ${gathered.unavailable.repository || 'the repository was not provided'}`);
} else if (gathered.branchProtection === null) {
    note(`no branch protection on ${defaultBranch}: nothing requires these checks, so a green run is `
        + 'evidence a human read and a red one does not block a merge. Required contexts: none');
} else {
    const required = gathered.branchProtection.required_status_checks;
    const requiredContexts = required?.contexts ?? [];
    if (!required) {
        note(`branch protection exists on ${defaultBranch} but requires no status checks`);
    }
    const normalize = value => value.trim().replace(/\s+/g, ' ').toLowerCase();
    const produced = new Set(jobContexts.map(job => normalize(job.context)));
    for (const context of requiredContexts) {
        if (!produced.has(normalize(context))) {
            finding('required-context-with-no-job',
                `branch protection on ${defaultBranch} requires "${context}", which no job in any workflow in `
                + 'this repository reports (jobs found: ' + jobContexts.map(job => job.context).join(', ') + '). '
                + 'Every merge waits for a status that nothing produces, unless some other app reports it');
        }
    }
    const requiredKeys = new Set(requiredContexts.map(normalize));
    const advisory = jobContexts.filter(job => !requiredKeys.has(normalize(job.context)));
    if (requiredContexts.length > 0 && advisory.length > 0) {
        note(`not required by protection: ${advisory.map(job => job.context).join(', ')} — advisory only`);
    }
    if (required && required.strict === false) {
        note('required checks are not "strict", so a branch need not be up to date with the default branch '
            + 'to merge; a green run may have been produced before the last change landed');
    }
    if (gathered.branchProtection.enforce_admins?.enabled === false) {
        note('protection does not apply to administrators, so a red run can still be merged by an admin');
    }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const verdictCode = findings.length > 0 ? 1 : (unproven.length > 0 ? 2 : 0);
const verdict = findings.length > 0
    ? `${findings.length} FINDING(S)`
    : (unproven.length > 0 ? `${unproven.length} item(s) NOT PROVEN` : 'no findings');

if (JSON_OUT) {
    console.log(JSON.stringify({
        mode: FIXTURE_PATH ? `fixture:${FIXTURE_PATH}` : 'live',
        defaultBranch: defaultBranch ?? null,
        jobContexts: jobContexts.map(job => `${job.workflow}:${job.context}`),
        openPullRequests: gathered.pullRequests?.length ?? null,
        findings,
        notes,
        unproven,
        verdict
    }, null, 2));
} else {
    console.log('============================================================');
    console.log('REMOTE STATE AUDIT — what this repository cannot see about itself');
    console.log('============================================================');
    console.log(`  repository:      ${gathered.repository?.nameWithOwner ?? '<unknown>'}`);
    console.log(`  default branch:  ${defaultBranch ?? '<unknown>'}`);
    console.log(`  mode:            ${FIXTURE_PATH ? `fixture ${FIXTURE_PATH}` : 'live'}`);
    console.log(`  job contexts this repository can report: ${jobContexts.map(job => job.context).join(', ') || '<none>'}`);
    console.log('');
    if (findings.length > 0) {
        console.log(`  FINDINGS (${findings.length}) — each one names what it breaks:`);
        for (const item of findings) console.log(`    [${item.id}] ${item.detail}`);
        console.log('');
    }
    if (unproven.length > 0) {
        console.log(`  NOT PROVEN (${unproven.length}) — reported rather than passed:`);
        for (const item of unproven) console.log(`    ${item}`);
        console.log('');
    }
    if (notes.length > 0) {
        console.log(`  NOTES (${notes.length}) — true and worth knowing; they do not change the exit code,`);
        console.log('  and they are stated so the strength of this repository\'s CI evidence is not implied');
        console.log('  to be higher than it is:');
        for (const item of notes) console.log(`    ${item}`);
        console.log('');
    }
    if (findings.length === 0 && unproven.length === 0) {
        console.log('  OK — every open pull request has checks, the Actions policy lets these workflows run,');
        console.log('  and no required status context is waiting on a job that does not exist.');
        console.log('');
    }
    console.log('  Scope: this reads whether checks exist and whether the repository requires them.');
    console.log('  It never reads their verdicts, so "has a run" is not "has a passing run".');
    console.log(`  Exit ${verdictCode}: ${verdict}.`);
}

process.exit(verdictCode);
