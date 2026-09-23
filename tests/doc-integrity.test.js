import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

// RESP-INFO-DOC-CONSISTENCY-001 — the orientation docs must agree with each other and with the
// repository: gate counts identical across README/CAMPAIGN_STATE/work ledger/IMPLEMENTATION_STATUS
// (all four — the superseded snapshot still states a 'Current gate' pointer, which is how 142/405
// drifted unguarded), the suite count equal to the actual test files on disk, doc-map targets and
// contract-suite references all existing, and the next responsibility identical in the campaign
// state and the work ledger.
// Mutants pinned: README gate number drifted; doc-map target renamed; next-responsibility ids
// disagree; IMPLEMENTATION_STATUS gate pointer drifted (was live at 142/405).

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const README = read('README.md');
const CAMPAIGN = read('docs/CAMPAIGN_STATE.md');
const LEDGER = read('docs/FEAR_AI_GLOBAL_WORK_LEDGER.md');
const IMPL = read('docs/IMPLEMENTATION_STATUS_2026-08-26.md');

const gateOf = text => {
    const match = text.match(/(\d+)\s*suites\s*\/\s*(\d+)\s*tests/);
    return match ? { suites: Number(match[1]), tests: Number(match[2]) } : null;
};

describe('RESP-INFO-DOC-CONSISTENCY-001: orientation docs agree with each other and the repo', () => {
    it('all four docs declare the same gate, and the suite count matches the files on disk', () => {
        const gates = { README: gateOf(README), CAMPAIGN: gateOf(CAMPAIGN), LEDGER: gateOf(LEDGER), IMPLEMENTATION: gateOf(IMPL) };
        expect(gates.README).not.toBeNull();
        expect(gates.CAMPAIGN).toEqual(gates.README);
        expect(gates.LEDGER).toEqual(gates.README);
        expect(gates.IMPLEMENTATION).not.toBeNull();
        expect(gates.IMPLEMENTATION).toEqual(gates.README);
        const onDisk = fs.readdirSync(path.join(ROOT, 'tests')).filter(name => name.endsWith('.test.js')).length;
        expect(gates.README.suites).toBe(onDisk);
    });

    it('README doc-map targets exist on disk', () => {
        const targets = [
            'README.md',
            'docs/CAMPAIGN_STATE.md',
            'docs/FEAR_AI_GLOBAL_WORK_LEDGER.md',
            'completion-ledger.md',
            'docs/IMPLEMENTATION_STATUS_2026-08-26.md',
            '.agents/fear-ai-autopilot.mjs',
        ];
        for (const target of targets) {
            expect(README).toContain(target);
            expect(fs.existsSync(path.join(ROOT, target))).toBe(true);
        }
    });

    it('every test suite referenced in the README exists on disk', () => {
        const refs = [...README.matchAll(/([\w.-]+\.test\.js)/g)].map(match => match[1]);
        expect(refs.length).toBeGreaterThanOrEqual(10);
        const missing = refs.filter(name => !fs.existsSync(path.join(ROOT, 'tests', name)));
        expect(missing).toEqual([]);
    });

    it('campaign state and work ledger name the same next responsibility', () => {
        const next = CAMPAIGN.split('## Next responsibility')[1]?.match(/RESP-[\w-]+/)?.[0];
        const selected = LEDGER.split('## Current selected responsibility')[1]?.match(/RESP-[\w-]+/)?.[0];
        expect(next).toBeTruthy();
        expect(selected).toBeTruthy();
        expect(selected).toBe(next);
    });
});
