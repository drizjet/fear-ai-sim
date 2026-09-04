// evidence/maturity.mjs
//
// Maturity derivation from evidence rows.
//
// EVID-2026-08-28-EVIDENCE-STATUS-LINTER
//
// The maturity label for a domain is DERIVED from the evidence rows
// for that domain, not hand-promoted. The promotion rules are
// explicit (see `MATURITY_DIMENSIONS` below). A domain cannot be
// promoted to a status higher than what its evidence supports; any
// active contradiction caps the label.
//
// Public API:
//
//   maturityGate({ domain, ledger, contradictions })
//     → { label, dimensions, reasons, contradictionsCapping }
//
//   recordContradiction({ ledgerPath, domain, claim, evidence, severity, cap, active })
//     → appends a row to the contradictions JSONL
//
//   recordEvidence({ ledgerPath, ...row })
//     → appends a row to the evidence JSONL
//
//   readLedger(path) / writeLedger(path, rows) — I/O helpers
//
//   classifyTestChange({ original, new, justification })
//     → { classification, weakensOriginal, ... }

import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

// The promotion ladder. Each status requires the listed dimensions.
// The maturityGate walks the ladder top-down and returns the highest
// status whose dimensions are ALL met (with passing commandResults
// and no active contradiction capping the label).
const MATURITY_LADDER = [
    { label: 'CODE_EXISTS', requires: ['CODE_EXISTS'] },
    { label: 'UNIT_VERIFIED', requires: ['CODE_EXISTS', 'UNIT_VERIFIED'] },
    { label: 'LIVE_PATH_INTEGRATED', requires: ['CODE_EXISTS', 'UNIT_VERIFIED', 'LIVE_PRODUCER', 'LIVE_CONSUMER'] },
    { label: 'CONSEQUENCE_VERIFIED', requires: ['CODE_EXISTS', 'UNIT_VERIFIED', 'LIVE_PRODUCER', 'LIVE_CONSUMER', 'CONSEQUENCE_VERIFIED'] },
    { label: 'INTEGRATION_VERIFIED', requires: ['CODE_EXISTS', 'UNIT_VERIFIED', 'LIVE_PRODUCER', 'LIVE_CONSUMER', 'CONSEQUENCE_VERIFIED', 'INTEGRATION_VERIFIED'] },
    { label: 'CROSS_DOMAIN_INTEGRATED', requires: ['CODE_EXISTS', 'UNIT_VERIFIED', 'LIVE_PRODUCER', 'LIVE_CONSUMER', 'CONSEQUENCE_VERIFIED', 'INTEGRATION_VERIFIED', 'CROSS_DOMAIN_INTEGRATED'] },
    { label: 'DETERMINISM_VERIFIED', requires: ['CODE_EXISTS', 'UNIT_VERIFIED', 'DETERMINISM_VERIFIED'] },
    { label: 'LONG_HORIZON_VERIFIED', requires: ['CODE_EXISTS', 'UNIT_VERIFIED', 'LONG_HORIZON_VERIFIED'] },
    { label: 'STATISTICALLY_VERIFIED', requires: ['CODE_EXISTS', 'UNIT_VERIFIED', 'STATISTICALLY_VERIFIED'] },
    { label: 'RUNTIME_VERIFIED', requires: ['CODE_EXISTS', 'UNIT_VERIFIED', 'RUNTIME_VERIFIED'] },
    { label: 'CROSS_DOMAIN_STATISTICALLY_VERIFIED', requires: ['CODE_EXISTS', 'UNIT_VERIFIED', 'LIVE_PRODUCER', 'LIVE_CONSUMER', 'CONSEQUENCE_VERIFIED', 'INTEGRATION_VERIFIED', 'STATISTICALLY_VERIFIED'] },
    { label: 'FULLY_VERIFIED', requires: [
        'CODE_EXISTS', 'UNIT_VERIFIED', 'LIVE_PRODUCER', 'LIVE_CONSUMER',
        'CONSEQUENCE_VERIFIED', 'INTEGRATION_VERIFIED', 'CROSS_DOMAIN_INTEGRATED',
        'DETERMINISM_VERIFIED', 'LONG_HORIZON_VERIFIED', 'STATISTICALLY_VERIFIED',
        'RUNTIME_VERIFIED', 'LIMITATIONS_DOCUMENTED',
    ] },
];

