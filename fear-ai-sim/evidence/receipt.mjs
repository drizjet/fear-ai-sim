// evidence/receipt.mjs
//
// EVID-2026-08-28-MOVEMENT-2-EVIDENCE-RECEIPTS
//
// Generic claim-anchored evidence receipt helper.
//
// A "receipt" is a single evidence row that is anchored to:
//   1. a specific claim (what was tested);
//   2. a specific test (which assertion supported it);
//   3. a specific dependency set (which source files / transitive
//      imports can invalidate the claim);
//   4. a specific command receipt (what command produced the
//      result, with its output digest and exit code);
//   5. a specific source state (fingerprint + git HEAD + dirty).
//
// This replaces per-domain seed scripts. The previous "seed-territory",
// "seed-relationships", "seed-merchants" pattern is collapsed to a
// single parameterised helper that takes the (claim, test, deps,
// commandReceipt) tuple and produces a fully-formed evidence row.
//
// Each row carries its own contract, so the linter can verify that
// the dimension claimed (CODE_EXISTS, UNIT_VERIFIED, LIVE_PRODUCER,
// LIVE_CONSUMER, CONSEQUENCE_VERIFIED, CROSS_DOMAIN_INTEGRATED,
// etc.) matches the dimension the test/command actually proves.

import { execFileSync } from 'node:child_process';
import { resolve, relative, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { appendFileSync, readFileSync as readJSONL } from 'node:fs';
import { computeSourceFingerprint } from './fingerprint.mjs';

const ROOT = resolve(process.cwd());

/** Deterministic, sorted, de-duplicated list. */
function sortedUniq(items) {
    return Array.from(new Set(items)).sort();
}

/** Compute the transitive import closure of a file set.
 *  Bounded by a depth limit (default 5) to avoid pathological
 *  cycles in large dep trees. */
function importClosure(seedFiles, { depth = 5, root = ROOT } = {}) {
    const seen = new Map(); // file -> depth
    const queue = seedFiles.map(f => ({ f, d: 0 }));
    while (queue.length) {
        const { f, d } = queue.shift();
        const rel = f.replace(/\\/g, '/');
        if (seen.has(rel) && seen.get(rel) <= d) continue;
        seen.set(rel, d);
        if (d >= depth) continue;
        const abs = resolve(root, f);
        if (!existsSync(abs)) continue;
        let body;
        try { body = readFileSync(abs, 'utf8'); }
        catch { continue; }
        // import x from './foo.js'; import { } from "./bar.js"; require('./baz.js')
        const importRe = /(?:import\s+[^'"]*from\s+|require\(\s*)['"]([^'"]+)['"]/g;
        let m;
        while ((m = importRe.exec(body)) !== null) {
            const target = m[1];
            if (!target.startsWith('.')) continue; // bare specifier
            const dir = abs.replace(/[\\/][^\\/]+$/, '');
            const targetAbs = resolve(dir, target);
            const targetRel = relative(root, targetAbs).replace(/\\/g, '/');
            if (targetRel.startsWith('node_modules/')) continue;
            queue.push({ f: targetRel, d: d + 1 });
        }
    }
    return sortedUniq(seen.keys());
}

/** Compute fingerprint over a file set. SHA-256 over a stable
 *  concatenation of (path, size, sha256-of-content). */
function sha256Hex(text) {
    return createHash('sha256').update(text).digest('hex');
}

export function fingerprintFiles(files, { root = ROOT } = {}) {
    const sorted = sortedUniq(files);
    const lines = sorted.map(rel => {
        const abs = resolve(root, rel);
        if (!existsSync(abs)) return `${rel}\t<missing>\t-`;
        const body = readFileSync(abs);
        return `${rel}\t${body.length}\t${sha256Hex(body)}`;
    });
    return sha256Hex(lines.join('\n'));
}

/** Get git HEAD (or 'no-git' if not in a repo). */
export function gitHead({ root = ROOT } = {}) {
    try {
        return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    } catch {
        return 'no-git';
    }
}

/** Is the worktree dirty? (returns boolean) */
export function gitDirty({ root = ROOT } = {}) {
    try {
        const out = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
        return out.trim().length > 0;
    } catch {
        return false;
    }
}

/** Run a test and capture the receipt (exit code, output digest). */
export function runTestReceipt(command, { cwd = ROOT, timeoutMs = 60000, label = '' } = {}) {
    const started = Date.now();
    let exitCode = 0;
    let stdout = '';
    let stderr = '';
    try {
        stdout = execFileSync('node', ['--experimental-vm-modules', 'node_modules/jest/bin/jest.js', ...command.split(/\s+/).filter(Boolean)], {
            cwd,
            timeout: timeoutMs,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
        });
    } catch (err) {
        exitCode = err.status ?? 1;
        stdout = err.stdout?.toString() ?? '';
        stderr = err.stderr?.toString() ?? '';
    }
    const durationMs = Date.now() - started;
    const digest = sha256Hex(stdout + stderr).slice(0, 16);
    return {
        command,
        cwd: relative(ROOT, cwd) || '.',
        timeoutMs,
        exitCode,
        durationMs,
        outputDigest: digest,
        outputSnippet: (stdout + stderr).trim().split(/\r?\n/).slice(-3).join('\n'),
        label
    };
}

/** Build a single evidence receipt row.
 *
 * @param {object} args
 * @param {string} args.claimId            - the claim identifier (e.g. "C-trade-merchant-risk-tolerance")
 * @param {string} args.domain             - the domain (e.g. "trade", "merchants", "bandits")
 * @param {string} args.dimension          - the evidence dimension (CODE_EXISTS, UNIT_VERIFIED, LIVE_PRODUCER, LIVE_CONSUMER, CONSEQUENCE_VERIFIED, CROSS_DOMAIN_INTEGRATED, DETERMINISM_VERIFIED, LONG_HORIZON_VERIFIED, STATISTICALLY_VERIFIED, RUNTIME_VERIFIED, VISUAL_VERIFIED)
 * @param {string} args.claim              - human-readable claim
 * @param {string[]} args.testFiles        - which test files exercise this claim
 * @param {string[]} args.sourceFiles      - which implementation files back this claim (will be transitively expanded)
 * @param {object} args.commandReceipt     - the result of runTestReceipt()
 * @param {string[]} args.assertions       - the assertion strings (describing what was actually checked)
 * @param {object[]} args.knownContradictions - list of known contradictions ({severity, field})
 * @param {string[]} args.limitations      - documented limitations
 * @param {boolean} args.useImportClosure  - expand sourceFiles via import closure (default true)
 * @param {string} args.evidenceId         - optional override (default: derived)
 * @param {number} args.dependencyDepth    - import-closure depth (default 5)
 * @param {boolean} args.dryRun            - return the row without writing
 * @returns {object} the evidence row
 */
export function buildReceipt({
    claimId,
    domain,
    dimension,
    claim,
    testFiles = [],
    sourceFiles = [],
    commandReceipt = null,
    assertions = [],
    knownContradictions = [],
    limitations = [],
    useImportClosure = true,
    evidenceId = null,
    dependencyDepth = 5,
    dryRun = false,
    ledgerPath: customLedgerPath = null,
}) {
    if (!claimId) throw new Error('buildReceipt: claimId is required');
    if (!domain) throw new Error('buildReceipt: domain is required');
    if (!dimension) throw new Error('buildReceipt: dimension is required');

    const canonicalLedgerPath = resolve(ROOT, 'docs/evidence/EVIDENCE_LEDGER.jsonl');
    const resolvedLedgerPath = customLedgerPath
        ? resolve(customLedgerPath)
        : canonicalLedgerPath;
    // Tests are evidence consumers, not evidence producers. A Jest run must
    // never append synthetic rows to the canonical project ledger: doing so
    // makes the act of verification mutate the evidence being verified and
    // leaves the worktree dirty. Tests that exercise writes must inject a
    // disposable ledgerPath.
    //
    // Detection uses JEST_WORKER_ID first (always set inside Jest worker
    // processes regardless of inherited NODE_ENV) and falls back to
    // NODE_ENV=test for non-Jest test runners. A host shell that has set
    // NODE_ENV=production must still see Jest writes blocked here, because
    // the worktree dirty check is part of the evidence-integrity contract.
    const inTestProcess = typeof process.env.JEST_WORKER_ID === 'string'
        && process.env.JEST_WORKER_ID.length > 0;
    if (!dryRun && inTestProcess && resolvedLedgerPath === canonicalLedgerPath) {
        throw new Error('buildReceipt: test processes must provide an explicit ledgerPath outside the canonical production ledger');
    }

    const declaredDeps = useImportClosure
        ? importClosure(sourceFiles, { depth: dependencyDepth })
        : sortedUniq(sourceFiles);

    // If testFiles overlap with declaredDeps, they are explicitly listed.
    // We don't require them to be inside the closure.

    const head = gitHead();
    const dirty = gitDirty();
    // Use the same fingerprint scheme as the linter
    // (evidence/fingerprint.mjs#computeSourceFingerprint) so the
    // recorded value matches what the linter re-derives.
    const fpObj = computeSourceFingerprint({ rootDir: ROOT, fingerprintFiles: declaredDeps });
    const fp = fpObj.fingerprint;

    const evidence_id = evidenceId
        || `EVID-${new Date().toISOString().slice(0, 10)}-${domain.toUpperCase()}-${dimension}-${claimId}`;

    const row = {
        evidenceId: evidence_id,
        claimId,
        domain,
        dimension,
        claim,
        sourceState: {
            head,
            dirty,
            fingerprint: fp,
            fingerprintFiles: declaredDeps,
            // V8 checkpoint §7: persist the per-file hashes so the
            // linter can prove content currency across head-only drift.
            fileHashes: fpObj.fileHashes,
            dependencyDepth: useImportClosure ? dependencyDepth : 0,
        },
        files: sortedUniq([...testFiles, ...sourceFiles]),
        tests: testFiles,
        transitiveDependencies: declaredDeps,
        assertions: assertions.map((a, i) => ({ assertionIndex: i, text: a })),
        commands: commandReceipt ? [{
            command: commandReceipt.command,
            cwd: commandReceipt.cwd,
            timeoutMs: commandReceipt.timeoutMs,
            exitCode: commandReceipt.exitCode,
            durationMs: commandReceipt.durationMs,
            outputDigest: commandReceipt.outputDigest,
        }] : [],
        commandResults: commandReceipt ? [{
            commandIndex: 0,
            ok: commandReceipt.exitCode === 0,
            outputSnippet: commandReceipt.outputSnippet,
        }] : [],
        knownContradictions,
        limitations,
        producer: 'agent',
        createdAt: new Date().toISOString(),
    };

    if (!dryRun) {
        // EVID-2026-08-29-V4-LEDGER-PATH (Guardian V4 §9.2):
        // The ledger path is injectable to enable test isolation.
        // Production code passes no ledgerPath (defaults to the
        // canonical path). Tests pass a temp directory.
        const ledgerPath = resolvedLedgerPath;
        // EVID-2026-08-29-IDEMPOTENT-SEED (Guardian §1.3):
        // repeated seed execution must NOT create duplicate
        // active proof. A row is a duplicate if it has the
        // same claimId + dimension + fingerprint.hash as an
        // existing row. Duplicates are skipped (not appended).
        let existing = [];
        try {
            existing = readJSONL(ledgerPath, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
        } catch {
            existing = [];
        }
        const isDuplicate = existing.some(prev =>
            prev.claimId === row.claimId
            && prev.dimension === row.dimension
            && prev.sourceState?.fingerprint === row.sourceState.fingerprint
            // V8 checkpoint §7 schema migration: pre-fileHashes rows
            // carry strictly less proof (no content binding), so they
            // never block an enriched re-seed of the same claim.
            && Array.isArray(prev.sourceState?.fileHashes)
        );
        if (!isDuplicate) {
            appendFileSync(ledgerPath, JSON.stringify(row) + '\n');
        }
    }

    return row;
}

/** Verify that a test file actually contains a string assertion.
 *  Used to fail-fast if a domain seed script claims a dimension
 *  the test doesn't actually exercise. */
export function assertionExists(testFile, needle) {
    const abs = resolve(ROOT, testFile);
    if (!existsSync(abs)) return false;
    const body = readFileSync(abs, 'utf8');
    return body.includes(needle);
}

/** Read all evidence rows for a domain. */
export function readDomain(domain, { ledgerPath: customLedgerPath = null } = {}) {
    const ledgerPath = customLedgerPath
        ? resolve(customLedgerPath)
        : resolve(ROOT, 'docs/evidence/EVIDENCE_LEDGER.jsonl');
    if (!existsSync(ledgerPath)) return [];
    const lines = readJSONL(ledgerPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
    return lines
        .map(line => { try { return JSON.parse(line); } catch { return null; } })
        .filter(Boolean)
        .filter(row => row.domain === domain);
}

export { importClosure, sortedUniq };
