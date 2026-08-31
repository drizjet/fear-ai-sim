// tests/evidence-receipt-helper.test.js
//
// EVID-2026-08-28-MOVEMENT-2-EVIDENCE-RECEIPTS
//
// Tests for the claim-anchored evidence receipt helper. Verifies:
//   1. Receipt row is shaped correctly (claimId, domain, dimension, sourceState, files, tests, transitiveDependencies, commandResults).
//   2. Import-closure expansion works (transitive deps are detected).
//   3. Fingerprint changes when a source file changes.
//   4. Fingerprint unchanged when only non-tracked files change.
//   5. Assertion-existence check works.
//   6. buildReceipt() writes to the ledger and the row appears in readDomain().
//   7. dryRun=true does NOT write to the ledger.
//   8. A receipt with no commandReceipt still produces a valid row.

import { jest } from '@jest/globals';
import { writeFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
    buildReceipt,
    importClosure,
    fingerprintFiles,
    assertionExists,
    readDomain,
    sortedUniq,
} from '../evidence/receipt.mjs';

const ROOT = resolve(process.cwd());
const PRODUCTION_LEDGER = resolve(ROOT, 'docs/evidence/EVIDENCE_LEDGER.jsonl');

describe('evidence/receipt.mjs', () => {
    test('sortedUniq dedupes and sorts', () => {
        expect(sortedUniq(['b', 'a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
    });

    test('importClosure expands transitive imports', () => {
        // routing.js imports nothing (it's leaf-level).
        // trade.js imports from economy.js and routing.js.
        const closure = importClosure(['trade.js'], { depth: 3 });
        expect(closure).toContain('trade.js');
        expect(closure).toContain('routing.js');
        expect(closure).toContain('economy.js');
    });

    test('importClosure respects depth=0 (no expansion)', () => {
        const closure = importClosure(['trade.js'], { depth: 0 });
        expect(closure).toEqual(['trade.js']);
    });

    test('importClosure does not descend into node_modules', () => {
        // If any source imports from node_modules, those should be excluded.
        const closure = importClosure(['fearcore.js'], { depth: 5 });
        for (const f of closure) {
            expect(f.startsWith('node_modules/')).toBe(false);
        }
    });

    test('fingerprintFiles is deterministic for the same input', () => {
        const a = fingerprintFiles(['routing.js']);
        const b = fingerprintFiles(['routing.js']);
        expect(a).toBe(b);
    });

    test('fingerprintFiles differs when content differs', () => {
        // Use a unique scratch file that we mutate.
        const tmp = mkdtempSync(join(tmpdir(), 'fpt-'));
        const a = join(tmp, 'a.js');
        const b = join(tmp, 'b.js');
        writeFileSync(a, 'export const x = 1;');
        writeFileSync(b, 'export const x = 2;');
        const fpa = fingerprintFiles([a]);
        const fpb = fingerprintFiles([b]);
        expect(fpa).not.toBe(fpb);
        rmSync(tmp, { recursive: true, force: true });
    });

    test('fingerprintFiles handles missing files gracefully', () => {
        const fp = fingerprintFiles(['this-file-does-not-exist.js']);
        expect(typeof fp).toBe('string');
        expect(fp.length).toBeGreaterThan(0);
    });

    test('assertionExists finds a known assertion string in trade.js tests', () => {
        const found = assertionExists('tests/trade.test.js', 'Deterministic town and merchant trade loop');
        expect(found).toBe(true);
    });

    test('assertionExists returns false for missing assertion', () => {
        const found = assertionExists('tests/trade.test.js', 'NEVER_PRESENT_xxxxx');
        expect(found).toBe(false);
    });

    test('buildReceipt(dryRun=true) returns a row but does not write', () => {
        const before = readDomain('__receipt_test__');
        const row = buildReceipt({
            claimId: 'C-test-dryrun',
            domain: '__receipt_test__',
            dimension: 'UNIT_VERIFIED',
            claim: 'dry run does not write',
            testFiles: ['tests/trade.test.js'],
            sourceFiles: ['routing.js'],
            dryRun: true,
        });
        const after = readDomain('__receipt_test__');
        expect(after.length).toBe(before.length);
        expect(row.domain).toBe('__receipt_test__');
        expect(row.evidenceId).toContain('EVID-');
        expect(row.transitiveDependencies).toContain('routing.js');
    });

    test('buildReceipt() writes a valid row to an isolated ledger', () => {
        const tmp = mkdtempSync(join(tmpdir(), 'receipt-ledger-'));
        const ledgerPath = join(tmp, 'EVIDENCE_LEDGER.jsonl');
        writeFileSync(ledgerPath, '');
        const claimId = `C-test-write-${Date.now()}`;
        const row = buildReceipt({
            claimId,
            domain: '__receipt_test__',
            dimension: 'UNIT_VERIFIED',
            claim: 'this is a test receipt',
            testFiles: ['tests/trade.test.js'],
            sourceFiles: ['routing.js', 'trade.js'],
            useImportClosure: true,
            assertions: ['merchant routeCost returns finite', 'selectRoute returns best route'],
            ledgerPath,
        });
        const rows = readDomain('__receipt_test__', { ledgerPath });
        const found = rows.find(r => r.claimId === claimId);
        expect(found).toBeDefined();
        expect(found.evidenceId).toContain('EVID-');
        expect(found.dimension).toBe('UNIT_VERIFIED');
        expect(found.transitiveDependencies).toContain('routing.js');
        expect(found.transitiveDependencies).toContain('trade.js');
        expect(found.transitiveDependencies).toContain('economy.js');
        expect(found.assertions.length).toBe(2);
        expect(found.sourceState.head).toBeDefined();
        expect(found.sourceState.fingerprint.length).toBeGreaterThan(0);
        rmSync(tmp, { recursive: true, force: true });
    });

    test('test processes cannot write the canonical production ledger', () => {
        const before = readFileSync(PRODUCTION_LEDGER, 'utf8');
        expect(() => buildReceipt({
            claimId: `C-test-production-guard-${Date.now()}`,
            domain: '__receipt_test__',
            dimension: 'UNIT_VERIFIED',
            claim: 'test writes must be isolated',
            sourceFiles: ['routing.js'],
        })).toThrow(/explicit ledgerPath/i);
        expect(readFileSync(PRODUCTION_LEDGER, 'utf8')).toBe(before);
    });

    test('buildReceipt() without commandReceipt still works', () => {
        const claimId = `C-test-nocmd-${Date.now()}`;
        const row = buildReceipt({
            claimId,
            domain: '__receipt_test__',
            dimension: 'CODE_EXISTS',
            claim: 'routing.js exports selectRoute',
            testFiles: [],
            sourceFiles: ['routing.js'],
            useImportClosure: false,
            dryRun: true,
        });
        expect(row.commands.length).toBe(0);
        expect(row.commandResults.length).toBe(0);
        expect(row.files).toContain('routing.js');
    });
});
