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
// domain has no rows but no active contradiction either), or is
// explicitly retired: INVALIDATED by an EVIDENCE_SUPERSESSION row,
// or SUPERSEDED by a live re-proof of the same claim. A row whose
// tracked files still hash as recorded is current (ADMISSIBLE)
// even across commits that touch nothing it tracks. Rows observed
// inside the F3 violation window (2026-08-30..2026-09-03) are never
// admissible. Declared maturity labels must equal derived labels
// (modulo the explicit allowlist) or the gate fails. Exits
// 1 if any row is CONTRADICTED, STALE with no live successor,
// WINDOWED with no live successor, INCOMPLETE, or divergently
// labeled, or if any domain has an active contradiction that is
// not recorded in the evidence.
// Usage:
//   node scripts/audit-evidence.mjs [--root <repo-root>]

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeSourceFingerprint, compareFingerprints } from '../evidence/fingerprint.mjs';
import { maturityGate, readLedger } from '../evidence/maturity.mjs';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
        const m = /^\|\s*([a-z][a-z0-9_-]*)\s*\|\s*`?([A-Z_]+)`?/.exec(line);
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
        const contradicted = Array.isArray(row.knownContradictions) && row.knownContradictions.length > 0;
        row._contradicted = contradicted;
        // R6 (V8 audit F-AUTH-02): the F3 violation window
        // (2026-08-30 through 2026-09-03) stays admitted-invalid.
        // Rows observed inside it can never be current evidence,
        // however fresh their bytes look — claims dated inside the
        // window were re-proved after it (successors retire them) or
        // they fail. Taint dominates: checked before freshness.
        const observedAt = Date.parse(row.createdAt);
        const inWindow = Number.isFinite(observedAt)
            && observedAt >= Date.parse('2026-08-30T00:00:00.000Z')
            && observedAt <= Date.parse('2026-09-03T23:59:59.999Z');
        // V8 corrective checkpoint §7: content-match currency. The
        // fingerprint binds head + dirty + file hashes, so ANY commit
        // stales every row even when the tracked sources are byte-identical.
        // A row whose tracked files still hash exactly as recorded proves
        // the same claim against the same sources: that is current
        // evidence, not stale evidence. Content drift is still STALE.
        const contentMatches = row.sourceState
            && Array.isArray(row.sourceState.fileHashes)
            && Array.isArray(fresh.fileHashes)
            && row.sourceState.fileHashes.length === fresh.fileHashes.length
            && row.sourceState.fileHashes.every(entry =>
                fresh.fileHashes.some(other => other.path === entry.path && other.hash === entry.hash));
        let status = 'INCOMPLETE';
        if (inWindow) status = 'WINDOWED';
        else if (contradicted) status = 'CONTRADICTED';
        else if (freshness === 'STALE' && !contentMatches) status = 'STALE';
        else if (freshness === 'INCOMPLETE') status = 'INCOMPLETE';
        else if (!commandOk) status = 'INCOMPLETE';
        else if (freshness === 'FRESH' || contentMatches) status = 'ADMISSIBLE';
        row.freshness = status;
        row._provisional = status;
        if (!report.domains[row.domain]) {
            report.domains[row.domain] = {
                rows: 0,
                admissible: 0,
                stale: 0,
                contradicted: 0,
                incomplete: 0,
                supersession: 0,
                invalidated: 0,
                superseded: 0,
                windowed: 0,
                derivedLabel: null,
            };
        }
        const d = report.domains[row.domain];
        d.rows += 1;
        if (status === 'ADMISSIBLE') d.admissible += 1;
        else if (status === 'STALE') d.stale += 1;
        else if (status === 'CONTRADICTED') d.contradicted += 1;
        else if (status === 'WINDOWED') d.windowed += 1;
        else d.incomplete += 1;
    }

    // V8 corrective checkpoint §8: retirement. The ledger is append-only,
    // so history accumulates. A non-admissible row retires (stops failing
    // the gate) in exactly two cases, both explicit:
    //   (a) INVALIDATED — its claimId is named by an EVIDENCE_SUPERSESSION
    //       row's invalidatedClaimIds (test pollution, withdrawn claims);
    //   (b) SUPERSEDED — a live row with the same domain + claimId +
    //       dimension is currently ADMISSIBLE (a reseed re-proved the
    //       claim against newer sources; the older proof is history).
    // A lone stale row with no current proof still fails: that is the
    // MUT-EVID-002 contract and it is unchanged. Retired rows never
    const invalidatedClaimIds = new Set();
    for (const row of ledger) {
        if (row && row.dimension === 'EVIDENCE_SUPERSESSION' && Array.isArray(row.invalidatedClaimIds)) {
            for (const id of row.invalidatedClaimIds) invalidatedClaimIds.add(id);
        }
    }
    const liveProof = new Set();
    const proofKey = (row) => [row.domain, row.claimId, row.dimension].join('|');
    for (const row of ledger) {
        if (row && row.freshness === 'ADMISSIBLE' && row.domain && row.claimId && row.dimension) {
            liveProof.add(proofKey(row));
        }
    }
    const provisionalBucket = { ADMISSIBLE: 'admissible', STALE: 'stale', CONTRADICTED: 'contradicted', INCOMPLETE: 'incomplete', WINDOWED: 'windowed' };
    for (const row of ledger) {
        if (!row || row.freshness === 'ADMISSIBLE' || row.freshness === 'SUPERSESSION' || row.dimension === 'EVIDENCE_SUPERSESSION') {
            delete row._provisional;
            delete row._contradicted;
            continue;
        }
        let retired = null;
        // R6 (F-GATE-02): a CONTRADICTED row never retires via
        // self-asserted metadata — neither supersession naming nor a
        // same-claim successor launders an open contradiction. Only
        // contradiction resolution (knownContradictions cleared) does.
        if (!row._contradicted && row.claimId && invalidatedClaimIds.has(row.claimId)) {
            retired = 'INVALIDATED';
        } else if (!row._contradicted && row.domain && row.claimId && row.dimension
            && liveProof.has(proofKey(row))) {
            retired = 'SUPERSEDED';
        }
        if (retired) {
            const d = report.domains[row.domain];
            const bucket = provisionalBucket[row._provisional];
            if (d && bucket && typeof d[bucket] === 'number' && d[bucket] > 0) d[bucket] -= 1;
            if (d && retired === 'INVALIDATED') d.invalidated += 1;
            if (d && retired === 'SUPERSEDED') d.superseded += 1;
            row.freshness = retired;
        }
        delete row._provisional;
        delete row._contradicted;
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
                invalidated: 0, superseded: 0, windowed: 0,
                derivedLabel: null, declaredLabel,
            };
        }
        report.domains[domain].declaredLabel = declaredLabel;
    }

    // R6 (V8 audit F-GATE-01): declared labels are enforced, not
    // advisory. A domain whose derived evidence label differs from
    // its declaration fails the gate — otherwise the tree can claim
    // arbitrary maturity with green lint. Explicit allowlist for
    // intentional divergences (scope verdicts, not ladder labels):
    // visualization declares BLOCKED (deliberate non-goal) while the
    // ledger can only derive ladder labels for it.
    const LABEL_ALLOWLIST = new Set(['visualization']);
    const labelDivergences = [];
    for (const [domain, info] of Object.entries(report.domains)) {
        if (!info.declaredLabel || info.derivedLabel === null || info.derivedLabel === undefined) continue;
        if (LABEL_ALLOWLIST.has(domain)) continue;
        if (info.declaredLabel !== info.derivedLabel) {
            labelDivergences.push({ domain, declared: info.declaredLabel, derived: info.derivedLabel });
        }
    }
    report.labelDivergences = labelDivergences;

    process.stdout.write(JSON.stringify(report, null, 2) + '\n');

    // Exit non-zero unless every recorded row is currently admissible or
    // explicitly retired. Reporting STALE or INCOMPLETE while returning
    // success allows CI and maturity automation to accept evidence whose
    // declared support has drifted, which is the MUT-EVID-002 failure mode.
    // SUPERSESSION rows are audit metadata, not claims — exclude them.
    // INVALIDATED (named by a supersession row) and SUPERSEDED (a live
    // re-proof of the same claim exists) rows are history, not drift:
    // they neither pass nor fail the gate and never support maturity.
    // WINDOWED rows (F3 violation window) always fail: only a
    // post-window re-proof retires them via SUPERSEDED.
    const retired = new Set(['SUPERSESSION', 'INVALIDATED', 'SUPERSEDED']);
    const hasInadmissible = ledger.some(r => !retired.has(r.freshness) && r.freshness !== 'ADMISSIBLE' && r.dimension !== 'EVIDENCE_SUPERSESSION');
    const activeC = contradictions.filter(c => c.active !== false);
    const hasUntrackedContradiction = activeC.some(c => {
        return !ledger.some(r => r.domain === c.domain && Array.isArray(r.knownContradictions) && r.knownContradictions.includes(c.rowId));
    });
    if (hasInadmissible || hasUntrackedContradiction || labelDivergences.length > 0) {
        return 1;
    }
    return 0;
}

process.exit(main());
