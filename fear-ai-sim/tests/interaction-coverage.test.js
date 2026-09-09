/**
 * @file interaction-coverage.test.js
 *
 * Sections CCIV-CCV: interaction coverage graph mines real co-use edges,
 * is deterministic, and honestly reports debt.
 */

import { describe, it, expect } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InteractionCoverageGraph } from '../packages/core/src/InteractionCoverageGraph.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function build() {
    return new InteractionCoverageGraph(ROOT).build();
}

describe('Sections CCIV-CCV: InteractionCoverageGraph', () => {
    it('1. Mines nodes from core src with tested and composed edges', () => {
        const r = build();
        expect(r.nodeCount).toBeGreaterThan(50);
        expect(r.testedEdges.length).toBeGreaterThan(20);
        expect(r.composedEdges.length).toBeGreaterThan(0);
    });

    it('2. Known tested edge present with real evidence file', () => {
        const r = build();
        const edge = r.testedEdges.find((e) =>
            e.pair.includes('MemoryRelevanceScorer') && e.pair.includes('LayeredMemorySystem'));
        expect(edge).toBeDefined();
        expect(edge.evidence).toContain('tests/memory-relevance-pathology.test.js');
    });

    it('3. Build deterministic across repeated runs', () => {
        expect(build()).toEqual(build());
    });

    it('4. Debt pairs (if any) are genuinely untested and coherent', () => {
        const r = build();
        const testedKeys = new Set(r.testedEdges.map((e) => e.pair.join(' ')));
        for (const d of r.debt) {
            expect(testedKeys.has(d.pair.join(' '))).toBe(false);
            expect(d.composedIn).toMatch(/\.m?js$/);
        }
        expect(r.testedEdges.length + r.debt.length).toBeGreaterThan(0);
    });

    it('5. Isolated list honest: named modules exist on disk', () => {
        const r = build();
        expect(r.isolated.length).toBeGreaterThan(0);
        for (const name of r.isolated) {
            expect(r.nodes).toContain(name);
        }
        // The graph must not count itself as foreign evidence: self excluded nowhere,
        // but every edge cites a file that is not the graph module itself.
        for (const e of r.testedEdges) {
            expect(e.evidence).not.toContain('InteractionCoverageGraph');
        }
    });
});

describe('Section CLXXXIII tooling: CLI dispatch lint', () => {
    it('6. Dispatch lint passes with zero duplicate case labels', () => {
        const out = execFileSync('node', [join(ROOT, 'scripts', 'cli-dispatch-lint.mjs')], { encoding: 'utf8' });
        expect(out).toContain('CLEAN');
        expect(out).toMatch(/0 duplicates/);
    });
});
