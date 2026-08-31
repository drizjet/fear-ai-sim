// Constitution §11 / §260 / §416 / §541.
//
// The audit called out that the previous `orphan-reach.test.js`
// treated "known technical debt still exists" as the desired
// green state — that makes a healthy future refactor red. This
// test instead reads the QUARANTINED manifest (the *positive*
// intent) and asserts that production does not import any
// quarantined module. The manifest is the source of truth; the
// test enforces the negative invariant.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const candidatesRoot = [
    'C:/tools/03-Projects/lains Tools/lainself/fear-ai-sim/fear-ai-sim',
    '/mnt/c/tools/03-Projects/lains Tools/lainself/fear-ai-sim/fear-ai-sim',
    process.cwd(),
];
let root = candidatesRoot.find(p => {
    try { return existsSync(join(p, 'config', 'quarantined-modules.json')); } catch { return false; }
}) ?? candidatesRoot[0];

function walkReachable(entryFile, maxDepth = 6) {
    const visited = new Set();
    const queue = [entryFile];
    while (queue.length > 0) {
        const current = queue.shift();
        if (visited.has(current)) continue;
        visited.add(current);
        if (maxDepth <= 0) continue;
        const full = join(root, current);
        if (!existsSync(full)) continue;
        const src = readFileSync(full, 'utf-8');
        const matches = [...src.matchAll(/from\s+['"]\.\/([\w-]+)(?:\.js)?['"]/g)];
        for (const m of matches) {
            queue.push(m[1] + '.js');
        }
    }
    return visited;
}

function readQuarantinedModules() {
    // The manifest is a structured JSON file (PHASE 22). The
    // audit: "Eventually migrate the machine-readable quarantine
    // list from Markdown into a structured configuration such
    // as JSON/JS." Markdown is great documentation; JSON is
    // the executable source of truth.
    const manifestPath = join(root, 'config', 'quarantined-modules.json');
    const src = readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(src);
    return (manifest.modules ?? []).map(m => m.module);
}

describe('quarantined modules (Constitution §11 / §260 / §416 / §541)', () => {
    it('the QUARANTINED manifest is readable and non-empty', () => {
        const quarantined = readQuarantinedModules();
        expect(quarantined.length).toBeGreaterThan(0);
        // Each entry must be a real file in the repo.
        for (const module of quarantined) {
            const full = join(root, module);
            expect(existsSync(full)).toBe(true);
        }
    });

    it('production does NOT import any quarantined module', () => {
        // The §541 contract: "If a system has no production reach
        // or causal role: integrate/archive/delete." The
        // manifest is the *intent*; this test enforces the
        // *invariant*: production must not import anything on
        // the manifest.
        const quarantined = readQuarantinedModules();
        const liveEntryPoints = [
            'closed-world.js',
            'simulation.js',
            'brain.js',
            'agent.js',
            'learningagent.js',
        ];
        const reachable = new Set();
        for (const entry of liveEntryPoints) {
            for (const f of walkReachable(entry)) reachable.add(f);
        }
        for (const module of quarantined) {
            expect(reachable.has(module)).toBe(false);
        }
    });

    it('the live reachable set is documented for the audit trail', () => {
        // This is documentation, not a strict assertion. It
        // prints the reachable set so a future auditor can
        // confirm the production reach.
        const liveEntryPoints = [
            'closed-world.js',
            'simulation.js',
            'brain.js',
            'agent.js',
            'learningagent.js',
        ];
        const reachable = new Set();
        for (const entry of liveEntryPoints) {
            for (const f of walkReachable(entry)) reachable.add(f);
        }
        const liveReachable = [...reachable].sort();
        for (const entry of liveEntryPoints) {
            expect(liveReachable.includes(entry)).toBe(true);
        }
        console.log('Live reachable set:', liveReachable.length, 'modules');
    });
});
