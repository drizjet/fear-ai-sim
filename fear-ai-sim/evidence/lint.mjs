#!/usr/bin/env node
// scripts/audit-evidence.mjs
//
// EVID-2026-08-28-EVIDENCE-STATUS-LINTER
//
// Walks every evidence row, re-derives the source fingerprint,
// re-derives the maturity label, and reports FRESH / STALE /
// BLOCKED / CONTRADICTED / INCOMPLETE / ADMISSIBLE per row.
//
// Exits 0 if every row is ADMISSIBLE for its domain (or the
// domain has no rows but no active contradiction either). Exits
// 1 if any row is CONTRADICTED or if any domain has an active
// contradiction that is not recorded in the evidence.
//
// Usage:
//   node scripts/audit-evidence.mjs [--root <repo-root>]

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { computeSourceFingerprint, compareFingerprints } from '../evidence/fingerprint.mjs';
import { maturityGate, readLedger } from '../evidence/maturity.mjs';

const DEFAULT_ROOT = 'C:/tools/03-Projects/lains Tools/lainself/fear-ai-sim/fear-ai-sim';

function parseArgs(argv) {
    const args = { root: DEFAULT_ROOT };
    for (let i = 2; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === '--root' || a === '-r') {
            args.root = argv[i + 1];
            i += 1;
        } else if (a === '--help' || a === '-h') {
            args.help = true;
        }
    }
    return args;
}

function loadDomains(rootDir) {
    const maturityPath = join(rootDir, 'docs', 'DOMAIN_MATURITY.md');
    if (!existsSync(maturityPath)) return [];
    const text = readFileSync(maturityPath, 'utf8');
    const rows = [];
    // The maturity table is markdown: `| <domain> | <label> | <evidence> | ...`
    for (const line of text.split(/\r?\n/)) {
        const m = /^\|\s*([a-z][a-z0-9_-]*)\s*\|\s*([A-Z_]+)/.exec(line);
        if (m) rows.push({ domain: m[1], declared: m[2] });
    }
    return rows;
}

function deriveFingerprintFiles(ledgerRow, rootDir) {
    // Prefer the top-level fingerprintFiles (used by earlier seed scripts),
    // then the sourceState.fingerprintFiles (used by buildReceipt), then
    // the file list.
    if (Array.isArray(ledgerRow.fingerprintFiles) && ledgerRow.fingerprintFiles.length > 0) {
        return ledgerRow.fingerprintFiles;
    }
    if (ledgerRow.sourceState && Array.isArray(ledgerRow.sourceState.fingerprintFiles) && ledgerRow.sourceState.fingerprintFiles.length > 0) {
        return ledgerRow.sourceState.fingerprintFiles;
    }
    if (Array.isArray(ledgerRow.transitiveDependencies) && ledgerRow.transitiveDependencies.length > 0) {
        return ledgerRow.transitiveDependencies;
    }
    if (Array.isArray(ledgerRow.files)) return ledgerRow.files;
    return [];
}

function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        process.stdout.write('Usage: node scripts/audit-evidence.mjs [--root <repo-root>]\n');
        return 0;
    }
    const rootDir = resolve(args.root);
    const evidencePath = join(rootDir, 'docs', 'evidence', 'EVIDENCE_LEDGER.jsonl');
    const contradictionsPath = join(rootDir, 'docs', 'evidence', 'CONTRADICTIONS.jsonl');
    const ledger = readLedger(evidencePath);
    const contradictions = readLedger(contradictionsPath);
    const declared = loadDomains(rootDir);
    const report = {
        rootDir,
        evidenceRows: ledger.length,
        contradictionRows: contradictions.length,
        activeContradictions: contradictions.filter(c => c.active !== false).length,
        domains: {},
        errors: [],
    };

    for (const row of ledger) {
        if (!row || !row.domain || !row.dimension) {
            report.errors.push(`row ${row?.rowId ?? '?'}: missing domain or dimension`);
            continue;
        }
        // V8 corrective checkpoint §6: EVIDENCE_SUPERSESSION
        // rows are audit metadata, not claims to be
        // evaluated for freshness. They explicitly
        // invalidate other rows and must not count
        // against the admissible gate.
        if (row.dimension === 'EVIDENCE_SUPERSESSION') {
            row.freshness = 'SUPERSESSION';
            if (!report.domains[row.domain]) {
                report.domains[row.domain] = {
                    rows: 0,
                    admissible: 0,
                    stale: 0,
                    contradicted: 0,
                    incomplete: 0,
                    supersession: 0,
                    derivedLabel: null,
                };
            }
            const d = report.domains[row.domain];
            d.rows += 1;
            d.supersession = (d.supersession ?? 0) + 1;
            continue;
        }
        const ff = deriveFingerprintFiles(row, rootDir);
        const fresh = computeSourceFingerprint({ rootDir, fingerprintFiles: ff });
        const freshness = compareFingerprints(row.sourceState, fresh);
        const commandOk = Array.isArray(row.commandResults)
            && row.commandResults.length > 0
            && row.commandResults.every(cr => cr.ok === true);
        let status = 'INCOMPLETE';
        if (freshness === 'STALE') status = 'STALE';
        else if (freshness === 'INCOMPLETE') status = 'INCOMPLETE';
        else if (!commandOk) status = 'INCOMPLETE';
        else if (Array.isArray(row.knownContradictions) && row.knownContradictions.length > 0) status = 'CONTRADICTED';
        else status = 'ADMISSIBLE';
        row.freshness = status;
        if (!report.domains[row.domain]) {
            report.domains[row.domain] = {
                rows: 0,
                admissible: 0,
                stale: 0,
                contradicted: 0,
                incomplete: 0,
                supersession: 0,
                derivedLabel: null,
            };
        }
        const d = report.domains[row.domain];
        d.rows += 1;
        if (status === 'ADMISSIBLE') d.admissible += 1;
        else if (status === 'STALE') d.stale += 1;
        else if (status === 'CONTRADICTED') d.contradicted += 1;
        else d.incomplete += 1;
    }

    for (const dom of Object.keys(report.domains)) {
        const m = maturityGate({ domain: dom, ledger, contradictions });
        report.domains[dom].derivedLabel = m.label;
        report.domains[dom].reasons = m.reasons;
    }

    // For each domain declared in DOMAIN_MATURITY.md, derive a
    // label and report any divergence.
    for (const { domain, declared: declaredLabel } of declared) {
        if (!report.domains[domain]) {
            report.domains[domain] = {
                rows: 0, admissible: 0, stale: 0, contradicted: 0, incomplete: 0, supersession: 0,
                derivedLabel: null, declaredLabel,
            };
        }
        report.domains[domain].declaredLabel = declaredLabel;
    }

    process.stdout.write(JSON.stringify(report, null, 2) + '\n');

    // Exit non-zero unless every recorded row is currently admissible.
    // Reporting STALE or INCOMPLETE while returning success allows CI and
    // maturity automation to accept evidence whose declared support has
    // drifted, which is the MUT-EVID-002 failure mode.
    const hasInadmissible = ledger.some(r => r.freshness !== 'ADMISSIBLE');
    const activeC = contradictions.filter(c => c.active !== false);
    const hasUntrackedContradiction = activeC.some(c => {
        return !ledger.some(r => r.domain === c.domain && Array.isArray(r.knownContradictions) && r.knownContradictions.includes(c.rowId));
    });
    if (hasInadmissible || hasUntrackedContradiction) {
        return 1;
    }
    return 0;
}

process.exit(main());
