import { buildReceipt } from '../evidence/receipt.mjs';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
process.env.FEAR_DEBUG_IDEMPOTENT = '1';

const tmpDir = mkdtempSync(join(tmpdir(), 'fear-'));
const ledgerPath = join(tmpDir, 'EVIDENCE_LEDGER.jsonl');
writeFileSync(ledgerPath, '');

const args = {
    claimId: 'C-test',
    domain: 'evidence',
    testFiles: ['tests/evidence-idempotency-integration.test.js'],
    sourceFiles: ['evidence/receipt.mjs'],
    command: 'node --test',
    commandReceipt: { exitCode: 0, outputSnippet: 'ok' },
    knownContradictions: [],
    limitations: [],
    ledgerPath,
};

const row1 = buildReceipt({ ...args, dimension: 'UNIT_VERIFIED' });
console.log('LEDGER AFTER 1:', readFileSync(ledgerPath, 'utf8').slice(0, 200));
console.log('row1.fingerprint:', row1.sourceState.fingerprint);
console.log('row1.claimId:', row1.claimId);

const after1 = readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean);
console.log('after1 length:', after1.length);
const parsed1 = after1.map(l => JSON.parse(l));
console.log('parsed1[0].fingerprint:', parsed1[0]?.sourceState?.fingerprint);
console.log('parsed1[0].claimId:', parsed1[0]?.claimId);
console.log('match:', parsed1[0]?.sourceState?.fingerprint === row1.sourceState.fingerprint && parsed1[0]?.claimId === row1.claimId);

const row2 = buildReceipt({ ...args, dimension: 'UNIT_VERIFIED' });
console.log('row2.fingerprint:', row2.sourceState.fingerprint);
const after2 = readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean);
console.log('after2 length:', after2.length);
