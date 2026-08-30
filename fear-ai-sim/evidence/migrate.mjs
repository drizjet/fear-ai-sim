#!/usr/bin/env node
// evidence/migrate.mjs
//
// EVID-2026-08-28-EVIDENCE-STATUS-LINTER
//
// One-shot migration: extract every domain row from
// docs/DOMAIN_MATURITY.md and seed the evidence ledger with a
// SPECIFIED record (the lowest possible dimension, used to mark
// the claim as having a specification even if no further
// evidence has been gathered yet). Future slices can promote a
// domain by adding LIVE_PRODUCER / LIVE_CONSUMER /
// CONSEQUENCE_VERIFIED rows that bind to specific test runs and
// source files.
//
// Usage:
//   node evidence/migrate.mjs [--root <repo-root>]

import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { appendRow, rowId } from './maturity.mjs';

const DEFAULT_ROOT = 'C:/tools/03-Projects/lains Tools/lainself/fear-ai-sim/fear-ai-sim';

function parseArgs(argv) {
    const args = { root: DEFAULT_ROOT };
    for (let i = 2; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === '--root' || a === '-r') {
            args.root = argv[i + 1];
            i += 1;
        }
    }
    return args;
}

function parseMaturity(path) {
    if (!existsSync(path)) return [];
    const text = readFileSync(path, 'utf8');
    const rows = [];
    for (const line of text.split(/\r?\n/)) {
        const m = /^\|\s*([a-z][a-z0-9_-]*)\s*\|\s*`?([A-Z_]+(?:\s*\([^)]*\))?)`?\s*\|/.exec(line);
        if (m) {
            rows.push({ domain: m[1], label: m[2] });
        }
    }
    return rows;
}

function main() {
    const args = parseArgs(process.argv);
    const rootDir = resolve(args.root);
    const maturityPath = join(rootDir, 'docs', 'DOMAIN_MATURITY.md');
    const evidenceDir = join(rootDir, 'docs', 'evidence');
    const ledgerPath = join(evidenceDir, 'EVIDENCE_LEDGER.jsonl');
    if (!existsSync(evidenceDir)) mkdirSync(evidenceDir, { recursive: true });
    const rows = parseMaturity(maturityPath);
    let appended = 0;
    for (const r of rows) {
        const label = r.label.replace(/\s*\(.+?\)\s*$/, '').trim();
        // Seed a SPECIFIED row for every declared domain.
        const id = `EVID-MIGRATE-${r.domain}-SPECIFIED`;
        appendRow(ledgerPath, {
            rowId: rowId(),
            evidenceId: id,
            claimId: `C-${r.domain}-SPECIFIED`,
            domain: r.domain,
            dimension: 'SPECIFIED',
            claim: `the ${r.domain} domain is specified in docs/DOMAIN_MATURITY.md (declared label: ${label})`,
            sourceState: { head: 'migrated', dirty: false, fingerprint: 'migrated', fingerprintFiles: [] },
            files: ['docs/DOMAIN_MATURITY.md'],
            tests: [],
            commands: [],
            commandResults: [],
            knownContradictions: [],
            limitations: ['SPECIFIED dimension only; the migrated row does NOT yet prove the declared label.'],
            producer: 'migration-script',
            createdAt: new Date().toISOString(),
            note: 'initial migration from maturity table; subsequent slices must add LIVE_PRODUCER / LIVE_CONSUMER / CONSEQUENCE_VERIFIED rows to promote.',
        });
        appended += 1;
    }
    process.stdout.write(`migrated ${appended} domain rows to ${ledgerPath}\n`);
    return 0;
}

process.exit(main());
