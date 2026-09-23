import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

// RESP-SOURCE-ABSENT-RECONCILIATION-001 — the four remaining SOURCE_ABSENT ledger rows are
// dispositioned against the legacy monorepo tree (origin/master:fear-ai-sim/): every cited file
// is blob+sha256 pinned in docs/SOURCE_ABSENT_RECONCILIATION.md, every ledger row cites that
// manifest, and no legacy source has been extracted into this checkout. The guard re-resolves
// the upstream blobs on every run (CI fetches with fetch-depth: 0), so drift on either branch —
// a row added/removed, a blob rewritten, a file silently copied in — fails the gate.
// Mutants pinned: manifest row set diverges from ledger; a blob id swapped without its sha256;
// a manifest source extracted locally; a ledger row losing its upstream provenance.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'docs', 'SOURCE_ABSENT_RECONCILIATION.md');
const LEDGER = path.join(ROOT, 'completion-ledger.md');

const git = (...args) =>
    spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const gitBuffer = (...args) =>
    spawnSync('git', args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });

const parseManifest = () => {
    const lines = fs.readFileSync(MANIFEST, 'utf8').split('\n');
    const start = lines.findIndex(line => line.startsWith('## Manifest'));
    if (start === -1) throw new Error('manifest doc has no "## Manifest" section');
    const rest = lines.slice(start + 1);
    const nextHeading = rest.findIndex(line => line.startsWith('## ')); // stop before Dispositions
    return (nextHeading === -1 ? rest : rest.slice(0, nextHeading))
        .filter(line => line.startsWith('|'))
        .map(line => line.split('|').map(cell => cell.trim()))
        .filter(cells => cells[1] && cells[1] !== 'file' && !/^[- ]+$/.test(cells[1]))
        .map(cells => ({
            file: cells[1],
            blob: cells[2],
            sha256: cells[3],
            presence: cells[4],
            rows: cells[5],
        }));
};

const parseSourceAbsentRows = () => {
    const rows = [];
    for (const line of fs.readFileSync(LEDGER, 'utf8').split('\n')) {
        if (!line.startsWith('|')) continue;
        const cells = line.split('|').map(cell => cell.trim());
        const statusIndex = cells.indexOf('SOURCE_ABSENT');
        if (statusIndex > 0) rows.push({ name: cells[statusIndex - 1], evidence: cells[statusIndex + 1], remaining: cells[statusIndex + 2] });
    }
    return rows;
};

describe('SOURCE_ABSENT reconciliation manifest', () => {
    it('covers exactly the SOURCE_ABSENT ledger rows, with valid presence and digests', () => {
        const ledgerRows = parseSourceAbsentRows();
        expect(ledgerRows.map(row => row.name).sort()).toEqual([
            'Brain scale cleanup',
            'FearCore live transitions',
            'Simulation/agents/combat',
            'VR/biofeedback',
        ]); // four remaining SOURCE_ABSENT rows — Habituation, then Hysteresis, then Neural fear left via the re-open procedure 2026-09-23 (mutant: a row added/dropped → fails here)

        const entries = parseManifest();
        expect(entries.length).toBe(8); // habituation.js, hysteresis.js, neuralfear.js and neuralnet.js were extracted, so they left the manifest
        for (const entry of entries) {
            expect(['PRESENT', 'ABSENT_BOTH']).toContain(entry.presence); // mutant: presence mislabeled
            expect(entry.rows.length).toBeGreaterThan(0);
            if (entry.presence === 'PRESENT') {
                expect(entry.blob).toMatch(/^[0-9a-f]{40}$/);
                expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
            } else {
                expect(entry.blob).toBe('ABSENT');
                expect(entry.sha256).toBe('ABSENT');
            }
        }

        const manifestRowSet = new Set(
            entries.flatMap(entry => entry.rows.split(',').map(name => name.trim())),
        );
        const ledgerRowSet = new Set(ledgerRows.map(row => row.name));
        expect([...manifestRowSet].sort()).toEqual([...ledgerRowSet].sort());
    });

    it('every PRESENT entry resolves on origin/master with the recorded blob and sha256', () => {
        const entries = parseManifest();
        for (const entry of entries) {
            const upstreamPath = `origin/master:fear-ai-sim/${entry.file}`;
            if (entry.presence === 'PRESENT') {
                const rev = git('rev-parse', upstreamPath); // mutant: blob id swapped → digest mismatch
                expect(rev.status).toBe(0);
                expect(rev.stdout.trim()).toBe(entry.blob);
                const blob = gitBuffer('cat-file', 'blob', entry.blob);
                expect(blob.status).toBe(0);
                const digest = crypto.createHash('sha256').update(blob.stdout).digest('hex');
                expect(digest).toBe(entry.sha256);
            } else {
                const rev = git('rev-parse', upstreamPath);
                expect(rev.status).not.toBe(0); // ABSENT_BOTH: the path exists in neither tree
            }
        }

        // FearBand (Rust) has no source anywhere: 0 upstream paths match.
        const listing = git('ls-tree', '-r', 'origin/master', '--name-only');
        expect(listing.status).toBe(0);
        const fearband = listing.stdout.split('\n').filter(line => /fearband|fear_band|fear-band/i.test(line));
        expect(fearband).toEqual([]);
    });

    it('no manifest source has been extracted into this checkout', () => {
        const entries = parseManifest();
        const extracted = entries
            .map(entry => entry.file)
            .filter(file => fs.existsSync(path.join(ROOT, file)));
        expect(extracted).toEqual([]); // designed tripwire: extraction is an explicit, owned act
    });

    it('each ledger row carries upstream provenance and cites the manifest for re-open', () => {
        for (const row of parseSourceAbsentRows()) {
            expect(row.evidence).toMatch(/blob [0-9a-f]{40}|ls-tree probe: 0/); // mutant: provenance stripped
            expect(row.evidence).toMatch(/upstream|origin\/master/);
            expect(row.remaining).toContain('docs/SOURCE_ABSENT_RECONCILIATION.md');
        }
    });
});
