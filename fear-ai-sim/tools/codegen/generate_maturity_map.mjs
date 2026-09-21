#!/usr/bin/env node
/**
 * tools/codegen/generate_maturity_map.mjs — render docs/DOMAIN_MATURITY.md's
 * ledger-status section from the evidence ledger, so the two cannot disagree.
 *
 * WHY THIS EXISTS. `docs/DOMAIN_MATURITY.md` used to carry a hand-promoted label
 * per domain, and its own lead sentence declared the linter's *derived* label the
 * authority. The two diverged — `combat` declared `UNIT_VERIFIED` while the ledger
 * derived `SPECIFIED`, and six more domains the same way — and nothing compared
 * them until a manual audit did. A document that names an authority it disagrees
 * with is worse than a document with no authority claim at all.
 *
 * So the status section is now GENERATED, from the closed record, with the
 * disagreement rendered instead of hidden: each row shows the label the ledger's
 * own rows support ("as recorded") next to the label the hand-written table
 * claims, and whether they agree.
 *
 * WHAT "AS RECORDED" MEANS, precisely: every row is treated as admissible and the
 * label is derived by `evidence/maturity.mjs` — the same function the linter uses.
 * It is deliberately NOT the linter's live derivation, because that one depends on
 * whether each row's tracked files still hash as recorded *today*, which changes
 * with every commit. A generated block that changes on every commit could not be
 * checked in CI. This block is a pure function of the two committed JSONL files.
 *
 * Usage:
 *   node tools/codegen/generate_maturity_map.mjs          # write the block
 *   node tools/codegen/generate_maturity_map.mjs --check  # fail if out of date
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { maturityGate, readLedger } from '../../evidence/maturity.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MAP_PATH = join(repoRoot, 'docs', 'DOMAIN_MATURITY.md');
const LEDGER_PATH = join(repoRoot, 'docs', 'evidence', 'EVIDENCE_LEDGER.jsonl');
const CONTRADICTIONS_PATH = join(repoRoot, 'docs', 'evidence', 'CONTRADICTIONS.jsonl');

const BEGIN = '<!-- GENERATED:LEDGER-STATUS:BEGIN -->';
const END = '<!-- GENERATED:LEDGER-STATUS:END -->';

// The same expression evidence/lint.mjs uses to read the hand-written labels, so
// the "Doc table says" column reports exactly what the linter sees. Duplicated on
// purpose rather than imported: importing the linter would pull its whole CLI into
// a codegen step, and this expression is the *comparison contract*, so the probe
// asserts both agree (see tools/verification/verify_release_claim_boundaries.mjs).
const DECLARED_ROW = /^\|\s*([a-z][a-z0-9_-]*)\s*\|\s*`?([A-Z_]+)`?/;
// A looser expression, used only to COUNT rows the strict one cannot see. The
// linter's expression requires a single-token domain, so `| trade routes | ... |`
// and `| individual cognition | ... |` were never compared against the ledger in
// either direction — a blind spot that stayed invisible until it was counted.
const LOOSE_ROW = /^\|\s*([^|]+?)\s*\|\s*`([A-Z_]+)`\s*\|/;

// Mirrors the linter's own LABEL_ALLOWLIST (evidence/lint.mjs): `visualization`
// declares BLOCKED as a deliberate scope verdict, not a maturity rung, so the
// linter tolerates that one divergence. Reporting it as a disagreement here
// would manufacture a problem the linter already adjudicated.
const SCOPE_VERDICT_DOMAINS = new Set(['visualization']);

function groupBy(values, key) {
    const groups = new Map();
    for (const value of values) {
        const k = key(value);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(value);
    }
    return groups;
}

function readDocRows() {
    if (!existsSync(MAP_PATH)) return { declared: new Map(), unparsed: [] };
    const declared = new Map();
    const unparsed = [];
    // Only the HAND-WRITTEN part of the document is scanned. The generated block
    // is this script's own output; counting its rows as "doc rows the linter
    // cannot parse" would be the generator auditing itself into a false finding.
    const text = readFileSync(MAP_PATH, 'utf8');
    const beginAt = text.indexOf(BEGIN);
    const endAt = text.indexOf(END);
    const handwritten = (beginAt === -1 || endAt === -1)
        ? text
        : text.slice(0, beginAt) + text.slice(endAt + END.length);
    for (const line of handwritten.split(/\r?\n/)) {
        const strict = DECLARED_ROW.exec(line);
        if (strict) {
            declared.set(strict[1], strict[2]);
            continue;
        }
        const loose = LOOSE_ROW.exec(line);
        if (loose) unparsed.push(loose[1].replace(/`/g, '').trim());
    }
    return { declared, unparsed };
}

function thousands(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function commandOk(row) {
    return Array.isArray(row.commandResults) && row.commandResults.length > 0
        && row.commandResults.every(entry => entry.ok === true);
}

// THE RECORD'S OWN RETIREMENT RULE, applied statically.
//
// The ledger is append-only, so a claim that failed once and was proved later
// keeps both rows. The linter retires the earlier one as SUPERSEDED when a live
// re-proof of the same domain+claimId+dimension exists, and as INVALIDATED when
// an EVIDENCE_SUPERSESSION row names its claimId. Both are properties of the
// committed file, so they belong in a git-independent derivation — unlike
// freshness, which depends on whether tracked files still hash as recorded today.
//
// This was not a theoretical refinement. `ecology` derived as SPECIFIED on the
// first attempt because five rows written inside the F3 taint window
// (2026-09-03T23:51, a command that exited 1) were read as live vetoes; the same
// command was re-run 52 minutes later and exited 0, which the record already
// recorded as the successor. A generated report that calls a re-proved claim
// unproved is the same class of error as the hand-written label it replaced.
function retireSuperseded(rows) {
    const invalidated = new Set();
    for (const row of rows) {
        if (row && row.dimension === 'EVIDENCE_SUPERSESSION' && Array.isArray(row.invalidatedClaimIds)) {
            for (const claimId of row.invalidatedClaimIds) invalidated.add(claimId);
        }
    }
    const reProved = new Set();
    for (const row of rows) {
        if (row && row.domain && row.claimId && row.dimension && commandOk(row)) {
            reProved.add(`${row.domain}|${row.claimId}|${row.dimension}`);
        }
    }
    const retired = new Set();
    for (const row of rows) {
        if (!row) continue;
        if (row.dimension === 'EVIDENCE_SUPERSESSION') {
            retired.add(row);
            continue;
        }
        if (commandOk(row)) continue;
        const superseded = row.domain && row.claimId && row.dimension
            && reProved.has(`${row.domain}|${row.claimId}|${row.dimension}`);
        if (superseded || (row.claimId && invalidated.has(row.claimId))) retired.add(row);
    }
    return retired;
}

export function render() {
    const ledger = readLedger(LEDGER_PATH);
    const contradictions = readLedger(CONTRADICTIONS_PATH);
    const { declared, unparsed } = readDocRows();
    const byDomain = groupBy(ledger.filter(r => r && r.domain), r => r.domain);
    const latest = ledger.map(r => r.createdAt).filter(Boolean).sort().pop() || 'unknown';
    const retired = retireSuperseded(ledger);
    const retiredByDomain = groupBy(ledger.filter(r => retired.has(r) && r.domain), r => r.domain);

    const domains = [...new Set([...byDomain.keys(), ...declared.keys()])].sort();
    const synthetic = domains.filter(domain => domain.startsWith('__'));
    const rows = [];
    const mismatches = [];
    let agreements = 0;
    let scopeVerdicts = 0;
    for (const domain of domains) {
        const allRows = byDomain.get(domain) || [];
        const liveRows = allRows.filter(row => !retired.has(row));
        const recorded = liveRows.length === 0
            ? 'NO_ROWS'
            : (() => {
                const asRecorded = liveRows.map(row => ({ ...row, freshness: 'ADMISSIBLE' }));
                const gate = maturityGate({ domain, ledger: asRecorded, contradictions });
                return gate.label;
            })();
        const docSays = declared.get(domain) || null;
        const scopeVerdict = SCOPE_VERDICT_DOMAINS.has(domain);
        let agrees = '—';
        if (docSays !== null) {
            if (docSays === recorded) {
                agrees = 'yes';
                agreements += 1;
            } else if (scopeVerdict) {
                agrees = 'NO (scope verdict)';
                scopeVerdicts += 1;
            } else {
                agrees = 'NO';
                mismatches.push({ domain, docSays, recorded });
            }
        }
        const retiredCount = (retiredByDomain.get(domain) || []).length;
        rows.push(`| \`${domain}\` | \`${recorded}\` | ${thousands(liveRows.length)}${retiredCount > 0 ? ` (+${retiredCount} retired)` : ''} | ${docSays ? `\`${docSays}\`` : '—'} | ${agrees} |`);
    }

    return [
        BEGIN,
        '<!-- Generated by tools/codegen/generate_maturity_map.mjs from the evidence ledger.',
        '     Do not edit by hand: run `node tools/codegen/generate_maturity_map.mjs`, or',
        '     `--check` to see whether it is out of date. Drift fails the release-claim probe. -->',
        '',
        '### Ledger status as recorded (generated — historical, not current verification)',
        '',
        `**${thousands(ledger.length)} rows across ${domains.length} domains; last row recorded ${latest}.**`,
        'The ledger was last maintained on that date and is a **closed record**',
        '(`npm run evidence:report`). `Ledger claim` is the label those rows support when read',
        '**as recorded** — every row treated as admissible, derived by `evidence/maturity.mjs`,',
        'the same function the linter uses, and with the record\'s own retirement applied: a row',
        're-proved later by the same claim, or named by an `EVIDENCE_SUPERSESSION` row, is history',
        'and cannot veto. The F3 taint window (2026-08-30..2026-09-03) is deliberately **not**',
        'applied here — it is an admission rule, so the live derivation and `npm run evidence:report`',
        'apply it while this section reports what the record claims. `Doc table says` is parsed from the hand-written',
        'table below with the expression the linter itself uses, so a disagreement is rendered',
        'here rather than hidden in two documents that never met.',
        '',
        `**${agreements} domain(s) agree with the hand-written table; ${mismatches.length} disagree`
            + `${scopeVerdicts > 0 ? ` (plus ${scopeVerdicts} declared scope verdict)` : ''}.**`,
        'That comparison is made at RECORD time, and it is the useful one: it says the map did',
        'not quietly promote a label above its own evidence while the ledger was maintained.',
        ...[(mismatches.length > 0
            ? `\nThe genuine record-time disagreement(s): ${mismatches.map(m => `\`${m.domain}\` — the table says \`${m.docSays}\`, the record\'s own rows support \`${m.recorded}\``).join('; ')}.`
            : '\nNo genuine record-time disagreement: every parseable label the table declared matches what its own rows supported.')],
        ...[(unparsed.length > 0
            ? `\n${unparsed.length} hand-written row(s) are invisible to the linter's expression because the domain cell is not a single token (${unparsed.slice(0, 6).map(d => `\`${d}\``).join(', ')}${unparsed.length > 6 ? ', …' : ''}); those were never compared against the ledger in either direction, and no column here covers them.`
            : null)],
        '',
        'It does **not** say the labels are current. Read live instead — whether each row\'s',
        'tracked files still hash as recorded **today** — and most domains fall, because rows',
        'written up to 2026-09-06 predate everything that happened after. That is currency, not',
        'contradiction, and it is why this map is superseded rather than corrected:',
        '`npm run evidence:report` prints the live per-domain counts.',
        synthetic.length > 0
            ? `\n${synthetic.length} domain(s) in the record are receipt-test artifacts, not product domains (${synthetic.map(d => `\`${d}\``).join(', ')}); they are shown because they are in the ledger.`
            : null,
        '',
        'No label in this table is a statement about today.',
        '',
        '| Domain | Ledger claim (as recorded) | Rows | Doc table says | Agrees? |',
        '|---|---|---|---|---|',
        ...rows,
        END
    ].filter(line => line !== null).join('\n');
}

function replaceBlock(text, block) {
    const start = text.indexOf(BEGIN);
    const end = text.indexOf(END);
    if (start === -1 || end === -1 || end < start) {
        throw new Error(`docs/DOMAIN_MATURITY.md is missing the generated markers.\n`
            + `Add ${BEGIN} ... ${END} where the status section belongs.`);
    }
    return `${text.slice(0, start)}${block}${text.slice(end + END.length)}`;
}

function main() {
    const check = process.argv.includes('--check');
    const current = readFileSync(MAP_PATH, 'utf8');
    const expected = replaceBlock(current, render());
    if (check) {
        if (current !== expected) {
            console.error('DRIFT — docs/DOMAIN_MATURITY.md does not match the evidence ledger.');
            console.error('Run: node tools/codegen/generate_maturity_map.mjs');
            return 1;
        }
        console.log('OK — the generated ledger-status section matches the evidence ledger.');
        return 0;
    }
    if (current !== expected) {
        writeFileSync(MAP_PATH, expected);
        console.log('WROTE — docs/DOMAIN_MATURITY.md generated section regenerated.');
    } else {
        console.log('OK — already up to date.');
    }
    return 0;
}

// Only run the CLI when invoked directly, so a probe can import `render`/`check`.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
    process.exit(main());
}
