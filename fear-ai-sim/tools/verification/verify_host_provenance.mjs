#!/usr/bin/env node

/**
 * Pixel Pets host provenance probe.
 *
 * This is a standalone read-only source/provenance probe, not a test-runner
 * suite and not host certification. It re-derives both the historical split
 * and its resolution:
 *
 *   - Historically, the codex lineage's named evidence commit `f3f5e8d25`
 *     declared `pub(crate) mod persistence_restore;` in
 *     `pixel-pets/src/overlay/mod.rs` but committed no such module; the module
 *     was committed only on the separate `reconcile/dirty-canonical-2026-09-16`
 *     lineage, which lacked the formation-geometry safeguard. No single tree
 *     could build the diagnostic.
 *   - Resolved: that one missing file was landed as host commit
 *     `6867da9f4` on `codex/canonical-consolidation-2026-08-12`, which already
 *     carried the formation-geometry safeguard and every call site. A clean
 *     checkout of that commit now builds and passes the diagnostic.
 *
 * The probe is read-only against the sibling host repository. When the host
 * repo (or git) is unavailable it records a skip rather than failing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const HOST_REPO = process.env.FEAR_AI_HOST_REPO
    || 'C:\\tools\\03-Projects\\lains Tools\\New Master Game';
const EVIDENCE_COMMIT = 'f3f5e8d25';
const LANDING_COMMIT = '6867da9f4';
const CODEX_BRANCH = 'codex/canonical-consolidation-2026-08-12';
const RECONCILE_BRANCH = 'reconcile/dirty-canonical-2026-09-16';
const PERSISTENCE_MODULE = 'pixel-pets/src/overlay/persistence_restore.rs';
const OVERLAY_MODULE = 'pixel-pets/src/overlay/mod.rs';
const GEOMETRY_MODULE = 'pixel-pets/src/engine/formation_geometry.rs';
const PATCH_PATH = 'evidence/host_union_change_2026-09-20.patch';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function git(args) {
    return execFileSync('git', ['-C', HOST_REPO, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });
}

function gitQuiet(args) {
    try {
        return git(args).trim();
    } catch {
        return null;
    }
}

/** True when a path exists in a given git revision (tree object). */
function pathInRevision(revision, relativePath) {
    try {
        execFileSync('git', ['-C', HOST_REPO, 'cat-file', '-e', `${revision}:${relativePath}`], {
            stdio: 'ignore'
        });
        return true;
    } catch {
        return false;
    }
}

