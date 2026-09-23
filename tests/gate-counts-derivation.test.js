import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';
import { citationMismatches } from '../tools/gate-counts.mjs';

// RESP-GATE-COUNT-DERIVATION-001 — the gate counts in the four orientation docs are derived from the
// test runner instead of being hand-maintained. `npm run gate:sync` runs the suite with jest's
// machine-readable reporter and writes what it saw into `docs/GATE_COUNTS.json` plus the live gate
// sentences; `npm run gate:check` re-derives and fails the build if anything is stale (CI runs it).
//
// This suite is the offline half of that contract: it cannot run jest from inside jest, so it pins
// what IS verifiable here — that the documents agree with the machine-written artifact, that the
// artifact accounts for every suite on disk, that no citation contradicts the artifact's per-suite
// counts, and that the mechanism itself is still wired. The runner half lives in `gate:check`.
//
// The attribution helpers are pinned against the two mistakes this tool actually made before it
// worked: a blanket "N suites / M tests" rewrite silently rewrote FROZEN HISTORY (this repository's
// audit narrative records the gate as it stood on the day — "142 suites / 405 tests", "144 suites /
// 421 tests"), and a naive nearest-match read "`tests/x.test.js` 9/9 with 12/12 negative controls" as
// a 12-case suite. Both classes are negative controls below.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const artifact = JSON.parse(read('docs/GATE_COUNTS.json'));
const GATE_DOCS = ['README.md', 'docs/CAMPAIGN_STATE.md', 'docs/FEAR_AI_GLOBAL_WORK_LEDGER.md', 'docs/IMPLEMENTATION_STATUS_2026-08-26.md'];
const CITED_DOCS = [...GATE_DOCS, 'completion-ledger.md', 'docs/SOURCE_ABSENT_RECONCILIATION.md'];
const gateOf = text => {
    const match = text.match(/(\d+)\s*suites\s*\/\s*(\d+)\s*tests/);
    return match ? { suites: Number(match[1]), tests: Number(match[2]) } : null;
};

describe('RESP-GATE-COUNT-DERIVATION-001: the docs borrow their gate counts from the runner', () => {
    it('reads a citation\'s case count from the nearest equal pair, and leaves what the runner cannot know alone', () => {
        // The exact sentence shape that exposed the mis-read: 9 is the suite, 12 is the mutants.
        expect(citationMismatches('`tests/x.test.js` 9/9 with 12/12 negative controls', { 'x.test.js': 9 })).toEqual([]);
        expect(citationMismatches('`tests/x.test.js` 9/9 with 12/12 negative controls', { 'x.test.js': 10 })).toEqual([{ file: 'x.test.js', claimed: 9, actual: 10 }]);
        // "`a.test.js`, `b.test.js` (3/3)" belongs to b, the suite the count was written for.
        expect(citationMismatches('`a.test.js`, `tests/b.test.js` (3/3)', { 'a.test.js': 6, 'b.test.js': 2 })).toEqual([{ file: 'b.test.js', claimed: 3, actual: 2 }]);
        // Frozen history stays frozen: an unequal pair is a stale GATE, not a suite's case count.
        expect(citationMismatches('the pointer drifted to `doc.test.js` 142/405 unguarded', { 'doc.test.js': 4 })).toEqual([]);
        // A citation with no pair is not an assertion about anything.
        expect(citationMismatches('`tests/y.test.js` describes the tool', { 'y.test.js': 7 })).toEqual([]);
    });

    it('keeps all four orientation docs on the gate the runner last reported', () => {
        expect(Number.isInteger(artifact.suites)).toBe(true);
        expect(Number.isInteger(artifact.tests)).toBe(true);
        expect(artifact.suites).toBeGreaterThan(100);
        for (const doc of GATE_DOCS) {
            expect(gateOf(read(doc))).toEqual({ suites: artifact.suites, tests: artifact.tests });
        }
    });

    it('accounts for every suite on disk, so a new suite cannot quietly miss the artifact', () => {
        const onDisk = fs.readdirSync(path.join(ROOT, 'tests')).filter(name => name.endsWith('.test.js')).sort();
        const recorded = Object.keys(artifact.casesByFile).sort();
        expect(recorded).toEqual(onDisk);
        expect(recorded.every(name => Number.isInteger(artifact.casesByFile[name]) && artifact.casesByFile[name] > 0)).toBe(true);
        expect(Object.values(artifact.casesByFile).reduce((sum, cases) => sum + cases, 0)).toBe(artifact.tests);
    });

    it('finds no cited case count that contradicts the artifact', () => {
        // The stale-count class this whole mechanism exists for, checked offline over every doc that
        // cites suites. `gate:check` re-runs the suites themselves; this catches the prose in between.
        const stale = CITED_DOCS.flatMap(doc => citationMismatches(read(doc), artifact.casesByFile).map(mismatch => `${doc}: ${mismatch.file} cited at ${mismatch.claimed}, artifact says ${mismatch.actual}`));
        expect(stale).toEqual([]);
    });

    it('is wired to the scripts, the CI workflow and the docs, so it cannot be deleted by accident', () => {
        const scripts = JSON.parse(read('package.json')).scripts;
        expect(scripts['gate:sync']).toBe('node tools/gate-counts.mjs');
        expect(scripts['gate:check']).toBe('node tools/gate-counts.mjs --check');
        const ci = read('.github/workflows/ci.yml');
        expect(ci).toContain('npm run gate:check');
        expect(read('README.md')).toContain('tools/gate-counts.mjs');
        const tool = read('tools/gate-counts.mjs');
        // The two derived numbers are the runner's own, not a constant someone can edit.
        expect(tool).toContain('numTotalTestSuites');
        expect(tool).toContain('numTotalTests');
        expect(tool).toContain('--check');
    });
});
