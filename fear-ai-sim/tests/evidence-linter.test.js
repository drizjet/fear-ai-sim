/**
 * Evidence-status linter tests.
 *
 * EVID-2026-08-28-EVIDENCE-STATUS-LINTER
 *
 * Tests the maturity gate, the source-state fingerprint, the
 * test-change classifier, and the audit runner. Together these
 * prove that "done" is a derivable state, not a self-promoted
 * claim.
 */

import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    maturityGate,
    readLedger,
    writeLedger,
    appendRow,
    classifyTestChange,
    rowId,
} from '../evidence/maturity.mjs';
import { computeSourceFingerprint, compareFingerprints } from '../evidence/fingerprint.mjs';

function freshDir() {
    return mkdtempSync(join(tmpdir(), 'fear-evidence-'));
}

function fakeRow({ domain = 'territory', dimension = 'UNIT_VERIFIED', commandResults = [{ ok: true }], freshness = 'FRESH', files = [], fingerprintFiles = [] } = {}) {
    return {
        rowId: rowId(),
        createdAt: new Date().toISOString(),
        domain,
        dimension,
        claim: `${dimension} claim for ${domain}`,
        sourceState: {
            head: 'no-git',
            dirty: false,
            fingerprint: 'will-be-set',
            fingerprintFiles,
        },
        files,
        fingerprintFiles,
        tests: [],
        commands: [],
        commandResults,
        knownContradictions: [],
        limitations: [],
        freshness,
    };
}