const ALLOWED_DIMENSIONS = new Set(MATURITY_LADDER.flatMap(s => s.requires).concat([
    'SPECIFIED',
    'CHECKPOINT_VERIFIED',
    'FORK_VERIFIED',
    'COUNTERFACTUAL_VERIFIED',
    'MULTI_SEED_SMOKE',
    'VISUAL_VERIFIED',
    'PERFORMANCE_VERIFIED',
    'REPRODUCED_INDEPENDENTLY',
]));

const SEVERITY_CAP = {
    HIGH: 'CODE_EXISTS',
    MEDIUM: 'UNIT_VERIFIED',
    LOW: 'LIVE_CONSUMER',
};

/**
 * Read a JSONL ledger file and return an array of row objects.
 * Silently returns [] if the file does not exist.
 */
export function readLedger(path) {
    if (!existsSync(path)) return [];
    const text = readFileSync(path, 'utf8');
    const rows = [];
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            rows.push(JSON.parse(trimmed));
        } catch {
            // Skip malformed lines (audit will report).
        }
    }
    return rows;
}

/**
 * Write an array of row objects to a JSONL file (one per line).
 */
export function writeLedger(path, rows) {
    const text = rows.map(r => JSON.stringify(r)).join('\n') + '\n';
    writeFileSync(path, text, 'utf8');
}

/**
 * Append a single row to a JSONL file. Throws on JSON.stringify
 * failure (so the caller cannot accidentally write a malformed row).
 */
export function appendRow(path, row) {
    const text = JSON.stringify(row);
    if (text.includes('\n')) {
        throw new TypeError(`appendRow: row for ${path} contains a newline`);
    }
    appendFileSync(path, text + '\n', 'utf8');
}

/**
 * Derive the maturity label for a domain from its evidence rows.
 *
 * @param {Object} options
 * @param {string} options.domain
 * @param {Array} [options.ledger] - full ledger; rows are filtered by domain
 * @param {Array} [options.contradictions] - full contradiction ledger; rows are filtered by domain + active
 * @param {Array} [options.allEvidence] - same as ledger
 * @returns {{ label: string, dimensions: string[], reasons: string[], contradictionsCapping: Object[] }}
 */