/** Normalize `git branch --contains` output to short branch names. */
function branchesContaining(revision) {
    const output = gitQuiet(['branch', '-a', '--contains', revision]) ?? '';
    const names = output
        .split('\n')
        .map((line) => line.replace(/^\*?\s+/, '').trim())
        .filter((line) => line.length > 0)
        .map((line) => line.replace(/^remotes\/origin\//, ''))
        .map((line) => (line === 'HEAD' ? '(detached HEAD)' : line));
    return [...new Set(names)];
}

console.log('============================================================');
console.log('VERIFY PIXEL PETS HOST PROVENANCE RECONCILIATION');
console.log('============================================================');
console.log(`Host repository: ${HOST_REPO}`);

const hostIsGitRepo = fs.existsSync(HOST_REPO)
    && gitQuiet(['rev-parse', '--git-dir']) !== null;

if (!hostIsGitRepo) {
    console.log('\n  * Host repository is not an available git checkout here.');
    console.log('    The host provenance claims stay recorded rather than re-derived in this environment.');
    console.log('\nScope: provenance probe skipped; no host certification is claimed or implied.');
    console.log('\nSUCCESS: Host provenance probe recorded (checkout unavailable).');
    process.exit(0);
}

// --- 1. Historical split: the named evidence commit could not build alone.
assert(pathInRevision(EVIDENCE_COMMIT, OVERLAY_MODULE), `Named evidence commit ${EVIDENCE_COMMIT} is missing ${OVERLAY_MODULE}.`);
assert(pathInRevision(EVIDENCE_COMMIT, GEOMETRY_MODULE), `Named evidence commit ${EVIDENCE_COMMIT} is missing the formation-geometry fix.`);
assert(
    !pathInRevision(EVIDENCE_COMMIT, PERSISTENCE_MODULE),
    `Named evidence commit ${EVIDENCE_COMMIT} unexpectedly contains ${PERSISTENCE_MODULE}.`
);
const overlaySource = git(['show', `${EVIDENCE_COMMIT}:${OVERLAY_MODULE}`]);
assert(
    /mod persistence_restore;/.test(overlaySource),
    `${EVIDENCE_COMMIT}:${OVERLAY_MODULE} no longer declares mod persistence_restore.`
);
console.log(`  * ${EVIDENCE_COMMIT} carries the formation-geometry fix, declares mod persistence_restore, and lacks the module file: PASS`);

// --- 2. Provenance origin: the module was committed on the reconcile lineage.
const moduleCommits = (gitQuiet(['log', '--all', '--format=%H', '--', PERSISTENCE_MODULE]) ?? '')
    .split('\n')
    .filter((line) => line.length > 0);
assert(
    moduleCommits.length > 0,
    `${PERSISTENCE_MODULE} is not committed on any ref; the reconciliation record must be revisited.`
);
const moduleIntro = moduleCommits[moduleCommits.length - 1];
const moduleIntroBranches = branchesContaining(moduleIntro);
assert(
    moduleIntroBranches.includes(RECONCILE_BRANCH),
    `${PERSISTENCE_MODULE} introduction is no longer reachable from ${RECONCILE_BRANCH}.`
);
console.log(`  * ${PERSISTENCE_MODULE} was introduced on ${RECONCILE_BRANCH}: PASS`);

// --- 3. Resolution landed: the codex branch now carries both halves.
assert(
    pathInRevision(LANDING_COMMIT, PERSISTENCE_MODULE),
    `Landing commit ${LANDING_COMMIT} does not contain the persistence module.`
);
assert(
    pathInRevision(LANDING_COMMIT, GEOMETRY_MODULE),
    `Landing commit ${LANDING_COMMIT} does not contain the formation-geometry safeguard.`
);
assert(
    gitQuiet(['merge-base', '--is-ancestor', LANDING_COMMIT, CODEX_BRANCH]) !== null,
    `Landing commit ${LANDING_COMMIT} is not an ancestor of ${CODEX_BRANCH}.`
);
assert(
    pathInRevision(CODEX_BRANCH, PERSISTENCE_MODULE) && pathInRevision(CODEX_BRANCH, GEOMETRY_MODULE),
    `${CODEX_BRANCH} does not contain both the persistence module and the formation-geometry safeguard.`
);
const landingStat = (gitQuiet(['show', '--numstat', '--format=', LANDING_COMMIT]) ?? '')
    .split('\n')
    .filter((line) => line.trim().length > 0);
assert(
    landingStat.length === 1 && /^107\t0\tpixel-pets\/src\/overlay\/persistence_restore\.rs$/.test(landingStat[0]),
    `Landing commit ${LANDING_COMMIT} no longer adds exactly the 107-line module file (got: ${landingStat.join(' | ')}).`
);
console.log(`  * ${LANDING_COMMIT} lands the one missing module on ${CODEX_BRANCH}, which now carries both halves: PASS`);

// --- 4. The patch artifact matches the committed module byte-for-byte.
const patchSource = read(PATCH_PATH);
assert(
    patchSource.includes('+++ b/pixel-pets/src/overlay/persistence_restore.rs'),
    `${PATCH_PATH} does not add the persistence module at the expected path.`
);
assert(
    patchSource.includes('new file mode'),
    `${PATCH_PATH} is no longer a new-file patch.`
);
const patchBody = patchSource
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n');
const committedBody = `${git(['show', `${LANDING_COMMIT}:${PERSISTENCE_MODULE}`])}`.replace(/\n$/, '');
assert(
    patchBody === committedBody,
    `${PATCH_PATH} no longer matches the committed module body; the reviewed union patch has drifted.`
);
console.log(`  * Prepared union patch still matches the module committed at ${LANDING_COMMIT}: PASS`);

// --- 5. The JavaScript side records the resolution and stays bounded.
const ledger = read('docs/CURRENT_TRUTH_LEDGER.md');
assert(
    ledger.includes('`VERIFIED_CURRENT` (`HOST_DIAGNOSTIC_CLEAN_COMMIT`)'),
    'The ledger no longer records the promoted host status.'
);
assert(
    ledger.includes(LANDING_COMMIT),
    `The ledger no longer records the landed host commit ${LANDING_COMMIT}.`
);
assert(
    /no universal host-game, multi-engine, Unity\/Unreal, or per-connection-ownership claim/.test(ledger),
    'The ledger no longer bounds the host row to diagnostic scope.'
);
const cleanRecord = read('evidence/host_clean_commit_reproduction_2026-09-20.md');
assert(
    cleanRecord.includes('CLEAN_SINGLE_COMMIT_REPRODUCED') && cleanRecord.includes(LANDING_COMMIT),
    'The clean-commit reproduction record is missing or no longer states its status/commit.'
);
console.log('  * Ledger records the promotion and the clean-commit evidence record is present: PASS');

console.log('\nScope: this probe re-derives the host provenance finding and its resolution only.');
console.log('It does not build, run, or certify the Pixel Pets host diagnostic, and it does');
console.log('not modify the sibling checkout.');
console.log('\nSUCCESS: Host provenance root cause and resolution re-derived.');
