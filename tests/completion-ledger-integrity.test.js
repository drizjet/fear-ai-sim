import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

// RESP-LEDGER-STALE-CLAIMS-AUDIT-001 — durable guard against stale file claims: every file
// cited in a healthy row must exist, while SOURCE_ABSENT rows may only cite files that are
// provably absent (that absence IS their evidence). Status vocabulary stays closed.
// Mutant pinned: phantom citation added to a verified row.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = fs.readFileSync(path.join(ROOT, 'completion-ledger.md'), 'utf8');

const STATUSES = new Set([
    'IMPLEMENTED_AND_VERIFIED', 'PARTIALLY_IMPLEMENTED', 'PROPOSED', 'ACTIVE',
    'UNKNOWN', 'IMPLEMENTED_BUT_DEAD_CODE', 'SOURCE_ABSENT', 'BLOCKED_EXTERNAL',
]);

const rows = LEDGER.split('\n')
    .filter(line => line.startsWith('| ') && !line.startsWith('|---') && !line.startsWith('| Area'))
    .map(line => {
        const [, area, status, evidence, remaining] = line.split('|').map(cell => cell.trim());
        return { area, status, evidence, remaining, citations: evidence.match(/[\w./-]+\.(?:m?js|md|txt)\b/g) ?? [] };
    });

describe('RESP-LEDGER-STALE-CLAIMS-AUDIT-001: completion ledger integrity', () => {
    it('parses every data row with the expected shape and a valid status', () => {
        expect(rows.length).toBeGreaterThanOrEqual(29);
        for (const row of rows) {
            expect(row.area).toBeTruthy();
            expect(STATUSES.has(row.status)).toBe(true);
            expect(row.evidence).toBeTruthy();
            expect(row.remaining).toBeTruthy();
        }
    });

    it('cited files exist — except SOURCE_ABSENT rows, which may only cite absent files', () => {
        const violations = [];
        for (const row of rows) {
            for (const citation of row.citations) {
                const exists = fs.existsSync(path.join(ROOT, citation));
                if (row.status === 'SOURCE_ABSENT' && exists) {
                    violations.push(`SOURCE_ABSENT row "${row.area}" cites existing file ${citation} — re-verify it instead`);
                }
                if (row.status !== 'SOURCE_ABSENT' && !exists) {
                    violations.push(`row "${row.area}" cites missing file ${citation} — retract or fix the citation`);
                }
            }
        }
        expect(violations).toEqual([]);
    });

    it('the two remaining stale rows are explicitly retracted or blocked with absence evidence', () => {
        const retracted = rows.filter(row => row.status === 'SOURCE_ABSENT').map(row => row.area).sort();
        // Habituation, Hysteresis, Neural fear, FearCore and Brain scale cleanup all left
        // SOURCE_ABSENT on 2026-09-23 through the re-open procedure (extract byte-exact + V8
        // integration) — the row list is strict so a third can only appear here.
        expect(retracted).toEqual(['Simulation/agents/combat', 'VR/biofeedback']);
        expect(rows.find(row => row.area === 'Habituation').status).toBe('IMPLEMENTED_AND_VERIFIED'); // re-opened row
        expect(rows.find(row => row.area === 'Hysteresis').status).toBe('IMPLEMENTED_AND_VERIFIED'); // second re-opened row
        expect(rows.find(row => row.area === 'Neural fear').status).toBe('IMPLEMENTED_AND_VERIFIED'); // third re-opened row
        expect(rows.find(row => row.area === 'FearCore live transitions').status).toBe('IMPLEMENTED_AND_VERIFIED'); // fourth re-opened row
        expect(rows.find(row => row.area === 'Brain scale cleanup').status).toBe('IMPLEMENTED_AND_VERIFIED'); // shares the fourth row's source
        for (const row of rows.filter(item => item.status === 'SOURCE_ABSENT')) {
            expect(row.evidence).toMatch(/absent|retracted|no workflow/i);
            expect(row.remaining).toMatch(/Re-open only when the cited sources exist|workflow file/i);
        }
        expect(rows.find(row => row.area === 'Knowledge DB writeback').status).toBe('BLOCKED_EXTERNAL');
        // the CI row left SOURCE_ABSENT once .github/workflows/ci.yml landed (2026-09-22 audit wave)
        expect(rows.find(row => row.area === 'CI').status).not.toBe('SOURCE_ABSENT');
        // previously-verified claims must not linger on absent sources
        expect(rows.find(row => row.area === 'Simulation/agents/combat').status).not.toBe('IMPLEMENTED_AND_VERIFIED');
    });
});