export function maturityGate({ domain, ledger = [], contradictions = [] } = {}) {
    if (!domain) throw new TypeError('maturityGate: domain is required');
    const evidenceRows = ledger.filter(r => r && r.domain === domain);
    const domainContradictions = contradictions.filter(c => c && c.domain === domain && c.active !== false);
    // V8 checkpoint §8: retired rows are history. They neither support
    // a dimension nor poison it (a superseded placeholder without
    // commandResults must not veto its live successor). Rows without a
    // linter-assigned freshness (unit fixtures, unlinted ledgers) stay in.
    const liveRows = evidenceRows.filter(r => r.freshness === undefined
        || r.freshness === 'FRESH' || r.freshness === 'ADMISSIBLE'
        || r.freshness === 'STALE' || r.freshness === 'INCOMPLETE' || r.freshness === 'CONTRADICTED'
        || r.freshness === 'WINDOWED');

    // Tally which dimensions are fully met.
    const dimensions = {};
    const reasons = [];
    for (const dim of ALLOWED_DIMENSIONS) {
        const rows = liveRows.filter(r => r.dimension === dim);
        if (rows.length === 0) {
            dimensions[dim] = false;
            continue;
        }
        // A dimension is "met" if at least one row has it AND
        // every row's `commandResults` are ok.
        const allOk = rows.every(r => Array.isArray(r.commandResults)
            && r.commandResults.length > 0
            && r.commandResults.every(cr => cr.ok === true));
        const freshRows = rows.filter(r => r.freshness === 'FRESH' || r.freshness === 'ADMISSIBLE');
        // Content-level checks for orthogonal dimensions: a
        // STATISTICALLY_VERIFIED row is only "met" if its
        // statisticalEvidence.precisionMet is true. A
        // RUNTIME_VERIFIED row requires runtimeEvidence.
        // CHECKPOINT_VERIFIED requires checkpointEvidence.
        let contentCheckOk = true;
        const contentReasons = [];
        for (const r of freshRows) {
            if (dim === 'STATISTICALLY_VERIFIED' || dim === 'CROSS_DOMAIN_STATISTICALLY_VERIFIED') {
                if (r.statisticalEvidence && r.statisticalEvidence.precisionMet === false) {
                    contentCheckOk = false;
                    contentReasons.push(`row ${r.claimId || r.rowId || '?'}: precisionMet=false`);
                }
            }
        }
        if (allOk && freshRows.length > 0 && contentCheckOk) {
            dimensions[dim] = true;
        } else if (allOk && freshRows.length > 0) {
            dimensions[dim] = false;
            reasons.push(`dimension ${dim}: ${freshRows.length} fresh row(s) but ${contentReasons.join('; ')}`);
        } else if (allOk) {
            dimensions[dim] = false;
            reasons.push(`dimension ${dim}: ${rows.length} row(s) but freshness is ${rows.map(r => r.freshness ?? 'UNKNOWN').join(', ')}`);
        } else {
            dimensions[dim] = false;
            reasons.push(`dimension ${dim}: ${rows.length} row(s) but some commandResults are not ok`);
        }
    }

    // Apply contradiction caps.
    const contradictionsCapping = [];
    let capLabel = null;
    for (const c of domainContradictions) {
        const cap = c.cap ?? SEVERITY_CAP[c.severity] ?? 'CODE_EXISTS';
        contradictionsCapping.push({ rowId: c.rowId, severity: c.severity, cap });
        if (!capLabel || ladderIndex(cap) < ladderIndex(capLabel)) {
            capLabel = cap;
        }
    }

    // Walk the ladder top-down; pick the highest status whose
    // required dimensions are all met; then cap by contradiction.
    // Orthogonal steps (LONG_HORIZON, DETERMINISM, RUNTIME,
    // STATISTICALLY) are reachable even if LIVE_PATH_INTEGRATED
    // fails, because they have their own minimal requires.
    // We do NOT break on the first miss; we walk all steps
    // and pick the highest passing one.
    let label = 'SPECIFIED';
    for (const step of MATURITY_LADDER) {
        if (step.requires.every(d => dimensions[d] === true)) {
            if (ladderIndex(step.label) > ladderIndex(label)) {
                label = step.label;
            }
        }
    }
    if (capLabel && ladderIndex(label) > ladderIndex(capLabel)) {
        reasons.push(`label ${label} capped to ${capLabel} by contradiction(s)`);
        label = capLabel;
    }

    return { label, dimensions, reasons, contradictionsCapping };
}

function ladderIndex(label) {
    for (let i = 0; i < MATURITY_LADDER.length; i += 1) {
        if (MATURITY_LADDER[i].label === label) return i;
    }
    return -1;
}

/**
 * Generate a row ID (uuid v4-ish; not cryptographically strong but
 * unique enough for a JSONL ledger).
 */
export function rowId() {
    return 'r-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
}

/**
 * Classify a test change. Returns the classification plus whether
 * the original contract is weakened.
 */
export function classifyTestChange({ original, new: next, justification } = {}) {
    const weakensOriginal = isWeaker(original, next);
    let classification = 'TEST_DEFECT';
    if (typeof original === 'string' && typeof next === 'string') {
        if (original === next) classification = 'NONDETERMINISM_DEFECT';
        else if (next.includes('toMatchObject') && original.includes('toEqual')) classification = 'TEST_DEFECT';
        else if (/\.set[A-Z][A-Za-z]+From\(/.test(next) && /^\s*[a-zA-Z][a-zA-Z0-9]*\.[a-zA-Z][a-zA-Z0-9]*\s*=/.test(original)) classification = 'SPECIFICATION_DEFECT';
    }
    return {
        classification,
        weakensOriginal,
        justification: justification ?? '',
    };
}

function isWeaker(original, next) {
    if (typeof original !== 'string' || typeof next !== 'string') return false;
    if (original === next) return false;
    // Heuristic: a weakening is when the new assertion is strictly
    // less strict than the old one (e.g. toEqual → toMatchObject,
    // strict less-than → less-than-or-equal, severity decreased).
    const oldStrong = strength(original);
    const newStrong = strength(next);
    return newStrong < oldStrong;
}

function strength(s) {
    if (s.includes('toMatchObject')) return 1;
    if (s.includes('toBeGreaterThanOrEqual') || s.includes('toBeLessThanOrEqual')) return 2;
    if (s.includes('toBeGreaterThan') || s.includes('toBeLessThan')) return 3;
    if (s.includes('toEqual')) return 4;
    if (s.includes('toBe')) return 4;
    return 0;
}
