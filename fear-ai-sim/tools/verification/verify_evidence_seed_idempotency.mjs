#!/usr/bin/env node
/**
 * tools/verification/verify_evidence_seed_idempotency.mjs — re-seeding the
 * same claim+dimension+fingerprint produces exactly one ledger row.
 *
 * Contracts: EVIDENCE.SEED.IDEMPOTENT (+ EVIDENCE.SEED.TEST_ISOLATION).
 *
 * 1. SEQUENTIAL: a second seed of an already-proven claim is a no-op, not
 *    a duplicate.
 * 2. CONCURRENT (MOVEMENT E2, 2026-10-18): K simultaneous seed processes
 *    racing on the same claim still produce exactly one row — the
 *    read-check-append critical section is serialized under an exclusive
 *    ledger lock — and no lock remnant survives.
 * 3. ISOLATION (MOVEMENT E2): the canonical production ledger CLOSED on
 *    2026-09-06; buildReceipt now refuses to append to it (default path and
 *    explicit path), and a test process is refused even with the
 *    allowClosedLedgerWrite escape hatch. The production ledger must be
 *    byte-identical (sha256) after the probe.
 * 4. RETIREMENT (MOVEMENT E2): the jest-era runTestReceipt helper is
 *    retired — no dead jest path remains in receipt.mjs and the helper
 *    refuses loudly with guidance.
 *
 * Scope note (honesty): the allowClosedLedgerWrite escape hatch is NOT
 * exercised against the production ledger (a probe must not re-open the
 * closed ledger to prove it can). The lock is advisory-by-path and assumes
 * O_EXCL create atomicity on local filesystems (NFS/network shares are not
 * claimed). A crashed writer's lock is taken over after 10s.
 *
 * Isolation: the probe writes ONLY to disposable ledgers under the OS
 * temp directory and asserts the production ledger file is untouched (a
 * probe that mutates the evidence it checks would be the exact defect
 * class the isolation rule exists for).
 *
 * Deterministic, no network, no ports, no test runner.
 */

import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildReceipt, readDomain, runTestReceipt } from '../../evidence/receipt.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

let checks = 0;
function check(condition, what) {
    checks += 1;
    if (!condition) {
        console.error(`\nFAILED check ${checks}: ${what}`);
        process.exit(1);
    }
}

