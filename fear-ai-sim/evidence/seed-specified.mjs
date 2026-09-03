#!/usr/bin/env node
// evidence/seed-specified.mjs
//
// EVID-2026-09-03-PREAUDIT-2-SPECIFIED-RESEED
//
// Re-proves the 25 SPECIFIED migration-placeholder claims
// (C-<domain>-SPECIFIED, seeded 2026-08-29 by evidence/migrate.mjs
// with fingerprint 'migrated'). Each placeholder claims exactly one
// thing: the domain is declared in docs/DOMAIN_MATURITY.md. This
// script verifies that declaration per domain (fail-fast via
// assertionExists) and mints a content-bound SPECIFIED row whose
// fingerprint tracks the maturity doc itself — so editing a domain's
// declaration honestly stales its row. Idempotent: buildReceipt
// skips duplicates by claimId + dimension + fingerprint.
//
// The shared command receipt is the full non-long-horizon suite run
// at seed time: the rows assert the repo was green when the
// declaration was verified.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReceipt, runTestReceipt, assertionExists } from './receipt.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const MATURITY_DOC = resolve(ROOT, 'docs', 'DOMAIN_MATURITY.md');
const REL_DOC = 'docs/DOMAIN_MATURITY.md';

const receipt = runTestReceipt('--runInBand --testPathIgnorePatterns=long-horizon', {
    cwd: ROOT,
    timeoutMs: 300000,
    label: 'full non-long-horizon suite at specified-reseed',
});
if (receipt.exitCode !== 0) {
    throw new Error(`seed-specified: suite was not green (exit ${receipt.exitCode}); refusing to seed`);
}

const text = readFileSync(MATURITY_DOC, 'utf8');
let seeded = 0;
for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\|\s*([a-z][a-z0-9-]*)\s*\|\s*(`[A-Z_]+`)\s*\|/);
    if (!match) continue;
    const [, domain, label] = match;
    const claimId = `C-${domain}-SPECIFIED`;
    const needle = `| ${domain} |`;
    if (!assertionExists(MATURITY_DOC, needle)) {
        throw new Error(`seed-specified: maturity doc lost its ${domain} row; refusing to seed ${claimId}`);
    }
    buildReceipt({
        claimId,
        domain,
        dimension: 'SPECIFIED',
        claim: `the ${domain} domain is specified in docs/DOMAIN_MATURITY.md (declared label: ${label})`,
        testFiles: [],
        sourceFiles: [REL_DOC],
        commandReceipt: receipt,
        assertions: [
            `docs/DOMAIN_MATURITY.md contains a maturity-table row for ${domain} with declared label ${label}`,
            `full non-long-horizon suite green at seed time (exit ${receipt.exitCode})`,
        ],
        limitations: ['SPECIFIED dimension only; the row proves declaration, not implementation.'],
        useImportClosure: false,
    });
    seeded += 1;
}

console.log(`Seeded ${seeded} SPECIFIED declaration rows.`);
