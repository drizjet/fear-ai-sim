#!/usr/bin/env node
/**
 * tools/ci/audit_pr_ci_coverage.mjs — which open pull requests have NO checks.
 *
 * This is a manual-audit step, not a CI gate, and it is deliberately not a probe:
 * it needs `gh`, a network and credentials, and its answer changes when somebody
 * else opens a pull request. A gate that fails because of another person's pull
 * request is a gate people learn to ignore.
 *
 * It exists because there is a class of CI defect **no file-reading check can see**.
 * The integrity gate asserts the *workflow* is not narrowed — see
 * `every-pull-request-gets-a-run` — and that closes the case the repository actually
 * hit, where `.github/workflows/test.yml` declared `pull_request: branches: [main,
 * master]`, a filter matched against a pull request's BASE branch, so a pull request
 * opened against another branch received no jobs at all: no failure, no skip, no
 * check run, and a page indistinguishable from one whose checks are still queueing.
 * It was found by opening a stacked pull request and noticing the absence.
 *
 * No gate can close the rest of that class, because the rest is remote state:
 * Actions disabled on the repository, a workflow GitHub refuses to parse, a branch
 * protection rule that replaced the checks, a required check that no longer exists.
 * Every one of them reads exactly like "checks are slow" from the outside. So this
 * asks the only question that can distinguish them — does each OPEN pull request
 * have at least one check run? — and refuses to report a pass when it cannot tell.
 *
 *   npm run audit:pr-ci-coverage            # human-readable
 *   npm run audit:pr-ci-coverage -- --json  # machine-readable
 *
 * Exit codes: 0 every open pull request has checks; 1 at least one has none;
 * 2 the audit could not be performed (no `gh`, no auth, no network) — never 0,
 * because "I could not check" is not "nothing is wrong".
 */

import { spawnSync } from 'node:child_process';

const JSON_OUT = process.argv.includes('--json');
const GH_FIELDS = 'number,title,baseRefName,headRefName,url,isDraft,statusCheckRollup';

function gh(args) {
    const result = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (result.error) return { ok: false, reason: result.error.message };
    if (result.status !== 0) {
        return { ok: false, reason: (result.stderr || result.stdout || `gh exited ${result.status}`).trim() };
    }
    return { ok: true, stdout: result.stdout };
}

const listed = gh(['pr', 'list', '--state', 'open', '--limit', '200', '--json', GH_FIELDS]);
if (!listed.ok) {
    const report = {
        audited: false,
        reason: listed.reason,
        // Stated as a result rather than a caveat: an unauditable repository is the
        // same blind spot the trigger filter created, so it must not exit 0.
        verdict: 'NOT PROVEN — no open pull request was examined'
    };
    if (JSON_OUT) console.log(JSON.stringify(report, null, 2));
    else {
        console.log('============================================================');
        console.log('PR CI COVERAGE AUDIT');
        console.log('============================================================');
        console.log(`  could not run: ${listed.reason}`);
        console.log('');
        console.log('  NOT PROVEN — no open pull request was examined. A pull request with');
        console.log('  no checks and a repository that cannot be audited look identical from');
        console.log('  here, so this exits non-zero rather than reporting a clean result.');
    }
    process.exit(2);
}

let pullRequests;
try {
    pullRequests = JSON.parse(listed.stdout);
} catch (error) {
    console.log(`gh returned output that is not JSON: ${error.message}`);
    process.exit(2);
}

const defaultBranch = (() => {
    const result = gh(['repo', 'view', '--json', 'defaultBranchRef']);
    if (!result.ok) return null;
    try {
        return JSON.parse(result.stdout).defaultBranchRef?.name ?? null;
    } catch {
        return null;
    }
})();

const rows = pullRequests.map(pr => {
    const checks = Array.isArray(pr.statusCheckRollup) ? pr.statusCheckRollup : [];
    return {
        number: pr.number,
        base: pr.baseRefName,
        head: pr.headRefName,
        title: pr.title,
        url: pr.url,
        draft: pr.isDraft === true,
        checkRuns: checks.length,
        // A pull request based on anything other than the default branch is the shape
        // the trigger filter silently starved, so it is called out rather than counted.
        offDefaultBase: defaultBranch !== null && pr.baseRefName !== defaultBranch
    };
});

const uncovered = rows.filter(row => row.checkRuns === 0);
const offDefault = rows.filter(row => row.offDefaultBase);

if (JSON_OUT) {
    console.log(JSON.stringify({
        audited: true,
        defaultBranch,
        openPullRequests: rows.length,
        uncovered: uncovered.map(row => row.number),
        offDefaultBase: offDefault.map(row => row.number),
        verdict: uncovered.length === 0
            ? `every open pull request has at least one check run (${rows.length} examined)`
            : `${uncovered.length} open pull request(s) have NO check runs`,
        pullRequests: rows
    }, null, 2));
} else {
    console.log('============================================================');
    console.log('PR CI COVERAGE AUDIT — does every open pull request have checks?');
    console.log('============================================================');
    console.log(`  repository default branch: ${defaultBranch ?? '<unknown>'}`);
    console.log(`  open pull requests:        ${rows.length}`);
    for (const row of rows) {
        const flags = [
            row.checkRuns === 0 ? 'NO CHECKS' : `${row.checkRuns} check(s)`,
            row.offDefaultBase ? `base ${row.base} (not the default branch)` : null,
            row.draft ? 'draft' : null
        ].filter(Boolean).join(', ');
        console.log(`    #${String(row.number).padEnd(4)} ${flags}`);
        console.log(`          ${row.title}`);
    }
    console.log('');
    if (uncovered.length === 0) {
        console.log('  OK — every open pull request has at least one check run.');
    } else {
        console.log(`  FINDINGS — ${uncovered.length} open pull request(s) have no check run at all,`);
        console.log('  which is the state the trigger filter produced silently:');
        for (const row of uncovered) {
            console.log(`    #${row.number} base=${row.base} ${row.url}`);
        }
    }
    console.log('');
    console.log('  Scope: this asks only whether checks exist. It does not read their verdicts,');
    console.log('  so "has a run" is not "has a passing run" — the run itself is what says that.');
}

process.exit(uncovered.length === 0 ? 0 : 1);
