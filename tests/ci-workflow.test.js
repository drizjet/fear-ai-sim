import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

// CI row pin — the workflow must exist, run the full gate on push and PR, and use the
// exact package test script (ESM + --experimental-vm-modules), so local and remote gates
// cannot drift apart silently.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = path.join(ROOT, '.github', 'workflows', 'ci.yml');

describe('CI workflow', () => {
    it('declares a workflow that runs the full gate on push and pull_request', () => {
        expect(fs.existsSync(WORKFLOW)).toBe(true); // SOURCE_ABSENT mutant: file removed → fails here
        const yml = fs.readFileSync(WORKFLOW, 'utf8');
        expect(yml).toMatch(/npm ci/);
        expect(yml).toMatch(/npm test/);
        expect(yml).toMatch(/node-version/);
        expect(yml).toMatch(/push:/);
        expect(yml).toMatch(/pull_request:/);
        expect(yml).toContain('fetch-depth: 0'); // the reconciliation guard re-reads origin/master blobs — a depth-1 CI checkout would fail it
    });

    it('the workflow command is exactly the package test script', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
        expect(pkg.scripts.test).toContain('--experimental-vm-modules'); // ESM gate requirement
        const yml = fs.readFileSync(WORKFLOW, 'utf8');
        expect(yml).toContain(`run: ${'npm test'}`); // parity: the workflow runs `npm test`, not a bespoke jest invocation
    });
});
