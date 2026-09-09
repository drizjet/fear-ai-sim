/**
 * @file InteractionCoverageGraph.js — Sections CCIV-CCV: subsystem
 * interaction coverage.
 *
 * Nodes are packages/core/src modules. An edge between A and B exists when
 * one scanning root references both module base names:
 * - tested edge: a tests/ file names both (joint test coverage).
 * - composed edge: a benchmarks/ or bin/ file names both (runtime co-use
 *   without a joint test) — integration debt when no tested edge exists.
 *
 * Fully deterministic: directory scans sorted, pairs canonicalized,
 * rankings by (debt rank, name). Read-only; never executes scanned code.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

function listJs(dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter((f) => f.endsWith('.js') || f.endsWith('.mjs'))
        .map((f) => join(dir, f))
        .sort();
}
function baseNameNoExt(path) {
    return basename(path, '.js').replace(/\.mjs$/, '');
}

function referencedModules(text, moduleNames) {
    const found = new Set();
    for (const name of moduleNames) {
        if (text.includes(name)) found.add(name);
    }
    return [...found].sort();
}

function pairKey(a, b) {
    return a < b ? `${a} ${b}` : `${b} ${a}`;
}

export class InteractionCoverageGraph {
    /**
     * @param {string} repoRoot - absolute path to fear-ai-sim repo root
     */
    constructor(repoRoot) {
        this.repoRoot = repoRoot;
        this.coreDir = join(repoRoot, 'packages', 'core', 'src');
        this.moduleNames = listJs(this.coreDir)
            .map(baseNameNoExt)
            .filter((n) => n !== 'batch_evaluator_worker');
    }

    /**
     * Mine co-use edges across scanning roots.
     * @returns {{ nodes, testedEdges, composedEdges, debt, isolated }}
     */
    build() {
        const tested = new Map(); // pairKey -> sorted array of evidence files
        const composed = new Map();
        const touched = new Set();

        const shortName = (file) => file.replace(/\\/g, '/').split('/').slice(-2).join('/');
        const scan = (dir, store) => {
            for (const file of listJs(dir)) {
                let text = '';
                try {
                    text = readFileSync(file, 'utf8');
                } catch {
                    continue;
                }
                const refs = referencedModules(text, this.moduleNames);
                for (const r of refs) touched.add(r);
                for (let i = 0; i < refs.length; i++) {
                    for (let j = i + 1; j < refs.length; j++) {
                        const key = pairKey(refs[i], refs[j]);
                        if (!store.has(key)) store.set(key, []);
                        const list = store.get(key);
                        const short = shortName(file);
                        if (!list.includes(short)) list.push(short);
                    }
                }
            }
        };

        scan(join(this.repoRoot, 'tests'), tested);
        // NOTE: bin/ excluded — the CLI imports every module, which would
        // mark all pairs "composed" and drown real co-use signal in noise.
        scan(join(this.repoRoot, 'benchmarks', 'behavioral-evaluation'), composed);

        const debt = [];
        for (const [key, evidence] of [...composed.entries()].sort()) {
            if (!tested.has(key)) {
                const [a, b] = key.split(' ');
                debt.push({ pair: [a, b], composedIn: [...evidence].sort()[0] });
            }
        }
        // Rank debt by endpoint connectivity (most-connected first), then name.
        const degree = new Map();
        const bump = (key) => {
            for (const m of key.split(' ')) degree.set(m, (degree.get(m) || 0) + 1);
        };
        for (const k of tested.keys()) bump(k);
        for (const k of composed.keys()) bump(k);
        debt.sort((x, y) => {
            const dx = (degree.get(x.pair[0]) || 0) + (degree.get(x.pair[1]) || 0);
            const dy = (degree.get(y.pair[0]) || 0) + (degree.get(y.pair[1]) || 0);
            if (dy !== dx) return dy - dx;
            return x.pair.join(' ').localeCompare(y.pair.join(' '));
        });

        const isolated = this.moduleNames.filter((m) => !touched.has(m)).sort();

        return {
            nodes: this.moduleNames,
            nodeCount: this.moduleNames.length,
            testedEdges: [...tested.entries()].sort().map(([key, evidence]) => ({ pair: key.split(' '), evidence })),
            composedEdges: [...composed.entries()].sort().map(([key, evidence]) => ({ pair: key.split(' '), evidence })),
            debt,
            isolated
        };
    }
}

export default InteractionCoverageGraph;
