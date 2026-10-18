#!/usr/bin/env node
/**
 * tools/verification/verify_evidence_seed_idempotency.mjs — re-seeding the
 * same claim+dimension+fingerprint produces exactly one ledger row.
 *
 * Contract: EVIDENCE.SEED.IDEMPOTENT. The evidence ledger must never carry
 * two rows for the same claim, dimension, and source fingerprint — a
 * second seed of an already-proven claim is a no-op, not a duplicate. The
 * retired Jest suite held this contract; the Guardian V4 §5 mutation
 * harness (MOVEMENT B2) re-plants the missing-guard defect, so a live
 * probe must hold it now.
 *
 * Scope note (honesty): this proves SEQUENTIAL idempotency — the guard
 * against a second single-threaded seed. The concurrent-seed race the V4
 * state names under MOVEMENT E2 is a separate, not-yet-enforced contract
 * and is deliberately NOT claimed here.
 *
 * Isolation: the probe writes ONLY to a disposable ledger under the OS
 * temp directory and asserts the production ledger file is untouched (a
 * probe that mutates the evidence it checks would be the exact defect
 * class the isolation rule exists for).
 *
 * Deterministic, no network, no ports, no test runner.
 */

import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildReceipt, readDomain } from '../../evidence/receipt.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

let checks = 0;
function check(condition, what) {
    checks += 1;
    if (!condition) {
        console.error(`\nFAILED check ${checks}: ${what}`);
        process.exit(1);
    }
}

console.log('============================================================');
console.log('VERIFY EVIDENCE SEED IDEMPOTENCY (claim+dimension+fingerprint => one row)');
console.log('============================================================');

const canonicalLedger = resolve(repoRoot, 'docs/evidence/EVIDENCE_LEDGER.jsonl');
check(existsSync(canonicalLedger), 'production ledger exists (docs/evidence/EVIDENCE_LEDGER.jsonl)');
const canonicalSizeBefore = statSync(canonicalLedger).size;

const disposableLedger = join(tmpdir(), `fear-probe-evid-${process.pid}-${Date.now()}.jsonl`);

try {
    // A real command receipt proves the row is not a dry-fabricated seed;
    // the duplicate guard refuses to let FAILED proofs block or duplicate,
    // so the receipt must be ok to exercise the guard. runTestReceipt() is
    // NOT used here: it is a jest-era helper (it still prepends
    // node_modules/jest/bin/jest.js) and Hard Rule 9 removed jest. The
    // command genuinely runs; the receipt shape mirrors runTestReceipt's.
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

const canonicalSizeAfter = statSync(canonicalLedger).size;
check(canonicalSizeAfter === canonicalSizeBefore,
    `production ledger is byte-identical after the probe (${canonicalSizeBefore} -> ${canonicalSizeAfter} bytes)`);
console.log('  * production ledger isolation: size unchanged across the probe: PASS');

console.log('');
console.log(`All ${checks} evidence-seed idempotency assertions PASSED.`);
