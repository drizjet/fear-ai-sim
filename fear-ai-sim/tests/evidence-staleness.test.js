import { describe, expect, test } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { computeSourceFingerprint } from '../evidence/fingerprint.mjs';

const LINTER = resolve(process.cwd(), 'evidence/lint.mjs');

function makeFixture() {
    const rootDir = mkdtempSync(join(tmpdir(), 'fear-evidence-stale-'));
    const evidenceDir = join(rootDir, 'docs', 'evidence');
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(join(rootDir, 'source.js'), 'export const value = 1;\n');
    writeFileSync(join(rootDir, 'docs', 'DOMAIN_MATURITY.md'), '| evidence-test | CODE_EXISTS | fixture | none | none |\n');
    writeFileSync(join(evidenceDir, 'CONTRADICTIONS.jsonl'), '');

    const sourceState = computeSourceFingerprint({
        rootDir,
        fingerprintFiles: ['source.js'],
    });
    const row = {
        evidenceId: 'EVID-MUT-EVID-002-FIXTURE',
        claimId: 'MUT-EVID-002',
        domain: 'evidence-test',
        dimension: 'CODE_EXISTS',
        claim: 'source.js contains the verified implementation',
        sourceState: {
            head: sourceState.head,
            dirty: sourceState.dirty,
            fingerprint: sourceState.fingerprint,
            fingerprintFiles: ['source.js'],
        },
        files: ['source.js'],
        transitiveDependencies: ['source.js'],
        commandResults: [{ ok: true }],
        knownContradictions: [],
    };
    writeFileSync(join(evidenceDir, 'EVIDENCE_LEDGER.jsonl'), JSON.stringify(row) + '\n');
    return rootDir;
}

function runAudit(rootDir) {
    return spawnSync(process.execPath, [LINTER, '--root', rootDir], {
        cwd: process.cwd(),
        encoding: 'utf8',
    });
}

describe('MUT-EVID-002 stale evidence rejection', () => {
    test('fresh declared support is admissible', () => {
        const rootDir = makeFixture();
        try {
            const result = runAudit(rootDir);
            expect(result.status).toBe(0);
            const report = JSON.parse(result.stdout);
            expect(report.domains['evidence-test']).toMatchObject({
                admissible: 1,
                stale: 0,
            });
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    test('changing a declared source makes the receipt stale and fails the audit', () => {
        const rootDir = makeFixture();
        try {
            // Non-vacuous witness: the recorded S0 source existed and was
            // fingerprinted; this edit creates a distinct S1 payload.
            writeFileSync(join(rootDir, 'source.js'), 'export const value = 2;\n');
            const result = runAudit(rootDir);
            const report = JSON.parse(result.stdout);
            expect(report.domains['evidence-test']).toMatchObject({
                admissible: 0,
                stale: 1,
            });
            expect(result.status).not.toBe(0);
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });
});