function sha256File(path) {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function expectThrows(fn, pattern, what) {
    try {
        fn();
    } catch (err) {
        check(pattern.test(String(err && err.message)), `${what} (thrown: ${err && err.message})`);
        return;
    }
    check(false, `${what} (no error thrown)`);
}

console.log('============================================================');
console.log('VERIFY EVIDENCE SEED IDEMPOTENCY (claim+dimension+fingerprint => one row)');
console.log('MOVEMENT E2: concurrent race close + production ledger isolation');
console.log('============================================================');

const receiptSource = readFileSync(resolve(repoRoot, 'evidence/receipt.mjs'), 'utf8');
const canonicalLedger = resolve(repoRoot, 'docs/evidence/EVIDENCE_LEDGER.jsonl');
check(existsSync(canonicalLedger), 'production ledger exists (docs/evidence/EVIDENCE_LEDGER.jsonl)');
const canonicalSizeBefore = statSync(canonicalLedger).size;
const canonicalHashBefore = sha256File(canonicalLedger);

// -- Section 0: the jest-era runner is retired (MOVEMENT E2) ---------------
check(!receiptSource.includes('node_modules/jest'),
    'receipt.mjs no longer references the retired jest binary');
expectThrows(() => runTestReceipt('--runInBand tests/canonical-trade-system.test.js', { label: 'retired-check' }),
    /RETIRED/, 'runTestReceipt() refuses with an actionable retirement error');
console.log('  * jest-era runTestReceipt is retired (no dead jest path, loud refusal): PASS');

const disposableLedger = join(tmpdir(), `fear-probe-evid-${process.pid}-${Date.now()}.jsonl`);

// -- Section 1: sequential idempotency -------------------------------------
// A real command receipt proves the row is not a dry-fabricated seed;
// the duplicate guard refuses to let FAILED proofs block or duplicate,
// so the receipt must be ok to exercise the guard.
try {
    const startedAt = Date.now();
    let versionOutput = '';
    let commandExit = 0;
    try {
        versionOutput = execFileSync('node', ['--version'], { cwd: repoRoot, encoding: 'utf8' }).trim();
    } catch {
        commandExit = 1;
    }
    check(commandExit === 0 && /^v\d+/.test(versionOutput),
        `probe command really ran (node --version -> ${JSON.stringify(versionOutput)})`);
    const commandReceipt = {
        command: 'node --version',
        cwd: '.',
        timeoutMs: 60000,
        exitCode: commandExit,
        durationMs: Date.now() - startedAt,
        outputDigest: createHash('sha256').update(versionOutput).digest('hex').slice(0, 16),
        outputSnippet: versionOutput,
        label: 'probe-evidence-seed',
    };

    const seedArgs = {
        claimId: 'PROBE-EVIDENCE-SEED-IDEMPOTENT',
        domain: 'probe',
        dimension: 'idempotency',
        claim: 'Re-seeding the same claim+dimension+fingerprint appends exactly one ledger row.',
        sourceFiles: ['evidence/receipt.mjs'],
        testFiles: [],
        useImportClosure: false,
        commandReceipt,
        assertions: [],
        knownContradictions: [],
        limitations: ['Probe ledger only; the production ledger is asserted untouched.'],
        ledgerPath: disposableLedger,
    };

    buildReceipt(seedArgs);
    const rowsAfterFirst = readFileSync(disposableLedger, 'utf8').trim().split('\n').filter(Boolean);
    check(rowsAfterFirst.length === 1,
        `first seed writes exactly one row (got ${rowsAfterFirst.length})`);

    buildReceipt(seedArgs);
    const rowsAfterSecond = readFileSync(disposableLedger, 'utf8').trim().split('\n').filter(Boolean);
    check(rowsAfterSecond.length === 1,
        `re-seeding the same claim+dimension+fingerprint produces exactly one row (got ${rowsAfterSecond.length})`);

    const parsed = rowsAfterSecond.map(line => JSON.parse(line));
    check(parsed[0].claimId === seedArgs.claimId && parsed[0].dimension === seedArgs.dimension,
        'the surviving row is the expected claim and dimension');
    check(Boolean(parsed[0].sourceState && typeof parsed[0].sourceState.fingerprint === 'string'),
        'the surviving row carries a source fingerprint');

    const readBack = readDomain('probe', { ledgerPath: disposableLedger });
    check(Array.isArray(readBack) && readBack.length === 1,
        `readDomain sees exactly one row for the probe domain (got ${readBack?.length})`);
    console.log('  * sequential re-seed is idempotent (one row after one and after two seeds): PASS');
} finally {
    rmSync(disposableLedger, { force: true });
}

// -- Section 2: concurrent re-seed (MOVEMENT E2) ---------------------------
{
    const K = 4;
    const concurrentLedger = join(tmpdir(), `fear-probe-concurrent-${process.pid}-${Date.now()}.jsonl`);
    const receiptUrl = pathToFileURL(resolve(repoRoot, 'evidence/receipt.mjs')).href;
    const childSource = `
import { buildReceipt } from ${JSON.stringify(receiptUrl)};
buildReceipt({
    claimId: 'PROBE-EVIDENCE-SEED-CONCURRENT',
    domain: 'probe',
    dimension: 'idempotency',
    claim: 'Concurrent re-seeding of the same claim+dimension+fingerprint yields exactly one row.',
    sourceFiles: ['evidence/receipt.mjs'],
    testFiles: [],
    useImportClosure: false,
    commandReceipt: { command: 'node --version', cwd: '.', timeoutMs: 60000, exitCode: 0, durationMs: 1, outputDigest: 'concurrent', outputSnippet: 'concurrent', label: 'concurrent' },
    assertions: [],
    knownContradictions: [],
    limitations: ['Concurrent probe child.'],
    ledgerPath: ${JSON.stringify(concurrentLedger)},
});
`;
    const results = await Promise.all(Array.from({ length: K }, () => new Promise(done => {
        const child = spawn(process.execPath, ['--input-type=module', '-e', childSource], {
            cwd: repoRoot,
            env: process.env,
            stdio: ['ignore', 'ignore', 'pipe'],
        });
        let stderr = '';
        child.stderr.on('data', d => { stderr += String(d); });
        child.on('exit', code => done({ code, stderr }));
        child.on('error', err => done({ code: -1, stderr: String(err) }));
    })));
    const failedChildren = results.filter(r => r.code !== 0);
    check(failedChildren.length === 0,
        `all ${K} concurrent seeds exited 0 (failures: ${failedChildren.map(r => `${r.code}: ${r.stderr.trim().split('\n').slice(-1)[0] || ''}`).join(' | ') || 'none'})`);

    const concurrentRows = existsSync(concurrentLedger)
        ? readFileSync(concurrentLedger, 'utf8').trim().split('\n').filter(Boolean)
        : [];
    check(concurrentRows.length === 1,
        `concurrent seeds produced exactly one row (got ${concurrentRows.length})`);
    check(concurrentRows.every(line => JSON.parse(line).claimId === 'PROBE-EVIDENCE-SEED-CONCURRENT'),
        'the concurrent row is the expected claim');
    check(!existsSync(`${concurrentLedger}.lock`),
        'no lock remnant survives after all concurrent seeds exit');
    rmSync(concurrentLedger, { force: true });
    rmSync(`${concurrentLedger}.lock`, { force: true });
    console.log(`  * ${K} concurrent same-claim seeds -> exactly one row, no lock remnant: PASS`);
}

// -- Section 3: production ledger isolation (MOVEMENT E2) ------------------
{
    const baseArgs = {
        claimId: 'PROBE-EVIDENCE-SEED-CLOSED-LEDGER',
        domain: 'probe',
        dimension: 'isolation',
        claim: 'The canonical evidence ledger is closed; buildReceipt refuses to append to it.',
        sourceFiles: ['evidence/receipt.mjs'],
        testFiles: [],
        useImportClosure: false,
        commandReceipt: null,
        assertions: [],
        knownContradictions: [],
        limitations: [],
    };
    expectThrows(() => buildReceipt({ ...baseArgs }),
        /CLOSED/, 'default buildReceipt (implicit canonical path) is refused');
    expectThrows(() => buildReceipt({ ...baseArgs, ledgerPath: canonicalLedger }),
        /CLOSED/, 'explicit canonical ledgerPath is refused');

    const testEnvVerdict = execFileSync(process.execPath, ['--input-type=module', '-e', `
import { buildReceipt } from ${JSON.stringify(pathToFileURL(resolve(repoRoot, 'evidence/receipt.mjs')).href)};
try {
    buildReceipt({
        claimId: 'PROBE-EVIDENCE-SEED-TEST-ENV',
        domain: 'probe',
        dimension: 'isolation',
        claim: 'A test process cannot re-open the closed canonical ledger.',
        sourceFiles: ['evidence/receipt.mjs'],
        testFiles: [],
        useImportClosure: false,
        commandReceipt: null,
        assertions: [],
        knownContradictions: [],
        limitations: [],
        ledgerPath: ${JSON.stringify(canonicalLedger)},
        allowClosedLedgerWrite: true,
    });
    console.log('WROTE');
} catch (err) {
    console.log(String(err && err.message).includes('CLOSED') ? 'REFUSED' : 'WRONG-ERROR: ' + err.message);
}
`], { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, NODE_ENV: 'test' } }).trim();
    check(testEnvVerdict === 'REFUSED',
        `a NODE_ENV=test process is refused the canonical ledger even with allowClosedLedgerWrite (saw ${JSON.stringify(testEnvVerdict)})`);
    console.log('  * closed-ledger gate refuses default, explicit, and test-process writes: PASS');
}

const canonicalSizeAfter = statSync(canonicalLedger).size;
const canonicalHashAfter = sha256File(canonicalLedger);
check(canonicalHashAfter === canonicalHashBefore,
    `production ledger is byte-identical (sha256) after the probe (${canonicalHashBefore} -> ${canonicalHashAfter})`);
check(canonicalSizeAfter === canonicalSizeBefore,
    `production ledger size unchanged (${canonicalSizeBefore} -> ${canonicalSizeAfter} bytes)`);
console.log('  * production ledger isolation: sha256 unchanged across the probe: PASS');

console.log('');
console.log(`All ${checks} evidence-seed idempotency assertions PASSED.`);
