import { describe, it, expect } from '@jest/globals';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(__dirname, '..', 'bin', 'fear-ai.js');

// NEXT-123: hierarchical command groups (CCI-28 frontier 7). Group
// invocations resolve onto the flat commands byte-for-byte.
describe('NEXT-123: CLI hierarchical command groups', () => {
    const run = (args) => new Promise((resolve) => {
        execFile('node', [CLI, ...args], { timeout: 60000 }, (err, stdout, stderr) => {
            resolve({ code: err ? (err.code ?? 1) : 0, stdout, stderr });
        });
    });

    it('1. Group help lists subcommands and exits zero', async () => {
        const res = await run(['npc', '--help']);
        expect(res.code).toBe(0);
        expect(res.stdout).toContain(`'npc' command group`);
        expect(res.stdout).toContain('explain');
    }, 70000);

    it('2. Unknown subcommand fails with the group listing', async () => {
        const res = await run(['npc', 'bogus-sub']);
        expect(res.code).toBe(1);
        expect(res.stdout + res.stderr).toContain('Unknown');
    }, 70000);

    it('3. Group invocation matches flat invocation byte-for-byte', async () => {
        const [grouped, flat] = await Promise.all([
            run(['npc', 'explain', '--json']),
            run(['explain', '--json'])
        ]);
        expect(grouped.code).toBe(0);
        expect(flat.code).toBe(0);
        expect(grouped.stdout).toBe(flat.stdout);
    }, 70000);

    it('4. Bench group resolves onto a bench command', async () => {
        const [grouped, flat] = await Promise.all([
            run(['bench', 'verify']),
            run(['verify'])
        ]);
        expect(grouped.code).toBe(0);
        expect(grouped.stdout).toBe(flat.stdout);
    }, 90000);

    it('5. Global help advertises the four groups', async () => {
        const res = await run(['help']);
        expect(res.code).toBe(0);
        for (const group of ['npc', 'world', 'debug', 'bench']) {
            expect(res.stdout).toContain(group);
        }
    }, 70000);
});
