// Separate invariant for the F2 ledger leak: the suite must not be able to
// append synthetic rows to the canonical production ledger again. This test
// does not exercise the writers (it would then be the cause it detects) —
// it statically gates the bypass vectors around the runtime guard.
// Production code enforces the guard itself: receipt.mjs buildReceipt
// throws inside test processes unless given an explicit ledgerPath outside
// the canonical ledger, and the receipt-helper suite proves the ledger
// stays byte-identical across the blocked write.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The guard suite names the canonical ledger only to snapshot its bytes
// before/after a blocked write (read-only). Nothing else may name it.
// This invariant file itself is allowlisted: it names the path only to
// forbid it and performs no writes.
const CANONICAL_PATH_ALLOWLIST = new Set(['evidence-receipt-helper.test.js', 'evidence-ledger-isolation.test.js']);

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const SELF = 'evidence-ledger-isolation.test.js';

function testFiles() {
    return readdirSync(TESTS_DIR).filter(f => f.endsWith('.test.js'));
}

function read(name) {
    return readFileSync(join(TESTS_DIR, name), 'utf8');
}

describe('production evidence ledger isolation (audit F2 invariant)', () => {
    test('only the guard suite names the canonical ledger path', () => {
        const offenders = testFiles()
            .filter(f => !CANONICAL_PATH_ALLOWLIST.has(f))
            .filter(f => read(f).includes('docs/evidence/EVIDENCE_LEDGER'));
        expect(offenders).toEqual([]);
    });

    test('maturity row-writer importers never touch docs/evidence paths', () => {
        // evidence-linter.test.js imports appendRow from maturity.mjs but
        // writes strictly to mkdtempSync directories. If a future test
        // pairs that import with a docs/evidence path, the canonical
        // ledger becomes writable around the buildReceipt guard.
        const offenders = testFiles()
            .filter(f => f !== SELF)
            .filter(f => read(f).includes("from '../evidence/maturity.mjs'"))
            .filter(f => read(f).includes('docs/evidence'));
        expect(offenders).toEqual([]);
    });

    test('no test bypasses buildReceipt with a direct canonical append', () => {
        // appendFileSync/writeFileSync to temp dirs is the isolated
        // pattern; only a canonical-path write is forbidden, and the
        // first test already forbids naming that path.
        const offenders = testFiles()
            .filter(f => !CANONICAL_PATH_ALLOWLIST.has(f))
            .filter(f => f !== SELF)
            .filter(f => read(f).includes('EVIDENCE_LEDGER.jsonl')
                && !read(f).includes('tmpdir()'));
        expect(offenders).toEqual([]);
    });
});