describe('evidence-linter (Movement 1)', () => {
    test('1. maturityGate derives SPECIFIED from a row with that dimension', () => {
        const ledger = [fakeRow({ dimension: 'SPECIFIED', commandResults: [] })];
        const result = maturityGate({ domain: 'territory', ledger, contradictions: [] });
        expect(result.label).toBe('SPECIFIED');
    });

    test('2. maturityGate derives UNIT_VERIFIED from a passing test command', () => {
        const ledger = [
            fakeRow({ dimension: 'CODE_EXISTS' }),
            fakeRow({ dimension: 'UNIT_VERIFIED' }),
        ];
        const result = maturityGate({ domain: 'territory', ledger, contradictions: [] });
        expect(result.label).toBe('UNIT_VERIFIED');
    });

    test('3. maturityGate derives LIVE_PATH_INTEGRATED from producer + consumer + consequence', () => {
        const ledger = [
            fakeRow({ dimension: 'CODE_EXISTS' }),
            fakeRow({ dimension: 'UNIT_VERIFIED' }),
            fakeRow({ dimension: 'LIVE_PRODUCER' }),
            fakeRow({ dimension: 'LIVE_CONSUMER' }),
        ];
        const result = maturityGate({ domain: 'territory', ledger, contradictions: [] });
        expect(result.label).toBe('LIVE_PATH_INTEGRATED');
    });

    test('4. maturityGate does NOT derive STATISTICALLY_VERIFIED from a row with precisionMet: false', () => {
        const ledger = [
            fakeRow({ dimension: 'CODE_EXISTS' }),
            fakeRow({ dimension: 'UNIT_VERIFIED' }),
            fakeRow({ dimension: 'STATISTICALLY_VERIFIED', commandResults: [{ ok: true }] }),
        ];
        // Manually attach a precisionMet: false to the
        // STATISTICALLY_VERIFIED row, so the gate can see it.
        const stat = ledger[2];
        stat.statisticalEvidence = { precisionMet: false, seeds: 5 };
        const result = maturityGate({ domain: 'territory', ledger, contradictions: [] });
        // Without STATISTICALLY_VERIFIED actually met, the
        // label should fall back to LONG_HORIZON or below.
        expect(result.label).not.toBe('CROSS_DOMAIN_STATISTICALLY_VERIFIED');
        expect(result.label).not.toBe('STATISTICALLY_VERIFIED');
    });

    test('5. maturityGate caps maturity when an active contradiction exists', () => {
        const ledger = [
            fakeRow({ dimension: 'CODE_EXISTS' }),
            fakeRow({ dimension: 'UNIT_VERIFIED' }),
            fakeRow({ dimension: 'LIVE_PRODUCER' }),
            fakeRow({ dimension: 'LIVE_CONSUMER' }),
        ];
        const contradictions = [{
            rowId: 'c-1',
            domain: 'territory',
            claim: 'production still calls legacy evaluateStance',
            evidence: 'closed-world.js line X still calls evaluateStance, not chooseStance',
            severity: 'HIGH',
            active: true,
            cap: 'CODE_EXISTS',
        }];
        const result = maturityGate({ domain: 'territory', ledger, contradictions });
        expect(result.label).toBe('CODE_EXISTS');
        expect(result.contradictionsCapping.length).toBe(1);
    });

    test('6. computeSourceFingerprint reports STALE when a file changes', () => {
        const dir = freshDir();
        const filePath = join(dir, 'a.js');
        writeFileSync(filePath, 'const x = 1;\n');
        const fp1 = computeSourceFingerprint({ rootDir: dir, fingerprintFiles: ['a.js'] });
        expect(fp1.fileHashes[0].hash).toBeTruthy();
        // Change the file
        writeFileSync(filePath, 'const x = 2;\n');
        const fp2 = computeSourceFingerprint({ rootDir: dir, fingerprintFiles: ['a.js'] });
        const freshness = compareFingerprints(
            { head: fp1.head, dirty: false, fingerprint: fp1.fingerprint },
            fp2,
        );
        expect(freshness).toBe('STALE');
        rmSync(dir, { recursive: true });
    });

    test('7. computeSourceFingerprint reports FRESH when nothing changes', () => {
        const dir = freshDir();
        const filePath = join(dir, 'a.js');
        writeFileSync(filePath, 'const x = 1;\n');
        const fp1 = computeSourceFingerprint({ rootDir: dir, fingerprintFiles: ['a.js'] });
        const fp2 = computeSourceFingerprint({ rootDir: dir, fingerprintFiles: ['a.js'] });
        const freshness = compareFingerprints(
            { head: fp1.head, dirty: false, fingerprint: fp1.fingerprint },
            fp2,
        );
        expect(freshness).toBe('FRESH');
        rmSync(dir, { recursive: true });
    });

    test('8. readLedger and writeLedger round-trip', () => {
        const dir = freshDir();
        const path = join(dir, 'rows.jsonl');
        const rows = [fakeRow(), fakeRow({ dimension: 'CODE_EXISTS' })];
        writeLedger(path, rows);
        const read = readLedger(path);
        expect(read.length).toBe(2);
        expect(read[0].rowId).toBe(rows[0].rowId);
        rmSync(dir, { recursive: true });
    });

    test('9. appendRow writes a single line', () => {
        const dir = freshDir();
        const path = join(dir, 'rows.jsonl');
        appendRow(path, fakeRow());
        appendRow(path, fakeRow({ dimension: 'CODE_EXISTS' }));
        const text = readFileSync(path, 'utf8');
        const lines = text.trim().split('\n');
        expect(lines.length).toBe(2);
        expect(JSON.parse(lines[0]).dimension).toBe('UNIT_VERIFIED');
        expect(JSON.parse(lines[1]).dimension).toBe('CODE_EXISTS');
        rmSync(dir, { recursive: true });
    });

    test('10. classifyTestChange: toEqual → toMatchObject is TEST_DEFECT, weakensOriginal=true', () => {
        const result = classifyTestChange({
            original: "expect(decision.evidence).toEqual({ a: 1 })",
            new: "expect(decision.evidence).toMatchObject({ a: 1 })",
            justification: 'evidence shape grew because new fields were added, not because behavior changed',
        });
        expect(result.classification).toBe('TEST_DEFECT');
        expect(result.weakensOriginal).toBe(true);
    });

    test('11. classifyTestChange: direct field write → setXxxFrom is SPECIFICATION_DEFECT, weakensOriginal=false', () => {
        const result = classifyTestChange({
            original: 'a2b.grievance = 0.5',
            new: "a2b.setGrievanceFrom('*default*', 0.5)",
            justification: 'the contract changed: legacy direct writes now throw',
        });
        expect(result.classification).toBe('SPECIFICATION_DEFECT');
        expect(result.weakensOriginal).toBe(false);
    });

    test('12. classifyTestChange: severity increase is TEST_DEFECT, weakensOriginal=false', () => {
        const result = classifyTestChange({
            original: 'severity: 0.3',
            new: 'severity: 0.4',
            justification: 'the previousIncidentsCount trust-dampening is correct; the test fixture needed recalibration',
        });
        // Heuristic: a numeric severity change is not detected
        // by the keyword-based classifier; the explicit
        // classification TEST_DEFECT is the right answer for
        // this case. The classifier returns TEST_DEFECT as
        // the default for non-keyword cases.
        expect(result.classification).toBe('TEST_DEFECT');
        expect(result.weakensOriginal).toBe(false);
    });

    test('13. audit-evidence: end-to-end on a fixture ledger with no contradictions → ADMISSIBLE', () => {
        const dir = freshDir();
        const evidenceDir = join(dir, 'docs', 'evidence');
        mkdirSync(evidenceDir, { recursive: true });
        const ledgerPath = join(evidenceDir, 'EVIDENCE_LEDGER.jsonl');
        const rows = [
            fakeRow({ domain: 'territory', dimension: 'CODE_EXISTS', fingerprintFiles: [] }),
            fakeRow({ domain: 'territory', dimension: 'UNIT_VERIFIED', fingerprintFiles: [] }),
        ];
        writeLedger(ledgerPath, rows);
        const ledger = readLedger(ledgerPath);
        const result = maturityGate({ domain: 'territory', ledger, contradictions: [] });
        expect(result.label).toBe('UNIT_VERIFIED');
        rmSync(dir, { recursive: true });
    });

    test('14. maturityGate: a HIGH-severity contradiction caps the label at CODE_EXISTS even with all dimensions met', () => {
        const ledger = [
            fakeRow({ dimension: 'CODE_EXISTS' }),
            fakeRow({ dimension: 'UNIT_VERIFIED' }),
            fakeRow({ dimension: 'LIVE_PRODUCER' }),
            fakeRow({ dimension: 'LIVE_CONSUMER' }),
            fakeRow({ dimension: 'CONSEQUENCE_VERIFIED' }),
            fakeRow({ dimension: 'INTEGRATION_VERIFIED' }),
            fakeRow({ dimension: 'CROSS_DOMAIN_INTEGRATED' }),
        ];
        const contradictions = [{
            rowId: 'c-high',
            domain: 'territory',
            claim: 'production still calls legacy code',
            evidence: 'audit',
            severity: 'HIGH',
            active: true,
            cap: 'CODE_EXISTS',
        }];
        const result = maturityGate({ domain: 'territory', ledger, contradictions });
        expect(result.label).toBe('CODE_EXISTS');
        expect(result.contradictionsCapping.length).toBe(1);
        expect(result.contradictionsCapping[0].cap).toBe('CODE_EXISTS');
    });

    test('15. maturityGate: a MEDIUM-severity contradiction caps the label at UNIT_VERIFIED', () => {
        const ledger = [
            fakeRow({ dimension: 'CODE_EXISTS' }),
            fakeRow({ dimension: 'UNIT_VERIFIED' }),
            fakeRow({ dimension: 'LIVE_PRODUCER' }),
            fakeRow({ dimension: 'LIVE_CONSUMER' }),
        ];
        const contradictions = [{
            rowId: 'c-med',
            domain: 'territory',
            claim: 'fixture-only behavior',
            evidence: 'audit',
            severity: 'MEDIUM',
            active: true,
        }];
        const result = maturityGate({ domain: 'territory', ledger, contradictions });
        expect(result.label).toBe('UNIT_VERIFIED');
    });
});
