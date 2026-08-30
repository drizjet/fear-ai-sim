// tests/evidence-idempotency-integration.test.js
//
// EVID-2026-08-29-MUTATION-VERIFIED-IDEMPOTENCY (Guardian V4 §5):
// Integration test for the idempotency contract. This test
// actually invokes the production `buildReceipt` function
// from evidence/receipt.mjs with the production WRITE PATH
// (not dryRun) to a temp ledger. It verifies that running
// buildReceipt twice with the same inputs produces exactly
// one row. This is the protected test for MUT-EVID-001.

import { describe, it, expect } from '@jest/globals';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildReceipt } from '../evidence/receipt.mjs';

describe('evidence idempotency integration (Guardian V4 §5 MUT-EVID-001)', () => {

    it('re-seeding the same claim+dimension+fingerprint produces exactly one row in the ledger', () => {
        // V4 §9.2: use a temp directory so we don't pollute the
        // real ledger. The receipt helper accepts an injectable
        // ledgerPath via the options parameter.
        const tmpDir = mkdtempSync(join(tmpdir(), 'fear-evidence-int-'));
        const ledgerPath = join(tmpDir, 'EVIDENCE_LEDGER.jsonl');
        // Initialize the ledger as an empty file (the receipt
        // helper reads it with existsSync check).
        writeFileSync(ledgerPath, '');

        const baseArgs = {
            claimId: 'C-int-test',
            domain: 'evidence',
            testFiles: ['tests/evidence-idempotency-integration.test.js'],
            sourceFiles: ['evidence/receipt.mjs'],
            command: 'node --test',
            commandReceipt: { exitCode: 0, outputSnippet: 'ok' },
            knownContradictions: [],
            limitations: [],
        };

        // First call: should append the row.
        buildReceipt({ ...baseArgs, dimension: 'UNIT_VERIFIED', ledgerPath });
        const after1 = readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean);
        expect(after1.length).toBe(1);

        // Second call with the SAME inputs: should be a duplicate,
        // NOT appended.
        buildReceipt({ ...baseArgs, dimension: 'UNIT_VERIFIED', ledgerPath });
        const after2 = readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean);
        expect(after2.length).toBe(1);

        // Third call with a DIFFERENT dimension: should append.
        buildReceipt({ ...baseArgs, dimension: 'CODE_EXISTS', ledgerPath });
        const after3 = readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean);
        expect(after3.length).toBe(2);
    });
});
